#!/bin/sh
# Generated from literate/70-tests.md by tools/tangle.py: edit the document, not this file.
# Build the fixture archives of the tests with osheaf (opensheaf-py):
#   sh tests/fixtures/make.sh
set -e
cd "$(dirname "$0")"
rm -rf archive other broken src
mkdir src
PORT=8765
URL=http://127.0.0.1:$PORT
python3 -m http.server $PORT --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1
for f in alpha-1 alpha-2 alpha-0 beta-1 gamma-1; do
  printf '%s\n' "\\documentclass{article}\\begin{document}$f\\end{document}" > src/$f.tex
  printf '%s\n' "%PDF-1.4 (a stand-in for the PDF of $f)" > src/$f.pdf
done
A="osheaf --root archive"
osheaf init archive --archive-id tag:example.org,2026:fixture --name "A fixture archive" \
  --base-url $URL/archive/ --curator "Example, Ada"
$A deposit alpha src/alpha-1.tex --pdf src/alpha-1.pdf --title 'Alpha: $\alpha$-stable laws' \
  --author "Example, Ada|University of Nowhere" --available 2024-01-10 --rights cc-by-4.0 \
  --abstract 'We study $\alpha$-stable laws on $\mathbb{R}^d$.'
$A deposit alpha src/alpha-2.tex --pdf src/alpha-2.pdf --title 'Alpha: $\alpha$-stable laws' \
  --author "Example, Ada|University of Nowhere" --available 2024-03-01 --changes "Second version." --stage AM
$A notice alpha --about 1 --text "Lemma 2 of version 1 is wrong as stated; corrected in version 2."
$A deposit alpha src/alpha-0.tex --pdf src/alpha-0.pdf --title 'Alpha: $\alpha$-stable laws' \
  --author "Example, Ada|University of Nowhere" --created 2024-02-01 --after 1 \
  --changes "The submitted manuscript, found later."
$A deposit beta --pdf src/beta-1.pdf --no-source "Only the PDF was kept." --title "Beta" \
  --author "Example, Ada" --available 2023-05-05 --rights cc-by-4.0
$A complete beta --version 1 --source src/beta-1.tex
$A deposit gamma src/gamma-1.tex --pdf src/gamma-1.pdf --title "Gamma" --author "Example, Ada" \
  --available 2022-02-02 --rights cc-by-4.0
$A withdraw gamma --reason "Withdrawn for the tests."
$A collect
cat > src/reading.yaml <<YAML
title: A reading list
description: The versions read.
type: selection
members:
  - {archive: ., id: alpha, revisions: [1, 2]}
  - {archive: ., id: beta}
YAML
$A collection sync reading --from src/reading.yaml
$A index
$A verify
O="osheaf --root other"
osheaf init other --archive-id tag:example.org,2026:other --name "Another fixture archive" \
  --base-url $URL/other/ --curator "Example, Ada" --curated
$O accept $URL/archive/ alpha --version v2 --as alpha-copy --stage VoR
$O mirror $URL/archive/ beta
cat > src/shelf.yaml <<YAML
title: A shelf
description: Objects of two archives, kept whole.
type: catalogue
members:
  - {archive: $URL/archive/, id: alpha}
  - {archive: $URL/archive/, id: gamma, version: v1}
  - {archive: $URL/archive/, id: reading}
  - {archive: ., id: alpha-copy}
YAML
$O collection sync --from src/shelf.yaml
$O index
$O verify --remote
rm -rf src archive/paper archive/templates archive/sitemap.xml archive/style.css \
  other/paper other/templates other/sitemap.xml other/style.css
python3 break.py
