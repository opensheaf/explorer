// Generated from literate/30-app.md by opensheaf-literate: edit the document, not this file.
import { Http } from './http.js';
import { Archive, withScheme } from './archive.js';
import { Resolver } from './resolve.js';
import { fetchSchemas } from './schema.js';
import { h, append, clear } from './dom.js';
import { errorBox, loading, pages, elsewhere } from './ui.js';
import { isObjectId, isVersion } from './paths.js';
import { LABEL, OWNER_NAME } from './names.js';
import { showArchive } from './view-archive.js';
import { showObject } from './view-object.js';
import { showCollection } from './view-collection.js';
import { showOwner } from './view-owner.js';
import { showVerify } from './view-verify.js';

const ctx = {
  http: new Http(),
  archive: null,
  resolver: null,
  summaries: new Map(),
  signal: null,
  verification: null,
  schemas: (() => {
    let loading = null;
    return () => loading || (loading = fetchSchemas().catch((error) => { loading = null; throw error; }));
  })(),
};

export async function locate(http, input) {
  const url = new URL(input, location.href);
  const m = /^(.*\/)(v[1-9][0-9]*)\/?(?:inventory\.json)?$/.exec(url.origin + url.pathname);
  if (m) {
    const [, folder, ver] = m;
    let dir = new URL('../', folder).href;
    for (let k = 0; k < 6; k++) {
      try {
        const archive = await Archive.open(http, dir);
        const id = [...archive.objects(), ...archive.drafts()].map((o) => o.id)
          .find((i) => archive.paths.has(i) && archive.url(i, 'x').slice(0, -1) === folder);
        if (id) return { archive, hash: pages.object(archive.labelOf(id) || id, ver) };
      } catch {
        // not this folder
      }
      const parent = new URL('../', dir).href;
      if (parent === dir) break;
      dir = parent;
    }
  }
  return { archive: await Archive.open(http, url.href), hash: null };
}

const EXAMPLE = 'https://mgubi.org/papers/';
const EXAMPLE_NAME = 'Papers of Massimiliano Gubinelli';

function showStart(main, error = null, given = '') {
  const url = h('input', { type: 'text', inputmode: 'url', name: 'url', id: 'start-url', required: true, value: given || null,
                           placeholder: 'https://example.org/papers/' });
  const collection = h('input', { type: 'text', name: 'collection', pattern: '[a-z0-9]+(-[a-z0-9]+)*|sheaf:[a-z2-7]{52}:[a-z2-7]{52}',
                                  placeholder: 'collection label (optional)', 'aria-label': 'Collection' });
  const here = location.origin + location.pathname;
  clear(main,
    h('header', { class: 'page-head' },
      h('h1', {}, 'OpenSheaf Explorer'),
      h('p', { class: 'lead' }, 'Explore and verify ', h('a', { href: 'https://opensheaf.org' }, 'OpenSheaf'),
        ' archives and collections in your browser: documents with every version, their descriptions and files, ',
        'collections across archives, and the checks of the specification, from the files any reader can fetch.')),
    error ? errorBox(`Cannot open ${given}:`, error) : null,
    h('form', { class: 'open', method: 'get', action: '' },
      h('label', { for: 'start-url' }, 'The address of an archive (its base URL, where opensheaf.json is), or of an object version'), url,
      collection, h('button', { type: 'submit', class: 'primary' }, 'Explore')),
    h('p', { class: 'example' }, 'For example, the first OpenSheaf archive: ',
      h('a', { href: elsewhere(EXAMPLE) }, h('strong', {}, EXAMPLE_NAME)),
      ' (', h('code', {}, EXAMPLE.replace(/^https:\/\//, '')), ').'),
    h('section', { class: 'block' }, h('h2', {}, 'Three ways to use it'),
      h('ol', {},
        h('li', {}, h('strong', {}, 'A link. '), 'Give the archive in the address: ',
          h('code', {}, `${here}?url=<base URL>`), ', with ', h('code', {}, '#/object/<label>'), ', ',
          h('code', {}, '#/collection/<label>'), ', ', h('code', {}, '#/owner/<owner name>'), ' or ',
          h('code', {}, '#/verify'), ' to open a page.'),
        h('li', {}, h('strong', {}, 'A button on an archive’s pages. '), 'Add ',
          h('code', {}, `<script src="${new URL('embed.js', here).href}" data-archive="./"></script>`),
          ': it adds a link “Explore this archive”, for the archive at data-archive, relative to the page.'),
        h('li', {}, h('strong', {}, 'A copy in the archive. '), 'Copy the explorer’s files into the archive’s site, ',
          'for instance as explorer/ next to opensheaf.json: opened there, it explores the archive above it, ',
          'with no cross-origin requests, which also works for hosts that do not allow them.'))));
}

let controller = null;

function route() {
  const main = document.getElementById('main');
  controller?.abort();
  controller = new AbortController();
  ctx.signal = controller.signal;
  ctx.http.newPage();
  let parts;
  try {
    parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    parts = ['?'];
  }
  const [page = '', name, ver] = parts;
  clear(main);
  for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('current', a.dataset.page === (page || 'archive'));
  const id = isObjectId(name) ? name : LABEL.test(name || '') ? ctx.archive.byLabel(name) : null;
  const valid = id !== null && (ver === undefined || isVersion(ver)) && parts.length <= 3;
  let shown = null;
  if (ctx.archive.old) shown = showOld(main);
  else if (page === '') shown = showArchive(ctx, main);
  else if (page === 'object' && valid) shown = showObject(ctx, main, id, ver);
  else if (page === 'collection' && valid) shown = showCollection(ctx, main, id, ver);
  else if (page === 'owner' && OWNER_NAME.test(name || '') && parts.length === 2) shown = showOwner(ctx, main, name);
  else if (page === 'verify' && parts.length === 1) shown = showVerify(ctx, main);
  else append(main, h('header', { class: 'page-head' }, h('h1', {}, 'No such page')),
    h('p', {}, 'The address names no page of the explorer. ', h('a', { href: pages.archive() }, 'The archive.')));
  document.title = `${page === '' ? '' : (name || page) + ' · '}${ctx.archive.name} · OpenSheaf Explorer`;
  window.scrollTo(0, 0);
  if (navigated) focusHeading(main, shown, ctx.signal);
  navigated = true;
}

let navigated = false;

function showOld(main) {
  append(main, h('header', { class: 'page-head' }, h('p', { class: 'kicker' }, 'OpenSheaf archive'),
    h('h1', {}, ctx.archive.name)),
    h('div', { class: 'alert bad', role: 'alert' }, h('strong', {}, 'Specification 0.1: this archive must be rebuilt. '),
      'Its discovery document is of version 0.1 of the specification, which version 0.2 replaces and is incompatible with ',
      '(section 16.1). The explorer reads only version 0.2: rebuild the archive with the tools of version 0.2 ',
      '(osheaf), and its objects can be explored and verified again.'));
}

async function focusHeading(main, shown, signal) {
  await Promise.resolve(shown).catch(() => {});
  const heading = main.querySelector('h1');
  if (signal.aborted || !heading) return;
  heading.setAttribute('tabindex', '-1');
  heading.focus({ preventScroll: true });
}

async function start() {
  const main = document.getElementById('main');
  const params = new URLSearchParams(location.search);
  let given = params.get('url');
  if (given) given = withScheme(given);
  if (params.has('open')) return showStart(main);
  clear(main, loading('Reading the archive…'));
  let found;
  try {
    found = given ? await locate(ctx.http, given) : { archive: await Archive.open(ctx.http, new URL('../', location.href).href), hash: null };
  } catch (error) {
    return showStart(main, given ? error : null, given || '');
  }
  ctx.archive = found.archive;
  ctx.resolver = new Resolver(ctx.http, ctx.archive);
  const collection = params.get('collection');
  if (!location.hash || location.hash === '#') {
    const hash = found.hash || (isObjectId(collection) || LABEL.test(collection || '') ? pages.collection(collection) : null);
    if (hash) history.replaceState(null, '', hash);
  }
  document.getElementById('archive-name').replaceChildren(h('a', { href: pages.archive() }, ctx.archive.name));
  document.getElementById('nav').hidden = false;
  addEventListener('hashchange', route);
  route();
}

start();
