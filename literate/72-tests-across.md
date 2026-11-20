The tests across archives
=========================

Resolution (chapter [15](15-resolve.md)) and branches (chapter
[09](09-branches.md)) are tested on the three fixture archives, which
refer to each other: `other/` keeps a catalogue of lines of the three,
an accepted copy of a version of `archive/`, and a mirror of another; and
on the broken copies. The tests check the statuses of versions on the
lines whose signatures the reference implementation made contested or
vouched for; `sheaf:` URIs resolved to the latest signed version, a
document version, a pin, a key log, from a short form, and across the
two layouts; the statuses of pins of section 8.5, each of the seven met;
copies that agree, and a fork of a line; and the verdicts of branch
points, confirmed, unchecked and inconsistent.

    // in tests/across.test.mjs:
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

    <<tests of statuses on the fixtures>>

    <<tests of resolution>>

    <<tests of the statuses of pins>>

    <<tests of branch points>>

Statuses on the fixtures
------------------------

The statuses of section 7.3 as the fixtures hold them: every version of
`archive/`'s lines is signed; in `other/`, `exposed` was signed only with
the key exposed afterwards, and is contested, as are both versions of the
main catalogue, which pins it; the first version of `vouched` lost its
signature file and is vouched for by the second, signed with the new key;
in `forked/`, `before` is signed against the first version of the key
log, and `after` against the second, from the fork point on, and is
contested. A contested version is never the latest signed version.

    // in tests of statuses on the fixtures:
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

A line whose key log is not in the archive cannot have its signature
files named: its versions are unchecked; one whose signature files are
gone is not a version, unsigned; one whose signature does not verify,
invalid. The `previous` chain is checked by the verification
([its tests](70-tests.md)).

    // in tests of statuses on the fixtures:
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

Resolution
----------

The line `alpha` resolved from `other/`, with the `at` of its URI: the
latest signed version, `v4`, found in `archive/`; document version 2,
which the history of `v4` gives as `v3` (a notice was added to it); a pin
of `v3` with its digest; a pin with a wrong digest, a mismatch; a short
form; the key log of the owner. The same from a resolver with no home
and a wrong `at`: unavailable. And `vouched`, in the hashed layout of
`other/`, from a resolver whose home is `archive/`.

    // in tests of resolution:
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

A short form that matches several lines is ambiguous, and the resolver
lists them rather than choosing (section 12.2): the lines of `archive/`
whose names start with the same letter, if any, or else all its lines,
named by their owner part alone.

    // in tests of resolution:
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

Copies agree when they hold the same inventory at the earlier of their
latest signed versions (section 7.4), which fixes every version before
it; two signed copies that do not are a fork of the line, which the
resolver reports, choosing neither. The copies are made from the line of
`alpha` as read, one stopping earlier, one with the digest of its last
version changed.

    // in tests of resolution:
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

The statuses of pins
--------------------

Each status of section 8.5, from `other/`'s resolver: the pin of
`alpha` that `shelf` holds, verified in `archive/`; the pin of `exposed`
that `other/`'s main catalogue holds, contested; a pin with another
digest, a mismatch; the line `delta`, taken down in `archive/`, removed;
a version of `beta` without its signature files (in a broken copy), not
a version, for a resolver that knows no other copy, and verified for
`other/`'s, whose mirror of `beta` holds it signed (any copy whose bytes
match the pin will do, section 8.5); a version whose key log is missing
(in another broken copy), unchecked; and a line nowhere, unavailable.

    // in tests of the statuses of pins:
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

A key log is met in every archive the resolver reads: the owner of
`forked/` is read in `forked/`, where its key log has a fork record, and
the resolver reports its end; a line of it signed against the second
version of the key log is contested wherever it is found.

    // in tests of the statuses of pins:
    test('an owner ended by a fork, met by a resolver (sections 6.3 and 12.3)', async () => {
      const r = new Resolver(new Http({ fetch: diskFetch() }));
      const after = pinOf('forked', 'after'), before = pinOf('forked', 'before');
      assert.equal((await r.pin(after.name, after.owner, 'v1', after.inventorySha512, [at('forked')])).status, 'contested');
      assert.equal((await r.pin(before.name, before.owner, 'v1', before.inventorySha512, [at('forked')])).status, 'verified');
      assert.deepEqual(r.ownerNotes(after.owner), [`owner ${after.owner} ended by a fork of its key log at v2`]);
    });

Branch points
-------------

The accepted copy of `other/` is a branch of `alpha`'s version 2: its
branch point is confirmed against the key log of `archive/`'s owner that
`other/` keeps beside it; unchecked without that key log; and
inconsistent when its evidence lacks the parent's signatures (the parent
version is then not a version) or a file of the parent version differs.

    // in tests of branch points:
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
