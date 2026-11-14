// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { validate, FORMATS, same } from '../app/schema.js';
import { readSchemas } from './disk.mjs';

const schemas = await readSchemas();
const object = schemas['opensheaf-object/0.1'];
const collection = schemas['opensheaf-collection/0.1'];
const archive = schemas['opensheaf-archive/0.1'];
const fixture = async (path) => JSON.parse(await readFile(new URL(`./fixtures/${path}`, import.meta.url), 'utf-8'));
const messages = (schema, data) => validate(schema, data).map((e) => `${e.path}: ${e.message}`);

test('the files of the fixtures are valid', async () => {
  assert.deepEqual(messages(archive, await fixture('archive/opensheaf.json')), []);
  assert.deepEqual(messages(archive, await fixture('other/opensheaf.json')), []);
  assert.deepEqual(messages(object, await fixture('archive/ocfl/alpha/v4/content/object.json')), []);
  assert.deepEqual(messages(collection, await fixture('archive/ocfl/reading/v1/content/members.json')), []);
});

test('formats are assertions', () => {
  assert.ok(FORMATS.date('2024-02-29'));
  assert.ok(!FORMATS.date('2023-02-29'));
  assert.ok(!FORMATS.date('2024-2-1'));
  assert.ok(FORMATS.uri('tag:opensheaf.org,2026:mgubi'));
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
  disc.archiveId = 'not a uri';
  disc.profiles = ['website', 'website'];
  assert.deepEqual(messages(archive, disc).sort(), [
    '/archiveId: "not a uri" is not a valid uri',
    '/objects/0/head: "v01" does not match ^v[1-9][0-9]*$',
    '/profiles: has repeated items',
    ': "name" is a required property',
  ]);
});

test('object.json: kinds, notes, withdrawal, extensions', async () => {
  const obj = await fixture('archive/ocfl/alpha/v4/content/object.json');
  assert.deepEqual(messages(object, { ...obj, kind: 'collection' }), [
    ': must not have mainSource, sourceFormat, sourcesMissing, renditions, toolchain, changes, stage, history, notices',
  ]);
  assert.deepEqual(messages(object, { ...obj, status: 'withdrawn' }), [': "withdrawal" is a required property']);
  assert.deepEqual(messages(object, { ...obj, changes: { path: 'x.md' } }), ['/changes: "mediaType" is required with "path"']);
  assert.match(messages(object, { ...obj, changes: {} })[0], /satisfies none of the alternatives/);
  assert.deepEqual(messages(object, { ...obj, extensions: { 'not a uri': {} } }), ['/extensions/not a uri: the name "not a uri" is not a valid uri']);
  assert.deepEqual(messages(object, { ...obj, renditions: [{ path: '../x.pdf', mediaType: 'application/pdf' }] }),
    ['/renditions/0/path: "../x.pdf" does not match ^(?!/)(?!(?:.*/)?\\.{1,2}(?:/|$)).+$']);
});

test('members.json: catalogues and selections', async () => {
  const mem = await fixture('archive/ocfl/reading/v1/content/members.json');
  const bad = structuredClone(mem);
  bad.members[0].version = 'v1';
  assert.deepEqual(messages(collection, bad), ['/members/0: must not have version, inventorySha512, follow']);
  bad.type = 'catalogue';
  assert.deepEqual(messages(collection, bad).sort(), [
    '/members/0: "inventorySha512" is a required property',
    '/members/0: must not have revisions',
    '/members/1: "inventorySha512" is a required property',
    '/members/1: "version" is a required property',
    '/members/1: must not have revisions',
  ]);
});

test('JSON values are compared whatever the order of keys', () => {
  assert.ok(same({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
  assert.ok(!same([1, 2], [2, 1]));
});
