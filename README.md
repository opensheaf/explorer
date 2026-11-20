# OpenSheaf Explorer

[![tests](https://github.com/opensheaf/explorer/actions/workflows/tests.yml/badge.svg)](https://github.com/opensheaf/explorer/actions/workflows/tests.yml)
[![pages](https://github.com/opensheaf/explorer/actions/workflows/pages.yml/badge.svg)](https://github.com/opensheaf/explorer/actions/workflows/pages.yml)
[![licence: GPL v3+](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue)](LICENSE)

> [!WARNING]
> **Draft.** OpenSheaf 0.2 is a draft specification. Until version 1.0, any
> revision may change the format in incompatible ways. Archives and collections made now
> may have to be rebuilt or migrated, and the explorer follows the latest draft: it reads
> archives of version 0.2 only, and tells an archive of version 0.1 that it must be rebuilt.
> Do not rely on it yet for anything you cannot redo.

A static, client-side web application that explores and verifies
[OpenSheaf](https://opensheaf.org) archives and collections from a browser:
<https://opensheaf.org/explorer/>.

- **Explore** an archive: its discovery document, its lines (searchable,
  by label), each with its `sheaf:` URI and its owner, every object version
  with the status of its signatures (signed, vouched for, contested,
  unchecked, or not a version) and its pin, every document version in the
  order of the history of the latest signed version, its current version,
  descriptions, notices, withdrawal, branch points with their verdicts,
  relations, licences, external records, and its files with their SHA-512
  digests and links to download them; the JSON files as recorded; its
  drafts and tombstones.
- **Explore owners**: the key log of each owner, checked from its owner
  name (the first version rebuilt from the genesis record, every later one
  signed by rotation keys), its current and exposed keys, and its end, by
  an ending version or by a fork of its key log.
- **Explore collections**: catalogues and selections, members in their
  order, by line (kind, name, owner and `at`), with their pins or revision
  sets and cached citations; members resolved wherever their copies are,
  with the statuses of section 8.5 (*verified*, *contested*, *mismatch*,
  *unchecked*, *not a version*, *unavailable*, *removed*); member
  collections opened in place, down to a depth limit.
- **Verify** an archive, in the browser, with progress, cancellation, and
  findings per object (errors, warnings and results): the checks of
  section 14 that can be made over HTTP, in agreement, finding by finding,
  with [`osheaf verify`](https://opensheaf.org/opensheaf-py/17-verify.html):
  storage and layout, the inventory chain, key logs, names, signatures and
  statuses, branch points, collections, the discovery document, tombstones
  and indexes; optionally the digest of every file. The page lists what is
  not checked.

Plain ES modules, no framework, no build step, no dependency at run time
(not even a CDN): digests from WebCrypto; Ed25519 signatures verified with
the strict checks of section 7.2 made first (S < L, canonical key and R,
neither of small order), then by WebCrypto where the browser has Ed25519,
or by a small verifier of its own; the JSON Schemas of the specification
checked by a validator of its own. Remote data is untrusted and never
inserted as HTML.

## Three ways to use it

1. **A link.** `https://opensheaf.org/explorer/?url=https://mgubi.org/papers/`.
   `url` is an archive's base URL (the folder holding `opensheaf.json`), or
   the address of an object version (`…/ocfl/<owner>/<name>/<version>/`,
   or the hashed path); add `&collection=<label>` to open a collection.
   The fragment names the page, so any state is a link: `#/object/<line>`,
   `#/object/<line>/<version>`, `#/collection/<line>`,
   `#/collection/<line>/<version>`, `#/owner/<owner name>`, `#/verify`,
   where a line is its label in the archive (`#/object/kpz-uniqueness`) or
   its identifier `sheaf:<name>:<owner>`.
2. **A button on an archive's pages.**

   ```html
   <script src="https://opensheaf.org/explorer/embed.js" data-archive="./"></script>
   ```

   adds a link "Explore this archive" after the script, for the archive at
   `data-archive` (resolved against the page: `./` next to `opensheaf.json`,
   `../../` on a landing page `paper/<label>/`). Options: `data-object` and
   `data-collection` (a label or an identifier `sheaf:<name>:<owner>`),
   `data-owner` (an owner name), `data-verify`, `data-label` (the text of
   the link), `data-target` (an element id), `data-unstyled` (style the
   class `opensheaf-explore` yourself).
3. **A copy in the archive (self-hosting).** Copy `index.html`, `app/`,
   `style.css`, `fonts/`, `embed.js`, `schemas/` and `opensheaf-symbol.svg` into the
   archive's site, for instance as `explorer/` next to `opensheaf.json`.
   Opened without `?url=`, it explores the archive one folder up (`../`).
   Every request is then same-origin.

## Security notes for embedding and self-hosting

`embed.js` runs in the pages that load it. A page loading it from
`opensheaf.org` trusts that site with its own content; to trust only a
known version, load it with Subresource Integrity, or self-host a copy.
The hash of the current file is computed with

```
openssl dgst -sha384 -binary embed.js | openssl base64 -A
```

and given as

```html
<script src="https://opensheaf.org/explorer/embed.js" data-archive="./"
        integrity="sha384-<the hash>" crossorigin="anonymous"></script>
```

(the browser then refuses any other content, so the hash must be updated
when the explorer's `embed.js` changes; a self-hosted copy avoids that).

The explorer's content security policy is set by a `<meta>` element, since
GitHub Pages sets no headers. A `<meta>` policy cannot set
`frame-ancestors`, so other sites may show the explorer in a frame. The
explorer performs no sensitive action (it only reads public files, with no
credentials), so this is acceptable; a self-hosted copy can forbid framing
with the header `Content-Security-Policy: frame-ancestors 'self'` if its
server sends headers.

## Cross-origin requests (CORS)

A page served from one site may read files of another only if that site
sends the header `Access-Control-Allow-Origin`. Section 3 of the
specification asks archives to allow cross-origin requests
(`Access-Control-Allow-Origin: *`) for the discovery document, the storage
root and the indexes; GitHub Pages does it for every file. When an archive's host does not, the hosted explorer cannot read
it, and says so (it tells a refused cross-origin request from an unreachable
server); the remedy is to send the header, or to self-host a copy (above).
The same holds for members of other archives in a collection: the explorer
reports them *unavailable*, with the reason.

## Building and testing

The sources are the Markdown documents in [`literate/`](literate/index.md),
woven at <https://opensheaf.org/explorer/source/>. The application and
the tests are tangled out of them and committed (never edit them directly:
see [AGENTS.md](AGENTS.md)). Tangling and weaving are done by
[opensheaf-literate](https://github.com/opensheaf/literate) (the `literate`
command; its own literate program is at
[opensheaf.org/literate](https://opensheaf.org/literate/)), pinned in
`requirements-literate.txt` and configured by `literate.json`:

```
pip install -r requirements-literate.txt   # once
literate tangle                # write the files out of literate/
literate tangle --check        # nothing differs (what the continuous integration checks)
literate weave                 # the website, in site/source/
node --test tests/             # the tests (Node 22 or later), against the fixture archives
node tests/verify-url.mjs https://mgubi.org/papers/ [--digests] [--no-remote] [--all]
```

`literate tangle --where FILE:LINE` tells which line of which document a
line of a tangled file comes from. To try the application
locally, serve the repository (`python3 -m http.server`) and open
`http://localhost:8000/?url=…`. The fixture archives in `tests/fixtures/`
are made with [opensheaf-py](https://github.com/opensheaf/opensheaf-py)
on specification 0.2 by `sh tests/fixtures/make.sh` (with `osheaf` on the
`PATH`; keys are made predictably by its test hook, and kept in a folder
of the script): three archives (the owner-name and the hashed layouts, an
exposed key, a key log that forks, a branch, a mirror, a takedown, a
draft, collections across archives) and twelve broken copies. What
`osheaf verify` finds in each is kept in `tests/fixtures/verify/`, and the
tests compare the explorer's verification with it, finding by finding.

## Licence

GNU General Public License, version 3 or later. The JSON Schemas in
`schemas/` are those of the specification, dedicated to the public domain
under CC0 1.0. The OpenSheaf symbol (`opensheaf-symbol.svg`, also used by
the woven website) is licensed under CC BY 4.0, and its use as a mark
follows the OpenSheaf
[trademark policy](https://github.com/opensheaf/opensheaf.github.io/blob/main/TRADEMARKS.md).
