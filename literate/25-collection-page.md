The page of a collection
========================

A collection lists members, of this archive or of others, each pinned by
digest (section 10.2). Its page shows the member list of one of its
versions (by default the head), in its order, which "is authoritative:
presentations MUST present members in it". For each member it shows what
the collection itself records: the kind, the archive (by identifier, with
the address it had when the collection version was made), the pin of an
archive collection's member, with `follow` if the curator follows it, or
the revision set of a selection's member, and the cached citation, which
"is not authoritative".

Then the reader can *resolve* the members, one by one or all at once: the
explorer finds each pinned object version as section 6.4 says, checks its
pin, and shows the member as its own archive describes it, with its
status (a member withdrawn in its archive stays in the collection, and
the withdrawal is shown, saying where it comes from, section 10.2). A
member that is itself a collection can be opened in place, down to a depth
limit (section 14: verifiers "SHOULD limit the depth and size of the
collections [they] follow, and report when [they] stop").

The module is `app/view-collection.js`.

    // in app/view-collection.js:
    import { h, append, clear, external, doiLink, digest, plural } from './dom.js';
    import { rich } from './text.js';
    import { facts, chip, statusChip, section, jsonView, errorBox, loading, pages, elsewhere } from './ui.js';
    import { summary } from './summary.js';
    import { versionsOf, titleOf, creatorsOf, memberPins } from './versions.js';
    import { Budget, presentedVersion } from './resolve.js';
    import { explain, LIMITS } from './http.js';

    <<show a collection>>

    <<a list of members>>

    <<a member>>

Showing a collection
--------------------

The collection's summary gives its versions; the version shown has its
descriptions and its member list read. The two kinds of collection are
explained in a sentence each, since they differ in what a pin means
(section 10.1). The controls resolve every member, and follow member
collections to the depth chosen; one budget is shared by everything
resolved on the page.

    // in show a collection:
    const KINDS = {
      archive: 'An archive collection: it keeps objects whole, each member pinned with all its versions up to the pinned one (section 10.1).',
      selection: 'A selection: it vets particular revisions of documents; each member pins a revision set, and only those revisions belong to it (section 10.1).',
    };

    export async function showCollection(ctx, root, id, ver) {
      const a = ctx.archive;
      const options = { signal: ctx.signal };
      const wait = root.appendChild(loading());
      let s, shown, obj, dc, mem;
      try {
        s = await summary(ctx, id);
        if (ver && !(ver in s.inv.versions)) throw new Error(`${id} has no object version ${ver}`);
        shown = ver || s.inv.head;
        ({ obj, dc } = await a.descriptions(id, s.inv, shown, options));
        if (obj?.kind !== 'collection') {
          wait.replaceWith(h('p', {}, `${id} is not a collection. `, h('a', { href: pages.object(id, ver) }, 'Its page.')));
          return;
        }
        mem = await a.json(id, s.inv, shown, 'members.json', options);
      } catch (error) {
        if (error?.kind !== 'aborted') wait.replaceWith(errorBox(`The collection ${id} cannot be read.`, error));
        return;
      }
      wait.remove();
      const members = Array.isArray(mem?.members) ? mem.members : [];
      const description = (Array.isArray(dc?.descriptions) ? dc.descriptions : [])[0]?.description;
      <<the controls of resolution>>
      const list = memberList(ctx, a, members, 1, budget, mem?.type);
      append(root,
        h('header', { class: 'page-head' },
          h('p', { class: 'kicker' }, mem?.type === 'selection' ? 'Selection' : 'Archive collection', ' · ',
            h('a', { href: pages.archive() }, a.name)),
          h('h1', {}, rich(titleOf(dc) || id)),
          h('p', { class: 'creators' }, creatorsOf(dc).join('; ')),
          h('p', { class: 'chips' }, h('code', {}, id), ' ', statusChip(s.status), ' ', chip(`object version ${shown}`),
            shown === s.inv.head ? [' ', chip('head', 'ok')] : null, ' ', chip(plural(members.length, 'member')))),
        description ? h('p', { class: 'abstract' }, rich(description)) : null,
        facts([
          ['Kind', KINDS[mem?.type] || h('span', { class: 'bad' }, `no valid type (${String(mem?.type)})`)],
          ['Order', mem?.order ? `${mem.order} (the rule by which tools place members; the list below is the order)` : null],
          ['Versions', versionsOf(s.inv).reverse().map((v) => [h('a', { href: pages.collection(id, v), class: v === shown ? 'current' : '' }, v), ' '])],
          ['Object', h('a', { href: pages.object(id, shown) }, 'descriptions, files and history of this collection')],
        ]),
        section('Members', controls, list.el),
        section('The member list as recorded', jsonView('members.json', mem, a.fileUrl(id, s.inv, shown, 'members.json'))));
    }

Resolving every member resolves them in the order of the list, a few at a
time (the HTTP client limits the requests), and, with a depth above 1,
opens the member collections and resolves their members too. A new
budget is made for each run; when it stops the walk, the page says why.

    // in the controls of resolution:
    let budget = new Budget();
    const depth = h('select', { 'aria-label': 'Depth' },
      [1, 2, 3, 4, 5].map((n) => h('option', { value: n, selected: n === LIMITS.depth }, `depth ${n}`)));
    const report = h('p', { class: 'small muted' });
    const run = h('button', { type: 'button', class: 'primary', onclick: async () => {
      run.disabled = true;
      budget = new Budget({ depth: Number(depth.value) });
      list.budget = budget;
      report.textContent = 'Resolving…';
      await list.checkAll(true);
      const counts = list.counts();
      report.textContent = `${plural(budget.used, 'member')} resolved; their pins: ` +
        Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') +
        (budget.stopped.length ? `. Stopped: ${[...new Set(budget.stopped)].join('; ')}.` : '.');
      run.disabled = false;
    } }, 'Resolve and check all pins');
    const controls = h('div', { class: 'controls' }, run, depth, report);

A list of members
-----------------

A list of members is built for a collection of some archive (the one
explored, or another reached through a member) at some depth. It knows
its members' views, can check them all, and counts their pins by status.

    // in a list of members:
    function memberList(ctx, home, members, level, budget, type) {
      const list = { budget, items: [], el: h('ol', { class: 'members' }) };
      list.items = members.map((m, k) => memberItem(ctx, home, m, k, level, list, type));
      list.el.append(...list.items.map((item) => item.el));
      list.checkAll = async (deep) => {
        await Promise.all(list.items.map((item) => item.check(deep)));
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

A member
--------

A member shows what the collection records, then, once resolved, the
status of each of its pins and its description as its archive states it.
A member of the archive explored links to its page here; a member of
another archive opens the explorer on that archive. A collection member,
once resolved, can be opened in place.

    // in a member:
    function memberItem(ctx, home, m, k, level, list, type) {
      const own = m?.archive === home.archiveId;
      const isCollection = m?.kind === 'collection';
      const ver = presentedVersion(m);
      const hash = (isCollection ? pages.collection : pages.object)(m?.id, ver);
      const href = own && home === ctx.archive ? hash : (typeof m?.archiveUrl === 'string' ? elsewhere(m.archiveUrl, hash) : null);
      const cite = m?.cite && typeof m.cite === 'object' ? m.cite : {};
      const results = h('div', { class: 'results' });
      const nested = h('div', { class: 'nested' });
      const statuses = [];
      const item = { el: null, check: null, counts: () => {
        const c = {};
        for (const st of statuses) c[st] = (c[st] || 0) + 1;
        return c;
      } };
      <<the pins of a member, as recorded>>
      <<resolve a member>>
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

The pins: one for a member of an archive collection, with `follow` if
the curator follows the object (a curation setting: the pin is the head
when the collection version was made, section 10.2); a list of revisions
for a member of a selection, the last being the one presented. Each pin
has a place for its status.

    // in the pins of a member, as recorded:
    const pinList = memberPins(m || {});
    const marks = pinList.map(() => h('span', { class: 'mark' }));
    const pins = 'revisions' in (m || {})
      ? h('ul', { class: 'pins' }, pinList.map((p, i) => h('li', {},
          `document version ${p.documentVersion ?? '?'}, object version ${p.version ?? '?'} `, digest(p.pin), ' ', marks[i],
          i === pinList.length - 1 ? h('span', { class: 'muted small' }, ' (presented)') : null)))
      : h('ul', { class: 'pins' }, h('li', {}, `pinned at ${pinList[0].version ?? '?'} `, digest(pinList[0].pin), ' ', marks[0],
          m?.follow === 'latest' ? [' ', chip('follows latest', ''), h('span', { class: 'muted small' }, ' (pinned at the head when the collection version was made)')] : null));

Resolving the member confirms each pin with the resolver, and marks it:
verified (and where: a mirror, when the archive failed), mismatch,
unavailable or removed, with the reasons at each source tried and, for a
failure to read, the explanation of [the HTTP client](10-http.md). Then
the member is described from the archive where its pin was verified: its
title, its document version and, from its head, its status; a withdrawal
is shown with its date and reason, as coming from the member's archive.
A collection member gets a button to open its members, unless the depth
limit is reached. With `deep`, the members of a member collection are
opened and resolved at once.

    // in resolve a member:
    const TONES = { verified: 'ok', mismatch: 'bad', unavailable: 'warn', removed: 'warn', invalid: 'bad' };
    let checking = null, resolved = false;
    const checkButton = h('button', { type: 'button', class: 'small', onclick: () => {
      if (resolved) {
        checking = null;
        resolved = false;
        statuses.length = 0;
      }
      item.check(false);
    } }, 'Resolve');
    item.check = (deep) => {
      if (!checking) checking = resolveMember(deep);
      else if (deep) checking = checking.then(() => openNested(true));
      return checking;
    };
    let verifiedAt = null;
    async function resolveMember(deep) {
      checkButton.disabled = true;
      verifiedAt = null;
      if (!list.budget.allows(level) || !list.budget.take(1)) {
        list.budget.stopped.push(list.budget.reason(level));
        clear(results, h('p', { class: 'small muted' }, `Not resolved: ${list.budget.reason(level)}.`));
        checking = null;
        checkButton.disabled = false;
        return;
      }
      clear(results, loading('Resolving…'));
      const problems = [];
      for (const [i, p] of pinList.entries()) {
        let r;
        try {
          r = await ctx.resolver.confirm(m, p.version, p.pin, p.documentVersion, { signal: ctx.signal });
        } catch (error) {
          if (error?.kind === 'aborted') return;
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
          if (error?.kind !== 'aborted') results.append(h('p', { class: 'small muted' }, `Its description cannot be read: ${error?.detail || error?.message}`));
        }
        if (isCollection) {
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

The members of a member collection are read at the version presented,
from the archive where its pin was verified, and listed like the
collection's own, one level deeper. A collection already walked on this
page is not walked again: pins cannot form cycles, but the same
collection can be reached twice.

    // in resolve a member:
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
        const inv = await verifiedAt.inventory(m.id, null, { signal: ctx.signal });
        const mem = await verifiedAt.json(m.id, inv, ver, 'members.json', { signal: ctx.signal });
        const members = Array.isArray(mem?.members) ? mem.members : [];
        const sub = memberList(ctx, verifiedAt, members, level + 1, list.budget, mem?.type);
        sub.budget = list.budget;
        clear(nested, h('p', { class: 'small muted' }, `${mem?.type === 'selection' ? 'A selection' : 'An archive collection'} of ${plural(members.length, 'member')}, at ${ver}:`), sub.el);
        if (deep) await sub.checkAll(true);
        const counts = item.counts;
        item.counts = () => {
          const c = counts();
          for (const [k2, n] of Object.entries(sub.counts())) c[k2] = (c[k2] || 0) + n;
          return c;
        };
      } catch (error) {
        if (error?.kind !== 'aborted') clear(nested, errorBox('Its members cannot be read.', error));
      }
    }
