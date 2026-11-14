// Generated from literate/70-tests.md by tools/tangle.py: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Http, LIMITS } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { summary } from '../app/summary.js';
import { diskFetch, ORIGIN } from './disk.mjs';

function slowFetch(ms, { log = [] } = {}) {
  const disk = diskFetch({ log });
  return (url, init = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => disk(url, init).then(resolve, reject), ms);
    init.signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('aborted', 'AbortError'));
    });
  });
}

function serve(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler).listen(0, '127.0.0.1', () => {
      resolve({ url: `http://127.0.0.1:${server.address().port}/`,
                close: () => { server.closeAllConnections(); server.close(); } });
    });
  });
}

test('a kept request outlives the caller that started it', async () => {
  const log = [];
  const http = new Http({ fetch: slowFetch(30, { log }) });
  const url = ORIGIN + 'archive/opensheaf.json';
  const first = new AbortController(), second = new AbortController();
  const a = http.cached(url, { signal: first.signal });
  const b = http.cached(url, { signal: second.signal });
  first.abort();
  await assert.rejects(a, { kind: 'aborted' });
  assert.ok((await b).length > 0);
  assert.equal(log.length, 1);
});

test('a request whose callers have all left is not handed to the next', async () => {
  const http = new Http({ fetch: slowFetch(30) });
  const url = ORIGIN + 'archive/opensheaf.json';
  const old = new AbortController();
  const a = http.cached(url, { signal: old.signal });
  await new Promise((resolve) => setTimeout(resolve, 10));
  old.abort();
  const b = http.cached(url, { signal: new AbortController().signal });
  await assert.rejects(a, { kind: 'aborted' });
  assert.ok((await b).length > 0);
});

test('a summary loading for a page left is not handed to the next page', async () => {
  const http = new Http({ fetch: slowFetch(20) });
  const ctx = { archive: await Archive.open(http, ORIGIN + 'archive/'), summaries: new Map() };
  const page1 = new AbortController();
  ctx.signal = page1.signal;
  const a = summary(ctx, 'alpha');
  await new Promise((resolve) => setTimeout(resolve, 10));
  page1.abort();
  ctx.signal = new AbortController().signal;
  const s = await summary(ctx, 'alpha');
  assert.equal(s.id, 'alpha');
  await assert.rejects(a, { kind: 'aborted' });
  assert.equal(await summary(ctx, 'alpha'), s);
});

test('the answers kept are bounded', async () => {
  const http = new Http({ fetch: diskFetch(), cacheLimit: 10_000 });   // the inventories are 4 to 10 kB
  const url = (id) => `${ORIGIN}archive/ocfl/${id}/inventory.json`;
  for (const id of ['alpha', 'beta', 'gamma']) await http.cached(url(id));
  assert.ok(http.cacheBytes <= 10_000);
  assert.ok(!http.cache.has(url('alpha')));
  assert.ok(http.cache.has(url('beta')) && http.cache.has(url('gamma')));
});

test('a slow, steady body is read; a stalled one times out', async () => {
  const server = await serve((req, res) => {
    res.writeHead(200, { 'content-length': String(20 * 1024) });
    let n = 0;
    const timer = setInterval(() => {
      if (req.url === '/stall' && n === 2) return clearInterval(timer);
      res.write(Buffer.alloc(1024));
      if (++n === 20) {
        clearInterval(timer);
        res.end();
      }
    }, 40);
    res.on('close', () => clearInterval(timer));
  });
  try {
    const http = new Http({ timeout: 300, stall: 300 });
    const bytes = await http.request(server.url + 'steady', { limit: LIMITS.file });
    assert.equal(bytes.length, 20 * 1024);
    await assert.rejects(http.request(server.url + 'stall', { limit: LIMITS.file }),
      { kind: 'timeout', detail: /stalled/ });
  } finally {
    server.close();
  }
});

test('a pause before trying again holds no place, and is cancelled at once', async () => {
  const fetch = async (url) => new Response(url.endsWith('busy') ? 'busy' : 'ok', { status: url.endsWith('busy') ? 503 : 200 });
  const http = new Http({ fetch, concurrency: 1 });
  const controller = new AbortController();
  const busy = http.request('http://example.org/busy', { signal: controller.signal });
  await new Promise((resolve) => setTimeout(resolve, 20));
  const started = Date.now();
  assert.equal(new TextDecoder().decode(await http.request('http://example.org/ok')), 'ok');
  controller.abort();
  await assert.rejects(busy, { kind: 'aborted' });
  assert.ok(Date.now() - started < 500);
});

test('bodies are read whole, and large ones one at a time', async () => {
  const declared = new Http({ fetch: async () => new Response(new Uint8Array(10), { headers: { 'content-length': '3' } }) });
  assert.equal((await declared.request('http://example.org/x')).length, 10);
  const saved = LIMITS.large;
  LIMITS.large = 1000;
  let late = 0, most = 0;
  const fetch = async () => {
    let k = 0, counted = false;
    const body = new ReadableStream({
      async pull(controller) {
        await new Promise((resolve) => setTimeout(resolve, 10));
        if (k === 4) {
          if (counted) late--;
          return controller.close();
        }
        if (k >= 2 && !counted) {
          counted = true;
          most = Math.max(most, ++late);
        }
        k++;
        controller.enqueue(new Uint8Array(600));
      },
    }, { highWaterMark: 0 });
    return new Response(body);
  };
  try {
    const http = new Http({ fetch });
    const sizes = await Promise.all([1, 2, 3].map((n) => http.request(`http://example.org/${n}`, { limit: LIMITS.file })));
    assert.deepEqual(sizes.map((b) => b.length), [2400, 2400, 2400]);
    assert.equal(most, 1);
  } finally {
    LIMITS.large = saved;
  }
});
