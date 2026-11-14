Reading archives over HTTP
==========================

Everything the explorer knows about an archive it reads over HTTP, with
the `fetch` of the browser: the discovery document, the inventories, the
two descriptions of every object version, the member lists, and, when
asked, the content files. An OpenSheaf archive is a folder of static
files (section 5), so every request is a plain GET of a file, and the
explorer never writes anything anywhere.

What it reads comes from servers it does not control, and is untrusted
(section 15). This chapter is the one place where requests are made, and
so the place where the rules for them are kept: only `http:` and `https:`
addresses, never cookies, a limit on the size of every answer, time
limits on every request, and a limit on the requests in flight at once, so
that a large archive does not flood its server or the browser. When a
request fails, the error says why in terms a reader can act on: above all,
whether the browser refused to let the page read an answer that the server
did send, which is what happens when a server does not allow cross-origin
requests.

The module is `app/http.js`.

    // in app/http.js:
    <<the limits of the explorer>>

    <<what went wrong with a request>>

    <<explaining a failed request to the reader>>

    <<a pool of requests>>

    <<the watchdog of a request>>

    <<reading a body within a limit>>

    <<the HTTP client>>

    <<decoding JSON>>

    <<the SHA-512 digest of bytes>>

Limits
------

Section 15 asks verifiers to limit the size of the files they fetch, and
section 14 to limit the depth and size of the collections they follow. The
limits are gathered here, so that they are stated once. JSON files are
small: the inventory of an object with many versions and files is a few
hundred kilobytes, so sixteen megabytes leave a wide margin while still
stopping a server that answers with something absurd. Content files are
read only for the optional check of their digests; a browser holds a file
in memory to hash it (WebCrypto has no incremental hashing), so their
limit is set by what a browser can reasonably hold, and a file larger
than `large` is read alone (see below, reading a body). The answers kept
for the session (see below, the client) are bounded too.

Time is limited in two ways: a server must start answering (send the
headers) within `timeout`, and, once it has, must not stay silent for
more than `stall` between two pieces of the body. A single limit on the
whole request would fail the download of a large file from a slow but
steady server, which is a valid archive.

A hostile archive can make the work huge without making any file large:
a collection with thousands of members, each with dozens of mirrors, an
object with thousands of versions, a discovery document listing a
hundred thousand objects. Section 15 asks verifiers to limit what they
follow, so each of these is bounded as well, and the pages and the
verification say when a limit stopped them.

    // in the limits of the explorer:
    export const LIMITS = {
      json: 16 * 2 ** 20,      // a JSON file: discovery document, inventory, object.json, members.json
      page: 16 * 2 ** 20,      // the index page, read for the check of the presentation
      file: 512 * 2 ** 20,     // a content file whose digest is checked
      large: 32 * 2 ** 20,     // a body larger than this is read alone, one at a time
      cache: 64 * 2 ** 20,     // bytes of answers kept by one client
      timeout: 60_000,         // milliseconds to wait for the headers of an answer
      stall: 30_000,           // milliseconds to wait for the next piece of a body
      concurrency: 6,          // requests in flight at once
      depth: 3,                // levels of member collections followed
      pins: 2000,              // pins resolved in one walk through collections, or in one verification
      mirrors: 5,              // mirrors tried for one pin, after the member's archive
      versions: 10_000,        // object versions of one object
      objects: 10_000,         // objects of one archive listed or verified
    };

Errors
------

A failed request is a `FetchError` with a *kind*, which the pages use to
explain the failure, and the address it concerns. The kinds are:

- `scheme`: not an `http:` or `https:` address (a `file:` address, which a
  collection made from a local folder may record, cannot be read by a web
  page);
- `unsafe`: an address that would be built from an identifier or a path
  breaking the rules of sections 6.3 and 7.1, refused before any request
  (see [untrusted names](11-paths.md));
- `not-found` and `http`: the server answered with an error status;
- `cors`: the server answered, but the browser did not let the page read
  the answer;
- `mixed`: an `http:` address read from an `https:` page, which browsers
  block;
- `network`: no answer at all;
- `timeout`, `too-large`, `json` (not UTF-8 JSON), `digest` (an inventory
  that does not match its checksum file), `crypto` (no WebCrypto) and
  `aborted` (cancelled by the reader).

    // in what went wrong with a request:
    export class FetchError extends Error {
      constructor(kind, url, detail, status = null) {
        super(url ? `${url}: ${detail}` : detail);
        this.kind = kind;
        this.url = url;
        this.detail = detail;
        this.status = status;
      }
    }

Cross-origin requests deserve an explanation, since they are the usual
reason why an archive that opens in a browser tab cannot be explored: a
page served from one site (here `opensheaf.org`) may read files of another
site only if that site says so, with the header
`Access-Control-Allow-Origin`. Section 5 asks archives to send it
(`Access-Control-Allow-Origin: *`) precisely so that tools running in a
browser can read them; GitHub Pages sends it for every file. When it is
missing, the remedies are on the side of the archive: send the header, or
serve a copy of the explorer from the archive's own site, where every
request is same-origin (see [the application](30-app.md)).

    // in explaining a failed request to the reader:
    export function explain(error) {
      switch (error?.kind) {
        case 'cors':
          return 'The server answered, but without the header Access-Control-Allow-Origin, so the ' +
            'browser does not let this page read the answer. OpenSheaf archives should allow ' +
            'cross-origin requests (section 5 of the specification); GitHub Pages does. Otherwise, ' +
            'copy the explorer into the archive’s own site (for instance as explorer/ next to ' +
            'opensheaf.json): served from there, it reads the archive without cross-origin requests.';
        case 'mixed':
          return 'This page was loaded over https:, and browsers do not let it read http: addresses. ' +
            'Serve the archive over https:, or open a copy of the explorer served over http:.';
        case 'scheme':
          return 'Only http: and https: addresses can be read by a web page. A collection made from ' +
            'a folder on disk records file: addresses, which only tools on that computer can read.';
        case 'network':
          return 'No answer: the address may be wrong, the server down, or the network unavailable. ' +
            'Some browsers also report a refused cross-origin request this way.';
        case 'not-found':
          return 'The server has no such file. Check the address: it should be the base URL of ' +
            'the archive, the folder holding opensheaf.json.';
        case 'timeout':
          return 'The server did not answer in time, or stopped sending.';
        case 'too-large':
          return 'The answer is larger than the explorer accepts (section 15 asks verifiers to ' +
            'limit the size of what they fetch).';
        case 'crypto':
          return 'Digests are computed with the WebCrypto of the browser, which is only available ' +
            'to pages served over https: or from localhost.';
        case 'unsafe':
          return 'The archive names a file with an identifier or a path that breaks the rules of ' +
            'sections 6.3 and 7.1; the explorer does not fetch it (section 15).';
        default:
          return '';
      }
    }

A pool of requests
------------------

Requests go through a pool that lets a few run at once and queues the
others. Without it, verifying an archive of a hundred documents would
start a thousand requests at once. A place in the pool is *acquired* and
then *released*; a request waiting for its place gives up the wait as
soon as its reader cancels, so that the queue of a page the reader has
left empties at once instead of running request after request only to
abort each. `run(task)` runs a task in a place, for those who need no
more.

    // in a pool of requests:
    export function pool(size) {
      let active = 0;
      const waiting = [];
      const next = () => {
        while (active < size && waiting.length) {
          active++;
          waiting.shift()();
        }
      };
      function acquire(signal) {
        return new Promise((resolve, reject) => {
          if (signal?.aborted) return reject(new FetchError('aborted', '', 'cancelled'));
          let released = false;
          const release = () => {
            if (released) return;
            released = true;
            active--;
            next();
          };
          const grant = () => {
            signal?.removeEventListener('abort', give);
            resolve(release);
          };
          const give = () => {
            const k = waiting.indexOf(grant);
            if (k >= 0) {
              waiting.splice(k, 1);
              reject(new FetchError('aborted', '', 'cancelled'));
            }
          };
          signal?.addEventListener('abort', give, { once: true });
          waiting.push(grant);
          next();
        });
      }
      async function run(task, signal) {
        const release = await acquire(signal);
        try {
          return await task();
        } finally {
          release();
        }
      }
      run.acquire = acquire;
      return run;
    }

A pause between two tries of a request (below) ends early, with an
error, when the reader cancels.

    // in a pool of requests:
    function pause(ms, signal) {
      return new Promise((resolve, reject) => {
        const stop = () => {
          clearTimeout(timer);
          reject(new FetchError('aborted', '', 'cancelled'));
        };
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', stop);
          resolve();
        }, ms);
        if (signal?.aborted) stop();
        else signal?.addEventListener('abort', stop, { once: true });
      });
    }

Time limits
-----------

Each try of a request is watched by a *watchdog*: a controller that
aborts the request when its timer runs out. It is armed first for the
headers (`timeout`), then for each piece of the body (`stall`), and
remembers which limit ran out, so that the error can say so. It can be
stopped, and re-armed with the same limit.

    // in the watchdog of a request:
    function watchdog() {
      const controller = new AbortController();
      let timer = null, ms = 0;
      return {
        signal: controller.signal,
        fired: null,
        why: '',
        arm(limit, why) {
          ms = limit;
          this.why = why;
          this.rearm();
        },
        rearm() {
          clearTimeout(timer);
          timer = setTimeout(() => { this.fired = this.why; controller.abort(); }, ms);
        },
        stop() {
          clearTimeout(timer);
        },
      };
    }

    const BUSY = Symbol('busy');

Reading a body within a limit
-----------------------------

The size a server declares (`Content-Length`) is checked first, and the
body is then read piece by piece, stopping as soon as the limit is passed:
a server may declare nothing, or declare the size of a compressed body
smaller than what it decompresses to.

Memory is spent with care, since a content file may be hundreds of
megabytes: when the size is declared, the bytes are read into one buffer
of that size, allocated once (keeping the pieces and copying them at the
end would hold the file twice); when it is not declared, or is wrong, the
buffer grows by doubling. A body that passes `LIMITS.large` waits, before
going further, until no other large body is being read by the client:
the digests of large files are thus checked one at a time, whatever the
number of requests in flight (six files of 512 MB at once would be three
gigabytes). The hash of one large file may still overlap the download of
the next. While a body waits for its turn, its watchdog is stopped.

The watchdog is re-armed by every piece that arrives, so that the time
limit is on silence, not on the length of the download.

    // in reading a body within a limit:
    function tooLarge(url, limit, declared = null) {
      return new FetchError('too-large', url, declared === null ? `more than ${limit} bytes`
        : `${declared} bytes, more than the limit of ${limit}`);
    }

    async function readLimited(response, url, limit, { dog, large, signal } = {}) {
      const declared = Number(response.headers.get('content-length'));
      if (declared > limit) {
        response.body?.cancel().catch(() => {});
        throw tooLarge(url, limit, declared);
      }
      if (!response.body?.getReader) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length > limit) throw tooLarge(url, limit);
        return bytes;
      }
      const reader = response.body.getReader();
      let buffer = new Uint8Array(declared > 0 ? declared : Math.min(limit, 65536));
      let size = 0, release = null;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const end = size + value.length;
          if (end > limit) throw tooLarge(url, limit);
          if (!release && large && end > LIMITS.large) {
            dog?.stop();
            release = await large.acquire(signal);
            dog?.rearm();
          }
          if (end > buffer.length) {
            const grown = new Uint8Array(Math.min(limit, Math.max(2 * buffer.length, end)));
            grown.set(buffer.subarray(0, size));
            buffer = grown;
          }
          buffer.set(value, size);
          size = end;
          dog?.rearm();
        }
      } catch (error) {
        reader.cancel().catch(() => {});
        throw error;
      } finally {
        release?.();
      }
      return size === buffer.length ? buffer : buffer.slice(0, size);
    }

The client
----------

An `Http` client makes the requests. Its `fetch` can be replaced, which is
how the [tests](70-tests.md) read archives from the disk; by default it is
the browser's. Every request is checked for its scheme, carries no
credentials (an archive has no business with the reader's cookies), runs
in the pool, and is aborted when the reader cancels or a time limit
passes. The client counts the requests it makes and the bytes it reads.
A verification makes a client of its own (see
[the verification](17-verify.md)), so that its report gives the requests
and bytes of that run alone, and reads the archive afresh; two clients may
share one pool (`run`), so that together they stay within the limit of
requests in flight.

    // in the HTTP client:
    export class Http {
      constructor({ fetch = globalThis.fetch?.bind(globalThis), concurrency = LIMITS.concurrency,
                    timeout = LIMITS.timeout, stall = LIMITS.stall, cacheLimit = LIMITS.cache,
                    run = pool(concurrency) } = {}) {
        this.fetchImpl = fetch;
        this.run = run;
        this.large = pool(1);
        this.timeout = timeout;
        this.stall = stall;
        this.cache = new Map();
        this.cacheLimit = cacheLimit;
        this.cacheBytes = 0;
        this.requests = 0;
        this.bytesRead = 0;
      }

      <<check the scheme of an address>>

      <<make one request>>

      <<find why a request failed>>

      <<requests whose answers are kept>>
    }

Only `http:` and `https:` addresses are read; anything else (`file:`,
`data:`, `javascript:`) is refused before a request is made.

    // in check the scheme of an address:
    checkUrl(url) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        throw new FetchError('scheme', String(url), 'not an absolute URL');
      }
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        throw new FetchError('scheme', parsed.href, `${parsed.protocol} addresses cannot be read by a web page`);
      }
      return parsed.href;
    }

A request returns the bytes of the answer, or, for `HEAD`, the response
itself, whose headers give the size of a file. A status other than 2xx is
an error; 404 and 410 are told apart, since "not found" is what a reader
most often needs to see.

Some statuses say that the server is busy rather than that the file is
missing: 429 (too many requests) and 5xx. Static hosts answer so now and
then under the load of a verification that reads a whole archive (GitHub
Pages answered one 503 in a thousand requests while this was written), so
such a request is tried again, twice, after a pause of one and then three
seconds, before it counts as failed. The body of the busy answer is
cancelled at once, and the pause is made *outside* the pool: a request
waiting to be tried again does not hold a place that another could use,
and a cancelled one stops waiting at once.

    // in make one request:
    async request(url, { method = 'GET', limit = LIMITS.json, signal } = {}) {
      url = this.checkUrl(url);
      const cancelled = () => new FetchError('aborted', url, 'cancelled');
      for (const wait of [1000, 3000, null]) {
        const release = await this.run.acquire(signal).catch(() => { throw cancelled(); });
        let answer;
        try {
          answer = await this.attempt(url, method, limit, signal, wait !== null);
        } finally {
          release();
        }
        if (answer !== BUSY) return answer;
        await pause(wait, signal).catch(() => { throw cancelled(); });
      }
    }

One try, in its place in the pool, under its watchdog:

    // in make one request:
    async attempt(url, method, limit, signal, canRetry) {
      const dog = watchdog();
      const both = signal ? AbortSignal.any([signal, dog.signal]) : dog.signal;
      this.requests++;
      dog.arm(this.timeout, `no answer in ${this.timeout / 1000} s`);
      try {
        let response;
        try {
          response = await this.fetchImpl(url, { method, signal: both, credentials: 'omit', redirect: 'follow' });
        } catch (error) {
          throw await this.diagnose(url, error, signal, dog);
        }
        if (canRetry && (response.status === 429 || response.status >= 500)) {
          response.body?.cancel().catch(() => {});
          return BUSY;
        }
        if (!response.ok) {
          response.body?.cancel().catch(() => {});
          const missing = response.status === 404 || response.status === 410;
          throw new FetchError(missing ? 'not-found' : 'http', url, `HTTP ${response.status}`, response.status);
        }
        if (method === 'HEAD') return response;
        dog.arm(this.stall, `the answer stalled: nothing received for ${this.stall / 1000} s`);
        try {
          const bytes = await readLimited(response, url, limit, { dog, large: this.large, signal });
          this.bytesRead += bytes.length;
          return bytes;
        } catch (error) {
          if (error instanceof FetchError && error.kind !== 'aborted') throw error;
          throw await this.diagnose(url, error, signal, dog);
        }
      } finally {
        dog.stop();
      }
    }

When `fetch` fails without an answer, the browser does not say why: a
refused cross-origin request and an unreachable server look the same to
the page, on purpose. A second request in `no-cors` mode tells them apart:
it is allowed to reach any server, and returns an opaque answer that the
page cannot read but that proves the server is there. If it succeeds, the
first failure was a cross-origin refusal. Outside a browser (in the tests)
there is no such thing, and the failure is a network error. A request
stopped by its watchdog is a `timeout`, which says which limit ran out.

    // in find why a request failed:
    async diagnose(url, error, signal, dog) {
      if (signal?.aborted) return new FetchError('aborted', url, 'cancelled');
      if (dog.fired) return new FetchError('timeout', url, dog.fired);
      const page = globalThis.location;
      if (page?.protocol === 'https:' && url.startsWith('http:') && !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url)) {
        return new FetchError('mixed', url, 'an http: address cannot be read from an https: page');
      }
      if (typeof document !== 'undefined') {
        try {
          await this.fetchImpl(url, { method: 'HEAD', mode: 'no-cors', credentials: 'omit',
                                      signal: AbortSignal.timeout(this.timeout) });
          return new FetchError('cors', url, 'the server does not allow other sites to read it ' +
                                '(no Access-Control-Allow-Origin header)');
        } catch {
          // no answer at all: a network error
        }
      }
      return new FetchError('network', url, `cannot be reached (${error?.message || error})`);
    }

The answers of most requests are kept: inventories and the files of
object versions never change (that is the point of OCFL), so reading them
twice would be waste, and the discovery document changes rarely enough.
Content files are not kept: they may be large, and are read once.

A kept answer is shared by everyone who asks for it while it is being
read, and their requests must not depend on one another. So the request
is made with a signal of its own, not with the signal of the first
caller; each caller waits with its own signal, and leaves when it is
aborted; only when every caller has left is the request aborted, and
forgotten at once, so that the next caller (the page the reader goes to,
which starts while the old one is being aborted) makes a new one instead
of receiving a request already cancelled. A failed request is forgotten
too, so that it can be tried again.

    // in requests whose answers are kept:
    cached(url, options = {}) {
      url = this.checkUrl(url);
      const { signal, ...rest } = options;
      let entry = this.cache.get(url);
      if (entry) {
        this.cache.delete(url);
        this.cache.set(url, entry);
      } else {
        const controller = new AbortController();
        entry = { controller, waiters: 0, settled: false, size: 0 };
        entry.answer = this.request(url, { ...rest, signal: controller.signal });
        this.cache.set(url, entry);
        entry.answer.then((bytes) => {
          entry.settled = true;
          if (this.cache.get(url) !== entry) return;
          entry.size = bytes.length;
          this.cacheBytes += entry.size;
          this.evict();
        }, () => {
          entry.settled = true;
          this.forget(url, entry);
        });
      }
      return this.share(url, entry, signal);
    }

    share(url, entry, signal) {
      if (signal?.aborted) return Promise.reject(new FetchError('aborted', url, 'cancelled'));
      entry.waiters++;
      return new Promise((resolve, reject) => {
        let left = false;
        const leave = () => {
          if (left) return false;
          left = true;
          signal?.removeEventListener('abort', give);
          if (--entry.waiters === 0 && !entry.settled) {
            entry.controller.abort();
            this.forget(url, entry);
          }
          return true;
        };
        const give = () => { if (leave()) reject(new FetchError('aborted', url, 'cancelled')); };
        signal?.addEventListener('abort', give, { once: true });
        entry.answer.then((bytes) => { if (leave()) resolve(bytes); },
                          (error) => { if (leave()) reject(error); });
      });
    }

The answers kept are bounded by `LIMITS.cache` bytes: when they pass it,
the answers used least recently are forgotten (a `Map` keeps the order in
which its entries were set, and an entry is set again whenever it is
used), and are read again if needed.

    // in requests whose answers are kept:
    forget(url, entry) {
      if (this.cache.get(url) !== entry) return;
      this.cache.delete(url);
      this.cacheBytes -= entry.size;
    }

    evict() {
      for (const [url, entry] of this.cache) {
        if (this.cacheBytes <= this.cacheLimit) break;
        if (entry.settled) this.forget(url, entry);
      }
    }

JSON is parsed from the kept bytes; the index page and the size of a file
are not kept. The size, for the estimate shown before the digests are
checked, comes from a `HEAD` request; it is what the server declares,
which for a compressed answer is the compressed size.

    // in requests whose answers are kept:
    async json(url, options = {}) {
      return parseJson(await this.cached(url, options), url);
    }

    async text(url, options = {}) {
      const bytes = await this.request(url, { limit: LIMITS.page, ...options });
      return new TextDecoder('utf-8').decode(bytes);
    }

    async size(url, options = {}) {
      const response = await this.request(url, { ...options, method: 'HEAD' });
      const length = response.headers.get('content-length');
      return length === null ? null : Number(length);
    }

JSON, as section 2 defines it, is UTF-8 without a byte order mark. Bytes
that are not UTF-8, or start with a byte order mark, or do not parse, are
an error of kind `json`.

    // in decoding JSON:
    export function parseJson(bytes, url = '') {
      let text;
      try {
        text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      } catch {
        throw new FetchError('json', url, 'is not UTF-8 (section 2)');
      }
      if (text.charCodeAt(0) === 0xfeff) throw new FetchError('json', url, 'starts with a byte order mark (section 2)');
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new FetchError('json', url, `is not JSON (${error.message})`);
      }
    }

Digests
-------

Integrity rests on SHA-512 digests (section 13.1): of every file, in the
inventories, and of every inventory, in its checksum file and in the pins
of collections. The browser computes them with WebCrypto, which needs no
library, and is available to pages served over `https:` or from
`localhost`. Digests are written in lowercase hexadecimal (section 6.1).

    // in the SHA-512 digest of bytes:
    export async function sha512(bytes) {
      const subtle = globalThis.crypto?.subtle;
      if (!subtle) {
        throw new FetchError('crypto', '', 'WebCrypto is not available (it needs https: or localhost)');
      }
      const digest = new Uint8Array(await subtle.digest('SHA-512', bytes));
      return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
    }
