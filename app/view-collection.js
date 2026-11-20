// Generated from literate/25-collection-page.md by opensheaf-literate: edit the document, not this file.
import { h, append, clear, digest, doiLink, plural } from './dom.js';
import { rich } from './text.js';
import { facts, chip, statusChip, verdictChip, section, jsonView, errorBox, loading, pages, elsewhere, ref } from './ui.js';
import { summary } from './summary.js';
import { versionsOf, titleOf, creatorsOf, memberPins } from './versions.js';
import { Budget, presentedPin } from './resolve.js';
import { objectId, isObject } from './names.js';
import { versionNumber } from './paths.js';
import { explain, LIMITS } from './http.js';

const KINDS = {
  catalogue: 'A catalogue: it keeps lines whole, each member pinned with all its versions up to the pinned one (section 8.1).',
  selection: 'A selection: it vets particular versions; each member pins a revision set, and only those revisions belong to it (section 8.1).',
};

export async function showCollection(app, root, id, ver) {
  const ctx = Object.create(app, { signal: { value: app.signal } });
  const a = ctx.archive;
  const options = { signal: ctx.signal };
  const wait = root.appendChild(loading());
  let s, shown, obj, dc, mem;
  try {
    await a.locate(id);
    s = await summary(ctx, id);
    if (ver && !Object.hasOwn(s.inv.versions, ver)) throw new Error(`${id} has no object version ${ver}`);
    shown = ver || s.latest || s.inv.head;
    ({ obj, dc } = await a.descriptions(id, s.inv, shown, options));
    if (obj?.kind !== 'collection') {
      wait.replaceWith(h('p', {}, `${id} is not a collection. `, h('a', { href: pages.object(ref(a, id), ver) }, 'Its page.')));
      return;
    }
    mem = await a.json(id, s.inv, shown, 'members.json', options);
  } catch (error) {
    if (!options.signal?.aborted) wait.replaceWith(errorBox(`The collection ${id} cannot be read.`, error));
    return;
  }
  if (options.signal?.aborted) return;
  wait.remove();
  const members = Array.isArray(mem?.members) ? mem.members : [];
  const description = (Array.isArray(dc?.descriptions) ? dc.descriptions : [])[0]?.description;
  const status = s.line ? s.line.statuses[versionNumber(shown) - 1] : null;
  let budget = new Budget();
  const depth = h('select', { 'aria-label': 'Depth' },
    [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: n === LIMITS.depth }, `depth ${n}`)));
  const report = h('p', { class: 'small muted' });
  const run = h('button', { type: 'button', class: 'primary', onclick: async () => {
    run.disabled = true;
    budget = new Budget({ depth: Number(depth.value) });
    list.budget = budget;
    report.textContent = 'Resolving…';
    await list.checkAll(true, true);
    const counts = list.counts();
    report.textContent = `${plural(budget.used, 'pin')} resolved: ` +
      Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') +
      (budget.stopped.length ? `. Stopped: ${[...new Set(budget.stopped)].join('; ')}.` : '.');
    run.disabled = false;
  } }, 'Resolve and check all pins');
  const controls = h('div', { class: 'controls' }, run, depth, report);
  const list = memberList(ctx, a, members, 1, budget, mem?.type);
  append(root,
    h('header', { class: 'page-head' },
      h('p', { class: 'kicker' }, mem?.type === 'selection' ? 'Selection' : 'Catalogue', ' · ',
        h('a', { href: pages.archive() }, a.name)),
      h('h1', {}, rich(titleOf(dc) || a.labelOf(id) || id)),
      h('p', { class: 'creators' }, creatorsOf(dc).join('; ')),
      h('p', { class: 'chips' }, a.labelOf(id) ? [h('code', {}, a.labelOf(id)), ' '] : null, statusChip(s.status), ' ',
        chip(`object version ${shown}`), ' ', status ? [verdictChip(status), ' '] : null,
        shown === s.latest ? [chip('latest signed', 'ok'), ' '] : null, chip(plural(members.length, 'member')))),
    s.line && !s.latest ? h('div', { class: 'alert bad' }, 'This collection has no signed version that is not contested: ',
      'nothing may rely on what it lists (section 7.3).') : null,
    description ? h('p', { class: 'abstract' }, rich(description)) : null,
    facts([
      ['Type', (Object.hasOwn(KINDS, String(mem?.type)) && KINDS[mem.type]) || h('span', { class: 'bad' }, `no valid type (${String(mem?.type)})`)],
      ['Order', mem?.order ? `${mem.order} (the rule by which tools place members; the list below is the order)` : null],
      ['Curator', h('a', { href: pages.owner(id.split(':')[2]) }, h('code', {}, id.split(':')[2]))],
      ['Versions', versionsOf(s.inv).reverse().map((v) => [h('a', { href: pages.collection(ref(a, id), v), class: v === shown ? 'current' : '' }, v), ' '])],
      ['Object', h('a', { href: pages.object(ref(a, id), shown) }, 'descriptions, files, signatures and history of this collection')],
    ]),
    section('Members', controls, list.el),
    section('The member list as recorded', jsonView('members.json', mem, a.fileUrl(id, s.inv, shown, 'members.json'))));
}

function memberList(ctx, home, members, level, budget, type) {
  const list = { budget, items: [], el: h('ol', { class: 'members' }) };
  list.items = members.map((m, k) => memberItem(ctx, home, isObject(m) ? m : {}, k, level, list, type));
  list.el.append(...list.items.map((item) => item.el));
  list.checkAll = async (deep, again = false) => {
    await Promise.all(list.items.map((item) => item.check(deep, again)));
  };
  list.counts = () => {
    const counts = {};
    for (const item of list.items) {
      for (const [k, n] of Object.entries(item.counts())) counts[k] = (counts[k] || 0) + n;
    }
    return counts;
  };
  return list;
}

function memberItem(ctx, home, m, k, level, list, type) {
  const id = typeof m.name === 'string' && typeof m.owner === 'string' ? objectId(m.name, m.owner) : null;
  const at = Array.isArray(m.at) ? m.at.filter((u) => typeof u === 'string') : [];
  const isCollection = m.kind === 'collection';
  const ver = presentedPin(m);
  const held = id && home.entry(id);
  const hash = (isCollection ? pages.collection : pages.object)(held ? ref(home, id) : id || '?', ver);
  const href = held && home === ctx.archive ? hash : at.length ? elsewhere(at[0], hash) : null;
  const cite = isObject(m.cite) ? m.cite : {};
  const results = h('div', { class: 'results' });
  const nested = h('div', { class: 'nested' });
  const statuses = [];
  let sub = null;
  const item = { el: null, check: null, counts: () => {
    const c = {};
    for (const st of statuses) c[st] = (c[st] || 0) + 1;
    for (const [k2, n] of Object.entries(sub?.counts() || {})) c[k2] = (c[k2] || 0) + n;
    return c;
  } };
  const pinList = memberPins(m);
  const marks = pinList.map(() => h('span', { class: 'mark' }));
  const pins = Object.hasOwn(m, 'revisions')
    ? h('ul', { class: 'pins' }, pinList.map((p, i) => h('li', {},
        `document version ${p.documentVersion ?? '?'}, object version ${p.version ?? '?'} `, digest(p.pin), ' ', marks[i],
        i === pinList.length - 1 ? h('span', { class: 'muted small' }, ' (presented)') : null)))
    : h('ul', { class: 'pins' }, h('li', {}, `pinned at ${pinList[0].version ?? '?'} `, digest(pinList[0].pin), ' ', marks[0],
        m.follow === 'latest' ? [' ', chip('follows latest', ''), h('span', { class: 'muted small' }, ' (the latest signed version when the collection version was made)')] : null));
  let checking = null, resolved = false;
  const reset = () => {
    checking = null;
    resolved = false;
    statuses.length = 0;
    sub = null;
    marks.forEach((mark) => clear(mark));
    clear(results);
    clear(nested);
    delete nested.dataset.open;
  };
  const checkButton = h('button', { type: 'button', class: 'small', onclick: () => {
    if (resolved) {
      reset();
      ctx.resolver = ctx.resolver.again();
    }
    item.check(false);
  } }, 'Resolve');
  item.check = (deep, again = false) => {
    if (again && resolved) reset();
    if (!checking) checking = resolveMember(deep);
    else if (deep) checking = checking.then(() => openNested(true));
    return checking;
  };
  let found = null;

  async function resolveMember(deep) {
    checkButton.disabled = true;
    found = null;
    const granted = list.budget.allows(level) ? list.budget.take(pinList.length) : 0;
    if (!granted || !id) {
      if (id) list.budget.stopped.push(list.budget.reason(level));
      clear(results, h('p', { class: 'small muted' }, id ? `Not resolved: ${list.budget.reason(level)}.` : 'Not resolved: the member names no line.'));
      checking = null;
      checkButton.disabled = false;
      return;
    }
    clear(results, loading('Resolving…'));
    const problems = [];
    const notesBefore = ctx.resolver.notes.length;
    for (const [i, p] of pinList.entries()) {
      if (ctx.signal?.aborted) return;
      if (i >= granted) {
        list.budget.stopped.push(list.budget.reason(level));
        clear(marks[i], chip('not resolved', ''), h('span', { class: 'small muted' }, ` (${list.budget.reason(level)})`));
        continue;
      }
      let r;
      try {
        r = await ctx.resolver.pin(m.name, m.owner, p.version, p.pin, at, { signal: ctx.signal });
      } catch (error) {
        if (ctx.signal?.aborted) return;
        r = { status: 'unavailable', copy: null };
        problems.push(String(error?.detail || error?.message || error));
        const why = explain(error);
        if (why) problems.push(why);
      }
      statuses.push(r.status);
      clear(marks[i], verdictChip(r.status), r.copy ? h('span', { class: 'small muted' }, ` at ${r.copy.where}`) : null);
      if (r.copy && (r.status === 'verified' || r.status === 'contested') && i === pinList.length - 1) found = r;
    }
    problems.push(...ctx.resolver.notes.slice(notesBefore).map((n) => n.message));
    clear(results, problems.length ? h('details', { class: 'problems' }, h('summary', {}, 'What was met'),
      h('ul', {}, [...new Set(problems)].map((t) => h('li', {}, t)))) : null);
    if (found) {
      try {
        const d = await ctx.resolver.describe(found, { presentCurrent: !Object.hasOwn(m, 'revisions') }, { signal: ctx.signal });
        results.append(h('div', { class: 'resolved small' }, 'As its copy states it: ', h('strong', {}, rich(d.title || m.name)),
          d.creators.length ? ` · ${d.creators.join('; ')}` : '',
          d.documentVersion ? ` · document version ${d.documentVersion} (object version ${d.version})` : '', ' ', statusChip(d.status)));
        if (d.status === 'withdrawn') {
          results.append(h('div', { class: 'alert bad small' }, `Withdrawn by its owner${d.withdrawal?.date ? ' on ' + d.withdrawal.date : ''}: `,
            rich(d.withdrawal?.reason?.text || ''), type === 'selection' ? ' The revisions stay vetted by this selection (section 8.4).' : ''));
        }
      } catch (error) {
        if (!ctx.signal?.aborted) results.append(h('p', { class: 'small muted' }, `Its description cannot be read: ${error?.detail || error?.message}`));
      }
      if (isCollection && level + 1 > list.budget.depth) {
        if (deep) list.budget.stopped.push(list.budget.reason(level + 1));
        results.append(h('p', { class: 'small muted' }, `Its members are not shown: ${list.budget.reason(level + 1)}.`));
      } else if (isCollection) {
        const open = h('button', { type: 'button', class: 'small', onclick: () => { open.remove(); openNested(false); } }, 'Show its members');
        results.append(open);
        if (deep) {
          open.remove();
          await openNested(true);
        }
      }
    }
    checkButton.textContent = 'Resolve again';
    checkButton.disabled = false;
    resolved = true;
  }

  async function openNested(deep) {
    if (!found || nested.dataset.open) return;
    if (level + 1 > list.budget.depth) {
      list.budget.stopped.push(list.budget.reason(level + 1));
      clear(nested, h('p', { class: 'small muted' }, `Its members are not shown: ${list.budget.reason(level + 1)}.`));
      return;
    }
    if (!list.budget.first(id, ver)) {
      clear(nested, h('p', { class: 'small muted' }, 'This collection is shown elsewhere on this page.'));
      return;
    }
    nested.dataset.open = 'yes';
    clear(nested, loading());
    const there = found.copy.archive;
    try {
      const inv = await there.inventory(id, ver, { signal: ctx.signal });
      const mem = await there.json(id, inv, ver, 'members.json', { signal: ctx.signal });
      const members = Array.isArray(mem?.members) ? mem.members : [];
      sub = memberList(ctx, there, members, level + 1, list.budget, mem?.type);
      clear(nested, h('p', { class: 'small muted' }, `${mem?.type === 'selection' ? 'A selection' : 'A catalogue'} of ${plural(members.length, 'member')}, at ${ver}:`), sub.el);
      if (deep) await sub.checkAll(true);
    } catch (error) {
      if (!ctx.signal?.aborted) clear(nested, errorBox('Its members cannot be read.', error));
    }
  }
  item.el = h('li', { class: 'member' },
    h('div', { class: 'member-head' },
      h('span', { class: 'n' }, `${k + 1}.`), ' ',
      href ? h('a', { href, class: 'title' }, rich(cite.title || (held && home.labelOf(id)) || id || '?'))
        : h('span', { class: 'title' }, rich(cite.title || id || '?')),
      cite.title ? h('span', { class: 'muted small', title: 'cached citation, not authoritative (section 8.2)' }, ' (cached)') : null),
    h('div', { class: 'creators' }, Array.isArray(cite.creators) ? cite.creators.join('; ') : '',
      cite.year ? ` · ${cite.year}` : ''),
    h('div', { class: 'small' }, chip(String(m.kind ?? '?')), ' ', h('code', { title: id || '' }, held ? ref(home, id) : String(id ?? '?')), ' · ',
      held ? (home === ctx.archive ? 'held in this archive' : `held in the archive of this collection, ${home.name}`)
        : ['copies at ', at.length ? at.map((u) => [h('a', { href: elsewhere(u) }, u), ' ']) : '?'],
      m.doi ? [' · DOI ', doiLink(m.doi)] : null),
    pins, h('div', {}, checkButton), results, nested);
  return item;
}
