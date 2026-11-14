Pieces of pages
===============

The pages of the explorer (the archive, an object, a collection, the
verification) are built from a few common pieces: a list of facts, chips
for statuses, a view of a JSON file, a box explaining an error, a note
with its file, a reference to a section of the specification; and from a
*summary* of each object, read once and shared by the pages. The pieces
are in `app/ui.js`, the summaries in `app/summary.js`.

    // in app/ui.js:
    import { h, external } from './dom.js';
    import { rich } from './text.js';
    import { explain } from './http.js';

    <<addresses of the pages of the explorer>>

    <<lists of facts and chips>>

    <<notes, JSON and errors>>

Addresses of the pages
----------------------

A page of the explorer is named by the fragment of its address (`#/`,
`#/object/<id>`, `#/object/<id>/<version>`, `#/collection/<id>`,
`#/verify`), so that every state worth sharing is a link; the archive is
named by the query (`?url=<base URL>`). A link to an object of another
archive opens the explorer on that archive.

    // in addresses of the pages of the explorer:
    export const SPECIFICATION = 'https://opensheaf.org/opensheaf-specification-0.1.html';

    export const pages = {
      archive: () => '#/',
      object: (id, ver) => `#/object/${encodeURIComponent(id)}${ver ? '/' + encodeURIComponent(ver) : ''}`,
      collection: (id, ver) => `#/collection/${encodeURIComponent(id)}${ver ? '/' + encodeURIComponent(ver) : ''}`,
      verify: () => '#/verify',
    };

    export function elsewhere(url, hash = '') {
      return `?url=${encodeURIComponent(url)}${hash}`;
    }

    export function sectionRef(section) {
      return h('a', { class: 'section-ref', href: SPECIFICATION, target: '_blank', rel: 'noopener',
                      title: `section ${section} of the specification` }, `§ ${section}`);
    }

Facts and chips
---------------

Facts are pairs of a label and a value, shown as a description list;
facts without a value are left out, so that a page can list every fact it
knows of and show those the archive gives. A chip is a short label with a
tone: `ok`, `bad`, `warn`, or neutral.

    // in lists of facts and chips:
    export function facts(rows) {
      const shown = rows.filter((r) => r && r[1] !== null && r[1] !== undefined && r[1] !== '' &&
                                       !(Array.isArray(r[1]) && r[1].length === 0));
      return h('dl', { class: 'facts' }, shown.map(([label, value]) => [h('dt', {}, label), h('dd', {}, value)]));
    }

    export function chip(text, tone = '') {
      return h('span', { class: `chip ${tone}` }, text);
    }

    export function statusChip(status) {
      if (status === 'withdrawn') return chip('withdrawn', 'bad');
      if (status === 'active') return chip('active', 'ok');
      return status ? chip(String(status), 'warn') : null;
    }

    export function section(title, ...content) {
      return h('section', { class: 'block' }, h('h2', {}, title), ...content);
    }

Notes, JSON and errors
----------------------

A note (section 9) has a text, a file of the content, or both; the text
is shown with its mathematics, the file as a link, which the page gives
as a function from logical paths to addresses (the file is in the same
object version as the note).

    // in notes, JSON and errors:
    export function noteView(note, fileUrl) {
      if (!note || typeof note !== 'object') return null;
      const file = typeof note.path === 'string' ? fileUrl?.(note.path) : null;
      return h('span', { class: 'note' }, rich(note.text),
        note.path ? [note.text ? ' ' : '', file ? external(file, `[${note.path}]`) : `[${note.path}]`] : null);
    }

A JSON file is shown as it was read, indented, in a closed box that opens
on demand: the descriptions are the authoritative record, and a reader
should be able to see them whole. The text is put in a `pre` as text.

    // in notes, JSON and errors:
    export function jsonView(label, value, url = null) {
      return h('details', { class: 'json' },
        h('summary', {}, label, url ? [' ', h('span', { class: 'muted' }, '(', external(url, 'raw'), ')')] : null),
        h('pre', {}, JSON.stringify(value, null, 2)));
    }

An error is shown with what was being done, the reason, the address, and
the explanation of [the HTTP client](10-http.md): above all the
explanation of cross-origin requests, which is the most common reason why
an archive cannot be explored from another site.

    // in notes, JSON and errors:
    export function errorBox(what, error) {
      const why = explain(error);
      return h('div', { class: 'error-box', role: 'alert' },
        h('p', {}, h('strong', {}, what), ' ', error?.detail || error?.message || String(error)),
        error?.url ? h('p', { class: 'muted url' }, error.url) : null,
        why ? h('p', {}, why) : null);
    }

    export function loading(text = 'Loading…') {
      return h('p', { class: 'loading' }, text);
    }

Summaries of objects
--------------------

Several pages need, for an object, its inventory, the `object.json` of
every version, its history and current version, and the two descriptions
of the version presented: the current version of a document, the head of
a collection (section 7.3: "landing pages, indexes and citations use the
current version, not the head"). This is its *summary*, read once per
object and kept by the explorer's context (`ctx`, see
[the application](30-app.md)). A summary that fails to load is forgotten,
so that it is tried again on the next visit.

    // in app/summary.js:
    import { titleOf, creatorsOf, dateOf, rolesOf } from './versions.js';

    export function summary(ctx, id) {
      if (!ctx.summaries.has(id)) {
        const loading = load(ctx.archive, id, { signal: ctx.signal });
        ctx.summaries.set(id, loading);
        loading.catch(() => ctx.summaries.delete(id));
      }
      return ctx.summaries.get(id);
    }

    async function load(archive, id, options) {
      const { inv, objs, hist, current } = await archive.history(id, null, options);
      const head = objs.get(inv.head) || null;
      const shown = head?.kind === 'collection' ? inv.head : current;
      const { obj, dc } = await archive.descriptions(id, inv, shown, options);
      return {
        id, inv, objs, hist, current, head, shown, obj, dc,
        objOf: (v) => objs.get(v) ?? null,
        roles: rolesOf(inv, (v) => objs.get(v) ?? null),
        kind: head?.kind ?? null, status: head?.status ?? null,
        title: titleOf(dc), creators: creatorsOf(dc),
        issued: dateOf(dc, 'Issued', 'Available', 'Created'),
        documentVersion: obj?.documentVersion ?? null,
      };
    }
