OpenSheaf Explorer, a literate program
======================================

> [!WARNING]
> **Draft.** OpenSheaf 0.1 is a draft specification: until version 1.0, a
> revision may change the format in incompatible ways, and the explorer
> follows the latest draft.

This is the source of the [OpenSheaf Explorer](https://opensheaf.org/explorer/),
a web application that explores and verifies
[OpenSheaf](https://opensheaf.org) archives and collections from a browser,
written as a literate program. An OpenSheaf archive is a folder of static
files: an [OCFL](https://ocfl.io) storage root in which every document is
an object, every version fixed by SHA-512 digests and described by
[DataCite](https://datacite.org) metadata; collections pin documents of
any archive by digest; a discovery document, `opensheaf.json`, makes it
all findable. Since everything is a file that any reader can fetch, a
browser can read an archive, show it, and check it against the
specification, with nothing installed and no server of its own.

The explorer does three things:

- it shows an archive: its discovery document, its objects, each object
  with every object version and every document version in the order of
  its history, its descriptions, notices, withdrawal, relations, licences
  and files;
- it shows collections, in their order, with their pins, resolving
  members in other archives and following member collections, down to a
  depth limit;
- it verifies an archive: the checks of section 14 of the specification
  that can be made over HTTP, in agreement with `osheaf verify`, the
  verifier of the reference implementation
  [opensheaf-py](https://opensheaf.org/opensheaf-py/), whose chapters this
  one follows and cites.

It is plain JavaScript: ES modules that the browser loads as they are,
with no framework, no build step and no library, not even from a CDN;
digests come from the browser's WebCrypto, and the JSON Schemas of the
specification are checked by a validator of its own. Everything it reads
is untrusted, and it never puts anything it reads into the page as HTML.

The files of the application (`index.html`, `app/*.js`, `style.css`,
`embed.js`) and its tests are *tangled* out of these documents (see
[tangling](90-tangle.md)) and kept in the repository, so that the
application is served as it stands; the documents are also *woven* into
this website (see [weaving](91-weave.md)). One edits the documents, never
the files. The JSON Schemas in `schemas/` and the symbol
`opensheaf-symbol.svg` are copies of the specification's own files.

Reading the code
----------------

Code is set in grey boxes. Above each box stands the name of its chunk,
with `≡` for the first fragment of a chunk and `+≡` for the ones that
continue it; a name in angle brackets inside the code, like
⟨the limits of the explorer⟩, is a reference to another chunk, and a link
to it. Below each box: where the chunk is used, and where it continues.
The [index of chunks](chunks.html) lists them all. Sections of the
specification are cited as "section 7.3"; the specification is at
[opensheaf.org](https://opensheaf.org/opensheaf-specification-0.1.html).

Reading archives
----------------

1. [Reading archives over HTTP](10-http.md): requests, limits, errors
   and what they mean (cross-origin requests above all), SHA-512.
2. [Untrusted names](11-paths.md): identifiers, versions and logical
   paths, and addresses built safely under the storage root.
3. [Validating against the JSON Schemas](12-schema.md): a validator for
   the keywords the schemas use, with formats as assertions.
4. [Document versions and history](13-versions.md): the history, the
   current version, and the rules of section 7.3.
5. [An archive read over HTTP](14-archive.md): the discovery document,
   inventories, pins and files.
6. [Resolving members](15-resolve.md): section 6.4, pins verified,
   mismatched, unavailable or removed, and a budget for walking
   collections.

Verifying
---------

7. [The rules of an archive](16-rules.md): the checks of the discovery
   document, inventories, object versions and member lists.
8. [Verifying an archive in the browser](17-verify.md): the whole
   verification, what it does not check, and why.

The pages
---------

9. [Building pages from untrusted data](20-dom.md).
10. [Mathematics as plain text](21-text.md).
11. [Pieces of pages](22-pieces.md), and the summaries of objects.
12. [The page of an archive](23-archive-page.md).
13. [The page of an object](24-object-page.md).
14. [The page of a collection](25-collection-page.md).
15. [The page of the verification](26-verify-page.md).
16. [The application](30-app.md): the three ways of using it, the start,
    the pages, embedding and self-hosting.
17. [The stylesheet](31-style.md).

The tests and the literate tools
--------------------------------

18. [The tests](70-tests.md): fixture archives made with `osheaf`, broken
    copies, and the comparison with `osheaf verify`.
19. [Tangling: from the documents to the program](90-tangle.md).
20. [Weaving: from the documents to the website](91-weave.md).
