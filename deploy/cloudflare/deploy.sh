#!/bin/sh
# Build the workbench and upload it to Cloudflare Workers as static assets.
# Standalone editing only: no Backstage catalog, no Canon diagram library, no
# imported topology. The page is whatever tools/build.py produces in this
# checkout, including a fork's company/ overlay. See deploy/cloudflare/README.md.
#
# Usage: sh deploy/cloudflare/deploy.sh
# Requires Node 22+ (Wrangler 4), Python 3, and a one-time `npx wrangler login` on this machine.
#
# No account or Worker identity is committed. The Worker name comes from
# FLOWVIEW_CF_WORKER in the environment or in deploy/cloudflare/local.env
# (gitignored; copy local.env.example). The Wrangler config is generated into
# deploy/cloudflare/.generated/ (gitignored) on every run.
set -eu
# Byte-wise character ranges, so [a-z] below cannot match uppercase letters.
LC_ALL=C
export LC_ALL
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
SITE="$HERE/site"
GEN="$HERE/.generated"

if [ -z "${FLOWVIEW_CF_WORKER:-}" ] && [ -f "$HERE/local.env" ]; then
  FLOWVIEW_CF_WORKER="$(sed -n 's/^FLOWVIEW_CF_WORKER=//p' "$HERE/local.env" | tail -n 1)"
fi
# Cloudflare Worker names: 1-63 lowercase letters, digits and hyphens, not
# starting or ending with a hyphen (they become a workers.dev DNS label).
NAME_OK=yes
case "${FLOWVIEW_CF_WORKER:-}" in
  ''|*[!a-z0-9-]*|-*|*-) NAME_OK=no;;
esac
if [ "$NAME_OK" = yes ] && [ "${#FLOWVIEW_CF_WORKER}" -gt 63 ]; then NAME_OK=no; fi
if [ "$NAME_OK" = no ]; then
  echo "Set FLOWVIEW_CF_WORKER in the environment or in deploy/cloudflare/local.env" >&2
  echo "(see local.env.example): 1-63 lowercase letters, digits and hyphens, not" >&2
  echo "starting or ending with a hyphen." >&2
  exit 1
fi

cd "$ROOT"
python3 tools/build.py

rm -rf "$SITE"
mkdir -p "$SITE/workbench" "$SITE/template"
cp "$ROOT/workbench/flowspec.html" "$SITE/workbench/flowspec.html"
# Always an empty library index, whatever canon.json lists: this deploy ships no
# diagrams/ folders. Its presence makes Browse show nothing instead of the
# bundled fictional example (src/library.workbench.js falls back only on 404).
printf '{\n  "version": 3,\n  "diagrams": []\n}\n' > "$SITE/workbench/diagrams.json"
cp "$ROOT/workbench/starters.example.json" "$SITE/workbench/starters.json"
# Export project fetches ../template/flowview.html from the workbench page.
cp "$ROOT/template/flowview.html" "$SITE/template/flowview.html"
printf '/  /workbench/flowspec.html  302\n' > "$SITE/_redirects"
printf '/*\n  Cache-Control: no-cache\n' > "$SITE/_headers"

# html_handling "none" keeps /workbench/flowspec.html at its exact path so the
# page's relative fetches resolve.
mkdir -p "$GEN"
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

cd "$GEN"
npx -y wrangler@4 deploy -c "$GEN/wrangler.jsonc"
