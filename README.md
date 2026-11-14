# OpenSheaf Explorer

[![tests](https://github.com/opensheaf/explorer/actions/workflows/tests.yml/badge.svg)](https://github.com/opensheaf/explorer/actions/workflows/tests.yml)
[![licence: GPL v3+](https://img.shields.io/badge/licence-GPL--3.0--or--later-blue)](LICENSE)

> [!WARNING]
> **Draft.** OpenSheaf 0.1 is a draft specification. Until version 1.0, any
> revision may change the format in incompatible ways. Archives and collections made now
> may have to be rebuilt or migrated, and the explorer follows the latest draft.
> Do not rely on it yet for anything you cannot redo.

A static, client-side web application that explores and verifies
[OpenSheaf](https://opensheaf.org) archives and collections from a browser:
<https://opensheaf.org/explorer/>.

- **Explore** an archive: its discovery document, its objects (searchable),
  each document with every object version and every document version in the
  order of its history, its current version, descriptions, notices,
  withdrawal, relations, licences, external records (arXiv, Zenodo), and its
  files with their SHA-512 digests and links to download them; the JSON
  files as recorded.
- **Explore collections**: catalogues and selections, members in
  their order with their pins or revision sets and cached citations;
  members of other archives resolved as section 6.4 says (pins *verified*,
  *mismatch*, *unavailable* or *removed*), member collections opened in
  place, down to a depth limit.
- **Verify** an archive, in the browser, with progress, cancellation, and
  findings per object with the sections of the specification: the checks of
  section 14 that can be made over HTTP, in agreement with
  [`osheaf verify`](https://opensheaf.org/opensheaf-py/17-verify.html);
  optionally the digest of every file. The page lists what is not checked.

Plain ES modules, no framework, no build step, no dependency at run time
(not even a CDN): digests from WebCrypto, the JSON Schemas of the
specification checked by a validator of its own. Remote data is untrusted
and never inserted as HTML.

## Three ways to use it

1. **A link.** `https://opensheaf.org/explorer/?url=https://mgubi.org/papers/`.
   `url` is an archive's base URL (the folder holding `opensheaf.json`), or
   the address of an object version (`…/ocfl/<id>/<version>/`); add
   `&collection=<id>` to open a collection. The fragment names the page, so
   any state is a link: `#/object/<id>`, `#/object/<id>/<version>`,
   `#/collection/<id>`, `#/collection/<id>/<version>`, `#/verify`.
2. **A button on an archive's pages.**

   ```html
   <script src="https://opensheaf.org/explorer/embed.js" data-archive="./"></script>
   ```

   adds a link "Explore this archive" after the script, for the archive at
   `data-archive` (resolved against the page: `./` next to `opensheaf.json`,
   `../../` on a landing page `paper/<id>/`). Options: `data-object`,
   `data-collection`, `data-verify`, `data-label`, `data-target` (an element
   id), `data-unstyled` (style the class `opensheaf-explore` yourself).
3. **A copy in the archive (self-hosting).** Copy `index.html`, `app/`,
   `style.css`, `embed.js`, `schemas/` and `opensheaf-symbol.svg` into the
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
sends the header `Access-Control-Allow-Origin`. Section 5 of the
specification asks archives to send `Access-Control-Allow-Origin: *` for
`opensheaf.json`, the storage root and `witnesses/`; GitHub Pages does it for
every file. When an archive's host does not, the hosted explorer cannot read
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
node --test tests/*.test.mjs   # the tests (Node 22 or later), against the fixture archives
node tests/verify-url.mjs https://mgubi.org/papers/ [--digests] [--no-remote] [--all]
```

`literate tangle --where FILE:LINE` tells which line of which document a
line of a tangled file comes from. To try the application
locally, serve the repository (`python3 -m http.server`) and open
`http://localhost:8000/?url=…`. The fixture archives in `tests/fixtures/`
are made with [opensheaf-py](https://github.com/opensheaf/opensheaf-py)
by `sh tests/fixtures/make.sh`, with broken copies whose problems the tests
expect in the words of `osheaf verify`.

## Licence

GNU General Public License, version 3 or later. The JSON Schemas in
`schemas/` are those of the specification, dedicated to the public domain
under CC0 1.0. The OpenSheaf symbol (`opensheaf-symbol.svg`, also used by
the woven website) is licensed under CC BY 4.0, and its use as a mark
follows the OpenSheaf
[trademark policy](https://github.com/opensheaf/opensheaf.github.io/blob/main/TRADEMARKS.md).
