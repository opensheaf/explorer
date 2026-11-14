The tests
=========

The modules that do not touch the page (reading archives, the validator,
the rules, the verification) run in Node as they run in the browser, and
are tested there with Node's own test runner, `node --test`, which needs
nothing installed: Node provides `fetch`, `Response` and WebCrypto as the
browser does. The pages are checked by hand, in a browser, against the
example archives of the templates and against a real archive (see the
[README](https://github.com/opensheaf/explorer#testing)).

The tests read *fixture archives*, small OpenSheaf archives made with
`osheaf` and kept in the repository, from the disk, through a `fetch`
that maps addresses to files. They check that the explorer finds no
problem where `osheaf verify` finds none, and that it finds, in the same
words, the problems `osheaf verify` finds in broken copies of them.

The fixtures
------------

Two archives are made, by a script that needs `osheaf` and is run by hand
when the fixtures must change (the result is kept, so the tests need
neither Python nor opensheaf-py). The first archive, `archive/`, holds
three documents that go through the unusual workflows of section 7.3: a
document with a version found later (which writes the history) and a
notice; a document deposited without its sources, then completed; and a
withdrawn document; its main collection, and a selection vetting two
revisions. The second, `other/`, holds an accepted copy of a version of
the first archive's document, a mirror of another, and a main collection
that pins objects of both archives. The second archive refers to the
first by its address, so the first is served on `127.0.0.1:8765` while
the second is made; the tests read both under that address, from the
disk.

    # in tests/fixtures/make.sh:
    #!/bin/sh
    # Build the fixture archives of the tests with osheaf (opensheaf-py):
    #   sh tests/fixtures/make.sh
    set -e
    cd "$(dirname "$0")"
    rm -rf archive other broken src
    mkdir src
    PORT=8765
    URL=http://127.0.0.1:$PORT
    python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
    SERVER=$!
    trap 'kill $SERVER' EXIT
    sleep 1
    <<the files of the fixture documents>>
    <<the first fixture archive>>
    <<the second fixture archive>>
    rm -rf src archive/paper archive/templates archive/sitemap.xml archive/style.css \
      other/paper other/templates other/sitemap.xml other/style.css
    python3 break.py

The documents are stand-ins: a line of LaTeX and a line pretending to be
a PDF, enough for the tools, which copy files byte for byte.

    # in the files of the fixture documents:
    for f in alpha-1 alpha-2 alpha-0 beta-1 gamma-1; do
      printf '%s\n' "\\documentclass{article}\\begin{document}$f\\end{document}" > src/$f.tex
      printf '%s\n' "%PDF-1.4 (a stand-in for the PDF of $f)" > src/$f.pdf
    done

The first archive: `alpha` has versions 1 and 2, a notice about version
1, and a version found later, placed after version 1 in the history;
`beta` is deposited without its sources and completed; `gamma` is
withdrawn. Its title and abstract have mathematics. The selection
`reading` vets two revisions of `alpha` and the current version of
`beta`.

    # in the first fixture archive:
    A="osheaf --root archive"
    osheaf init archive --archive-id tag:example.org,2026:fixture --name "A fixture archive" \
      --base-url $URL/archive/ --curator "Example, Ada"
    $A deposit alpha src/alpha-1.tex --pdf src/alpha-1.pdf --title 'Alpha: $\alpha$-stable laws' \
      --author "Example, Ada|University of Nowhere" --available 2024-01-10 --rights cc-by-4.0 \
      --abstract 'We study $\alpha$-stable laws on $\mathbb{R}^d$.'
    $A deposit alpha src/alpha-2.tex --pdf src/alpha-2.pdf --title 'Alpha: $\alpha$-stable laws' \
      --author "Example, Ada|University of Nowhere" --available 2024-03-01 --changes "Second version." --stage AM
    $A notice alpha --about 1 --text "Lemma 2 of version 1 is wrong as stated; corrected in version 2."
    $A deposit alpha src/alpha-0.tex --pdf src/alpha-0.pdf --title 'Alpha: $\alpha$-stable laws' \
      --author "Example, Ada|University of Nowhere" --created 2024-02-01 --after 1 \
      --changes "The submitted manuscript, found later."
    $A deposit beta --pdf src/beta-1.pdf --no-source "Only the PDF was kept." --title "Beta" \
      --author "Example, Ada" --available 2023-05-05 --rights cc-by-4.0
    $A complete beta --version 1 --source src/beta-1.tex
    $A deposit gamma src/gamma-1.tex --pdf src/gamma-1.pdf --title "Gamma" --author "Example, Ada" \
      --available 2022-02-02 --rights cc-by-4.0
    $A withdraw gamma --reason "Withdrawn for the tests."
    $A collect
    cat > src/reading.yaml <<YAML
    title: A reading list
    description: The versions read.
    type: selection
    members:
      - {archive: ., id: alpha, revisions: [1, 2]}
      - {archive: ., id: beta}
    YAML
    $A collection sync reading --from src/reading.yaml
    $A index
    $A verify

The second archive accepts version 2 of `alpha` as a document of its own
(section 10.5), mirrors `beta` (section 10.4), and keeps an archive
collection of objects of both archives: `alpha` followed, `gamma` at an
earlier version than its head, the first archive's selection, and its own
accepted copy.

    # in the second fixture archive:
    O="osheaf --root other"
    osheaf init other --archive-id tag:example.org,2026:other --name "Another fixture archive" \
      --base-url $URL/other/ --curator "Example, Ada" --curated
    $O accept $URL/archive/ alpha --version v2 --as alpha-copy --stage VoR
    $O mirror $URL/archive/ beta
    cat > src/shelf.yaml <<YAML
    title: A shelf
    description: Objects of two archives, kept whole.
    type: archive
    members:
      - {archive: $URL/archive/, id: alpha}
      - {archive: $URL/archive/, id: gamma, version: v1}
      - {archive: $URL/archive/, id: reading}
      - {archive: ., id: alpha-copy}
    YAML
    $O collection sync --from src/shelf.yaml
    $O index
    $O verify --remote

### Broken copies

Broken copies of the first archive each break one rule, as damage or
tampering would. A careful tamperer updates the digests too: a changed
file is re-digested in every inventory of its object (the manifest and the
fixity block), with their checksum files and the discovery document, so
that only the rule broken, and the pins of the collections that pinned
the old inventories, show. The copies are made by a Python script,
`tests/fixtures/break.py`, which `make.sh` runs.

    # in tests/fixtures/break.py:
    #!/usr/bin/env python3
    """Make broken copies of the fixture archive, for the tests:

        python3 tests/fixtures/break.py

    Each copy breaks one rule, as a damaged or tampered archive would."""
    import hashlib
    import json
    import shutil
    from pathlib import Path

    HERE = Path(__file__).resolve().parent
    SOURCE = HERE / "archive"


    <<rewriting a file of a fixture with its digests>>


    <<the broken copies>>

A file is found by its logical path through the root inventory, changed,
and the digests of the old bytes replaced by those of the new ones in
every inventory of the object; the checksum files and the entry of the
discovery document follow.

    # in rewriting a file of a fixture with its digests:
    def sha(data):
        return hashlib.sha512(data).hexdigest()


    def copy(name):
        target = HERE / "broken" / name
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(SOURCE, target)
        return target


    def logical(obj_dir, ver, path):
        """The content path of a logical path of an object version."""
        inv = json.loads((obj_dir / "inventory.json").read_text())
        for dig, paths in inv["versions"][ver]["state"].items():
            if path in paths:
                return inv["manifest"][dig][0]
        raise KeyError(path)


    def rewrite(root, obj_id, ver, path, change):
        """Change a file of an object version, re-digesting its inventories, their
        checksum files and the discovery document."""
        obj_dir = root / "ocfl" / obj_id
        cp = obj_dir / logical(obj_dir, ver, path)
        old = cp.read_bytes()
        new = change(old)
        cp.write_bytes(new)
        for inv in [obj_dir / "inventory.json", *obj_dir.glob("v*/inventory.json")]:
            text = inv.read_text()
            for algorithm in (hashlib.sha512, hashlib.sha256, hashlib.md5):  # the manifest and the fixity block
                text = text.replace(algorithm(old).hexdigest(), algorithm(new).hexdigest())
            inv.write_text(text)
            side = inv.with_name("inventory.json.sha512")
            side.write_text(f"{sha(inv.read_bytes())} inventory.json\n")
        disc = json.loads((root / "opensheaf.json").read_text())
        for o in disc["objects"]:
            if o["id"] == obj_id:
                o["inventorySha512"] = sha((obj_dir / "inventory.json").read_bytes())
        (root / "opensheaf.json").write_text(json.dumps(disc, indent=2) + "\n")


    def edit_json(edit):
        def change(data):
            value = json.loads(data)
            edit(value)
            return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()
        return change

The copies: a file changed on the server, its inventory left alone (only
the digests show it); a wrong pin in the selection; a gap in the
numbering of the document versions; a notice dropped by a later version;
a stale discovery document.

    # in the broken copies:
    root = copy("changed-file")
    obj_dir = root / "ocfl" / "alpha"
    pdf = obj_dir / logical(obj_dir, "v1", "paper.pdf")
    pdf.write_bytes(pdf.read_bytes() + b"tampered\n")

    root = copy("wrong-pin")
    def wrong_pin(mem):
        mem["members"][0]["revisions"][0]["inventorySha512"] = "0" * 128
    rewrite(root, "reading", "v1", "members.json", edit_json(wrong_pin))

    root = copy("gap")
    def renumber(obj):
        obj["documentVersion"] = 3
    def renumber_dc(dc):
        dc["version"] = "3"
    rewrite(root, "alpha", "v2", "object.json", edit_json(renumber))
    rewrite(root, "alpha", "v2", "datacite.json", edit_json(renumber_dc))

    root = copy("dropped-notice")
    def drop(obj):
        obj.pop("notices", None)
    rewrite(root, "alpha", "v4", "object.json", edit_json(drop))

    root = copy("stale")
    disc = json.loads((root / "opensheaf.json").read_text())
    for o in disc["objects"]:
        if o["id"] == "beta":
            o["head"] = "v1"
    (root / "opensheaf.json").write_text(json.dumps(disc, indent=2) + "\n")
    print("broken copies written in", HERE / "broken")

`osheaf verify` reports, on these copies (leaving out the messages of its
independent OCFL validator):

```
broken/changed-file:   ocfl/alpha: digest mismatch for v1/content/paper.pdf
broken/wrong-pin:      ocfl/reading: v1 member alpha v1: mismatch
broken/gap:            ocfl/alpha: v2 document version 3 breaks the numbering (expected 2)
                       ocfl/alpha: v3 document version 2 breaks the numbering (expected 4)
                       ocfl/alpha: v4 has other files than document version 3
                       ocfl/collection-main: v2 member alpha v4: mismatch
                       ocfl/reading: v1 member alpha v3: mismatch
broken/dropped-notice: ocfl/alpha: v4 drops or changes an earlier notice
                       ocfl/collection-main: v2 member alpha v4: mismatch
broken/stale:          opensheaf.json: stale entry for beta
```

The tests below expect exactly these lines from the explorer.

Reading fixtures from the disk
------------------------------

The tests give the HTTP client a `fetch` that answers addresses under
`http://127.0.0.1:8765/` with the files under `tests/fixtures/`, a 404 for
missing files, and a network error for any other address, as a browser
would for a server that is down. A list of the addresses requested can be
kept, to check that nothing is fetched outside the storage root, and
prefixes can be made to fail, to simulate an archive that disappeared.

    // in tests/disk.mjs:
    import { readFile } from 'node:fs/promises';

    export const ORIGIN = 'http://127.0.0.1:8765/';
    const FIXTURES = new URL('./fixtures/', import.meta.url);

    export function diskFetch({ log = [], down = [] } = {}) {
      return async (url, init = {}) => {
        log.push(url);
        if (!url.startsWith(ORIGIN) || down.some((prefix) => url.startsWith(prefix))) {
          throw new TypeError(`fetch failed: ${url}`);
        }
        const path = decodeURIComponent(new URL(url).pathname).slice(1);
        try {
          const bytes = await readFile(new URL(path, FIXTURES));
          const headers = { 'content-length': String(bytes.length) };
          return new Response(init.method === 'HEAD' ? null : bytes, { status: 200, headers });
        } catch {
          return new Response('not found', { status: 404 });
        }
      };
    }

    export async function readSchemas() {
      const { loadSchemas } = await import('../app/schema.js');
      return loadSchemas(async (url) => JSON.parse(await readFile(url, 'utf-8')));
    }

The validator
-------------

The validator is tested on the files of the fixtures, which must be
valid, and on files broken in the ways the schemas forbid: a missing
property, a pattern, a format, a `const`, an `if`/`then`, a `not`, an
`anyOf`, `dependentRequired`, `propertyNames`, `uniqueItems`.

    // in tests/schema.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { validate, FORMATS, same } from '../app/schema.js';
    import { readSchemas } from './disk.mjs';

    const schemas = await readSchemas();
    const object = schemas['opensheaf-object/0.1'];
    const collection = schemas['opensheaf-collection/0.1'];
    const archive = schemas['opensheaf-archive/0.1'];
    const fixture = async (path) => JSON.parse(await readFile(new URL(`./fixtures/${path}`, import.meta.url), 'utf-8'));
    const messages = (schema, data) => validate(schema, data).map((e) => `${e.path}: ${e.message}`);

    <<tests of the validator>>

The tests themselves:

    // in tests of the validator:
    test('the files of the fixtures are valid', async () => {
      assert.deepEqual(messages(archive, await fixture('archive/opensheaf.json')), []);
      assert.deepEqual(messages(archive, await fixture('other/opensheaf.json')), []);
      assert.deepEqual(messages(object, await fixture('archive/ocfl/alpha/v4/content/object.json')), []);
      assert.deepEqual(messages(collection, await fixture('archive/ocfl/reading/v1/content/members.json')), []);
    });

    test('formats are assertions', () => {
      assert.ok(FORMATS.date('2024-02-29'));
      assert.ok(!FORMATS.date('2023-02-29'));
      assert.ok(!FORMATS.date('2024-2-1'));
      assert.ok(FORMATS.uri('tag:opensheaf.org,2026:mgubi'));
      assert.ok(FORMATS.uri('https://mgubi.org/papers/'));
      assert.ok(!FORMATS.uri('ocfl/'));
      assert.ok(!FORMATS.uri('https://example.org/a b'));
      assert.ok(!FORMATS.uri('https://example.org/%zz'));
      assert.ok(FORMATS['uri-reference']('ocfl/'));
    });

    test('a discovery document breaking the schema', async () => {
      const disc = await fixture('archive/opensheaf.json');
      delete disc.name;
      disc.objects[0].head = 'v01';
      disc.archiveId = 'not a uri';
      disc.profiles = ['website', 'website'];
      assert.deepEqual(messages(archive, disc).sort(), [
        '/archiveId: "not a uri" is not a valid uri',
        '/objects/0/head: "v01" does not match ^v[1-9][0-9]*$',
        '/profiles: has repeated items',
        ': "name" is a required property',
      ]);
    });

    test('object.json: kinds, notes, withdrawal, extensions', async () => {
      const obj = await fixture('archive/ocfl/alpha/v4/content/object.json');
      assert.deepEqual(messages(object, { ...obj, kind: 'collection' }), [
        ': must not have mainSource, sourceFormat, sourcesMissing, renditions, toolchain, changes, stage, history, notices',
      ]);
      assert.deepEqual(messages(object, { ...obj, status: 'withdrawn' }), [': "withdrawal" is a required property']);
      assert.deepEqual(messages(object, { ...obj, changes: { path: 'x.md' } }), ['/changes: "mediaType" is required with "path"']);
      assert.match(messages(object, { ...obj, changes: {} })[0], /satisfies none of the alternatives/);
      assert.deepEqual(messages(object, { ...obj, extensions: { 'not a uri': {} } }), ['/extensions/not a uri: the name "not a uri" is not a valid uri']);
      assert.deepEqual(messages(object, { ...obj, renditions: [{ path: '../x.pdf', mediaType: 'application/pdf' }] }),
        ['/renditions/0/path: "../x.pdf" does not match ^(?!/)(?!(?:.*/)?\\.{1,2}(?:/|$)).+$']);
    });

    test('members.json: archive collections and selections', async () => {
      const mem = await fixture('archive/ocfl/reading/v1/content/members.json');
      const bad = structuredClone(mem);
      bad.members[0].version = 'v1';
      assert.deepEqual(messages(collection, bad), ['/members/0: must not have version, inventorySha512, follow']);
      bad.type = 'archive';
      assert.deepEqual(messages(collection, bad).sort(), [
        '/members/0: "inventorySha512" is a required property',
        '/members/0: must not have revisions',
        '/members/1: "inventorySha512" is a required property',
        '/members/1: "version" is a required property',
        '/members/1: must not have revisions',
      ]);
    });

    test('JSON values are compared whatever the order of keys', () => {
      assert.ok(same({ a: 1, b: [1, { c: 2, d: 3 }] }, { b: [1, { d: 3, c: 2 }], a: 1 }));
      assert.ok(!same([1, 2], [2, 1]));
    });

Untrusted names
---------------

    // in tests/paths.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { logicalPathProblem, contentPathProblem, under, isObjectId, isVersion } from '../app/paths.js';

    test('logical paths (sections 7.1 and 15)', () => {
      assert.equal(logicalPathProblem('figures/walk.pdf'), null);
      assert.equal(logicalPathProblem('/etc/passwd'), 'begins with /');
      assert.equal(logicalPathProblem('a/../b'), 'has a . or .. segment');
      assert.equal(logicalPathProblem('./a'), 'has a . or .. segment');
      assert.equal(logicalPathProblem('café.tex'), 'is not in Unicode normalisation form C');
      assert.equal(logicalPathProblem('café.tex'), null);
    });

    test('content paths stay in a version folder', () => {
      assert.equal(contentPathProblem('v2/content/paper.pdf'), null);
      assert.match(contentPathProblem('v2/other/paper.pdf'), /content directory/);
      assert.match(contentPathProblem('../alpha/v1/content/x'), /segment/);
      assert.match(contentPathProblem('v1/content//x'), /segment/);
      assert.equal(contentPathProblem('v1/data/x', 'data'), null);
    });

    test('addresses are built under the root, encoded', () => {
      const root = 'https://example.org/papers/ocfl/';
      assert.equal(under(root, ['alpha', 'v1', 'inventory.json']), root + 'alpha/v1/inventory.json');
      assert.equal(under(root, ['alpha', '0=ocfl_object_1.1']), root + 'alpha/0=ocfl_object_1.1');
      assert.equal(under(root, ['a', 'notes #2?.pdf']), root + 'a/notes%20%232%3F.pdf');
      assert.throws(() => under(root, ['..', 'x']), /segment/);
      assert.throws(() => under(root, ['a/b']), /has a \//);
      assert.throws(() => under(root, ['a\\b']), /backslash/);
    });

    test('identifiers and versions', () => {
      assert.ok(isObjectId('kpz-reloaded'));
      assert.ok(!isObjectId('KPZ'));
      assert.ok(!isObjectId('a'.repeat(65)));
      assert.ok(isVersion('v12'));
      assert.ok(!isVersion('v012'));
    });

Document versions
-----------------

The functions of document versions are tested on small inventories made
in the test, which is quicker to read than a fixture: each object version
is given by its document version and its own files.

    // in tests/versions.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { documentVersionErrors, defaultHistory, historyOf, currentVersion, rolesOf, memberPins } from '../app/versions.js';

    function make(versions) {
      const inv = { head: `v${versions.length}`, manifest: {}, versions: {} };
      const objs = new Map();
      versions.forEach(({ obj, files }, k) => {
        const ver = `v${k + 1}`;
        const state = { [`o${k}`]: ['object.json'], [`d${k}`]: ['datacite.json'] };
        for (const [p, digest] of Object.entries(files)) state[digest] = [...(state[digest] || []), p];
        inv.versions[ver] = { state };
        objs.set(ver, { kind: 'document', ...obj });
      });
      return { inv, objOf: (v) => objs.get(v) ?? null };
    }

    <<tests of document versions>>

A version found later writes the history, a description-only version
keeps it, and the current version is read from it; a completion keeps the
number of the version it completes; each rule broken gives its message.

    // in tests of document versions:
    test('a version found later, with a history', () => {
      const { inv, objOf } = make([
        { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
        { obj: { documentVersion: 2 }, files: { 'a.tex': 'a2' } },
        { obj: { documentVersion: 3, history: ['v1', 'v3', 'v2'] }, files: { 'a.tex': 'a0' } },
        { obj: { documentVersion: 2, history: ['v1', 'v3', 'v4'], notices: [{ documentVersion: 1, date: '2024-01-01', text: 'n' }] }, files: { 'a.tex': 'a2' } },
      ]);
      assert.deepEqual(documentVersionErrors(inv, objOf), []);
      assert.deepEqual(historyOf(inv, objOf), ['v1', 'v3', 'v4']);
      assert.equal(currentVersion(inv, objOf), 'v4');
      assert.equal(currentVersion(inv, objOf, 'v3'), 'v2');
      assert.deepEqual(rolesOf(inv, objOf), { v1: 'new', v2: 'new', v3: 'new', v4: 'description' });
    });

    test('without a history, the current version is the highest', () => {
      const { inv, objOf } = make([
        { obj: { documentVersion: 1, sourcesMissing: { text: 'lost' } }, files: { 'p.pdf': 'p1' } },
        { obj: { documentVersion: 2 }, files: { 'a.tex': 'a2' } },
        { obj: { documentVersion: 1 }, files: { 'p.pdf': 'p1', 'a.tex': 'a1' } },
      ]);
      assert.deepEqual(documentVersionErrors(inv, objOf), []);
      assert.deepEqual(defaultHistory(inv, objOf), ['v3', 'v2']);
      assert.equal(currentVersion(inv, objOf), 'v2');
      assert.equal(rolesOf(inv, objOf).v3, 'completion');
    });

    test('the rules of section 7.3', () => {
      const notice = { documentVersion: 1, date: '2024-01-01', text: 'n' };
      const { inv, objOf } = make([
        { obj: { documentVersion: 1, notices: [notice] }, files: { 'a.tex': 'a1' } },
        { obj: { documentVersion: 3 }, files: { 'a.tex': 'a3' } },
        { obj: { documentVersion: 1, history: ['v3', 'v2'] }, files: { 'a.tex': 'changed' } },
        { obj: { documentVersion: 3 }, files: { 'a.tex': 'a3' } },
      ]);
      assert.deepEqual(documentVersionErrors(inv, objOf).map((e) => `${e.ver} ${e.message}`), [
        'v2 document version 3 breaks the numbering (expected 2)',
        'v2 drops or changes an earlier notice',
        'v3 has other files than document version 1',
        'v3 history does not list each document version once',
        'v4 lacks the history of earlier versions',
      ]);
    });

    test('the pins of members', () => {
      assert.deepEqual(memberPins({ version: 'v2', inventorySha512: 'x' }), [{ version: 'v2', pin: 'x', documentVersion: null }]);
      assert.deepEqual(memberPins({ revisions: [{ documentVersion: 2, version: 'v3', inventorySha512: 'y' }] }),
        [{ version: 'v3', pin: 'y', documentVersion: 2 }]);
    });

Verification
------------

The verification of the fixtures: the two archives verify, with the
digests of every file, the members of other archives resolved and the
accepted copy compared with its source; nothing is fetched outside the
storage roots, the discovery documents and the index pages; the broken
copies give the problems that `osheaf verify` gives; and an archive that
has disappeared makes the members that pin it unavailable, and leaves
its accepted copy unchecked, with a note.

    // in tests/verify.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { Http } from '../app/http.js';
    import { Archive } from '../app/archive.js';
    import { verify } from '../app/verify.js';
    import { diskFetch, readSchemas, ORIGIN } from './disk.mjs';

    const schemas = await readSchemas();

    async function run(path, { digests = false, remote = true, log = [], down = [] } = {}) {
      const http = new Http({ fetch: diskFetch({ log, down }) });
      const archive = await Archive.open(http, ORIGIN + path);
      return verify(archive, { schemas, digests, remote });
    }

    const errors = (report) => report.findings.filter((f) => f.level === 'error').map((f) => f.text).sort();

    <<tests of the verification>>

The tests themselves:

    // in tests of the verification:
    test('the fixture archives verify', async () => {
      const log = [];
      const report = await run('archive/', { digests: true, log });
      assert.deepEqual(errors(report), []);
      assert.equal(report.stats.objects, 5);
      assert.ok(report.stats.files > 20);
      const allowed = (url) => url.startsWith(ORIGIN + 'archive/ocfl/') || url === ORIGIN + 'archive/opensheaf.json' ||
        url === ORIGIN + 'archive/index.html';
      assert.deepEqual(log.filter((url) => !allowed(url)), []);
      assert.deepEqual(errors(await run('other/', { digests: true })), []);
    });

    test('the broken copies give the problems osheaf verify gives', async () => {
      assert.deepEqual(errors(await run('broken/changed-file/', { digests: true })),
        ['ocfl/alpha: digest mismatch for v1/content/paper.pdf']);
      assert.deepEqual(errors(await run('broken/changed-file/')), []);
      assert.deepEqual(errors(await run('broken/wrong-pin/')), ['ocfl/reading: v1 member alpha v1: mismatch']);
      assert.deepEqual(errors(await run('broken/gap/')), [
        'ocfl/alpha: v2 document version 3 breaks the numbering (expected 2)',
        'ocfl/alpha: v3 document version 2 breaks the numbering (expected 4)',
        'ocfl/alpha: v4 has other files than document version 3',
        'ocfl/collection-main: v2 member alpha v4: mismatch',
        'ocfl/reading: v1 member alpha v3: mismatch',
      ]);
      assert.deepEqual(errors(await run('broken/dropped-notice/')), [
        'ocfl/alpha: v4 drops or changes an earlier notice',
        'ocfl/collection-main: v2 member alpha v4: mismatch',
      ]);
      assert.deepEqual(errors(await run('broken/stale/')), ['opensheaf.json: stale entry for beta']);
    });

    test('an archive that disappeared', async () => {
      const report = await run('other/', { down: [ORIGIN + 'archive/'] });
      assert.deepEqual(errors(report).map((e) => e.replace(/: unavailable: .*/, ': unavailable')), [
        'ocfl/collection-main: v2 member alpha v4: unavailable',
        'ocfl/collection-main: v2 member gamma v1: unavailable',
        'ocfl/collection-main: v2 member reading v1: unavailable',
      ]);
      assert.ok(report.findings.some((f) => f.level === 'info' && /source of the accepted copy is unavailable/.test(f.message)));
    });

    test('cancelling keeps what was found', async () => {
      const controller = new AbortController();
      const http = new Http({ fetch: diskFetch() });
      const archive = await Archive.open(http, ORIGIN + 'archive/');
      const report = await verify(archive, { schemas, signal: controller.signal,
        progress: ({ done }) => { if (done === 1) controller.abort(); } });
      assert.ok(report.cancelled);
    });

A command
---------

The same verification can be run from the command line, against any
archive, which is how its results were compared with `osheaf verify` on
the example archives of the templates and on a real archive. It prints
the problems as `osheaf verify` does, then `OK` or their number; with
`--all`, the warnings and notes too, and with `--digests`, it also checks
the digest of every file.

```
node tests/verify-url.mjs https://mgubi.org/papers/ [--digests] [--no-remote] [--all]
```

    // in tests/verify-url.mjs:
    #!/usr/bin/env node
    import { readFile } from 'node:fs/promises';
    import { Http, explain } from '../app/http.js';
    import { Archive } from '../app/archive.js';
    import { verify } from '../app/verify.js';
    import { loadSchemas } from '../app/schema.js';

    const args = process.argv.slice(2);
    const url = args.find((a) => !a.startsWith('--'));
    if (!url) {
      console.error('usage: node tests/verify-url.mjs ARCHIVE-URL [--digests] [--no-remote] [--all]');
      process.exit(2);
    }
    const schemas = await loadSchemas(async (u) => JSON.parse(await readFile(u, 'utf-8')));
    const http = new Http();
    const archive = await Archive.open(http, url);
    const report = await verify(archive, {
      schemas, remote: !args.includes('--no-remote'), digests: args.includes('--digests'),
      progress: ({ phase, done, total }) => process.stderr.write(`\r${phase} ${done}/${total}    `),
    });
    process.stderr.write('\n');
    for (const f of report.findings) {
      if (f.level === 'error') console.log(f.text);
      else if (args.includes('--all')) console.log(`(${f.level}) ${f.text}`);
      if (f.errors && args.includes('--all')) for (const e of f.errors) console.log(`    ${explain(e)}`);
    }
    const n = report.counts().error;
    console.log(n ? `${n} problem(s)` : 'OK');
    console.error(`${report.stats.objects} objects, ${report.stats.versions} object versions, ` +
                  `${report.stats.pins} pins, ${report.stats.files} files; ${http.requests} requests`);
    process.exit(n ? 1 : 0);
