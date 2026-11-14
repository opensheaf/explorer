The stylesheet
==============

The explorer looks like the rest of `opensheaf.org`: the palette of its
stylesheet (`resources/opensheaf.css` of the specification's repository),
on a single blue hue, from a lightly tinted paper to deep ink, for the
light theme and the dark one, chosen by the reader's system
(`prefers-color-scheme`). Every pair of text and background meets WCAG AA,
as there. Titles and abstracts are set in a serif, as text to be read; the
rest, which is an interface, in the system's sans-serif. The layout is a
single column, with 16-pixel gutters on a phone; tables that would be too
wide scroll inside their box rather than the page. Statuses use three
tones besides the blue: green for what is verified, red for errors and
withdrawals, amber for warnings, each with a text label, so that colour
is never the only sign.

The symbol of OpenSheaf (`opensheaf-symbol.svg`, the dot mark of the
logo, a copy of `resources/brand/opensheaf-symbol.svg`) is drawn in black,
and inverted on the dark theme. It is licensed under CC BY 4.0, not under
the GPL of the explorer, and its use as a mark follows the OpenSheaf
[trademark policy](https://github.com/opensheaf/opensheaf.github.io/blob/main/TRADEMARKS.md).

    /* in style.css: */
    <<the colours of the two themes>>

    <<the page>>

    <<the header and the footer>>

    <<lists of facts, chips and alerts>>

    <<lists of objects, members and versions>>

    <<tables, forms and JSON>>

    <<the verification>>

    <<narrow screens>>

The colours
-----------

The variables of `opensheaf.css`, with three tones added for statuses,
each with a background tint for chips and alerts.

    /* in the colours of the two themes: */
    :root {
      color-scheme: light dark;
      --bg: #f8fafc; --surface: #edf1f5; --border: #cfd8e2; --text: #212a36; --title: #1c3554;
      --link: #265082; --visited: #476385; --muted: #5e6a78; --code-bg: #eef2f6; --marker: #4375b1;
      --ok: #1d6b3a; --ok-bg: #e3f2e8; --bad: #a32020; --bad-bg: #fbe6e6; --warn: #7a4d00; --warn-bg: #fbf0d9;
      --serif: Charter, "Bitstream Charter", "Iowan Old Style", "Source Serif Pro", Georgia, serif;
      --sans: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      --mono: ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #151b23; --surface: #1f2730; --border: #343f4b; --text: #d4dbe2; --title: #b8cfea;
        --link: #96bbe9; --visited: #9fb5d1; --muted: #929daa; --code-bg: #1e252f; --marker: #79a4d8;
        --ok: #8fd3a5; --ok-bg: #1b3326; --bad: #f2a3a3; --bad-bg: #3d1f22; --warn: #f0c674; --warn-bg: #3a2f17;
      }
    }

The page
--------

    /* in the page: */
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body { margin: 0; background: var(--bg); color: var(--text); font: 16px/1.5 var(--sans); }
    main { max-width: 60rem; margin: 0 auto; padding: 1rem 16px 3rem; }
    a { color: var(--link); text-decoration: underline; text-decoration-thickness: 0.06em;
        text-underline-offset: 0.15em; text-decoration-color: color-mix(in srgb, currentColor 55%, transparent); }
    a:visited { color: var(--visited); }
    a:hover, a:focus { text-decoration-color: currentColor; }
    h1, h2, h3 { color: var(--title); font-family: var(--serif); font-weight: 700; line-height: 1.25; }
    h1 { font-size: 1.9rem; margin: 0.2em 0 0.3em; overflow-wrap: anywhere; }
    h2 { font-size: 1.3rem; margin: 0 0 0.6em; }
    code, pre { font-family: var(--mono); font-size: 0.88em; }
    code { overflow-wrap: anywhere; }
    .muted { color: var(--muted); }
    .small { font-size: 0.875rem; }
    .lead, .abstract { font-family: var(--serif); font-size: 1.08rem; }
    .abstract { white-space: pre-line; }
    .kicker { margin: 0; color: var(--muted); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.04em; }
    .creators { margin: 0.2em 0; color: var(--muted); }
    .page-head { margin-bottom: 1.2rem; }
    .page-head .chips { display: flex; flex-wrap: wrap; gap: 0.4em; align-items: center; }
    section.block { margin: 1.6rem 0; padding-top: 1rem; border-top: 1px solid var(--border); }
    .math { font-family: var(--serif); font-style: italic; }
    .loading { color: var(--muted); }
    .loading::before { content: "⏳ "; }
    [hidden] { display: none !important; }

The header and the footer
-------------------------

    /* in the header and the footer: */
    header.site { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3em 1.2em; padding: 0.6em 16px;
                  background: var(--surface); border-bottom: 1px solid var(--border); }
    header.site .brand { display: inline-flex; align-items: center; gap: 0.45em; font-weight: 650;
                         color: var(--title); text-decoration: none; }
    header.site .archive-name a { color: var(--text); text-decoration: none; font-family: var(--serif); }
    header.site .nav { display: flex; gap: 1em; margin-left: auto; }
    header.site .nav a { text-decoration: none; }
    header.site .nav a.current { font-weight: 650; color: var(--title); }
    img.symbol { width: 22px; height: 22px; }
    @media (prefers-color-scheme: dark) { img.symbol { filter: invert(1); } }
    footer.site { max-width: 60rem; margin: 0 auto; padding: 1rem 16px 2rem; color: var(--muted);
                  font-size: 0.85rem; border-top: 1px solid var(--border); }

Facts, chips and alerts
-----------------------

    /* in lists of facts, chips and alerts: */
    dl.facts { display: grid; grid-template-columns: minmax(8rem, max-content) 1fr; gap: 0.35em 1.2em; margin: 0.8em 0; }
    dl.facts dt { color: var(--muted); }
    dl.facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .chip { display: inline-block; padding: 0.05em 0.55em; border-radius: 999px; font-size: 0.8rem; line-height: 1.5;
            background: var(--surface); border: 1px solid var(--border); color: var(--text); white-space: nowrap; }
    .chip.ok { background: var(--ok-bg); color: var(--ok); border-color: transparent; }
    .chip.bad { background: var(--bad-bg); color: var(--bad); border-color: transparent; }
    .chip.warn { background: var(--warn-bg); color: var(--warn); border-color: transparent; }
    .alert { margin: 0.8em 0; padding: 0.7em 0.9em; border-left: 4px solid var(--marker); background: var(--surface); border-radius: 4px; }
    .alert.bad { border-left-color: var(--bad); background: var(--bad-bg); }
    .alert.warn { border-left-color: var(--warn); background: var(--warn-bg); }
    .error-box { margin: 1em 0; padding: 0.8em 1em; border: 1px solid var(--bad); border-radius: 6px; background: var(--bad-bg); }
    .error-box p { margin: 0.3em 0; }
    .error-box .url { overflow-wrap: anywhere; font-family: var(--mono); font-size: 0.85em; }
    .section-ref { font-size: 0.78rem; color: var(--muted); white-space: nowrap; }
    .note { overflow-wrap: anywhere; }
    ul.notices { padding-left: 1.2em; }
    ul.notices li.about-this { font-weight: 500; }
    .unsafe-link { color: var(--bad); }

Lists
-----

The list of objects, the members of a collection and the document
versions are lists of small cards, which fold naturally on a narrow
screen.

    /* in lists of objects, members and versions: */
    ol.objects, ol.members { list-style: none; margin: 0.6em 0; padding: 0; }
    ol.objects li.object, ol.members li.member { padding: 0.7em 0; border-bottom: 1px solid var(--border); }
    li.object .main .title { font-family: var(--serif); font-size: 1.08rem; font-weight: 600; }
    li.object .main .creators { display: block; font-size: 0.92rem; }
    li.object .side { font-size: 0.85rem; color: var(--muted); }
    li.object .side .id { color: var(--muted); }
    li.object.unreadable .main .title::after { content: " (cannot be read)"; color: var(--bad); font-weight: 400; font-size: 0.85rem; }
    li.member .member-head { font-family: var(--serif); font-size: 1.05rem; }
    li.member .member-head .title { font-weight: 600; }
    li.member .n { color: var(--muted); font-family: var(--sans); font-size: 0.9rem; }
    li.member .creators { font-size: 0.92rem; }
    ul.pins { margin: 0.3em 0; padding-left: 1.2em; font-size: 0.9rem; }
    .member .results, .member .nested { margin-top: 0.3em; }
    .member .nested ol.members { margin-left: 0.4em; padding-left: 0.9em; border-left: 2px solid var(--border); }
    .resolved { margin: 0.3em 0; }
    details.problems { font-size: 0.875rem; }
    ol.versions { padding-left: 1.4em; }
    ol.versions li { margin: 0.35em 0; }
    ol.versions li.shown, table tr.shown td { background: var(--surface); }
    ol.versions .change { font-family: var(--serif); color: var(--muted); }
    ul.plain { padding-left: 1.2em; }
    a.current { font-weight: 700; text-decoration: none; }

Tables, forms and JSON
----------------------

    /* in tables, forms and JSON: */
    .table-wrap { overflow-x: auto; }
    table { border-collapse: collapse; width: 100%; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.35em 0.6em 0.35em 0; border-bottom: 1px solid var(--border); vertical-align: top; }
    th { color: var(--muted); font-weight: 600; }
    td.num { text-align: right; white-space: nowrap; }
    table.files td:first-child { overflow-wrap: anywhere; }
    .controls { display: flex; flex-wrap: wrap; gap: 0.5em; align-items: center; margin: 0.6em 0; }
    input, select, button { font: inherit; color: inherit; }
    input[type="text"], input[type="search"], input[type="url"], select {
      padding: 0.4em 0.6em; border: 1px solid var(--border); border-radius: 4px; background: var(--bg); }
    input[type="search"] { flex: 1 1 14rem; min-width: 0; }
    button, a.button { padding: 0.4em 0.9em; border: 1px solid var(--border); border-radius: 4px; background: var(--surface);
                       cursor: pointer; text-decoration: none; color: var(--text); }
    button.small { padding: 0.15em 0.6em; font-size: 0.85rem; }
    button.primary { background: var(--link); border-color: var(--link); color: var(--bg); font-weight: 600; }
    button:disabled { opacity: 0.55; cursor: default; }
    form.open { display: grid; gap: 0.5em; margin: 1em 0; max-width: 40rem; }
    form.open label { font-weight: 600; }
    form.open button { justify-self: start; }
    details.json { margin: 0.5em 0; }
    details.json summary { cursor: pointer; }
    details.json pre { max-height: 32rem; overflow: auto; padding: 0.7em 0.9em; background: var(--code-bg);
                       border: 1px solid var(--border); border-radius: 4px; }
    fieldset.options { border: 1px solid var(--border); border-radius: 6px; padding: 0.6em 1em; }
    fieldset.options label { display: block; margin: 0.3em 0; }

The verification
----------------

    /* in the verification: */
    .progress progress { width: 100%; height: 0.8em; accent-color: var(--marker); }
    .verdict { margin: 1em 0; padding: 0.7em 1em; border-radius: 6px; background: var(--surface); }
    .verdict.ok { background: var(--ok-bg); }
    .verdict.bad { background: var(--bad-bg); }
    .verdict p { margin: 0.2em 0; }
    details.group { margin: 0.4em 0; padding: 0.3em 0; border-bottom: 1px solid var(--border); }
    details.group summary { cursor: pointer; }
    ul.findings { margin: 0.4em 0; padding-left: 0.4em; list-style: none; font-size: 0.92rem; }
    ul.findings li { margin: 0.35em 0; overflow-wrap: anywhere; }
    label.toggle { display: inline-flex; align-items: center; gap: 0.2em; }
    ul.not-checked { font-size: 0.92rem; }

Narrow screens
--------------

On a phone, the facts are listed label above value, and the header wraps.

    /* in narrow screens: */
    @media (max-width: 40rem) {
      h1 { font-size: 1.5rem; }
      dl.facts { grid-template-columns: 1fr; gap: 0 0; }
      dl.facts dd { margin-bottom: 0.5em; }
      header.site .nav { margin-left: 0; width: 100%; }
    }
