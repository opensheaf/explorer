// Generated from literate/26-verify-page.md by opensheaf-literate: edit the document, not this file.
import { h, append, clear, bytes, plural } from './dom.js';
import { chip, section, sectionRef, pages, errorBox } from './ui.js';
import { verify, estimateContent, NOT_CHECKED } from './verify.js';
import { explain } from './http.js';

function verifyOptions(ctx) {
  const remote = h('input', { type: 'checkbox', checked: true });
  const digests = h('input', { type: 'checkbox' });
  const estimate = h('span', { class: 'small muted' });
  let measuring = null;
  digests.addEventListener('change', async () => {
    if (!digests.checked) {
      measuring?.abort();
      estimate.textContent = '';
      return;
    }
    measuring = new AbortController();
    estimate.textContent = ' Asking the server for the sizes of the files…';
    try {
      const e = await estimateContent(ctx.archive, { signal: measuring.signal,
        progress: ({ done, total }) => { estimate.textContent = ` Asking for the sizes of the files: ${done} of ${total}…`; } });
      estimate.textContent = ` ${plural(e.files, 'file')}: at least ${bytes(e.bytes)} to download` +
        (e.unknown ? ` (and ${plural(e.unknown, 'file')} of unknown size)` : '') +
        ' (sizes as the server declares them, possibly compressed).';
    } catch (error) {
      estimate.textContent = error?.kind === 'aborted' ? '' : ` The sizes cannot be read (${error?.detail || error?.message}).`;
    }
  });
  return {
    remote, digests,
    el: h('fieldset', { class: 'options' }, h('legend', {}, 'What to check'),
      h('label', {}, remote, ' Resolve the members of other archives and the sources of accepted copies (sections 6.4 and 14)'),
      h('label', {}, digests, ' Also check the digest of every file (downloads every content file)', estimate)),
  };
}

async function startVerification(ctx, options) {
  const run = ctx.verification;
  if (run.running) return;
  Object.assign(run, { running: true, report: null, findings: [], progress: { phase: 'starting', done: 0, total: 0 },
                       error: null, controller: new AbortController() });
  let pending = false;
  const changed = () => {
    if (pending) return;
    pending = true;
    setTimeout(() => { pending = false; for (const listen of run.listeners) listen(); }, 200);
  };
  changed();
  try {
    const schemas = await ctx.schemas();
    run.report = await verify(ctx.archive, {
      schemas, remote: options.remote.checked, digests: options.digests.checked,
      signal: run.controller.signal,
      progress: (p) => { run.progress = p; changed(); },
      onFinding: (f) => { run.findings.push(f); changed(); },
    });
  } catch (error) {
    run.error = error;
  }
  run.running = false;
  run.progress = null;
  for (const listen of run.listeners) listen();
}

const PHASES = { starting: 'Starting', objects: 'Checking the objects', members: 'Resolving the members of other archives',
                 digests: 'Checking the digests of the files' };

function progressView() {
  const bar = h('progress', { max: 1, value: 0 });
  const line = h('p', { class: 'small' });
  const el = h('div', {}, bar, line);
  return {
    el,
    update(p) {
      el.hidden = !p;
      if (!p) return;
      bar.max = p.total || 1;
      bar.value = p.done || 0;
      clear(line, `${PHASES[p.phase] || p.phase}: ${p.done} of ${p.total}`,
        p.current ? h('span', { class: 'muted' }, ` (${p.current})`) : null);
    },
  };
}

const LEVELS = { error: ['error', 'bad'], warning: ['warning', 'warn'], info: ['note', ''] };

function findingsView(ctx, run) {
  const shown = ctx.verificationLevels || (ctx.verificationLevels = new Set(['error', 'warning', 'info']));
  const counts = { error: 0, warning: 0, info: 0 };
  let groups = new Map(), keys = [], drawn = [], source = null, report;
  const verdict = h('div', {});
  const labels = {};
  const toggles = Object.entries(LEVELS).map(([level]) => {
    const box = h('input', { type: 'checkbox', checked: shown.has(level) });
    box.addEventListener('change', () => {
      box.checked ? shown.add(level) : shown.delete(level);
      for (const group of groups.values()) group.filter(shown);
    });
    labels[level] = h('span', {});
    return h('label', { class: 'toggle' }, box, ' ', labels[level]);
  });
  const body = h('div', { class: 'groups' });
  const tail = h('div', {});
  const el = h('div', { class: 'results' }, verdict, h('div', { class: 'controls' }, toggles), body, tail);
  const before = (x, y) => (x === '' ? true : y === '' ? false : x.localeCompare(y) < 0);
  const groupOf = (key) => {
    if (groups.has(key)) return groups.get(key);
    const group = groupView(key);
    let lo = 0, hi = keys.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (before(keys[mid], key)) lo = mid + 1; else hi = mid;
    }
    body.insertBefore(group.el, lo < keys.length ? groups.get(keys[lo]).el : null);
    keys.splice(lo, 0, key);
    groups.set(key, group);
    return group;
  };
  const add = (f) => {
    counts[f.level]++;
    groupOf(f.object ?? '').add(f, shown);
    drawn.push(f);
  };

  function summaryView(run, counts) {
    const r = run.report;
    if (!r) return h('p', { class: 'verdict' }, 'Checking…');
    const ms = r.finished - r.started;
    const seconds = ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
    return h('div', { class: `verdict ${counts.error ? 'bad' : 'ok'}` },
      h('p', {}, h('strong', {}, r.cancelled ? 'Cancelled. ' : '',
        counts.error ? `${plural(counts.error, 'error')} found.` : (r.cancelled ? 'No errors in what was checked.' : 'No errors found.'))),
      h('p', { class: 'small' }, `${plural(r.stats.objects, 'object')}, ${plural(r.stats.versions, 'object version')}, ` +
        `${plural(r.stats.pins, 'pin')}` + (r.options.digests ? `, ${plural(r.stats.files, 'file')} (${bytes(r.stats.filesBytes)})` : '') +
        ` checked; ${plural(r.requests, 'request')}, ${bytes(r.bytesRead)} read, in ${seconds}.` +
        (r.options.remote ? '' : ' Members of other archives were not resolved.') +
        (r.options.digests ? '' : ' The digests of the files were not checked.')));
  }
  const update = () => {
    const findings = run.report ? run.report.findings : run.findings;
    if (findings !== source) {
      if (findings.length < drawn.length || drawn.some((f, k) => findings[k] !== f)) {
        groups = new Map(); keys = []; drawn = [];
        for (const level in counts) counts[level] = 0;
        clear(body);
      }
      source = findings;
    }
    for (let k = drawn.length; k < findings.length; k++) add(findings[k]);
    el.hidden = !run.report && !findings.length;
    for (const [level, [name, tone]] of Object.entries(LEVELS)) {
      clear(labels[level], chip(`${counts[level]} ${name}${counts[level] === 1 ? '' : 's'}`, tone));
    }
    clear(verdict, summaryView(run, counts));
    if (run.report !== report) {
      report = run.report;
      clear(tail, report ? h('details', { class: 'json' }, h('summary', {}, 'The errors as text, in the form of osheaf verify'),
        h('pre', {}, report.text())) : null);
    }
  };
  return { el, update };
}

function groupView(key) {
  const errorChip = h('span', {});
  const count = h('span', { class: 'muted small' });
  const list = h('ul', { class: 'findings' });
  const el = h('details', { class: 'group' },
    h('summary', {}, key ? h('a', { href: pages.object(key) }, key) : 'The archive', ' ', errorChip, ' ', count), list);
  const items = [];
  let errors = 0, visible = 0;
  const group = {
    el,
    add(f, shown) {
      const li = h('li', { class: f.level },
        chip(LEVELS[f.level][0], LEVELS[f.level][1]), ' ',
        f.ver ? h('code', {}, f.ver) : null, f.ver ? ' ' : '',
        f.object ? f.message : `${f.where}: ${f.message}`, ' ', sectionRef(f.section),
        (f.errors || []).map(explain).filter(Boolean).slice(0, 1).map((t) => h('div', { class: 'small muted' }, t)));
      li.hidden = !shown.has(f.level);
      if (!li.hidden) visible++;
      el.hidden = visible === 0;
      items.push([f, li]);
      list.append(li);
      if (f.level === 'error' && ++errors === 1) el.open = true;
      clear(errorChip, errors ? chip(plural(errors, 'error'), 'bad') : chip('no errors', 'ok'));
      count.textContent = plural(items.length, 'finding');
    },
    filter(shown) {
      visible = 0;
      for (const [f, li] of items) {
        li.hidden = !shown.has(f.level);
        if (!li.hidden) visible++;
      }
      el.hidden = visible === 0;
    },
  };
  return group;
}

export function showVerify(ctx, root) {
  const run = ctx.verification || (ctx.verification = { report: null, findings: [], listeners: new Set() });
  const options = verifyOptions(ctx);
  const results = findingsView(ctx, run);
  const bar = progressView();
  const failure = h('div', {});
  const progress = h('div', { class: 'progress', role: 'status', 'aria-live': 'polite' }, bar.el, failure);
  const start = h('button', { type: 'button', class: 'primary', onclick: () => startVerification(ctx, options) }, 'Verify');
  const cancel = h('button', { type: 'button', onclick: () => run.controller?.abort() }, 'Cancel');
  const update = () => {
    start.disabled = Boolean(run.running);
    cancel.hidden = !run.running;
    bar.update(run.progress);
    if (failure.error !== run.error) {
      failure.error = run.error;
      clear(failure, run.error ? errorBox('The verification failed.', run.error) : null);
    }
    results.update();
  };
  run.listeners.clear();
  run.listeners.add(update);
  ctx.signal?.addEventListener('abort', () => run.listeners.delete(update), { once: true });
  append(root,
    h('header', { class: 'page-head' },
      h('p', { class: 'kicker' }, 'Verification · ', h('a', { href: pages.archive() }, ctx.archive.name)),
      h('h1', {}, 'Verify this archive'),
      h('p', { class: 'lead' }, 'The checks of section 14 that can be made over HTTP, in this browser: ',
        'the discovery document against the storage root, every inventory and its checksum file, the descriptions ',
        'of every object version against the schemas and the rules of sections 7 to 11, the document versions, ',
        'the pins of collections, mirrors and accepted copies.')),
    options.el, h('div', { class: 'controls' }, start, cancel), progress, results.el,
    section('What is not checked', h('ul', { class: 'not-checked' },
      NOT_CHECKED.map((n) => h('li', {}, n.text, ' ', sectionRef(n.section))))));
  update();
}
