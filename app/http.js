// Generated from literate/10-http.md by tools/tangle.py: edit the document, not this file.
export const LIMITS = {
  json: 16 * 2 ** 20,      // a JSON file: discovery document, inventory, object.json, members.json
  page: 16 * 2 ** 20,      // the index page, read for the check of the presentation
  file: 512 * 2 ** 20,     // a content file whose digest is checked
  timeout: 60_000,         // milliseconds for one request
  concurrency: 6,          // requests in flight at once
  depth: 3,                // levels of member collections followed
  members: 2000,           // members resolved in one walk through collections
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
      return 'The server did not answer in time.';
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
    if (active < size && waiting.length) {
      active++;
      waiting.shift()();
    }
  };
  return async function run(task) {
    await new Promise((resolve) => { waiting.push(resolve); next(); });
    try {
      return await task();
    } finally {
      active--;
      next();
    }
  };
}

async function readLimited(response, url, limit) {
  const declared = Number(response.headers.get('content-length'));
  if (declared > limit) {
    throw new FetchError('too-large', url, `${declared} bytes, more than the limit of ${limit}`);
  }
  if (!response.body?.getReader) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > limit) throw new FetchError('too-large', url, `more than ${limit} bytes`);
    return bytes;
  }
  const reader = response.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      reader.cancel().catch(() => {});
      throw new FetchError('too-large', url, `more than ${limit} bytes`);
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
}

export class Http {
  constructor({ fetch = globalThis.fetch?.bind(globalThis), concurrency = LIMITS.concurrency,
                timeout = LIMITS.timeout } = {}) {
    this.fetchImpl = fetch;
    this.run = pool(concurrency);
    this.timeout = timeout;
    this.cache = new Map();
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
    return this.run(async () => {
      let response, timer;
      for (const pause of [1000, 3000, null]) {
        if (signal?.aborted) throw new FetchError('aborted', url, 'cancelled');
        timer = AbortSignal.timeout(this.timeout);
        const both = signal ? AbortSignal.any([signal, timer]) : timer;
        this.requests++;
        try {
          response = await this.fetchImpl(url, { method, signal: both, credentials: 'omit', redirect: 'follow' });
        } catch (error) {
          throw await this.diagnose(url, error, signal, timer);
        }
        if (pause === null || !(response.status === 429 || response.status >= 500)) break;
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
      if (!response.ok) {
        const missing = response.status === 404 || response.status === 410;
        throw new FetchError(missing ? 'not-found' : 'http', url, `HTTP ${response.status}`, response.status);
      }
      if (method === 'HEAD') return response;
      try {
        const bytes = await readLimited(response, url, limit);
        this.bytesRead += bytes.length;
        return bytes;
      } catch (error) {
        if (error instanceof FetchError) throw error;
        throw await this.diagnose(url, error, signal, timer);
      }
    });
  }

  async diagnose(url, error, signal, timer) {
    if (signal?.aborted) return new FetchError('aborted', url, 'cancelled');
    if (timer.aborted) return new FetchError('timeout', url, `no answer in ${this.timeout / 1000} s`);
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
    let answer = this.cache.get(url);
    if (!answer) {
      answer = this.request(url, options);
      this.cache.set(url, answer);
      answer.catch(() => this.cache.delete(url));
    }
    return answer;
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
