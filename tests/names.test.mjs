// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inventoryFindings } from '../app/rules.js';
import { readableMath } from '../app/text.js';
import { validate } from '../app/schema.js';
import { readSchemas } from './disk.mjs';

const inventory = (versions, manifest = {}) => ({ id: 'x', digestAlgorithm: 'sha512', manifest,
  head: versions[versions.length - 1], versions: Object.fromEntries(versions.map((v) => [v, { state: {} }])) });

test('a digest of the state named like an inherited property', () => {
  const inv = inventory(['v1']);
  inv.versions.v1.state = { toString: ['a.tex'] };
  assert.deepEqual(inventoryFindings('x', inv).map((f) => f.message), ['a digest of the state is not in the manifest']);
});

test('a gap in the versions is one problem', () => {
  const inv = inventory(['v1', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10']);
  assert.deepEqual(inventoryFindings('x', inv).map((f) => f.message), ['the versions are not v1 to v10 without gaps']);
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
  assert.ok(validate(schemas['opensheaf-collection/0.1'], { format: 'opensheaf-collection/0.1', type: 'constructor', members: [] }).length);
});
