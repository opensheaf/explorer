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
   (`.../ocfl/<id>/<version>/`), which opens that version. With
   `&collection=<id>` it opens a collection. Without a value, it shows a
   form.
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
`#/object/<id>`, `#/object/<id>/<version>`, `#/collection/<id>`,
`#/collection/<id>/<version>`, `#/verify`. With the query, it makes every
state shareable as a link.

The page
--------

The page is a frame: a header with the name of the explorer and of the
archive and the links to the pages, the main part, which the module
fills, and a footer with the warning that the specification is a draft.
Its content security policy is a second line of defence behind the rule
of [building pages from untrusted data](20-dom.md): no script but the explorer's own, no inline
script or style, no plugin, no images from elsewhere; requests (to read
archives) may go anywhere.

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
      <p><strong>Draft.</strong> OpenSheaf 0.1 is a draft specification: until version 1.0, a revision may change
      the format in incompatible ways, and the explorer follows the latest draft.</p>
      <p><a href="https://opensheaf.org/opensheaf-specification-0.1.html">The specification</a> ·
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
    import { Archive } from './archive.js';
    import { Resolver } from './resolve.js';
    import { fetchSchemas } from './schema.js';
    import { h, append, clear } from './dom.js';
    import { errorBox, loading, pages, elsewhere } from './ui.js';
    import { isObjectId, isVersion } from './paths.js';
    import { showArchive } from './view-archive.js';
    import { showObject } from './view-object.js';
    import { showCollection } from './view-collection.js';
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
opened), the summaries of objects, the schemas (read once, when a
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

An address of an object version, `<storageRoot><id>/<version>/` (with or
without `inventory.json`), does not say where the archive's base URL is:
the storage root is usually `ocfl/` under it, but section 6.1 allows any
storage root. The explorer tries the storage root itself and the two
folders above it, and takes the first whose discovery document names
exactly that storage root. Any other address is taken as the base URL of
an archive.

    // in finding the archive from an address:
    export async function locate(http, input) {
      const url = new URL(input, location.href);
      const m = /^(.*\/)([a-z0-9]+(?:-[a-z0-9]+)*)\/(v[1-9][0-9]*)\/?(?:inventory\.json)?$/.exec(url.origin + url.pathname);
      if (m) {
        const [, root, id, ver] = m;
        let dir = root;
        for (let k = 0; k < 3; k++) {
          try {
            const archive = await Archive.open(http, dir);
            if (archive.root === root) return { archive, hash: pages.object(id, ver) };
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
requests and the advice to self-host.

    // in the start page:
    const EXAMPLE = 'https://mgubi.org/papers/';
    const EXAMPLE_NAME = 'Papers of Massimiliano Gubinelli';

    function showStart(main, error = null, given = '') {
      const url = h('input', { type: 'text', inputmode: 'url', name: 'url', required: true, value: given || null,
                               placeholder: 'https://example.org/papers/', 'aria-label': 'Address of an archive' });
      const collection = h('input', { type: 'text', name: 'collection', pattern: '[a-z0-9]+(-[a-z0-9]+)*',
                                      placeholder: 'collection identifier (optional)', 'aria-label': 'Collection' });
      const here = location.origin + location.pathname;
      clear(main,
        h('header', { class: 'page-head' },
          h('h1', {}, 'OpenSheaf Explorer'),
          h('p', { class: 'lead' }, 'Explore and verify ', h('a', { href: 'https://opensheaf.org' }, 'OpenSheaf'),
            ' archives and collections in your browser: documents with every version, their descriptions and files, ',
            'collections across archives, and the checks of the specification, from the files any reader can fetch.')),
        error ? errorBox(`Cannot open ${given}:`, error) : null,
        h('form', { class: 'open', method: 'get', action: '' },
          h('label', {}, 'The address of an archive (its base URL, where opensheaf.json is), or of an object version'), url,
          collection, h('button', { type: 'submit', class: 'primary' }, 'Explore')),
        h('p', { class: 'example' }, 'For example, the first OpenSheaf archive: ',
          h('a', { href: elsewhere(EXAMPLE) }, h('strong', {}, EXAMPLE_NAME)),
          ' (', h('code', {}, EXAMPLE.replace(/^https:\/\//, '')), ').'),
        h('section', { class: 'block' }, h('h2', {}, 'Three ways to use it'),
          h('ol', {},
            h('li', {}, h('strong', {}, 'A link. '), 'Give the archive in the address: ',
              h('code', {}, `${here}?url=<base URL>`), ', with ', h('code', {}, '#/object/<id>'), ', ',
              h('code', {}, '#/collection/<id>'), ' or ', h('code', {}, '#/verify'), ' to open a page.'),
            h('li', {}, h('strong', {}, 'A button on an archive’s pages. '), 'Add ',
              h('code', {}, `<script src="${new URL('embed.js', here).href}" data-archive="./"></script>`),
              ': it adds a link “Explore this archive”, for the archive at data-archive, relative to the page.'),
            h('li', {}, h('strong', {}, 'A copy in the archive. '), 'Copy the explorer’s files into the archive’s site, ',
              'for instance as explorer/ next to opensheaf.json: opened there, it explores the archive above it, ',
              'with no cross-origin requests, which also works for hosts that do not allow them.'))));
    }

The pages and the fragment
--------------------------

The fragment names the page; the identifiers and versions it names are
checked before anything is fetched. Each new page aborts the requests of
the one before, and gets a fresh signal. Summaries are kept across pages;
those whose loading was aborted are forgotten (see
[the summaries](22-pieces.md)), and read again when needed.

    // in the pages and the fragment:
    let controller = null;

    function route() {
      const main = document.getElementById('main');
      controller?.abort();
      controller = new AbortController();
      ctx.signal = controller.signal;
      let parts;
      try {
        parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
      } catch {
        parts = ['?'];
      }
      const [page = '', id, ver] = parts;
      clear(main);
      for (const a of document.querySelectorAll('#nav a')) a.classList.toggle('current', a.dataset.page === (page || 'archive'));
      const valid = isObjectId(id) && (ver === undefined || isVersion(ver)) && parts.length <= 3;
      if (page === '') showArchive(ctx, main);
      else if (page === 'object' && valid) showObject(ctx, main, id, ver);
      else if (page === 'collection' && valid) showCollection(ctx, main, id, ver);
      else if (page === 'verify' && parts.length === 1) showVerify(ctx, main);
      else append(main, h('p', {}, 'There is no such page. ', h('a', { href: pages.archive() }, 'The archive.')));
      document.title = `${page === '' ? '' : (id || page) + ' · '}${ctx.archive.name} · OpenSheaf Explorer`;
      window.scrollTo(0, 0);
    }

Starting
--------

At start, the explorer reads the query. `?open` shows the start page
(the link "Open another" of a self-hosted copy, which would otherwise
open its own archive again). With `?url=`, the archive is found, and a
collection or object version named by the query becomes the fragment, if
the fragment names no page yet. Without it, the archive one folder up is
tried, which is how a self-hosted copy finds its archive; failing that,
the start page is shown. An address typed without its scheme
(`mgubi.org/papers/`) is taken as `https:`.

    // in starting the explorer:
    async function start() {
      const main = document.getElementById('main');
      const params = new URLSearchParams(location.search);
      let given = params.get('url');
      if (given && !/^[a-z][a-z0-9+.-]*:/i.test(given) && /^[^/]+\.[^/]+/.test(given)) given = 'https://' + given;
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
        const hash = found.hash || (isObjectId(collection) ? pages.collection(collection) : null);
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
Optional attributes: `data-object` or `data-collection` (an identifier: the
link opens that page), `data-verify` (the link opens the verification),
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
      var id = /^[a-z0-9]+(-[a-z0-9]+)*$/;
      var explorer = new URL('./', script.src).href;
      var archive = new URL(attr('archive') || './', document.baseURI).href;
      var hash = '';
      if (attr('object') && id.test(attr('object'))) hash = '#/object/' + attr('object');
      else if (attr('collection') && id.test(attr('collection'))) hash = '#/collection/' + attr('collection');
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
