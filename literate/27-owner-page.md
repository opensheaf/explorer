The page of an owner
====================

An owner is a keyed identity, named by its owner name, whose key log is
the line of its owner object, `sheaf:<owner>:<owner>` (section 6). The
page of an owner shows what a reader needs to weigh what it signs: its
genesis record (when and with which keys it was created, and its keeper,
as a link, with whether the keeper confirms it and the successor it may
name, section 6.6), every version of its key log with what it did and whether
it is a version of the key log, the current keys of its latest version,
the keys it has exposed (section 6.3), whether it has ended, by an ending
version or by a fork of its key log, with its fork point and its
successor (sections 6.3 and 6.6), the problems the checks of section
14.3 find, and the lines of this archive that it owns. The key log is the
one this archive keeps beside its lines (section 6.5): a copy that stops
early looks complete, which the page says.

The module is `app/view-owner.js`, and the check of the keeper is
`app/keepers.js`.

    // in app/view-owner.js:
    import { h, append, digest, timestamp, plural, copyable, external } from './dom.js';
    import { facts, chip, verdictChip, section, jsonView, errorBox, loading, pages, ref } from './ui.js';
    import { objectId, OWNER_NAME } from './names.js';
    import { describeVersion, jsonOrNull } from './owners.js';
    import { checkKeeper, CONFIRMED, CLAIMED } from './keepers.js';

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

The keeper
----------

A keeper answers for an owner, and may confirm it in a place only the
keeper controls (section 6.6): a link naming the owner in its ORCID
record, or the file `/.well-known/opensheaf` of its domain, which lists
the owners it answers for. The page reads that place when it is shown,
and says beside the link whether the keeper is *confirmed* (the place
names the owner), *claimed only* (the place was read, and does not name
it: the owner names the keeper, the keeper does not answer), or *not
checked*, with the reason (the network, a server that does not let other
sites read it). A confirmation is read as it is now: a keeper who
withdraws it ends the link, and what the owner signed stays authentic.
The link says who answers for the owner, never who owns its lines, which
only its keys decide.

The ORCID record is read from the public API of the registry,
`https://pub.orcid.org/v3.0/<iD>/researcher-urls`, which answers in JSON
when asked to (`Accept: application/json`) and lets any site read it; its
links are `researcher-url[].url.value`. A link names the owner when its
address holds the owner name as a word of its own (not a part of a longer
word of letters and digits), and is the first such word, as
opensheaf-py reads it: `https://example.org/owner/<owner>/` or
`sheaf:<owner>`. The domain's file is JSON of format
`opensheaf-keeper/0.2`, with `owners`, and possibly `successors`, owner
names it answers for mapped to their successors.

Both are read through the [HTTP client](10-http.md), with its time
limits, without credentials, and within the budget of the page; a file
larger than a mebibyte is not a keeper's. The ORCID registry is a public
host, and so is a keeper's domain; one that is local or private
(`https://localhost/`, `https://192.168.1.1/`), which a hostile genesis
record could name to have the reader's browser probe its own network,
is not read, as for the locations named in archive data
([resolving members](15-resolve.md)).

    // in app/keepers.js:
    import { OWNER_NAME, orcidValid, isObject } from './names.js';
    import { parseJson } from './http.js';
    import { localKind } from './resolve.js';

    export const KEEPER_FORMAT = 'opensheaf-keeper/0.2';
    export const CONFIRMED = 'confirmed', CLAIMED = 'claimed only', NOT_CHECKED = 'not checked';
    const KEEPER_LIMIT = 2 ** 20;
    const OWNER_WORD = /(?<![a-z0-9])[a-z2-7]{51}[aq](?![a-z0-9])/g;

    export function keeperPlace(keeper) {
      const orcid = /^https:\/\/orcid\.org\/([0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X])$/.exec(keeper);
      if (orcid) {
        return orcidValid(keeper) ? { kind: 'orcid', url: `https://pub.orcid.org/v3.0/${orcid[1]}/researcher-urls` } : null;
      }
      if (/^https:\/\/[a-z0-9.-]+\/$/.test(keeper)) return { kind: 'domain', url: `${keeper}.well-known/opensheaf` };
      return null;
    }

The answer is a status, the reason for it, and the successors the keeper
names for the owner, if any. A file that is missing (404 or 410), or that
is not what it should be, is read: the keeper does not confirm. A request
that fails otherwise leaves the link not checked. A request cancelled
because the reader left the page is passed on.

    // in app/keepers.js:
    export async function checkKeeper(http, keeper, owner, { signal } = {}) {
      const answer = (status, reason, successors = []) => ({ status, reason, successors });
      const place = keeperPlace(keeper);
      if (!place) return answer(NOT_CHECKED, 'the keeper is neither an ORCID iD nor a domain (section 6.6)');
      const local = localKind(new URL(place.url).hostname);
      if (local) return answer(NOT_CHECKED, `the keeper's domain is ${local}, which the explorer does not read`);
      const missing = place.kind === 'orcid' ? 'the ORCID registry has no record of this iD'
        : 'the keeper\'s domain has no file /.well-known/opensheaf';
      let data;
      try {
        const bytes = await http.request(place.url, { limit: KEEPER_LIMIT, signal,
          headers: place.kind === 'orcid' ? { Accept: 'application/json' } : undefined });
        data = parseJson(bytes, place.url);
      } catch (error) {
        if (error?.kind === 'aborted') throw error;
        if (error?.kind === 'not-found') return answer(CLAIMED, missing);
        if (error?.kind === 'json' || error?.kind === 'html' || error?.kind === 'too-large') {
          return answer(CLAIMED, `${place.url} is not a keeper's confirmation (${error.detail})`);
        }
        return answer(NOT_CHECKED, error?.detail || String(error?.message || error));
      }
      return place.kind === 'orcid' ? fromOrcid(data, owner, answer) : fromDomain(data, owner, answer, place.url);
    }

On ORCID, the first link that names the owner confirms it; if it names a
second owner after it, that is its successor (section 6.6: "a link naming
both"). An
answer without the list of links is not the registry's, and leaves the
link not checked.

    // in app/keepers.js:
    function fromOrcid(data, owner, answer) {
      if (!isObject(data) || !Array.isArray(data['researcher-url'])) {
        return answer(NOT_CHECKED, 'the ORCID registry did not answer with the links of the record');
      }
      for (const r of data['researcher-url']) {
        const words = typeof r?.url?.value === 'string' ? r.url.value.match(OWNER_WORD) || [] : [];
        if (words[0] !== owner) continue;
        const next = words.slice(1).find((w) => w !== owner);
        return answer(CONFIRMED, 'a link of the ORCID record names this owner', next ? [next] : []);
      }
      return answer(CLAIMED, 'no link of the ORCID record names this owner');
    }

    function fromDomain(data, owner, answer, url) {
      if (!isObject(data) || data.format !== KEEPER_FORMAT || !Array.isArray(data.owners)) {
        return answer(CLAIMED, `${url} is not a keeper's file of format ${KEEPER_FORMAT}`);
      }
      if (!data.owners.includes(owner)) return answer(CLAIMED, `${url} does not list this owner`);
      const succ = isObject(data.successors) && Object.hasOwn(data.successors, owner) ? data.successors[owner] : null;
      return answer(CONFIRMED, `${url} lists this owner`,
        typeof succ === 'string' && OWNER_NAME.test(succ) && succ !== owner ? [succ] : []);
    }

On the page, the link to the keeper is followed by its status, checked
once the rest of the page is drawn. A successor the keeper names is
weighed against the key log (section 6.6): the accepted successor is the
one an ending version before any fork point names, and only failing it
the keeper's; a keeper naming another is a claim. A successor is a hint,
never followed.

    // in app/view-owner.js:
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
