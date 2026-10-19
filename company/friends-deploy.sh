#!/bin/sh
# Build the Friends library and optionally publish it to Cloudflare Workers.
# Usage: sh company/friends-deploy.sh prepare|deploy
# This file belongs to the Friends overlay; upstream deploy/cloudflare/deploy.sh
# remains the catalog-free, library-free example deployment.
set -eu
LC_ALL=C
export LC_ALL

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HERE="$ROOT/deploy/cloudflare"
SITE="$HERE/site"
GEN="$HERE/.generated"
STAGE=""
BACKUP=""

case "${1:-}" in
  prepare|deploy) ACTION="$1";;
  *) echo "Usage: sh company/friends-deploy.sh prepare|deploy" >&2; exit 2;;
esac
if [ "$#" -ne 1 ]; then
  echo "Usage: sh company/friends-deploy.sh prepare|deploy" >&2
  exit 2
fi

# The local.env file is ignored by Git. Validate before generating JSON or
# touching build outputs so its value cannot escape the Wrangler name field.
if [ -z "${FLOWVIEW_CF_WORKER:-}" ] && [ -f "$HERE/local.env" ]; then
  FLOWVIEW_CF_WORKER="$(sed -n 's/^FLOWVIEW_CF_WORKER=//p' "$HERE/local.env" | tail -n 1)"
fi
NAME_OK=yes
case "${FLOWVIEW_CF_WORKER:-}" in
  ''|*[!a-z0-9-]*|-*|*-) NAME_OK=no;;
esac
if [ "$NAME_OK" = yes ] && [ "${#FLOWVIEW_CF_WORKER}" -gt 63 ]; then NAME_OK=no; fi
if [ "$NAME_OK" = no ]; then
  echo "Set FLOWVIEW_CF_WORKER in the environment or deploy/cloudflare/local.env" >&2
  echo "(1-63 lowercase letters, digits and hyphens; no leading or trailing hyphen)." >&2
  exit 1
fi

mkdir -p "$GEN"
STAGE="$(mktemp -d "$GEN/site-stage.XXXXXX")"
restore_default_build() {
  if [ -n "$BACKUP" ] && [ ! -e "$SITE" ]; then
    if ! mv "$BACKUP" "$SITE"; then
      echo "friends-deploy.sh: could not restore the previous prepared site at $BACKUP" >&2
    fi
  fi
  if ! (cd "$ROOT" && python3 tools/build.py >/dev/null); then
    echo "friends-deploy.sh: default build restoration failed; run python3 tools/build.py" >&2
  fi
  if [ -n "$STAGE" ]; then rm -rf "$STAGE"; fi
}
trap restore_default_build EXIT

cd "$ROOT"
# The company overlay selects science and sports. Keep the Canon library and
# hide the service catalog because this Friends site has no Backstage service.
node tools/source-loader.cjs --packages | python3 -c '
import json, sys
selected = json.load(sys.stdin)
if sorted(selected) != ["science", "sports"]:
    raise SystemExit(f"Friends site requires science and sports only; selected {selected}")
'
python3 tools/build.py --no-catalog
node tools/canon/library.mjs --registry canon.json --out workbench/diagrams.json --thumbnails

# The generated index must point only to the six active Friends documents.
# This also catches a stale or accidentally empty canon.json before replacing
# a previously prepared site.
python3 - "$ROOT/workbench/diagrams.json" <<'PY'
import json, pathlib, sys
index = json.loads(pathlib.Path(sys.argv[1]).read_text())
expected = {'season-of-seats', 'sell-the-inventory', 'serve-game-night', 'build-next-season', 'copy-gate', 'islanders-marketing'}
entries = index.get('diagrams', [])
ids = {entry.get('id') for entry in entries}
if len(entries) != len(expected) or ids != expected:
    raise SystemExit(f'Friends library must contain exactly {sorted(expected)}; got {sorted(ids)}')
for entry in entries:
    expected_url = f'../diagrams/friends/{entry["id"]}/{entry["id"]}.spec.json'
    if entry.get('specUrl') != expected_url:
        raise SystemExit(f'Unexpected spec URL for {entry["id"]}')
    if not entry.get('preview', {}).get('url', '').startswith('library-thumbnails/'):
        raise SystemExit(f'Missing thumbnail for {entry["id"]}')
PY

mkdir -p "$STAGE/workbench" "$STAGE/template" "$STAGE/diagrams"
cp workbench/flowspec.html workbench/diagrams.json "$STAGE/workbench/"
python3 - "$ROOT/workbench/diagrams.json" "$ROOT/workbench" "$STAGE/workbench" <<'PY'
import json, pathlib, re, shutil, sys
index_file, source_root, stage_root = map(pathlib.Path, sys.argv[1:])
for entry in json.loads(index_file.read_text())['diagrams']:
    relative = entry['preview']['url']
    if not re.fullmatch(r'library-thumbnails/[0-9a-f]{64}/[0-9a-f]{64}\.png', relative):
        raise SystemExit(f'Unsafe thumbnail URL for {entry["id"]}')
    source = source_root / relative
    if not source.is_file() or source.is_symlink():
        raise SystemExit(f'Missing regular thumbnail for {entry["id"]}')
    destination = stage_root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
PY
cp template/flowview.html "$STAGE/template/"
for slug in season-of-seats sell-the-inventory serve-game-night build-next-season copy-gate islanders-marketing; do
  mkdir -p "$STAGE/diagrams/friends/$slug"
  cp "diagrams/friends/$slug/$slug.spec.json" "$STAGE/diagrams/friends/$slug/"
done
python3 - "$STAGE" <<'PY'
import json, pathlib, sys
stage = pathlib.Path(sys.argv[1])
starters = []
for slug in ('season-of-seats', 'sell-the-inventory', 'serve-game-night', 'build-next-season', 'copy-gate', 'islanders-marketing'):
    spec = json.loads((stage / 'diagrams/friends' / slug / (slug + '.spec.json')).read_text())
    starters.append({'name': spec['page']['title'],
                     'desc': spec['page'].get('description') or 'Friends library story',
                     'spec': spec})
(stage / 'workbench/starters.json').write_text(json.dumps(starters, ensure_ascii=False) + '\n')
PY
cp canon.json "$STAGE/"
printf '/  /workbench/flowspec.html  302\n' > "$STAGE/_redirects"
printf '/*\n  Cache-Control: no-cache\n' > "$STAGE/_headers"
python3 company/verify-friends-bundle.py "$STAGE"

cat > "$GEN/wrangler.jsonc" <<JSON
{
  "name": "$FLOWVIEW_CF_WORKER",
  "compatibility_date": "2026-10-12",
  "assets": {
    "directory": "../site",
    "html_handling": "none",
    "not_found_handling": "404-page"
  }
}
JSON
# Keep the previous prepared site recoverable until the replacement is in
# place. The EXIT trap restores it if either rename fails or the run stops.
if [ -e "$SITE" ]; then
  BACKUP="$(mktemp -d "$GEN/site-backup.XXXXXX")"
  rmdir "$BACKUP"
  mv "$SITE" "$BACKUP"
fi
mv "$STAGE" "$SITE"
STAGE=""
if [ -n "$BACKUP" ]; then rm -rf "$BACKUP"; BACKUP=""; fi

echo "Prepared Friends site: $SITE"
if [ "$ACTION" = deploy ]; then
  (cd "$GEN" && npx -y wrangler@4 deploy -c "$GEN/wrangler.jsonc")
fi
