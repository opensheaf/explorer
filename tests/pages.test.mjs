// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diskFetch, ORIGIN } from './disk.mjs';

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
  await summary(ctx, 'alpha');
  await summary(ctx, 'beta');
  go();
  const left = showObject(ctx, main, 'alpha', 'v1');
  await wait(5);
  go();
  const shown = showObject(ctx, main, 'beta');
  await Promise.all([left, shown]);
  assert.deepEqual(main.all('code').map((c) => c.textContent).filter((t) => t === 'alpha' || t === 'beta'), ['beta']);
  assert.equal(main.all('h1').length, 1);
});

test('the pins of a collection page left are not resolved further', async () => {
  const { ctx, main, log, go } = await session('other/');
  go();
  await showCollection(ctx, main, 'collection-main');
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
