The stylesheet
==============

The explorer looks like the rest of `opensheaf.org`: it follows the design
of the site, described in its
[style](https://github.com/opensheaf/opensheaf.github.io/blob/main/.agents/skills/opensheaf-style/SKILL.md).
A page is a sheet of warm paper with black ink, in one column (46rem,
for the tables); hierarchy comes from size, space and weight, not from
colour: titles and headings in bold, links in ink with a thin grey
underline. Three quiet tones only say a state, each with a text label,
so that colour is never the only sign: green for what is verified, red
for errors and withdrawals, amber for warnings. Hairlines and faint tints
set things apart; there are no frames, shadows or icons. The text is set
in IBM Plex Sans, the code and the identifiers in JetBrains Mono. The
layout has 16-pixel gutters on a phone; tables that would be too wide
scroll inside their box rather than the page. The colours follow the
reader's system (`prefers-color-scheme`), and the site's theme button
switches between light and dark.

The symbol of OpenSheaf (`opensheaf-symbol.svg`, the dot mark of the
logo, a copy of `resources/brand/opensheaf-symbol.svg`) is drawn in black,
and inverted on the dark theme. It is licensed under CC BY 4.0, not under
the GPL of the explorer, and its use as a mark follows the OpenSheaf
[trademark policy](https://github.com/opensheaf/opensheaf.github.io/blob/main/TRADEMARKS.md).

    /* in style.css: */
    <<the faces>>

    <<the colours of the two themes>>

    <<the page>>

    <<the header and the footer>>

    <<the theme button>>

    <<lists of facts, chips and alerts>>

    <<lists of objects, members and versions>>

    <<tables, forms and JSON>>

    <<the verification>>

    <<narrow screens>>

The faces
---------

The explorer takes nothing from elsewhere (its content security policy
says so), so it keeps copies of the two faces of the site in `fonts/`:
the variable fonts of IBM Plex Sans and JetBrains Mono, under the SIL
Open Font License, each with its licence and a note on where it comes
from.

    /* in the faces: */
    @font-face { font-family: "IBM Plex Sans"; font-style: normal; font-weight: 100 700; font-display: swap;
                 src: url("fonts/plex/IBMPlexSans-Roman.woff2") format("woff2"); }
    @font-face { font-family: "IBM Plex Sans"; font-style: italic; font-weight: 100 700; font-display: swap;
                 src: url("fonts/plex/IBMPlexSans-Italic.woff2") format("woff2"); }
    @font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 100 800; font-display: swap;
                 src: url("fonts/jetbrains/JetBrainsMono-Roman.woff2") format("woff2"); }
    @font-face { font-family: "JetBrains Mono"; font-style: italic; font-weight: 100 800; font-display: swap;
                 src: url("fonts/jetbrains/JetBrainsMono-Italic.woff2") format("woff2"); }

The colours
-----------

The block of variables `--os-*` is that of the site's stylesheet
(`resources/opensheaf.css`), copied whole, never one value at a time:
the paper, the surface of tinted blocks, the hairlines, the ink, the
secondary text, the faint grey of bullets and underlines, the three
states with their tints, and the faces; light, dark and print. The
explorer's own names are set from it.

    /* in the colours of the two themes: */
    :root {
        color-scheme: light;
        --os-paper: #f9f8f5;
        --os-surface: #f1efea;
        --os-rule: #dedbd3;
        --os-ink: #171716;
        --os-muted: #6a6861;
        --os-faint: #a09d95;
        --os-ok: #2c6a3e;
        --os-ok-bg: #e6efe4;
        --os-bad: #9d2b22;
        --os-bad-bg: #f6e4e0;
        --os-warn: #7d5200;
        --os-warn-bg: #f5ecd6;
        --os-serif: "CMU Serif", "Latin Modern Roman", "Computer Modern", "Times New Roman", serif;
        --os-sans: "IBM Plex Sans", ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        --os-mono: "JetBrains Mono", ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    }
    @media (prefers-color-scheme: dark) {
        :root:not([data-theme="light"]) {
            color-scheme: dark;
            --os-paper: #12141a;
            --os-surface: #1b1e25;
            --os-rule: #31353e;
            --os-ink: #e6e7ea;
            --os-muted: #9a9ea8;
            --os-faint: #646975;
            --os-ok: #93cfa1;
            --os-ok-bg: #182a23;
            --os-bad: #eda59c;
            --os-bad-bg: #342025;
            --os-warn: #e7c277;
            --os-warn-bg: #2d281c;
        }
    }
    :root[data-theme="dark"] {
        color-scheme: dark;
        --os-paper: #12141a;
        --os-surface: #1b1e25;
        --os-rule: #31353e;
        --os-ink: #e6e7ea;
        --os-muted: #9a9ea8;
        --os-faint: #646975;
        --os-ok: #93cfa1;
        --os-ok-bg: #182a23;
        --os-bad: #eda59c;
        --os-bad-bg: #342025;
        --os-warn: #e7c277;
        --os-warn-bg: #2d281c;
    }
    @media print {
        :root, :root[data-theme] {
            color-scheme: light !important;
            --os-paper: #fff !important;
            --os-surface: #fff !important;
            --os-rule: #999 !important;
            --os-ink: #000 !important;
            --os-muted: #333 !important;
            --os-faint: #666 !important;
            --os-ok: #000 !important;
            --os-ok-bg: #fff !important;
            --os-bad: #000 !important;
            --os-bad-bg: #fff !important;
            --os-warn: #000 !important;
            --os-warn-bg: #fff !important;
        }
    }
    :root {
      --bg: var(--os-paper); --surface: var(--os-surface); --border: var(--os-rule); --text: var(--os-ink);
      --muted: var(--os-muted); --faint: var(--os-faint);
      --ok: var(--os-ok); --ok-bg: var(--os-ok-bg); --bad: var(--os-bad); --bad-bg: var(--os-bad-bg);
      --warn: var(--os-warn); --warn-bg: var(--os-warn-bg);
      --sans: var(--os-sans); --mono: var(--os-mono);
    }

The page
--------

    /* in the page: */
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.6 var(--sans);
           font-variant-numeric: lining-nums; -webkit-font-smoothing: antialiased; }
    main { max-width: 46rem; margin: 0 auto; padding: 0.5rem 16px 4rem; }
    a, a:visited { color: inherit; text-decoration: underline; text-decoration-thickness: 1px;
        text-underline-offset: 0.2em; text-decoration-color: var(--faint); }
    a:hover, a:focus { text-decoration-color: currentColor; }
    :focus-visible { outline: 1.5px solid var(--text); outline-offset: 3px; }
    h1, h2, h3 { color: var(--text); font-weight: 700; line-height: 1.2; text-wrap: balance; }
    h1 { font-size: 2.2rem; letter-spacing: -0.02em; margin: 0.2em 0 0.3em; overflow-wrap: anywhere; }
    h2 { font-size: 1.3rem; letter-spacing: -0.01em; margin: 0 0 0.6em; }
    h3 { font-size: 1.05rem; }
    code, pre { font-family: var(--mono); font-size: 0.85em; font-variant-numeric: normal;
                font-variant-ligatures: none; font-feature-settings: "calt" 0, "liga" 0; }
    code { overflow-wrap: anywhere; }
    .muted { color: var(--muted); }
    .small { font-size: 0.875rem; }
    .lead { font-size: 1.05rem; }
    .abstract { font-style: italic; white-space: pre-line; }
    .kicker { margin: 0; color: var(--muted); font-size: 0.72rem; font-weight: 600; text-transform: uppercase;
              letter-spacing: 0.06em; }
    .creators { margin: 0.2em 0; font-style: italic; }
    .page-head { margin-bottom: 1.6rem; }
    .page-head .chips { display: flex; flex-wrap: wrap; gap: 0.4em; align-items: center; }
    section.block { margin: 2.2rem 0; }
    .math { font-style: italic; }
    .loading { color: var(--muted); }
    [hidden] { display: none !important; }

The header and the footer
-------------------------

The masthead is that of the site: the symbol and the name on the left,
the pages on the right in a small grey, the page being read in ink; no
bar and no rule, space sets it apart. The name of the archive being read
follows the name of the explorer.

    /* in the header and the footer: */
    header.site { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.3em 1.2em;
                  max-width: 46rem; margin: 0 auto 2rem; padding: 1.4rem 16px 0; }
    header.site .brand { display: inline-flex; align-items: center; gap: 0.45em; font-size: 1.05rem;
                         color: var(--text); text-decoration: none; align-self: center; }
    header.site .archive-name { color: var(--muted); }
    header.site .archive-name a { color: inherit; text-decoration: none; }
    header.site .archive-name a:hover { color: var(--text); }
    header.site .nav { display: flex; gap: 1.5em; margin-left: auto; font-size: 0.82rem; }
    header.site .nav a { color: var(--muted); text-decoration: none; }
    header.site .nav a:hover, header.site .nav a.current { color: var(--text); font-weight: inherit; }
    img.symbol { width: 20px; height: 20px; }
    @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) img.symbol { filter: invert(1); } }
    :root[data-theme="dark"] img.symbol { filter: invert(1); }
    footer.site { max-width: 46rem; margin: 0 auto; padding: 1rem 16px 2.5rem; color: var(--muted);
                  font-size: 0.78rem; line-height: 1.5; }
    footer.site a { color: inherit; }

The theme button
----------------

The theme control is that of the site (`resources/theme.js` and
`resources/opensheaf.css` there): one button, a half-lit circle,
floating at the top right corner of the window, which switches between
light and dark. A visit opens in the default theme, which follows the
system, also without JavaScript, through the stylesheet alone. The
choice sets `data-theme` on the root element and is kept for the
browsing session (the tab) under the same name as on the site,
`opensheaf-theme`; on `opensheaf.org` the explorer and the pages of the
site share it, since they share the origin, and a self-hosted explorer
keeps its own. If storage is refused, the button still switches the
page being read.

The script is a classic script, not a module, loaded by the head of
`index.html` before the page is painted, so that a page opened in the
dark theme is never drawn light first. It is the explorer's own file,
as the content security policy wants.

    // in app/theme.js:
    /* The theme: the default follows the system; one button switches
       between light and dark, kept for the browsing session. A classic
       script, run in the head before the page is painted. */
    (function () {
      'use strict';
      var key = 'opensheaf-theme';
      var root = document.documentElement;
      var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

      function apply(value) {
        if (value === 'light' || value === 'dark') root.setAttribute('data-theme', value);
        else root.removeAttribute('data-theme');
      }
      try { apply(sessionStorage.getItem(key)); } catch (_) { apply(null); }

      function current() {
        var set = root.getAttribute('data-theme');
        if (set === 'light' || set === 'dark') return set;
        return media && media.matches ? 'dark' : 'light';
      }

      document.addEventListener('DOMContentLoaded', function () {
        var control = document.createElement('div');
        control.className = 'theme-control';
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'theme-toggle';

        function describe() {
          var next = current() === 'dark' ? 'light' : 'dark';
          button.setAttribute('aria-label', 'Switch to the ' + next + ' theme');
          button.title = 'Switch to the ' + next + ' theme';
        }

        button.addEventListener('click', function () {
          var next = current() === 'dark' ? 'light' : 'dark';
          apply(next);
          try { sessionStorage.setItem(key, next); } catch (_) { /* the page still switches */ }
          describe();
        });
        if (media && media.addEventListener) media.addEventListener('change', describe);

        describe();
        control.appendChild(button);
        document.body.insertBefore(control, document.body.firstChild);
      });
    }());

The button sits on the paper, so that it stays legible over the text
scrolling below it, and takes no room in the page. Where the window is
too narrow for the masthead to clear it, the masthead leaves room on its
right. It is not printed.

    /* in the theme button: */
    .theme-control { position: fixed; top: 0.7rem; right: 0.8rem; z-index: 10; margin: 0; }
    .theme-control .theme-toggle { display: grid; place-items: center; width: 30px; height: 30px; padding: 0;
        border: 0; border-radius: 50%; background: var(--bg); color: var(--faint); cursor: pointer; }
    .theme-control .theme-toggle::before { content: ""; width: 13px; height: 13px;
        border: 1.5px solid currentColor; border-radius: 50%;
        background: linear-gradient(90deg, currentColor 50%, transparent 50%); }
    .theme-control .theme-toggle:hover { color: var(--text); }
    .theme-control .theme-toggle:focus-visible { outline: 1.5px solid var(--text); outline-offset: 2px; }
    @media screen and (max-width: 60rem) { header.site { padding-right: 3rem; } }
    @media print { .theme-control { display: none !important; } }

Facts, chips and alerts
-----------------------

Facts are label and value, the label in the small grey of the apparatus.
Chips are small fully rounded tags, on the surface or on the tint of their
state. Alerts and errors stand on a tint, without a frame.

    /* in lists of facts, chips and alerts: */
    dl.facts { display: grid; grid-template-columns: minmax(8rem, max-content) 1fr; gap: 0.35em 1.4em;
               margin: 0.8em 0; font-size: 0.94rem; }
    dl.facts dt { color: var(--muted); }
    dl.facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .chip { display: inline-block; padding: 0.05em 0.6em; border-radius: 999px; font-size: 0.75rem; line-height: 1.6;
            background: var(--surface); color: var(--text); white-space: nowrap; }
    .chip.ok { background: var(--ok-bg); color: var(--ok); }
    .chip.bad { background: var(--bad-bg); color: var(--bad); }
    .chip.warn { background: var(--warn-bg); color: var(--warn); }
    .alert { margin: 1em 0; padding: 0.8em 1.1em; background: var(--surface); border-radius: 4px; }
    .alert.bad { background: var(--bad-bg); }
    .alert.warn { background: var(--warn-bg); }
    .error-box { margin: 1em 0; padding: 0.8em 1.1em; border-radius: 4px; background: var(--bad-bg); }
    .error-box p { margin: 0.3em 0; }
    .error-box .url { overflow-wrap: anywhere; font-family: var(--mono); font-size: 0.85em; }
    .section-ref { font-size: 0.75rem; color: var(--muted); white-space: nowrap; }
    .note { overflow-wrap: anywhere; }
    ul.notices { padding-left: 1.2em; }
    ul.notices li.about-this { font-weight: 600; }
    .unsafe-link { color: var(--bad); }
    li::marker { color: var(--faint); }

Lists
-----

The list of objects, the members of a collection and the document
versions are divided by hairlines, as in a bibliography: the title a
little larger than the text, the authors in italics, then a line of
facts in the small grey. They fold naturally on a narrow screen.

    /* in lists of objects, members and versions: */
    ol.objects, ol.members { list-style: none; margin: 0.6em 0; padding: 0; }
    ol.objects li.object, ol.members li.member { padding: 0.9em 0; border-bottom: 1px solid var(--border); }
    ol.objects li.object:first-child, ol.members li.member:first-child { border-top: 1px solid var(--border); }
    li.object .main .title { font-size: 1.06rem; font-weight: 600; }
    li.object .main .creators { display: block; font-size: 0.92rem; }
    li.object .side { font-size: 0.8rem; color: var(--muted); }
    li.object .side .id { color: var(--muted); }
    li.object.unreadable .main .title::after { content: " (cannot be read)"; color: var(--bad); font-weight: 400; font-size: 0.85rem; }
    li.member .member-head { font-size: 1.04rem; }
    li.member .member-head .title { font-weight: 600; }
    li.member .n { color: var(--muted); font-size: 0.85rem; }
    li.member .creators { font-size: 0.92rem; }
    ul.pins { margin: 0.3em 0; padding-left: 1.2em; font-size: 0.88rem; }
    .member .results, .member .nested { margin-top: 0.3em; }
    .member .nested ol.members { margin-left: 0.4em; padding-left: 0.9em; border-left: 1px solid var(--border); }
    .member .nested ol.members li.member:first-child { border-top: 0; }
    .resolved { margin: 0.3em 0; }
    details.problems { font-size: 0.875rem; }
    ol.versions { padding-left: 1.4em; }
    ol.versions li { margin: 0.35em 0; }
    ol.versions li.shown, table tr.shown td { background: var(--surface); }
    ol.versions .change { font-style: italic; color: var(--muted); }
    ul.plain { padding-left: 1.2em; }
    a.current { font-weight: 600; text-decoration: none; }

Tables, forms and JSON
----------------------

Tables are ruled as in a book: a rule in ink at the head and at the foot,
hairlines between the rows, no vertical rules, the header in small
letter-spaced capitals. Controls have a hairline border on the paper; the
one primary button is in ink.

    /* in tables, forms and JSON: */
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; font-size: 0.88rem; line-height: 1.45;
            border-bottom: 1px solid var(--text); }
    th, td { text-align: left; padding: 0.5em 1em 0.5em 0; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-size: 0.7rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em;
         vertical-align: bottom; border-top: 1px solid var(--text); border-bottom-color: var(--text); }
    td.num { text-align: right; white-space: nowrap; }
    table.files td:first-child { overflow-wrap: anywhere; }
    .controls { display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center; margin: 0.6em 0; }
    input, select, button { font: inherit; color: inherit; }
    input[type="checkbox"], input[type="radio"] { accent-color: var(--text); }
    input[type="text"], input[type="search"], input[type="url"], select {
      padding: 0.4em 0.6em; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); }
    input[type="search"] { flex: 1 1 14rem; min-width: 0; }
    button, a.button { padding: 0.4em 0.9em; border: 1px solid var(--border); border-radius: 4px; background: var(--bg);
                       cursor: pointer; text-decoration: none; color: var(--text); }
    button:hover, a.button:hover { border-color: var(--muted); }
    button.small { padding: 0.15em 0.6em; font-size: 0.85rem; }
    button.primary { background: var(--text); border-color: var(--text); color: var(--bg); font-weight: 600; }
    button:disabled { opacity: 0.5; cursor: default; }
    form.open { display: grid; gap: 0.5em; margin: 1em 0; max-width: 40rem; }
    form.open label { font-weight: 600; }
    form.open button { justify-self: start; }
    details.json { margin: 0.5em 0; }
    details.json summary { cursor: pointer; }
    details.json pre { max-height: 32rem; overflow: auto; padding: 0.9em 1.1em; background: var(--surface);
                       border-radius: 4px; font-size: 0.78rem; line-height: 1.55; }
    fieldset.options { border: 1px solid var(--border); border-radius: 4px; padding: 0.6em 1em; }
    fieldset.options label { display: block; margin: 0.3em 0; }

The verification
----------------

    /* in the verification: */
    .progress progress { width: 100%; height: 0.5em; accent-color: var(--text); }
    .verdict { margin: 1em 0; padding: 0.8em 1.1em; border-radius: 4px; background: var(--surface); }
    .verdict.ok { background: var(--ok-bg); }
    .verdict.bad { background: var(--bad-bg); }
    .verdict p { margin: 0.2em 0; }
    details.group { margin: 0; padding: 0.5em 0; border-bottom: 1px solid var(--border); }
    details.group summary { cursor: pointer; }
    ul.findings { margin: 0.4em 0; padding-left: 0.4em; list-style: none; font-size: 0.9rem; }
    ul.findings li { margin: 0.35em 0; overflow-wrap: anywhere; }
    label.toggle { display: inline-flex; align-items: center; gap: 0.2em; }
    ul.not-checked { font-size: 0.9rem; }

Narrow screens
--------------

On a phone, the facts are listed label above value, and the header wraps.

    /* in narrow screens: */
    @media (max-width: 40rem) {
      h1 { font-size: 1.7rem; }
      dl.facts { grid-template-columns: 1fr; gap: 0 0; }
      dl.facts dd { margin-bottom: 0.5em; }
      header.site .nav { margin-left: 0; width: 100%; }
    }
