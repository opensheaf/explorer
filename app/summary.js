// Generated from literate/22-pieces.md by tools/tangle.py: edit the document, not this file.
import { titleOf, creatorsOf, dateOf, rolesOf } from './versions.js';

export function summary(ctx, id) {
  if (!ctx.summaries.has(id)) {
    const loading = load(ctx.archive, id, { signal: ctx.signal });
    ctx.summaries.set(id, loading);
    loading.catch(() => ctx.summaries.delete(id));
  }
  return ctx.summaries.get(id);
}

async function load(archive, id, options) {
  const { inv, objs, hist, current } = await archive.history(id, null, options);
  const head = objs.get(inv.head) || null;
  const shown = head?.kind === 'collection' ? inv.head : current;
  const { obj, dc } = await archive.descriptions(id, inv, shown, options);
  return {
    id, inv, objs, hist, current, head, shown, obj, dc,
    objOf: (v) => objs.get(v) ?? null,
    roles: rolesOf(inv, (v) => objs.get(v) ?? null),
    kind: head?.kind ?? null, status: head?.status ?? null,
    title: titleOf(dc), creators: creatorsOf(dc),
    issued: dateOf(dc, 'Issued', 'Available', 'Created'),
    documentVersion: obj?.documentVersion ?? null,
  };
}
