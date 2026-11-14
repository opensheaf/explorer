# Working on the OpenSheaf Explorer

This repository is a literate program. The sources are the chapters in
`literate/` (4-space indented code chunks headed `// in NAME:`, with
whole-line `<<NAME>>` references; prose between the chunks).

**Never edit the tangled files directly.** They are generated from the
chapters and overwritten by the next tangle:

- `index.html`, `app/*.js`, `style.css`, `embed.js`
- `tests/disk.mjs`, `tests/*.test.mjs`, `tests/verify-url.mjs`
- `tests/fixtures/make.sh`, `tests/fixtures/break.py` (the fixture
  archives under `tests/fixtures/` are made by them, with `osheaf`)
- `tools/tangle.py`, `tools/build`, `tools/weave.py`, `tools/weave.html`,
  `tools/weave.css`

`python3 tools/tangle.py --list` gives the current list, with the chapter
of each file. `python3 tools/tangle.py --where FILE:LINE` gives the line of
the chapter a line of a tangled file comes from.

To make a change:

1. edit the chapter in `literate/`, its code and the prose explaining it;
2. tangle: `sh tools/build` (also weaves the website; needs python3 with
   `markdown` and `pygments`), or `python3 tools/tangle.py`;
3. check: `python3 tools/tangle.py --check` (CI fails if a file differs
   from its chapter);
4. test: `node --test tests/*.test.mjs` (tests are in
   `literate/70-tests.md`).

`schemas/` and `opensheaf-symbol.svg` are copies of the specification's
files, not tangled.
