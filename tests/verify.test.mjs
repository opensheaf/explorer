// Generated from literate/70-tests.md by tools/tangle.py: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Http } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { verify } from '../app/verify.js';
import { Resolver } from '../app/resolve.js';
import { diskFetch, readSchemas, ORIGIN } from './disk.mjs';

const schemas = await readSchemas();

async function run(path, { digests = false, remote = true, log = [], down = [], patch = {} } = {}) {
  const http = new Http({ fetch: patched(diskFetch({ log, down }), patch) });
  const archive = await Archive.open(http, ORIGIN + path);
  return verify(archive, { schemas, digests, remote });
}

const errors = (report) => report.findings.filter((f) => f.level === 'error').map((f) => f.text).sort();

function patched(fetch, patch) {
  return async (url, init = {}) => {
    if (!Object.hasOwn(patch, url)) return fetch(url, init);
    const change = patch[url];
    if (change === null) return new Response('not found', { status: 404 });
    const text = typeof change === 'function' ? change(await (await fetch(url, init)).text()) : change;
    return new Response(init.method === 'HEAD' ? null : text, { status: 200 });
  };
}

const inventoryOf = async (path) => JSON.parse(await readFile(new URL(`./fixtures/${path}`, import.meta.url), 'utf-8'));
const digestOf = (text) => createHash('sha512').update(text).digest('hex');

test('the fixture archives verify', async () => {
  const log = [];
  const report = await run('archive/', { digests: true, log });
  assert.deepEqual(errors(report), []);
  assert.equal(report.stats.objects, 5);
  assert.ok(report.stats.files > 20);
  const allowed = (url) => url.startsWith(ORIGIN + 'archive/ocfl/') || url === ORIGIN + 'archive/opensheaf.json' ||
    url === ORIGIN + 'archive/index.html';
  assert.deepEqual(log.filter((url) => !allowed(url)), []);
  assert.deepEqual(errors(await run('other/', { digests: true })), []);
});

test('the broken copies give the problems osheaf verify gives', async () => {
  assert.deepEqual(errors(await run('broken/changed-file/', { digests: true })),
    ['ocfl/alpha: digest mismatch for v1/content/paper.pdf']);
  assert.deepEqual(errors(await run('broken/changed-file/')), []);
  assert.deepEqual(errors(await run('broken/wrong-pin/')), ['ocfl/reading: v1 member alpha v1: mismatch']);
  assert.deepEqual(errors(await run('broken/gap/')), [
    'ocfl/alpha: v2 document version 3 breaks the numbering (expected 2)',
    'ocfl/alpha: v3 document version 2 breaks the numbering (expected 4)',
    'ocfl/alpha: v4 has other files than document version 3',
    'ocfl/collection-main: v2 member alpha v4: mismatch',
    'ocfl/reading: v1 member alpha v3: mismatch',
  ]);
  assert.deepEqual(errors(await run('broken/dropped-notice/')), [
    'ocfl/alpha: v4 drops or changes an earlier notice',
    'ocfl/collection-main: v2 member alpha v4: mismatch',
  ]);
  assert.deepEqual(errors(await run('broken/stale/')), ['opensheaf.json: stale entry for beta']);
});

test('an archive that disappeared', async () => {
  const report = await run('other/', { down: [ORIGIN + 'archive/'] });
  assert.deepEqual(errors(report).map((e) => e.replace(/: unavailable: .*/, ': unavailable')), [
    `collection-main: member alpha v4: ${ORIGIN}archive/: unavailable`,
    `collection-main: member gamma v1: ${ORIGIN}archive/: unavailable`,
    `collection-main: member reading v1: ${ORIGIN}archive/: unavailable`,
  ]);
  assert.ok(report.findings.some((f) => f.level === 'info' && /source of the accepted copy is unavailable/.test(f.message)));
});

test('a verification reads the archive afresh, and counts its own requests', async () => {
  const log = [];
  const http = new Http({ fetch: diskFetch({ log }) });
  const archive = await Archive.open(http, ORIGIN + 'archive/');
  const before = log.length;
  const first = await verify(archive, { schemas });
  const between = log.length;
  const second = await verify(archive, { schemas });
  assert.equal(first.requests, between - before);
  assert.equal(second.requests, log.length - between);
  assert.equal(first.requests, second.requests);
  assert.ok(first.bytesRead > 0);
});

test('an inventory copy with another head, or fewer versions', async () => {
  const url = `${ORIGIN}archive/ocfl/alpha/v2/inventory.json`;
  const copy = await inventoryOf('archive/ocfl/alpha/v2/inventory.json');
  copy.head = 'v1';
  let text = JSON.stringify(copy);
  assert.deepEqual(errors(await run('archive/', { patch: { [url]: text, [url + '.sha512']: digestOf(text) } })),
    ['ocfl/alpha: v2 the inventory copy has the head v1']);
  delete copy.versions.v2;
  text = JSON.stringify(copy);
  assert.deepEqual(errors(await run('archive/', { patch: { [url]: text, [url + '.sha512']: digestOf(text) } })), [
    'ocfl/alpha: v2 the inventory copy does not record exactly the versions v1 to v2',
    'ocfl/alpha: v2 the inventory copy has the head v1',
  ]);
});

test('a mirror whose head cannot be read', async () => {
  const report = await run('other/', { remote: false, patch: { [`${ORIGIN}other/ocfl/beta/v2/content/object.json`]: null } });
  assert.deepEqual(errors(report), ['ocfl/beta: v2 cannot read object.json: HTTP 404']);
});

test('the index page and the profile website; the storage root', async () => {
  const index = { [`${ORIGIN}archive/index.html`]: '<html></html>' };
  assert.deepEqual(errors(await run('archive/', { patch: index })), [
    'index.html does not show the pin of alpha',
    'index.html does not show the pin of beta',
    'index.html does not show the pin of gamma',
  ]);
  const noWebsite = (text) => JSON.stringify({ ...JSON.parse(text), profiles: [] });
  const report = await run('archive/', { patch: { ...index, [`${ORIGIN}archive/opensheaf.json`]: noWebsite } });
  assert.deepEqual(errors(report), []);
  assert.equal(report.findings.filter((f) => f.where === 'index.html' && f.level === 'info').length, 3);
  const layout = (text) => JSON.stringify({ ...JSON.parse(text), storageLayout: 'another' });
  assert.deepEqual(errors(await run('archive/', { patch: {
    [`${ORIGIN}archive/opensheaf.json`]: layout, [`${ORIGIN}archive/ocfl/0=ocfl_1.1`]: null } })).filter((e) => /storage root/.test(e)),
    ['opensheaf.json: storage root missing or with another layout']);
});

test('at most five mirrors are tried for a pin', async () => {
  const log = [];
  const http = new Http({ fetch: diskFetch({ log }) });
  const mirrors = Array.from({ length: 20 }, (_, k) => `https://mirror${k}.example.org/`);
  const m = { archive: 'tag:example.org,2026:gone', archiveUrl: 'https://gone.example.org/', id: 'alpha', mirrors };
  const result = await new Resolver(http).confirm(m, 'v1', '0'.repeat(128));
  assert.equal(result.status, 'unavailable');
  assert.equal(log.length, 6);
  assert.match(result.problems[result.problems.length - 1], /15 more mirror\(s\) not tried/);
});

test('cancelling keeps what was found', async () => {
  const controller = new AbortController();
  const http = new Http({ fetch: diskFetch() });
  const archive = await Archive.open(http, ORIGIN + 'archive/');
  const report = await verify(archive, { schemas, signal: controller.signal,
    progress: ({ done }) => { if (done === 1) controller.abort(); } });
  assert.ok(report.cancelled);
});
