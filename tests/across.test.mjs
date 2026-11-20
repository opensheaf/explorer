// Generated from literate/72-tests-across.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Http } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { Resolver, Copy } from '../app/resolve.js';
import { verdict, levelOfVersion, level, CONFIRMED, UNCHECKED, INCONSISTENT } from '../app/branches.js';
import { historyOf } from '../app/versions.js';
import { diskFetch, ORIGIN, ALPHA, BETA, GAMMA, READING, idOf, DISCOVERY } from './disk.mjs';

const open = (path, options = {}) => Archive.open(new Http({ fetch: diskFetch(options) }), ORIGIN + path);
const at = (archive) => `${ORIGIN}${archive}/`;
const parts = (id) => id.split(':').slice(1);
const pinOf = (archive, label) => DISCOVERY[archive].objects.find((o) => o.label === label);

test('the statuses of the versions of the fixtures (section 7.3)', async () => {
  const archive = await open('archive/');
  for (const id of [ALPHA, BETA, GAMMA, READING]) {
    const line = await archive.line(id);
    assert.ok(line.statuses.every((s) => s === 'signed'), id);
    assert.equal(line.latest, line.inv.head);
  }
  const other = await open('other/');
  assert.deepEqual((await other.line(idOf('exposed', 'other'))).statuses, ['contested']);
  assert.deepEqual((await other.line(idOf('main', 'other'))).statuses, ['contested', 'contested']);
  const vouched = await other.line(idOf('vouched', 'other'));
  assert.deepEqual(vouched.statuses, ['vouched for', 'signed']);
  assert.equal(vouched.latest, 'v2');
  assert.equal((await other.line(idOf('exposed', 'other'))).latest, null);
  const forked = await open('forked/');
  assert.deepEqual((await forked.line(idOf('before', 'forked'))).statuses, ['signed']);
  assert.deepEqual((await forked.line(idOf('after', 'forked'))).statuses, ['contested']);
});

test('lines of the broken copies', async () => {
  const noLog = await open('broken/no-key-log/');
  const line = await noLog.line(ALPHA);
  assert.ok(line.unnamed && line.statuses.every((s) => s === 'unchecked') && line.latest === null);
  assert.deepEqual((await (await open('broken/unsigned/')).line(BETA)).statuses, ['signed', 'unsigned']);
  const bad = await (await open('broken/bad-signature/')).line(ALPHA);
  assert.deepEqual(bad.statuses, ['signed', 'signed', 'signed', 'invalid']);
  assert.equal(bad.latest, 'v3');
  assert.match(bad.judgements[3][0].reason, /does not verify/);
});

test('sheaf: URIs resolved across archives (section 12.3)', async () => {
  const home = await open('other/');
  const r = new Resolver(home.http, home);
  const [name, owner] = parts(ALPHA);
  const hint = `?at=${encodeURIComponent(at('archive'))}`;
  let { id, found } = await r.resolve(`sheaf:${name}${hint}`);
  assert.equal(id, ALPHA);
  assert.deepEqual([found.status, found.version, found.copy.where], ['verified', 'v4', at('archive')]);
  const objOf = (v) => found.copy.line.objs.get(v);
  const v2 = historyOf(found.copy.line.inv, objOf, 'v4').find((h) => objOf(h).documentVersion === 2);
  assert.equal(v2, 'v3');
  ({ found } = await r.resolve(`sheaf:${name}/v2${hint}`));
  assert.deepEqual([found.status, found.version], ['verified', 'v3']);
  const digest = found.digest;
  ({ found } = await r.resolve(`sheaf:${name}/v2?sha512=${digest}&at=${encodeURIComponent(at('archive'))}`));
  assert.deepEqual([found.status, found.version], ['verified', 'v3']);
  ({ found } = await r.resolve(`sheaf:${name}/v2?sha512=${'0'.repeat(128)}&at=${encodeURIComponent(at('archive'))}`));
  assert.equal(found.status, 'mismatch');
  ({ found } = await r.resolve(`sheaf:${name.slice(0, 10)}:${owner.slice(0, 10)}/v3${hint}`, [], {}));
  assert.equal(found.version, 'v4');
  ({ id, found } = await r.resolve(`sheaf:${owner}${hint}`));
  assert.deepEqual([id, found.status, found.version], [`sheaf:${owner}:${owner}`, 'verified', 'v1']);
  const nowhere = new Resolver(new Http({ fetch: diskFetch() }));
  assert.equal((await nowhere.resolve(`sheaf:${name}:${owner}?at=${encodeURIComponent(at('nowhere'))}`)).found.status, 'unavailable');
  assert.ok(nowhere.notes.some((n) => n.message.startsWith(`unavailable: ${at('nowhere')}`)));
  const fromArchive = new Resolver(home.http, await open('archive/'));
  const [vn, vo] = parts(idOf('vouched', 'other'));
  ({ found } = await fromArchive.resolve(`sheaf:${vn}:${vo}?at=${encodeURIComponent(at('other'))}`));
  assert.deepEqual([found.status, found.version, found.copy.where], ['verified', 'v2', at('other')]);
  await assert.rejects(r.resolve(`sheaf:${name}:*`), /searched for/);
});

test('an ambiguous short form is not chosen', async () => {
  const r = new Resolver(new Http({ fetch: diskFetch() }), await open('archive/'));
  const owner = parts(ALPHA)[1];
  const names = DISCOVERY.archive.objects.filter((o) => o.kind !== 'owner').map((o) => o.name);
  const prefix = names.map((n) => n.slice(0, 8)).find((p, k, all) => all.indexOf(p) !== k);
  if (prefix) {
    await assert.rejects(r.resolve(`sheaf:${prefix}:${owner.slice(0, 8)}`), /ambiguous/);
  }
  await assert.rejects(r.resolve(`sheaf:aaaaaaaa:${owner.slice(0, 8)}`), /no line of that name/);
});

test('copies that agree, and a fork of a line (section 7.4)', async () => {
  const archive = await open('archive/');
  const line = await archive.line(ALPHA);
  const shorter = { ...line, versions: line.versions.slice(0, 2), statuses: line.statuses.slice(0, 2), latest: 'v2' };
  const forked = { ...line, versions: line.versions.map((v, k) => (k === 3 ? { ...v, digest: 'x' } : v)) };
  const a = new Copy('a', archive, line), b = new Copy('b', archive, shorter), c = new Copy('c', archive, forked);
  assert.ok(a.agrees(b) && b.agrees(a));
  assert.ok(!a.agrees(c));
  const r = new Resolver(archive.http, archive);
  r.copies = async () => [a, c];
  const found = await r.latest(...parts(ALPHA));
  assert.equal(found.status, 'fork');
  assert.ok(r.notes.some((n) => n.message.startsWith(`a fork of the line ${ALPHA}`)));
});

test('the statuses of pins (section 8.5)', async () => {
  const home = await open('other/');
  const r = new Resolver(home.http, home);
  const alpha = pinOf('archive', 'alpha');
  assert.equal((await r.pin(alpha.name, alpha.owner, alpha.head, alpha.inventorySha512, [at('archive')])).status, 'verified');
  const exposed = pinOf('other', 'exposed');
  assert.equal((await r.pin(exposed.name, exposed.owner, 'v1', exposed.inventorySha512, [])).status, 'contested');
  assert.equal((await r.pin(alpha.name, alpha.owner, 'v1', '0'.repeat(128), [at('archive')])).status, 'mismatch');
  const delta = DISCOVERY.archive.tombstones[0];
  assert.equal((await r.pin(delta.name, delta.owner, delta.lastVersion, delta.inventorySha512, [at('archive')])).status, 'removed');
  const beta = pinOf('archive', 'beta');
  const fresh = () => new Resolver(new Http({ fetch: diskFetch() }));
  assert.equal((await fresh().pin(beta.name, beta.owner, 'v2', beta.inventorySha512, [at('broken/unsigned')])).status, 'not a version');
  assert.equal((await fresh().pin(beta.name, beta.owner, 'v2', beta.inventorySha512, [at('broken/no-key-log')])).status, 'unchecked');
  assert.equal((await r.pin(beta.name, beta.owner, 'v2', beta.inventorySha512, [at('broken/unsigned')])).status, 'verified');
  assert.equal((await fresh().pin(beta.name, beta.owner, 'v2', beta.inventorySha512, [at('nowhere')])).status, 'unavailable');
});

test('an owner ended by a fork, met by a resolver (sections 6.3 and 12.3)', async () => {
  const r = new Resolver(new Http({ fetch: diskFetch() }));
  const after = pinOf('forked', 'after'), before = pinOf('forked', 'before');
  assert.equal((await r.pin(after.name, after.owner, 'v1', after.inventorySha512, [at('forked')])).status, 'contested');
  assert.equal((await r.pin(before.name, before.owner, 'v1', before.inventorySha512, [at('forked')])).status, 'verified');
  assert.deepEqual(r.ownerNotes(after.owner), [`owner ${after.owner} ended by a fork of its key log at v2`]);
});

test('the verdicts of a branch point (section 9.3)', async () => {
  const other = await open('other/');
  const id = idOf('alpha-accepted', 'other');
  const inv = await other.inventory(id);
  const obj = await other.json(id, inv, 'v1', 'object.json');
  const genesis = await other.bytes(id, inv, 'v1', 'genesis.json');
  const lv = levelOfVersion(other, id, inv, 'v1');
  const logs = (owner) => other.keyLog(owner);
  assert.deepEqual(await verdict(lv, obj, genesis, logs), [CONFIRMED, []]);
  assert.equal(obj.parent.owner, parts(ALPHA)[1]);
  const [unchecked, why] = await verdict(lv, obj, genesis, async () => null);
  assert.equal(unchecked, UNCHECKED);
  assert.deepEqual(why, ['the parent version is unchecked (section 9.3)']);
  const unsigned = level(new Map([...lv.digests].filter(([p]) => !p.startsWith('parent.signatures/'))), lv.read);
  const [v1, problems] = await verdict(unsigned, obj, genesis, logs);
  assert.equal(v1, INCONSISTENT);
  assert.ok(problems.some((p) => p.includes('not a version: unsigned')));
  const pdf = [...lv.digests.keys()].find((p) => p.endsWith('.pdf'));
  const changed = level(new Map([...lv.digests].map(([p, d]) => [p, p === pdf ? '0'.repeat(128) : d])), lv.read);
  const [v2, more] = await verdict(changed, obj, genesis, logs);
  assert.equal(v2, INCONSISTENT);
  assert.ok(more.some((p) => p.startsWith(`${pdf}: a file of the parent version is missing, or differs`)));
  const own = { ...obj, owner: obj.parent.owner };
  assert.ok((await verdict(lv, own, genesis, logs))[1].some((p) => p.includes("neither the parent's owner nor the originator")));
});
