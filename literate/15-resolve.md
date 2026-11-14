Resolving members
=================

A collection names its members by the pair (archive identifier, object
identifier), with the address of the member's archive when the collection
version was made, and pins each of them: an object version and the
SHA-512 of its inventory (a catalogue), or a revision set, each
revision with its pin and the document version it holds (a selection;
section 10.2). Nothing is copied: to show a member, or to check it, the
explorer *resolves* it, as section 6.4 says:

- it reads the discovery document at the member's archive URL and fetches
  `<storageRoot><id>/<version>/inventory.json`;
- if this fails, it tries the mirrors listed in the member, then those
  listed in the archive's discovery document;
- external copies (the files of a DOI record, a software archive
  snapshot), which a client MAY also use, are not tried, as by opensheaf-py.

"Any copy whose bytes match the pinned digest is acceptable: integrity
comes from the pin, not from the place." Section 14 asks a verifier to
report each pin as *verified*, *mismatch* (a copy was found and does not
match), *unavailable* (no copy found) or *removed* (the object is
tombstoned in its archive, section 11.3).

The module is `app/resolve.js`.

    // in app/resolve.js:
    import { Archive, baseOf } from './archive.js';
    import { LIMITS } from './http.js';
    import { isVersion } from './paths.js';
    import { titleOf, creatorsOf } from './versions.js';

    <<the archives met while resolving>>

    <<the pin presented for a member>>

    <<a budget for walking collections>>

The archives met
----------------

A resolver keeps the archives it has opened, by base URL, so that the
members of one archive (usually many) cost one discovery document. The
archive being explored, if any, is known from the start: a member of it
is resolved there, whatever address the member recorded, since it is the
same archive and the explorer has just read its discovery document.

Only archives opened are kept, not openings in progress: an opening is
made with the signal of its caller, and a caller arriving while another's
opening is aborted must not inherit the abort. Two callers opening the
same archive at once still make one request, since the
[HTTP client](10-http.md) shares a request in progress among its callers;
an archive that fails to open is not kept, and is tried again.

    // in the archives met while resolving:
    export class Resolver {
      constructor(http, home = null) {
        this.http = http;
        this.home = home;
        this.archives = new Map();
        if (home) this.archives.set(home.base, home);
      }

      async open(url, options = {}) {
        const base = baseOf(url);
        if (!this.archives.has(base)) {
          const archive = await Archive.open(this.http, base, options);
          if (!this.archives.has(base)) this.archives.set(base, archive);
        }
        return this.archives.get(base);
      }

      <<confirm a pin at the sources of a member>>

      <<describe a resolved member>>
    }

Confirming a pin
----------------

The sources are tried in the order of section 6.4, and the first one
whose inventory matches the pin settles the question, as in `confirm` of
opensheaf-py's
[collections](https://opensheaf.org/opensheaf-py/20-collections.html).
Four cases need care, as there:

- the address of the member's archive may now serve another archive (a
  domain changed hands): the archive identifier of its discovery document
  must be the member's, or the source does not count;
- an object taken down in its archive is listed among its tombstones, and
  is *removed*, not unavailable;
- the pinned object version must hold the document version a revision
  states (section 14);
- any failure to read (a network error, a missing file, an inventory
  that disagrees with its own checksum file) makes a source unavailable,
  not the member wrong: only bytes found and different from the pin are a
  mismatch.

A hostile member, or a hostile discovery document, may list hundreds of
mirrors, each costing requests and perhaps a time limit; after the
member's archive, at most `LIMITS.mirrors` mirrors are tried (section 15),
and the problems say how many were left untried.

The answer gives the status, the source that settled it (and whether it
was a mirror, which a curator wants to know: the member's archive may be
gone), the archive read there, and what went wrong at each source tried.

    // in confirm a pin at the sources of a member:
    async confirm(m, ver, pin, n = null, options = {}) {
      const problems = [], errors = [];
      if (!isVersion(ver) || typeof pin !== 'string') {
        return { status: 'invalid', problems: ['the member has no valid pin'], errors };
      }
      const own = this.home && m.archive === this.home.archiveId;
      const sources = [];
      const add = (u) => { if (typeof u === 'string' && u && !sources.includes(u)) sources.push(u); };
      add(own ? this.home.base : m.archiveUrl);
      (Array.isArray(m.mirrors) ? m.mirrors : []).forEach(add);
      let mismatch = false;
      const tried = () => Math.min(sources.length, 1 + LIMITS.mirrors);
      for (let k = 0; k < tried(); k++) {
        const src = sources[k];
        try {
          const r = await this.open(src, options);
          if (k === 0) {
            if (r.archiveId !== m.archive) {
              problems.push(`${src} is now the archive ${r.archiveId}`);
              continue;
            }
            r.mirrors().forEach(add);
            if (r.tombstones().some((t) => t.id === m.id)) {
              return { status: 'removed', source: src, archive: r, problems, errors };
            }
          }
          if ((await r.pin(m.id, ver, options)) !== pin) {
            mismatch = true;
            problems.push(`${src}: the pin does not match`);
            continue;
          }
          if (n !== null && n !== undefined) {
            const inv = await r.inventory(m.id, ver, options);
            const obj = await r.json(m.id, inv, ver, 'object.json', options);
            if (obj?.documentVersion !== n) {
              mismatch = true;
              problems.push(`${src}: ${ver} does not hold document version ${n}`);
              continue;
            }
          }
          return { status: 'verified', source: src, viaMirror: k > 0, archive: r, problems, errors };
        } catch (error) {
          if (error.kind === 'aborted') throw error;
          errors.push(error);
          problems.push(`${src}: unavailable: ${error.detail || error.message}`);
        }
      }
      if (sources.length > tried()) {
        problems.push(`${sources.length - tried()} more mirror(s) not tried (at most ${LIMITS.mirrors} are tried)`);
      }
      return { status: mismatch ? 'mismatch' : 'unavailable', problems, errors };
    }

Describing a member
-------------------

The collection keeps a cached citation of each member (`cite`), which is
"not authoritative" (section 10.2). Once a member is resolved, the
explorer shows its description as its archive states it: the title and
creators of the version presented, and the status of the object, which
belongs to the object whatever version is pinned (section 11.1): a
withdrawal in the member's archive is shown, saying where it comes from.

    // in describe a resolved member:
    async describe(m, archive, options = {}) {
      const ver = presentedPin(m);
      let shown = ver;
      if (!Object.hasOwn(m, 'revisions')) shown = (await archive.history(m.id, ver, options)).current;
      const inv = await archive.inventory(m.id, null, options);
      const [{ dc, obj }, head] = await Promise.all([
        archive.descriptions(m.id, inv, shown, options),
        archive.json(m.id, inv, inv.head, 'object.json', options),
      ]);
      return {
        version: shown, title: titleOf(dc), creators: creatorsOf(dc),
        documentVersion: obj?.documentVersion ?? null,
        status: head?.status || null, withdrawal: head?.withdrawal || null,
      };
    }

The pin presented
-----------------

What is presented of a member is read at one of its pins: the last
revision of a selection's member (the revision "presented as the
selection's", section 10.2), or the single pin of a catalogue's member.
For a selection, the version shown is that revision itself; for a
catalogue, it is the current version of the member read from the history
of the pinned version ("presentations show the current version of each
member, read from the history of the pinned version", section 10.2),
which `describe` above finds once the member is resolved. A member
collection's own members are read at the pin presented.

    // in the pin presented for a member:
    export function presentedPin(m) {
      if (m && Object.hasOwn(m, 'revisions')) {
        const revs = Array.isArray(m.revisions) ? m.revisions : [];
        return revs.length ? revs[revs.length - 1]?.version : null;
      }
      return m?.version ?? null;
    }

A budget for walking collections
--------------------------------

Members may be collections, whose members may be collections, in any
archive. Pins cannot form cycles (a pin fixes an inventory, which cannot
contain its own digest), but a hostile archive can make a collection very
deep or very wide. Section 14 asks verifiers to limit the depth and size
of the collections they follow, and to report when they stop. A budget
counts the pins resolved in one walk and refuses to go deeper than the
depth limit. It counts pins rather than members, since each pin costs
requests (a member of a selection may pin many revisions). The pages say
when it stopped, and why. The pairs (archive,
object, version) already walked are remembered, so that the same
collection reached twice is not walked twice.

    // in a budget for walking collections:
    export class Budget {
      constructor({ depth = LIMITS.depth, pins = LIMITS.pins } = {}) {
        this.depth = depth;
        this.pins = pins;
        this.used = 0;
        this.walked = new Set();
        this.stopped = [];
      }

      allows(depth) {
        return depth <= this.depth && this.used < this.pins;
      }

      take(count) {
        const granted = Math.max(0, Math.min(count, this.pins - this.used));
        this.used += granted;
        return granted;
      }

      reason(depth) {
        if (depth > this.depth) return `the depth limit (${this.depth} levels of member collections) is reached`;
        return `the limit of ${this.pins} pins resolved in one walk is reached`;
      }

      first(archiveId, id, ver) {
        const key = JSON.stringify([archiveId, id, ver]);
        if (this.walked.has(key)) return false;
        this.walked.add(key);
        return true;
      }
    }
