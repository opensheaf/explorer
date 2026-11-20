// Generated from literate/24-object-page.md by opensheaf-literate: edit the document, not this file.
import { h, append, external, doiLink, identifierLink, digest, bytes, timestamp, plural } from './dom.js';
import { rich } from './text.js';
import { facts, chip, statusChip, verdictChip, section, jsonView, jsonText, errorBox, loading, noteView, pages, elsewhere,
         ref } from './ui.js';
import { summary } from './summary.js';
import { versionsOf, filesOf, dateOf, titleOf, creatorsOf, abstractOf, isEvidence } from './versions.js';
import { parseId, readGenesis, objectId, isObject } from './names.js';
import { verdict, levelOfVersion } from './branches.js';
import { versionNumber } from './paths.js';

export async function showObject(ctx, root, id, ver) {
  const a = ctx.archive;
  const options = { signal: ctx.signal };
  const wait = root.appendChild(loading());
  let s, shown, descs, rec = null;
  try {
    await a.locate(id);
    s = await summary(ctx, id);
    if (ver && !Object.hasOwn(s.inv.versions, ver)) throw new Error(`${id} has no object version ${ver}`);
    if (s.kind === 'owner') {
      wait.replaceWith(h('p', {}, 'This object is the key log of an owner: ',
        h('a', { href: pages.owner(parseId(id).owner) }, 'the page of the owner'), '.'));
      return;
    }
    shown = ver || s.shown;
    descs = new Map(await Promise.all([...new Set([shown, ...s.hist])].map(async (v) =>
      [v, await a.descriptions(id, s.inv, v, options).catch(() => ({ obj: s.objOf(v), dc: null }))])));
    const genesis = await a.bytes(id, s.inv, versionsOf(s.inv)[0], 'genesis.json', options).catch(() => null);
    if (genesis) rec = await readGenesis(genesis).catch(() => null);
  } catch (error) {
    if (!options.signal?.aborted) wait.replaceWith(errorBox(`The object ${id} cannot be read.`, error));
    return;
  }
  if (options.signal?.aborted) return;
  wait.remove();
  const { obj, dc } = descs.get(shown);
  const fileUrl = (v) => (p) => { try { return a.fileUrl(id, s.inv, v, p); } catch { return null; } };
  const parts = parseId(id);
  const kind = obj?.kind ?? s.kind;
  const isDocument = kind === 'document';
  const status = s.line ? s.line.statuses[versionNumber(shown) - 1] : null;
  append(root,
    h('header', { class: 'page-head' },
      h('p', { class: 'kicker' }, parts.draft ? 'Draft' : isDocument ? 'Document' : 'Collection', ' · ',
        h('a', { href: pages.archive() }, a.name)),
      h('h1', {}, rich(titleOf(dc) || a.labelOf(id) || id)),
      h('p', { class: 'creators' }, creatorsOf(dc).join('; ')),
      h('p', { class: 'chips' }, a.labelOf(id) ? [h('code', {}, a.labelOf(id)), ' '] : null, statusChip(s.status), ' ',
        chip(`object version ${shown}`), ' ', status ? [verdictChip(status, 'the status of its signatures (section 7.3)'), ' '] : null,
        isDocument && obj?.documentVersion ? chip(`document version ${obj.documentVersion}`) : null, ' ',
        shown === s.current && isDocument ? chip('current version', 'ok') : null,
        kind === 'collection' ? h('a', { class: 'button', href: pages.collection(ref(a, id), shown) }, 'Members →') : null)),
    parts.draft ? null : identity(ctx, s, id, shown, rec),
    objectState(ctx, s, id, shown, obj, fileUrl, status),
    abstractOf(dc) ? section('Abstract', h('p', { class: 'abstract' }, rich(abstractOf(dc)))) : null,
    isObject(s.head?.parent) ? branchPoints(ctx, s, id) : null,
    section(`Object version ${shown}`, versionFacts(ctx, s, id, shown, obj, dc, fileUrl(shown))),
    section('Files', filesTable(ctx, s, id, shown, obj)),
    isDocument ? documentVersions(s, id, shown, descs, ref(a, id), rec) : null,
    objectVersions(s, ref(a, id), shown, rec),
    section('The files as recorded',
      jsonView('object.json', obj, fileUrl(shown)('object.json')),
      jsonView('datacite.json', dc, fileUrl(shown)('datacite.json')),
      rec ? jsonView('genesis.json', rec, fileUrl(shown)('genesis.json')) : null,
      lazyJson(`inventory.json of ${shown}`, () => a.inventory(id, shown, options), a.inventoryUrl(id, shown))));
}

function lineUri(id, rec) {
  const { name, owner } = parseId(id);
  return rec?.originator === owner ? `sheaf:${name}` : `sheaf:${name}:${owner}`;
}

function pinUri(s, id, ver, rec) {
  const k = versionNumber(ver);
  const n = s.objOf(ver)?.documentVersion;
  const st = s.line?.statuses[k - 1];
  if (!Number.isInteger(n) || !['signed', 'vouched for', 'contested'].includes(st)) return null;
  return `${lineUri(id, rec)}/v${n}?sha512=${s.line.versions[k - 1].digest}`;
}

function identity(ctx, s, id, shown, rec) {
  const { name, owner } = parseId(id);
  const pin = pinUri(s, id, shown, rec);
  return facts([
    ['Line', h('code', { class: 'uri' }, lineUri(id, rec))],
    ['This version', pin ? h('code', { class: 'uri' }, pin) : h('span', { class: 'muted' }, 'not signed: it has no pin a reader may rely on (section 7.3)')],
    ['Identifier', h('code', {}, id)],
    ['Name', [h('code', {}, name), rec && rec.originator !== owner ? h('span', { class: 'muted' }, ' (a branch: its owner is not the originator of the work)') : null]],
    ['Owner', h('a', { href: pages.owner(owner) }, h('code', {}, owner))],
    ['Originator', rec?.originator && rec.originator !== owner ? h('a', { href: pages.owner(rec.originator) }, h('code', {}, rec.originator)) : null],
    ['Created', rec?.created ?? null],
  ]);
}

function objectState(ctx, s, id, shown, obj, fileUrl, status) {
  const latest = s.latest ? s.objOf(s.latest) : s.head;
  const at = s.latest || s.inv.head;
  const parts = [];
  if (latest?.status === 'withdrawn' || latest?.withdrawal) {
    const w = latest.withdrawal || {};
    parts.push(h('div', { class: 'alert bad', role: 'note' },
      h('strong', {}, 'Withdrawn'), w.date ? ` on ${w.date}` : '', '. ',
      noteView(w.reason, fileUrl(at)),
      h('span', { class: 'muted' }, ' The versions are kept, signed and pinned as before (section 13.1).')));
  }
  if (parseId(id).draft) {
    parts.push(h('div', { class: 'alert warn' }, 'A draft: unfinished work, never signed, pinned or named by a sheaf: URI, ',
      'which may be rewritten or deleted. Nothing may rely on it (section 10.1).'));
  } else if (s.line && !s.latest) {
    parts.push(h('div', { class: 'alert bad' }, 'This line has no signed version that is not contested: nothing may rely on it ',
      '(section 7.3). Its versions are shown with their statuses.', s.line.unnamed
        ? ' The key log of its owner is not in this archive, so its signature files cannot be named, and are not checked.' : ''));
  }
  if (status === 'contested') {
    parts.push(h('div', { class: 'alert bad' }, `Object version ${shown} is contested: it would not be signed without signatures `,
      'made with a key its owner has exposed, or naming a version of the key log from a fork point on (section 7.3).'));
  } else if (status === 'invalid' || status === 'unsigned') {
    parts.push(h('div', { class: 'alert bad' }, `Object version ${shown} is not a version of the line (${status}): `,
      'it is shown as a file of the archive, not as a version of the work (section 7.3).'));
  } else if (status === 'unchecked') {
    parts.push(h('div', { class: 'alert warn' }, `Object version ${shown} is unchecked: the version of the key log its signatures name `,
      'is not reached (section 7.3).'));
  }
  if (!ctx.archive.entry(id) && !parseId(id).draft) parts.push(h('div', { class: 'alert warn' }, 'This object is not listed in the discovery document.'));
  if ((obj?.kind ?? s.kind) === 'document' && shown !== s.current) {
    const current = s.objOf(s.current);
    parts.push(h('div', { class: 'alert' }, `This is object version ${shown}, holding document version ${obj?.documentVersion ?? '?'}. `,
      'The current version is ', h('a', { href: pages.object(ref(ctx.archive, id), s.current) },
        `document version ${current?.documentVersion ?? '?'} (object version ${s.current})`), '.',
      s.hist.includes(shown) ? '' : ' A later object version holds the same document version, with its latest description.'));
  }
  const notices = Array.isArray(latest?.notices) ? latest.notices : [];
  if (notices.length) {
    parts.push(section('Notices', h('ul', { class: 'notices' }, notices.map((n) => h('li', {
      class: n?.documentVersion === obj?.documentVersion ? 'about-this' : '' },
      h('strong', {}, `About version ${n?.documentVersion ?? '?'}`), n?.date ? ` (${n.date})` : '', ': ',
      noteView(n, fileUrl(at)))))));
  }
  return parts;
}

function branchPoints(ctx, s, id) {
  const a = ctx.archive;
  const list = h('ul', { class: 'plain' });
  let before = null;
  for (const v of versionsOf(s.inv)) {
    const obj = s.objOf(v);
    const p = obj?.parent;
    if (!isObject(p) || (before && JSON.stringify(p) === JSON.stringify(before))) continue;
    before = p;
    const mark = h('span', {}, loading('Checking…'));
    const pid = typeof p.name === 'string' && typeof p.owner === 'string' ? objectId(p.name, p.owner) : null;
    const base = typeof p.url === 'string' && p.url.includes('/ocfl/') ? p.url.split('/ocfl/')[0] + '/' : null;
    list.append(h('li', {}, h('strong', {}, `At ${v}: `), 'object version ', String(p.objectVersion ?? '?'),
      ` (document version ${String(p.documentVersion ?? '?')}) of `, h('code', {}, String(pid ?? '?')), ' ',
      digest(p.inventorySha512), ' ', mark,
      base ? [' · ', h('a', { href: elsewhere(base, pid ? pages.object(pid, p.objectVersion) : '') }, 'explore the parent')] : null));
    (async () => {
      const genesis = await a.bytes(id, s.inv, v, 'genesis.json', { signal: ctx.signal });
      const [result, why] = await verdict(levelOfVersion(a, id, s.inv, v, { signal: ctx.signal }), obj, genesis,
        (owner) => a.keyLog(owner, { signal: ctx.signal }).catch(() => null));
      mark.replaceChildren(verdictChip(result, why.join('; ') || null),
        why.length ? h('span', { class: 'small muted' }, ` ${why.join('; ')}`) : '');
    })().catch((error) => { if (!ctx.signal?.aborted) mark.replaceChildren(chip('not checked', 'warn'), ` ${error?.detail || error?.message}`); });
  }
  return section('Branch points', h('p', { class: 'muted small' }, 'This line is a branch: it continues the work from ',
    'a signed version of another line, whose evidence it holds (section 9). The verdict says whether the evidence ',
    'shows the branch point to be the parent owner’s (section 9.3).'), list);
}

function versionFacts(ctx, s, id, ver, obj, dc, fileUrl) {
  const list = (x) => (Array.isArray(x) ? x : []);
  const str = (x) => (x === null || x === undefined ? '' : String(x));
  const vinfo = s.inv.versions[ver] || {};
  const user = vinfo.user || {};
  const profiles = list(ctx.archive.disc.profiles);
  const label = ctx.archive.labelOf(id);
  return facts([
    ['Deposited', [timestamp(vinfo.created), user.name ? ` by ${user.name}` : '',
      typeof user.address === 'string' ? [' ', external(user.address, '↗')] : null]],
    ['Message', str(vinfo.message)],
    ['Previous', typeof obj?.previous === 'string' ? [digest(obj.previous), h('span', { class: 'muted' }, ' (the inventory of the version before)')] : null],
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
      `${str(e?.role)}: ${str(e?.service)}`, e?.label ? ` ${str(e.label)}` : '', ' ', external(str(e?.record), 'record'),
      e?.doi ? [' ', doiLink(e.doi)] : null,
      list(e?.files).length ? h('span', { class: 'muted' }, ` (files: ${list(e.files).map((f) => str(f?.name)).join(', ')})`) : null))],
    ['Relations', list(dc?.relatedIdentifiers).map((r) => h('div', {}, `${str(r?.relationType)} `,
      identifierLink(r?.relatedIdentifier, r?.relatedIdentifierType),
      h('span', { class: 'muted' }, ` (${str(r?.relatedIdentifierType)})`)))],
    ['Extensions', isObject(obj?.extensions) ? Object.keys(obj.extensions).join(', ') : null],
    ['Landing page', label && (profiles.includes('website') || profiles.includes('texmacs'))
      ? [external(`${ctx.archive.base}paper/${label}/`), h('span', { class: 'muted' }, ' (presentation, not authoritative)')] : null],
  ]);
}

function filesTable(ctx, s, id, ver, obj) {
  const a = ctx.archive;
  const files = filesOf(s.inv, ver);
  const list = (x) => (Array.isArray(x) ? x : []);
  const renditions = new Set(list(obj?.renditions).map((r) => r?.path));
  const notes = new Set([obj?.changes, obj?.licence, obj?.sourcesMissing, obj?.withdrawal?.reason, ...list(obj?.notices)]
    .map((n) => n?.path).filter(Boolean));
  const role = (p) => {
    if (p === 'object.json' || p === 'datacite.json') return 'description';
    if (p === 'genesis.json') return 'genesis record';
    if (isEvidence(p)) return 'evidence of the branch point';
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

function documentVersions(s, id, shown, descs, name, rec) {
  const latest = s.latest ? s.objOf(s.latest) : s.head;
  const notices = Array.isArray(latest?.notices) ? latest.notices : [];
  const recorded = Array.isArray(latest?.history);
  return section('Document versions',
    h('p', { class: 'muted small' }, 'In the order of the history, ',
      recorded ? 'as recorded in object.json' : 'which is the order of the numbers (no history is recorded)',
      s.latest ? `, read from the latest signed version, ${s.latest}` : ', read from the head (no version is signed)',
      ' (section 4.2). The last is the current version.'),
    h('ol', { class: 'versions' }, s.hist.map((v) => {
      const { obj, dc } = descs.get(v) || {};
      const n = obj?.documentVersion;
      const labels = (Array.isArray(obj?.external) ? obj.external : []).filter((e) => e?.label)
        .map((e) => `${e.service} ${e.label}`);
      const about = notices.filter((x) => x?.documentVersion === n).length;
      const pin = pinUri(s, id, v, rec);
      return h('li', { class: v === shown ? 'shown' : '' },
        h('a', { href: pages.object(name, v) }, `Version ${n ?? '?'}`), ' ',
        v === s.current ? chip('current', 'ok') : null, ' ',
        h('span', { class: 'muted' }, `object version ${v}`),
        labels.length ? [' · ', labels.join(', ')] : null,
        obj?.stage?.value ? [' · ', String(obj.stage.value)] : null,
        dateOf(dc, 'Available', 'Created') ? [' · ', dateOf(dc, 'Available', 'Created')] : null,
        about ? [' · ', chip(plural(about, 'notice'), 'warn')] : null,
        obj?.changes?.text ? h('div', { class: 'change' }, rich(obj.changes.text)) : null,
        pin ? h('div', { class: 'small' }, h('code', { class: 'uri' }, pin)) : null);
    })));
}

const ROLES = { new: 'new document version', description: 'description only', completion: 'completion',
                collection: 'collection version', unknown: 'unreadable' };

function objectVersions(s, name, shown, rec) {
  return section('Object versions',
    h('div', { class: 'table-wrap' }, h('table', { class: 'object-versions' },
      h('thead', {}, h('tr', {}, ['Version', 'Deposited', 'By', 'Document version', 'What it did', 'Signatures', 'Pin', 'Message']
        .map((t) => h('th', {}, t)))),
      h('tbody', {}, versionsOf(s.inv).reverse().map((v) => {
        const info = s.inv.versions[v] || {};
        const k = versionNumber(v);
        const st = s.line?.statuses[k - 1] ?? null;
        return h('tr', { class: v === shown ? 'shown' : '' },
          h('td', {}, h('a', { href: pages.object(name, v) }, v), v === s.inv.head ? [' ', chip('head')] : null,
            v === s.latest ? [' ', chip('latest signed', 'ok')] : null),
          h('td', {}, timestamp(info.created)), h('td', {}, String(info.user?.name ?? '')),
          h('td', { class: 'num' }, String(s.objOf(v)?.documentVersion ?? '?')),
          h('td', {}, ROLES[s.roles[v]] || ''),
          h('td', {}, st ? verdictChip(st, (s.line.judgements[k - 1] || []).map((j) => `${j.file}: ${j.status}${j.reason ? ' (' + j.reason + ')' : ''}`).join('\n') || null) : ''),
          h('td', {}, s.line ? digest(s.line.versions[k - 1]?.digest) : ''),
          h('td', {}, String(info.message ?? '')));
      })))));
}

function lazyJson(label, read, url) {
  const pre = h('pre', {}, 'Loading…');
  const box = h('details', { class: 'json' }, h('summary', {}, label, ' ', h('span', { class: 'muted' }, '(', external(url, 'raw'), ')')), pre);
  box.addEventListener('toggle', () => {
    if (!box.open || box.dataset.read) return;
    box.dataset.read = 'yes';
    read().then((value) => { pre.replaceChildren(...jsonText(value)); },
                (error) => { pre.textContent = `cannot be read: ${error?.detail || error?.message || error}`; });
  });
  return box;
}
