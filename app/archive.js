// Generated from literate/14-archive.md by tools/tangle.py: edit the document, not this file.
import { FetchError, parseJson, sha512, LIMITS } from './http.js';
import { isObjectId, isVersion, under, underPath, contentPathProblem } from './paths.js';
import { contentPath, historyOf, currentVersion, versionsOf } from './versions.js';

export function baseOf(url, relativeTo = globalThis.location?.href) {
  const u = new URL(url, relativeTo);
  u.hash = '';
  u.search = '';
  let s = u.href;
  if (/\/[^/]*\.[A-Za-z0-9]{1,8}$/.test(u.pathname)) s = s.slice(0, s.lastIndexOf('/') + 1);
  return s.endsWith('/') ? s : s + '/';
}

export function withScheme(given) {
  const s = String(given).trim();
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
  const host = /^(\[[0-9a-f:.]+\]|[a-z0-9][a-z0-9.-]*)(:\d+)?(\/|$)/i.exec(s);
  if (!host || !(host[2] || host[1].includes('.') || host[1].toLowerCase() === 'localhost')) return s;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host[1]);
  return (local ? 'http://' : 'https://') + s;
}

export class Archive {
  static async open(http, url, options = {}) {
    const base = baseOf(url);
    const where = base + 'opensheaf.json';
    const disc = parseJson(await http.cached(where, options), where);
    if (!disc || typeof disc !== 'object' || Array.isArray(disc)) {
      throw new FetchError('json', where, 'is not a JSON object');
    }
    return new Archive(http, base, disc);
  }

  constructor(http, base, disc) {
    this.http = http;
    this.base = base;
    this.disc = disc;
    this.archiveId = typeof disc.archiveId === 'string' ? disc.archiveId : null;
    this.name = typeof disc.name === 'string' && disc.name ? disc.name : base;
    let root;
    try {
      root = new URL(typeof disc.storageRoot === 'string' ? disc.storageRoot : 'ocfl/', base).href;
    } catch {
      root = base + 'ocfl/';
    }
    this.root = root.endsWith('/') ? root : root + '/';
  }

  objects() {
    const list = Array.isArray(this.disc.objects) ? this.disc.objects : [];
    return list.filter((o) => o && typeof o === 'object' && isObjectId(o.id));
  }

  entry(id) {
    return this.objects().find((o) => o.id === id) || null;
  }

  tombstones() {
    const list = Array.isArray(this.disc.tombstones) ? this.disc.tombstones : [];
    return list.filter((t) => t && typeof t === 'object' && typeof t.id === 'string');
  }

  mirrors() {
    return (Array.isArray(this.disc.mirrors) ? this.disc.mirrors : []).filter((u) => typeof u === 'string');
  }

  url(id, ...segments) {
    if (!isObjectId(id)) throw new FetchError('unsafe', this.root, `${JSON.stringify(id)} is not an object identifier (section 6.3)`);
    return under(this.root, [id, ...segments]);
  }

  versionUrl(id, ver, file) {
    if (!isVersion(ver)) throw new FetchError('unsafe', this.root, `${JSON.stringify(ver)} is not an object version (section 7.1)`);
    return this.url(id, ver, file);
  }

  folderUrl(id, ver) {
    const folder = this.url(id, 'x').slice(0, -1);
    if (!ver) return folder;
    return this.versionUrl(id, ver, 'x').slice(0, -1);
  }

  contentUrl(id, inv, cp) {
    const problem = contentPathProblem(cp, inv?.contentDirectory || 'content');
    if (problem) throw new FetchError('unsafe', this.root, `the content path ${JSON.stringify(cp)} ${problem}`);
    return underPath(this.folderUrl(id), cp);
  }

  inventoryUrl(id, ver) {
    return ver ? this.versionUrl(id, ver, 'inventory.json') : this.url(id, 'inventory.json');
  }

  inventoryBytes(id, ver, options = {}) {
    return this.http.cached(this.inventoryUrl(id, ver), options);
  }

  async inventory(id, ver, options = {}) {
    const where = this.inventoryUrl(id, ver);
    const inv = parseJson(await this.inventoryBytes(id, ver, options), where);
    if (!inv || typeof inv !== 'object' || typeof inv.versions !== 'object' || !inv.versions ||
        typeof inv.manifest !== 'object' || !inv.manifest) {
      throw new FetchError('json', where, 'is not an OCFL inventory');
    }
    if (Object.keys(inv.versions).length > LIMITS.versions) {
      throw new FetchError('too-large', where, `has more than ${LIMITS.versions} object versions`);
    }
    return inv;
  }

  async sidecar(id, ver, options = {}) {
    const where = ver ? this.versionUrl(id, ver, 'inventory.json.sha512') : this.url(id, 'inventory.json.sha512');
    const bytes = await this.http.cached(where, { ...options, limit: 4096 });
    return new TextDecoder().decode(bytes).trim().split(/\s+/)[0] || '';
  }

  async pin(id, ver, options = {}) {
    const digest = await sha512(await this.inventoryBytes(id, ver, options));
    if ((await this.sidecar(id, ver, options)) !== digest) {
      throw new FetchError('digest', this.inventoryUrl(id, ver), 'the inventory does not match its checksum file');
    }
    return digest;
  }

  fileUrl(id, inv, ver, logical) {
    const cp = contentPath(inv, ver, logical);
    return cp ? this.contentUrl(id, inv, cp) : null;
  }

  async json(id, inv, ver, logical, options = {}) {
    const url = this.fileUrl(id, inv, ver, logical);
    if (!url) return null;
    return this.http.json(url, { ...options, limit: LIMITS.json });
  }

  async descriptions(id, inv, ver, options = {}) {
    const [obj, dc] = await Promise.all([
      this.json(id, inv, ver, 'object.json', options),
      this.json(id, inv, ver, 'datacite.json', options),
    ]);
    return { obj, dc };
  }

  async objectsOf(id, inv, options = {}) {
    const versions = versionsOf(inv);
    const objs = await Promise.all(versions.map((v) =>
      this.json(id, inv, v, 'object.json', options).catch((error) => {
        if (error.kind === 'aborted') throw error;
        return null;
      })));
    return new Map(versions.map((v, k) => [v, objs[k]]));
  }

  async history(id, at, options = {}) {
    const inv = await this.inventory(id, null, options);
    const objs = await this.objectsOf(id, inv, options);
    const objOf = (v) => objs.get(v) ?? null;
    return { inv, objs, hist: historyOf(inv, objOf, at || inv.head), current: currentVersion(inv, objOf, at || inv.head) };
  }
}
