// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logicalPathProblem, contentPathProblem, under, isObjectId, isVersion } from '../app/paths.js';
import { baseOf, withScheme } from '../app/archive.js';

test('logical paths (sections 7.1 and 15)', () => {
  assert.equal(logicalPathProblem('figures/walk.pdf'), null);
  assert.equal(logicalPathProblem('/etc/passwd'), 'begins with /');
  assert.equal(logicalPathProblem('a/../b'), 'has a . or .. segment');
  assert.equal(logicalPathProblem('./a'), 'has a . or .. segment');
  assert.equal(logicalPathProblem('café.tex'), 'is not in Unicode normalisation form C');
  assert.equal(logicalPathProblem('café.tex'), null);
});

test('content paths stay in a version folder', () => {
  assert.equal(contentPathProblem('v2/content/paper.pdf'), null);
  assert.match(contentPathProblem('v2/other/paper.pdf'), /content directory/);
  assert.match(contentPathProblem('../alpha/v1/content/x'), /segment/);
  assert.match(contentPathProblem('v1/content//x'), /segment/);
  assert.equal(contentPathProblem('v1/data/x', 'data'), null);
});

test('addresses are built under the root, encoded', () => {
  const root = 'https://example.org/papers/ocfl/';
  assert.equal(under(root, ['alpha', 'v1', 'inventory.json']), root + 'alpha/v1/inventory.json');
  assert.equal(under(root, ['alpha', '0=ocfl_object_1.1']), root + 'alpha/0=ocfl_object_1.1');
  assert.equal(under(root, ['a', 'notes #2?.pdf']), root + 'a/notes%20%232%3F.pdf');
  assert.throws(() => under(root, ['..', 'x']), /segment/);
  assert.throws(() => under(root, ['a/b']), /has a \//);
  assert.throws(() => under(root, ['a\\b']), /backslash/);
});

test('addresses typed by a reader', () => {
  assert.equal(withScheme('mgubi.org/papers/'), 'https://mgubi.org/papers/');
  assert.equal(withScheme('localhost:8000/x'), 'http://localhost:8000/x');
  assert.equal(withScheme('127.0.0.1:8000/'), 'http://127.0.0.1:8000/');
  assert.equal(withScheme('example.org:8443/a/'), 'https://example.org:8443/a/');
  assert.equal(withScheme('https://example.org/a/'), 'https://example.org/a/');
  assert.equal(withScheme('../'), '../');
  const page = 'https://opensheaf.org/explorer/';
  assert.equal(baseOf('https://example.org/papers/index.html', page), 'https://example.org/papers/');
  assert.equal(baseOf('https://example.org/papers/opensheaf.json', page), 'https://example.org/papers/');
  assert.equal(baseOf('https://example.org/papers', page), 'https://example.org/papers/');
  assert.equal(baseOf('../', page), 'https://opensheaf.org/');
});

test('identifiers and versions', () => {
  assert.ok(isObjectId('kpz-reloaded'));
  assert.ok(!isObjectId('KPZ'));
  assert.ok(!isObjectId('a'.repeat(65)));
  assert.ok(isVersion('v12'));
  assert.ok(!isVersion('v012'));
});
