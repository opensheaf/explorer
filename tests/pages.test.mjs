// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diskFetch, readSchemas, ORIGIN, ALPHA, BETA, idOf, folder } from './disk.mjs';

class FakeNode {
  constructor() { this.childNodes = []; this.parent = null; this.listeners = {}; }
  append(...children) {
    for (const c of children) {
      const n = typeof c === 'string' ? new FakeText(c) : c;
      n.parent?.detach(n);
      n.parent = this;
      this.childNodes.push(n);
    }
  }
  prepend(...children) { for (const c of children.reverse()) { c.parent?.detach(c); c.parent = this; this.childNodes.unshift(c); } }
  appendChild(c) { this.append(c); return c; }
  insertBefore(n, ref) {
    if (!ref) return this.appendChild(n);
    n.parent?.detach(n);
    n.parent = this;
    this.childNodes.splice(this.childNodes.indexOf(ref), 0, n);
    return n;
  }
  detach(c) { const k = this.childNodes.indexOf(c); if (k >= 0) this.childNodes.splice(k, 1); c.parent = null; }
  remove() { this.parent?.detach(this); }
  replaceWith(n) {
    const p = this.parent;
    if (!p) return;
    n.parent?.detach(n);
    p.childNodes[p.childNodes.indexOf(this)] = n;
    n.parent = p;
    this.parent = null;
  }
  replaceChildren(...children) { for (const c of this.childNodes) c.parent = null; this.childNodes = []; this.append(...children); }
  addEventListener(type, f) { (this.listeners[type] ||= []).push(f); }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(new FakeText(String(v))); }
}
class FakeText extends FakeNode {
  constructor(s) { super(); this.data = s; }
  get textContent() { return this.data; }
}
class FakeElement extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.attributes = {};
    this.dataset = {};
    this.className = '';
    this.classList = { add() {}, remove() {}, toggle() {} };
  }
  setAttribute(name, value) { this.attributes[name] = value; }
  get value() {
    if (this.tagName !== 'select') return this.attributes.value;
    const options = this.all('option');
    return (options.find((o) => 'selected' in o.attributes) || options[0])?.attributes.value;
  }
  set value(v) { this.attributes.value = v; }
  all(tag, out = []) {
    for (const c of this.childNodes) {
      if (c instanceof FakeElement) { if (c.tagName === tag) out.push(c); c.all(tag, out); }
    }
    return out;
  }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (tag) => new FakeElement(tag), createTextNode: (s) => new FakeText(s),
                        baseURI: ORIGIN + 'explorer/' };

const { Http } = await import('../app/http.js');
const { Archive } = await import('../app/archive.js');
const { Resolver } = await import('../app/resolve.js');
const { showObject } = await import('../app/view-object.js');
const { showCollection } = await import('../app/view-collection.js');
const { showArchive, ROWS_AT_ONCE } = await import('../app/view-archive.js');
const { showVerify } = await import('../app/view-verify.js');
const { showOwner } = await import('../app/view-owner.js');
const { clear } = await import('../app/dom.js');

async function session(base = 'archive/', delay = 15) {
  const log = [];
  const disk = diskFetch({ log });
  const slow = (url, init = {}) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => disk(url, init).then(resolve, reject), delay);
    init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); });
  });
  const http = new Http({ fetch: slow });
  const archive = await Archive.open(http, ORIGIN + base);
  const ctx = { http, archive, resolver: new Resolver(http, archive), summaries: new Map(), signal: null };
  const main = new FakeElement('main');
  let controller = null;
  const go = () => {
    controller?.abort();
    controller = new AbortController();
    ctx.signal = controller.signal;
    clear(main);
  };
  return { ctx, main, log, go };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('an object page left while loading is not drawn below the next one', async () => {
  const { ctx, main, go } = await session();
  go();
  const { summary } = await import('../app/summary.js');
  await summary(ctx, ALPHA);
  await summary(ctx, BETA);
  go();
  const left = showObject(ctx, main, ALPHA, 'v1');
  await wait(5);
  go();
  const shown = showObject(ctx, main, BETA);
  await Promise.all([left, shown]);
  assert.deepEqual(main.all('code').map((c) => c.textContent).filter((t) => t === 'alpha' || t === 'beta'), ['beta']);
  assert.equal(main.all('h1').length, 1);
});

test('the pins of a collection page left are not resolved further', async () => {
  const { ctx, main, log, go } = await session('other/');
  go();
  await showCollection(ctx, main, idOf('shelf', 'other'));
  const run = main.all('button').find((b) => b.textContent === 'Resolve and check all pins');
  const resolving = run.listeners.click[0]();
  const started = log.length;
  for (let t = 0; log.length < started + 15 && t < 3000; t++) await wait(1);
  assert.ok(log.length >= started + 15, 'resolving fetches too little');
  go();
  const before = log.length;
  await resolving;
  await wait(100);
  assert.deepEqual(log.slice(before), []);
});

test('the page of an archive reads only what its rows show', async () => {
  const { ctx, main, log, go } = await session('archive/', 1);
  go();
  showArchive(ctx, main);
  const status = () => main.all('p').find((p) => p.className === 'muted small').textContent;
  for (let t = 0; /descriptions read|^$/.test(status()) && t < 3000; t++) await wait(1);
  await wait(20);
  const alpha = log.filter((u) => u.startsWith(folder(ALPHA))).map((u) => u.slice(folder(ALPHA).length)).sort();
  assert.deepEqual(alpha, ['inventory.json', 'v3/content/datacite.json', 'v3/content/object.json', 'v4/content/object.json', 'v4/inventory.json']);
  const row = main.all('li').find((li) => li.all('code').some((c) => c.textContent === 'alpha'));
  assert.match(row.textContent, /version 2 · head v4/);
});

test('the rows of a large archive are read a few at a time, and filtered in linear time', async () => {
  const N = 300;
  const objects = Array.from({ length: N }, (_, k) => ({ id: `doc-${k}`, kind: 'document', head: 'v1', status: 'active' }));
  const started = [];
  let inFlight = 0, most = 0;
  const read = (id) => {
    started.push(id);
    most = Math.max(most, ++inFlight);
    return new Promise((resolve, reject) => setTimeout(() => {
      inFlight--;
      reject(Object.assign(new Error('gone'), { kind: 'missing' }));
    }, 1));
  };
  const archive = { name: 'Synthetic', base: ORIGIN + 'synthetic/', root: ORIGIN + 'synthetic/ocfl/',
                    disc: { objects }, objects: () => objects, tombstones: () => [], owners: () => [], drafts: () => [],
                    inventory: read, headInventory: read, history: read };
  const ctx = { archive, summaries: new Map(), signal: new AbortController().signal };
  const main = new FakeElement('main');
  const normalize = String.prototype.normalize;
  let folds = 0;
  String.prototype.normalize = function (...args) { folds++; return normalize.apply(this, args); };
  try {
    showArchive(ctx, main);
    main.all('input').find((i) => i.attributes.type === 'search').attributes.value = 'doc';
    for (let t = 0; (started.length < N || inFlight > 0) && t < 5000; t++) await wait(1);
    await wait(20);
  } finally {
    String.prototype.normalize = normalize;
  }
  assert.deepEqual(started, objects.map((o) => o.id));
  assert.ok(most <= ROWS_AT_ONCE, `${most} rows read at once`);
  assert.ok(folds < 5 * N, `${folds} folds for ${N} rows`);
  assert.match(main.all('p').find((p) => p.className === 'muted small').textContent, /^300 of 300 objects shown$/);
});

test('the page of a verification in progress keeps what the reader opened', async () => {
  const { ctx, main, go } = await session('broken/gap/', 20);
  ctx.schemas = readSchemas;
  go();
  showVerify(ctx, main);
  main.all('button').find((b) => b.textContent === 'Verify').listeners.click[0]();
  const boxes = main.all('input');
  let group;
  for (let t = 0; !group && t < 3000; t++) {
    await wait(5);
    group = main.all('details').find((d) => d.className === 'group' && !d.hidden);
  }
  assert.ok(group && ctx.verification.running, 'no finding while running');
  group.open = !group.open;
  const open = group.open;
  for (let t = 0; ctx.verification.running && t < 3000; t++) await wait(5);
  await wait(250);
  assert.ok(ctx.verification.report, 'the verification did not end');
  assert.ok(main.all('details').includes(group), 'the group was drawn again');
  assert.equal(group.open, open);
  for (const box of boxes) assert.ok(main.all('input').includes(box), 'a box was drawn again');
  go();
  assert.equal(ctx.verification.listeners.size, 0);
});

test('a contested line, an ended owner, the statuses of members', async () => {
  const other = await session('other/', 0);
  other.go();
  await showObject(other.ctx, other.main, idOf('exposed', 'other'));
  const text = other.main.textContent;
  assert.match(text, /contested/);
  assert.match(text, /no signed version that is not contested/);
  assert.ok(text.includes(`sheaf:${idOf('exposed', 'other').split(':')[1]}`));
  assert.ok(!text.includes(idOf('exposed', 'other')), 'the line of its originator is written sheaf:<name> only');
  const forked = await session('forked/', 0);
  forked.go();
  await showOwner(forked.ctx, forked.main, idOf('before', 'forked').split(':')[2]);
  assert.match(forked.main.textContent, /ended by a fork at v2/);
  other.go();
  await showCollection(other.ctx, other.main, idOf('shelf', 'other'));
  const run = other.main.all('button').find((b) => b.textContent === 'Resolve and check all pins');
  await run.listeners.click[0]();
  const report = other.main.all('p').find((p) => /pins? resolved/.test(p.textContent));
  assert.match(report.textContent, /verified/);
  assert.doesNotMatch(report.textContent, /mismatch|unavailable|not a version/);
});
