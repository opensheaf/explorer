An archive read over HTTP
=========================

An archive is found by its *base URL*, the folder holding its discovery
document `opensheaf.json` (sections 3 and 6.1). The discovery document
names the storage root (`storageRoot`, relative to the base URL or
absolute), and the storage root uses the flat-direct layout, so that the
object `<id>` is at `<storageRoot><id>/` and its version `<v>` at
`<storageRoot><id>/<v>/` (sections 5 and 6.4). Every object has an
inventory at its root (the head) and a copy of the inventory as of each
version in that version's folder, with a checksum file next to each
(section 7.1). Those are all the addresses the explorer needs.

This chapter gives the class `Archive`, which reads an archive through
these addresses, as `Remote` does in
[opensheaf-py](https://opensheaf.org/opensheaf-py/20-collections.html):
the discovery document, inventories, the files of a version by their
logical paths, pins, and histories. Every address is built under the
storage root by the functions of [untrusted names](11-paths.md),
and every answer goes through the [HTTP client](10-http.md), which keeps
it for the session.

The module is `app/archive.js`.

    // in app/archive.js:
    import { FetchError, parseJson, sha512, LIMITS } from './http.js';
    import { isObjectId, isVersion, under, underPath, contentPathProblem } from './paths.js';
    import { contentPath, historyOf, currentVersion, versionsOf } from './versions.js';

    <<the base URL of an archive>>

    <<an archive and its discovery document>>

The base URL
------------

A reader may give the base URL with or without its final slash, or the
address of a file in that folder: `opensheaf.json` itself, or a page of
the archive's website such as `index.html`. All mean the folder. A last
segment with an extension (a dot followed by a few letters or digits) is
taken as a file and dropped; one without is taken as a folder whose
final slash was left out. (A folder whose name has such an extension must
be given with its final slash.) A relative address is resolved against
the page (so that `../` names the folder above the explorer, see
[the application](30-app.md)).

    // in the base URL of an archive:
    export function baseOf(url, relativeTo = globalThis.location?.href) {
      const u = new URL(url, relativeTo);
      u.hash = '';
      u.search = '';
      let s = u.href;
      if (/\/[^/]*\.[A-Za-z0-9]{1,8}$/.test(u.pathname)) s = s.slice(0, s.lastIndexOf('/') + 1);
      return s.endsWith('/') ? s : s + '/';
    }

An address typed by a reader often lacks its scheme: `mgubi.org/papers/`,
or `localhost:8000/papers/` for an archive served on the reader's own
computer. Such an address is completed with `http:` for the reader's own
computer (`localhost`, `127.0.0.1`, `[::1]`), where archives are served
without TLS, and with `https:` otherwise. A host with a port
(`localhost:8000`) looks like a scheme to the URL parser, which would
read `localhost:8000/x` as the scheme `localhost:`; it is recognised
first. An address with a scheme (`https://`, or any `name://`) is left as it is, and so is one that does not start
with a host (a relative address such as `../`).

    // in the base URL of an archive:
    export function withScheme(given) {
      const s = String(given).trim();
      if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return s;
      const host = /^(\[[0-9a-f:.]+\]|[a-z0-9][a-z0-9.-]*)(:\d+)?(\/|$)/i.exec(s);
      if (!host || !(host[2] || host[1].includes('.') || host[1].toLowerCase() === 'localhost')) return s;
      const local = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(host[1]);
      return (local ? 'http://' : 'https://') + s;
    }

The archive
-----------

Opening an archive reads its discovery document, which is kept parsed
(the verification checks it against its schema in that form; the bytes
stay in the answers kept by the HTTP client, while they are kept). A
document that is not a JSON object cannot be read further. The storage root defaults to
`ocfl/`, the convention of section 5, when the document does not name
one, so that a damaged discovery document can still be explored and its
problems reported.

    // in an archive and its discovery document:
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

      <<the objects listed by the discovery document>>

      <<the addresses of an object>>

      <<inventories and pins>>

      <<the files of an object version>>

      <<the history of an object of an archive>>
    }

The objects are those listed in the discovery document; a server cannot
list folders, so the explorer knows no others (section 14). Entries that
are not objects with an identifier are left out here, and reported by the
verification. The tombstones are listed the same way.

    // in the objects listed by the discovery document:
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

The addresses of an object are built from checked names only: an
identifier that is not an object identifier, or a version that is not
`vN`, is refused before any request. A content path from the manifest
must moreover lie in a version's content directory. The folder of an
object, or of one of its versions, is the address of a file in it without
the file's name, so that it is built by the same checked function.

    // in the addresses of an object:
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

An inventory is read at the root of the object (the head) or in a
version's folder. A file that is not an object with `versions` and
`manifest` is not an inventory, and is refused here, so that the code
reading inventories can rely on their shape; so is an inventory with more
than `LIMITS.versions` object versions, since reading its history would
mean as many requests (section 15).

The *pin* of an object version is the SHA-512 of the bytes of its
inventory (section 10.2). As opensheaf-py does, the pin is compared with
the checksum file the archive publishes next to the inventory, and a
disagreement is an error: an inventory that does not match its own
checksum file is damaged or half-uploaded, whatever a collection says
about it.

    // in inventories and pins:
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

The files of an object version are found by their logical paths, through
the state of the version and the manifest; JSON files are read with the
limit of JSON, other files are only linked (or, when the digests are
checked, fetched by the verification with the limit of files).

    // in the files of an object version:
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

The history needs the `object.json` of the version it is read from and,
without `history`, of every earlier version, so all of them are fetched
first (they are small, and kept); the pure functions of
[the chapter on versions](13-versions.md) then do the rest.
`objectsOf(id, inv)` returns the `object.json` of every version as a map,
with `null` for a version whose file cannot be read.

    // in the history of an object of an archive:
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
