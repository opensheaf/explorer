// Generated from literate/25-collection-page.md by opensheaf-literate: edit the document, not this file.
import { h, append, clear, external, doiLink, digest, plural } from './dom.js';
import { rich } from './text.js';
import { facts, chip, statusChip, section, jsonView, errorBox, loading, pages, elsewhere } from './ui.js';
import { summary } from './summary.js';
import { versionsOf, titleOf, creatorsOf, memberPins } from './versions.js';
import { Budget, presentedPin } from './resolve.js';
import { explain, LIMITS } from './http.js';

const KINDS = {
  catalogue: 'A catalogue: it keeps objects whole, each member pinned with all its versions up to the pinned one (section 10.1).',
  selection: 'A selection: it vets particular revisions of documents; each member pins a revision set, and only those revisions belong to it (section 10.1).',
};

export async function showCollection(app, root, id, ver) {
  const ctx = Object.create(app, { signal: { value: app.signal } });
  const a = ctx.archive;
  const options = { signal: ctx.signal };
  const wait = root.appendChild(loading());
  let s, shown, obj, dc, mem;
  try {
    s = await summary(ctx, id);
    if (ver && !Object.hasOwn(s.inv.versions, ver)) throw new Error(`${id} has no object version ${ver}`);
    shown = ver || s.inv.head;
    ({ obj, dc } = await a.descriptions(id, s.inv, shown, options));
    if (obj?.kind !== 'collection') {
      wait.replaceWith(h('p', {}, `${id} is not a collection. `, h('a', { href: pages.object(id, ver) }, 'Its page.')));
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
      h('h1', {}, rich(titleOf(dc) || id)),
      h('p', { class: 'creators' }, creatorsOf(dc).join('; ')),
      h('p', { class: 'chips' }, h('code', {}, id), ' ', statusChip(s.status), ' ', chip(`object version ${shown}`),
        shown === s.inv.head ? [' ', chip('head', 'ok')] : null, ' ', chip(plural(members.length, 'member')))),
    description ? h('p', { class: 'abstract' }, rich(description)) : null,
    facts([
      ['Kind', (Object.hasOwn(KINDS, String(mem?.type)) && KINDS[mem.type]) || h('span', { class: 'bad' }, `no valid type (${String(mem?.type)})`)],
      ['Order', mem?.order ? `${mem.order} (the rule by which tools place members; the list below is the order)` : null],
      ['Versions', versionsOf(s.inv).reverse().map((v) => [h('a', { href: pages.collection(id, v), class: v === shown ? 'current' : '' }, v), ' '])],
      ['Object', h('a', { href: pages.object(id, shown) }, 'descriptions, files and history of this collection')],
    ]),
    section('Members', controls, list.el),
    section('The member list as recorded', jsonView('members.json', mem, a.fileUrl(id, s.inv, shown, 'members.json'))));
}

function memberList(ctx, home, members, level, budget, type) {
  const list = { budget, items: [], el: h('ol', { class: 'members' }) };
  list.items = members.map((m, k) => memberItem(ctx, home, m, k, level, list, type));
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
  const own = m?.archive === home.archiveId;
  const isCollection = m?.kind === 'collection';
  const ver = presentedPin(m);
  const hash = (isCollection ? pages.collection : pages.object)(m?.id, ver);
  const href = own && home === ctx.archive ? hash : (typeof m?.archiveUrl === 'string' ? elsewhere(m.archiveUrl, hash) : null);
  const cite = m?.cite && typeof m.cite === 'object' ? m.cite : {};
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
  const pinList = memberPins(m || {});
  const marks = pinList.map(() => h('span', { class: 'mark' }));
  const pins = 'revisions' in (m || {})
    ? h('ul', { class: 'pins' }, pinList.map((p, i) => h('li', {},
        `document version ${p.documentVersion ?? '?'}, object version ${p.version ?? '?'} `, digest(p.pin), ' ', marks[i],
        i === pinList.length - 1 ? h('span', { class: 'muted small' }, ' (presented)') : null)))
    : h('ul', { class: 'pins' }, h('li', {}, `pinned at ${pinList[0].version ?? '?'} `, digest(pinList[0].pin), ' ', marks[0],
        m?.follow === 'latest' ? [' ', chip('follows latest', ''), h('span', { class: 'muted small' }, ' (pinned at the head when the collection version was made)')] : null));
  const TONES = { verified: 'ok', mismatch: 'bad', unavailable: 'warn', removed: 'warn', invalid: 'bad' };
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
    if (resolved) reset();
    item.check(false);
  } }, 'Resolve');
  item.check = (deep, again = false) => {
    if (again && resolved) reset();
    if (!checking) checking = resolveMember(deep);
    else if (deep) checking = checking.then(() => openNested(true));
    return checking;
  };
  let verifiedAt = null;
  async function resolveMember(deep) {
    checkButton.disabled = true;
    verifiedAt = null;
    const granted = list.budget.allows(level) ? list.budget.take(pinList.length) : 0;
    if (!granted) {
      list.budget.stopped.push(list.budget.reason(level));
      clear(results, h('p', { class: 'small muted' }, `Not resolved: ${list.budget.reason(level)}.`));
      checking = null;
      checkButton.disabled = false;
      return;
    }
    clear(results, loading('Resolving…'));
    const problems = [];
    for (const [i, p] of pinList.entries()) {
      if (ctx.signal?.aborted) return;
      if (i >= granted) {
        list.budget.stopped.push(list.budget.reason(level));
        clear(marks[i], chip('not resolved', ''), h('span', { class: 'small muted' }, ` (${list.budget.reason(level)})`));
        continue;
      }
      let r;
      try {
        r = await ctx.resolver.confirm(m, p.version, p.pin, p.documentVersion, { signal: ctx.signal });
      } catch (error) {
        if (ctx.signal?.aborted) return;
        r = { status: 'unavailable', problems: [String(error?.message || error)], errors: [error] };
      }
      statuses.push(r.status);
      clear(marks[i], chip(r.status, TONES[r.status]), r.viaMirror ? h('span', { class: 'small' }, ` on the mirror ${r.source}`) : null);
      if (r.status === 'verified') verifiedAt = verifiedAt || r.archive;
      if (r.status !== 'verified' && r.problems.length) problems.push(...r.problems);
      const why = (r.errors || []).map(explain).find(Boolean);
      if (why) problems.push(why);
    }
    clear(results, problems.length ? h('details', { class: 'problems' }, h('summary', {}, 'What went wrong'),
      h('ul', {}, [...new Set(problems)].map((t) => h('li', {}, t)))) : null);
    if (verifiedAt) {
      try {
        const d = await ctx.resolver.describe(m, verifiedAt, { signal: ctx.signal });
        results.append(h('div', { class: 'resolved small' }, 'As its archive states it: ', h('strong', {}, rich(d.title || m.id)),
          d.creators.length ? ` · ${d.creators.join('; ')}` : '',
          d.documentVersion ? ` · document version ${d.documentVersion} (object version ${d.version})` : '', ' ', statusChip(d.status)));
        if (d.status === 'withdrawn') {
          results.append(h('div', { class: 'alert bad small' }, `Withdrawn in its archive${d.withdrawal?.date ? ' on ' + d.withdrawal.date : ''}: `,
            rich(d.withdrawal?.reason?.text || ''), type === 'selection' ? ' The revisions stay vetted by this selection (section 10.2).' : ''));
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
    if (!verifiedAt || nested.dataset.open) return;
    if (level + 1 > list.budget.depth) {
      list.budget.stopped.push(list.budget.reason(level + 1));
      clear(nested, h('p', { class: 'small muted' }, `Its members are not shown: ${list.budget.reason(level + 1)}.`));
      return;
    }
    if (!list.budget.first(verifiedAt.archiveId, m.id, ver)) {
      clear(nested, h('p', { class: 'small muted' }, 'This collection is shown elsewhere on this page.'));
      return;
    }
    nested.dataset.open = 'yes';
    clear(nested, loading());
    try {
      const inv = await verifiedAt.inventory(m.id, ver, { signal: ctx.signal });
      const mem = await verifiedAt.json(m.id, inv, ver, 'members.json', { signal: ctx.signal });
      const members = Array.isArray(mem?.members) ? mem.members : [];
      sub = memberList(ctx, verifiedAt, members, level + 1, list.budget, mem?.type);
      clear(nested, h('p', { class: 'small muted' }, `${mem?.type === 'selection' ? 'A selection' : 'A catalogue'} of ${plural(members.length, 'member')}, at ${ver}:`), sub.el);
      if (deep) await sub.checkAll(true);
    } catch (error) {
      if (!ctx.signal?.aborted) clear(nested, errorBox('Its members cannot be read.', error));
    }
  }
  item.el = h('li', { class: 'member' },
    h('div', { class: 'member-head' },
      h('span', { class: 'n' }, `${k + 1}.`), ' ',
      href ? h('a', { href, class: 'title' }, rich(cite.title || m?.id)) : h('span', { class: 'title' }, rich(cite.title || m?.id)),
      cite.title ? h('span', { class: 'muted small', title: 'cached citation, not authoritative (section 10.2)' }, ' (cached)') : null),
    h('div', { class: 'creators' }, Array.isArray(cite.creators) ? cite.creators.join('; ') : '',
      cite.year ? ` · ${cite.year}` : ''),
    h('div', { class: 'small' }, chip(String(m?.kind ?? '?')), ' ', h('code', {}, String(m?.id ?? '?')), ' · ',
      own ? (home === ctx.archive ? 'this archive' : `the archive of this collection, ${home.name}`) : ['archive ', h('code', {}, String(m?.archive ?? '?')), ' at ',
        typeof m?.archiveUrl === 'string' ? h('a', { href: elsewhere(m.archiveUrl) }, m.archiveUrl) : '?'],
      m?.doi ? [' · DOI ', doiLink(m.doi)] : null,
      Array.isArray(m?.mirrors) && m.mirrors.length ? [' · mirrors: ', m.mirrors.map((u) => [h('a', { href: elsewhere(u) }, u), ' '])] : null),
    pins, h('div', {}, checkButton), results, nested);
  return item;
}
