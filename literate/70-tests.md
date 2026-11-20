The tests
=========

The modules that do not touch the page (reading archives, names, key
logs and signatures, the validator, the rules, resolution and the
verification) run in Node as they run in the browser, and are tested
there with Node's own test runner, `node --test`, which needs nothing
installed: Node provides `fetch`, `Response` and WebCrypto, Ed25519
included, as the browser does. The pages are tested on an imitation of
the document (below), and checked by hand, in a browser, against the
example archives of the templates and against a real archive (see the
[README](https://github.com/opensheaf/explorer#testing)).

The tests read *fixture archives*, small OpenSheaf archives made with
`osheaf` and kept in the repository, from the disk, through a `fetch`
that maps addresses to files. With each archive is kept what
`osheaf verify` found in it, as JSON; the tests check that the explorer
finds the same findings, error for error, warning for warning and result
for result, except for what cannot be found over HTTP, which they name.
The tests of names, keys and signatures against appendix C of the
specification are in [their own chapter](71-tests-identity.md), and those
of resolution across archives in [another](72-tests-across.md).

The fixtures
------------

Three archives are made, by a script that needs `osheaf` (opensheaf-py on
version 0.2 of the specification) and is run by hand when the fixtures
must change; the result is kept, so the tests need neither Python nor
opensheaf-py. Their base URLs are under `https://fixtures.example.org/`,
which `osheaf` is told to read from the folder of the fixtures
(`OPENSHEAF_LOCATIONS`), and which the tests read from the disk.

- `archive/`, in the owner-name layout, has one owner and its key log;
  a document with a version found later (which writes the history) and a
  notice; a document deposited without its sources, then completed; a
  withdrawn document; a document taken down, of which a tombstone is
  left; a draft; its main catalogue, and a selection vetting two
  revisions; its indexes and its website.
- `forked/` has an owner whose key log forks: a twin of the archive
  signs another version 2 of the key log with other rotation keys, and
  `osheaf owner pull` appends a fork record; a document signed before the
  fork point is signed, one signed after it contested (section 7.3).
- `other/`, in the hashed layout, has an owner that exposes its first
  key, so that a document signed with it alone is contested, and its main
  catalogue, which pins it, too; a document whose first version is only
  vouched for (its signature file is removed, its second version is
  signed); an accepted copy of a version of `archive/`'s first document, a
  branch listed by a selection; a mirror of another document of
  `archive/`; and a catalogue of lines of the three archives, one of them
  followed.

Keys are made by `osheaf` itself, predictably: opensheaf-py makes the keys
of its tests from labels given in `OSHEAF_TEST_KEYS`, and refuses to do so
outside its tests, which it recognises by `PYTEST_CURRENT_TEST`; the script
sets both, with labels of its own for every command, and keeps the current
keys in a folder of its own, never in the system's credential store. The
names of works and owners still differ from one run to the next, since
genesis records have random nonces and dates, and the tests read them from
the fixtures, never write them.

    # in tests/fixtures/make.sh:
    #!/bin/sh
    # Build the fixture archives of the tests with osheaf (opensheaf-py, specification 0.2):
    #   sh tests/fixtures/make.sh
    set -e
    cd "$(dirname "$0")"
    HERE=$(pwd)
    URL=https://fixtures.example.org
    rm -rf archive other forked broken verify work
    mkdir -p work/config work/keys work/src verify
    <<the keys and the places of the fixtures>>
    <<the files of the fixture documents>>
    <<the first fixture archive>>
    <<an owner whose key log forks>>
    <<the second fixture archive>>
    rm -rf archive/templates archive/owner archive/style.css archive/sitemap.xml archive/.nojekyll \
      forked/templates forked/owner forked/style.css forked/sitemap.xml forked/.nojekyll \
      other/templates other/owner other/style.css other/sitemap.xml other/.nojekyll
    python3 break.py
    <<what osheaf verify finds in the fixtures>>
    rm -rf work

The keys go to a folder of the script (`OPENSHEAF_KEY_STORE=file`, under
`XDG_CONFIG_HOME`), and the rotation keys are exported there unencrypted;
both are deleted at the end. The function `osheaf` gives each command
labels of its own, from a counter kept in a file, since a command run in
`$(...)` runs in a subshell.

    # in the keys and the places of the fixtures:
    export XDG_CONFIG_HOME="$HERE/work/config" OPENSHEAF_KEY_STORE=file
    export OPENSHEAF_LOCATIONS="$URL/=$HERE/"
    export PYTEST_CURRENT_TEST="explorer fixtures (tests/fixtures/make.sh)"
    unset OPENSHEAF_SIGNING_KEY OPENSHEAF_PASSPHRASE
    echo 0 > work/runs
    osheaf() {
      run=$(($(cat work/runs) + 1))
      echo $run > work/runs
      OSHEAF_TEST_KEYS=$(for k in 1 2 3 4 5 6 7 8; do printf 'explorer fixture %s %s,' $run $k; done) \
        command osheaf "$@"
    }
    init() {
      osheaf init "$1" --name "$2" --base-url "$URL/$1/" --curator "Example, Ada" --new-owner \
        --export "work/keys/$1" --no-passphrase --yes $3
    }
    rk() {   # rk FOLDER N: the file of the Nth rotation key exported in FOLDER
      ls work/keys/$1/rotation-*.txt | sed -n "$2p"
    }
    uri() {  # uri ARCHIVE LABEL [DOCUMENT-VERSION]: the sheaf: URI of a line, with its at
      python3 - "$@" <<'PY'
    import json, sys, urllib.parse
    archive, label = sys.argv[1], sys.argv[2]
    o = next(o for o in json.load(open(f"{archive}/opensheaf.json"))["objects"] if o.get("label") == label)
    v = f"/v{sys.argv[3]}" if len(sys.argv) > 3 else ""
    print(f"sheaf:{o['name']}:{o['owner']}{v}?at=" + urllib.parse.quote(f"https://fixtures.example.org/{archive}/", safe=""))
    PY
    }

The documents are stand-ins: a line of LaTeX and a line pretending to be
a PDF, enough for the tools, which copy files byte for byte.

    # in the files of the fixture documents:
    src=work/src
    for f in alpha-1 alpha-2 alpha-0 beta-1 gamma-1 delta-1 eps-1 zeta-1 zeta-2; do
      printf '%s\n' "\\documentclass{article}\\begin{document}$f\\end{document}" > $src/$f.tex
      printf '%s\n' "%PDF-1.4 (a stand-in for the PDF of $f)" > $src/$f.pdf
    done

The first archive. `alpha` has two versions, a notice about the first,
and a version found later, placed after the first (`--after 1`), which
writes the history; `beta` is deposited without its sources and
completed; `gamma` is withdrawn; `delta` is taken down. The main
catalogue follows the archive's documents; the selection `reading` vets
two revisions of `alpha` and one of `beta`; `notes` is a draft.

    # in the first fixture archive:
    init archive "A fixture archive"
    A="osheaf --root archive"
    $A deposit alpha $src/alpha-1.tex --pdf $src/alpha-1.pdf --new --title 'Alpha: $\alpha$-stable laws' \
      --author "Example, Ada|University of Nowhere" --available 2024-01-10 --rights cc-by-4.0 \
      --abstract 'We study $\alpha$-stable laws on $\mathbb{R}^d$.'
    $A deposit alpha $src/alpha-2.tex --pdf $src/alpha-2.pdf --title 'Alpha: $\alpha$-stable laws' \
      --author "Example, Ada|University of Nowhere" --available 2024-03-01 --changes "Second version." --stage AM
    $A notice alpha --about 1 --text "Lemma 2 of version 1 is wrong as stated; corrected in version 2."
    $A deposit alpha $src/alpha-0.tex --pdf $src/alpha-0.pdf --title 'Alpha: $\alpha$-stable laws' \
      --author "Example, Ada|University of Nowhere" --created 2024-02-01 --after 1 \
      --changes "The submitted manuscript, found later."
    $A deposit beta --pdf $src/beta-1.pdf --new --no-source "Only the PDF was kept." --title "Beta" \
      --author "Example, Ada" --available 2023-05-05 --rights cc-by-4.0
    $A complete beta --version 1 --source $src/beta-1.tex
    $A deposit gamma $src/gamma-1.tex --pdf $src/gamma-1.pdf --new --title "Gamma" --author "Example, Ada" \
      --available 2022-02-02 --rights cc-by-4.0
    $A withdraw gamma --reason "Withdrawn for the tests."
    $A deposit delta $src/delta-1.tex --pdf $src/delta-1.pdf --new --title "Delta" --author "Example, Ada" \
      --available 2022-03-03 --rights cc-by-4.0
    $A takedown delta --reason "Taken down for the tests." --yes
    $A collect
    cat > $src/reading.yaml <<YAML
    title: A reading list
    description: The versions read.
    type: selection
    members:
      - {label: alpha, revisions: [1, 2]}
      - {label: beta}
    YAML
    $A collection sync reading --from $src/reading.yaml
    $A draft new notes --pdf $src/eps-1.pdf --no-source "A draft." --title "Notes" --author "Example, Ada"
    $A index

An owner whose key log forks (section 6.3). The archive `forked` deposits
`before`, signed against the first version of its key log; a copy of it,
its twin, is made; both then sign a second version of the key log with
two of the three rotation keys of the first, not the same two, and
`forked` deposits `after`, signed against its own second version. When
`forked` meets the twin's key log (`osheaf owner pull`), it appends a fork
record carrying the twin's second version: the owner has ended at its
fork point, version 2, and `after` is contested.

    # in an owner whose key log forks:
    init forked "A forked owner"
    F="osheaf --root forked"
    $F deposit before --pdf $src/zeta-1.pdf --new --no-source "x" --title "Signed before the fork" \
      --author "Example, Ada" --rights cc-by-4.0
    cp -R forked work/twin
    $F owner rotate --rotation-key "$(rk forked 1)" --rotation-key "$(rk forked 2)" \
      --export work/keys/forked-2 --no-passphrase --yes
    $F deposit after --pdf $src/zeta-2.pdf --new --no-source "x" --title "Signed after the fork point" \
      --author "Example, Ada" --rights cc-by-4.0
    osheaf --root work/twin owner rotate --rotation-key "$(rk forked 1)" --rotation-key "$(rk forked 3)" \
      --export work/keys/twin-2 --no-passphrase --yes
    OWNER_F=$(python3 -c 'import json; print(json.load(open("forked/osheaf.json"))["owner"])')
    $F owner pull "work/twin/ocfl/$OWNER_F/$OWNER_F"
    $F index

The second archive, in the hashed layout, with a curated main catalogue.
Its owner deposits `exposed` and `vouched`, both signed with its first
key, and lists `exposed` in its main catalogue; then makes a new key and
exposes the first (section 6.3), so that `exposed` and the two versions
of the main catalogue are contested; then deposits a second version of
`vouched`, signed with the new key, which `osheaf` asks to acknowledge
(`--i-know`, section 7.3). The signature file of the first version of
`vouched` is then removed: that version is no longer signed directly, but
vouched for by the second. The archive keeps an accepted copy of
`alpha`'s version 2 in its selection `issue`, a mirror of `beta`, and a
catalogue, `shelf`, of lines of the three archives: `alpha`, followed;
`gamma` at its document version 1; the selection `reading`; the accepted
copy; and `before` of `forked`.

    # in the second fixture archive:
    init other "Another fixture archive" "--layout hashed --curated"
    O="osheaf --root other"
    $O deposit exposed --pdf $src/eps-1.pdf --new --no-source "x" --title "Signed with a key exposed later" \
      --author "Example, Ada" --rights cc-by-4.0
    $O deposit vouched --pdf $src/zeta-1.pdf --new --no-source "x" --title "Vouched for" \
      --author "Example, Ada" --rights cc-by-4.0
    $O collection add main "$(uri other exposed)"
    DID='did:key:z[1-9A-HJ-NP-Za-km-z]*'
    FIRST=$($O owner show | grep -i 'current key' | grep -o "$DID" | head -1)
    SECOND=$($O key new | grep -o "$DID" | head -1)
    $O owner expose "$FIRST" --add "$SECOND" --rotation-key "$(rk other 1)" --rotation-key "$(rk other 2)" \
      --export work/keys/other-2 --no-passphrase --yes
    $O deposit vouched --pdf $src/zeta-2.pdf --no-source "x" --title "Vouched for" --author "Example, Ada" --i-know
    VOUCHED=$(python3 -c 'import json; print(next(o["id"] for o in json.load(open("other/opensheaf.json"))["objects"] if o.get("label") == "vouched"))')
    rm -r "other/ocfl/$(python3 -c "
    import hashlib, sys
    i = sys.argv[1]; h = hashlib.sha256(i.encode()).hexdigest(); e = i.replace(':', '%3a')
    print(f'{h[0:3]}/{h[3:6]}/{h[6:9]}/{e[:100]}-{h}')" "$VOUCHED")/extensions/opensheaf-witnesses/v1"
    $O collection new issue --type selection --title "Issue 1"
    $O accept "$(uri archive alpha 2)" --selection issue --label alpha-accepted
    $O mirror "$(uri archive beta)"
    cat > $src/shelf.yaml <<YAML
    title: A shelf
    description: Lines of three archives, kept whole.
    type: catalogue
    members:
      - {uri: '$(uri archive alpha)', follow: yes}
      - '$(uri archive gamma 1)'
      - '$(uri archive reading)'
      - {label: alpha-accepted}
      - '$(uri forked before)'
    YAML
    $O collection sync shelf --from $src/shelf.yaml
    $O index

What `osheaf verify` finds in each fixture, kept as JSON beside them:
the three archives pass (no errors), the broken copies (below) do not.
`osheaf verify --json` may print a warning before the JSON (a main
catalogue without a signed version, in `other/`), which is left out. The
archives with members or parents elsewhere are verified with `--remote`,
as the tests verify them.

    # in what osheaf verify finds in the fixtures:
    for a in archive forked other; do
      osheaf --root $a verify --remote
      osheaf --root $a verify --remote --json | sed -n '/^\[/,$p' > verify/$a.json
    done
    for b in broken/*; do
      remote=; [ "$(basename $b)" = unchecked-branch ] && remote=--remote
      osheaf --root $b verify $remote --json | sed -n '/^\[/,$p' > verify/broken-$(basename $b).json || true
    done

The broken copies
-----------------

Each broken copy breaks one rule, as a damaged or tampered archive would:

- `changed-file`: a file of a version changed (its digest no longer that
  of the manifest);
- `stale`: the discovery document gives an old head;
- `previous`: an `object.json` whose `previous` is not the digest of the
  version before (section 4.3);
- `gap`: a document version renumbered, breaking the numbering;
- `dropped-notice`: a later version without the notice of an earlier one;
- `wrong-pin`: a selection pinning a digest that is not the inventory's;
- `unsigned`: a version whose signature file is gone, so that it is not a
  version of its line, and the main catalogue pins it;
- `bad-signature`: a signature that does not verify;
- `no-key-log`: the archive without the key log of its owner;
- `key-log`: a key log whose second version lost its signature files;
- `unchecked-branch`: `other/` without the key log of the parent's owner,
  so that the branch point of the accepted copy is unchecked;
- `old`: the discovery document of an archive of version 0.1.

Changing a file of an object version means changing the digests of its
inventories, their checksum files and the discovery document, as a
tamperer covering its tracks would; the signatures, which sign the
inventories, then no longer hold, and the copies show what follows.

    # in tests/fixtures/break.py:
    #!/usr/bin/env python3
    """Make broken copies of the fixture archives, for the tests:

        python3 tests/fixtures/break.py

    Each copy breaks one rule, as a damaged or tampered archive would."""
    import base64
    import hashlib
    import json
    import shutil
    from pathlib import Path

    HERE = Path(__file__).resolve().parent

    <<finding the files of a fixture>>

    <<rewriting a file of a fixture with its digests>>

    <<the broken copies>>
    print("broken copies written in", HERE / "broken")

A copy of a fixture archive, and in it the folder of an object, by its
label, in the owner-name layout; the folder of the archive's owner; the
folder of any object in the hashed layout; and the content path of a
logical path.

    # in finding the files of a fixture:
    def copy(name, source="archive"):
        target = HERE / "broken" / name
        shutil.rmtree(target, ignore_errors=True)
        shutil.copytree(HERE / source, target)
        return target


    def obj_dir(root, label):
        """The folder of the object labelled LABEL (owner-name layout), and its identifier."""
        disc = json.loads((root / "opensheaf.json").read_text())
        o = next(o for o in disc["objects"] if o.get("label") == label)
        return root / "ocfl" / o["owner"] / o["name"], o["id"]


    def owner_dir(root):
        owner = json.loads((root / "osheaf.json").read_text())["owner"]
        return root / "ocfl" / owner / owner


    def hashed_dir(root, obj_id):
        """The folder of OBJ_ID in the hashed layout (a line's identifier is always shortened)."""
        h = hashlib.sha256(obj_id.encode()).hexdigest()
        return root / "ocfl" / h[0:3] / h[3:6] / h[6:9] / (obj_id.replace(":", "%3a")[:100] + "-" + h)


    def logical(d, ver, path):
        """The content path of a logical path of an object version."""
        inv = json.loads((d / "inventory.json").read_text())
        for dig, paths in inv["versions"][ver]["state"].items():
            if path in paths:
                return inv["manifest"][dig][0]
        raise KeyError(path)

Rewriting a file of a version, with the digests that name it, and editing
the discovery document.

    # in rewriting a file of a fixture with its digests:
    def rewrite(root, label, ver, path, change):
        """Change a file of an object version, re-digesting its inventories, their
        checksum files and the discovery document (the signatures, which sign the
        inventories, are left as they were)."""
        d, obj_id = obj_dir(root, label)
        cp = d / logical(d, ver, path)
        old = cp.read_bytes()
        new = change(old)
        cp.write_bytes(new)
        for inv in [d / "inventory.json", *d.glob("v*/inventory.json")]:
            text = inv.read_text()
            for algorithm in (hashlib.sha512, hashlib.sha256, hashlib.md5):  # the manifest and the fixity block
                text = text.replace(algorithm(old).hexdigest(), algorithm(new).hexdigest())
            inv.write_text(text)
            inv.with_name("inventory.json.sha512").write_text(f"{sha(inv.read_bytes())}  inventory.json\n")
        edit_discovery(root, lambda disc: [o.update(inventorySha512=sha((d / "inventory.json").read_bytes()))
                                           for o in disc["objects"] if o["id"] == obj_id])


    def sha(data):
        return hashlib.sha512(data).hexdigest()


    def edit_json(edit):
        def change(data):
            value = json.loads(data)
            edit(value)
            return (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode()
        return change


    def edit_discovery(root, edit):
        disc = json.loads((root / "opensheaf.json").read_text())
        edit(disc)
        (root / "opensheaf.json").write_text(json.dumps(disc, indent=2) + "\n")

The copies themselves, in the order of the list above.

    # in the broken copies:
    root = copy("changed-file")
    d, _ = obj_dir(root, "alpha")
    pdf = d / logical(d, "v1", "paper.pdf")
    pdf.write_bytes(pdf.read_bytes() + b"tampered\n")

    root = copy("stale")
    edit_discovery(root, lambda disc: next(o for o in disc["objects"] if o.get("label") == "beta").update(head="v1"))

    root = copy("previous")
    rewrite(root, "alpha", "v2", "object.json", edit_json(lambda obj: obj.update(previous="0" * 128)))

    root = copy("gap")
    rewrite(root, "alpha", "v2", "object.json", edit_json(lambda obj: obj.update(documentVersion=3)))
    rewrite(root, "alpha", "v2", "datacite.json", edit_json(lambda dc: dc.update(version="3")))

    root = copy("dropped-notice")
    rewrite(root, "alpha", "v4", "object.json", edit_json(lambda obj: obj.pop("notices", None)))

    root = copy("wrong-pin")
    rewrite(root, "reading", "v1", "members.json",
            edit_json(lambda mem: mem["members"][0]["revisions"][0].update(inventorySha512="0" * 128)))

    root = copy("unsigned")
    d, _ = obj_dir(root, "beta")
    shutil.rmtree(d / "extensions" / "opensheaf-witnesses" / "v2")

    root = copy("bad-signature")
    d, _ = obj_dir(root, "alpha")
    for f in (d / "extensions" / "opensheaf-witnesses" / "v4").glob("signature-*.json"):
        sig = json.loads(f.read_text())
        raw = bytearray(base64.b64decode(sig["signature"]))
        raw[0] ^= 1
        sig["signature"] = base64.b64encode(bytes(raw)).decode()
        f.write_text(json.dumps(sig, indent=2) + "\n")

    root = copy("no-key-log")
    shutil.rmtree(owner_dir(root))

    root = copy("key-log", "forked")
    shutil.rmtree(owner_dir(root) / "extensions" / "opensheaf-witnesses" / "v2")

    root = copy("unchecked-branch", "other")
    archive_owner = json.loads((HERE / "archive" / "osheaf.json").read_text())["owner"]
    key_log_id = f"sheaf:{archive_owner}:{archive_owner}"
    gone = hashed_dir(root, key_log_id)
    shutil.rmtree(gone)
    for d in (gone.parent, gone.parent.parent, gone.parent.parent.parent):
        if not any(d.iterdir()):
            d.rmdir()
    edit_discovery(root, lambda disc: disc.update(objects=[o for o in disc["objects"] if o["id"] != key_log_id]))

    root = HERE / "broken" / "old"
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    (root / "opensheaf.json").write_text(json.dumps({
        "format": "opensheaf-archive/0.1", "specification": "0.1", "archiveId": "tag:example.org,2026:old",
        "name": "An archive of specification 0.1", "storageRoot": "ocfl/",
        "storageLayout": "0002-flat-direct-storage-layout", "profiles": [], "objects": []}, indent=2) + "\n")
    (root / "osheaf.json").write_text(json.dumps({"archiveId": "tag:example.org,2026:old", "name": "Old"}) + "\n")

Reading fixtures from the disk
------------------------------

The tests give the HTTP client a `fetch` that answers addresses under
`https://fixtures.example.org/` with the files under `tests/fixtures/`, a
404 for missing files, and a network error for any other address, as a
browser would for a server that is down. A path is decoded before it is
read, so that the folder `sheaf%3a...` of the hashed layout is read from
the address `sheaf%253a...`; it is joined to the folder of the fixtures
as a path, not as a URL, which would decode it a second time. A list of
the addresses requested can be kept, to check that nothing is fetched
outside the storage root, and prefixes can be made to fail, to simulate
an archive that disappeared. `osheaf` is the findings `osheaf verify`
kept for a fixture; `idOf` the identifier of a line of a fixture archive
by its label (the identifiers change each time the fixtures are made),
with those the tests use most, and `folder` the address of an object of
an archive in the owner-name layout.

    // in tests/disk.mjs:
    import { readFile } from 'node:fs/promises';
    import { fileURLToPath } from 'node:url';

    export const ORIGIN = 'https://fixtures.example.org/';
    const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

    export function diskFetch({ log = [], down = [] } = {}) {
      return async (url, init = {}) => {
        log.push(url);
        if (!url.startsWith(ORIGIN) || down.some((prefix) => url.startsWith(prefix))) {
          throw new TypeError(`fetch failed: ${url}`);
        }
        const path = decodeURIComponent(new URL(url).pathname).slice(1);
        try {
          const bytes = await readFile(FIXTURES + path);
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

    export async function osheaf(name) {
      return JSON.parse(await readFile(`${FIXTURES}verify/${name}.json`, 'utf-8'));
    }

    export async function fixture(path) {
      return JSON.parse(await readFile(FIXTURES + path, 'utf-8'));
    }

    export function labelled(disc, label) {
      return disc.objects.find((o) => o.label === label);
    }

    export const DISCOVERY = {};
    for (const a of ['archive', 'other', 'forked']) DISCOVERY[a] = await fixture(`${a}/opensheaf.json`);

    export function idOf(label, archive = 'archive') {
      return labelled(DISCOVERY[archive], label).id;
    }

    export const ALPHA = idOf('alpha'), BETA = idOf('beta'), GAMMA = idOf('gamma'), MAIN = idOf('main'), READING = idOf('reading');
    export const OWNER = DISCOVERY.archive.owners[0];

    export function folder(id, archive = 'archive') {
      const [, name, owner] = id.split(':');
      return `${ORIGIN}${archive}/ocfl/${owner}/${name}/`;
    }

The validator
-------------

The validator is tested on the files of the fixtures, which must be
valid, and on files broken in the ways the schemas forbid: a missing
property, a pattern, a format, an `enum`, a `const`, an `if`/`then`, a
`not`, an `anyOf`, `dependentRequired`, `propertyNames`, `uniqueItems`.

    // in tests/schema.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { validate, FORMATS, same } from '../app/schema.js';
    import { readSchemas, fixture, folder, ALPHA, READING, idOf } from './disk.mjs';

    const schemas = await readSchemas();
    const messages = (format, data) => validate(schemas[`opensheaf-${format}/0.2`], data).map((e) => `${e.path}: ${e.message}`);
    const file = (id, path, archive = 'archive') => fixture(folder(id, archive).replace(/^https:\/\/[^/]+\//, '') + path);

    <<tests of the validator>>

The tests themselves:

    // in tests of the validator:
    test('the files of the fixtures are valid', async () => {
      for (const a of ['archive', 'other', 'forked']) assert.deepEqual(messages('archive', await fixture(`${a}/opensheaf.json`)), []);
      assert.deepEqual(messages('object', await file(ALPHA, 'v4/content/object.json')), []);
      assert.deepEqual(messages('collection', await file(READING, 'v1/content/members.json')), []);
      assert.deepEqual(messages('genesis', await file(ALPHA, 'v1/content/genesis.json')), []);
      const forked = idOf('before', 'forked').split(':')[2];
      assert.deepEqual(messages('keys', await file(`sheaf:${forked}:${forked}`, 'v2/content/keys.json', 'forked')), []);
    });

    test('formats are assertions', () => {
      assert.ok(FORMATS.date('2024-02-29'));
      assert.ok(!FORMATS.date('2023-02-29'));
      assert.ok(!FORMATS.date('2024-2-1'));
      assert.ok(FORMATS.uri('https://orcid.org/0000-0002-1234-5677'));
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
      disc.storageLayout = 'flat';
      disc.profiles = ['website', 'website'];
      assert.deepEqual(messages('archive', disc).sort(), [
        '/objects/0/head: "v01" does not match ^v[1-9][0-9]*$',
        '/profiles: has repeated items',
        '/storageLayout: "flat" is not one of ["opensheaf-owner-name-storage-layout","0003-hash-and-id-...',
        ': "name" is a required property',
      ]);
    });

    test('object.json: kinds, notes, withdrawal, extensions, previous', async () => {
      const obj = await file(ALPHA, 'v4/content/object.json');
      assert.deepEqual(messages('object', { ...obj, kind: 'collection' }), [
        ': must not have mainSource, sourceFormat, sourcesMissing, renditions, toolchain, changes, stage, history, notices, licence',
      ]);
      assert.deepEqual(messages('object', { ...obj, status: 'withdrawn' }), [': "withdrawal" is a required property']);
      assert.deepEqual(messages('object', { ...obj, changes: { path: 'x.md' } }), ['/changes: "mediaType" is required with "path"']);
      assert.match(messages('object', { ...obj, changes: {} })[0], /satisfies none of the alternatives/);
      assert.deepEqual(messages('object', { ...obj, extensions: { 'not a uri': {} } }), ['/extensions/not a uri: the name "not a uri" is not a valid uri']);
      assert.deepEqual(messages('object', { ...obj, previous: 'xyz' }), ['/previous: "xyz" does not match ^[0-9a-f]{128}$']);
    });

    test('members.json: catalogues and selections, members by line', async () => {
      const mem = await file(READING, 'v1/content/members.json');
      const bad = structuredClone(mem);
      bad.members[0].version = 'v1';
      assert.deepEqual(messages('collection', bad), ['/members/0: must not have version, inventorySha512, follow']);
      bad.type = 'catalogue';
      assert.deepEqual(messages('collection', bad).sort(), [
        '/members/0: "inventorySha512" is a required property',
        '/members/0: must not have revisions',
        '/members/1: "inventorySha512" is a required property',
        '/members/1: "version" is a required property',
        '/members/1: must not have revisions',
      ]);
      const noAt = structuredClone(mem);
      delete noAt.members[0].at;
      assert.deepEqual(messages('collection', noAt), ['/members/0: "at" is a required property']);
    });

    test('the keywords the schemas of 0.2 add: maximum, maxItems, minProperties, oneOf', () => {
      const schema = { type: 'object', minProperties: 1, properties: {
        n: { type: 'integer', maximum: 15 }, l: { type: 'array', maxItems: 1 },
        o: { oneOf: [{ type: 'string' }, { type: 'string', pattern: '^a' }] } } };
      assert.deepEqual(validate(schema, {}).map((e) => e.message), ['has fewer than 1 properties']);
      assert.deepEqual(validate(schema, { n: 16, l: [1, 2], o: 'ab' }).map((e) => `${e.path}: ${e.message}`), [
        '/n: 16 is greater than 15', '/l: has more than 1 items', '/o: satisfies 2 of the alternatives, and should satisfy one',
      ]);
      assert.deepEqual(validate(schema, { o: 'b' }), []);
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
    import { Http, LIMITS, parseJson, parseIntegers, numberTokens, explain } from '../app/http.js';
    import { Archive } from '../app/archive.js';
    import { summary } from '../app/summary.js';
    import { diskFetch, ORIGIN, ALPHA, BETA, GAMMA, folder } from './disk.mjs';
    import { checkKeeper, CONFIRMED, CLAIMED, NOT_CHECKED } from '../app/keepers.js';

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
      const a = summary(ctx, ALPHA);
      await new Promise((resolve) => setTimeout(resolve, 10));
      page1.abort();
      ctx.signal = new AbortController().signal;
      const s = await summary(ctx, ALPHA);
      assert.equal(s.id, ALPHA);
      await assert.rejects(a, { kind: 'aborted' });
      assert.equal(await summary(ctx, ALPHA), s);
    });

The summaries kept are bounded too: past the limit, the least recently
used summary is forgotten, but never one still loading, which a page is
waiting for.

    // in tests of requests:
    test('the summaries kept are bounded, and those loading are kept', async () => {
      const http = new Http({ fetch: slowFetch(5) });
      const ctx = { archive: await Archive.open(http, ORIGIN + 'archive/'), summaries: new Map(),
                    signal: new AbortController().signal, summaryLimit: 1 };
      await summary(ctx, ALPHA);
      const beta = summary(ctx, BETA);
      const gamma = summary(ctx, GAMMA);
      assert.deepEqual([...ctx.summaries.keys()], [BETA, GAMMA]);
      await Promise.all([beta, gamma]);
      await summary(ctx, BETA);
      await summary(ctx, ALPHA);
      assert.deepEqual([...ctx.summaries.keys()], [ALPHA]);
    });

The answers kept are bounded: past the limit, the least recently used
are forgotten.

    // in tests of requests:
    test('the answers kept are bounded', async () => {
      const http = new Http({ fetch: diskFetch(), cacheLimit: 12_000 });   // the inventories are 5 to 11 kB
      const url = (id) => `${folder(id)}inventory.json`;
      for (const id of [ALPHA, BETA, GAMMA]) await http.cached(url(id));
      assert.ok(http.cacheBytes <= 12_000);
      assert.ok(!http.cache.has(url(ALPHA)));
      assert.ok(http.cache.has(url(BETA)) && http.cache.has(url(GAMMA)));
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

A body that breaks off after its answer has arrived is an interrupted
answer, not a cross-origin refusal, even in a browser where a `no-cors`
request to the server succeeds (imitated here by a `document`).

    // in tests of requests:
    test('a body interrupted is not a cross-origin refusal', async () => {
      const fetch = async (url, init = {}) => {
        if (init.mode === 'no-cors') return new Response(null, { status: 200 });
        let k = 0;
        const body = new ReadableStream({
          pull(controller) {
            if (k++ === 0) controller.enqueue(new Uint8Array(10));
            else controller.error(new TypeError('terminated'));
          },
        });
        return new Response(body);
      };
      globalThis.document = {};
      try {
        await assert.rejects(new Http({ fetch }).request('http://example.org/x'),
          { kind: 'network', detail: /interrupted/ });
      } finally {
        delete globalThis.document;
      }
      assert.match(explain({ kind: 'cors' }), /missing/);
    });

The failures common on the hosts of archives are told apart: an HTML
page where JSON was expected (a fallback page, or a wrong base URL), a
403 of object storage, and a server still busy after its tries. The
pause before a new try is what the server asks with `Retry-After`, in
seconds or as a date, here none at all.

    // in tests of requests:
    test('an HTML page, a 403, and a busy server', async () => {
      const page = new TextEncoder().encode('\ufeff\n  <!DOCTYPE html><html></html>');
      assert.throws(() => parseJson(page), { kind: 'html', detail: /HTML page/ });
      const html = new Http({ fetch: async () => new Response('<html>Welcome</html>') });
      await assert.rejects(html.json('http://example.org/opensheaf.json'), { kind: 'html' });
      const forbidden = new Http({ fetch: async () => new Response('', { status: 403 }) });
      await assert.rejects(forbidden.request('http://example.org/x'), { kind: 'forbidden', status: 403 });
      assert.match(explain({ kind: 'forbidden' }), /public read/);
      let tries = 0;
      const past = new Date(Date.now() - 60_000).toUTCString();
      const busy = new Http({ fetch: async () => {
        tries++;
        return new Response('busy', { status: 503, headers: { 'retry-after': tries === 1 ? '0' : past } });
      } });
      const started = Date.now();
      await assert.rejects(busy.request('http://example.org/x'), { kind: 'busy', status: 503 });
      assert.equal(tries, 3);
      assert.ok(Date.now() - started < 500);
      assert.match(explain({ kind: 'busy' }), /try/i);
    });

JSON nested deeper than the limit is refused before it is parsed, whatever
the brackets inside its strings; at the limit, it is read.

    // in tests of requests:
    test('JSON nested too deeply', () => {
      const nested = (n) => new TextEncoder().encode('['.repeat(n) + '"\\\\\\"]]"' + ']'.repeat(n));
      assert.deepEqual(parseJson(nested(1)), ['\\"]]']);
      assert.equal(parseJson(nested(LIMITS.nesting)).length, 1);
      assert.throws(() => parseJson(nested(LIMITS.nesting + 1)), { kind: 'too-large', detail: /nested/ });
      assert.throws(() => parseJson(nested(100_000)), { kind: 'too-large' });
    });

Integers only, where the numbers count: a fraction or an exponent is
refused even when its value is an integer, and so is an integer that JSON
numbers do not hold exactly; numbers inside strings are not numbers. Both
ways of finding the text of a number are tried, the reviver's
`context.source` (where the engine has it, as Node has) and the pass over
the text.

    // in tests of requests:
    test('JSON whose numbers are all exact integers', () => {
      const ways = [{ source: false }, ...(JSON.parse('1', (k, v, c) => c?.source === '1') ? [{ source: true }] : [])];
      for (const way of ways) {
        for (const text of ['{"t":1.0}', '{"t":1e0}', '[1E2]', '{"t":-1.5}', '{"t":9007199254740993}', '[-9007199254740993]', '[9007199254740992]', '[-9007199254740992]', '[0.0]']) {
          assert.throws(() => parseIntegers(text, way), /is not an integer|no exact form/, `${text} ${way.source}`);
        }
        for (const [text, value] of [['{"t":1}', { t: 1 }], ['[-0, 0, 9007199254740991, -9007199254740991]', [-0, 0, 2 ** 53 - 1, -(2 ** 53 - 1)]],
                                     ['{"s":"1.0e5 \\" 2.5","n":[3]}', { s: '1.0e5 " 2.5', n: [3] }]]) {
          assert.deepEqual(parseIntegers(text, way), value, `${text} ${way.source}`);
        }
        assert.throws(() => parseIntegers('{"t":01}', way), SyntaxError);
      }
      assert.deepEqual(numberTokens('{"a\\"1.5":[-2,3e1],"b":"7"}'), ['-2', '3e1']);
      assert.throws(() => parseJson(new TextEncoder().encode('{"threshold":1.0}'), '', { integers: true }), { kind: 'json', detail: /1\.0 is not an integer/ });
      assert.deepEqual(parseJson(new TextEncoder().encode('{"threshold":1.0}')), { threshold: 1 });
    });

The keeper of an owner is checked in the place it controls (section 6.6),
with a `fetch` that answers as the ORCID registry and a keeper's domain
do. The ORCID answer has the shape of the registry's (version 3.0 of its
public API): links in `researcher-url`, each address in `url.value`. A
link confirms when its address names the owner as a word of its own, and
names a successor when another owner follows it; the request asks for
JSON and carries no credentials. A missing or wrong file is read as the
keeper not confirming; a network failure leaves the link not checked; an
ORCID iD whose check digit is wrong, and a domain that is local, are not
read at all.

    // in tests of requests:
    test('keepers confirmed, claimed only, or not checked (section 6.6)', async () => {
      const OWNER = 'a'.repeat(51) + 'q', NEXT = 'b'.repeat(51) + 'a';
      const ORCID_ID = 'https://orcid.org/0000-0002-1825-0097';
      let answers = {}, seen = [];
      const http = new Http({ fetch: async (url, init) => {
        seen.push([url, init]);
        if (!(url in answers)) throw new TypeError('fetch failed');
        const [status, body, type = 'application/json'] = answers[url];
        return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': type } });
      } });
      const orcidApi = 'https://pub.orcid.org/v3.0/0000-0002-1825-0097/researcher-urls';
      const link = (value, name = 'OpenSheaf') => ({
        'created-date': { value: 1763600000000 }, 'last-modified-date': { value: 1763600000000 },
        source: { 'source-orcid': { uri: ORCID_ID, path: '0000-0002-1825-0097', host: 'orcid.org' } },
        'url-name': name, url: { value }, visibility: 'public',
        path: '/0000-0002-1825-0097/researcher-urls/4242', 'put-code': 4242, 'display-index': 1 });
      const record = (...links) => ({ 'last-modified-date': { value: 1763600000000 }, 'researcher-url': links,
                                      path: '/0000-0002-1825-0097/researcher-urls' });
      answers[orcidApi] = [200, record(link('https://example.org/'), link(`https://opensheaf.org/owner/${OWNER}?next=${NEXT}`))];
      let r = await checkKeeper(http, ORCID_ID, OWNER);
      assert.equal(r.status, CONFIRMED);
      assert.deepEqual(r.successors, [NEXT]);
      assert.equal(seen[0][0], orcidApi);
      assert.equal(seen[0][1].headers.Accept, 'application/json');
      assert.equal(seen[0][1].credentials, 'omit');
      answers[orcidApi] = [200, record(link(`https://opensheaf.org/owner/${OWNER}`))];
      assert.deepEqual(await checkKeeper(http, ORCID_ID, OWNER), { status: CONFIRMED, reason: 'a link of the ORCID record names this owner', successors: [] });
      answers[orcidApi] = [200, record(link(`https://opensheaf.org/owner/x${OWNER}`), link(`https://opensheaf.org/owner/${OWNER}9`),
                                       link(`https://opensheaf.org/owner/${NEXT}/${OWNER}`), link('https://example.org/'))];
      assert.equal((await checkKeeper(http, ORCID_ID, OWNER)).status, CLAIMED);
      answers[orcidApi] = [200, record()];
      assert.equal((await checkKeeper(http, ORCID_ID, OWNER)).status, CLAIMED);
      answers[orcidApi] = [404, { 'response-code': 404 }];
      assert.deepEqual(await checkKeeper(http, ORCID_ID, OWNER), { status: CLAIMED, reason: 'the ORCID registry has no record of this iD', successors: [] });
      answers[orcidApi] = [200, { error: 'something else' }];
      assert.equal((await checkKeeper(http, ORCID_ID, OWNER)).status, NOT_CHECKED);
      answers = {};
      r = await checkKeeper(http, ORCID_ID, OWNER);
      assert.equal(r.status, NOT_CHECKED);
      assert.match(r.reason, /cannot be reached/);
      seen = [];
      assert.equal((await checkKeeper(http, 'https://orcid.org/0000-0002-1825-0098', OWNER)).status, NOT_CHECKED);
      assert.equal((await checkKeeper(http, 'https://localhost/', OWNER)).status, NOT_CHECKED);
      assert.equal((await checkKeeper(http, 'https://192.168.1.1/', OWNER)).status, NOT_CHECKED);
      assert.equal(seen.length, 0);

      const well = 'https://journal.example.org/.well-known/opensheaf';
      const keeper = 'https://journal.example.org/';
      answers[well] = [200, { format: 'opensheaf-keeper/0.2', owners: [OWNER], successors: { [OWNER]: NEXT } }];
      assert.deepEqual(await checkKeeper(http, keeper, OWNER), { status: CONFIRMED, reason: `${well} lists this owner`, successors: [NEXT] });
      assert.equal(seen[0][1].headers, undefined);
      answers[well] = [200, { format: 'opensheaf-keeper/0.2', owners: [NEXT] }];
      assert.deepEqual(await checkKeeper(http, keeper, OWNER), { status: CLAIMED, reason: `${well} does not list this owner`, successors: [] });
      answers[well] = [200, { format: 'opensheaf-keeper/0.1', owners: [OWNER] }];
      assert.equal((await checkKeeper(http, keeper, OWNER)).status, CLAIMED);
      answers[well] = [200, '<!doctype html><title>Not here</title>', 'text/html'];
      assert.equal((await checkKeeper(http, keeper, OWNER)).status, CLAIMED);
      answers[well] = [404, 'not found', 'text/plain'];
      assert.deepEqual(await checkKeeper(http, keeper, OWNER),
        { status: CLAIMED, reason: "the keeper's domain has no file /.well-known/opensheaf", successors: [] });
    });

A declared size is not trusted with memory: a server declaring 400 MB
and sending ten bytes costs a buffer of 64 KiB, not 400 MB. The buffers
made are watched through the global `Uint8Array`, which the module uses.

    // in tests of requests:
    test('a declared size does not allocate memory before the bytes arrive', async () => {
      const declared = 400 * 2 ** 20;
      const fetch = async () => ({ ok: true, status: 200, headers: new Headers({ 'content-length': String(declared) }),
                                   body: new Response(new Uint8Array(10)).body });
      const http = new Http({ fetch, budget: null });
      const Original = globalThis.Uint8Array;
      let most = 0;
      globalThis.Uint8Array = class extends Original {
        constructor(...args) {
          super(...args);
          if (typeof args[0] === 'number') most = Math.max(most, args[0]);
        }
      };
      let bytes;
      try {
        bytes = await http.request('http://example.org/x', { limit: LIMITS.file });
      } finally {
        globalThis.Uint8Array = Original;
      }
      assert.equal(bytes.length, 10);
      assert.ok(most <= 65536, `a buffer of ${most} bytes`);
    });

A page has a budget of requests and of bytes, which `newPage()` renews; a
client made by `another()` spends the same budget, unless it is given
none, as the verification is.

    // in tests of requests:
    test('the budget of a page', async () => {
      const fetch = async () => new Response(new Uint8Array(10));
      const http = new Http({ fetch, budget: { requests: 3, bytes: 25 } });
      await http.request('http://example.org/1');
      await http.request('http://example.org/2');
      await assert.rejects(http.request('http://example.org/3'), { kind: 'budget' });
      http.newPage();
      await http.request('http://example.org/4');
      await http.another().request('http://example.org/5');
      await assert.rejects(http.request('http://example.org/6'), { kind: 'budget', detail: /bytes/ });
      const few = new Http({ fetch, budget: { requests: 2, bytes: 1000 } });
      await few.request('http://example.org/1');
      await few.request('http://example.org/2');
      await assert.rejects(few.request('http://example.org/3'), { kind: 'budget', detail: /2 requests/ });
      const free = http.another({ budget: null });
      for (let k = 0; k < 5; k++) await free.request(`http://example.org/free/${k}`);
      assert.match(explain({ kind: 'budget' }), /one page/);
    });

Untrusted names and layouts
---------------------------

Logical paths, content paths and addresses, as chapter
[11](11-paths.md) checks and builds them; addresses typed by a reader;
identifiers; and the paths of objects in the two layouts of section 3.2,
the hashed one on the example of appendix C, whose path is given there in
full.

    // in tests/paths.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { logicalPathProblem, contentPathProblem, under, isObjectId, isVersion, pathOf, HASHED_LAYOUT } from '../app/paths.js';
    import { baseOf, withScheme } from '../app/archive.js';

    const A = '56wo6cdpjsxk7ddgnqfp2quipfghukhtmvjuahvwzko7m4tkz3pa';
    const N = 'zzgdggwlldcrw4bdeuvntiaobtw2kge6bc4go737pfekhfc5oz4q';

    test('logical paths (section 4.1)', () => {
      assert.equal(logicalPathProblem('figures/walk.pdf'), null);
      assert.equal(logicalPathProblem('/etc/passwd'), 'has an empty, . or .. segment');
      assert.equal(logicalPathProblem('a/'), 'has an empty, . or .. segment');
      assert.equal(logicalPathProblem('a/../b'), 'has an empty, . or .. segment');
      assert.equal(logicalPathProblem('a\\b'), 'has a \\');
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
      assert.equal(under(root, [A, N, 'v1', 'inventory.json']), `${root}${A}/${N}/v1/inventory.json`);
      assert.equal(under(root, ['x', '0=ocfl_object_1.1']), root + 'x/0=ocfl_object_1.1');
      assert.equal(under(root, ['a', 'notes #2?.pdf']), root + 'a/notes%20%232%3F.pdf');
      assert.equal(under(root, ['946', 'sheaf%3az']), root + '946/sheaf%253az');
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
      assert.ok(isObjectId(`sheaf:${N}:${A}`));
      assert.ok(isObjectId('sheaf:draft:notes'));
      assert.ok(!isObjectId(`sheaf:${N}:aajozkubvmxu37pbu2lumdl37llv4ntkazd6j2es54zn23fkiknb`), 'an owner name is a name of algorithm 0');
      assert.ok(!isObjectId('kpz-reloaded'), 'an identifier of 0.1');
      assert.ok(!isObjectId(`sheaf:${N.toUpperCase()}:${A}`));
      assert.ok(!isObjectId('sheaf:draft:' + 'a'.repeat(65)));
      assert.ok(isVersion('v12'));
      assert.ok(!isVersion('v012'));
    });

    test('the paths of the two layouts (section 3.2, appendix C)', async () => {
      assert.deepEqual(await pathOf(`sheaf:${N}:${A}`), [A, N]);
      assert.deepEqual(await pathOf(`sheaf:${A}:${A}`), [A, A]);
      assert.deepEqual(await pathOf('sheaf:draft:notes'), ['draft', 'notes']);
      assert.equal((await pathOf(`sheaf:${N}:${A}`, HASHED_LAYOUT)).join('/'),
        '946/75e/b2e/sheaf%3azzgdggwlldcrw4bdeuvntiaobtw2kge6bc4go737pfekhfc5oz4q%3a56wo6cdpjsxk7ddgnqfp2quipfghukhtmvjua-' +
        '94675eb2e27de7146a912666db928784432a4c206a6b390da5a0ed7d15975580');
      await assert.rejects(pathOf('alpha'), /not the identifier of a line or of a draft/);
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

An object version that repeats the own files and the change note of an
earlier document version keeps its number: a new number is reported,
naming the first document version repeated. A different change note is
something new, and is not reported.

    // in tests of document versions:
    test('a new number for files and a change note deposited before (section 7.3)', () => {
      const note = { text: 'typos' };
      const { inv, objOf } = make([
        { obj: { documentVersion: 1 }, files: { 'a.tex': 'a1' } },
        { obj: { documentVersion: 2, changes: note }, files: { 'a.tex': 'a2' } },
        { obj: { documentVersion: 3 }, files: { 'a.tex': 'a1' } },
        { obj: { documentVersion: 4 }, files: { 'a.tex': 'a2' } },
      ]);
      assert.deepEqual(documentVersionErrors(inv, objOf).map((e) => `${e.ver} ${e.message}`), [
        'v3 document version 3 holds the same files and change note as document version 1, whose number it keeps',
      ]);
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
and members are made in the test.

    // in tests/names.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { memberErrors } from '../app/rules.js';
    import { contentPath } from '../app/versions.js';
    import { readableMath } from '../app/text.js';
    import { validate } from '../app/schema.js';
    import { readSchemas } from './disk.mjs';

    const inventory = (versions, manifest = {}) => ({ id: 'x', digestAlgorithm: 'sha512', manifest,
      head: versions[versions.length - 1], versions: Object.fromEntries(versions.map((v) => [v, { state: {} }])) });

    test('a digest of the state named like an inherited property', () => {
      const inv = { manifest: {}, versions: { v1: { state: { toString: ['a.tex'] } } } };
      assert.equal(contentPath(inv, 'v1', 'a.tex'), null);
      assert.deepEqual(memberErrors('selection', JSON.parse('{"__proto__": {"version": "v1"}, "revisions": [{"documentVersion": 1, "version": "v1", "inventorySha512": "x"}]}')), []);
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
      assert.ok(validate(schemas['opensheaf-collection/0.2'], { format: 'opensheaf-collection/0.2', type: 'constructor', members: [] }).length);
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
    import { diskFetch, readSchemas, ORIGIN, ALPHA, BETA, idOf, folder } from './disk.mjs';

    <<a small imitation of the document>>

    const { Http } = await import('../app/http.js');
    const { Archive } = await import('../app/archive.js');
    const { Resolver } = await import('../app/resolve.js');
    const { showObject } = await import('../app/view-object.js');
    const { showCollection } = await import('../app/view-collection.js');
    const { showArchive, ROWS_AT_ONCE } = await import('../app/view-archive.js');
    const { showVerify } = await import('../app/view-verify.js');
    const { showOwner } = await import('../app/view-owner.js');
    const { clear } = await import('../app/dom.js');

    <<a session of the explorer on slow fixtures>>

    <<tests of pages left>>

    <<tests of pages that grow>>

    <<tests of what the pages show>>

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
      await summary(ctx, ALPHA);
      await summary(ctx, BETA);
      go();
      const left = showObject(ctx, main, ALPHA, 'v1');
      await wait(5);
      go();
      const shown = showObject(ctx, main, BETA);
      await Promise.all([left, shown]);
      assert.deepEqual(main.all('code').map((c) => c.textContent).filter((t) => t === 'alpha' || t === 'beta'), ['beta']);
      assert.equal(main.all('h1').length, 1);
    });

A collection page whose pins are being resolved stops when it is left:
no address is fetched after the reader has gone, even though the new
page has a live signal of its own. The catalogue `shelf` of the second
fixture archive is used: most of its members are in the first archive, so
resolving them reads that archive, and one of them is the collection
`reading`, which the check opens in turn. The reader leaves after fifteen files have been
read, while that collection is being opened: leaving earlier would only
cancel what is in flight, and the member lists would have nothing more to
fetch, wrong signal or not (the page as it was before this test fetched
fourteen files after the reader had gone).

    // in tests of pages left:
    test('the pins of a collection page left are not resolved further', async () => {
      const { ctx, main, log, go } = await session('other/');
      go();
      await showCollection(ctx, main, idOf('shelf', 'other'));
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
`object.json` of the other object versions, nor its signatures.

    // in tests of pages that grow:
    test('the page of an archive reads only what its rows show', async () => {
      const { ctx, main, log, go } = await session('archive/', 1);
      go();
      showArchive(ctx, main);
      const status = () => main.all('p').find((p) => p.className === 'muted small').textContent;
      for (let t = 0; /descriptions read|^$/.test(status()) && t < 3000; t++) await wait(1);
      await wait(20);
      const alpha = log.filter((u) => u.startsWith(folder(ALPHA))).map((u) => u.slice(folder(ALPHA).length)).sort();
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
      const archive = { name: 'Synthetic', base: ORIGIN + 'synthetic/', root: ORIGIN + 'synthetic/ocfl/',
                        disc: { objects }, objects: () => objects, tombstones: () => [], owners: () => [], drafts: () => [],
                        inventory: read, history: read };
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

What the pages show
-------------------

What the pages of version 0.2 add, on the fixtures: the page of a line
gives its `sheaf:` URI and the status of the signatures of each version,
and says when a version is contested and the line has no signed version;
the page of an owner whose key log forks says that it has ended, at the
fork point; the page of a catalogue resolves its members, wherever they
are, with the statuses of section 8.5.

    // in tests of what the pages show:
    test('a contested line, an ended owner, the statuses of members', async () => {
      const other = await session('other/', 0);
      other.go();
      await showObject(other.ctx, other.main, idOf('exposed', 'other'));
      const text = other.main.textContent;
      assert.match(text, /contested/);
      assert.match(text, /no signed version that is not contested/);
      assert.ok(text.includes(`sheaf:${idOf('exposed', 'other').split(':')[1]}`));
      assert.ok(!text.includes(idOf('exposed', 'other')), 'the line of its originator is written sheaf:<name> only');
      const forked = await session('forked/', 0);
      forked.go();
      await showOwner(forked.ctx, forked.main, idOf('before', 'forked').split(':')[2]);
      assert.match(forked.main.textContent, /ended by a fork at v2/);
      other.go();
      await showCollection(other.ctx, other.main, idOf('shelf', 'other'));
      const run = other.main.all('button').find((b) => b.textContent === 'Resolve and check all pins');
      await run.listeners.click[0]();
      const report = other.main.all('p').find((p) => /pins? resolved/.test(p.textContent));
      assert.match(report.textContent, /verified/);
      assert.doesNotMatch(report.textContent, /mismatch|unavailable|not a version/);
    });

Verification
------------

The verification of the fixtures is compared with `osheaf verify`,
finding by finding: the three archives, with the digests of every file
and the members of other archives resolved, and every broken copy, give
exactly the findings `osheaf verify` gave, errors, warnings and results,
in the same words and at the same places. Three kinds of findings are
left out of the comparison, which the explorer cannot make over HTTP, and
which the page of the verification lists as not checked:

- what an OCFL validator says (`osheaf verify` runs one, the explorer
  makes the checks of chapter [17](17-verify.md) only);
- entries of index files the explorer has no reason to read (a server
  lists no folders, so it reads the files of the prefixes it expects);
- the statuses of signature files the explorer cannot name: without the
  key log of the owner, the names of the signature files are unknown;
  `osheaf verify` lists the folder and judges them unchecked, the explorer
  says unchecked of the versions.

Then: nothing is fetched outside the storage roots, the discovery
documents, the indexes and the website; an archive that has disappeared
makes the members that pin it unavailable, and the parent line of a
branch unavailable; a second verification reads the archive again; and
cases the fixtures do not hold, made by changing a file as it is served.

    // in tests/verify.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { createHash } from 'node:crypto';
    import { Http } from '../app/http.js';
    import { Archive } from '../app/archive.js';
    import { verify } from '../app/verify.js';
    import { diskFetch, readSchemas, osheaf, fixture, folder, ORIGIN, ALPHA, BETA, idOf } from './disk.mjs';

    const schemas = await readSchemas();

    async function run(path, { digests = false, remote = true, log = [], down = [], patch = {} } = {}) {
      const http = new Http({ fetch: patched(diskFetch({ log, down }), patch) });
      const archive = await Archive.open(http, ORIGIN + path);
      return verify(archive, { schemas, digests, remote });
    }

    const errors = (report) => report.findings.filter((f) => f.level === 'error').map((f) => f.text).sort();

    <<serving a changed file>>

    <<tests of the verification>>

The comparison. The findings of `osheaf verify` are written `severity:
place: message`, and so are the explorer's; those `osheaf verify` alone
can find are left out, as said above (the explorer may find some of
them: an entry of an index file it read), and each fixture is compared
both ways.

    // in tests of the verification:
    const beyondHttp = (f) => /^error: [^:]*: OCFL validator: |^error: ocfl: the OCFL validator rejects/.test(f) ||
      / an entry the storage root does not justify: /.test(f) ||
      /^warning: .*: signature-[a-z2-7]{16}\.json: unchecked: /.test(f);

    async function compare(name, path, options) {
      const report = await run(path, options);
      const ours = report.findings.map((f) => `${f.level}: ${f.text}`).sort();
      const theirs = (await osheaf(name)).map((x) => `${x.severity}: ${x.place}: ${x.message}`).sort();
      assert.deepEqual(ours.filter((f) => !theirs.includes(f)), [], `${name}: found by the explorer alone`);
      assert.deepEqual(theirs.filter((f) => !beyondHttp(f) && !ours.includes(f)), [], `${name}: found by osheaf verify alone`);
      return report;
    }

    test('the fixture archives verify as osheaf verify says', async () => {
      const log = [];
      const report = await compare('archive', 'archive/', { digests: true, log });
      assert.deepEqual(errors(report), []);
      assert.equal(report.stats.objects, 7);
      assert.ok(report.stats.files > 20);
      const allowed = (url) => /^https:\/\/fixtures\.example\.org\/archive\/(ocfl\/|opensheaf\.json$|index\.html$|paper\/|names\/|owners\/|sha512\/)/.test(url);
      assert.deepEqual(log.filter((url) => !allowed(url)), []);
      for (const a of ['forked', 'other']) assert.deepEqual(errors(await compare(a, `${a}/`, { digests: true })), []);
    });

    test('the broken copies give the findings osheaf verify gives', async () => {
      const broken = ['bad-signature', 'changed-file', 'dropped-notice', 'gap', 'key-log', 'no-key-log', 'old',
                      'previous', 'stale', 'unchecked-branch', 'unsigned', 'wrong-pin'];
      for (const b of broken) {
        const report = await compare(`broken-${b}`, `broken/${b}/`, { digests: true, remote: b === 'unchecked-branch' });
        assert.ok(errors(report).length > 0, `${b} passes`);
      }
    });

The findings of a few broken copies, in full, as a reader would read
them: they are what the comparison checks, but a change of `osheaf verify`
and the explorer together would go unseen by it.

    // in tests of the verification:
    test('what the broken copies break', async () => {
      assert.deepEqual(errors(await run('broken/old/')), ['archive: specification 0.1: rebuild (section 16.1)']);
      assert.deepEqual(errors(await run('broken/stale/')),
        ['opensheaf.json: the entry of beta is stale: head v1 instead of v2']);
      assert.deepEqual(errors(await run('broken/changed-file/', { digests: true })),
        ['alpha: v1/content/paper.pdf does not have the digest of the manifest']);
      assert.ok(errors(await run('broken/previous/')).includes('alpha v2: previous is not the digest of the inventory of v1 (section 4.3)'));
      assert.ok(errors(await run('broken/unsigned/')).includes('main v2 member beta v2: not a version: a collection pins only signed versions (section 8.5)'));
      const noLog = await run('broken/no-key-log/');
      assert.ok(errors(noLog).includes(`alpha: the key log of its owner ${ALPHA.split(':')[2]} is not in the storage root (section 6.5)`));
      const branch = await run('broken/unchecked-branch/');
      assert.ok(branch.findings.some((f) => f.level === 'warning' && f.place === 'alpha-accepted v1' && /^unchecked branch point: /.test(f.message)));
      assert.ok(branch.findings.some((f) => f.level === 'result' && f.message.endsWith(': unchecked (section 9.3)')));
    });

The archive explored is read afresh by each verification, which counts
its own requests, and is not held to the budget of a page.

    // in tests of the verification:
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

    test('a verification is not held to the budget of a page', async () => {
      const http = new Http({ fetch: diskFetch(), budget: { requests: 1, bytes: 2 ** 20 } });
      const archive = await Archive.open(http, ORIGIN + 'archive/');
      const report = await verify(archive, { schemas });
      assert.deepEqual(errors(report), []);
      assert.ok(report.requests > 1);
    });

An archive that has disappeared: the members of `shelf` held there are
unavailable, as is the parent line of the accepted copy, and the
resolution says why.

    // in tests of the verification:
    test('an archive that disappeared', async () => {
      const report = await run('other/', { down: [ORIGIN + 'archive/'] });
      const shelf = report.findings.filter((f) => f.place.startsWith('shelf v1 member') && f.level === 'warning');
      assert.deepEqual(shelf.map((f) => f.message), ['unavailable (section 8.5)', 'unavailable (section 8.5)', 'unavailable (section 8.5)']);
      assert.ok(report.findings.some((f) => f.message === "the parent's line: unavailable"));
      assert.ok(report.findings.some((f) => f.place === 'resolution' && f.message.startsWith(`unavailable: ${ORIGIN}archive/`)));
      assert.deepEqual(errors(report), []);
    });

Cases the fixtures do not hold are made by changing a file as it is
served: `patch` maps an address to its new content (a string, or a
function of the old one), or to `null` for a file that is missing.

    // in serving a changed file:
    function patched(fetch, patch) {
      return async (url, init = {}) => {
        if (!Object.hasOwn(patch, url)) return fetch(url, init);
        const change = patch[url];
        if (change === null) return new Response('not found', { status: 404 });
        const text = typeof change === 'function' ? change(await (await fetch(url, init)).text()) : change;
        return new Response(init.method === 'HEAD' ? null : text, { status: 200 });
      };
    }

    const digestOf = (text) => createHash('sha512').update(text).digest('hex');

An inventory copy with another head, or fewer versions; a storage root
with an `ocfl_layout.json` in the owner-name layout; a home page that
does not show the pins of the main catalogue, which is an error for an
archive declaring the profile `website` and a warning otherwise; a key
log without the signature files of its second version; a tombstone of an
object listed; a label given twice; an index file that starts with a
byte order mark, or holds bytes that are not UTF-8, which is not JSON for
`osheaf verify` either.

    // in tests of the verification:
    test('an inventory copy with another head, or fewer versions', async () => {
      const url = `${folder(ALPHA)}v2/inventory.json`;
      const copy = JSON.parse(await (await diskFetch()(url)).text());
      copy.head = 'v1';
      let text = JSON.stringify(copy);
      const patch = { [url]: text, [url + '.sha512']: `${digestOf(text)}  inventory.json\n` };
      const found = errors(await run('archive/', { patch }));
      assert.ok(found.includes('alpha v2: the inventory copy has the head v1'));
      delete copy.versions.v2;
      text = JSON.stringify(copy);
      const fewer = errors(await run('archive/', { patch: { [url]: text, [url + '.sha512']: `${digestOf(text)}  inventory.json\n` } }));
      assert.ok(fewer.includes('alpha v2: the inventory copy does not record exactly the versions v1 to v2'));
    });

    test('the layout, the home page and the profile website', async () => {
      assert.deepEqual(errors(await run('archive/', { patch: { [`${ORIGIN}archive/ocfl/ocfl_layout.json`]: '{}' } })),
        ['ocfl: ocfl_layout.json names only registered layouts: the owner-name layout has none (section 3.2)']);
      const index = { [`${ORIGIN}archive/index.html`]: '<html></html>' };
      assert.deepEqual(errors(await run('archive/', { patch: index })), [
        'index.html: does not show the pin of ' + ALPHA.split(':')[1],
        'index.html: does not show the pin of ' + BETA.split(':')[1],
        'index.html: does not show the pin of ' + idOf('gamma').split(':')[1],
      ].sort());
      const noWebsite = (text) => JSON.stringify({ ...JSON.parse(text), profiles: [] });
      const report = await run('archive/', { patch: { ...index, [`${ORIGIN}archive/opensheaf.json`]: noWebsite } });
      assert.deepEqual(errors(report), []);
      assert.equal(report.findings.filter((f) => f.place === 'index.html' && f.level === 'warning').length, 3);
    });

    test('an index file with a byte order mark, or bytes that are not UTF-8', async () => {
      const shard = (await fixture('archive/opensheaf.json')).owners[0].slice(0, 2);
      const url = `${ORIGIN}archive/owners/${shard}.json`;
      const text = await (await diskFetch()(url)).text();
      for (const change of ['\ufeff' + text, new Uint8Array([...new TextEncoder().encode(text.slice(0, -3)), 0xff, 0x0a])]) {
        const found = errors(await run('archive/', { patch: { [url]: change } }));
        assert.ok(found.some((f) => f.startsWith(`owners/${shard}.json: not JSON: `) && /(starts with a byte order mark|is not UTF-8)/.test(f)), found.join('\n'));
      }
    });

    test('labels given twice, a tombstone of an object listed', async () => {
      const twice = (text) => {
        const disc = JSON.parse(text);
        disc.objects.find((o) => o.label === 'beta').label = 'alpha';
        disc.tombstones[0].id = ALPHA;
        return JSON.stringify(disc);
      };
      const found = errors(await run('archive/', { patch: { [`${ORIGIN}archive/opensheaf.json`]: twice } }));
      assert.ok(found.includes('opensheaf.json: the label alpha is given twice (section 3.1)'));
      assert.ok(found.includes(`opensheaf.json: ${ALPHA} has a tombstone, and is an object of the archive (section 13.3)`));
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
the errors as `osheaf verify` does, then `OK` or their number; with
`--all`, the warnings and results too, and with `--digests`, it also
checks the digest of every file.

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
      if (f.level === 'error') console.log(`error: ${f.text}`);
      else if (args.includes('--all')) console.log(`${f.level}: ${f.text}`);
      if (f.errors && args.includes('--all')) for (const e of f.errors) console.log(`    ${explain(e)}`);
    }
    const n = report.counts().error;
    console.log(n ? `${n} problem(s)` : 'OK');
    console.error(`${report.stats.objects} objects, ${report.stats.versions} object versions, ` +
                  `${report.stats.pins} pins, ${report.stats.files} files; ${report.requests} requests, ` +
                  `${report.bytesRead} bytes`);
    process.exit(n ? 1 : 0);


The colours of JSON
-------------------

The tokens that colour a JSON file shown ([the pieces](22-pieces.md)): a
string followed by a colon is a key, other strings, numbers and `true`,
`false`, `null` are values, an escaped quote does not end a string, and
the pieces, joined, give back the text.

    // in tests/json.test.mjs:
    import { test } from 'node:test';
    import assert from 'node:assert/strict';
    import { jsonTokens } from '../app/ui.js';

    test('JSON is split into keys, values and the rest', () => {
      const text = JSON.stringify({ a: 'x"y: 1', n: -1.5e3, ok: true, z: null, k: ['s'] }, null, 2);
      const tokens = jsonTokens(text);
      assert.equal(tokens.map((t) => t.text).join(''), text);
      const kinds = (kind) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
      assert.deepEqual(kinds('key'), ['"a"', '"n"', '"ok"', '"z"', '"k"']);
      assert.deepEqual(kinds('string'), ['"x\\"y: 1"', '"s"']);
      assert.deepEqual(kinds('number'), ['-1500']);
      assert.deepEqual(kinds('literal'), ['true', 'null']);
    });
