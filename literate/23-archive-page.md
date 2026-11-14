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
    import { summary } from './summary.js';
    import { memberPins } from './versions.js';

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
readable before anything else is fetched. Then the summary of every
object is read, a few at a time, and each row is completed with the
title, creators and current version as the object's own descriptions
state them; the citations of the collection are not authoritative.

    // in the list of objects:
    function objectList(ctx) {
      const a = ctx.archive;
      const entries = a.objects();
      const rows = new Map();
      const list = h('ol', { class: 'objects' });
      const status = h('p', { class: 'muted small' });
      <<the controls of the list>>
      for (const entry of entries) {
        const row = objectRow(entry);
        rows.set(entry.id, row);
        list.append(row.el);
      }
      <<order the list by the main collection>>
      <<complete the rows with the summaries>>
      return section('Objects', controls, status, list);
    }

A row shows the title and creators (once known), the identifier, the
kind, the status, the head, the current document version, and the date
of first appearance. Its text, for the search, is kept up to date with
what it shows.

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
        meta.textContent = [s.documentVersion ? `version ${s.documentVersion}` : null, `head ${s.head ?? entry.head}`,
                            s.year ? String(s.year) : null].filter(Boolean).join(' · ');
        row.text = [entry.id, plain(s.title || ''), ...(s.creators || [])].join(' ');
      } };
      row.set({ head: entry.head });
      return row;
    }

The search matches every word typed, ignoring case and accents, against
the identifier, the title and the creators; the filters select a kind
and a status. Both apply at once, and the status line says how many
objects are shown.

    // in the controls of the list:
    const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const search = h('input', { type: 'search', placeholder: 'Search titles, authors, identifiers', 'aria-label': 'Search' });
    const kind = h('select', { 'aria-label': 'Kind' },
      h('option', { value: '' }, 'all kinds'), h('option', { value: 'document' }, 'documents'),
      h('option', { value: 'collection' }, 'collections'));
    const state = h('select', { 'aria-label': 'Status' },
      h('option', { value: '' }, 'any status'), h('option', { value: 'active' }, 'active'),
      h('option', { value: 'withdrawn' }, 'withdrawn'), h('option', { value: 'mirror' }, 'mirrors'));
    const filter = () => {
      const words = fold(search.value).split(/\s+/).filter(Boolean);
      let shown = 0;
      for (const row of rows.values()) {
        const e = row.entry;
        const ok = words.every((w) => fold(row.text).includes(w)) && (!kind.value || e.kind === kind.value) &&
          (!state.value || (state.value === 'mirror' ? Boolean(e.mirrorOf) : e.status === state.value));
        row.el.hidden = !ok;
        if (ok) shown++;
      }
      status.textContent = `${shown} of ${plural(rows.size, 'object')} shown`;
    };
    search.addEventListener('input', filter);
    kind.addEventListener('change', filter);
    state.addEventListener('change', filter);
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
            row.set({ title: m.cite.title, creators: m.cite.creators, year: m.cite.year, head: memberPins(m)[0]?.version });
          }
        }
        filter();
      }).catch(() => {});
    }

Then the summaries. They are requested all at once; the HTTP client lets a
few requests run at a time, and leaving the page cancels the rest. An
object whose summary cannot be read is marked, and the reason is in its
tooltip; its page will say more.

    // in complete the rows with the summaries:
    let loaded = 0;
    for (const row of rows.values()) {
      summary(ctx, row.entry.id).then((s) => {
        row.loaded = true;
        row.set({ title: s.title, creators: s.creators, documentVersion: s.kind === 'document' ? s.documentVersion : null,
                  head: s.inv.head, year: s.issued?.slice(0, 4) });
      }, (error) => {
        if (error?.kind === 'aborted') return;
        row.el.classList.add('unreadable');
        row.el.title = `cannot be read: ${error?.detail || error?.message || error}`;
      }).finally(() => {
        loaded++;
        status.dataset.loaded = loaded < rows.size ? `; descriptions read: ${loaded} of ${rows.size}` : '';
        filter();
        if (status.dataset.loaded) status.textContent += status.dataset.loaded;
      });
    }
