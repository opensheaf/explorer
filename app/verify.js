// Generated from literate/17-verify.md by tools/tangle.py: edit the document, not this file.
import { sha512, pool, LIMITS } from './http.js';
import { versionsOf, filesOf, documentVersionErrors, memberPins } from './versions.js';
import { finding, discoveryFindings, inventoryFindings, versionBasics, descriptionFindings,
         memberListFindings } from './rules.js';
import { Resolver } from './resolve.js';
import { same } from './schema.js';

export const NOT_CHECKED = [
  { section: '14', text: 'Completeness: whether the storage root holds objects that the discovery document does not list. A server does not list folders, so only the listed objects are checked.' },
  { section: '14', text: 'OCFL 1.1 as a whole. The explorer checks the declarations of the storage root and of each object, the inventories (versions without gaps, the head, the manifest, safe content paths), and the copy of the inventory in each version folder; osheaf verify also runs an independent OCFL validator when it is installed.' },
  { section: '13.1', text: 'The digests of the content files, unless "also check file digests" is chosen: without it, files are trusted to match their inventories (which are checked against their checksum files and the pins).' },
  { section: 'appendix D', text: 'datacite.json against the DataCite 4.7 XML Schema (neither does osheaf verify): only the properties section 8 requires are checked.' },
  { section: '7.1, 14', text: 'That the Available date of a version first made public by the archive is the date of its deposit (neither does osheaf verify).' },
  { section: '14', text: 'The pins of members of other archives in earlier versions of a collection (optional; neither does osheaf verify). Members of this archive are checked in every version.' },
  { section: '6.4', text: 'External copies (DOI records, software archive snapshots), which a client may use to resolve a member; neither does osheaf verify.' },
  { section: '13.2', text: 'Witnesses (signatures and timestamps): a server does not list their folders, and checking them needs OpenPGP, SSH or OpenTimestamps.' },
  { section: '4, 14', text: 'The requirements of the profiles (zenodo, texmacs, website) and of extensions: reported as notes.' },
];

export class Report {
  constructor(archive, options) {
    this.archive = archive;
    this.options = options;
    this.findings = [];
    this.stats = { objects: 0, versions: 0, pins: 0, files: 0, filesBytes: 0 };
    this.started = new Date();
    this.finished = null;
    this.cancelled = false;
    this.listeners = new Set();
  }

  add(...found) {
    for (const f of found) {
      this.findings.push(f);
      for (const listen of this.listeners) listen(f);
    }
  }

  counts() {
    const counts = { error: 0, warning: 0, info: 0 };
    for (const f of this.findings) counts[f.level]++;
    return counts;
  }

  text() {
    const lines = this.findings.filter((f) => f.level === 'error').map((f) => f.text);
    return [...lines, lines.length ? `${lines.length} problem(s)` : 'OK'].join('\n');
  }
}

export async function verify(archive, { schemas, remote = true, digests = false, signal,
                                        progress = () => {}, onFinding, resolver } = {}) {
  const report = new Report(archive, { remote, digests });
  if (onFinding) report.listeners.add(onFinding);
  const http = archive.http;
  const options = { signal };
  const seen = new Map();
  resolver = resolver || new Resolver(http, archive);
  const aborted = (e) => e?.kind === 'aborted' || signal?.aborted;
  async function checkObject(entry) {
    const id = entry.id, where = `ocfl/${id}`;
    const add = (level, message, section, ver = null) => report.add(finding(level, where, message, section, { object: id, ver }));
    const cannot = (error, what, section, ver = null) => {
      if (aborted(error)) throw error;
      add('error', `${what}: ${error.detail || error.message}`, section, ver);
    };
    try {
      await http.request(archive.url(id, '0=ocfl_object_1.1'), { limit: 4096, signal });
    } catch (error) {
      if (aborted(error)) throw error;
      add('error', error.kind === 'not-found' ? 'is not an OCFL object (no 0=ocfl_object_1.1)'
                                              : `cannot read 0=ocfl_object_1.1 (${error.detail})`, 'OCFL 4.3');
    }
    let inv, digest, side = null;
    try {
      digest = await sha512(await archive.inventoryBytes(id, null, options));
      inv = await archive.inventory(id, null, options);
    } catch (error) {
      cannot(error, 'cannot read the inventory', '7.1');
      return;
    }
    report.add(...inventoryFindings(id, inv));
    try {
      side = await archive.sidecar(id, null, options);
    } catch (error) {
      cannot(error, 'cannot read the inventory checksum file', '7.1');
    }
    if (side !== null && side !== digest) add('error', 'inventory checksum file does not match', '7.1, 13.1');
    if (entry.head !== inv.head || entry.inventorySha512 !== (side ?? digest)) {
      report.add(finding('error', 'opensheaf.json', `stale entry for ${id}`, '6.1, 14', { object: id }));
    }
    const versions = versionsOf(inv);
    const objs = new Map(), dcs = new Map(), mems = new Map();
    const read = async (ver, name, into) => {
      if (!(name in filesOf(inv, ver))) return;
      try {
        const value = await archive.json(id, inv, ver, name, options);
        if (!value || typeof value !== 'object' || Array.isArray(value)) add('error', `${name} is not a JSON object`, '9', ver);
        else into.set(ver, value);
      } catch (error) {
        cannot(error, `cannot read ${name}`, '7.1', ver);
      }
    };
    await Promise.all(versions.flatMap((ver) => [read(ver, 'object.json', objs), read(ver, 'datacite.json', dcs)]));
    const head = objs.get(inv.head);
    const mirrorOf = head && head.archiveId !== archive.archiveId ? head.archiveId : null;
    const listed = (message, section) => report.add(finding('error', 'opensheaf.json', message, section, { object: id }));
    if ((entry.mirrorOf ?? null) !== mirrorOf) {
      listed(`${id} ` + (mirrorOf ? `is a mirror of ${mirrorOf}, without mirrorOf` : 'is listed as a mirror, and is not one'), '6.1, 10.4');
    }
    if (head && entry.kind !== head.kind) listed(`lists ${id} as a ${entry.kind}, and its head says ${head.kind}`, '6.1, 14');
    if (head && entry.status !== head.status) listed(`lists ${id} as ${entry.status}, and its head says ${head.status}`, '6.1, 11.1');
    for (const ver of versions) {
      report.stats.versions++;
      try {
        const bytes = await archive.inventoryBytes(id, ver, options);
        const copyDigest = await sha512(bytes);
        const copySide = await archive.sidecar(id, ver, options);
        if (copySide !== copyDigest) add('error', 'the checksum file of the inventory copy does not match', '7.1', ver);
        if (ver === inv.head && copyDigest !== digest) add('error', 'the inventory copy of the head differs from the inventory', 'OCFL 3.1', ver);
        const copy = await archive.inventory(id, ver, options);
        if (versionsOf(copy).some((v) => !same(copy.versions[v], inv.versions[v]))) {
          add('error', 'the inventory copy disagrees with the inventory about the versions it records', 'OCFL 3.5.3', ver);
        }
      } catch (error) {
        if (aborted(error)) throw error;
        add('error', error.kind === 'not-found' ? 'has no inventory copy' : `cannot read the inventory copy (${error.detail})`, '7.1', ver);
      }
      report.add(...versionBasics(id, ver, inv));
      const obj = objs.get(ver), dc = dcs.get(ver);
      if (!obj || !dc) continue;
      report.add(...descriptionFindings({ id, ver, inv, obj, dc, archiveId: archive.archiveId, mirrorOf, schemas }));
      if (obj.kind !== 'document' && 'members.json' in filesOf(inv, ver)) {
        await read(ver, 'members.json', mems);
        const mem = mems.get(ver);
        if (mem) {
          report.add(...memberListFindings(id, ver, mem, schemas));
          if (!mirrorOf) await checkOwnPins(id, ver, mem, add);
        }
      }
    }
    for (const e of documentVersionErrors(inv, (v) => objs.get(v) ?? null)) add('error', e.message, '7.3', e.ver);
    seen.set(id, { entry, inv, objs, mems, mirrorOf });
  }

  async function checkOwnPins(id, ver, mem, add) {
    const tombstoned = new Set(archive.tombstones().map((t) => t.id));
    for (const m of Array.isArray(mem.members) ? mem.members : []) {
      if (!m || m.archive !== archive.archiveId) continue;
      for (const { version: pv, pin, documentVersion: n } of memberPins(m)) {
        report.stats.pins++;
        if (tombstoned.has(m.id)) {
          add('warning', `member ${m.id} ${pv}: removed (a tombstone in this archive)`, '11.3, 14', ver);
          continue;
        }
        try {
          const got = await sha512(await archive.inventoryBytes(m.id, pv, options));
          if (got !== pin) add('error', `member ${m.id} ${pv}: mismatch`, '10.2, 14', ver);
          else if (n !== null && n !== undefined) {
            const minv = await archive.inventory(m.id, null, options);
            const mobj = await archive.json(m.id, minv, pv, 'object.json', options);
            if (mobj?.documentVersion !== n) add('error', `member ${m.id} ${pv} does not hold document version ${n}`, '10.2, 14', ver);
          }
        } catch (error) {
          if (aborted(error)) throw error;
          add('error', `member ${m.id} ${pv}: unavailable`, '10.2, 14', ver);
        }
      }
      if (mem.type === 'selection' && Array.isArray(m.revisions) && !tombstoned.has(m.id)) {
        try {
          const { hist, objs: mobjs } = await archive.history(m.id, null, options);
          const order = hist.map((h) => mobjs.get(h)?.documentVersion);
          const pos = m.revisions.map((r) => order.indexOf(r?.documentVersion)).filter((k) => k >= 0);
          if (pos.some((k, i) => i > 0 && k < pos[i - 1])) {
            add('error', `member ${m.id}: revisions not in the order of the history`, '10.2', ver);
          }
        } catch (error) {
          if (aborted(error)) throw error;
        }
      }
    }
  }

  function contentFiles(seen) {
    const files = [];
    for (const [id, { inv }] of seen) {
      for (const [digest, paths] of Object.entries(inv.manifest)) {
        for (const cp of Array.isArray(paths) ? paths : []) {
          try {
            archive.contentUrl(id, inv, cp);
            files.push({ id, inv, cp, digest });
          } catch {
            // an unsafe content path, reported with the inventory
          }
        }
      }
    }
    return files;
  }
  try {
    report.add(...discoveryFindings(archive.disc, schemas));
    report.add(finding('info', 'opensheaf.json', 'only the listed objects are checked: a server does not list folders, so completeness is not checked', '14'));
    try {
      await http.request(archive.root + '0=ocfl_1.1', { limit: 4096, signal });
    } catch (error) {
      if (aborted(error)) throw error;
      report.add(finding('error', 'opensheaf.json', error.kind === 'not-found'
        ? 'storage root missing or with another layout'
        : `the storage root cannot be read (${error.detail})`, '5'));
    }
    const entries = archive.objects();
    let done = 0;
    const objectsAtOnce = pool(4);
    progress({ phase: 'objects', done, total: entries.length });
    await Promise.all(entries.map((entry) => objectsAtOnce(async () => {
      if (signal?.aborted) return;
      await checkObject(entry);
      report.stats.objects++;
      progress({ phase: 'objects', done: ++done, total: entries.length, current: entry.id });
    })));
    if (signal?.aborted) throw signal.reason;
    const main = seen.get(archive.disc.mainCollection);
    const mainMembers = main && main.mems.get(main.inv.head);
    if (mainMembers && Array.isArray(mainMembers.members)) {
      let html = null;
      try {
        html = await http.text(archive.base + 'index.html', options);
      } catch (error) {
        if (aborted(error)) throw error;
        if (error.kind !== 'not-found') report.add(finding('info', 'index.html', `cannot be read (${error.detail}); not checked`, 'appendix C'));
      }
      if (html !== null) {
        for (const m of mainMembers.members) {
          const pins = memberPins(m);
          const pin = pins[pins.length - 1]?.pin;
          if (!(typeof pin === 'string' && html.includes(pin.slice(0, 32)))) {
            report.add(finding('error', 'index.html', `does not show the pin of ${m?.id}`, 'appendix C, 15'));
          }
        }
      }
    }
    if (remote) {
      const collections = [...seen.entries()].filter(([, s]) => !s.mirrorOf && s.objs.get(s.inv.head)?.kind === 'collection');
      const pins = [];
      for (const [id, s] of collections) {
        const mem = s.mems.get(s.inv.head);
        for (const m of Array.isArray(mem?.members) ? mem.members : []) {
          if (!m || m.archive === archive.archiveId) continue;
          for (const p of memberPins(m)) pins.push({ id, ver: s.inv.head, m, ...p });
        }
      }
      let resolved = 0;
      progress({ phase: 'members', done: 0, total: pins.length });
      await Promise.all(pins.map(async ({ id, ver, m, version, pin, documentVersion }) => {
        const result = await resolver.confirm(m, version, pin, documentVersion, options);
        report.stats.pins++;
        const where = `ocfl/${id}`, context = { object: id, ver };
        const about = `member ${m.id} ${version}`;
        if (result.status === 'removed') {
          report.add(finding('warning', where, `${about}: removed (a tombstone in its archive)`, '11.3, 14', context));
        } else if (result.status !== 'verified') {
          const f = finding('error', where, `${about}: ${result.status}: ${result.problems.join('; ')}`, '6.4, 10.2, 14', context);
          f.errors = result.errors;
          report.add(f);
        } else if (result.viaMirror) {
          report.add(finding('info', where, `${about}: its archive failed; checked on the mirror ${result.source}`, '6.4', context));
        }
        progress({ phase: 'members', done: ++resolved, total: pins.length, current: m.id });
      }));
      for (const [id, s] of seen) {
        const first = versionsOf(s.inv)[0];
        const obj = s.objs.get(first);
        const external = Array.isArray(obj?.external) ? obj.external : [];
        const src = external.find((e) => e?.role === 'source' && e?.service === 'OpenSheaf');
        if (obj?.kind !== 'document' || s.mirrorOf || !src || typeof src.record !== 'string') continue;
        const where = `ocfl/${id}`;
        const pin = (Array.isArray(src.files) ? src.files : []).find((f) => f?.name === 'inventory.json')?.sha512;
        const record = src.record.replace(/\/+$/, '');
        const ver = record.slice(record.lastIndexOf('/') + 1);
        let bytes;
        try {
          bytes = await http.cached(record + '/inventory.json', options);
        } catch (error) {
          if (aborted(error)) throw error;
          report.add(finding('info', where, `the source of the accepted copy is unavailable (${error.detail}); not checked`, '10.5, 14', { object: id }));
          continue;
        }
        if ((await sha512(bytes)) !== pin) {
          report.add(finding('error', where, `accepted copy: the source ${src.label} does not match its pin`, '10.5, 14', { object: id }));
          continue;
        }
        const files = (state) => {
          const out = {};
          for (const [d, paths] of Object.entries(state || {})) {
            for (const p of Array.isArray(paths) ? paths : []) if (p !== 'datacite.json' && p !== 'object.json') out[p] = d;
          }
          return out;
        };
        let source;
        try {
          source = JSON.parse(new TextDecoder().decode(bytes));
        } catch {
          source = null;
        }
        if (!same(files(source?.versions?.[ver]?.state), files(s.inv.versions[first]?.state))) {
          report.add(finding('error', where, `accepted copy: its first version does not hold exactly the files of ${src.label}`, '10.5, 14', { object: id }));
        }
      }
    }
    if (digests) {
      const files = contentFiles(seen);
      let checked = 0;
      progress({ phase: 'digests', done: 0, total: files.length });
      await Promise.all(files.map(async ({ id, inv, cp, digest }) => {
        const add = (level, message) => report.add(finding(level, `ocfl/${id}`, message, '13.1', { object: id }));
        try {
          const bytes = await http.request(archive.contentUrl(id, inv, cp), { limit: LIMITS.file, signal });
          report.stats.files++;
          report.stats.filesBytes += bytes.length;
          if ((await sha512(bytes)) !== digest) add('error', `digest mismatch for ${cp}`);
        } catch (error) {
          if (aborted(error)) throw error;
          if (error.kind === 'not-found') add('error', `missing ${cp}`);
          else if (error.kind === 'too-large') add('warning', `${cp} is too large to be checked in the browser`);
          else add('error', `cannot read ${cp} (${error.detail})`);
        }
        progress({ phase: 'digests', done: ++checked, total: files.length, current: cp });
      }));
    }
  } catch (error) {
    if (!aborted(error)) throw error;
    report.cancelled = true;
  }
  report.finished = new Date();
  report.requests = http.requests;
  return report;
}

export async function estimateContent(archive, { signal, progress = () => {} } = {}) {
  const options = { signal };
  const files = [];
  for (const entry of archive.objects()) {
    try {
      const inv = await archive.inventory(entry.id, null, options);
      for (const paths of Object.values(inv.manifest)) {
        for (const cp of Array.isArray(paths) ? paths : []) {
          try {
            files.push(archive.contentUrl(entry.id, inv, cp));
          } catch {
            // unsafe: not fetched
          }
        }
      }
    } catch (error) {
      if (error.kind === 'aborted') throw error;
    }
  }
  let bytes = 0, unknown = 0, done = 0;
  await Promise.all(files.map(async (url) => {
    try {
      const size = await archive.http.size(url, options);
      if (size === null) unknown++;
      else bytes += size;
    } catch (error) {
      if (error.kind === 'aborted') throw error;
      unknown++;
    }
    progress({ phase: 'sizes', done: ++done, total: files.length });
  }));
  return { files: files.length, bytes, unknown };
}
