// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { memberErrors } from '../app/rules.js';
import { contentPath } from '../app/versions.js';
import { readableMath } from '../app/text.js';
import { validate } from '../app/schema.js';
import { readSchemas } from './disk.mjs';

const inventory = (versions, manifest = {}) => ({ id: 'x', digestAlgorithm: 'sha512', manifest,
  head: versions[versions.length - 1], versions: Object.fromEntries(versions.map((v) => [v, { state: {} }])) });

test('a digest of the state named like an inherited property', () => {
  const inv = { manifest: {}, versions: { v1: { state: { toString: ['a.tex'] } } } };
  assert.equal(contentPath(inv, 'v1', 'a.tex'), null);
  assert.deepEqual(memberErrors('selection', JSON.parse('{"__proto__": {"version": "v1"}, "revisions": [{"documentVersion": 1, "version": "v1", "inventorySha512": "x"}]}')), []);
});

test('LaTeX commands named like inherited properties are left as they are', () => {
  assert.equal(readableMath('\\constructor x'), '\\constructor x');
  assert.equal(readableMath('\\hasOwnProperty'), '\\hasOwnProperty');
  assert.equal(readableMath('\\alpha^2'), 'α²');
});

test('mathematics made to be slow is read at once', async () => {
  const { plain } = await import('../app/text.js');
  for (const tex of ['\\mathbb' + ' '.repeat(5e4), '\\mathbb{' + ' '.repeat(5e4), '\\mathbb' + ' '.repeat(1999)]) {
    const start = performance.now();
    readableMath(tex);
    plain(`a $${tex}$ b`);
    assert.ok(performance.now() - start < 200, `${tex.length} characters took too long`);
  }
  assert.equal(readableMath('\\mathbb{R}^2'), 'ℝ²');
  assert.equal(readableMath('\\mathbb R'), 'ℝ');
  assert.equal(readableMath('\\mathbb { Z }'), 'ℤ');
});

test('properties named like inherited ones are checked by the schema', async () => {
  const schema = { type: 'object', required: ['toString'], properties: { a: { type: 'string' } },
                   additionalProperties: { type: 'string' } };
  assert.deepEqual(validate(schema, JSON.parse('{"constructor": 1}')).map((e) => `${e.path}: ${e.message}`),
    [': "toString" is a required property', '/constructor: 1 is not of type string']);
  const schemas = await readSchemas();
  assert.ok(validate(schemas['opensheaf-collection/0.2'], { format: 'opensheaf-collection/0.2', type: 'constructor', members: [] }).length);
});

test('rightsList entries are read by their fields, not their names (section 4.4)', async () => {
  const { descriptionErrors } = await import('../app/rules.js');
  const inv = { head: 'v1', versions: { v1: { state: {} } }, manifest: {} };
  const obj = { documentVersion: 1 };
  const dc = (rightsList) => ({ titles: [], creators: [], publicationYear: 2026, types: {}, version: '1', publisher: {}, rightsList });
  const rights = (list) => descriptionErrors(inv, 'v1', obj, dc(list)).filter((m) => m.startsWith('rightsList'));
  assert.deepEqual(rights([{ rights: 'Creative Commons Attribution 4.0 International' }]), []);
  assert.deepEqual(rights([{ rights: 'Open Government Licence', rightsUri: 'https://example.org/ogl' }]), []);
  assert.deepEqual(rights([{ rights: 'All rights reserved' }]), []);
  assert.deepEqual(rights([{ rightsIdentifier: 'CC-BY-4.0', rightsIdentifierScheme: 'SPDX' }]),
    ['rightsList: CC-BY-4.0 is not in lower case (section 4.4)']);
  assert.deepEqual(rights([{ rightsIdentifier: 'cc-by-4.0' }]),
    ['rightsList: cc-by-4.0 is not given as an SPDX identifier (section 4.4)']);
});

test('a rights entry is required (section 4.4)', async () => {
  const { descriptionErrors } = await import('../app/rules.js');
  const inv = { head: 'v1', versions: { v1: { state: {} } }, manifest: {} };
  const obj = { documentVersion: 1 };
  const base = { titles: [], creators: [], publicationYear: 2026, types: {}, version: '1', publisher: {} };
  const missing = 'datacite.json has no licence or rights statement in rightsList (section 4.4)';
  assert.ok(descriptionErrors(inv, 'v1', obj, base).includes(missing));
  assert.ok(descriptionErrors(inv, 'v1', obj, { ...base, rightsList: [] }).includes(missing));
  assert.ok(!descriptionErrors(inv, 'v1', obj, { ...base, rightsList: [{ rights: 'All rights reserved' }] }).includes(missing));
});

test('a landing page describes itself to programs (appendix A.3)', async () => {
  const { landingDescriptionGaps } = await import('../app/rules.js');
  const links = '<link rel="cite-as" href="x"><link rel="describedby" href="y"><link rel="type" href="z">';
  const record = '<script type="application/ld+json">{"@type": "ScholarlyArticle", "identifier": ["sheaf:a"]}</script>';
  assert.deepEqual(landingDescriptionGaps(links + record), []);
  assert.deepEqual(landingDescriptionGaps(record), ['the Signposting link cite-as', 'the Signposting link describedby', 'the Signposting link type']);
  assert.deepEqual(landingDescriptionGaps(links + '<script type="application/ld+json">{oops</script>'),
    ['a schema.org record in JSON-LD with a type and identifiers']);
  const deep = record.replace('}</script>', `, "x": ${'['.repeat(70)}${']'.repeat(70)}}</script>`);
  assert.deepEqual(landingDescriptionGaps(links + deep), ['a schema.org record in JSON-LD with a type and identifiers']);
});
