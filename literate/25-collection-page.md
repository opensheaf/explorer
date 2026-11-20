The page of a collection
========================

A collection lists members, lines of any archive, each pinned (section
8). Its page shows the member list of one of its versions (by default its
latest signed version), in its order, which "is authoritative:
presentations MUST present members in it" (section 8.2). For each member
it shows what the collection itself records: the kind, the line (its name
and owner, never a location), the base URLs where copies may be found
(`at`, hints that need no signature), the pin of a catalogue's member,
with `follow` if the curator follows it, or the revision set of a
selection's member, and the cached citation, which is "not
authoritative".

Then the reader can *resolve* the members, one by one or all at once: the
explorer finds copies of each member's line, at its `at` and in the
archive explored (chapter [15](15-resolve.md)), checks them, and gives
each pin its status (section 8.5): *verified*, *contested*, *mismatch*,
*unchecked*, *not a version*, *unavailable* or *removed*. It then shows
the member as the copy found describes it, with the status of its line (a
member withdrawn stays in the collection, and the withdrawal is shown,
saying where it comes from, sections 8.3 and 8.4). A member that is
itself a collection can be opened in place, down to a depth limit
(section 14.1: verifiers "MAY bound the depth of the chains and
collections [they] follow").

The module is `app/view-collection.js`.

    // in app/view-collection.js:
    import { h, append, clear, digest, doiLink, plural, copyable } from './dom.js';
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

Showing a collection
--------------------

The collection's summary gives its versions and its latest signed
version; the version shown has its descriptions and its member list read.
The two types of collection are explained in a sentence each, since they
differ in what a pin means (section 8.1); the type is the archive's, and
is looked up only among the two known (`Object.hasOwn`), so that a type
`constructor` is not explained by a JavaScript function. A failure to
read is shown unless the page itself was left, as on
[the page of an object](24-object-page.md). The controls resolve every
member, and follow member collections to the depth chosen; one budget is
shared by everything resolved on the page.

Resolving goes on long after the page is drawn, while the reader waits or
clicks. Its requests must be cancelled with the signal of *this* page:
`ctx.signal` is replaced by the next page as soon as the reader leaves
(see [the application](30-app.md)), and code reading it later would carry
on under the new page's signal, fetching for a page that is gone and
taking the connections the new page needs. So the page receives the
context of the application as `app` and works with a context of its own,
`ctx`, made from `app` with the signal of the moment fixed (everything
else is read through to `app`); the member lists, nested ones included,
are given this `ctx`, and the resolution of a member's pins stops at the
next pin once the page is left.

    // in app/view-collection.js:
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

A list of members
-----------------

A list of members is built for a collection of some archive (the one
explored, or another reached through a member) at some depth. It knows
its members' views, can check them all, and counts their pins by status.

    // in app/view-collection.js:
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

A member
--------

A member shows what the collection records, then, once resolved, the
status of each of its pins and its description as the copy found states
it. A member held in the archive explored links to its page here; a
member of another archive opens the explorer on the first base URL of its
`at`. A collection member, once resolved, can be opened in place.

The pins: one for a member of a catalogue, with `follow` if the curator
follows the line (a setting of the curator: the pin is the latest signed
version when the collection version was made, section 8.3); a list of
revisions for a member of a selection, the last being the one presented
(section 8.4). Each pin has a place for its status.

    // in app/view-collection.js:
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

Resolving the member asks the resolver for the status of each pin (section
8.5), and marks it, with where the copy was found. Each pin is taken from
the budget, which counts pins, not members: a member of a selection may
pin many revisions, each costing requests. Pins the budget does not grant
are marked as not resolved. What went wrong where copies were looked for
(an archive that cannot be read, a copy that is not one of the line) is
listed, with the explanation of [the HTTP client](10-http.md) for a
failure to read. Then the member is described from the copy that holds
its pin: its title, its document version and the status of its line; a
withdrawal is shown with its date and reason, as coming from the member's
owner. A collection member gets a button to open its members, unless the
depth limit is reached, in which case the page says so instead. With
`deep`, the members of a member collection are opened and resolved at
once.

A member resolved before is resolved again by the button "Resolve again",
and by a run of "Resolve and check all pins" (`again`): its marks, its
counts and its members opened are reset first. The button also gives the
page a resolver read afresh (chapter [15](15-resolve.md)), so that the
member is checked against what the servers hold now, not against the
answers kept.

    // in app/view-collection.js:
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

The members of a member collection are read at the pin presented, from
the copy that holds it, through the inventory copy of the pinned version,
whose digest is the pin just checked (not through the member's root
inventory, which the pin does not fix and which may have changed since),
and listed like the collection's own, one level deeper. A collection
already walked on this page is not walked again: pins cannot form cycles,
but the same collection can be reached twice.

    // in app/view-collection.js:
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
        h('div', { class: 'small' }, chip(String(m.kind ?? '?')), ' ', id ? copyable(String(id), held ? ref(home, id) : String(id)) : '?', ' · ',
          held ? (home === ctx.archive ? 'held in this archive' : `held in the archive of this collection, ${home.name}`)
            : ['copies at ', at.length ? at.map((u) => [h('a', { href: elsewhere(u) }, u), ' ']) : '?'],
          m.doi ? [' · DOI ', doiLink(m.doi)] : null),
        pins, h('div', {}, checkButton), results, nested);
      return item;
    }
