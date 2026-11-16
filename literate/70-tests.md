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
(section 10.5), mirrors `beta` (section 10.4), and keeps a catalogue of objects of both archives: `alpha` followed, `gamma` at an
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
    type: catalogue
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

    test('members.json: catalogues and selections', async () => {
      const mem = await fixture('archive/ocfl/reading/v1/content/members.json');
      const bad = structuredClone(mem);
      bad.members[0].version = 'v1';
      assert.deepEqual(messages(collection, bad), ['/members/0: must not have version, inventorySha512, follow']);
      bad.type = 'catalogue';
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

Requests
--------

The HTTP client is tested with a `fetch` that answers after a delay and
honours aborts, as a slow server would, and with a real server in Node
for the time limits, which concern the body of an answer as it arrives.

    // in tests/http.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import { Http, LIMITS } from '../app/http.js';
    import { Archive } from '../app/archive.js';
    import { summary } from '../app/summary.js';
    import { diskFetch, ORIGIN } from './disk.mjs';

    function slowFetch(ms, { log = [] } = {}) {
      const disk = diskFetch({ log });
      return (url, init = {}) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => disk(url, init).then(resolve, reject), ms);
        init.signal?.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
    }

    function serve(handler) {
      return new Promise((resolve) => {
        const server = createServer(handler).listen(0, '127.0.0.1', () => {
          resolve({ url: `http://127.0.0.1:${server.address().port}/`,
                    close: () => { server.closeAllConnections(); server.close(); } });
        });
      });
    }

    <<tests of requests>>

A request kept by the client is shared by its callers, and does not
depend on the first one's signal: when the first caller leaves, the
others still get the answer; when every caller has left, the request is
aborted and forgotten, and a caller arriving just after (the next page,
which starts while the old one is aborted) gets a request of its own.
The same holds for summaries, which the pages load with their signals.

    // in tests of requests:
    test('a kept request outlives the caller that started it', async () => {
      const log = [];
      const http = new Http({ fetch: slowFetch(30, { log }) });
      const url = ORIGIN + 'archive/opensheaf.json';
      const first = new AbortController(), second = new AbortController();
      const a = http.cached(url, { signal: first.signal });
      const b = http.cached(url, { signal: second.signal });
      first.abort();
      await assert.rejects(a, { kind: 'aborted' });
      assert.ok((await b).length > 0);
      assert.equal(log.length, 1);
    });

    test('a request whose callers have all left is not handed to the next', async () => {
      const http = new Http({ fetch: slowFetch(30) });
      const url = ORIGIN + 'archive/opensheaf.json';
      const old = new AbortController();
      const a = http.cached(url, { signal: old.signal });
      await new Promise((resolve) => setTimeout(resolve, 10));
      old.abort();
      const b = http.cached(url, { signal: new AbortController().signal });
      await assert.rejects(a, { kind: 'aborted' });
      assert.ok((await b).length > 0);
    });

    test('a summary loading for a page left is not handed to the next page', async () => {
      const http = new Http({ fetch: slowFetch(20) });
      const ctx = { archive: await Archive.open(http, ORIGIN + 'archive/'), summaries: new Map() };
      const page1 = new AbortController();
      ctx.signal = page1.signal;
      const a = summary(ctx, 'alpha');
      await new Promise((resolve) => setTimeout(resolve, 10));
      page1.abort();
      ctx.signal = new AbortController().signal;
      const s = await summary(ctx, 'alpha');
      assert.equal(s.id, 'alpha');
      await assert.rejects(a, { kind: 'aborted' });
      assert.equal(await summary(ctx, 'alpha'), s);
    });

The summaries kept are bounded too: past the limit, the least recently
used summary is forgotten, but never one still loading, which a page is
waiting for.

    // in tests of requests:
    test('the summaries kept are bounded, and those loading are kept', async () => {
      const http = new Http({ fetch: slowFetch(5) });
      const ctx = { archive: await Archive.open(http, ORIGIN + 'archive/'), summaries: new Map(),
                    signal: new AbortController().signal, summaryLimit: 1 };
      await summary(ctx, 'alpha');
      const beta = summary(ctx, 'beta');
      const gamma = summary(ctx, 'gamma');
      assert.deepEqual([...ctx.summaries.keys()], ['beta', 'gamma']);
      await Promise.all([beta, gamma]);
      await summary(ctx, 'beta');
      await summary(ctx, 'alpha');
      assert.deepEqual([...ctx.summaries.keys()], ['alpha']);
    });

The answers kept are bounded: past the limit, the least recently used
are forgotten.

    // in tests of requests:
    test('the answers kept are bounded', async () => {
      const http = new Http({ fetch: diskFetch(), cacheLimit: 10_000 });   // the inventories are 4 to 10 kB
      const url = (id) => `${ORIGIN}archive/ocfl/${id}/inventory.json`;
      for (const id of ['alpha', 'beta', 'gamma']) await http.cached(url(id));
      assert.ok(http.cacheBytes <= 10_000);
      assert.ok(!http.cache.has(url('alpha')));
      assert.ok(http.cache.has(url('beta')) && http.cache.has(url('gamma')));
    });

The time limits: a server that sends a body slowly but steadily, for
longer than the time limit, is read whole, since the limit is on the
headers and then on silence; one that stops sending is stopped by the
limit on silence.

    // in tests of requests:
    test('a slow, steady body is read; a stalled one times out', async () => {
      const server = await serve((req, res) => {
        res.writeHead(200, { 'content-length': String(20 * 1024) });
        let n = 0;
        const timer = setInterval(() => {
          if (req.url === '/stall' && n === 2) return clearInterval(timer);
          res.write(Buffer.alloc(1024));
          if (++n === 20) {
            clearInterval(timer);
            res.end();
          }
        }, 40);
        res.on('close', () => clearInterval(timer));
      });
      try {
        const http = new Http({ timeout: 300, stall: 300 });
        const bytes = await http.request(server.url + 'steady', { limit: LIMITS.file });
        assert.equal(bytes.length, 20 * 1024);
        await assert.rejects(http.request(server.url + 'stall', { limit: LIMITS.file }),
          { kind: 'timeout', detail: /stalled/ });
      } finally {
        server.close();
      }
    });

A busy server (503) is tried again after a pause, which holds no place in
the pool: another request goes through meanwhile; a request cancelled
during its pause stops at once.

    // in tests of requests:
    test('a pause before trying again holds no place, and is cancelled at once', async () => {
      const fetch = async (url) => new Response(url.endsWith('busy') ? 'busy' : 'ok', { status: url.endsWith('busy') ? 503 : 200 });
      const http = new Http({ fetch, concurrency: 1 });
      const controller = new AbortController();
      const busy = http.request('http://example.org/busy', { signal: controller.signal });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const started = Date.now();
      assert.equal(new TextDecoder().decode(await http.request('http://example.org/ok')), 'ok');
      controller.abort();
      await assert.rejects(busy, { kind: 'aborted' });
      assert.ok(Date.now() - started < 500);
    });

A body is read whole when its declared size is wrong or missing, and
bodies larger than `LIMITS.large` are read one at a time: here bodies of
four pieces, with the limit passed at the second piece, and the pieces
after it are never being read for two bodies at once.

    // in tests of requests:
    test('bodies are read whole, and large ones one at a time', async () => {
      const declared = new Http({ fetch: async () => new Response(new Uint8Array(10), { headers: { 'content-length': '3' } }) });
      assert.equal((await declared.request('http://example.org/x')).length, 10);
      const saved = LIMITS.large;
      LIMITS.large = 1000;
      let late = 0, most = 0;
      const fetch = async () => {
        let k = 0, counted = false;
        const body = new ReadableStream({
          async pull(controller) {
            await new Promise((resolve) => setTimeout(resolve, 10));
            if (k === 4) {
              if (counted) late--;
              return controller.close();
            }
            if (k >= 2 && !counted) {
              counted = true;
              most = Math.max(most, ++late);
            }
            k++;
            controller.enqueue(new Uint8Array(600));
          },
        }, { highWaterMark: 0 });
        return new Response(body);
      };
      try {
        const http = new Http({ fetch });
        const sizes = await Promise.all([1, 2, 3].map((n) => http.request(`http://example.org/${n}`, { limit: LIMITS.file })));
        assert.deepEqual(sizes.map((b) => b.length), [2400, 2400, 2400]);
        assert.equal(most, 1);
      } finally {
        LIMITS.large = saved;
      }
    });

Untrusted names
---------------

    // in tests/paths.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { logicalPathProblem, contentPathProblem, under, isObjectId, isVersion } from '../app/paths.js';
    import { baseOf, withScheme } from '../app/archive.js';

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

    test('addresses typed by a reader', () => {
      assert.equal(withScheme('mgubi.org/papers/'), 'https://mgubi.org/papers/');
      assert.equal(withScheme('localhost:8000/x'), 'http://localhost:8000/x');
      assert.equal(withScheme('127.0.0.1:8000/'), 'http://127.0.0.1:8000/');
      assert.equal(withScheme('example.org:8443/a/'), 'https://example.org:8443/a/');
      assert.equal(withScheme('https://example.org/a/'), 'https://example.org/a/');
      assert.equal(withScheme('../'), '../');
      const page = 'https://opensheaf.org/explorer/';
      assert.equal(baseOf('https://example.org/papers/index.html', page), 'https://example.org/papers/');
      assert.equal(baseOf('https://example.org/papers/opensheaf.json', page), 'https://example.org/papers/');
      assert.equal(baseOf('https://example.org/papers', page), 'https://example.org/papers/');
      assert.equal(baseOf('../', page), 'https://opensheaf.org/');
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
    import { documentVersionErrors, defaultHistory, historyOf, currentVersion, rolesOf, memberPins, filesOf } from '../app/versions.js';

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

    test('a description-only version may add the file of the licence terms (sections 7.3 and 9)', () => {
      const { inv, objOf } = make([
        { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
        { obj: { documentVersion: 1, licence: { path: 'LICENCE.txt', mediaType: 'text/plain' } }, files: { 'a.tex': 'a1', 'LICENCE.txt': 'l1' } },
      ]);
      assert.deepEqual(documentVersionErrors(inv, objOf), []);
      assert.equal(rolesOf(inv, objOf).v2, 'description');
    });

Logical paths are the archive's names, and may be those of the
properties every JavaScript object inherits.

    // in tests of document versions:
    test('logical paths named like inherited properties', () => {
      let { inv, objOf } = make([
        { obj: { documentVersion: 1, sourcesMissing: { text: 'lost' } }, files: { 'p.pdf': 'p1' } },
        { obj: { documentVersion: 1, mainSource: 'a.tex' }, files: { 'p.pdf': 'p1', 'a.tex': 'a1', constructor: 'c1' } },
      ]);
      assert.deepEqual(documentVersionErrors(inv, objOf), []);
      ({ inv } = make([{ obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } }]));
      inv.versions.v1.state = JSON.parse('{"x1": ["__proto__"], "a1": ["a.tex"]}');
      assert.deepEqual(Object.keys(filesOf(inv, 'v1')).sort(), ['__proto__', 'a.tex']);
      assert.equal(filesOf(inv, 'v1').toString, undefined);
    });

    test('the pins of members', () => {
      assert.deepEqual(memberPins({ version: 'v2', inventorySha512: 'x' }), [{ version: 'v2', pin: 'x', documentVersion: null }]);
      assert.deepEqual(memberPins({ revisions: [{ documentVersion: 2, version: 'v3', inventorySha512: 'y' }] }),
        [{ version: 'v3', pin: 'y', documentVersion: 2 }]);
    });

Names chosen by archives
-----------------------

Everything an archive names (digests, logical paths, types, LaTeX
commands, properties) may be the name of a property every JavaScript
object inherits; none of them may be mistaken for one. The inventories
are made in the test; the gaps in the numbering of versions give one
message, naming the last version.

    // in tests/names.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { inventoryFindings } from '../app/rules.js';
    import { readableMath } from '../app/text.js';
    import { validate } from '../app/schema.js';
    import { readSchemas } from './disk.mjs';

    const inventory = (versions, manifest = {}) => ({ id: 'x', digestAlgorithm: 'sha512', manifest,
      head: versions[versions.length - 1], versions: Object.fromEntries(versions.map((v) => [v, { state: {} }])) });

    test('a digest of the state named like an inherited property', () => {
      const inv = inventory(['v1']);
      inv.versions.v1.state = { toString: ['a.tex'] };
      assert.deepEqual(inventoryFindings('x', inv).map((f) => f.message), ['a digest of the state is not in the manifest']);
    });

    test('a gap in the versions is one problem', () => {
      const inv = inventory(['v1', 'v3', 'v4', 'v5', 'v6', 'v7', 'v8', 'v9', 'v10']);
      assert.deepEqual(inventoryFindings('x', inv).map((f) => f.message), ['the versions are not v1 to v10 without gaps']);
    });

    test('LaTeX commands named like inherited properties are left as they are', () => {
      assert.equal(readableMath('\\constructor x'), '\\constructor x');
      assert.equal(readableMath('\\hasOwnProperty'), '\\hasOwnProperty');
      assert.equal(readableMath('\\alpha^2'), 'α²');
    });

A title is untrusted text that the page rewrites as soon as it is shown;
mathematics made to be slow (a command followed by many spaces, which
once took time growing as their square) must come back at once, and
the forms that are meant still read as they should.

    // in tests/names.test.mjs:
    test('mathematics made to be slow is read at once', async () => {
      const { plain } = await import('../app/text.js');
      for (const tex of ['\\mathbb' + ' '.repeat(5e4), '\\mathbb{' + ' '.repeat(5e4), '\\mathbb' + ' '.repeat(1999)]) {
        const start = performance.now();
        readableMath(tex);
        plain(`a $${tex}$ b`);
        assert.ok(performance.now() - start < 200, `${tex.length} characters took too long`);
      }
      assert.equal(readableMath('\\mathbb{R}^2'), 'ℝ²');
      assert.equal(readableMath('\\mathbb R'), 'ℝ');
      assert.equal(readableMath('\\mathbb { Z }'), 'ℤ');
    });

    test('properties named like inherited ones are checked by the schema', async () => {
      const schema = { type: 'object', required: ['toString'], properties: { a: { type: 'string' } },
                       additionalProperties: { type: 'string' } };
      assert.deepEqual(validate(schema, JSON.parse('{"constructor": 1}')).map((e) => `${e.path}: ${e.message}`),
        [': "toString" is a required property', '/constructor: 1 is not of type string']);
      const schemas = await readSchemas();
      assert.ok(validate(schemas['opensheaf-collection/0.1'], { format: 'opensheaf-collection/0.1', type: 'constructor', members: [] }).length);
    });

Pages left before they are drawn
--------------------------------

The pages read the archive while the reader may already be elsewhere: a
click or the back button replaces `ctx.signal` and empties the main
element, and the page left must then draw nothing and fetch nothing more.
These tests run the pages on a small imitation of the document, enough
for what the pages do with it (elements, text, children, listeners, the
value of a menu or of a progress bar), and
on fixtures served slowly, so that the reader can leave in the middle.

    // in tests/pages.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { diskFetch, readSchemas, ORIGIN } from './disk.mjs';

    <<a small imitation of the document>>

    const { Http } = await import('../app/http.js');
    const { Archive } = await import('../app/archive.js');
    const { Resolver } = await import('../app/resolve.js');
    const { showObject } = await import('../app/view-object.js');
    const { showCollection } = await import('../app/view-collection.js');
    const { showArchive, ROWS_AT_ONCE } = await import('../app/view-archive.js');
    const { showVerify } = await import('../app/view-verify.js');
    const { clear } = await import('../app/dom.js');

    <<a session of the explorer on slow fixtures>>

    <<tests of pages left>>

    <<tests of pages that grow>>

The imitation keeps the tree of nodes and the listeners; the pages are
imported after it is installed, since they create elements through the
global `document`.

    // in a small imitation of the document:
    class FakeNode {
      constructor() { this.childNodes = []; this.parent = null; this.listeners = {}; }
      append(...children) {
        for (const c of children) {
          const n = typeof c === 'string' ? new FakeText(c) : c;
          n.parent?.detach(n);
          n.parent = this;
          this.childNodes.push(n);
        }
      }
      prepend(...children) { for (const c of children.reverse()) { c.parent?.detach(c); c.parent = this; this.childNodes.unshift(c); } }
      appendChild(c) { this.append(c); return c; }
      insertBefore(n, ref) {
        if (!ref) return this.appendChild(n);
        n.parent?.detach(n);
        n.parent = this;
        this.childNodes.splice(this.childNodes.indexOf(ref), 0, n);
        return n;
      }
      detach(c) { const k = this.childNodes.indexOf(c); if (k >= 0) this.childNodes.splice(k, 1); c.parent = null; }
      remove() { this.parent?.detach(this); }
      replaceWith(n) {
        const p = this.parent;
        if (!p) return;
        n.parent?.detach(n);
        p.childNodes[p.childNodes.indexOf(this)] = n;
        n.parent = p;
        this.parent = null;
      }
      replaceChildren(...children) { for (const c of this.childNodes) c.parent = null; this.childNodes = []; this.append(...children); }
      addEventListener(type, f) { (this.listeners[type] ||= []).push(f); }
      get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
      set textContent(v) { this.replaceChildren(new FakeText(String(v))); }
    }
    class FakeText extends FakeNode {
      constructor(s) { super(); this.data = s; }
      get textContent() { return this.data; }
    }
    class FakeElement extends FakeNode {
      constructor(tag) {
        super();
        this.tagName = tag;
        this.attributes = {};
        this.dataset = {};
        this.className = '';
        this.classList = { add() {}, remove() {}, toggle() {} };
      }
      setAttribute(name, value) { this.attributes[name] = value; }
      get value() {
        if (this.tagName !== 'select') return this.attributes.value;
        const options = this.all('option');
        return (options.find((o) => 'selected' in o.attributes) || options[0])?.attributes.value;
      }
      set value(v) { this.attributes.value = v; }
      all(tag, out = []) {
        for (const c of this.childNodes) {
          if (c instanceof FakeElement) { if (c.tagName === tag) out.push(c); c.all(tag, out); }
        }
        return out;
      }
    }
    globalThis.Node = FakeNode;
    globalThis.document = { createElement: (tag) => new FakeElement(tag), createTextNode: (s) => new FakeText(s),
                            baseURI: ORIGIN + 'explorer/' };

A session holds what the application keeps (`ctx`), with the fixtures
served after a short delay, a log of the addresses fetched, and `go`,
which does what [the router](30-app.md) does when the reader goes to
another page: abort the old signal, give a new one, empty the main
element.

    // in a session of the explorer on slow fixtures:
    async function session(base = 'archive/', delay = 15) {
      const log = [];
      const disk = diskFetch({ log });
      const slow = (url, init = {}) => new Promise((resolve, reject) => {
        const timer = setTimeout(() => disk(url, init).then(resolve, reject), delay);
        init.signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new DOMException('aborted', 'AbortError')); });
      });
      const http = new Http({ fetch: slow });
      const archive = await Archive.open(http, ORIGIN + base);
      const ctx = { http, archive, resolver: new Resolver(http, archive), summaries: new Map(), signal: null };
      const main = new FakeElement('main');
      let controller = null;
      const go = () => {
        controller?.abort();
        controller = new AbortController();
        ctx.signal = controller.signal;
        clear(main);
      };
      return { ctx, main, log, go };
    }
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

An object page left while the descriptions of its versions are read draws
nothing: only the page gone to is on the page. The summaries are read
beforehand, as they are after the archive page.

    // in tests of pages left:
    test('an object page left while loading is not drawn below the next one', async () => {
      const { ctx, main, go } = await session();
      go();
      const { summary } = await import('../app/summary.js');
      await summary(ctx, 'alpha');
      await summary(ctx, 'beta');
      go();
      const left = showObject(ctx, main, 'alpha', 'v1');
      await wait(5);
      go();
      const shown = showObject(ctx, main, 'beta');
      await Promise.all([left, shown]);
      assert.deepEqual(main.all('code').map((c) => c.textContent).filter((t) => t === 'alpha' || t === 'beta'), ['beta']);
      assert.equal(main.all('h1').length, 1);
    });

A collection page whose pins are being resolved stops when it is left:
no address is fetched after the reader has gone, even though the new
page has a live signal of its own. The catalogue of the second fixture
archive is used: its members are in the first archive, so resolving them
reads that archive (members of the archive of the page are confirmed from
files already read), and one of them is the collection `reading`, which
the check opens in turn. The reader leaves after fifteen files have been
read, while that collection is being opened: leaving earlier would only
cancel what is in flight, and the member lists would have nothing more to
fetch, wrong signal or not (the page as it was before this test fetched
fourteen files after the reader had gone).

    // in tests of pages left:
    test('the pins of a collection page left are not resolved further', async () => {
      const { ctx, main, log, go } = await session('other/');
      go();
      await showCollection(ctx, main, 'collection-main');
      const run = main.all('button').find((b) => b.textContent === 'Resolve and check all pins');
      const resolving = run.listeners.click[0]();
      const started = log.length;
      for (let t = 0; log.length < started + 15 && t < 3000; t++) await wait(1);
      assert.ok(log.length >= started + 15, 'resolving fetches too little');
      go();
      const before = log.length;
      await resolving;
      await wait(100);
      assert.deepEqual(log.slice(before), []);
    });

Pages that grow
---------------

The page of the archive completes its rows as their summaries come, and
the page of the verification adds the findings as they are found. Both
must do so at a cost in proportion to what is added, and leave alone
what the reader is doing.

The page of the first fixture archive reads, for `alpha`, whose head has
`history`, only what its row shows: the inventory, the `object.json` of
the head, and the descriptions of the current version (`v3`); not the
`object.json` of the other object versions.

    // in tests of pages that grow:
    test('the page of an archive reads only what its rows show', async () => {
      const { ctx, main, log, go } = await session('archive/', 1);
      go();
      showArchive(ctx, main);
      const status = () => main.all('p').find((p) => p.className === 'muted small').textContent;
      for (let t = 0; /descriptions read|^$/.test(status()) && t < 3000; t++) await wait(1);
      await wait(20);
      const alpha = log.filter((u) => u.includes('/ocfl/alpha/')).map((u) => u.split('/ocfl/alpha/')[1]).sort();
      assert.deepEqual(alpha, ['inventory.json', 'v3/content/datacite.json', 'v3/content/object.json', 'v4/content/object.json']);
      const row = main.all('li').find((li) => li.all('code').some((c) => c.textContent === 'alpha'));
      assert.match(row.textContent, /version 2 · head v4/);
    });

An archive of three hundred objects, whose objects cannot be read, with
a word in the search: the rows are read `ROWS_AT_ONCE` at a time, in the
order of the list, and the text of the rows is folded (counted through
`String.prototype.normalize`) a number of times in proportion to the
number of rows, not to its square, although the list is filtered again
as each row is completed.

    // in tests of pages that grow:
    test('the rows of a large archive are read a few at a time, and filtered in linear time', async () => {
      const N = 300;
      const objects = Array.from({ length: N }, (_, k) => ({ id: `doc-${k}`, kind: 'document', head: 'v1', status: 'active' }));
      const started = [];
      let inFlight = 0, most = 0;
      const read = (id) => {
        started.push(id);
        most = Math.max(most, ++inFlight);
        return new Promise((resolve, reject) => setTimeout(() => {
          inFlight--;
          reject(Object.assign(new Error('gone'), { kind: 'missing' }));
        }, 1));
      };
      const archive = { name: 'Synthetic', base: ORIGIN + 'synthetic/', root: ORIGIN + 'synthetic/ocfl/', archiveId: 'synthetic',
                        disc: { objects }, objects: () => objects, tombstones: () => [], inventory: read, history: read };
      const ctx = { archive, summaries: new Map(), signal: new AbortController().signal };
      const main = new FakeElement('main');
      const normalize = String.prototype.normalize;
      let folds = 0;
      String.prototype.normalize = function (...args) { folds++; return normalize.apply(this, args); };
      try {
        showArchive(ctx, main);
        main.all('input').find((i) => i.attributes.type === 'search').attributes.value = 'doc';
        for (let t = 0; (started.length < N || inFlight > 0) && t < 5000; t++) await wait(1);
        await wait(20);
      } finally {
        String.prototype.normalize = normalize;
      }
      assert.deepEqual(started, objects.map((o) => o.id));
      assert.ok(most <= ROWS_AT_ONCE, `${most} rows read at once`);
      assert.ok(folds < 5 * N, `${folds} folds for ${N} rows`);
      assert.match(main.all('p').find((p) => p.className === 'muted small').textContent, /^300 of 300 objects shown$/);
    });

The page of a verification in progress is updated, not drawn again: a
group the reader opened stays open, and the boxes choosing the levels
stay those the reader may be on. The page left stops listening to the
run.

    // in tests of pages that grow:
    test('the page of a verification in progress keeps what the reader opened', async () => {
      const { ctx, main, go } = await session('broken/gap/', 20);
      ctx.schemas = readSchemas;
      go();
      showVerify(ctx, main);
      main.all('button').find((b) => b.textContent === 'Verify').listeners.click[0]();
      const boxes = main.all('input');
      let group;
      for (let t = 0; !group && t < 3000; t++) {
        await wait(5);
        group = main.all('details').find((d) => d.className === 'group' && !d.hidden);
      }
      assert.ok(group && ctx.verification.running, 'no finding while running');
      group.open = !group.open;
      const open = group.open;
      for (let t = 0; ctx.verification.running && t < 3000; t++) await wait(5);
      await wait(250);
      assert.ok(ctx.verification.report, 'the verification did not end');
      assert.ok(main.all('details').includes(group), 'the group was drawn again');
      assert.equal(group.open, open);
      for (const box of boxes) assert.ok(main.all('input').includes(box), 'a box was drawn again');
      go();
      assert.equal(ctx.verification.listeners.size, 0);
    });

Verification
------------

The verification of the fixtures: the two archives verify, with the
digests of every file, the members of other archives resolved and the
accepted copy compared with its source; nothing is fetched outside the
storage roots, the discovery documents and the index pages; the broken
copies give the problems that `osheaf verify` gives; an archive that
has disappeared makes the members that pin it unavailable, and leaves
its accepted copy unchecked, with a note; a second verification reads
the archive again; and the checks that go beyond opensheaf-py's, or
follow the specification where it does not (the inventory copies, the
index page of the profile `website`), find what they should.

    // in tests/verify.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { readFile } from 'node:fs/promises';
    import { createHash } from 'node:crypto';
    import { Http } from '../app/http.js';
    import { Archive } from '../app/archive.js';
    import { verify } from '../app/verify.js';
    import { Resolver } from '../app/resolve.js';
    import { diskFetch, readSchemas, ORIGIN } from './disk.mjs';

    const schemas = await readSchemas();

    async function run(path, { digests = false, remote = true, log = [], down = [], patch = {} } = {}) {
      const http = new Http({ fetch: patched(diskFetch({ log, down }), patch) });
      const archive = await Archive.open(http, ORIGIN + path);
      return verify(archive, { schemas, digests, remote });
    }

    const errors = (report) => report.findings.filter((f) => f.level === 'error').map((f) => f.text).sort();

Some tests change a file or two of a fixture on the way, rather than
keeping another broken copy: `patch` maps addresses to new contents (a
string, or a function of the old one), or to `null` for a file that is
missing.

    // in tests/verify.test.mjs:
    function patched(fetch, patch) {
      return async (url, init = {}) => {
        if (!Object.hasOwn(patch, url)) return fetch(url, init);
        const change = patch[url];
        if (change === null) return new Response('not found', { status: 404 });
        const text = typeof change === 'function' ? change(await (await fetch(url, init)).text()) : change;
        return new Response(init.method === 'HEAD' ? null : text, { status: 200 });
      };
    }

    const inventoryOf = async (path) => JSON.parse(await readFile(new URL(`./fixtures/${path}`, import.meta.url), 'utf-8'));
    const digestOf = (text) => createHash('sha512').update(text).digest('hex');

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
        `collection-main: member alpha v4: ${ORIGIN}archive/: unavailable`,
        `collection-main: member gamma v1: ${ORIGIN}archive/: unavailable`,
        `collection-main: member reading v1: ${ORIGIN}archive/: unavailable`,
      ]);
      assert.ok(report.findings.some((f) => f.level === 'info' && /source of the accepted copy is unavailable/.test(f.message)));
    });

    test('a verification reads the archive afresh, and counts its own requests', async () => {
      const log = [];
      const http = new Http({ fetch: diskFetch({ log }) });
      const archive = await Archive.open(http, ORIGIN + 'archive/');
      const before = log.length;
      const first = await verify(archive, { schemas });
      const between = log.length;
      const second = await verify(archive, { schemas });
      assert.equal(first.requests, between - before);
      assert.equal(second.requests, log.length - between);
      assert.equal(first.requests, second.requests);
      assert.ok(first.bytesRead > 0);
    });

The copy of the inventory in a version folder must be the inventory as of
that version: here the copy of `v2` of `alpha` is given the head `v1`, and
then made to forget `v2`, its checksum file following.

    // in tests of the verification:
    test('an inventory copy with another head, or fewer versions', async () => {
      const url = `${ORIGIN}archive/ocfl/alpha/v2/inventory.json`;
      const copy = await inventoryOf('archive/ocfl/alpha/v2/inventory.json');
      copy.head = 'v1';
      let text = JSON.stringify(copy);
      assert.deepEqual(errors(await run('archive/', { patch: { [url]: text, [url + '.sha512']: digestOf(text) } })),
        ['ocfl/alpha: v2 the inventory copy has the head v1']);
      delete copy.versions.v2;
      text = JSON.stringify(copy);
      assert.deepEqual(errors(await run('archive/', { patch: { [url]: text, [url + '.sha512']: digestOf(text) } })), [
        'ocfl/alpha: v2 the inventory copy does not record exactly the versions v1 to v2',
        'ocfl/alpha: v2 the inventory copy has the head v1',
      ]);
    });

When the `object.json` of a mirror's head cannot be read, the problem is
that file, not the listing of the mirror.

    // in tests of the verification:
    test('a mirror whose head cannot be read', async () => {
      const report = await run('other/', { remote: false, patch: { [`${ORIGIN}other/ocfl/beta/v2/content/object.json`]: null } });
      assert.deepEqual(errors(report), ['ocfl/beta: v2 cannot read object.json: HTTP 404']);
    });

The index page is required, and checked, for the profile `website`
(appendix C); for an archive without it, a pin missing from the index is
a note. The storage root, missing or with another layout, is one problem.

    // in tests of the verification:
    test('the index page and the profile website; the storage root', async () => {
      const index = { [`${ORIGIN}archive/index.html`]: '<html></html>' };
      assert.deepEqual(errors(await run('archive/', { patch: index })), [
        'index.html does not show the pin of alpha',
        'index.html does not show the pin of beta',
        'index.html does not show the pin of gamma',
      ]);
      const noWebsite = (text) => JSON.stringify({ ...JSON.parse(text), profiles: [] });
      const report = await run('archive/', { patch: { ...index, [`${ORIGIN}archive/opensheaf.json`]: noWebsite } });
      assert.deepEqual(errors(report), []);
      assert.equal(report.findings.filter((f) => f.where === 'index.html' && f.level === 'info').length, 3);
      const layout = (text) => JSON.stringify({ ...JSON.parse(text), storageLayout: 'another' });
      assert.deepEqual(errors(await run('archive/', { patch: {
        [`${ORIGIN}archive/opensheaf.json`]: layout, [`${ORIGIN}archive/ocfl/0=ocfl_1.1`]: null } })).filter((e) => /storage root/.test(e)),
        ['opensheaf.json: storage root missing or with another layout']);
    });

A member listing many mirrors has only a few of them tried.

    // in tests of the verification:
    test('at most five mirrors are tried for a pin', async () => {
      const log = [];
      const http = new Http({ fetch: diskFetch({ log }) });
      const mirrors = Array.from({ length: 20 }, (_, k) => `https://mirror${k}.example.org/`);
      const m = { archive: 'tag:example.org,2026:gone', archiveUrl: 'https://gone.example.org/', id: 'alpha', mirrors };
      const result = await new Resolver(http).confirm(m, 'v1', '0'.repeat(128));
      assert.equal(result.status, 'unavailable');
      assert.equal(log.length, 6);
      assert.match(result.problems[result.problems.length - 1], /15 more mirror\(s\) not tried/);
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
                  `${report.stats.pins} pins, ${report.stats.files} files; ${report.requests} requests, ` +
                  `${report.bytesRead} bytes`);
    process.exit(n ? 1 : 0);
