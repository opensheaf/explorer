#!/usr/bin/env node
// Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
import { readFile } from 'node:fs/promises';
import { Http, explain } from '../app/http.js';
import { Archive } from '../app/archive.js';
import { verify } from '../app/verify.js';
import { loadSchemas } from '../app/schema.js';

const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--'));
if (!url) {
  console.error('usage: node tests/verify-url.mjs ARCHIVE-URL [--digests] [--no-remote] [--all]');
  process.exit(2);
}
const schemas = await loadSchemas(async (u) => JSON.parse(await readFile(u, 'utf-8')));
const http = new Http();
const archive = await Archive.open(http, url);
const report = await verify(archive, {
  schemas, remote: !args.includes('--no-remote'), digests: args.includes('--digests'),
  progress: ({ phase, done, total }) => process.stderr.write(`\r${phase} ${done}/${total}    `),
});
process.stderr.write('\n');
for (const f of report.findings) {
  if (f.level === 'error') console.log(f.text);
  else if (args.includes('--all')) console.log(`(${f.level}) ${f.text}`);
  if (f.errors && args.includes('--all')) for (const e of f.errors) console.log(`    ${explain(e)}`);
}
const n = report.counts().error;
console.log(n ? `${n} problem(s)` : 'OK');
console.error(`${report.stats.objects} objects, ${report.stats.versions} object versions, ` +
              `${report.stats.pins} pins, ${report.stats.files} files; ${report.requests} requests, ` +
              `${report.bytesRead} bytes`);
process.exit(n ? 1 : 0);
