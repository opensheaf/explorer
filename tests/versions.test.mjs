// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { documentVersionErrors, defaultHistory, historyOf, currentVersion, rolesOf, memberPins, filesOf, withdrawnVersions } from '../app/versions.js';

function make(versions) {
  const inv = { head: `v${versions.length}`, manifest: {}, versions: {} };
  const objs = new Map();
  versions.forEach(({ obj, files }, k) => {
    const ver = `v${k + 1}`;
    const state = { [`o${k}`]: ['object.json'], [`d${k}`]: ['datacite.json'] };
    for (const [p, digest] of Object.entries(files)) state[digest] = [...(state[digest] || []), p];
    inv.versions[ver] = { state };
    objs.set(ver, { kind: 'document', ...obj });
  });
  return { inv, objOf: (v) => objs.get(v) ?? null };
}

test('a version found later, with a history', () => {
  const { inv, objOf } = make([
    { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 2 }, files: { 'a.tex': 'a2' } },
    { obj: { documentVersion: 3, history: ['v1', 'v3', 'v2'] }, files: { 'a.tex': 'a0' } },
    { obj: { documentVersion: 2, history: ['v1', 'v3', 'v4'], notices: [{ documentVersion: 1, date: '2024-01-01', text: 'n' }] }, files: { 'a.tex': 'a2' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf), []);
  assert.deepEqual(historyOf(inv, objOf), ['v1', 'v3', 'v4']);
  assert.equal(currentVersion(inv, objOf), 'v4');
  assert.equal(currentVersion(inv, objOf, 'v3'), 'v2');
  assert.deepEqual(rolesOf(inv, objOf), { v1: 'new', v2: 'new', v3: 'new', v4: 'description' });
});

test('without a history, the current version is the highest', () => {
  const { inv, objOf } = make([
    { obj: { documentVersion: 1, sourcesMissing: { text: 'lost' } }, files: { 'p.pdf': 'p1' } },
    { obj: { documentVersion: 2 }, files: { 'a.tex': 'a2' } },
    { obj: { documentVersion: 1 }, files: { 'p.pdf': 'p1', 'a.tex': 'a1' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf), []);
  assert.deepEqual(defaultHistory(inv, objOf), ['v3', 'v2']);
  assert.equal(currentVersion(inv, objOf), 'v2');
  assert.equal(rolesOf(inv, objOf).v3, 'completion');
});

test('the rules of section 7.3', () => {
  const notice = { documentVersion: 1, date: '2024-01-01', text: 'n' };
  const { inv, objOf } = make([
    { obj: { documentVersion: 1, notices: [notice] }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 3 }, files: { 'a.tex': 'a3' } },
    { obj: { documentVersion: 1, history: ['v3', 'v2'] }, files: { 'a.tex': 'changed' } },
    { obj: { documentVersion: 3 }, files: { 'a.tex': 'a3' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf).map((e) => `${e.ver} ${e.message}`), [
    'v2 document version 3 breaks the numbering (expected 2)',
    'v2 drops, changes or moves an earlier notice',
    'v3 has other files than document version 1',
    'v3 history does not list each document version once',
    'v4 lacks the history of earlier versions',
  ]);
});

test('the fields of a document version and its external records (section 4.2)', () => {
  const pdf = { path: 'p.pdf', mediaType: 'application/pdf' };
  const arxiv = { role: 'source', service: 'arXiv', record: 'https://arxiv.org/abs/2601.00001v1' };
  const zenodo = { role: 'deposit', service: 'Zenodo', record: 'https://zenodo.org/records/1' };
  const { inv, objOf } = make([
    { obj: { documentVersion: 1, renditions: [pdf], external: [arxiv] }, files: { 'a.tex': 'a1', 'p.pdf': 'p1' } },
    { obj: { documentVersion: 1, renditions: [pdf], external: [arxiv, zenodo] }, files: { 'a.tex': 'a1', 'p.pdf': 'p1' } },
    { obj: { documentVersion: 1, renditions: [{ ...pdf, mediaType: 'application/octet-stream' }], toolchain: [{ name: 'TeX', version: '3' }], external: [zenodo] }, files: { 'a.tex': 'a1', 'p.pdf': 'p1' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf).map((e) => `${e.ver} ${e.message}`), [
    'v3 changes renditions of document version 1, which belongs to it (section 4.2)',
    'v3 changes toolchain of document version 1, which belongs to it (section 4.2)',
    'v3 drops or changes an external record of document version 1 (section 4.2)',
  ]);
});

test('a withdrawal is kept until a new document version, which reinstates the line (section 13.1)', () => {
  const gone = { date: '2026-03-01', reason: { text: 'An error.' } };
  const ok = make([
    { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1, status: 'withdrawn', withdrawal: gone }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1, status: 'withdrawn', withdrawal: gone, notices: [{ documentVersion: 1, date: '2026-03-02', text: 'n' }] }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 2, notices: [{ documentVersion: 1, date: '2026-03-02', text: 'n' }] }, files: { 'a.tex': 'a2' } },
  ]);
  assert.deepEqual(documentVersionErrors(ok.inv, ok.objOf), []);
  assert.deepEqual([...withdrawnVersions(ok.inv, ok.objOf)], [[1, 'v2']]);
  const bad = make([
    { obj: { documentVersion: 1, status: 'withdrawn', withdrawal: gone }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
  ]);
  assert.deepEqual(documentVersionErrors(bad.inv, bad.objOf).map((e) => `${e.ver} ${e.message}`), [
    'v1 is a new document version and a withdrawal: a withdrawal is a description-only version (section 13.1)',
    'v2 drops or changes the withdrawal of v1: only a new document version reinstates a line (section 13.1)',
  ]);
  const dropped = make([
    { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1, status: 'withdrawn', withdrawal: gone }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
  ]);
  assert.deepEqual(documentVersionErrors(dropped.inv, dropped.objOf).map((e) => `${e.ver} ${e.message}`), [
    'v3 drops or changes the withdrawal of v2: only a new document version reinstates a line (section 13.1)',
  ]);
});

test('notices are numbered, and replace earlier ones once (section 4.2)', () => {
  const first = { documentVersion: 1, date: '2026-02-01', text: 'Theorem 2 is wrong as stated.' };
  const fix = { documentVersion: 1, date: '2026-03-01', text: 'Theorem 2 is right.', replaces: 1 };
  const { inv, objOf } = make([
    { obj: { documentVersion: 1, notices: [first] }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1, notices: [first, fix] }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1, notices: [first, fix, { ...fix, text: 'Again.' }, { ...fix, replaces: 4 }] }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1, notices: [fix, first] }, files: { 'a.tex': 'a1' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf).map((e) => `${e.ver} ${e.message}`), [
    'v3 notice 3 replaces notice 1, which is already replaced',
    'v3 notice 4 replaces no earlier notice (4)',
    'v4 drops, changes or moves an earlier notice',
  ]);
});

test('a collection follows the rules of documents (section 4.2)', () => {
  const c = (n) => ({ kind: 'collection', documentVersion: n });
  const { inv, objOf } = make([
    { obj: c(1), files: { 'members.json': 'm1' } },
    { obj: c(2), files: { 'members.json': 'm2' } },
    { obj: c(1), files: { 'members.json': 'm1' } },
    { obj: c(2), files: { 'members.json': 'm3' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf).map((e) => `${e.ver} ${e.message}`), [
    'v4 has other files than document version 2',
  ]);
  assert.deepEqual(rolesOf(inv, objOf), { v1: 'new', v2: 'new', v3: 'description', v4: 'description' });
});

test('a description-only version may add the file of the licence terms (sections 7.3 and 9)', () => {
  const { inv, objOf } = make([
    { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 1, licence: { path: 'LICENCE.txt', mediaType: 'text/plain' } }, files: { 'a.tex': 'a1', 'LICENCE.txt': 'l1' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf), []);
  assert.equal(rolesOf(inv, objOf).v2, 'description');
});

test('a new number for the files and change note of the current version; a revert (section 4.2)', () => {
  const note = { text: 'typos' };
  const { inv, objOf } = make([
    { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 2, changes: note }, files: { 'a.tex': 'a2' } },
    { obj: { documentVersion: 3 }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 4 }, files: { 'a.tex': 'a1' } },
    { obj: { documentVersion: 5 }, files: { 'b.tex': 'a1' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf).map((e) => `${e.ver} ${e.message}`), [
    'v4 document version 4 holds the same files and change note as the current version 3: it is no new document version (section 4.2)',
  ]);
});

test('logical paths named like inherited properties', () => {
  let { inv, objOf } = make([
    { obj: { documentVersion: 1, sourcesMissing: { text: 'lost' } }, files: { 'p.pdf': 'p1' } },
    { obj: { documentVersion: 1, mainSource: 'a.tex' }, files: { 'p.pdf': 'p1', 'a.tex': 'a1', constructor: 'c1' } },
  ]);
  assert.deepEqual(documentVersionErrors(inv, objOf), []);
  ({ inv } = make([{ obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } }]));
  inv.versions.v1.state = JSON.parse('{"x1": ["__proto__"], "a1": ["a.tex"]}');
  assert.deepEqual(Object.keys(filesOf(inv, 'v1')).sort(), ['__proto__', 'a.tex']);
  assert.equal(filesOf(inv, 'v1').toString, undefined);
});

test('the pins of members', () => {
  assert.deepEqual(memberPins({ version: 'v2', inventorySha512: 'x' }), [{ version: 'v2', pin: 'x', documentVersion: null }]);
  assert.deepEqual(memberPins({ revisions: [{ documentVersion: 2, version: 'v3', inventorySha512: 'y' }] }),
    [{ version: 'v3', pin: 'y', documentVersion: 2 }]);
});
