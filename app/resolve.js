// Generated from literate/15-resolve.md by opensheaf-literate: edit the document, not this file.
import { Archive, baseOf } from './archive.js';
import { LIMITS } from './http.js';
import { isVersion } from './paths.js';
import { titleOf, creatorsOf } from './versions.js';

export class Resolver {
  constructor(http, home = null) {
    this.http = http;
    this.home = home;
    this.archives = new Map();
    if (home) this.archives.set(home.base, home);
  }

  again() {
    const fresh = new Resolver(this.http.another());
    fresh.home = this.home;
    return fresh;
  }

  async open(url, options = {}) {
    const base = baseOf(url);
    if (!this.archives.has(base)) {
      const archive = await Archive.open(this.http, base, options);
      if (!this.archives.has(base)) this.archives.set(base, archive);
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

  async describe(m, archive, options = {}) {
    const ver = presentedPin(m);
    const inv = await archive.inventory(m.id, null, options);
    let shown = ver, limited = false;
    if (!Object.hasOwn(m, 'revisions')) {
      if (Object.keys(inv.versions).length > LIMITS.described) limited = true;
      else shown = (await archive.history(m.id, ver, options)).current;
    }
    const [{ dc, obj }, head] = await Promise.all([
      archive.descriptions(m.id, inv, shown, options),
      archive.json(m.id, inv, inv.head, 'object.json', options),
    ]);
    return {
      version: shown, title: titleOf(dc), creators: creatorsOf(dc),
      documentVersion: obj?.documentVersion ?? null,
      status: head?.status || null, withdrawal: head?.withdrawal || null, limited,
    };
  }
}

export function presentedPin(m) {
  if (m && Object.hasOwn(m, 'revisions')) {
    const revs = Array.isArray(m.revisions) ? m.revisions : [];
    return revs.length ? revs[revs.length - 1]?.version : null;
  }
  return m?.version ?? null;
}

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
