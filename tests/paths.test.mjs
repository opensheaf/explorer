// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { logicalPathProblem, contentPathProblem, under, isObjectId, isVersion, pathOf, HASHED_LAYOUT } from '../app/paths.js';
import { baseOf, withScheme } from '../app/archive.js';

const A = '56wo6cdpjsxk7ddgnqfp2quipfghukhtmvjuahvwzko7m4tkz3pa';
const N = 'zzgdggwlldcrw4bdeuvntiaobtw2kge6bc4go737pfekhfc5oz4q';

test('logical paths (section 4.1)', () => {
  assert.equal(logicalPathProblem('figures/walk.pdf'), null);
  assert.equal(logicalPathProblem('/etc/passwd'), 'has an empty, . or .. segment');
  assert.equal(logicalPathProblem('a/'), 'has an empty, . or .. segment');
  assert.equal(logicalPathProblem('a/../b'), 'has an empty, . or .. segment');
  assert.equal(logicalPathProblem('a\\b'), 'has a \\');
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
  assert.equal(under(root, [A, N, 'v1', 'inventory.json']), `${root}${A}/${N}/v1/inventory.json`);
  assert.equal(under(root, ['x', '0=ocfl_object_1.1']), root + 'x/0=ocfl_object_1.1');
  assert.equal(under(root, ['a', 'notes #2?.pdf']), root + 'a/notes%20%232%3F.pdf');
  assert.equal(under(root, ['946', 'sheaf%3az']), root + '946/sheaf%253az');
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
  assert.ok(isObjectId(`sheaf:${N}:${A}`));
  assert.ok(isObjectId('sheaf:draft:notes'));
  assert.ok(!isObjectId(`sheaf:${N}:aajozkubvmxu37pbu2lumdl37llv4ntkazd6j2es54zn23fkiknb`), 'an owner name is a name of algorithm 0');
  assert.ok(!isObjectId('kpz-reloaded'), 'an identifier of 0.1');
  assert.ok(!isObjectId(`sheaf:${N.toUpperCase()}:${A}`));
  assert.ok(!isObjectId('sheaf:draft:' + 'a'.repeat(65)));
  assert.ok(isVersion('v12'));
  assert.ok(!isVersion('v012'));
});

test('the paths of the two layouts (section 3.2, appendix C)', async () => {
  assert.deepEqual(await pathOf(`sheaf:${N}:${A}`), [A, N]);
  assert.deepEqual(await pathOf(`sheaf:${A}:${A}`), [A, A]);
  assert.deepEqual(await pathOf('sheaf:draft:notes'), ['draft', 'notes']);
  assert.equal((await pathOf(`sheaf:${N}:${A}`, HASHED_LAYOUT)).join('/'),
    '946/75e/b2e/sheaf%3azzgdggwlldcrw4bdeuvntiaobtw2kge6bc4go737pfekhfc5oz4q%3a56wo6cdpjsxk7ddgnqfp2quipfghukhtmvjua-' +
    '94675eb2e27de7146a912666db928784432a4c206a6b390da5a0ed7d15975580');
  await assert.rejects(pathOf('alpha'), /not the identifier of a line or of a draft/);
});
