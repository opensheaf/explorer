# Working on the OpenSheaf Explorer

This repository is a literate program. The sources are the chapters in
`literate/` (4-space indented code chunks headed `// in NAME:`, with
whole-line `<<NAME>>` references; prose between the chunks). Tangling and
weaving are done by [opensheaf-literate](https://opensheaf.org/literate/)
(the `literate` command), pinned in `requirements-literate.txt` and
configured by `literate.json`.

**Never edit the tangled files directly.** They are generated from the
chapters and overwritten by the next tangle:

- `index.html`, `app/*.js`, `style.css`, `embed.js`
- `tests/disk.mjs`, `tests/*.test.mjs`, `tests/verify-url.mjs`
- `tests/fixtures/make.sh`, `tests/fixtures/break.py` (the fixture
  archives under `tests/fixtures/`, and what `osheaf verify` finds in
  them, `tests/fixtures/verify/`, are made by them, with `osheaf` on
  specification 0.2: `PATH=…/opensheaf-py/.venv/bin:$PATH sh
  tests/fixtures/make.sh`)

`literate tangle --list` gives the current list, with the chapter of each
file. `literate tangle --where FILE:LINE` gives the line of the chapter a
line of a tangled file comes from.

To make a change:

1. edit the chapter in `literate/`, its code and the prose explaining it;
2. tangle: `literate tangle` (once: `pip install -r
   requirements-literate.txt`); `literate weave` weaves the website into
   `site/source/`;
3. check: `literate tangle --check` (CI fails if a file differs from its
   chapter);
4. test: `node --test tests/` (tests are in `literate/70-tests.md`,
   `71-tests-identity.md` and `72-tests-across.md`).

Plain files, edited directly: `fonts/` (copies of the site's faces), `schemas/` and `opensheaf-symbol.svg`
(copies of the specification's files), `literate.json`,
`requirements-literate.txt`, `README.md`, `AGENTS.md`,
`.github/workflows/*`.
