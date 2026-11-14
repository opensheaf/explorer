// Generated from literate/22-pieces.md by tools/tangle.py: edit the document, not this file.
import { h, external } from './dom.js';
import { rich } from './text.js';
import { explain } from './http.js';

export const SPECIFICATION = 'https://opensheaf.org/opensheaf-specification-0.1.html';

export const pages = {
  archive: () => '#/',
  object: (id, ver) => `#/object/${encodeURIComponent(id)}${ver ? '/' + encodeURIComponent(ver) : ''}`,
  collection: (id, ver) => `#/collection/${encodeURIComponent(id)}${ver ? '/' + encodeURIComponent(ver) : ''}`,
  verify: () => '#/verify',
};

export function elsewhere(url, hash = '') {
  return `?url=${encodeURIComponent(url)}${hash}`;
}

export function sectionRef(section) {
  return h('a', { class: 'section-ref', href: SPECIFICATION, target: '_blank', rel: 'noopener',
                  title: `section ${section} of the specification` }, `§ ${section}`);
}

export function facts(rows) {
  const shown = rows.filter((r) => r && r[1] !== null && r[1] !== undefined && r[1] !== '' &&
                                   !(Array.isArray(r[1]) && r[1].length === 0));
  return h('dl', { class: 'facts' }, shown.map(([label, value]) => [h('dt', {}, label), h('dd', {}, value)]));
}

export function chip(text, tone = '') {
  return h('span', { class: `chip ${tone}` }, text);
}

export function statusChip(status) {
  if (status === 'withdrawn') return chip('withdrawn', 'bad');
  if (status === 'active') return chip('active', 'ok');
  return status ? chip(String(status), 'warn') : null;
}

export function section(title, ...content) {
  return h('section', { class: 'block' }, h('h2', {}, title), ...content);
}

export function noteView(note, fileUrl) {
  if (!note || typeof note !== 'object') return null;
  const file = typeof note.path === 'string' ? fileUrl?.(note.path) : null;
  return h('span', { class: 'note' }, rich(note.text),
    note.path ? [note.text ? ' ' : '', file ? external(file, `[${note.path}]`) : `[${note.path}]`] : null);
}

export function jsonView(label, value, url = null) {
  return h('details', { class: 'json' },
    h('summary', {}, label, url ? [' ', h('span', { class: 'muted' }, '(', external(url, 'raw'), ')')] : null),
    h('pre', {}, JSON.stringify(value, null, 2)));
}

export function errorBox(what, error) {
  const why = explain(error);
  return h('div', { class: 'error-box', role: 'alert' },
    h('p', {}, h('strong', {}, what), ' ', error?.detail || error?.message || String(error)),
    error?.url ? h('p', { class: 'muted url' }, error.url) : null,
    why ? h('p', {}, why) : null);
}

export function loading(text = 'Loading…') {
  return h('p', { class: 'loading' }, text);
}
