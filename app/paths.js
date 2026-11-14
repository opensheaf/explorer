// Generated from literate/11-paths.md by opensheaf-literate: edit the document, not this file.
import { FetchError } from './http.js';

export const ID_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const VERSION_RE = /^v[1-9][0-9]*$/;

export function isObjectId(s) {
  return typeof s === 'string' && s.length <= 64 && ID_RE.test(s);
}

export function isVersion(s) {
  return typeof s === 'string' && VERSION_RE.test(s);
}

export function versionNumber(v) {
  return Number(String(v).slice(1));
}

export function logicalPathProblem(p) {
  if (typeof p !== 'string' || p === '') return 'is empty';
  if (p.startsWith('/')) return 'begins with /';
  const parts = p.split('/');
  if (parts.includes('.') || parts.includes('..')) return 'has a . or .. segment';
  if (p.normalize('NFC') !== p) return 'is not in Unicode normalisation form C';
  return null;
}

export function unsafePath(path) {
  if (typeof path !== 'string' || path === '') return 'is empty';
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.' || segment === '..') return 'has an empty, . or .. segment';
    if (/[\u0000-\u001f\u007f\\]/.test(segment)) return 'has a control character or a backslash';
  }
  return null;
}

export function contentPathProblem(cp, contentDirectory = 'content') {
  const unsafe = unsafePath(cp);
  if (unsafe) return unsafe;
  const [ver, dir, ...rest] = cp.split('/');
  if (!isVersion(ver) || dir !== contentDirectory || rest.length === 0) {
    return `is not in the content directory of a version (vN/${contentDirectory}/...)`;
  }
  return null;
}

function encodeSegment(segment) {
  return encodeURIComponent(segment).replace(/%(3D|2C|3A|40|2B|24|26|3B)/g, (m) => decodeURIComponent(m));
}

export function under(root, segments) {
  let url = root;
  segments.forEach((segment, k) => {
    const problem = unsafePath(segment) || (segment.includes('/') ? 'has a /' : null);
    if (problem) throw new FetchError('unsafe', root, `the name ${JSON.stringify(segment)} ${problem}`);
    url += encodeSegment(segment) + (k + 1 < segments.length ? '/' : '');
  });
  if (!new URL(url).href.startsWith(new URL(root).href)) {
    throw new FetchError('unsafe', url, 'is not under the storage root');
  }
  return url;
}

export function underPath(root, path) {
  const problem = unsafePath(path);
  if (problem) throw new FetchError('unsafe', root, `the path ${JSON.stringify(path)} ${problem}`);
  return under(root, path.split('/'));
}
