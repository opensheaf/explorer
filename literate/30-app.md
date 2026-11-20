The application
===============

The explorer is one page, `index.html`, which loads the module
`app/main.js`; the module finds the archive to explore, and draws the page
asked for by the fragment of the address. There is no build step and no
framework: the browser loads the modules as they are in the repository.

There are three ways to reach an archive, and they decide how the archive
is found:

1. **Standalone.** The hosted explorer, at
   `https://opensheaf.org/explorer/`, is given the archive in its address:
   `?url=https://mgubi.org/papers/`. The value may be the base URL of an
   archive (the folder holding `opensheaf.json`), the address of
   `opensheaf.json` itself, or the address of an object version
   (`.../ocfl/<owner>/<name>/<version>/` in the owner-name layout, or the
   hashed path), which opens that version. With `&collection=<label>` it
   opens a collection. Without a value, it shows a form.
2. **From an archive's own pages.** A page links to the hosted explorer
   with its archive in `?url=`, or loads `embed.js`, which adds such a
   link, resolving the archive's address relative to the page (see
   below).
3. **Self-hosted.** The explorer's files are copied into the archive's
   site (for instance as `explorer/`, next to `opensheaf.json`). Without
   `?url=`, the explorer then opens the archive one folder up, `../`, if
   there is one there. Every request is then same-origin, which also
   serves archives whose host does not allow cross-origin requests.

A page of the explorer is named by the fragment: `#/` (the archive),
`#/object/<line>`, `#/object/<line>/<version>`, `#/collection/<line>`,
`#/collection/<line>/<version>`, `#/owner/<owner name>`, `#/verify`,
where a line is named by its label in the archive or by its identifier
(chapter [22](22-pieces.md)). With the query, it makes every state
shareable as a link.

An archive of version 0.1 of the specification is not read (version 0.2
is incompatible with it, section 16.1): the explorer says that it must be
rebuilt, and shows nothing else of it.

The page
--------

The page is a frame: a header with the name of the explorer and of the
archive and the links to the pages, the main part, which the module
fills, and a footer with the warning that the specification is a draft.
Its content security policy is a second line of defence behind the rule
of [building pages from untrusted data](20-dom.md): no script but the explorer's own, no inline
script or style, no plugin, no images from elsewhere; requests (to read
archives) may go anywhere. Besides the module, the head loads the
[theme button](31-style.md), a small classic script run
before the page is painted.

    <!-- in index.html: -->
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src *; object-src 'none'; base-uri 'none'; form-action 'self'">
    <meta name="referrer" content="no-referrer">
    <title>OpenSheaf Explorer</title>
    <meta name="description" content="Explore and verify OpenSheaf archives and collections in the browser.">
    <link rel="icon" href="opensheaf-symbol.svg" type="image/svg+xml">
    <link rel="stylesheet" href="style.css">
    <script src="app/theme.js"></script>
    <script type="module" src="app/main.js"></script>
    </head>
    <body>
    <header class="site">
      <a class="brand" href="./"><img class="symbol" src="opensheaf-symbol.svg" alt="" width="22" height="22">OpenSheaf Explorer</a>
      <span id="archive-name" class="archive-name"></span>
      <nav id="nav" class="nav" hidden>
        <a href="#/" data-page="archive">Objects</a>
        <a href="#/verify" data-page="verify">Verify</a>
        <a href="?open" data-page="open">Open another</a>
      </nav>
    </header>
    <main id="main">
    <noscript><p>The OpenSheaf Explorer is a JavaScript application: it needs JavaScript to read archives.</p></noscript>
    </main>
    <footer class="site">
      <p><strong>Draft.</strong> OpenSheaf 0.2 is a draft specification: until version 1.0, a revision may change
      the format in incompatible ways, and the explorer follows the latest draft.</p>
      <p><a href="https://opensheaf.org/opensheaf-specification-0.2.html">The specification</a> ·
      <a href="source/">The explorer, a literate program</a> ·
      <a href="https://github.com/opensheaf/explorer">Source code</a> (GPL-3.0-or-later) ·
      The OpenSheaf symbol is licensed under CC BY 4.0.</p>
    </footer>
    </body>
    </html>

The module
----------

    // in app/main.js:
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

    <<the context of the explorer>>

    <<finding the archive from an address>>

    <<the start page>>

    <<the pages and the fragment>>

    <<starting the explorer>>

The context
-----------

The context is what the pages share: the HTTP client (with its kept
answers), the archive, the resolver of members (with the archives it has
opened), the summaries of objects (the most recently used, see
[the summaries](22-pieces.md)), the schemas (read once, when a
verification first needs them), the verification in progress, and the
`signal` of the page shown, which is aborted when the reader goes to
another page, so that its pending requests stop.

    // in the context of the explorer:
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

Finding the archive
-------------------

An address of an object version, `<storageRoot><path>/<version>/` (with
or without `inventory.json`), does not say where the archive's base URL
is, nor which object it is: the storage root is usually `ocfl/` under the
base URL, but section 3.1 allows any storage root, and the path of an
object has two segments in the owner-name layout and four in the hashed
layout (section 3.2), which are never decoded. The explorer tries the
folders above the object, up to six levels, and takes the first whose
discovery document lists an object at exactly that address. Any other
address is taken as the base URL of an archive.

    // in finding the archive from an address:
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

The start page
--------------

Without an archive, the explorer shows a form for its address, an
example (the first OpenSheaf archive, the papers of the editor of the
specification), the three ways of using the explorer, and, if an address was
given and could not be read, why, with the explanation of cross-origin
requests and the advice to self-host. The visible label of the address is
the label of its field (`for`), so that a screen reader announces it and
a click on it focuses the field.

    // in the start page:
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

The pages and the fragment
--------------------------

The fragment names the page; the identifiers, labels, owner names and
versions it names are checked before anything is fetched, and a label is
read as the line the discovery document gives it. Each new page aborts the requests of
the one before, and gets a fresh signal; the new page starts at once,
while the old one's requests are still being aborted. Requests and
summaries that the old page had started are therefore never handed to
the new one: a request shared with the new page goes on, one used only by
the old page is aborted and forgotten (see [the HTTP client](10-http.md)),
and a summary being loaded for the old page is replaced by one for the
new page (see [the summaries](22-pieces.md)). Summaries loaded are kept
across pages. Each page starts a new budget of requests and bytes (see
[the limits](10-http.md)).

A page reached by a link replaces the one before, and the element that
had the focus (the link clicked) is gone with it: a screen reader would
be left at the start of the document, or nowhere. After such a
navigation, the focus is moved to the heading of the new page, which is
made focusable for this (`tabindex` -1: it can be focused, but is not a
stop of the tab key), once the page has drawn it: the pages that read
the archive first draw their heading after (their function returns when
they are drawn). A page left before then is not focused. The first page
shown, when the explorer starts, is not focused: the reader has not
moved yet. An address that names no page also gets a heading.

    // in the pages and the fragment:
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

Starting
--------

At start, the explorer reads the query. `?open` shows the start page
(the link "Open another" of a self-hosted copy, which would otherwise
open its own archive again). With `?url=`, the archive is found, and a
collection or object version named by the query becomes the fragment, if
the fragment names no page yet. Without it, the archive one folder up is
tried, which is how a self-hosted copy finds its archive; failing that,
the start page is shown. An archive of version 0.1 is opened only to say
that it must be rebuilt. An address typed without its scheme
(`mgubi.org/papers/`, `localhost:8000/papers/`) is completed as
[the base URL](14-archive.md) explains: `http:` for the reader's own
computer, `https:` otherwise.

    // in starting the explorer:
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

Embedding
---------

`embed.js` is a small classic script (not a module, so that it can find
itself with `document.currentScript`) for an archive's own pages:

```
<script src="https://opensheaf.org/explorer/embed.js" data-archive="./"></script>
```

It adds, after itself, a link to the explorer it was loaded from, opening
the archive at `data-archive`, resolved against the page (`./` for a page
next to `opensheaf.json`, `../../` for a landing page `paper/<id>/`).
Optional attributes: `data-object` or `data-collection` (a label, or an
identifier `sheaf:<name>:<owner>`: the link opens that page),
`data-owner` (an owner name: the link opens the page of the owner),
`data-verify` (the link opens the verification),
`data-label` (the text of the link), `data-target` (the identifier of an
element to put the link in), `data-unstyled` (no style of its own, for
pages that style the class `opensheaf-explore` themselves). Loaded from a
self-hosted copy, it links to that copy.

    // in embed.js:
    (function () {
      'use strict';
      var script = document.currentScript;
      if (!script) return;
      var attr = function (name) { return script.getAttribute('data-' + name); };
      var id = /^([a-z0-9]+(-[a-z0-9]+)*|sheaf:[a-z2-7]{52}:[a-z2-7]{51}[aq])$/;
      var owner = /^[a-z2-7]{51}[aq]$/;
      var explorer = new URL('./', script.src).href;
      var archive = new URL(attr('archive') || './', document.baseURI).href;
      var hash = '';
      if (attr('object') && id.test(attr('object'))) hash = '#/object/' + encodeURIComponent(attr('object'));
      else if (attr('collection') && id.test(attr('collection'))) hash = '#/collection/' + encodeURIComponent(attr('collection'));
      else if (attr('owner') && owner.test(attr('owner'))) hash = '#/owner/' + attr('owner');
      else if (script.hasAttribute('data-verify')) hash = '#/verify';
      var link = document.createElement('a');
      link.href = explorer + '?url=' + encodeURIComponent(archive) + hash;
      link.textContent = attr('label') || 'Explore this archive';
      link.className = 'opensheaf-explore';
      if (!script.hasAttribute('data-unstyled')) {
        var s = link.style;
        s.display = 'inline-block';
        s.padding = '0.3em 0.8em';
        s.border = '1px solid currentColor';
        s.borderRadius = '4px';
        s.textDecoration = 'none';
        s.font = 'inherit';
      }
      var target = attr('target') && document.getElementById(attr('target'));
      if (target) target.appendChild(link);
      else script.parentNode.insertBefore(link, script.nextSibling);
    })();
