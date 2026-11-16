// Generated from literate/23-archive-page.md by opensheaf-literate: edit the document, not this file.
import { h, append, external, plural } from './dom.js';
import { rich, plain } from './text.js';
import { facts, chip, statusChip, section, jsonView, errorBox, pages, elsewhere } from './ui.js';
import { summary, rowSummary } from './summary.js';
import { memberPins } from './versions.js';
import { LIMITS } from './http.js';

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

function objectList(ctx) {
  const a = ctx.archive;
  const all = a.objects();
  const entries = all.slice(0, LIMITS.objects);
  const rows = new Map();
  const list = h('ol', { class: 'objects' });
  const status = h('p', { class: 'muted small' });
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
  for (const entry of entries) {
    const row = objectRow(entry);
    rows.set(entry.id, row);
    list.append(row.el);
  }
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
  const cut = all.length > entries.length
    ? h('p', { class: 'alert warn' }, `The discovery document lists ${all.length} objects; only the first ${entries.length} are shown.`) : null;
  return section('Objects', controls, cut, status, list);
}

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

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const frame = (f) => (globalThis.requestAnimationFrame ? requestAnimationFrame(f) : setTimeout(f, 0));

export const ROWS_AT_ONCE = 6;

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
