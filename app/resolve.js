// Generated from literate/15-resolve.md by opensheaf-literate: edit the document, not this file.
import { Archive, baseOf } from './archive.js';
import { LIMITS } from './http.js';
import { isVersion, versionNumber } from './paths.js';
import { objectId, isNameOf, parseSheaf, readGenesis, isObject } from './names.js';
import { titleOf, creatorsOf, historyOf } from './versions.js';
import { SIGNED, VOUCHED, CONTESTED, UNCHECKED, UNSIGNED, INVALID } from './signatures.js';

export const MEMBER_STATUS = {
  [SIGNED]: 'verified', [VOUCHED]: 'verified', [CONTESTED]: 'contested', [UNCHECKED]: 'unchecked',
  [UNSIGNED]: 'not a version', [INVALID]: 'not a version',
};

export class Copy {
  constructor(where, archive, line) {
    Object.assign(this, { where, archive, line, id: line.id });
  }

  get head() {
    return this.line.versions.length;
  }

  get statuses() {
    return this.line.statuses;
  }

  get latestSigned() {
    return this.line.latest ? versionNumber(this.line.latest) : 0;
  }

  digest(n) {
    return n > 0 && n <= this.line.versions.length ? this.line.versions[n - 1].digest : null;
  }

  status(n) {
    return n > 0 && n <= this.statuses.length ? this.statuses[n - 1] : null;
  }

  find(digest) {
    const k = this.line.versions.findIndex((v) => v.digest === digest);
    return k < 0 ? null : k + 1;
  }

  obj(n) {
    return this.line.versions[n - 1]?.obj ?? null;
  }

  agrees(other) {
    const k = Math.min(this.latestSigned, other.latestSigned);
    return k === 0 || this.digest(k) === other.digest(k);
  }
}

export function found(status, copy = null, version = null, digest = null, copies = [], log = null) {
  return { status, copy, version, digest, copies, log, ok: status === 'verified' || status === 'contested' };
}

export class Resolver {
  constructor(http, home = null) {
    this.http = http;
    this.home = home;
    this.archives = new Map();
    this.logs = new Map();
    this.notes = [];
    if (home) this.archives.set(home.base, Promise.resolve(home));
  }

  again() {
    const fresh = new Resolver(this.http.another());
    if (this.home) fresh.home = this.home;
    return fresh;
  }

  note(level, message) {
    if (!this.notes.some((n) => n.level === level && n.message === message)) this.notes.push({ level, message });
  }

  source(where, options = {}) {
    const base = baseOf(where);
    if (!this.archives.has(base)) {
      const opening = Archive.open(this.http, base, options).then((archive) => {
        if (archive.old || archive.disc.specification !== '0.2') {
          this.note('warning', `unavailable: ${where}: not an archive of specification 0.2`);
          return null;
        }
        return archive;
      }, (error) => {
        if (error?.kind === 'aborted') {
          this.archives.delete(base);
          throw error;
        }
        this.note('warning', `unavailable: ${where}: ${error.kind === 'not-found' ? 'no discovery document opensheaf.json'
          : error.kind === 'json' ? 'the discovery document is not JSON' : error.detail || error.message}`);
        return null;
      });
      this.archives.set(base, opening);
    }
    return this.archives.get(base);
  }

  places(where) {
    const out = this.home ? [this.home.base] : [];
    for (const w of where) if (typeof w === 'string' && w && !out.includes(baseOf(w))) out.push(baseOf(w));
    return out;
  }

  async keyLog(owner, where = [], options = {}) {
    if (!this.logs.has(owner)) this.logs.set(owner, { log: null, met: new Set(), found: [] });
    const entry = this.logs.get(owner);
    for (const w of this.places(where)) {
      if (entry.met.has(w)) continue;
      entry.met.add(w);
      const archive = await this.source(w, options);
      if (!archive) continue;
      let log;
      try {
        log = await archive.keyLog(owner, options);
      } catch (error) {
        if (error?.kind === 'aborted') throw error;
        this.note('warning', `${w}: the key log of ${owner}: ${error.detail || error.message}`);
        continue;
      }
      if (!log || log.owner !== owner) continue;
      entry.found.push({ where: w, log });
      const before = entry.log;
      entry.log = before ? await before.meet(log) : log;
      if (before && before.forkPoint === null && entry.log.forkPoint !== null) {
        this.note('result', `a fork of the key log of ${owner} at v${entry.log.forkPoint}, met at ${w} (section 6.3)`);
      }
    }
    return entry.log;
  }

  ownerNotes(owner) {
    const log = this.logs.get(owner)?.log;
    if (!log) return [];
    const out = [];
    if (log.forkPoint) out.push(`owner ${owner} ended by a fork of its key log at v${log.forkPoint}`);
    else if (log.ended) out.push(`owner ${owner} ended`);
    if (log.successor) out.push(`owner ${owner}: successor ${log.successor} named by its ending version`);
    for (const did of [...log.exposedKeys()].sort()) out.push(`owner ${owner}: exposed key ${did}`);
    return out;
  }

  async copies(name, owner, where = [], options = {}) {
    const id = objectId(name, owner);
    const held = [];
    for (const w of this.places(where)) {
      const archive = await this.source(w, options);
      if (!archive) continue;
      if (archive !== this.home && !archive.objects().some((o) => o.id === id)) continue;
      await this.keyLog(owner, archive === this.home ? [] : [w], options);
      held.push({ w, archive });
    }
    const log = await this.keyLog(owner, [], options);
    const out = [];
    for (const { w, archive } of held) {
      let line;
      try {
        line = await archive.line(id, { log, signal: options.signal });
      } catch (error) {
        if (error?.kind === 'aborted') throw error;
        if (error?.kind !== 'not-found') this.note('warning', `${w}: ${id}: ${error.detail || error.message}`);
        continue;
      }
      const problem = await this.identityProblem(archive, id, line, options);
      if (problem) {
        this.note('warning', `${w}: ${id}: not a copy of the line: ${problem}`);
        continue;
      }
      out.push(new Copy(w, archive, line));
    }
    if (out.length && await this.tombstoned(id, where, options)) {
      this.note('result', `${id}: taken down in an archive read, and found elsewhere (section 12.3)`);
    }
    return out;
  }

  async identityProblem(archive, id, line, options) {
    if (line.inv.id !== id) return 'its inventory names another object';
    const [, name, owner] = id.split(':');
    let genesis = null;
    try {
      genesis = await archive.bytes(id, line.inv, 'v1', 'genesis.json', options);
    } catch (error) {
      if (error?.kind === 'aborted') throw error;
    }
    if (!genesis || !await isNameOf(name, genesis)) return 'the name is not a name of its genesis record (section 5.2)';
    for (const v of line.versions) {
      if (v.obj?.name !== name || v.obj?.owner !== owner) return `${v.ver}: object.json does not record the line`;
    }
    return null;
  }

  async tombstoned(id, where = [], options = {}) {
    for (const w of this.places(where)) {
      const archive = await this.source(w, options);
      if (archive?.tombstones().some((t) => t.id === id)) return true;
    }
    return false;
  }

  async pin(name, owner, version, digest, where = [], options = {}) {
    if (name === owner) {
      const log = await this.keyLog(owner, where, options);
      const v = log && isVersion(version) ? log.lookup(versionNumber(version), digest) : null;
      if (v) return found('verified', null, version, digest, [], log);
      return found(log ? 'mismatch' : 'unavailable', null, version, digest, [], log);
    }
    const copies = await this.copies(name, owner, where, options);
    const n = isVersion(version) ? versionNumber(version) : 0;
    for (const c of copies) {
      if (n && c.digest(n) === digest) return found(MEMBER_STATUS[c.status(n)] || 'not a version', c, version, digest, copies);
    }
    if (copies.length) return found('mismatch', null, version, digest, copies);
    return found(await this.tombstoned(objectId(name, owner), where, options) ? 'removed' : 'unavailable',
                 null, version, digest, copies);
  }

  async latest(name, owner, where = [], options = {}) {
    const copies = await this.copies(name, owner, where, options);
    const signed = copies.filter((c) => c.latestSigned).sort((a, b) => b.latestSigned - a.latestSigned);
    if (!signed.length) {
      const status = copies.length ? 'not a version'
        : await this.tombstoned(objectId(name, owner), where, options) ? 'removed' : 'unavailable';
      return found(status, null, null, null, copies);
    }
    const top = signed[0];
    const forks = signed.filter((c) => !top.agrees(c));
    for (const c of forks) {
      this.note('result', `a fork of the line ${top.id}: the copy at ${c.where} (latest signed ` +
        `v${c.latestSigned}) does not agree with the copy at ${top.where} (latest signed ` +
        `v${top.latestSigned}) (section 7.4)`);
    }
    if (forks.length) return found('fork', null, null, null, copies);
    return found('verified', top, `v${top.latestSigned}`, top.digest(top.latestSigned), copies);
  }

  async documentVersion(name, owner, n, where = [], options = {}) {
    const latest = await this.latest(name, owner, where, options);
    if (!latest.copy) return latest;
    const c = latest.copy;
    const objOf = (v) => c.line.objs.get(v) ?? null;
    for (const h of historyOf(c.line.inv, objOf, latest.version)) {
      if (objOf(h)?.documentVersion === n) {
        const k = versionNumber(h);
        return found(MEMBER_STATUS[c.status(k)] || 'not a version', c, h, c.digest(k), latest.copies);
      }
    }
    this.note('warning', `${c.id}: no document version ${n} in the history of ${latest.version}`);
    return found('unavailable', null, null, null, latest.copies);
  }

  async resolve(text, where = [], options = {}) {
    const u = parseSheaf(text, { short: true, fold: true });
    where = [...(u.at ? [u.at] : []), ...where];
    if (u.owner === '*') throw new Error('a work, sheaf:<name>:*, is searched for (section 12.4), which the explorer does not do');
    const [name, owner] = await this.expand(u, where, options);
    if (name === owner) {
      const id = objectId(owner, owner);
      const log = await this.keyLog(owner, where, options);
      if (!log) return { id, found: found('unavailable') };
      const side = log.side();
      if (u.version === null) {
        const v = side[side.length - 1];
        return { id, found: found('verified', null, `v${v.number}`, v.digest, [], log) };
      }
      if (u.sha512 === null) {
        if (u.version > side.length) return { id, found: found('unavailable', null, null, null, [], log) };
        return { id, found: found('verified', null, `v${u.version}`, side[u.version - 1].digest, [], log) };
      }
      return { id, found: await this.pin(owner, owner, `v${u.version}`, u.sha512, where, options) };
    }
    const id = objectId(name, owner);
    if (u.version === null) return { id, found: await this.latest(name, owner, where, options) };
    if (u.sha512 === null) return { id, found: await this.documentVersion(name, owner, u.version, where, options) };
    const copies = await this.copies(name, owner, where, options);
    for (const c of copies) {
      const k = c.find(u.sha512);
      if (k === null) continue;
      const held = c.obj(k)?.documentVersion;
      if (held !== u.version) {
        this.note('warning', `${id}: the version pinned holds document version ${held}, not ${u.version}`);
        return { id, found: found('mismatch', c, `v${k}`, u.sha512) };
      }
      return { id, found: found(MEMBER_STATUS[c.status(k)] || 'not a version', c, `v${k}`, u.sha512) };
    }
    const status = copies.length ? 'mismatch' : await this.tombstoned(id, where, options) ? 'removed' : 'unavailable';
    return { id, found: found(status, null, null, u.sha512, copies) };
  }

  async expand(u, where, options = {}) {
    if (u.isComplete() && u.owner !== null) return [u.name, u.owner];
    const candidates = new Set();
    for (const w of this.places(where)) {
      const archive = await this.source(w, options);
      if (!archive) continue;
      for (const o of archive.objects()) {
        const name = typeof o.name === 'string' ? o.name : '', owner = typeof o.owner === 'string' ? o.owner : '';
        if (!u.matches(name, owner)) continue;
        if (u.owner === null) {
          if (o.kind === 'owner' ? name !== owner : await this.originator(archive, o.id, options) !== owner) continue;
        }
        candidates.add(`${name} ${owner}`);
      }
    }
    if (candidates.size !== 1) {
      const listed = [...candidates].sort().map((c) => `  sheaf:${c.replace(' ', ':')}`).join('\n');
      throw new Error(`${u}: ` + (candidates.size ? 'ambiguous, the candidates are:\n' + listed
        : 'no line of that name in the archives read'));
    }
    return [...candidates][0].split(' ');
  }

  async originator(archive, id, options = {}) {
    try {
      const inv = await archive.inventory(id, null, options);
      const genesis = await archive.bytes(id, inv, 'v1', 'genesis.json', options);
      return genesis ? (await readGenesis(genesis)).originator ?? null : null;
    } catch (error) {
      if (error?.kind === 'aborted') throw error;
      return null;
    }
  }

  async describe(result, { presentCurrent = false } = {}, options = {}) {
    const c = result.copy;
    if (!c) return null;
    const objOf = (v) => c.line.objs.get(v) ?? null;
    const shown = presentCurrent ? historyOf(c.line.inv, objOf, result.version).slice(-1)[0] || result.version : result.version;
    const { obj, dc } = await c.archive.descriptions(c.id, c.line.inv, shown, options);
    const latest = c.line.latest ? objOf(c.line.latest) : null;
    return {
      version: shown, title: titleOf(dc), creators: creatorsOf(dc), documentVersion: obj?.documentVersion ?? null,
      status: latest?.status ?? null, withdrawal: latest?.withdrawal ?? null, archive: c.archive,
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

  first(id, ver) {
    const key = JSON.stringify([id, ver]);
    if (this.walked.has(key)) return false;
    this.walked.add(key);
    return true;
  }
}
