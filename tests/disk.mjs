// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export const ORIGIN = 'https://fixtures.example.org/';
const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export function diskFetch({ log = [], down = [] } = {}) {
  return async (url, init = {}) => {
    log.push(url);
    if (!url.startsWith(ORIGIN) || down.some((prefix) => url.startsWith(prefix))) {
      throw new TypeError(`fetch failed: ${url}`);
    }
    const path = decodeURIComponent(new URL(url).pathname).slice(1);
    try {
      const bytes = await readFile(FIXTURES + path);
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

export async function osheaf(name) {
  return JSON.parse(await readFile(`${FIXTURES}verify/${name}.json`, 'utf-8'));
}

export async function fixture(path) {
  return JSON.parse(await readFile(FIXTURES + path, 'utf-8'));
}

export function labelled(disc, label) {
  return disc.objects.find((o) => o.label === label);
}

export const DISCOVERY = {};
for (const a of ['archive', 'other', 'forked']) DISCOVERY[a] = await fixture(`${a}/opensheaf.json`);

export function idOf(label, archive = 'archive') {
  return labelled(DISCOVERY[archive], label).id;
}

export const ALPHA = idOf('alpha'), BETA = idOf('beta'), GAMMA = idOf('gamma'), MAIN = idOf('main'), READING = idOf('reading');
export const OWNER = DISCOVERY.archive.owners[0];

export function folder(id, archive = 'archive') {
  const [, name, owner] = id.split(':');
  return `${ORIGIN}${archive}/ocfl/${owner}/${name}/`;
}
