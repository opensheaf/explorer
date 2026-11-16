The page of an archive
======================

The first page shows what the discovery document says of the archive
(section 6.1), and the list of its objects, which a reader can search and
filter. The discovery document is a map, not a witness (section 6.1): the
page says so, and offers the verification, which checks what it states
against the storage root.

The module is `app/view-archive.js`.

    // in app/view-archive.js:
    import { h, append, external, plural } from './dom.js';
    import { rich, plain } from './text.js';
    import { facts, chip, statusChip, section, jsonView, errorBox, pages, elsewhere } from './ui.js';
    import { summary, rowSummary } from './summary.js';
    import { memberPins } from './versions.js';
    import { LIMITS } from './http.js';

    <<the facts of the discovery document>>

    <<the list of objects>>

    export function showArchive(ctx, root) {
      const a = ctx.archive;
      append(root,
        h('header', { class: 'page-head' },
          h('p', { class: 'kicker' }, 'OpenSheaf archive'),
          h('h1', {}, a.name),
          h('p', { class: 'lead' }, 'The discovery document lists ', plural(a.objects().length, 'object'),
            '. What it states is checked against the storage root by the ',
            h('a', { href: pages.verify() }, 'verification'), ' (section 14).')),
        archiveFacts(a),
        objectList(ctx));
    }

The facts
---------

The facts of the archive, as its discovery document gives them: its
identifier (which names it independently of where it is served, section
6.2), its base URL and storage root, its contact, the profiles it
declares, its main collection, the mirrors that hold complete copies of
it (each opens the explorer on that copy), its feed, keys and extensions;
then its tombstones (section 11.3), and the document itself.

    // in the facts of the discovery document:
    function archiveFacts(a) {
      const d = a.disc;
      const list = (x) => (Array.isArray(x) ? x : []);
      const tombstones = a.tombstones();
      return h('div', {},
        facts([
          ['Archive identifier', h('code', {}, String(d.archiveId ?? '?'))],
          ['Base URL', external(a.base)],
          ['Storage root', external(a.root)],
          ['Contact', typeof d.contact === 'string' ? external(d.contact) : null],
          ['Specification', `${d.specification ?? '?'} (format ${d.format ?? '?'})`],
          ['Profiles', list(d.profiles).length ? list(d.profiles).map((p) => chip(String(p))) : 'none'],
          ['Main collection', typeof d.mainCollection === 'string'
            ? h('a', { href: pages.collection(d.mainCollection) }, d.mainCollection) : null],
          ['Mirrors', list(d.mirrors).map((m) => h('div', {}, h('a', { href: elsewhere(m) }, m)))],
          ['Feed', typeof d.feed === 'string' ? external(d.feed) : null],
          ['Keys', list(d.keys).map((k) => h('div', {}, String(k?.type ?? '?'), ': ',
            k?.url ? external(k.url) : h('code', {}, String(k?.fingerprint ?? '')))) ],
          ['Extensions', list(d.extensions).map((e) => h('div', {}, external(String(e))))],
        ]),
        tombstones.length ? section('Tombstones',
          h('p', { class: 'muted' }, 'Objects taken down (section 11.2). Their identifiers are never reused, and pins to them are reported as removed.'),
          h('ul', { class: 'plain' }, tombstones.map((t) => h('li', {},
            h('code', {}, t.id), ` (${t.kind ?? '?'}, last version ${t.lastVersion ?? '?'}, ${t.date ?? '?'}): `,
            String(t.reason ?? ''))))) : null,
        jsonView('opensheaf.json', d, a.base + 'opensheaf.json'));
    }

The list of objects
-------------------

The list starts from the discovery document, which gives each object's
identifier, kind, head and status, and, for a mirror, the archive it
copies. The main collection, if there is one, gives at once the order of
presentation of the archive's documents (its order is authoritative,
section 10.2) and their cached citations (`cite`), so that the list is
readable before anything else is fetched. Then the row summary of every
object (see [the summaries](22-pieces.md)) is read, a few at a time, and
each row is completed with the title, creators and current version as
the object's own descriptions state them; the citations of the collection are not authoritative. A
discovery document listing more than `LIMITS.objects` objects has only
the first of them listed, and the page says so (section 15).

    // in the list of objects:
    function objectList(ctx) {
      const a = ctx.archive;
      const all = a.objects();
      const entries = all.slice(0, LIMITS.objects);
      const rows = new Map();
      const list = h('ol', { class: 'objects' });
      const status = h('p', { class: 'muted small' });
      <<the controls of the list>>
      for (const entry of entries) {
        const row = objectRow(entry);
        rows.set(entry.id, row);
        list.append(row.el);
      }
      <<complete the rows with the summaries>>
      <<order the list by the main collection>>
      const cut = all.length > entries.length
        ? h('p', { class: 'alert warn' }, `The discovery document lists ${all.length} objects; only the first ${entries.length} are shown.`) : null;
      return section('Objects', controls, cut, status, list);
    }

A row shows the title and creators (once known), the identifier, the
kind, the status, the head, the current document version, and the date
of first appearance. Until the object's own summary is read, a member of
the main collection shows its cached citation and the version the
collection pins, labelled as such ("pinned"), which may be earlier than
the head. Its text, for the search, is kept up to date with
what it shows, and folded (see below) once, when it changes, not at every
search: the list is filtered again each time a row is completed, and
folding the text of every row each time would make reading a list of
thousands of objects take a time growing as the square of their number.

    // in the list of objects:
    function objectRow(entry) {
      const isCollection = entry.kind === 'collection';
      const href = isCollection ? pages.collection(entry.id) : pages.object(entry.id);
      const title = h('a', { class: 'title', href }, entry.id);
      const creators = h('span', { class: 'creators' });
      const meta = h('span', { class: 'meta' });
      const el = h('li', { class: 'object' },
        h('div', { class: 'main' }, title, creators),
        h('div', { class: 'side' },
          h('code', { class: 'id' }, entry.id), ' ',
          chip(entry.kind ?? '?'), ' ', statusChip(entry.status),
          entry.mirrorOf ? [' ', chip('mirror', 'warn')] : null, ' ', meta));
      const row = { el, entry, text: entry.id, set(s) {
        title.replaceChildren(...rich(s.title || entry.id));
        creators.textContent = s.creators?.length ? s.creators.join('; ') : '';
        meta.textContent = [s.documentVersion ? `version ${s.documentVersion}` : null,
                            s.pinned ? `pinned ${s.pinned}` : `head ${s.head ?? entry.head}`,
                            s.year ? String(s.year) : null].filter(Boolean).join(' · ');
        row.text = [entry.id, plain(s.title || ''), ...(s.creators || [])].join(' ');
        row.folded = fold(row.text);
      } };
      row.set({ head: entry.head });
      return row;
    }

The search matches every word typed, ignoring case and accents, against
the identifier, the title and the creators; the filters select a kind
and a status. Both apply at once, and the status line says how many
objects are shown, and how many rows are completed. The list is filtered
when the reader types or chooses, and when a row is completed; the
filtering asked for in the meantime is done once, at the next frame
drawn (with a timer where there are no frames, as in the tests).

    // in the list of objects:
    const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const frame = (f) => (globalThis.requestAnimationFrame ? requestAnimationFrame(f) : setTimeout(f, 0));

The controls, and the filtering:

    // in the controls of the list:
    const search = h('input', { type: 'search', placeholder: 'Search titles, authors, identifiers', 'aria-label': 'Search' });
    const kind = h('select', { 'aria-label': 'Kind' },
      h('option', { value: '' }, 'all kinds'), h('option', { value: 'document' }, 'documents'),
      h('option', { value: 'collection' }, 'collections'));
    const state = h('select', { 'aria-label': 'Status' },
      h('option', { value: '' }, 'any status'), h('option', { value: 'active' }, 'active'),
      h('option', { value: 'withdrawn' }, 'withdrawn'), h('option', { value: 'mirror' }, 'mirrors'));
    let loaded = 0;
    const filter = () => {
      const words = fold(search.value || '').split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const row of rows.values()) {
        const e = row.entry;
        const ok = words.every((w) => row.folded.includes(w)) && (!kind.value || e.kind === kind.value) &&
          (!state.value || (state.value === 'mirror' ? Boolean(e.mirrorOf) : e.status === state.value));
        row.el.hidden = !ok;
        if (ok) shown++;
      }
      status.textContent = `${shown} of ${plural(rows.size, 'object')} shown` +
        (loaded < rows.size ? `; descriptions read: ${loaded} of ${rows.size}` : '');
    };
    let pending = false;
    const later = () => {
      if (pending) return;
      pending = true;
      frame(() => { pending = false; filter(); });
    };
    search.addEventListener('input', later);
    kind.addEventListener('change', later);
    state.addEventListener('change', later);
    const controls = h('div', { class: 'controls' }, search, kind, state);

The main collection is read through its summary; its members of this
archive are put first, in its order, with their cached citations, and the
other objects follow in the order of the discovery document. If the main
collection cannot be read, the list stays in the order of the discovery
document.

    // in order the list by the main collection:
    const main = a.disc.mainCollection;
    filter();
    if (typeof main === 'string' && rows.has(main)) {
      summary(ctx, main).then(async (s) => {
        const mem = await a.json(main, s.inv, s.inv.head, 'members.json', { signal: ctx.signal });
        const members = (Array.isArray(mem?.members) ? mem.members : []).filter((m) => m?.archive === a.archiveId);
        for (const m of [...members].reverse()) {
          const row = rows.get(m.id);
          if (!row) continue;
          list.prepend(row.el);
          if (!row.loaded && m.cite) {
            const pins = memberPins(m);
            row.set({ title: m.cite.title, creators: m.cite.creators, year: m.cite.year, pinned: pins[pins.length - 1]?.version });
          }
        }
        reorder();
        later();
      }).catch(() => {});
    }

Then the row summaries. They are read a few at a time (`ROWS_AT_ONCE`,
as many as the requests the HTTP client lets run at once), in the order
of the list, so that the first rows, those the reader sees, are
completed first; when the main collection reorders the list, the rows
not yet started are taken in the new order. Requesting them all at once
would queue the requests of every object in the HTTP client, mixed, and
the first screen would be completed last. Leaving the page stops the
reading: the rows not started are not read. An object whose summary
cannot be read is marked, and the reason is in its tooltip; its page
will say more.

    // in the list of objects:
    export const ROWS_AT_ONCE = 6;

The reading itself:

    // in complete the rows with the summaries:
    const signal = ctx.signal;
    const rowOf = new Map([...rows.values()].map((row) => [row.el, row]));
    let queue = [...rows.values()];
    let next = 0;
    const reorder = () => {
      queue = [...list.childNodes].map((el) => rowOf.get(el)).filter((row) => row && !row.started);
      next = 0;
    };
    const read = async (row) => {
      try {
        const s = await rowSummary(ctx, row.entry.id, signal);
        row.loaded = true;
        row.set({ title: s.title, creators: s.creators, documentVersion: s.kind === 'document' ? s.documentVersion : null,
                  head: s.inv.head, year: s.issued?.slice(0, 4) });
      } catch (error) {
        if (error?.kind === 'aborted') return;
        row.el.classList.add('unreadable');
        row.el.title = `cannot be read: ${error?.detail || error?.message || error}`;
      }
      loaded++;
      later();
    };
    const worker = async () => {
      while (!signal?.aborted && next < queue.length) {
        const row = queue[next++];
        if (row.started) continue;
        row.started = true;
        await read(row);
      }
    };
    for (let k = 0; k < ROWS_AT_ONCE; k++) worker();
