// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate, FORMATS, same } from '../app/schema.js';
import { readSchemas, fixture, folder, ALPHA, READING, idOf } from './disk.mjs';

const schemas = await readSchemas();
const messages = (format, data) => validate(schemas[`opensheaf-${format}/0.2`], data).map((e) => `${e.path}: ${e.message}`);
const file = (id, path, archive = 'archive') => fixture(folder(id, archive).replace(/^https:\/\/[^/]+\//, '') + path);

test('the files of the fixtures are valid', async () => {
  for (const a of ['archive', 'other', 'forked']) assert.deepEqual(messages('archive', await fixture(`${a}/opensheaf.json`)), []);
  assert.deepEqual(messages('object', await file(ALPHA, 'v4/content/object.json')), []);
  assert.deepEqual(messages('collection', await file(READING, 'v1/content/members.json')), []);
  assert.deepEqual(messages('genesis', await file(ALPHA, 'v1/content/genesis.json')), []);
  const forked = idOf('before', 'forked').split(':')[2];
  assert.deepEqual(messages('keys', await file(`sheaf:${forked}:${forked}`, 'v2/content/keys.json', 'forked')), []);
});

test('formats are assertions', () => {
  assert.ok(FORMATS.date('2024-02-29'));
  assert.ok(!FORMATS.date('2023-02-29'));
  assert.ok(!FORMATS.date('2024-2-1'));
  assert.ok(FORMATS.uri('https://orcid.org/0000-0002-1234-5677'));
  assert.ok(FORMATS.uri('https://mgubi.org/papers/'));
  assert.ok(!FORMATS.uri('ocfl/'));
  assert.ok(!FORMATS.uri('https://example.org/a b'));
  assert.ok(!FORMATS.uri('https://example.org/%zz'));
  assert.ok(FORMATS['uri-reference']('ocfl/'));
});

test('a discovery document breaking the schema', async () => {
  const disc = await fixture('archive/opensheaf.json');
  delete disc.name;
  disc.objects[0].head = 'v01';
  disc.storageLayout = 'flat';
  disc.profiles = ['website', 'website'];
  assert.deepEqual(messages('archive', disc).sort(), [
    '/objects/0/head: "v01" does not match ^v[1-9][0-9]*$',
    '/profiles: has repeated items',
    '/storageLayout: "flat" is not one of ["opensheaf-owner-name-storage-layout","0003-hash-and-id-...',
    ': "name" is a required property',
  ]);
});

test('object.json: kinds, notes, withdrawal, extensions, previous', async () => {
  const obj = await file(ALPHA, 'v4/content/object.json');
  assert.deepEqual(messages('object', { ...obj, kind: 'collection' }), [
    ': must not have mainSource, sourceFormat, sourcesMissing, renditions, toolchain, changes, stage, history, notices, licence',
  ]);
  assert.deepEqual(messages('object', { ...obj, status: 'withdrawn' }), [': "withdrawal" is a required property']);
  assert.deepEqual(messages('object', { ...obj, changes: { path: 'x.md' } }), ['/changes: "mediaType" is required with "path"']);
  assert.match(messages('object', { ...obj, changes: {} })[0], /satisfies none of the alternatives/);
  assert.deepEqual(messages('object', { ...obj, extensions: { 'not a uri': {} } }), ['/extensions/not a uri: the name "not a uri" is not a valid uri']);
  assert.deepEqual(messages('object', { ...obj, previous: 'xyz' }), ['/previous: "xyz" does not match ^[0-9a-f]{128}$']);
});

test('members.json: catalogues and selections, members by line', async () => {
  const mem = await file(READING, 'v1/content/members.json');
  const bad = structuredClone(mem);
  bad.members[0].version = 'v1';
  assert.deepEqual(messages('collection', bad), ['/members/0: must not have version, inventorySha512, follow']);
  bad.type = 'catalogue';
  assert.deepEqual(messages('collection', bad).sort(), [
    '/members/0: "inventorySha512" is a required property',
    '/members/0: must not have revisions',
    '/members/1: "inventorySha512" is a required property',
    '/members/1: "version" is a required property',
    '/members/1: must not have revisions',
  ]);
  const noAt = structuredClone(mem);
  delete noAt.members[0].at;
  assert.deepEqual(messages('collection', noAt), ['/members/0: "at" is a required property']);
});

test('the keywords the schemas of 0.2 add: maximum, maxItems, minProperties, oneOf', () => {
  const schema = { type: 'object', minProperties: 1, properties: {
    n: { type: 'integer', maximum: 15 }, l: { type: 'array', maxItems: 1 },
    o: { oneOf: [{ type: 'string' }, { type: 'string', pattern: '^a' }] } } };
  assert.deepEqual(validate(schema, {}).map((e) => e.message), ['has fewer than 1 properties']);
  assert.deepEqual(validate(schema, { n: 16, l: [1, 2], o: 'ab' }).map((e) => `${e.path}: ${e.message}`), [
    '/n: 16 is greater than 15', '/l: has more than 1 items', '/o: satisfies 2 of the alternatives, and should satisfy one',
  ]);
  assert.deepEqual(validate(schema, { o: 'b' }), []);
});

test('JSON values are compared whatever the order of keys', () => {
  assert.ok(same({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
  assert.ok(!same([1, 2], [2, 1]));
});
