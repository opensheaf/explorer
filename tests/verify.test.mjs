// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Http } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { verify } from '../app/verify.js';
import { diskFetch, readSchemas, osheaf, fixture, folder, ORIGIN, ALPHA, BETA, READING, idOf } from './disk.mjs';

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

const digestOf = (text) => createHash('sha512').update(text).digest('hex');

const beyondHttp = (f) => /^error: [^:]*: OCFL validator: |^error: ocfl: the OCFL validator rejects/.test(f) ||
  / an entry the storage root does not justify: /.test(f) ||
  /^warning: .*: signature-[a-z2-7]{16}\.json: unchecked: /.test(f);

async function compare(name, path, options) {
  const report = await run(path, options);
  const ours = report.findings.map((f) => `${f.level}: ${f.text}`).sort();
  const theirs = (await osheaf(name)).map((x) => `${x.severity}: ${x.place}: ${x.message}`).sort();
  assert.deepEqual(ours.filter((f) => !theirs.includes(f)), [], `${name}: found by the explorer alone`);
  assert.deepEqual(theirs.filter((f) => !beyondHttp(f) && !ours.includes(f)), [], `${name}: found by osheaf verify alone`);
  return report;
}

test('the fixture archives verify as osheaf verify says', async () => {
  const log = [];
  const report = await compare('archive', 'archive/', { digests: true, log });
  assert.deepEqual(errors(report), []);
  assert.equal(report.stats.objects, 7);
  assert.ok(report.stats.files > 20);
  const allowed = (url) => /^https:\/\/fixtures\.example\.org\/archive\/(ocfl\/|opensheaf\.json$|index\.html$|paper\/|names\/|owners\/|sha512\/)/.test(url);
  assert.deepEqual(log.filter((url) => !allowed(url)), []);
  for (const a of ['forked', 'other']) assert.deepEqual(errors(await compare(a, `${a}/`, { digests: true })), []);
});

test('the broken copies give the findings osheaf verify gives', async () => {
  const broken = ['bad-signature', 'changed-file', 'dropped-notice', 'gap', 'key-log', 'no-key-log', 'old',
                  'previous', 'stale', 'unchecked-branch', 'unsigned', 'wrong-pin'];
  for (const b of broken) {
    const report = await compare(`broken-${b}`, `broken/${b}/`, { digests: true, remote: b === 'unchecked-branch' });
    assert.ok(errors(report).length > 0, `${b} passes`);
  }
});

test('what the broken copies break', async () => {
  assert.deepEqual(errors(await run('broken/old/')), ['archive: specification 0.1: rebuild (section 16.1)']);
  assert.deepEqual(errors(await run('broken/stale/')),
    ['opensheaf.json: the entry of beta is stale: head v1 instead of v2']);
  assert.deepEqual(errors(await run('broken/changed-file/', { digests: true })),
    ['alpha: v1/content/paper.pdf does not have the digest of the manifest']);
  assert.ok(errors(await run('broken/previous/')).includes('alpha v2: previous is not the digest of the inventory of v1 (section 4.3)'));
  assert.ok(errors(await run('broken/unsigned/')).includes('main v2 member beta v2: not a version: a collection pins only signed versions (section 8.5)'));
  const noLog = await run('broken/no-key-log/');
  assert.ok(errors(noLog).includes(`alpha: the key log of its owner ${ALPHA.split(':')[2]} is not in the storage root (section 6.5)`));
  const branch = await run('broken/unchecked-branch/');
  assert.ok(branch.findings.some((f) => f.level === 'warning' && f.place === 'alpha-accepted v1' && /^unchecked branch point: /.test(f.message)));
  assert.ok(branch.findings.some((f) => f.level === 'result' && f.message.endsWith(': unchecked (section 9.3)')));
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

test('a verification is not held to the budget of a page', async () => {
  const http = new Http({ fetch: diskFetch(), budget: { requests: 1, bytes: 2 ** 20 } });
  const archive = await Archive.open(http, ORIGIN + 'archive/');
  const report = await verify(archive, { schemas });
  assert.deepEqual(errors(report), []);
  assert.ok(report.requests > 1);
});

test('an archive that disappeared', async () => {
  const report = await run('other/', { down: [ORIGIN + 'archive/'] });
  const shelf = report.findings.filter((f) => f.place.startsWith('shelf v1 member') && f.level === 'warning');
  assert.deepEqual(shelf.map((f) => f.message), ['unavailable (section 8.5)', 'unavailable (section 8.5)', 'unavailable (section 8.5)']);
  assert.ok(report.findings.some((f) => f.message === "the parent's line: unavailable"));
  assert.ok(report.findings.some((f) => f.place === 'resolution' && f.message.startsWith(`unavailable: ${ORIGIN}archive/`)));
  assert.deepEqual(errors(report), []);
});

test('an inventory copy with another head, or fewer versions', async () => {
  const url = `${folder(ALPHA)}v2/inventory.json`;
  const copy = JSON.parse(await (await diskFetch()(url)).text());
  copy.head = 'v1';
  let text = JSON.stringify(copy);
  const patch = { [url]: text, [url + '.sha512']: `${digestOf(text)}  inventory.json\n` };
  const found = errors(await run('archive/', { patch }));
  assert.ok(found.includes('alpha v2: the inventory copy has the head v1'));
  delete copy.versions.v2;
  text = JSON.stringify(copy);
  const fewer = errors(await run('archive/', { patch: { [url]: text, [url + '.sha512']: `${digestOf(text)}  inventory.json\n` } }));
  assert.ok(fewer.includes('alpha v2: the inventory copy does not record exactly the versions v1 to v2'));
});

test('digests in upper case (section 4.1)', async () => {
  const sc = `${folder(ALPHA)}v1/inventory.json.sha512`;
  const found = errors(await run('archive/', { patch: { [sc]: (text) => text.split(' ')[0].toUpperCase() + '  inventory.json\n' } }));
  assert.ok(found.includes('alpha: v1/inventory.json.sha512 states its digest not in lower case (section 4.1)'));
  const url = `${folder(ALPHA)}inventory.json`;
  const inv = JSON.parse(await (await diskFetch()(url)).text());
  inv.manifest = Object.fromEntries(Object.entries(inv.manifest).map(([k, v]) => [k.toUpperCase(), v]));
  const text = JSON.stringify(inv);
  const upper = errors(await run('archive/', { patch: { [url]: text, [url + '.sha512']: `${digestOf(text)}  inventory.json\n` } }));
  assert.ok(upper.includes('alpha: the inventory has digests not in lower case (section 4.1)'));
});

test('the layout, the home page and the profile website', async () => {
  assert.deepEqual(errors(await run('archive/', { patch: { [`${ORIGIN}archive/ocfl/ocfl_layout.json`]: '{}' } })),
    ['ocfl: ocfl_layout.json names only registered layouts: the owner-name layout has none (section 3.2)']);
  const index = { [`${ORIGIN}archive/index.html`]: '<html></html>' };
  assert.deepEqual(errors(await run('archive/', { patch: index })), [
    'index.html: does not show the pin of ' + ALPHA.split(':')[1],
    'index.html: does not show the pin of ' + BETA.split(':')[1],
    'index.html: does not show the pin of ' + idOf('gamma').split(':')[1],
  ].sort());
  const noWebsite = (text) => JSON.stringify({ ...JSON.parse(text), profiles: [] });
  const report = await run('archive/', { patch: { ...index, [`${ORIGIN}archive/opensheaf.json`]: noWebsite } });
  assert.deepEqual(errors(report), []);
  assert.equal(report.findings.filter((f) => f.place === 'index.html' && f.level === 'warning').length, 3);
});

test('an index file with a byte order mark, or bytes that are not UTF-8', async () => {
  const shard = (await fixture('archive/opensheaf.json')).owners[0].owner.slice(0, 2);
  const url = `${ORIGIN}archive/owners/${shard}.json`;
  const text = await (await diskFetch()(url)).text();
  for (const change of ['\ufeff' + text, new Uint8Array([...new TextEncoder().encode(text.slice(0, -3)), 0xff, 0x0a])]) {
    const found = errors(await run('archive/', { patch: { [url]: change } }));
    assert.ok(found.some((f) => f.startsWith(`owners/${shard}.json: not JSON: `) && /(starts with a byte order mark|is not UTF-8)/.test(f)), found.join('\n'));
  }
});

test('JSON nested too deep is a finding (section 15.2)', async () => {
  const deep = '['.repeat(20000) + ']'.repeat(20000);
  const patch = {};
  for (const p of ['', 'v1/', 'v2/', 'v3/', 'v4/']) {
    const url = `${folder(ALPHA)}${p}inventory.json`;
    const text = (await (await diskFetch()(url)).text()).replace(/"state": \{/, `"state": { "x": ${deep},`);
    Object.assign(patch, { [url]: text, [url + '.sha512']: `${digestOf(text)}  inventory.json\n` });
  }
  const found = errors(await run('archive/', { patch }));
  assert.ok(found.some((e) => e.includes('an object without a readable inventory')), found.join('\n'));
});

test('a configuration of the hashed layout that is not JSON is an error', async () => {
  const config = `${ORIGIN}other/ocfl/extensions/0003-hash-and-id-n-tuple-storage-layout/config.json`;
  const found = errors(await run('other/', { patch: { [config]: '[1' } }));
  assert.ok(found.includes('ocfl: extensions/0003-hash-and-id-n-tuple-storage-layout/config.json is not a JSON object'), found.join('\n'));
  assert.ok(!errors(await run('other/', { patch: { [config]: '{"tupleSize": 3}' } })).some((e) => e.includes('config.json')));
});

test('labels given twice, a tombstone of an object listed', async () => {
  const twice = (text) => {
    const disc = JSON.parse(text);
    disc.objects.find((o) => o.label === 'beta').label = 'alpha';
    disc.tombstones[0].id = ALPHA;
    return JSON.stringify(disc);
  };
  const found = errors(await run('archive/', { patch: { [`${ORIGIN}archive/opensheaf.json`]: twice } }));
  assert.ok(found.includes('opensheaf.json: the label alpha is given twice (section 3.1)'));
  assert.ok(found.includes(`opensheaf.json: ${ALPHA} has a tombstone, and is an object of the archive (section 13.3)`));
});

test('cancelling keeps what was found', async () => {
  const controller = new AbortController();
  const http = new Http({ fetch: diskFetch() });
  const archive = await Archive.open(http, ORIGIN + 'archive/');
  const report = await verify(archive, { schemas, signal: controller.signal,
    progress: ({ done }) => { if (done === 1) controller.abort(); } });
  assert.ok(report.cancelled);
});

test('a cancelled verification reports no file missing', async () => {
  const controller = new AbortController();
  const plain = diskFetch();
  const fetch = async (url, init) => {
    if (String(url) === `${folder(READING)}v1/inventory.json`) {
      controller.abort();
      throw new DOMException('cancelled', 'AbortError');
    }
    return plain(url, init);
  };
  const archive = await Archive.open(new Http({ fetch }), ORIGIN + 'archive/');
  const report = await verify(archive, { schemas, signal: controller.signal });
  assert.equal(report.cancelled, true);
  assert.deepEqual(errors(report), []);
});

test('an archive whose objects are in pages (section 3.1)', async () => {
  const inner = diskFetch();
  const pagedFetch = (missing) => async (url, init = {}) => {
    if (!url.startsWith(`${ORIGIN}paged/`)) return inner(url, init);
    const rest = url.slice(`${ORIGIN}paged/`.length);
    const disc = JSON.parse(await (await inner(`${ORIGIN}archive/opensheaf.json`)).text());
    const half = Math.ceil(disc.objects.length / 2);
    const pages = { 'objects/a.json': disc.objects.slice(0, half), 'objects/b.json': disc.objects.slice(half) };
    const json = (value) => {
      const bytes = new TextEncoder().encode(JSON.stringify(value));
      return new Response(init.method === 'HEAD' ? null : bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
    };
    if (rest === 'opensheaf.json') {
      const { objects, ...paged } = disc;
      return json({ ...paged, objectPages: Object.keys(pages) });
    }
    if (Object.hasOwn(pages, rest)) {
      return rest === missing ? new Response('not found', { status: 404 })
        : json({ format: 'opensheaf-objects/0.2', objects: pages[rest] });
    }
    return inner(`${ORIGIN}archive/${rest}`, init);
  };
  const open = (missing) => Archive.open(new Http({ fetch: pagedFetch(missing) }), ORIGIN + 'paged/');
  const plain = await Archive.open(new Http({ fetch: diskFetch() }), ORIGIN + 'archive/');
  const paged = await open();
  assert.deepEqual(paged.objects().map((o) => o.id), plain.objects().map((o) => o.id));
  assert.deepEqual(errors(await verify(paged, { schemas })), []);
  const broken = await open('objects/b.json');
  assert.ok(errors(await verify(broken, { schemas })).some((t) => t.includes('the page of objects objects/b.json is missing (section 3.1)')));
});
