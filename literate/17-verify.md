Verifying an archive in the browser
===================================

`osheaf verify` checks an archive on disk. The explorer checks one over
HTTP, from the files any reader can fetch, which is the situation
OpenSheaf is designed for: an archive "checkable by anyone" (section 1).
This chapter fetches what the [rules](16-rules.md) need and adds the
checks that need further requests: the checksum files of inventories, the
discovery document against the storage root, the pins of collections,
accepted copies against their sources, and, when asked, the digest of
every file.

The verification runs in the page, for minutes on a large archive, so it
reports its progress, can be cancelled at any moment (a cancelled
verification keeps what it found), and collects its findings in a
*report*, which the [page of the verification](26-verify-page.md) shows.

The module is `app/verify.js`.

    // in app/verify.js:
    import { sha512, pool, LIMITS } from './http.js';
    import { versionsOf, filesOf, documentVersionErrors, memberPins } from './versions.js';
    import { finding, discoveryFindings, inventoryFindings, versionBasics, descriptionFindings,
             memberListFindings } from './rules.js';
    import { Resolver } from './resolve.js';
    import { same } from './schema.js';

    <<what the explorer does not check>>

    <<a report of findings>>

    <<verify an archive>>

    <<estimate the bytes of the content files>>

What is not checked
-------------------

Some checks of section 14 cannot be made over HTTP, some are optional,
and some opensheaf-py does not make either. They are listed here, once,
and shown with every report, so that "no errors" is never read as more
than it is.

    // in what the explorer does not check:
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

The report
----------

A report gathers the findings, counts them by level, and keeps the
numbers that say how much was checked: objects, object versions, pins,
files, requests and bytes. It tells its listeners about every new
finding, so that the page can show them as they come.

    // in a report of findings:
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

The verification
----------------

`verify(archive, options)` runs the checks in the order of the archive,
as opensheaf-py does: the discovery document, then each object with each
of its versions, then the checks across objects (the presentation, the
members of other archives, accepted copies), then, if asked, the digests
of the files. Its options are the schemas, `remote` (resolve the members
of other archives and the sources of accepted copies, as
`osheaf verify --remote`), `digests`, a `signal` to cancel, a
`progress` function called with the phase, the work done and the work to
do, and an `onFinding` function called with each finding as it is made.

A few objects are checked at once (each with its own requests, which the
HTTP client also limits), so that a slow object does not hold up the
others. What the checks across objects need of each object (its
inventory, its descriptions, whether it is a mirror) is kept in `seen`.
The functions that check one object are defined inside `verify`, where
they see the archive, the options and the report.

    // in verify an archive:
    export async function verify(archive, { schemas, remote = true, digests = false, signal,
                                            progress = () => {}, onFinding, resolver } = {}) {
      const report = new Report(archive, { remote, digests });
      if (onFinding) report.listeners.add(onFinding);
      const http = archive.http;
      const options = { signal };
      const seen = new Map();
      resolver = resolver || new Resolver(http, archive);
      const aborted = (e) => e?.kind === 'aborted' || signal?.aborted;
      <<checking one object>>
      try {
        <<check the discovery document and the storage root>>
        <<check every listed object>>
        <<check that the index shows the pins of the main collection>>
        if (remote) {
          <<check the members of other archives>>
          <<check the accepted copies against their sources>>
        }
        if (digests) {
          <<check the digest of every content file>>
        }
      } catch (error) {
        if (!aborted(error)) throw error;
        report.cancelled = true;
      }
      report.finished = new Date();
      report.requests = http.requests;
      return report;
    }

### The discovery document and the storage root

The discovery document is checked by the rules. The storage root must be
an OCFL storage root, which declares itself by the file `0=ocfl_1.1`
(OCFL 1.1, section 4.2); opensheaf-py checks that the file exists, and so
does the explorer. A verifier reading over HTTP cannot list the storage
root, so it says that completeness was not checked (section 14).

    // in check the discovery document and the storage root:
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

### Each object

Every object listed is checked; four at a time.

    // in check every listed object:
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

An object is checked as in opensheaf-py: its declaration as an OCFL
object, its inventory and the checksum file of the inventory, its entry
in the discovery document, each of its versions, and its document
versions. A file that cannot be read is an error of the object, with the
reason (a missing file, a damaged inventory), and the checks that need it
are skipped.

    // in checking one object:
    async function checkObject(entry) {
      const id = entry.id, where = `ocfl/${id}`;
      const add = (level, message, section, ver = null) => report.add(finding(level, where, message, section, { object: id, ver }));
      const cannot = (error, what, section, ver = null) => {
        if (aborted(error)) throw error;
        add('error', `${what}: ${error.detail || error.message}`, section, ver);
      };
      <<check the declaration, the inventory and the entry of an object>>
      const versions = versionsOf(inv);
      <<read the descriptions of every version>>
      <<check whether an object is a mirror, and its kind and status>>
      for (const ver of versions) {
        report.stats.versions++;
        <<check the inventory copy of an object version>>
        <<check an object version>>
      }
      for (const e of documentVersionErrors(inv, (v) => objs.get(v) ?? null)) add('error', e.message, '7.3', e.ver);
      seen.set(id, { entry, inv, objs, mems, mirrorOf });
    }

The inventory is read with its bytes, whose SHA-512 must be the content
of the checksum file (OCFL; section 7.1), and is what the discovery
document records as `inventorySha512` (section 6.1). If the entry has
another head or digest, the discovery document is stale (which happens
when `osheaf index` was not run after a change).

    // in check the declaration, the inventory and the entry of an object:
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

The descriptions of all versions are read first (they are small, and the
checks of later versions need earlier ones). A version whose files cannot
be read is reported once, here.

    // in read the descriptions of every version:
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

Whether the object is a mirror is read from its head, as everywhere in
opensheaf-py: a mirror's `object.json` names another archive. The entry
must then have `mirrorOf`, naming that archive, and only then (sections
6.1 and 10.4). Section 14 also asks that the discovery document list the
objects "with their kinds [...] and status as their head versions state
them"; opensheaf-py checks heads and digests, and the explorer also kinds
and status.

    // in check whether an object is a mirror, and its kind and status:
    const head = objs.get(inv.head);
    const mirrorOf = head && head.archiveId !== archive.archiveId ? head.archiveId : null;
    const listed = (message, section) => report.add(finding('error', 'opensheaf.json', message, section, { object: id }));
    if ((entry.mirrorOf ?? null) !== mirrorOf) {
      listed(`${id} ` + (mirrorOf ? `is a mirror of ${mirrorOf}, without mirrorOf` : 'is listed as a mirror, and is not one'), '6.1, 10.4');
    }
    if (head && entry.kind !== head.kind) listed(`lists ${id} as a ${entry.kind}, and its head says ${head.kind}`, '6.1, 14');
    if (head && entry.status !== head.status) listed(`lists ${id} as ${entry.status}, and its head says ${head.status}`, '6.1, 11.1');

Each version must have its own copy of the inventory, with its checksum
file, so that it can be pinned and fetched on its own (section 7.1);
opensheaf-py checks that both files exist. The explorer also checks that
the checksum file matches the copy, since the copy's digest is the pin of
that version, and that the copy agrees with the inventory at the root:
the copy of the head is the same file (OCFL 1.1, section 3.1), and an
earlier copy records the same versions as the root up to its own.

    // in check the inventory copy of an object version:
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

The rules of the version follow; a collection version also has its member
list checked, and the pins of members of this archive, in every version:
the pinned object version exists, its inventory has the pinned digest,
and, for a revision, it holds the stated document version (sections 10.2
and 14). Members of a mirror belong to the archive it copies, and are not
this archive's to check.

    // in check an object version:
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

A pin of a member of this archive is checked against the inventory of
this archive, without the checksum file (checked with the member's own
object), as opensheaf-py does. A pin to an object of this archive that
has a tombstone is reported as *removed*, "not as a corruption" (section
11.3); opensheaf-py reports it as unavailable. A revision set must also be
in the order of the document's history (section 10.2), read from the
head.

    // in checking one object:
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

### The presentation

The presentation is never authoritative (section 15), but it should not
lie: opensheaf-py checks that the index page shows the pin of every
member of the main collection (for a selection's member, the pin of the
revision presented), so that an index left behind after a change of the
collection is noticed. The explorer makes the same check on the
`index.html` next to the discovery document, if there is one.

    // in check that the index shows the pins of the main collection:
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

### Members of other archives

For the head of each collection of this archive (not of a mirror, whose
members are the original archive's to check), each member of another
archive is resolved as section 6.4 says, and each of its pins confirmed
by the [resolver](15-resolve.md). Members of other archives in earlier
versions of a collection are not resolved: section 14 makes it optional,
and opensheaf-py does not do it either. A pin that cannot be confirmed
anywhere is an error, as for opensheaf-py; the reasons at each source
tried come with it. A pin confirmed only on a mirror is a note: the
member's archive may be gone.

    // in check the members of other archives:
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

### Accepted copies

Section 14: "for each accepted copy, check that its first document
version holds exactly the files of the source version named in
`external`, when the source is available". An accepted copy is a document
of this archive (not a mirror) whose first object version records a
source with `service` `OpenSheaf`; the `record` is the address of the
source object version, and the digest of `inventory.json` under `files`
is its pin (section 10.5). The source's inventory is fetched and checked
against the pin, and the two states are compared, path by path, without
the two descriptions; since inventories record SHA-512 digests, no file
needs to be fetched. A source that cannot be read is a note, not an
error: the copy exists precisely so as not to depend on it.

    // in check the accepted copies against their sources:
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

### The digests of the files

When asked, every content file of every object is fetched and its SHA-512
compared with the manifest, as opensheaf-py does for every file on disk.
This is what makes verification slow: it reads the whole archive. A file
is read whole into memory (WebCrypto does not hash in pieces), within the
limit of files; a larger file is reported as not checked.

    // in check the digest of every content file:
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

The content files are those of the manifests, each content path once,
with its digest. Content paths that are not safe were reported with the
inventory, and are left out.

    // in checking one object:
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

Estimating the download
-----------------------

Before checking the digests, the page says how much it will download.
Inventories do not record sizes, so the size of each file is asked of the
server with a `HEAD` request: what it declares, which for files it
compresses is the compressed size, so the estimate is a lower bound.

    // in estimate the bytes of the content files:
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
