#!/usr/bin/env python3
# Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
"""Make broken copies of the fixture archives, for the tests:

    python3 tests/fixtures/break.py

Each copy breaks one rule, as a damaged or tampered archive would."""
import base64
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent

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
print("broken copies written in", HERE / "broken")
