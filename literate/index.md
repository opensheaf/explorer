OpenSheaf Explorer, a literate program
======================================

> [!WARNING]
> **Draft.** OpenSheaf 0.2 is a draft specification: until version 1.0, a
> revision may change the format in incompatible ways, and the explorer
> follows the latest draft. It reads archives of version 0.2 only; an
> archive of version 0.1 is told to be rebuilt.

This is the source of the [OpenSheaf Explorer](https://opensheaf.org/explorer/),
a web application that explores and verifies
[OpenSheaf](https://opensheaf.org) archives and collections from a browser,
written as a literate program. An OpenSheaf archive is a folder of static
files: an [OCFL](https://ocfl.io) storage root in which every work is a
line, the history decided by one owner, whose versions the owner signs
with Ed25519 keys; every version fixed by SHA-512 digests and described by
[DataCite](https://datacite.org) metadata; works and owners named by
digests of their genesis records, the same in every archive; owners with
key logs that check themselves from their names; collections that pin
lines of any archive; a discovery document, `opensheaf.json`, that makes
it all findable. Since everything is a file that any reader can fetch,
and checks against names, digests and signatures, a browser can read an
archive, show it, and check it against the specification, with nothing
installed, no server of its own, and no trust in where the files come
from.

The explorer does four things:

- it shows an archive: its discovery document, its lines, each with its
  `sheaf:` URI, its owner, every object version with the status of its
  signatures and its pin, every document version in the order of its
  history, its descriptions, notices, withdrawal, branch points,
  relations, licences and files;
- it shows owners: their key logs, current and exposed keys, and whether
  they have ended, by an ending version or by a fork of their key logs;
- it shows collections, in their order, with their pins or revision
  sets, resolving members wherever their copies are, with the statuses of
  section 8.5, and following member collections, down to a depth limit;
- it verifies an archive: the checks of section 14 of the specification
  that can be made over HTTP, in agreement, finding by finding, with
  `osheaf verify`, the verifier of the reference implementation
  [opensheaf-py](https://opensheaf.org/opensheaf-py/), whose chapters this
  one follows and cites.

It is plain JavaScript: ES modules that the browser loads as they are,
with no framework, no build step and no library, not even from a CDN;
digests come from the browser's WebCrypto, and so do Ed25519 signatures
where the browser has them (with a small verifier of its own otherwise);
the JSON Schemas of the specification are checked by a validator of its
own. Everything it reads is untrusted, and it never puts anything it
reads into the page as HTML.

The files of the application (`index.html`, `app/*.js`, `style.css`,
`embed.js`) and its tests are *tangled* out of these documents and kept in
the repository, so that the application is served as it stands; the
documents are also *woven* into this website. One edits the documents,
never the files. The tangler and the weaver are a package of their own,
[opensheaf-literate](https://opensheaf.org/literate/) (the `literate`
command), written for OpenSheaf and itself a literate program: its chapters
explain the syntax of these documents and
[tangling](https://opensheaf.org/literate/10-tangle.html), and
[weaving](https://opensheaf.org/literate/20-weave.html). This project pins
a version of it in `requirements-literate.txt` and describes itself to it
in `literate.json`; `literate tangle --where FILE:LINE` tells which line of
which chapter a line of a tangled file comes from. The JSON Schemas in
`schemas/` and the symbol `opensheaf-symbol.svg` are copies of the
specification's own files.

Reading the code
----------------

Code is set in grey boxes. Above each box stands the name of its chunk,
with `≡` for the first fragment of a chunk and `+≡` for the ones that
continue it; a name in angle brackets inside the code, like
⟨the limits of the explorer⟩, is a reference to another chunk, and a link
to it. Below each box: where the chunk is used, and where it continues.
The [index of chunks](chunks.html) lists them all. Sections of the
specification are cited as "section 7.3"; the specification is at
[opensheaf.org](https://opensheaf.org/opensheaf-specification-0.2.html).

Names, owners and signatures
----------------------------

1. [Digests, encodings and signatures](05-crypto.md): SHA-256 and
   SHA-512, base32, base58btc, and Ed25519 verified as section 7.2 asks.
2. [Names, keys and sheaf: URIs](06-names.md): genesis records, names,
   `did:key` URIs, canonical JSON, `sheaf:` URIs.
3. [Owners and their key logs](07-owners.md): the computed first version,
   rotation, exposure, ending, fork records, copies met.
4. [Signatures and the statuses of versions](08-signatures.md): signature
   files, and signed, vouched for, contested, unchecked, not a version.
5. [Branches and their verdicts](09-branches.md): the evidence of a
   branch point, confirmed, unchecked or inconsistent.

Reading archives
----------------

6. [Reading archives over HTTP](10-http.md): requests, limits, errors
   and what they mean (cross-origin requests above all), SHA-512.
7. [Untrusted names and storage layouts](11-paths.md): identifiers,
   versions, logical paths, the two layouts, and addresses built safely
   under the storage root.
8. [Validating against the JSON Schemas](12-schema.md): a validator for
   the keywords the schemas use, with formats as assertions.
9. [Document versions and history](13-versions.md): the history, the
   current version, and the rules of section 4.2.
10. [An archive read over HTTP](14-archive.md): the discovery document,
    inventories, pins, files, key logs, and lines with their statuses.
11. [Resolution: copies, pins and sheaf: URIs](15-resolve.md): copies
    found and checked, the statuses of pins, the latest signed version
    among the copies that agree, and a budget for walking collections.

Verifying
---------

12. [The rules of an archive](16-rules.md): findings, descriptions,
    member lists, what the indexes should hold.
13. [Verifying an archive in the browser](17-verify.md): the whole
    verification, in agreement with `osheaf verify`, and what it does not
    check, and why.

The pages
---------

14. [Building pages from untrusted data](20-dom.md).
15. [Mathematics as plain text](21-text.md).
16. [Pieces of pages](22-pieces.md), and the summaries of objects.
17. [The page of an archive](23-archive-page.md).
18. [The page of an object](24-object-page.md).
19. [The page of a collection](25-collection-page.md).
20. [The page of the verification](26-verify-page.md).
21. [The page of an owner](27-owner-page.md).
22. [The application](30-app.md): the three ways of using it, the start,
    the pages, embedding and self-hosting.
23. [The stylesheet](31-style.md).

The tests
---------

24. [The tests](70-tests.md): fixture archives made with `osheaf`, broken
    copies, and the comparison with `osheaf verify`.
25. [The tests of names, keys and signatures](71-tests-identity.md),
    against appendix C of the specification and the edge cases of
    Ed25519.
26. [The tests across archives](72-tests-across.md): resolution, the
    statuses of pins, branch points.

The literate tools, tangling and weaving, are described in their own
literate program, [opensheaf-literate](https://opensheaf.org/literate/).
