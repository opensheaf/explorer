// Generated from literate/20-dom.md by tools/tangle.py: edit the document, not this file.
export function h(tag, attributes = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (name === 'class') el.className = value;
    else if (name === 'href') {
      const href = safeHref(value);
      if (href) el.setAttribute('href', href);
    } else if (name.startsWith('on')) el.addEventListener(name.slice(2), value);
    else el.setAttribute(name, value === true ? '' : String(value));
  }
  append(el, ...children);
  return el;
}

export function append(el, ...children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el, ...children) {
  el.replaceChildren();
  return append(el, ...children);
}

export function safeHref(url) {
  if (typeof url !== 'string') return null;
  if (url.startsWith('#') || url.startsWith('?')) return url;
  try {
    const parsed = new URL(url, document.baseURI);
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

export function external(url, ...text) {
  const href = safeHref(url);
  if (!href) return h('span', { class: 'unsafe-link', title: 'not a web address' }, text.length ? text : String(url));
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text.length ? text : url);
}

export function doiLink(doi) {
  if (typeof doi !== 'string' || !doi) return null;
  const bare = doi.replace(/^(https?:\/\/(dx\.)?doi\.org\/|doi:)/i, '');
  return external('https://doi.org/' + encodeURI(bare), bare);
}

export function identifierLink(value, type) {
  if (type === 'DOI') return doiLink(value);
  if (type === 'arXiv') return external(`https://arxiv.org/abs/${encodeURIComponent(String(value).replace(/^arxiv:/i, ''))}`, String(value));
  if (typeof value === 'string' && /^https?:\/\//.test(value)) return external(value);
  return String(value ?? '');
}

export function bytes(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '?';
  const units = ['bytes', 'kB', 'MB', 'GB', 'TB'];
  let k = 0;
  while (n >= 1000 && k < units.length - 1) { n /= 1000; k++; }
  return k ? `${n.toFixed(n < 10 ? 1 : 0)} ${units[k]}` : `${n} bytes`;
}

export function digest(d) {
  if (typeof d !== 'string') return h('span', { class: 'digest' }, '?');
  return h('code', { class: 'digest', title: d }, d.length > 12 ? d.slice(0, 12) + '…' : d);
}

export function timestamp(t) {
  if (typeof t !== 'string') return '';
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(t);
  return m ? `${m[1]} ${m[2]} UTC` : t;
}

export function plural(n, one, many = one + 's') {
  return `${n} ${n === 1 ? one : many}`;
}
