// Generated from literate/70-tests.md by tools/tangle.py: edit the document, not this file.
import { readFile } from 'node:fs/promises';

export const ORIGIN = 'http://127.0.0.1:8765/';
const FIXTURES = new URL('./fixtures/', import.meta.url);

export function diskFetch({ log = [], down = [] } = {}) {
  return async (url, init = {}) => {
    log.push(url);
    if (!url.startsWith(ORIGIN) || down.some((prefix) => url.startsWith(prefix))) {
      throw new TypeError(`fetch failed: ${url}`);
    }
    const path = decodeURIComponent(new URL(url).pathname).slice(1);
    try {
      const bytes = await readFile(new URL(path, FIXTURES));
      const headers = { 'content-length': String(bytes.length) };
      return new Response(init.method === 'HEAD' ? null : bytes, { status: 200, headers });
    } catch {
      return new Response('not found', { status: 404 });
    }
  };
}

export async function readSchemas() {
  const { loadSchemas } = await import('../app/schema.js');
  return loadSchemas(async (url) => JSON.parse(await readFile(url, 'utf-8')));
}
