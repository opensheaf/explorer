// Generated from literate/16-rules.md by tools/tangle.py: edit the document, not this file.
import { validate } from './schema.js';
import { isObjectId, isVersion, versionNumber, logicalPathProblem, contentPathProblem } from './paths.js';
import { versionsOf, filesOf, dateOf } from './versions.js';

export function finding(level, where, message, section, { object = null, ver = null } = {}) {
  const text = `${where}: ${ver ? ver + ' ' : ''}${message}`;
  return { level, where, object, ver, message, section, text };
}

export const LAYOUT = '0002-flat-direct-storage-layout';

export function schemaFindings(where, data, schema, section, context = {}) {
  if (!schema) return [];
  return validate(schema, data).map((e) =>
    finding('error', where, `${e.path ? e.path + ': ' : ''}${e.message}`, section, context));
}

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
  if (obj.kind === 'document') {
    if (obj.mainSource && !logical.includes(obj.mainSource)) add('main source not in the version', '7.2, 9');
    if (obj.sourcesMissing && obj.mainSource) add('sourcesMissing together with a main source', '9');
    for (const r of Array.isArray(obj.renditions) ? obj.renditions : []) {
      if (!logical.includes(r?.path)) add(`rendition ${r?.path} not in the version`, '7.2, 9');
    }
  } else if (!logical.includes('members.json')) {
    add('collection without members.json', '7.4');
  }
  if (obj.extensions && typeof obj.extensions === 'object') {
    for (const name of Object.keys(obj.extensions)) {
      out.push(finding('info', where, `uses the extension ${name}, which the explorer does not know`, '4', context));
    }
  }
  return out;
}

export function memberListFindings(id, ver, mem, schemas) {
  const out = [];
  const where = `ocfl/${id}`;
  const context = { object: id, ver };
  out.push(...schemaFindings(`${where}/${ver}/members.json`, mem, schemas['opensheaf-collection/0.1'], '10.2, appendix D', context));
  const kind = mem.type;
  if (kind !== 'catalogue' && kind !== 'selection') {
    out.push(finding('error', where, 'members.json has no valid type (archive or selection)', '10.2', context));
  }
  for (const m of Array.isArray(mem.members) ? mem.members : []) {
    const add = (message) => out.push(finding('error', where, `member ${m?.id}: ${message}`, '10.2', context));
    if (kind === 'catalogue' && (!m?.version || !m?.inventorySha512 || 'revisions' in m)) {
      add('a member of a catalogue needs version and inventorySha512, and no revisions');
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
