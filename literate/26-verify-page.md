The page of the verification
============================

The [verification](17-verify.md) runs from this page: the
reader chooses what to check, starts it, follows its progress, may cancel
it, and reads the findings, grouped by object, each with its level and
the section of the specification it rests on. A summary says how much was
checked; a list says what was not, so that a clean report is never read
as more than it is; and the errors are also given as text, in the form of
`osheaf verify`, to be compared or pasted into an issue.

A verification is kept by the explorer's context while it runs, so that
the reader may look at an object meanwhile and come back to the page,
which shows it as it stands.

The module is `app/view-verify.js`.

    // in app/view-verify.js:
    import { h, append, clear, bytes, plural } from './dom.js';
    import { chip, section, sectionRef, pages, errorBox } from './ui.js';
    import { verify, estimateContent, NOT_CHECKED } from './verify.js';
    import { explain } from './http.js';

    <<the options of a verification>>

    <<running a verification>>

    <<the findings of a verification>>

    export function showVerify(ctx, root) {
      const run = ctx.verification || (ctx.verification = { report: null, findings: [], listeners: new Set() });
      const options = verifyOptions(ctx);
      const results = h('div', { class: 'results' });
      const progress = h('div', { class: 'progress' });
      const start = h('button', { type: 'button', class: 'primary', onclick: () => startVerification(ctx, options) }, 'Verify');
      const cancel = h('button', { type: 'button', onclick: () => run.controller?.abort() }, 'Cancel');
      const update = () => {
        start.disabled = Boolean(run.running);
        cancel.hidden = !run.running;
        clear(progress, run.progress ? progressView(run.progress) : null, run.error ? errorBox('The verification failed.', run.error) : null);
        clear(results, findingsView(ctx, run));
      };
      run.listeners.clear();
      run.listeners.add(update);
      append(root,
        h('header', { class: 'page-head' },
          h('p', { class: 'kicker' }, 'Verification · ', h('a', { href: pages.archive() }, ctx.archive.name)),
          h('h1', {}, 'Verify this archive'),
          h('p', { class: 'lead' }, 'The checks of section 14 that can be made over HTTP, in this browser: ',
            'the discovery document against the storage root, every inventory and its checksum file, the descriptions ',
            'of every object version against the schemas and the rules of sections 7 to 11, the document versions, ',
            'the pins of collections, mirrors and accepted copies.')),
        options.el, h('div', { class: 'controls' }, start, cancel), progress, results,
        section('What is not checked', h('ul', { class: 'not-checked' },
          NOT_CHECKED.map((n) => h('li', {}, n.text, ' ', sectionRef(n.section))))));
      update();
    }

The options
-----------

Two options: resolving the members of other archives and the sources of
accepted copies (on by default, as it is what section 14 asks; it reads
other archives, which may not allow it, see [cross-origin requests](10-http.md)),
and checking the digests of all files (off by default, since it downloads
the whole archive). When the second is chosen, the page first asks the
server for the sizes of the files and says how much will be read.

    // in the options of a verification:
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

Running
-------

A run needs the schemas, read once from the explorer's own site. Its
findings are kept as they come, and the page, if shown, is told of each
change; it is redrawn at most a few times a second, so that a run with
thousands of findings does not spend its time drawing.

    // in running a verification:
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
          schemas, remote: options.remote.checked, digests: options.digests.checked, resolver: ctx.resolver,
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

The progress shows the phase (the objects, the members of other archives,
the digests), what is done of it, and what is being checked.

    // in running a verification:
    const PHASES = { starting: 'Starting', objects: 'Checking the objects', members: 'Resolving the members of other archives',
                     digests: 'Checking the digests of the files' };

    function progressView(p) {
      return h('div', {},
        h('progress', { max: p.total || 1, value: p.done || 0 }),
        h('p', { class: 'small' }, `${PHASES[p.phase] || p.phase}: ${p.done} of ${p.total}`,
          p.current ? h('span', { class: 'muted' }, ` (${p.current})`) : null));
    }

The findings
------------

The summary gives the verdict and the counts, and how much was checked:
objects, object versions, pins, files and requests, and the time taken.
A cancelled run says so: its findings are those of the part it checked.
Below, the findings are grouped: first those about the archive as a whole
(its discovery document, its presentation), then those of each object,
in the order of the identifiers. A group with errors is open, the others
closed. The levels can be hidden one by one.

    // in the findings of a verification:
    const LEVELS = { error: ['error', 'bad'], warning: ['warning', 'warn'], info: ['note', ''] };

    function findingsView(ctx, run) {
      const findings = run.report ? run.report.findings : run.findings;
      if (!run.report && !findings.length) return null;
      const counts = { error: 0, warning: 0, info: 0 };
      for (const f of findings) counts[f.level]++;
      const shown = ctx.verificationLevels || (ctx.verificationLevels = new Set(['error', 'warning', 'info']));
      const groups = new Map();
      for (const f of findings) {
        const key = f.object ?? '';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(f);
      }
      const keys = [...groups.keys()].sort((x, y) => (x === '' ? -1 : y === '' ? 1 : x.localeCompare(y)));
      const body = h('div', { class: 'groups' });
      const draw = () => clear(body, keys.map((key) => groupView(key, groups.get(key), shown)));
      const toggles = Object.entries(LEVELS).map(([level, [name, tone]]) => {
        const box = h('input', { type: 'checkbox', checked: shown.has(level) });
        box.addEventListener('change', () => { box.checked ? shown.add(level) : shown.delete(level); draw(); });
        return h('label', { class: 'toggle' }, box, ' ', chip(`${counts[level]} ${name}${counts[level] === 1 ? '' : 's'}`, tone));
      });
      draw();
      return [summaryView(run, counts), h('div', { class: 'controls' }, toggles), body,
        run.report ? h('details', { class: 'json' }, h('summary', {}, 'The errors as text, in the form of osheaf verify'),
          h('pre', {}, run.report.text())) : null];
    }

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
          ` checked; ${plural(r.requests, 'request')} in ${seconds}.` +
          (r.options.remote ? '' : ' Members of other archives were not resolved.') +
          (r.options.digests ? '' : ' The digests of the files were not checked.')));
    }

A group lists its findings: the level, the object version concerned, the
message, the section of the specification. A finding that comes from a
failed request (a member that could not be resolved) also explains it,
since "unavailable" in a browser often means "not allowed by the other
server".

    // in the findings of a verification:
    function groupView(key, findings, shown) {
      const visible = findings.filter((f) => shown.has(f.level));
      if (!visible.length) return null;
      const errors = findings.filter((f) => f.level === 'error').length;
      return h('details', { class: 'group', open: errors > 0 },
        h('summary', {}, key ? h('a', { href: pages.object(key) }, key) : 'The archive', ' ',
          errors ? chip(plural(errors, 'error'), 'bad') : chip('no errors', 'ok'), ' ',
          h('span', { class: 'muted small' }, plural(findings.length, 'finding'))),
        h('ul', { class: 'findings' }, visible.map((f) => h('li', { class: f.level },
          chip(LEVELS[f.level][0], LEVELS[f.level][1]), ' ',
          f.ver ? h('code', {}, f.ver) : null, f.ver ? ' ' : '',
          f.object ? f.message : `${f.where}: ${f.message}`, ' ', sectionRef(f.section),
          (f.errors || []).map(explain).filter(Boolean).slice(0, 1).map((t) => h('div', { class: 'small muted' }, t))))));
    }
