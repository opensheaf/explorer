Document versions and history
=============================

OCFL knows object versions, `v1`, `v2`, ..., one for every change of an
object. Readers want the versions of the *work*: OpenSheaf calls them
document versions, numbers them from 1 without gaps, and orders them by a
*history* (section 7.3). The two numberings diverge: a description-only
version changes the description and keeps the document version, a
completion adds the sources of a version deposited without them and keeps
its number, and a version found later gets the next number although it
comes earlier in the history of the work. The rules are explained at
length in the chapter
[Document versions, history and dates](https://opensheaf.org/opensheaf-py/11-versions.html)
of opensheaf-py; this chapter gives the same functions in JavaScript,
working on data already fetched, so that they can be tested without a
network.

The module is `app/versions.js`. Every function here is pure: it reads an
inventory and a function `objOf(version)` that returns the `object.json` of
an object version (or `null` if it could not be read).

    // in app/versions.js:
    import { isVersion, versionNumber } from './paths.js';
    import { same } from './schema.js';

    <<the versions and the state of an inventory>>

    <<the history and the current version>>

    <<what each object version did>>

    <<the pins of a member>>

    <<reading the descriptions>>

    <<the rules of document versions>>

The versions and the state of an inventory
------------------------------------------

The versions of an inventory are its keys of the form `vN`, in the order
of their numbers. The *state* of a version maps digests to the logical
paths of its files; turned around, it gives the digest of each path, and a
logical path is found in the manifest through that digest. When a digest
has several content paths (OCFL allows it), the first is used, as
opensheaf-py does.

    // in the versions and the state of an inventory:
    export function versionsOf(inv) {
      const versions = inv && typeof inv.versions === 'object' && inv.versions ? Object.keys(inv.versions) : [];
      return versions.filter(isVersion).sort((a, b) => versionNumber(a) - versionNumber(b));
    }

    export function filesOf(inv, ver) {
      const files = {};
      const state = inv?.versions?.[ver]?.state || {};
      for (const [digest, paths] of Object.entries(state)) {
        for (const p of Array.isArray(paths) ? paths : []) files[p] = digest;
      }
      return files;
    }

    export function contentPath(inv, ver, logical) {
      const digest = filesOf(inv, ver)[logical];
      const paths = digest && inv.manifest?.[digest];
      return Array.isArray(paths) && typeof paths[0] === 'string' ? paths[0] : null;
    }

The history and the current version
-----------------------------------

Without `history` in `object.json`, the history is the last object version
holding each document version, in the order of the numbers, among the
object versions up to `at` (by default the head); with it, it is the
`history` of the object version `at`. The current version is the last
entry of the history (section 7.3). A collection pins an object version,
and shows the history as known at that version, which is what `at` is
for.

    // in the history and the current version:
    export function defaultHistory(inv, objOf, at = inv.head) {
      const last = new Map();
      for (const ver of versionsOf(inv)) {
        if (versionNumber(ver) <= versionNumber(at)) {
          const n = objOf(ver)?.documentVersion;
          if (Number.isInteger(n)) last.set(n, ver);
        }
      }
      return [...last.keys()].sort((a, b) => a - b).map((n) => last.get(n));
    }

    export function historyOf(inv, objOf, at = inv.head) {
      const hist = objOf(at)?.history;
      return Array.isArray(hist) && hist.length ? hist : defaultHistory(inv, objOf, at);
    }

    export function currentVersion(inv, objOf, at = inv.head) {
      const hist = historyOf(inv, objOf, at);
      return hist[hist.length - 1] || at;
    }

What each object version did
----------------------------

The explorer shows, for every object version, what it did to the
document: deposited a new document version, completed one that lacked its
sources, or only described one (a description-only version, section 7.3,
which also covers notices and withdrawals). This is read from the same
data as the rules below: a document version seen before, with files added
while its sources were missing, is a completion; seen before otherwise, a
description.

    // in what each object version did:
    export function rolesOf(inv, objOf) {
      const roles = {};
      const seen = new Map();
      for (const ver of versionsOf(inv)) {
        const obj = objOf(ver);
        const n = obj?.documentVersion;
        if (!obj || obj.kind !== 'document') {
          roles[ver] = obj ? 'collection' : 'unknown';
          continue;
        }
        const files = Object.keys(ownFiles(inv, ver, obj)).length;
        if (!seen.has(n)) roles[ver] = 'new';
        else if (seen.get(n).missing && files > seen.get(n).files) roles[ver] = 'completion';
        else roles[ver] = 'description';
        seen.set(n, { missing: Boolean(obj.sourcesMissing), files });
      }
      return roles;
    }

The pins of a member
--------------------

A member of an archive collection has one pin, its `version` with its
`inventorySha512`; a member of a selection has one per revision, each also
stating the document version that the pinned object version holds
(section 10.2). The version presented for a member is the last revision
of a selection's member, or the current version as of the pin of an
archive collection's member.

    // in the pins of a member:
    export function memberPins(m) {
      if (m && 'revisions' in m) {
        return (Array.isArray(m.revisions) ? m.revisions : []).map((r) => ({
          version: r?.version, pin: r?.inventorySha512, documentVersion: r?.documentVersion,
        }));
      }
      return [{ version: m?.version, pin: m?.inventorySha512, documentVersion: null }];
    }

Reading the descriptions
------------------------

A few small readers of `datacite.json` and `object.json`, shared by the
pages and the verification: a date of a given type (the first type found
wins, as in opensheaf-py), the title, the names of the creators, the
abstract, and the PDF of a document version (the first rendition of type
`application/pdf`, or else the first whose path ends in `.pdf`). Remote
data may have any shape, so each reader checks types and returns `null` or
an empty list rather than failing.

    // in reading the descriptions:
    const list = (x) => (Array.isArray(x) ? x : []);
    const text = (x) => (typeof x === 'string' ? x : null);

    export function dateOf(dc, ...types) {
      for (const type of types) {
        const d = list(dc?.dates).find((x) => x?.dateType === type);
        if (d && text(d.date)) return d.date;
      }
      return null;
    }

    export function titleOf(dc) {
      return text(list(dc?.titles).find((t) => !t?.titleType)?.title) || text(list(dc?.titles)[0]?.title);
    }

    export function creatorsOf(dc) {
      return list(dc?.creators).map((c) => text(c?.name) || [c?.givenName, c?.familyName].filter(text).join(' '))
        .filter(Boolean);
    }

    export function abstractOf(dc) {
      return text(list(dc?.descriptions).find((d) => d?.descriptionType === 'Abstract')?.description);
    }

    export function pdfOf(obj) {
      const rs = list(obj?.renditions).filter((r) => text(r?.path));
      return (rs.find((r) => r.mediaType === 'application/pdf') || rs.find((r) => r.path.toLowerCase().endsWith('.pdf')))?.path || null;
    }

    export function ownFiles(inv, ver, obj) {
      const notes = new Set(list(obj?.notices).map((x) => x?.path).filter(text));
      const withdrawal = obj?.withdrawal?.reason?.path;
      if (text(withdrawal)) notes.add(withdrawal);
      const own = {};
      for (const [p, digest] of Object.entries(filesOf(inv, ver))) {
        if (p !== 'datacite.json' && p !== 'object.json' && !notes.has(p)) own[p] = digest;
      }
      return own;
    }

The rules of document versions
------------------------------

Section 14 asks a verifier to "check the document versions of each
document (section 7.3): object versions with the same document version
have the same sources, renditions and change note, except that a version
with `sourcesMissing` may be completed by adding files; new numbers follow
the rule of new versions, without gaps; `history`, when present, lists
distinct document versions, covers all of them, each entry being the last
object version holding its document version; no object version after the
first one with `history` lacks it; every notice is kept unchanged in every
later object version".

The check is a port of `document_version_errors` of `osheaf verify`
([its chapter](https://opensheaf.org/opensheaf-py/17-verify.html)), line
for line, with the same messages, so that the two verifiers report the
same problems in the same words. It goes once through the object
versions, remembering for each document version its *own* files
(everything except the two descriptions and the files of notices and of a
withdrawal, which description-only versions add), its change note, and
whether its sources were missing. It stops at the first object version
that is not a document (a collection has no document versions) or whose
`object.json` could not be read, as opensheaf-py does.

    // in the rules of document versions:
    export function documentVersionErrors(inv, objOf) {
      const errors = [];
      const add = (ver, message) => errors.push({ ver, message });
      const versions = versionsOf(inv);
      const seen = new Map(), filesOfDoc = new Map(), missingOf = new Map();
      let highest = 0, hadHistory = false, notices = [];
      for (const ver of versions) {
        const obj = objOf(ver);
        if (!obj || obj.kind !== 'document') return errors;
        const n = obj.documentVersion;
        const own = ownFiles(inv, ver, obj);
        const change = obj.changes?.text ?? null;
        <<check the number and the files of a document version>>
        <<check the history recorded in an object version>>
        <<check that an object version keeps the earlier notices>>
      }
      return errors;
    }

A document version seen before must have the same own files and change
note, except while its sources are missing: then files may be added,
never changed or removed. A document version not seen before must have
the next number.

    // in check the number and the files of a document version:
    if (seen.has(n)) {
      const before = filesOfDoc.get(n);
      if (missingOf.get(n)) {
        const changed = Object.entries(own).some(([p, d]) => p in before && before[p] !== d);
        const removed = Object.keys(before).some((p) => !(p in own));
        if (changed || removed) add(ver, `changes files of document version ${n} (only additions allowed)`);
      } else if (!same(own, before) || change !== seen.get(n)) {
        add(ver, `has other files than document version ${n}`);
      }
      missingOf.set(n, Boolean(obj.sourcesMissing));
      filesOfDoc.set(n, own);
    } else {
      if (n !== highest + 1) add(ver, `document version ${n} breaks the numbering (expected ${highest + 1})`);
      highest = Math.max(highest, Number.isInteger(n) ? n : 0);
      seen.set(n, change);
      filesOfDoc.set(n, own);
      missingOf.set(n, Boolean(obj.sourcesMissing));
    }

The history, once present, must stay; it may name only object versions
that exist at that point; it must list each document version known so far
exactly once; and each entry must be the last object version holding its
document version, as known when the history was written.

    // in check the history recorded in an object version:
    const hist = obj.history;
    if (hadHistory && hist == null) add(ver, 'lacks the history of earlier versions');
    if (hist != null) {
      hadHistory = true;
      const known = versions.filter((v) => versionNumber(v) <= versionNumber(ver));
      if (!Array.isArray(hist) || hist.some((h) => !known.includes(h))) {
        add(ver, 'history names unknown object versions');
      } else {
        const docs = hist.map((h) => objOf(h)?.documentVersion);
        const all = Array.from({ length: highest }, (_, k) => k + 1);
        if (new Set(docs).size !== docs.length || !same([...new Set(docs)].sort((a, b) => a - b), all)) {
          add(ver, 'history does not list each document version once');
        }
        hist.forEach((h, k) => {
          const later = known.filter((v) => versionNumber(v) > versionNumber(h) && objOf(v)?.documentVersion === docs[k]);
          if (later.length) add(ver, `history entry ${h} is not the last object version of ${docs[k]}`);
        });
      }
    }

Every notice of an object version must be present, unchanged, in the next
one, and so in every later one.

    // in check that an object version keeps the earlier notices:
    const current = Array.isArray(obj.notices) ? obj.notices : [];
    if (notices.some((x) => !current.some((y) => same(x, y)))) add(ver, 'drops or changes an earlier notice');
    notices = current;
