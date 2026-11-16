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

The message shown while a page is read is a live region, which a screen
reader announces when it changes, without interrupting the reader.

    // in notes, JSON and errors:
    export function loading(text = 'Loading…') {
      return h('p', { class: 'loading', role: 'status', 'aria-live': 'polite' }, text);
    }

Summaries of objects
--------------------

Several pages need, for an object, its inventory, the `object.json` of
every version, its history and current version, and the two descriptions
of the version presented: the current version of a document, the head of
a collection (section 7.3: "landing pages, indexes and citations use the
current version, not the head"). This is its *summary*, read once per
object and kept by the explorer's context (`ctx`, see
[the application](30-app.md)).

A summary is loaded with the signal of the page that asks for it, so that
leaving the page stops it. A summary being loaded is therefore shared only
with callers of the same page (the same signal): when the reader moves to
another page, the old page's signal is aborted and the new page starts at
once, before the old loading has even failed; it must not be handed that
doomed loading, and starts its own. The requests are not made twice: the
[HTTP client](10-http.md) shares those in progress, and aborts one only
when all its callers have left. A summary that fails, or is aborted, is
forgotten, so that it is tried again on the next visit.

The summaries loaded are kept for the session, but not all of them: an
archive of thousands of objects would otherwise keep thousands of
inventories and descriptions in memory. The context keeps the
`SUMMARIES` most recently used (a `Map`, whose order is the order of
use: a summary used is moved to its end); past that number, the least
recently used are forgotten, except those still loading, which their pages
are waiting for.

    // in app/summary.js:
    import { titleOf, creatorsOf, dateOf, rolesOf, versionsOf, currentVersion } from './versions.js';

    export const SUMMARIES = 500;

    function kept(ctx, key, signal, load) {
      const known = ctx.summaries.get(key);
      if (known && (known.done || known.signal === signal)) {
        ctx.summaries.delete(key);
        ctx.summaries.set(key, known);
        return known.loading;
      }
      const entry = { signal, done: false };
      entry.loading = load();
      ctx.summaries.set(key, entry);
      entry.loading.then(() => { entry.done = true; }, () => {
        if (ctx.summaries.get(key) === entry) ctx.summaries.delete(key);
      });
      const limit = ctx.summaryLimit ?? SUMMARIES;
      for (const [k, e] of ctx.summaries) {
        if (ctx.summaries.size <= limit) break;
        if (e.done) ctx.summaries.delete(k);
      }
      return entry.loading;
    }

    export function summary(ctx, id, signal = ctx.signal) {
      return kept(ctx, id, signal, () => load(ctx.archive, id, { signal }));
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

The list of the archive's objects shows, for each object, only part of
its summary: the title, the creators, the date and the document version
of the version presented, the kind and the head. Reading the whole
summary of every object would read the `object.json` of every object
version: some two thousand requests for an archive of three hundred
objects of five versions each. A *row summary* reads only what the row
shows, when that is enough to know the current version: the inventory,
the `object.json` of the head and, when it has `history`, the
descriptions of the last entry of that history, which is the current
version (section 7.3). Without `history`, the current version is the
last object version of the highest document version, which only the
`object.json` of every version tells; the row summary is then the whole
summary, read as before. A whole summary already known is used as it is.
So the values a row shows are those the whole summary gives, read in
four requests (or fewer) for an object with `history`, instead of one per
object version.

The head is read as the whole summary reads it: an `object.json` that
cannot be read, or a head that is not one of the object versions, is
left to the whole summary. Row summaries are kept with the summaries,
under a key that is not an identifier.

    // in app/summary.js:
    export function rowSummary(ctx, id, signal = ctx.signal) {
      const whole = ctx.summaries.get(id);
      if (whole?.done) return summary(ctx, id, signal);
      return kept(ctx, `row ${id}`, signal, () => loadRow(ctx, id, signal));
    }

    async function loadRow(ctx, id, signal) {
      const archive = ctx.archive;
      const options = { signal };
      const inv = await archive.inventory(id, null, options);
      let head = null;
      if (versionsOf(inv).includes(inv.head)) {
        head = await archive.json(id, inv, inv.head, 'object.json', options).catch((error) => {
          if (error?.kind === 'aborted') throw error;
          return null;
        });
      }
      if (!Array.isArray(head?.history) || !head.history.length) return summary(ctx, id, signal);
      const current = currentVersion(inv, (v) => (v === inv.head ? head : null), inv.head);
      const shown = head.kind === 'collection' ? inv.head : current;
      const { obj, dc } = await archive.descriptions(id, inv, shown, options);
      return {
        id, inv, current, head, shown, obj, dc, row: true,
        kind: head.kind ?? null, status: head.status ?? null,
        title: titleOf(dc), creators: creatorsOf(dc),
        issued: dateOf(dc, 'Issued', 'Available', 'Created'),
        documentVersion: obj?.documentVersion ?? null,
      };
    }
