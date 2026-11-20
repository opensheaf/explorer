// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jsonTokens } from '../app/ui.js';

test('JSON is split into keys, values and the rest', () => {
  const text = JSON.stringify({ a: 'x"y: 1', n: -1.5e3, ok: true, z: null, k: ['s'] }, null, 2);
  const tokens = jsonTokens(text);
  assert.equal(tokens.map((t) => t.text).join(''), text);
  const kinds = (kind) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
  assert.deepEqual(kinds('key'), ['"a"', '"n"', '"ok"', '"z"', '"k"']);
  assert.deepEqual(kinds('string'), ['"x\\"y: 1"', '"s"']);
  assert.deepEqual(kinds('number'), ['-1500']);
  assert.deepEqual(kinds('literal'), ['true', 'null']);
});
