// Generated from literate/10-http.md by tools/tangle.py: edit the document, not this file.
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

export class FetchError extends Error {
  constructor(kind, url, detail, status = null) {
    super(url ? `${url}: ${detail}` : detail);
    this.kind = kind;
    this.url = url;
    this.detail = detail;
    this.status = status;
  }
}

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
}

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

export async function sha512(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new FetchError('crypto', '', 'WebCrypto is not available (it needs https: or localhost)');
  }
  const digest = new Uint8Array(await subtle.digest('SHA-512', bytes));
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('');
}
