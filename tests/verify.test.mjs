// Generated from literate/70-tests.md by tools/tangle.py: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Http } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { verify } from '../app/verify.js';
import { diskFetch, readSchemas, ORIGIN } from './disk.mjs';

const schemas = await readSchemas();

async function run(path, { digests = false, remote = true, log = [], down = [] } = {}) {
  const http = new Http({ fetch: diskFetch({ log, down }) });
  const archive = await Archive.open(http, ORIGIN + path);
  return verify(archive, { schemas, digests, remote });
}

const errors = (report) => report.findings.filter((f) => f.level === 'error').map((f) => f.text).sort();

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
    'ocfl/collection-main: v2 member alpha v4: unavailable',
    'ocfl/collection-main: v2 member gamma v1: unavailable',
    'ocfl/collection-main: v2 member reading v1: unavailable',
  ]);
  assert.ok(report.findings.some((f) => f.level === 'info' && /source of the accepted copy is unavailable/.test(f.message)));
});

test('cancelling keeps what was found', async () => {
  const controller = new AbortController();
  const http = new Http({ fetch: diskFetch() });
  const archive = await Archive.open(http, ORIGIN + 'archive/');
  const report = await verify(archive, { schemas, signal: controller.signal,
    progress: ({ done }) => { if (done === 1) controller.abort(); } });
  assert.ok(report.cancelled);
});
