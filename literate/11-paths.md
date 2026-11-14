Untrusted names
===============

An archive names its files by identifiers and paths that the explorer
puts into addresses: the object identifier and the object version give
the folder of a version (`<storageRoot><id>/<version>/`, sections 5 and
6.4), and the content paths of an inventory give the files. These names
come from the archive, or from another archive through a collection, and
are untrusted (section 15). A name like `../../elsewhere` would make the
explorer read outside the storage root, and a name with `?` or `#` would
change the meaning of the address. So every name is checked before it
becomes part of an address, and an address is built only by appending
checked, percent-encoded segments to the storage root, which keeps it
under the root by construction.

The module is `app/paths.js`. It also holds the rules of section 7.1 on
logical paths, which the verification reports.

    // in app/paths.js:
    import { FetchError } from './http.js';

    <<identifiers and version names>>

    <<the rules of logical paths>>

    <<segments that are safe in an address>>

    <<an address under a root>>

Identifiers and version names
-----------------------------

An object identifier matches `^[a-z0-9]+(-[a-z0-9]+)*$` and has at most 64
characters (section 6.3); an object version is `v` followed by a number
without leading zeros (section 7.1 forbids zero-padding). Neither can
contain anything that is special in an address. Versions are compared by
their numbers, never as strings, for which `v10` would come before `v9`.

    // in identifiers and version names:
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

Logical paths
-------------

Section 7.1: logical paths are in Unicode normalisation form C, do not
begin with `/`, and have no `.` or `..` segments; section 15 asks
verifiers to reject the others. `osheaf verify` checks the first two
rules and leaves out the third (its chapter says so); the explorer checks
all three. The answer is the reason a path is rejected, or `null`.

    // in the rules of logical paths:
    export function logicalPathProblem(p) {
      if (typeof p !== 'string' || p === '') return 'is empty';
      if (p.startsWith('/')) return 'begins with /';
      const parts = p.split('/');
      if (parts.includes('.') || parts.includes('..')) return 'has a . or .. segment';
      if (p.normalize('NFC') !== p) return 'is not in Unicode normalisation form C';
      return null;
    }

Safe segments
-------------

What goes into an address must be stricter than the rules of section 7.1,
since an address has its own syntax: no empty segment (`a//b`), no `.` or
`..`, no backslash (which some servers read as a slash) and no control
character. Everything else is allowed, and percent-encoded when the
address is built, so that a file called `notes #2.pdf` is fetched as such.
A content path of an inventory must moreover be inside a version folder of
the object (`v3/content/...`), which is where OCFL puts content (OCFL
1.1, section 3.3); one that is not is reported by the verification, and
not fetched.

    // in segments that are safe in an address:
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

An address under a root
-----------------------

A segment is percent-encoded except for the characters that RFC 3986
allows as they are in a segment of a path (`=`, `,`, `:`, `@`, `+`, `$`,
`&`, `;`, besides letters, digits and `-._~!*'()`): OCFL names its
declaration files `0=ocfl_1.1` and `0=ocfl_object_1.1`, and an address
should name a file as the archive does.

    // in an address under a root:
    function encodeSegment(segment) {
      return encodeURIComponent(segment).replace(/%(3D|2C|3A|40|2B|24|26|3B)/g, (m) => decodeURIComponent(m));
    }

An address is the root (a storage root, always ending with `/`) followed
by segments, each checked and percent-encoded. The result is checked
once more against the root, so that no future change of this function can
make it leave the root silently.

    // in an address under a root:
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
