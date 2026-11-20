// Generated from literate/27-owner-page.md by opensheaf-literate: edit the document, not this file.
import { h, append, digest, timestamp, plural, copyable, external } from './dom.js';
import { facts, chip, verdictChip, section, jsonView, errorBox, loading, pages, ref } from './ui.js';
import { objectId, OWNER_NAME } from './names.js';
import { describeVersion, jsonOrNull } from './owners.js';
import { checkKeeper, CONFIRMED, CLAIMED } from './keepers.js';

export async function showOwner(ctx, root, owner) {
  const a = ctx.archive;
  const options = { signal: ctx.signal };
  const wait = root.appendChild(loading());
  let log, checked;
  try {
    if (!OWNER_NAME.test(owner)) throw new Error(`${owner} is not an owner name (section 5.2)`);
    log = await a.keyLog(owner, options);
    if (log) checked = await log.check();
  } catch (error) {
    if (!options.signal?.aborted) wait.replaceWith(errorBox(`The key log of ${owner} cannot be read.`, error));
    return;
  }
  if (options.signal?.aborted) return;
  wait.remove();
  const id = objectId(owner, owner);
  const lines = a.objects().filter((o) => o.owner === owner && o.id !== id);
  if (!log) {
    append(root, header(a, owner), h('p', { class: 'alert warn' }, 'This archive does not hold the key log of this owner (section 6.5).'),
      ownedLines(a, lines));
    return;
  }
  const genesis = jsonOrNull(log.genesis) || {};
  const latest = log.latest();
  append(root,
    header(a, owner, log),
    state(log),
    facts([
      ['Owner name', h('code', {}, owner)],
      ['Key log', [copyable(`sheaf:${owner}`), ' ', h('span', { class: 'muted' }, `(${plural(log.versions.length, 'version')} held)`)]],
      ['Created', String(genesis.created ?? '?')],
      ['Keeper', Array.isArray(genesis.keeper) ? genesis.keeper.map((k) => keeper(ctx, String(k), owner, log)) : null],
      ['Current keys', latest ? latest.keys.keys.map((k) => h('div', {}, h('code', {}, String(k)))) : null],
      ['Threshold', latest ? `${latest.keys.threshold} of ${latest.keys.keys.length} current keys sign a version of a line` : null],
      ['Rotation keys', latest ? `${latest.keys.nextThreshold} of ${latest.keys.next.length} sign the next version of the key log` : null],
      ['Exposed keys', [...log.exposedKeys()].sort().map((k) => h('div', {}, h('code', {}, k)))],
      ['Extensions', log.extensions() ? Object.keys(log.extensions()).join(', ') : null],
    ]),
    versions(log),
    checked.errors.length || checked.warnings.length ? section('Problems',
      h('ul', { class: 'findings' }, [...checked.errors.map((e) => h('li', { class: 'error' }, chip('error', 'bad'), ' ', e)),
        ...checked.warnings.map((w) => h('li', { class: 'warning' }, chip('warning', 'warn'), ' ', w))])) : null,
    ownedLines(a, lines),
    section('The files as recorded', jsonView('genesis.json', genesis)));
}

function header(a, owner, log = null) {
  return h('header', { class: 'page-head' },
    h('p', { class: 'kicker' }, 'Owner · ', h('a', { href: pages.archive() }, a.name)),
    h('h1', {}, 'Owner ', h('code', {}, owner.slice(0, 16) + '…')),
    h('p', { class: 'chips' }, log?.forkPoint ? chip(`ended by a fork at v${log.forkPoint}`, 'bad')
      : log?.ended ? chip('ended', 'warn') : log ? chip('active', 'ok') : null));
}

function state(log) {
  const parts = [];
  if (log.forkPoint) {
    parts.push(h('div', { class: 'alert bad' }, `The key log of this owner forks at version ${log.forkPoint}: two versions of that number `,
      'are signed by its rotation keys. The owner has ended, and is frozen: what is signed against a version of its key log ',
      'from the fork point on, of either side, is contested (sections 6.3 and 7.3).'));
  } else if (log.ended) {
    parts.push(h('div', { class: 'alert warn' }, 'This owner has ended: it signs nothing more. What it signed before stays good ',
      '(section 6.3).', log.successor ? [' It names a successor, ', h('code', {}, log.successor),
        ', which readers never follow by themselves (section 6.6).'] : ''));
  }
  if (log.exposedKeys().size) {
    parts.push(h('div', { class: 'alert warn' }, `This owner has exposed ${plural(log.exposedKeys().size, 'key')}: `,
      'versions of its lines that need them are contested, unless signed again (section 7.3).'));
  }
  parts.push(h('p', { class: 'muted small' }, 'The key log as this archive holds it. A copy that stops early looks complete: ',
    'another archive may hold a longer one (section 6.5).'));
  return parts;
}

function versions(log) {
  return section('The key log',
    h('div', { class: 'table-wrap' }, h('table', { class: 'object-versions' },
      h('thead', {}, h('tr', {}, ['Version', 'Inventory', 'What it did', 'Deposited', 'Status'].map((t) => h('th', {}, t)))),
      h('tbody', {}, [...log.versions].reverse().map((v) => {
        const inv = jsonOrNull(v.inventory) || {};
        const info = inv.versions?.[`v${v.number}`] || {};
        return h('tr', {},
          h('td', {}, `v${v.number}`), h('td', {}, digest(v.digest)), h('td', {}, describeVersion(v)),
          h('td', {}, v.number === 1 ? 'computed from the genesis record' : [timestamp(info.created), info.user?.name ? ` by ${info.user.name}` : '']),
          h('td', {}, v.isVersion ? (v.forkRecord ? chip('fork record', 'bad') : v.number === 1 ? chip('computed', 'ok') : verdictChip('signed'))
            : chip('not a version', 'bad')));
      })))));
}

function ownedLines(a, lines) {
  if (!lines.length) return null;
  return section('Lines of this owner in this archive', h('ul', { class: 'plain' }, lines.map((o) => h('li', {},
    h('a', { href: (o.kind === 'collection' ? pages.collection : pages.object)(ref(a, o.id)) }, ref(a, o.id)),
    ' ', chip(String(o.kind ?? '?')), ' ', o.status === 'withdrawn' ? chip('withdrawn', 'bad') : null))));
}

function keeper(ctx, k, owner, log) {
  const mark = h('span', {}, loading('Checking…'));
  const tones = { [CONFIRMED]: 'ok', [CLAIMED]: 'warn' };
  const accepted = log.side().slice(1).find((v) => v.keys?.ended && (!log.forkPoint || v.number < log.forkPoint))?.keys.successor ?? null;
  (async () => {
    let result;
    try {
      result = await checkKeeper(ctx.http, k, owner, { signal: ctx.signal });
    } catch {
      return;
    }
    mark.replaceChildren(chip(result.status, tones[result.status] || ''),
      h('span', { class: 'small muted' }, ` ${result.reason} (section 6.6)`),
      ...result.successors.map((succ) => h('div', { class: 'small' }, 'The keeper names a successor, ', h('code', {}, succ), ': ',
        accepted === succ ? 'the one the key log names too.'
          : accepted ? 'a claim, since the key log names another (section 6.6).'
          : 'named by the keeper; it does not by itself end the owner, and readers never follow it by themselves.')));
  })();
  return h('div', {}, external(k), ' ', mark);
}
