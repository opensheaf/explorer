// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Http, LIMITS, parseJson, parseIntegers, numberTokens, explain } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { summary } from '../app/summary.js';
import { diskFetch, ORIGIN, ALPHA, BETA, GAMMA, folder } from './disk.mjs';

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
  const a = summary(ctx, ALPHA);
  await new Promise((resolve) => setTimeout(resolve, 10));
  page1.abort();
  ctx.signal = new AbortController().signal;
  const s = await summary(ctx, ALPHA);
  assert.equal(s.id, ALPHA);
  await assert.rejects(a, { kind: 'aborted' });
  assert.equal(await summary(ctx, ALPHA), s);
});

test('the summaries kept are bounded, and those loading are kept', async () => {
  const http = new Http({ fetch: slowFetch(5) });
  const ctx = { archive: await Archive.open(http, ORIGIN + 'archive/'), summaries: new Map(),
                signal: new AbortController().signal, summaryLimit: 1 };
  await summary(ctx, ALPHA);
  const beta = summary(ctx, BETA);
  const gamma = summary(ctx, GAMMA);
  assert.deepEqual([...ctx.summaries.keys()], [BETA, GAMMA]);
  await Promise.all([beta, gamma]);
  await summary(ctx, BETA);
  await summary(ctx, ALPHA);
  assert.deepEqual([...ctx.summaries.keys()], [ALPHA]);
});

test('the answers kept are bounded', async () => {
  const http = new Http({ fetch: diskFetch(), cacheLimit: 12_000 });   // the inventories are 5 to 11 kB
  const url = (id) => `${folder(id)}inventory.json`;
  for (const id of [ALPHA, BETA, GAMMA]) await http.cached(url(id));
  assert.ok(http.cacheBytes <= 12_000);
  assert.ok(!http.cache.has(url(ALPHA)));
  assert.ok(http.cache.has(url(BETA)) && http.cache.has(url(GAMMA)));
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

test('a body interrupted is not a cross-origin refusal', async () => {
  const fetch = async (url, init = {}) => {
    if (init.mode === 'no-cors') return new Response(null, { status: 200 });
    let k = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (k++ === 0) controller.enqueue(new Uint8Array(10));
        else controller.error(new TypeError('terminated'));
      },
    });
    return new Response(body);
  };
  globalThis.document = {};
  try {
    await assert.rejects(new Http({ fetch }).request('http://example.org/x'),
      { kind: 'network', detail: /interrupted/ });
  } finally {
    delete globalThis.document;
  }
  assert.match(explain({ kind: 'cors' }), /missing/);
});

test('an HTML page, a 403, and a busy server', async () => {
  const page = new TextEncoder().encode('\ufeff\n  <!DOCTYPE html><html></html>');
  assert.throws(() => parseJson(page), { kind: 'html', detail: /HTML page/ });
  const html = new Http({ fetch: async () => new Response('<html>Welcome</html>') });
  await assert.rejects(html.json('http://example.org/opensheaf.json'), { kind: 'html' });
  const forbidden = new Http({ fetch: async () => new Response('', { status: 403 }) });
  await assert.rejects(forbidden.request('http://example.org/x'), { kind: 'forbidden', status: 403 });
  assert.match(explain({ kind: 'forbidden' }), /public read/);
  let tries = 0;
  const past = new Date(Date.now() - 60_000).toUTCString();
  const busy = new Http({ fetch: async () => {
    tries++;
    return new Response('busy', { status: 503, headers: { 'retry-after': tries === 1 ? '0' : past } });
  } });
  const started = Date.now();
  await assert.rejects(busy.request('http://example.org/x'), { kind: 'busy', status: 503 });
  assert.equal(tries, 3);
  assert.ok(Date.now() - started < 500);
  assert.match(explain({ kind: 'busy' }), /try/i);
});

test('JSON nested too deeply', () => {
  const nested = (n) => new TextEncoder().encode('['.repeat(n) + '"\\\\\\"]]"' + ']'.repeat(n));
  assert.deepEqual(parseJson(nested(1)), ['\\"]]']);
  assert.equal(parseJson(nested(LIMITS.nesting)).length, 1);
  assert.throws(() => parseJson(nested(LIMITS.nesting + 1)), { kind: 'too-large', detail: /nested/ });
  assert.throws(() => parseJson(nested(100_000)), { kind: 'too-large' });
});

test('JSON whose numbers are all exact integers', () => {
  const ways = [{ source: false }, ...(JSON.parse('1', (k, v, c) => c?.source === '1') ? [{ source: true }] : [])];
  for (const way of ways) {
    for (const text of ['{"t":1.0}', '{"t":1e0}', '[1E2]', '{"t":-1.5}', '{"t":9007199254740993}', '[-9007199254740993]', '[9007199254740992]', '[-9007199254740992]', '[0.0]']) {
      assert.throws(() => parseIntegers(text, way), /is not an integer|no exact form/, `${text} ${way.source}`);
    }
    for (const [text, value] of [['{"t":1}', { t: 1 }], ['[-0, 0, 9007199254740991, -9007199254740991]', [-0, 0, 2 ** 53 - 1, -(2 ** 53 - 1)]],
                                 ['{"s":"1.0e5 \\" 2.5","n":[3]}', { s: '1.0e5 " 2.5', n: [3] }]]) {
      assert.deepEqual(parseIntegers(text, way), value, `${text} ${way.source}`);
    }
    assert.throws(() => parseIntegers('{"t":01}', way), SyntaxError);
  }
  assert.deepEqual(numberTokens('{"a\\"1.5":[-2,3e1],"b":"7"}'), ['-2', '3e1']);
  assert.throws(() => parseJson(new TextEncoder().encode('{"threshold":1.0}'), '', { integers: true }), { kind: 'json', detail: /1\.0 is not an integer/ });
  assert.deepEqual(parseJson(new TextEncoder().encode('{"threshold":1.0}')), { threshold: 1 });
});

test('a declared size does not allocate memory before the bytes arrive', async () => {
  const declared = 400 * 2 ** 20;
  const fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': String(declared) }),
                               body: new Response(new Uint8Array(10)).body });
  const http = new Http({ fetch, budget: null });
  const Original = globalThis.Uint8Array;
  let most = 0;
  globalThis.Uint8Array = class extends Original {
    constructor(...args) {
      super(...args);
      if (typeof args[0] === 'number') most = Math.max(most, args[0]);
    }
  };
  let bytes;
  try {
    bytes = await http.request('http://example.org/x', { limit: LIMITS.file });
  } finally {
    globalThis.Uint8Array = Original;
  }
  assert.equal(bytes.length, 10);
  assert.ok(most <= 65536, `a buffer of ${most} bytes`);
});

test('the budget of a page', async () => {
  const fetch = async () => new Response(new Uint8Array(10));
  const http = new Http({ fetch, budget: { requests: 3, bytes: 25 } });
  await http.request('http://example.org/1');
  await http.request('http://example.org/2');
  await assert.rejects(http.request('http://example.org/3'), { kind: 'budget' });
  http.newPage();
  await http.request('http://example.org/4');
  await http.another().request('http://example.org/5');
  await assert.rejects(http.request('http://example.org/6'), { kind: 'budget', detail: /bytes/ });
  const few = new Http({ fetch, budget: { requests: 2, bytes: 1000 } });
  await few.request('http://example.org/1');
  await few.request('http://example.org/2');
  await assert.rejects(few.request('http://example.org/3'), { kind: 'budget', detail: /2 requests/ });
  const free = http.another({ budget: null });
  for (let k = 0; k < 5; k++) await free.request(`http://example.org/free/${k}`);
  assert.match(explain({ kind: 'budget' }), /one page/);
});
