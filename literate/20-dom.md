Building pages from untrusted data
==================================

Everything the pages show comes from archives: titles, names, abstracts,
notes, file names, addresses. All of it is untrusted (section 15.2), and a
page that inserted it as HTML would run whatever script an archive put in
a title. The explorer never does: it builds the page element by element,
and puts remote text in with `textContent` (through text nodes), which
the browser never parses as HTML. There is no `innerHTML` anywhere in the
application. Section 15 says the same of websites: "A website MUST NOT
embed HTML of other archives in its own pages; it links to them."

Links are the other way in: an address such as `javascript:...` in a
`href` runs when clicked. Only `http:`, `https:` and `mailto:` addresses
from archives become links; anything else is shown as text.

The module is `app/dom.js`; the rendering of mathematics as plain text is
in `app/text.js`.

    // in app/dom.js:
    <<making elements>>

    <<safe links>>

    <<formatting numbers, digests and dates>>

Making elements
---------------

`h(tag, attributes, ...children)` makes an element. Attributes are set
with `setAttribute`, which never parses its value as markup; an attribute
whose name starts with `on` is an event handler and takes a function
(these names are always the explorer's own, never an archive's). Children
are elements or values, which become text nodes; `null`, `undefined` and
`false` are left out, so that optional parts can be written inline;
arrays are flattened.

    // in making elements:
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

Safe links
----------

Links of the explorer itself start with `#` (a page of the explorer) or
`?` (the explorer opened on another archive); they are allowed as they
are. Any other address is resolved and allowed only with one of the three
schemes. A link to another site opens in a new tab and tells it nothing
of the explorer (`noopener noreferrer`).

    // in safe links:
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

A DOI is a link to its resolver; an identifier of another kind is a link
when it is an address, and text otherwise.

    // in safe links:
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

Identifiers copied on a click
-----------------------------

The identifiers a reader will paste elsewhere, `sheaf:` URIs, pins and
identifiers of lines, are copied to the clipboard when clicked (or when
Enter is pressed on them): the text copied is the whole identifier, also
when the page shows a shorter name for it, and a short "copied" says it
was done. Where the browser refuses (an address that is not secure), the
identifier is selected instead, ready to be copied by hand.

    // in formatting numbers, digests and dates:
    export function copyable(text, shown = text) {
      const el = h('code', { class: 'uri copy', title: `${text} (click to copy)`, role: 'button', tabindex: '0' }, shown);
      const copy = () => {
        const done = () => { el.classList.add('copied'); setTimeout(() => el.classList.remove('copied'), 1200); };
        const select = () => { const r = document.createRange(); r.selectNodeContents(el);
                               const s = getSelection(); s.removeAllRanges(); s.addRange(r); };
        if (navigator.clipboard?.writeText) navigator.clipboard.writeText(text).then(done, select);
        else select();
      };
      el.addEventListener('click', copy);
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); copy(); } });
      return el;
    }

Numbers, digests and dates
--------------------------

Sizes are shown in decimal units, as file managers do; digests by their
first twelve characters, with the whole digest in the tooltip and
selectable; timestamps of inventories (`2026-11-13T14:49:26Z`) as a date
and a time in UTC, which is how they are recorded.

    // in formatting numbers, digests and dates:
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
