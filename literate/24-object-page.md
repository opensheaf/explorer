The page of an object
=====================

The page of an object shows one of its object versions: by default the
one holding the current version of a document (section 7.3: "landing
pages, indexes and citations use the current version, not the head"), or
the head of a collection; any other version is reached by its address,
`#/object/<id>/<version>`. Around it, the page shows what belongs to the
object as a whole: its status and withdrawal (section 11.1: "presentations
MUST show the withdrawal notice with the document"), the notices about its
versions (section 7.3: presentations "SHOULD show the current notices"),
its document versions in the order of the history, and all its object
versions.

The module is `app/view-object.js`.

    // in app/view-object.js:
    import { h, append, external, doiLink, identifierLink, digest, bytes, timestamp, plural } from './dom.js';
    import { rich } from './text.js';
    import { facts, chip, statusChip, section, jsonView, errorBox, loading, noteView, pages, elsewhere } from './ui.js';
    import { summary } from './summary.js';
    import { versionsOf, filesOf, dateOf, titleOf, creatorsOf, abstractOf } from './versions.js';

    <<show an object>>

    <<the state of an object>>

    <<the facts of an object version>>

    <<the table of the files of an object version>>

    <<the document versions and the object versions>>

    <<JSON read when it is opened>>

Showing an object
-----------------

The summary of the object gives its inventory, the `object.json` of every
version, its history and its current version. The two descriptions of the
version shown, and those of the entries of the history (for the table of
document versions), are read next. Notes name files of the same object
version, so their addresses are made from the version they belong to. A failure is shown, unless the page itself was
left (its own signal aborted): then nothing is drawn, since the page is
gone. Whether the page was left is asked of its signal, not read from
the kind of the error, so that a page is never left saying "Loading…".
The signal is asked again once everything is read, before anything is
drawn: a description that cannot be read is replaced by none, and that
replacement also swallows the error of a page that was left, so reaching
the end of the reading does not mean that the page is still there.
Without this check, the page left would be drawn below the next one.

    // in show an object:
    export async function showObject(ctx, root, id, ver) {
      const a = ctx.archive;
      const options = { signal: ctx.signal };
      const wait = root.appendChild(loading());
      let s, shown, descs;
      try {
        s = await summary(ctx, id);
        if (ver && !Object.hasOwn(s.inv.versions, ver)) throw new Error(`${id} has no object version ${ver}`);
        shown = ver || s.shown;
        descs = new Map(await Promise.all([...new Set([shown, ...s.hist])].map(async (v) =>
          [v, await a.descriptions(id, s.inv, v, options).catch(() => ({ obj: s.objOf(v), dc: null }))])));
      } catch (error) {
        if (!options.signal?.aborted) wait.replaceWith(errorBox(`The object ${id} cannot be read.`, error));
        return;
      }
      if (options.signal?.aborted) return;
      wait.remove();
      const { obj, dc } = descs.get(shown);
      const fileUrl = (v) => (p) => { try { return a.fileUrl(id, s.inv, v, p); } catch { return null; } };
      const entry = a.entry(id);
      const isDocument = (obj?.kind ?? s.kind) === 'document';
      append(root,
        h('header', { class: 'page-head' },
          h('p', { class: 'kicker' }, isDocument ? 'Document' : 'Collection', ' · ',
            h('a', { href: pages.archive() }, a.name)),
          h('h1', {}, rich(titleOf(dc) || id)),
          h('p', { class: 'creators' }, creatorsOf(dc).join('; ')),
          h('p', { class: 'chips' }, h('code', {}, id), ' ', statusChip(s.status), ' ',
            chip(`object version ${shown}`), ' ',
            isDocument && obj?.documentVersion ? chip(`document version ${obj.documentVersion}`) : null, ' ',
            shown === s.current && isDocument ? chip('current version', 'ok') : null,
            !isDocument ? h('a', { class: 'button', href: pages.collection(id, shown) }, 'Members →') : null)),
        objectState(ctx, s, id, shown, obj, entry, fileUrl),
        abstractOf(dc) ? section('Abstract', h('p', { class: 'abstract' }, rich(abstractOf(dc)))) : null,
        section(`Object version ${shown}`, versionFacts(ctx, s, id, shown, obj, dc, fileUrl(shown))),
        section('Files', filesTable(ctx, s, id, shown, obj)),
        isDocument ? documentVersions(s, id, shown, descs) : null,
        objectVersions(s, id, shown),
        section('The files as recorded',
          jsonView('object.json', obj, fileUrl(shown)('object.json')),
          jsonView('datacite.json', dc, fileUrl(shown)('datacite.json')),
          lazyJson(`inventory.json of ${shown}`, () => a.inventory(id, shown, options), a.inventoryUrl(id, shown))));
    }

The state of an object
----------------------

What belongs to the object rather than to the version shown: the
withdrawal and the notices, read from the head (the latest knowledge of
the archive; a withdrawal is a description-only version, and every later
version keeps the notices, section 7.3); whether the object is a mirror
of another archive's (section 10.4); whether it is listed in the
discovery document; and, when the version shown is not the current one,
where the current one is.

    // in the state of an object:
    function objectState(ctx, s, id, shown, obj, entry, fileUrl) {
      const head = s.head || {};
      const parts = [];
      if (head.status === 'withdrawn' || head.withdrawal) {
        const w = head.withdrawal || {};
        parts.push(h('div', { class: 'alert bad', role: 'note' },
          h('strong', {}, 'Withdrawn'), w.date ? ` on ${w.date}` : '', '. ',
          noteView(w.reason, fileUrl(s.inv.head)),
          h('span', { class: 'muted' }, ' The content is kept, and its history remains verifiable (section 11.1).')));
      }
      if (head.archiveId && head.archiveId !== ctx.archive.archiveId) {
        parts.push(h('div', { class: 'alert' }, 'A mirror: a copy, byte for byte, of an object of the archive ',
          h('code', {}, String(head.archiveId)), ', kept here whole (section 10.4).'));
      }
      if (!entry) parts.push(h('div', { class: 'alert warn' }, 'This object is not listed in the discovery document.'));
      if ((obj?.kind ?? s.kind) === 'document' && shown !== s.current) {
        const current = s.objOf(s.current);
        parts.push(h('div', { class: 'alert' }, `This is object version ${shown}, holding document version ${obj?.documentVersion ?? '?'}. `,
          'The current version is ', h('a', { href: pages.object(id, s.current) },
            `document version ${current?.documentVersion ?? '?'} (object version ${s.current})`), '.',
          s.hist.includes(shown) ? '' : ' A later object version holds the same document version, with its latest description.'));
      }
      const notices = Array.isArray(head.notices) ? head.notices : [];
      if (notices.length) {
        parts.push(section('Notices', h('ul', { class: 'notices' }, notices.map((n) => h('li', {
          class: n?.documentVersion === obj?.documentVersion ? 'about-this' : '' },
          h('strong', {}, `About version ${n?.documentVersion ?? '?'}`), n?.date ? ` (${n.date})` : '', ': ',
          noteView(n, fileUrl(s.inv.head)))))));
      }
      return parts;
    }

The facts of an object version
------------------------------

The facts of the version shown, from its two descriptions and its
inventory: when and by whom it was deposited (the inventory is the record
of deposits, section 7.1), its stage, dates, DOI and licence, its sources
and renditions, its change note, the agreement of its authors, its
external records (an arXiv version, a Zenodo deposit, or the source of an
accepted copy, which opens in the explorer), its relations (section 8.1),
its extensions; and the landing page, for archives with a website, which
is presentation and not authoritative.

    // in the facts of an object version:
    function versionFacts(ctx, s, id, ver, obj, dc, fileUrl) {
      const list = (x) => (Array.isArray(x) ? x : []);
      const str = (x) => (x === null || x === undefined ? '' : String(x));
      const vinfo = s.inv.versions[ver] || {};
      const user = vinfo.user || {};
      const profiles = list(ctx.archive.disc.profiles);
      return facts([
        ['Deposited', [timestamp(vinfo.created), user.name ? ` by ${user.name}` : '',
          typeof user.address === 'string' ? [' ', external(user.address, '↗')] : null]],
        ['Message', str(vinfo.message)],
        ['Stage', obj?.stage ? `${str(obj.stage.value)} (${str(obj.stage.scheme)})` : null],
        ['Type', dc?.types ? [str(dc.types.resourceTypeGeneral), dc.types.resourceType ? ` (${str(dc.types.resourceType)})` : ''] : null],
        ['Dates', list(dc?.dates).map((d) => h('div', {}, `${str(d?.dateType)}: ${str(d?.date)}`,
          d?.dateInformation ? h('span', { class: 'muted' }, ` (${str(d.dateInformation)})`) : null))],
        ['DOI', doiLink(dc?.doi)],
        ['Licence', list(dc?.rightsList).map((r) => h('div', {}, str(r?.rights || r?.rightsIdentifier),
          r?.rightsUri ? [' ', external(String(r.rightsUri), '↗')] : null,
          r?.rightsIdentifier ? h('span', { class: 'muted' }, ` (${str(r.rightsIdentifier)})`) : null))],
        ['Licence terms', noteView(obj?.licence, fileUrl)],
        ['Publisher', typeof dc?.publisher === 'string' ? dc.publisher : str(dc?.publisher?.name)],
        ['Subjects', list(dc?.subjects).map((x) => str(x?.subject)).filter(Boolean).join('; ')],
        ['Main source', obj?.mainSource ? [h('code', {}, str(obj.mainSource)), ` (${str(obj.sourceFormat)})`] : null],
        ['Sources', obj?.sourcesMissing ? ['missing: ', noteView(obj.sourcesMissing, fileUrl)] : null],
        ['Renditions', list(obj?.renditions).map((r) => h('div', {},
          fileUrl(r?.path) ? external(fileUrl(r.path), str(r?.path)) : str(r?.path), ` (${str(r?.mediaType)})`))],
        ['Toolchain', list(obj?.toolchain).map((t) => h('div', {}, `${str(t?.name)} ${str(t?.version)}`,
          list(t?.packages).length ? ` with ${list(t.packages).join(', ')}` : ''))],
        ['Change note', noteView(obj?.changes, fileUrl)],
        ['Agreement', obj?.agreement ? `${list(obj.agreement.by).join(', ')}, ${str(obj.agreement.date)}, ${str(obj.agreement.method)}` : null],
        ['External records', list(obj?.external).map((e) => h('div', {},
          `${str(e?.role)}: ${str(e?.service)}`, e?.label ? ` ${str(e.label)}` : '', ' ',
          e?.service === 'OpenSheaf' && typeof e?.record === 'string'
            ? h('a', { href: elsewhere(e.record) }, 'explore the source') : external(str(e?.record), 'record'),
          e?.doi ? [' ', doiLink(e.doi)] : null,
          list(e?.files).length ? h('span', { class: 'muted' }, ` (files: ${list(e.files).map((f) => str(f?.name)).join(', ')})`) : null))],
        ['Relations', list(dc?.relatedIdentifiers).map((r) => h('div', {}, `${str(r?.relationType)} `,
          identifierLink(r?.relatedIdentifier, r?.relatedIdentifierType),
          h('span', { class: 'muted' }, ` (${str(r?.relatedIdentifierType)})`)))],
        ['Extensions', obj?.extensions && typeof obj.extensions === 'object' ? Object.keys(obj.extensions).join(', ') : null],
        ['Landing page', profiles.includes('website') || profiles.includes('texmacs')
          ? [external(`${ctx.archive.base}paper/${id}/`), h('span', { class: 'muted' }, ' (presentation, not authoritative)')] : null],
      ]);
    }

The files of an object version
------------------------------

Every file of the version, with what it is (a description, the main
source, another source, a rendition, the file of a note, the member list
of a collection), its SHA-512 digest (from the inventory, which fixes it),
and a link to download it from the storage root. Inventories do not
record sizes; a button asks the server for them, which costs one request
per file.

    // in the table of the files of an object version:
    function filesTable(ctx, s, id, ver, obj) {
      const a = ctx.archive;
      const files = filesOf(s.inv, ver);
      const list = (x) => (Array.isArray(x) ? x : []);
      const renditions = new Set(list(obj?.renditions).map((r) => r?.path));
      const notes = new Set([obj?.changes, obj?.licence, obj?.sourcesMissing, obj?.withdrawal?.reason, ...list(obj?.notices)]
        .map((n) => n?.path).filter(Boolean));
      const role = (p) => {
        if (p === 'object.json' || p === 'datacite.json') return 'description';
        if (p === 'members.json') return 'member list';
        if (p === obj?.mainSource) return 'main source';
        if (renditions.has(p)) return 'rendition';
        if (notes.has(p)) return 'note';
        return obj?.kind === 'document' && !obj?.sourcesMissing ? 'source' : 'file';
      };
      const rows = Object.keys(files).sort().map((p) => {
        let url = null;
        try { url = a.fileUrl(id, s.inv, ver, p); } catch { /* an unsafe path: not linked */ }
        const size = h('td', { class: 'num' });
        return { url, size, el: h('tr', {},
          h('td', {}, url ? external(url, p) : h('span', { class: 'unsafe-link' }, p)),
          h('td', {}, role(p)), h('td', {}, digest(files[p])), size) };
      });
      const sizes = h('button', { type: 'button', onclick: async () => {
        sizes.disabled = true;
        let total = 0;
        await Promise.all(rows.map(async (r) => {
          if (!r.url) return;
          try {
            const n = await a.http.size(r.url, { signal: ctx.signal });
            r.size.textContent = bytes(n);
            total += n || 0;
          } catch (error) {
            r.size.textContent = error?.kind === 'aborted' ? '' : '?';
          }
        }));
        sizes.textContent = `Total: ${bytes(total)} (as the server declares; possibly compressed)`;
      } }, 'Show sizes');
      return [h('div', { class: 'table-wrap' }, h('table', { class: 'files' },
        h('thead', {}, h('tr', {}, h('th', {}, 'Logical path'), h('th', {}, 'Role'), h('th', {}, 'SHA-512'), h('th', {}, 'Size'))),
        h('tbody', {}, rows.map((r) => r.el)))),
        h('p', { class: 'small' }, plural(rows.length, 'file'), ' · ', sizes)];
    }

The versions
------------

The document versions, in the order of the history (section 7.3): each
with the object version that holds it (the entry of the history, its most
complete description), its external labels (arXiv's `v3` for a version
whose number here is 2, section 7.3), its stage, the date it became
available, its change note, and the number of notices about it. The page
says whether the order comes from a `history` recorded in `object.json`
or from the numbers.

    // in the document versions and the object versions:
    function documentVersions(s, id, shown, descs) {
      const notices = Array.isArray(s.head?.notices) ? s.head.notices : [];
      const recorded = Array.isArray(s.head?.history);
      return section('Document versions',
        h('p', { class: 'muted small' }, 'In the order of the history, ',
          recorded ? 'as recorded in object.json' : 'which is the order of the numbers (no history is recorded)',
          ' (section 7.3). The last is the current version.'),
        h('ol', { class: 'versions' }, s.hist.map((v) => {
          const { obj, dc } = descs.get(v) || {};
          const n = obj?.documentVersion;
          const labels = (Array.isArray(obj?.external) ? obj.external : []).filter((e) => e?.label)
            .map((e) => `${e.service} ${e.label}`);
          const about = notices.filter((x) => x?.documentVersion === n).length;
          return h('li', { class: v === shown ? 'shown' : '' },
            h('a', { href: pages.object(id, v) }, `Version ${n ?? '?'}`), ' ',
            v === s.current ? chip('current', 'ok') : null, ' ',
            h('span', { class: 'muted' }, `object version ${v}`),
            labels.length ? [' · ', labels.join(', ')] : null,
            obj?.stage?.value ? [' · ', String(obj.stage.value)] : null,
            dateOf(dc, 'Available', 'Created') ? [' · ', dateOf(dc, 'Available', 'Created')] : null,
            about ? [' · ', chip(plural(about, 'notice'), 'warn')] : null,
            obj?.changes?.text ? h('div', { class: 'change' }, rich(obj.changes.text)) : null);
        })));
    }

All the object versions, in order: when each was deposited, by whom, with
its message, the document version it holds and what it did (a new
document version, a description-only version, a completion).

    // in the document versions and the object versions:
    const ROLES = { new: 'new document version', description: 'description only', completion: 'completion',
                    collection: 'collection version', unknown: 'unreadable' };

    function objectVersions(s, id, shown) {
      return section('Object versions',
        h('div', { class: 'table-wrap' }, h('table', { class: 'object-versions' },
          h('thead', {}, h('tr', {}, ['Version', 'Deposited', 'By', 'Document version', 'What it did', 'Message'].map((t) => h('th', {}, t)))),
          h('tbody', {}, versionsOf(s.inv).reverse().map((v) => {
            const info = s.inv.versions[v] || {};
            return h('tr', { class: v === shown ? 'shown' : '' },
              h('td', {}, h('a', { href: pages.object(id, v) }, v), v === s.inv.head ? [' ', chip('head')] : null),
              h('td', {}, timestamp(info.created)), h('td', {}, String(info.user?.name ?? '')),
              h('td', { class: 'num' }, String(s.objOf(v)?.documentVersion ?? '?')),
              h('td', {}, ROLES[s.roles[v]] || ''), h('td', {}, String(info.message ?? '')));
          })))));
    }

JSON read when opened
---------------------

The inventory of a version is read only when its box is opened.

    // in JSON read when it is opened:
    function lazyJson(label, read, url) {
      const pre = h('pre', {}, 'Loading…');
      const box = h('details', { class: 'json' }, h('summary', {}, label, ' ', h('span', { class: 'muted' }, '(', external(url, 'raw'), ')')), pre);
      box.addEventListener('toggle', () => {
        if (!box.open || box.dataset.read) return;
        box.dataset.read = 'yes';
        read().then((value) => { pre.textContent = JSON.stringify(value, null, 2); },
                    (error) => { pre.textContent = `cannot be read: ${error?.detail || error?.message || error}`; });
      });
      return box;
    }
