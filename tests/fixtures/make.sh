#!/bin/sh
# Generated from literate/70-tests.md by opensheaf-literate: edit the document, not this file.
# Build the fixture archives of the tests with osheaf (opensheaf-py, specification 0.2):
#   sh tests/fixtures/make.sh
set -e
cd "$(dirname "$0")"
HERE=$(pwd)
URL=https://fixtures.example.org
rm -rf archive other forked broken verify work
mkdir -p work/config work/keys work/src verify
export XDG_CONFIG_HOME="$HERE/work/config" OPENSHEAF_KEY_STORE=file
export OPENSHEAF_LOCATIONS="$URL/=$HERE/"
export PYTEST_CURRENT_TEST="explorer fixtures (tests/fixtures/make.sh)"
unset OPENSHEAF_SIGNING_KEY OPENSHEAF_PASSPHRASE
echo 0 > work/runs
osheaf() {
  run=$(($(cat work/runs) + 1))
  echo $run > work/runs
  OSHEAF_TEST_KEYS=$(for k in 1 2 3 4 5 6 7 8; do printf 'explorer fixture %s %s,' $run $k; done) \
    command osheaf "$@"
}
init() {
  osheaf init "$1" --name "$2" --base-url "$URL/$1/" --curator "Example, Ada" --new-owner \
    --export "work/keys/$1" --no-passphrase --yes $3
}
rk() {   # rk FOLDER N: the file of the Nth rotation key exported in FOLDER
  ls work/keys/$1/rotation-*.txt | sed -n "$2p"
}
uri() {  # uri ARCHIVE LABEL [DOCUMENT-VERSION]: the sheaf: URI of a line, with its at
  python3 - "$@" <<'PY'
import json, sys, urllib.parse
archive, label = sys.argv[1], sys.argv[2]
o = next(o for o in json.load(open(f"{archive}/opensheaf.json"))["objects"] if o.get("label") == label)
v = f"/v{sys.argv[3]}" if len(sys.argv) > 3 else ""
print(f"sheaf:{o['name']}:{o['owner']}{v}?at=" + urllib.parse.quote(f"https://fixtures.example.org/{archive}/", safe=""))
PY
}
src=work/src
for f in alpha-1 alpha-2 alpha-0 beta-1 gamma-1 delta-1 eps-1 zeta-1 zeta-2; do
  printf '%s\n' "\\documentclass{article}\\begin{document}$f\\end{document}" > $src/$f.tex
  printf '%s\n' "%PDF-1.4 (a stand-in for the PDF of $f)" > $src/$f.pdf
done
init archive "A fixture archive"
A="osheaf --root archive"
$A deposit alpha $src/alpha-1.tex --pdf $src/alpha-1.pdf --new --title 'Alpha: $\alpha$-stable laws' \
  --author "Example, Ada|University of Nowhere" --available 2024-01-10 --rights cc-by-4.0 \
  --abstract 'We study $\alpha$-stable laws on $\mathbb{R}^d$.'
$A deposit alpha $src/alpha-2.tex --pdf $src/alpha-2.pdf --title 'Alpha: $\alpha$-stable laws' \
  --author "Example, Ada|University of Nowhere" --available 2024-03-01 --changes "Second version." --stage AM
$A notice alpha --about 1 --text "Lemma 2 of version 1 is wrong as stated; corrected in version 2."
$A deposit alpha $src/alpha-0.tex --pdf $src/alpha-0.pdf --title 'Alpha: $\alpha$-stable laws' \
  --author "Example, Ada|University of Nowhere" --created 2024-02-01 --after 1 \
  --changes "The submitted manuscript, found later."
$A deposit beta --pdf $src/beta-1.pdf --new --no-source "Only the PDF was kept." --title "Beta" \
  --author "Example, Ada" --available 2023-05-05 --rights cc-by-4.0
$A complete beta --version 1 --source $src/beta-1.tex
$A deposit gamma $src/gamma-1.tex --pdf $src/gamma-1.pdf --new --title "Gamma" --author "Example, Ada" \
  --available 2022-02-02 --rights cc-by-4.0
$A withdraw gamma --reason "Withdrawn for the tests."
$A deposit delta $src/delta-1.tex --pdf $src/delta-1.pdf --new --title "Delta" --author "Example, Ada" \
  --available 2022-03-03 --rights cc-by-4.0
$A takedown delta --reason "Taken down for the tests." --yes
$A collect
cat > $src/reading.yaml <<YAML
title: A reading list
description: The versions read.
type: selection
members:
  - {label: alpha, revisions: [1, 2]}
  - {label: beta}
YAML
$A collection sync reading --from $src/reading.yaml
$A draft new notes --pdf $src/eps-1.pdf --no-source "A draft." --title "Notes" --author "Example, Ada"
$A index
init forked "A forked owner"
F="osheaf --root forked"
$F deposit before --pdf $src/zeta-1.pdf --new --no-source "x" --title "Signed before the fork" \
  --author "Example, Ada" --rights cc-by-4.0
cp -R forked work/twin
$F owner rotate --rotation-key "$(rk forked 1)" --rotation-key "$(rk forked 2)" \
  --export work/keys/forked-2 --no-passphrase --yes
$F deposit after --pdf $src/zeta-2.pdf --new --no-source "x" --title "Signed after the fork point" \
  --author "Example, Ada" --rights cc-by-4.0
osheaf --root work/twin owner rotate --rotation-key "$(rk forked 1)" --rotation-key "$(rk forked 3)" \
  --export work/keys/twin-2 --no-passphrase --yes
OWNER_F=$(python3 -c 'import json; print(json.load(open("forked/osheaf.json"))["owner"])')
$F owner pull "work/twin/ocfl/$OWNER_F/$OWNER_F"
$F index
init other "Another fixture archive" "--layout hashed --curated"
O="osheaf --root other"
$O deposit exposed --pdf $src/eps-1.pdf --new --no-source "x" --title "Signed with a key exposed later" \
  --author "Example, Ada" --rights cc-by-4.0
$O deposit vouched --pdf $src/zeta-1.pdf --new --no-source "x" --title "Vouched for" \
  --author "Example, Ada" --rights cc-by-4.0
$O collection add main "$(uri other exposed)"
DID='did:key:z[1-9A-HJ-NP-Za-km-z]*'
FIRST=$($O owner show | grep -i 'current key' | grep -o "$DID" | head -1)
SECOND=$($O key new | grep -o "$DID" | head -1)
$O owner expose "$FIRST" --add "$SECOND" --rotation-key "$(rk other 1)" --rotation-key "$(rk other 2)" \
  --export work/keys/other-2 --no-passphrase --yes
$O deposit vouched --pdf $src/zeta-2.pdf --no-source "x" --title "Vouched for" --author "Example, Ada" --i-know
VOUCHED=$(python3 -c 'import json; print(next(o["id"] for o in json.load(open("other/opensheaf.json"))["objects"] if o.get("label") == "vouched"))')
rm -r "other/ocfl/$(python3 -c "
import hashlib, sys
i = sys.argv[1]; h = hashlib.sha256(i.encode()).hexdigest(); e = i.replace(':', '%3a')
print(f'{h[0:3]}/{h[3:6]}/{h[6:9]}/{e[:100]}-{h}')" "$VOUCHED")/extensions/opensheaf-witnesses/v1"
$O collection new issue --type selection --title "Issue 1"
$O accept "$(uri archive alpha 2)" --selection issue --label alpha-accepted
$O mirror "$(uri archive beta)"
cat > $src/shelf.yaml <<YAML
title: A shelf
description: Lines of three archives, kept whole.
type: catalogue
members:
  - {uri: '$(uri archive alpha)', follow: yes}
  - '$(uri archive gamma 1)'
  - '$(uri archive reading)'
  - {label: alpha-accepted}
  - '$(uri forked before)'
YAML
$O collection sync shelf --from $src/shelf.yaml
$O index
rm -rf archive/templates archive/owner archive/style.css archive/sitemap.xml archive/.nojekyll \
  forked/templates forked/owner forked/style.css forked/sitemap.xml forked/.nojekyll \
  other/templates other/owner other/style.css other/sitemap.xml other/.nojekyll
python3 break.py
for a in archive forked other; do
  osheaf --root $a verify --remote
  osheaf --root $a verify --remote --json | sed -n '/^\[/,$p' > verify/$a.json
done
for b in broken/*; do
  remote=; [ "$(basename $b)" = unchecked-branch ] && remote=--remote
  osheaf --root $b verify $remote --json | sed -n '/^\[/,$p' > verify/broken-$(basename $b).json || true
done
rm -rf work
