The rules of an archive
=======================

Section 14 lists what a verifier must check. Most of it is a matter of
reading files and comparing them with rules: this chapter gives those
rules as pure functions of data already fetched, the discovery document,
an inventory, the two descriptions of an object version, a member list.
The [next chapter](17-verify.md) fetches the data, calls these functions,
and adds the checks that need more requests: digests, pins, accepted
copies.

The checks are those of `osheaf verify`
([its chapter](https://opensheaf.org/opensheaf-py/17-verify.html)), with
the same messages where the same thing is checked, so that a reader can
compare the two reports line by line. Where the explorer checks more, or
less, it says so, here and on the page of the verification.

The module is `app/rules.js`.

    // in app/rules.js:
    import { validate } from './schema.js';
    import { isObjectId, isVersion, versionNumber, logicalPathProblem, contentPathProblem } from './paths.js';
    import { versionsOf, filesOf, dateOf } from './versions.js';

    <<findings>>

    <<validating a file against its schema>>

    <<the rules of the discovery document>>

    <<the rules of an inventory>>

    <<the rules of an object version>>

    <<the rules of a member list>>

Findings
--------

A finding has a *level*: an `error` breaks a requirement of the
specification (a MUST, or a rule that section 14 names); a `warning` is
something a reader should know and that is not an error (a SHOULD); an
`info` is a note on the verification itself (what was not checked, a
source that was unavailable). It names the place (`opensheaf.json`, or
`ocfl/<id>` for an object, as opensheaf-py does), the object and the
object version it concerns, if any, the section of the specification,
and a message; its `text` is the line opensheaf-py would print.

    // in findings:
    export function finding(level, where, message, section, { object = null, ver = null } = {}) {
      const text = `${where}: ${ver ? ver + ' ' : ''}${message}`;
      return { level, where, object, ver, message, section, text };
    }

    export const LAYOUT = '0002-flat-direct-storage-layout';

Schemas
-------

The JSON files are validated against the schema of the format the
explorer knows, version 0.1. A file declaring another version fails on
its `format` (a `const`), which is what section 12 asks: a reader "MUST
NOT silently treat the files as valid". Each error of the schema is a
finding, with the place in the file.

    // in validating a file against its schema:
    export function schemaFindings(where, data, schema, section, context = {}) {
      if (!schema) return [];
      return validate(schema, data).map((e) =>
        finding('error', where, `${e.path ? e.path + ': ' : ''}${e.message}`, section, context));
    }

The discovery document
----------------------

The discovery document is checked against its schema; it must state the
required layout (section 5); its objects must have distinct identifiers,
none of them that of a tombstone (sections 6.3 and 14). These checks need
nothing but the document. The rest (that the storage root exists, that
each listed object is as its head states it) is in the next chapter.

A verifier "SHOULD check [...] the requirements of the profiles the
archive declares, and those of the extensions it knows; it SHOULD report
the extensions it does not know". The explorer knows no profile
requirement and no extension: it reports both as notes.

    // in the rules of the discovery document:
    export function discoveryFindings(disc, schemas) {
      const out = [];
      const where = 'opensheaf.json';
      out.push(...schemaFindings(where, disc, schemas['opensheaf-archive/0.1'], '6.1, appendix D'));
      if (disc.storageLayout !== LAYOUT) out.push(finding('error', where, 'storage root missing or with another layout', '5'));
      const objects = Array.isArray(disc.objects) ? disc.objects : [];
      const ids = objects.map((o) => o?.id);
      for (const id of new Set(ids.filter((id, k) => ids.indexOf(id) !== k))) {
        out.push(finding('error', where, `lists the object ${id} more than once`, '6.3'));
      }
      for (const t of Array.isArray(disc.tombstones) ? disc.tombstones : []) {
        if (ids.includes(t?.id)) out.push(finding('error', where, `lists the object ${t.id}, which has a tombstone`, '11.3, 14'));
      }
      for (const o of objects) {
        if (!isObjectId(o?.id)) out.push(finding('error', where, `an object without a valid identifier: ${JSON.stringify(o?.id ?? o)}`, '6.3'));
      }
      for (const p of Array.isArray(disc.profiles) ? disc.profiles : []) {
        out.push(finding('info', where, `declares the profile ${p}, whose requirements are not checked`, '4, 14'));
      }
      for (const e of Array.isArray(disc.extensions) ? disc.extensions : []) {
        out.push(finding('info', where, `lists the extension ${e}, which the explorer does not know`, '4, 14'));
      }
      return out;
    }

An inventory
------------

The inventory names its object and uses SHA-512 (section 7.1), as
opensheaf-py checks. The explorer adds a few checks of the structure of
OCFL that it needs to read the inventory safely, since a standard OCFL
validator, which `osheaf verify` runs when it is installed, is not
available in a browser:

- the versions are `v1`, `v2`, ... without gaps and without zero-padding
  (section 7.1), and the head is the last;
- every digest of a state is in the manifest;
- every content path of the manifest lies in a version's content
  directory and is safe to fetch (section 15).

These are a small part of OCFL's rules; the page of the verification says
that the storage root is not validated against OCFL 1.1 as a whole.

    // in the rules of an inventory:
    export function inventoryFindings(id, inv) {
      const out = [];
      const where = `ocfl/${id}`;
      const add = (message, section, ver = null) => out.push(finding('error', where, message, section, { object: id, ver }));
      if (inv.id !== id || !isObjectId(id)) add('bad identifier', '6.3');
      if (inv.digestAlgorithm !== 'sha512') add('digest algorithm is not sha512', '7.1');
      const names = Object.keys(inv.versions);
      const versions = versionsOf(inv);
      if (names.length !== versions.length) add(`versions with names other than v1, v2, ...: ${names.filter((v) => !isVersion(v)).join(', ')}`, '7.1');
      versions.forEach((v, k) => { if (versionNumber(v) !== k + 1) add(`the versions are not v1 to v${versions.length} without gaps`, '7.1'); });
      if (!versions.length || inv.head !== versions[versions.length - 1]) add(`the head ${inv.head} is not the last version`, 'OCFL 3.5.1');
      for (const v of versions) {
        for (const digest of Object.keys(inv.versions[v]?.state || {})) {
          if (!(digest in inv.manifest)) add(`a digest of the state is not in the manifest`, 'OCFL 3.5.3', v);
        }
      }
      for (const paths of Object.values(inv.manifest)) {
        for (const cp of Array.isArray(paths) ? paths : []) {
          const problem = contentPathProblem(cp, inv.contentDirectory || 'content');
          if (problem) add(`the content path ${cp} ${problem}`, '15');
        }
      }
      return out;
    }

An object version
-----------------

Each object version is checked as opensheaf-py checks it, in three
groups.

Section 7.1: a user with a name and a message, logical paths following
the rules, and both descriptions. A version without them cannot be
checked further. The checks of the logical paths include normalisation
form C, which opensheaf-py leaves out.

    // in the rules of an object version:
    export function versionBasics(id, ver, inv) {
      const out = [];
      const where = `ocfl/${id}`;
      const add = (message, section) => out.push(finding('error', where, message, section, { object: id, ver }));
      const vinfo = inv.versions[ver] || {};
      if (!vinfo.user?.name || !vinfo.message) add('lacks a user name or a message', '7.1');
      const logical = Object.keys(filesOf(inv, ver));
      for (const p of logical) {
        const problem = logicalPathProblem(p);
        if (problem) out.push(finding('error', where, `bad logical path ${p} (it ${problem})`, '7.1, 15', { object: id, ver }));
      }
      for (const n of ['datacite.json', 'object.json']) {
        if (!logical.includes(n)) add(`has no ${n}`, '7.1');
      }
      return out;
    }

The descriptions are checked against each other and against sections 8
and 9: `object.json` against its schema; it names its object and its
archive (this archive, or, for a mirror, the archive it copies, which
every version of the mirror must name, section 14); the two files agree
on the document version and on the date of a withdrawal; `datacite.json`
has the required properties; a Creative Commons or arXiv licence is
identified by SPDX or by URL (section 8); every note with a file finds
that file in the version.

One note is added that opensheaf-py does not make: an `object.json`
using extensions (section 4) is reported, since the explorer knows none,
and section 14 asks verifiers to report the extensions they do not know.

    // in the rules of an object version:
    export function descriptionFindings({ id, ver, inv, obj, dc, archiveId, mirrorOf, schemas }) {
      const out = [];
      const where = `ocfl/${id}`;
      const context = { object: id, ver };
      const add = (message, section) => out.push(finding('error', where, message, section, context));
      const logical = Object.keys(filesOf(inv, ver));
      out.push(...schemaFindings(`${where}/${ver}/object.json`, obj, schemas['opensheaf-object/0.1'], '9, appendix D', context));
      if (obj.objectId !== id) add('object.json names another object', '9');
      else if (obj.archiveId !== (mirrorOf || archiveId)) add('object.json names another archive', mirrorOf ? '10.4, 14' : '9');
      if (String(obj.documentVersion) !== dc.version) add('datacite.json and object.json disagree on the version', '8, 9');
      if (obj.status === 'withdrawn' && dateOf(dc, 'Withdrawn') !== obj.withdrawal?.date) add('withdrawal dates disagree', '11.1');
      for (const k of ['titles', 'creators', 'publicationYear', 'types', 'version', 'publisher']) {
        if (!(k in dc)) add(`datacite.json lacks ${k}`, '8');
      }
      for (const r of Array.isArray(dc.rightsList) ? dc.rightsList : []) {
        const rights = typeof r?.rights === 'string' ? r.rights.toLowerCase() : '';
        if (r?.rightsIdentifier == null && (rights.startsWith('creative') || rights.startsWith('arxiv')) && !r?.rightsUri) {
          add('licence without SPDX identifier and without rightsUri', '8');
        }
      }
      const notes = [obj.changes, obj.sourcesMissing, obj.licence, ...(Array.isArray(obj.notices) ? obj.notices : []), obj.withdrawal?.reason];
      for (const note of notes) {
        if (note?.path && !logical.includes(note.path)) add(`note file ${note.path} not in the version`, '9');
      }
      <<the files of a document version or the member list of a collection version>>
      if (obj.extensions && typeof obj.extensions === 'object') {
        for (const name of Object.keys(obj.extensions)) {
          out.push(finding('info', where, `uses the extension ${name}, which the explorer does not know`, '4', context));
        }
      }
      return out;
    }

A document version must hold its main source and its renditions, and
cannot both name a main source and say that its sources are missing
(sections 7.2 and 9). A collection version must hold `members.json`
(section 7.4), whose checks follow.

    // in the files of a document version or the member list of a collection version:
    if (obj.kind === 'document') {
      if (obj.mainSource && !logical.includes(obj.mainSource)) add('main source not in the version', '7.2, 9');
      if (obj.sourcesMissing && obj.mainSource) add('sourcesMissing together with a main source', '9');
      for (const r of Array.isArray(obj.renditions) ? obj.renditions : []) {
        if (!logical.includes(r?.path)) add(`rendition ${r?.path} not in the version`, '7.2, 9');
      }
    } else if (!logical.includes('members.json')) {
      add('collection without members.json', '7.4');
    }

A member list
-------------

The schema already says much of this, but section 14 names these rules,
and opensheaf-py checks them by hand (its schema check is optional), with
these messages: the member list has a `type`; a member of an archive
collection has `version` and `inventorySha512` and no revisions; a member
of a selection has a non-empty list of revisions, each with its three
fields, of distinct document versions, and none of `version`,
`inventorySha512` or `follow`.

    // in the rules of a member list:
    export function memberListFindings(id, ver, mem, schemas) {
      const out = [];
      const where = `ocfl/${id}`;
      const context = { object: id, ver };
      out.push(...schemaFindings(`${where}/${ver}/members.json`, mem, schemas['opensheaf-collection/0.1'], '10.2, appendix D', context));
      const kind = mem.type;
      if (kind !== 'archive' && kind !== 'selection') {
        out.push(finding('error', where, 'members.json has no valid type (archive or selection)', '10.2', context));
      }
      for (const m of Array.isArray(mem.members) ? mem.members : []) {
        const add = (message) => out.push(finding('error', where, `member ${m?.id}: ${message}`, '10.2', context));
        if (kind === 'archive' && (!m?.version || !m?.inventorySha512 || 'revisions' in m)) {
          add('a member of an archive collection needs version and inventorySha512, and no revisions');
        }
        if (kind === 'selection') {
          const revs = m?.revisions;
          if (['version', 'inventorySha512', 'follow'].some((k) => k in m)) {
            add('a member of a selection has no version, inventorySha512 or follow');
          }
          if (!Array.isArray(revs) || !revs.length ||
              revs.some((r) => !['documentVersion', 'version', 'inventorySha512'].every((k) => r?.[k]))) {
            add('a member of a selection needs revisions, each with documentVersion, version and inventorySha512');
          } else if (new Set(revs.map((r) => r.documentVersion)).size !== revs.length) {
            add('a document version is vetted twice');
          }
        }
      }
      return out;
    }
