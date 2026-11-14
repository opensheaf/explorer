#!/usr/bin/env python3
# Generated from literate/70-tests.md by tools/tangle.py: edit the document, not this file.
"""Make broken copies of the fixture archive, for the tests:

    python3 tests/fixtures/break.py

Each copy breaks one rule, as a damaged or tampered archive would."""
import hashlib
import json
import shutil
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "archive"


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
