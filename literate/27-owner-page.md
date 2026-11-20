The page of an owner
====================

An owner is a keyed identity, named by its owner name, whose key log is
the line of its owner object, `sheaf:<owner>:<owner>` (section 6). The
page of an owner shows what a reader needs to weigh what it signs: its
genesis record (when and with which keys it was created, and its keeper,
section 6.6), every version of its key log with what it did and whether
it is a version of the key log, the current keys of its latest version,
the keys it has exposed (section 6.3), whether it has ended, by an ending
version or by a fork of its key log, with its fork point and its
successor (sections 6.3 and 6.6), the problems the checks of section
14.3 find, and the lines of this archive that it owns. The key log is the
one this archive keeps beside its lines (section 6.5): a copy that stops
early looks complete, which the page says.

The module is `app/view-owner.js`.

    // in app/view-owner.js:
    import { h, append, digest, timestamp, plural, copyable } from './dom.js';
    import { facts, chip, verdictChip, section, jsonView, errorBox, loading, pages, ref } from './ui.js';
    import { objectId, OWNER_NAME } from './names.js';
    import { describeVersion, jsonOrNull } from './owners.js';

The page reads the key log (chapter [14](14-archive.md)), which also
checks it, and draws it. An owner name that is not one, or an owner whose
key log the archive does not hold, is said so.

    // in app/view-owner.js:
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
          ['Keeper', Array.isArray(genesis.keeper) ? genesis.keeper.map((k) => h('div', {}, String(k))) : null],
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

An ended owner signs nothing more (section 6.3): what it signed before
stays good, but readers weigh it by other evidence (section 6.4). A fork
of the key log ends the owner and freezes it; the signatures naming its
versions from the fork point on, of either side, make what they sign
contested (section 7.3). A successor is a hint, never followed (section
6.6). A key log that stops early looks complete (section 6.5).

    // in app/view-owner.js:
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

The versions of the key log: its number, the digest of its inventory, what
it did (as `osheaf owner show` says it), its deposit, and whether it is a
version of the key log (section 6.3); the first is computed, never
signed (section 6.1).

    // in app/view-owner.js:
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
