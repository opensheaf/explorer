// Generated from literate/22-pieces.md by opensheaf-literate: edit the document, not this file.
import { titleOf, creatorsOf, dateOf, rolesOf, versionsOf, currentVersion, historyOf } from './versions.js';
import { parseId } from './names.js';

export const SUMMARIES = 500;

function kept(ctx, key, signal, load) {
  const known = ctx.summaries.get(key);
  if (known && (known.done || known.signal === signal)) {
    ctx.summaries.delete(key);
    ctx.summaries.set(key, known);
    return known.loading;
  }
  const entry = { signal, done: false };
  entry.loading = load();
  ctx.summaries.set(key, entry);
  entry.loading.then(() => { entry.done = true; }, () => {
    if (ctx.summaries.get(key) === entry) ctx.summaries.delete(key);
  });
  const limit = ctx.summaryLimit ?? SUMMARIES;
  for (const [k, e] of ctx.summaries) {
    if (ctx.summaries.size <= limit) break;
    if (e.done) ctx.summaries.delete(k);
  }
  return entry.loading;
}

export function summary(ctx, id, signal = ctx.signal) {
  return kept(ctx, id, signal, () => load(ctx.archive, id, { signal }));
}

async function load(archive, id, options) {
  const { inv, objs } = await archive.history(id, null, options);
  const head = objs.get(inv.head) || null;
  const objOf = (v) => objs.get(v) ?? null;
  let line = null;
  if (head?.kind !== 'owner' && !parseId(id)?.draft) {
    line = await archive.line(id, options).catch((error) => {
      if (error?.kind === 'aborted') throw error;
      return null;
    });
  }
  const at = line?.latest || inv.head;
  const hist = historyOf(inv, objOf, at), current = currentVersion(inv, objOf, at);
  const shown = head?.kind === 'document' ? current : at;
  const { obj, dc } = head?.kind === 'owner' ? { obj: head, dc: null } : await archive.descriptions(id, inv, shown, options);
  return {
    id, inv, objs, hist, current, head, shown, obj, dc, line, latest: line?.latest ?? null, objOf,
    roles: rolesOf(inv, objOf),
    kind: head?.kind ?? null, status: (objOf(at) || head)?.status ?? null,
    title: titleOf(dc), creators: creatorsOf(dc),
    issued: dateOf(dc, 'Issued', 'Available', 'Created'),
    documentVersion: obj?.documentVersion ?? null,
  };
}

export function rowSummary(ctx, id, signal = ctx.signal) {
  const whole = ctx.summaries.get(id);
  if (whole?.done) return summary(ctx, id, signal);
  return kept(ctx, `row ${id}`, signal, () => loadRow(ctx, id, signal));
}

async function loadRow(ctx, id, signal) {
  const archive = ctx.archive;
  const options = { signal };
  const inv = await archive.inventory(id, null, options);
  let head = null;
  if (versionsOf(inv).includes(inv.head)) {
    head = await archive.json(id, inv, inv.head, 'object.json', options).catch((error) => {
      if (error?.kind === 'aborted') throw error;
      return null;
    });
  }
  if (!Array.isArray(head?.history) || !head.history.length) return summary(ctx, id, signal);
  const current = currentVersion(inv, (v) => (v === inv.head ? head : null), inv.head);
  const shown = head.kind === 'collection' ? inv.head : current;
  const { obj, dc } = await archive.descriptions(id, inv, shown, options);
  return {
    id, inv, current, head, shown, obj, dc, row: true,
    kind: head.kind ?? null, status: head.status ?? null,
    title: titleOf(dc), creators: creatorsOf(dc),
    issued: dateOf(dc, 'Issued', 'Available', 'Created'),
    documentVersion: obj?.documentVersion ?? null,
  };
}
