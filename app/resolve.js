// Generated from literate/15-resolve.md by tools/tangle.py: edit the document, not this file.
import { Archive, baseOf } from './archive.js';
import { LIMITS } from './http.js';
import { isVersion } from './paths.js';
import { titleOf, creatorsOf } from './versions.js';

export class Resolver {
  constructor(http, home = null) {
    this.http = http;
    this.home = home;
    this.archives = new Map();
    if (home) this.archives.set(home.base, Promise.resolve(home));
  }

  open(url, options = {}) {
    const base = baseOf(url);
    if (!this.archives.has(base)) {
      const opening = Archive.open(this.http, base, options);
      this.archives.set(base, opening);
      opening.catch(() => this.archives.delete(base));
    }
    return this.archives.get(base);
  }

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
    for (let k = 0; k < sources.length; k++) {
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
    return { status: mismatch ? 'mismatch' : 'unavailable', problems, errors };
  }

  async describe(m, archive, options = {}) {
    const ver = presentedVersion(m);
    let shown = ver;
    if (!('revisions' in m)) shown = (await archive.history(m.id, ver, options)).current;
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
}

export function presentedVersion(m) {
  if (m && 'revisions' in m) {
    const revs = Array.isArray(m.revisions) ? m.revisions : [];
    return revs.length ? revs[revs.length - 1]?.version : null;
  }
  return m?.version ?? null;
}

export class Budget {
  constructor({ depth = LIMITS.depth, members = LIMITS.members } = {}) {
    this.depth = depth;
    this.members = members;
    this.used = 0;
    this.walked = new Set();
    this.stopped = [];
  }

  allows(depth) {
    return depth <= this.depth && this.used < this.members;
  }

  take(count) {
    const granted = Math.max(0, Math.min(count, this.members - this.used));
    this.used += granted;
    return granted;
  }

  reason(depth) {
    if (depth > this.depth) return `the depth limit (${this.depth} levels of member collections) is reached`;
    return `the limit of ${this.members} members resolved in one walk is reached`;
  }

  first(archiveId, id, ver) {
    const key = JSON.stringify([archiveId, id, ver]);
    if (this.walked.has(key)) return false;
    this.walked.add(key);
    return true;
  }
}
