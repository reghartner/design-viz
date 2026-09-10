#!/usr/bin/env python3
"""build_index.py — generate index.html from a pages root's manifest.json.

The index is the browsing surface over a page library: one card per page,
grouped by family, with title, description, tag chips, and the widget list.
It also derives exact-title cross-page service identity into crossref.json.
Deterministic: same manifest + specs → byte-identical outputs (CI can diff them).
Run from anywhere. By default it indexes this repo's examples/; a project
consuming the visualizer passes `--root <its pages dir>` (the dir
tools/page_build.py wrote with the same --root) and optionally `--title`.
"""
import argparse
import html
import json
import pathlib
import sys

from crossrefs import CrossrefError, SAFE_PAGE, catalog_for_pages, shared_service_groups

ROOT = pathlib.Path(__file__).resolve().parent.parent
EXAMPLES = ROOT / "examples"

CSS = """
body{margin:0;font:15px/1.6 'IBM Plex Sans',system-ui,sans-serif;background:#0B1220;color:#A9C4D9;}
.wrap{max-width:1080px;margin:0 auto;padding:36px 24px 64px;}
h1{font:700 26px 'Sora',system-ui,sans-serif;color:#EAF2FF;margin:0 0 6px;}
.sub{color:#5E7396;font-size:13.5px;margin:0 0 30px;}
h2{font:600 12px 'IBM Plex Mono',monospace;letter-spacing:.14em;text-transform:uppercase;color:#5E7396;margin:34px 0 12px;border-bottom:1px solid #16233C;padding-bottom:6px;}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px;}
a.card{display:block;background:#0B1220;border:1px solid #25364F;border-radius:12px;padding:16px 18px;text-decoration:none;color:inherit;}
a.card:hover{border-color:#38E1FF;}
.t{font:600 15px 'IBM Plex Sans',system-ui,sans-serif;color:#EAF2FF;margin:0 0 4px;}
.d{font-size:12.5px;color:#93A7C9;margin:0 0 10px;min-height:18px;}
.chips{display:flex;flex-wrap:wrap;gap:5px;}
.chip{font:600 9px 'IBM Plex Mono',monospace;letter-spacing:.05em;padding:2px 7px;border-radius:5px;background:#101A2C;border:1px solid #1D2A40;color:#55627A;}
.chip.w{color:#8AE8FF;border-color:#173648;}
.shared{display:flex;flex-direction:column;gap:8px;}
.shared-row{display:grid;grid-template-columns:minmax(150px,240px) 1fr;gap:12px;align-items:start;padding:10px 12px;border:1px solid #1D2A40;border-radius:9px;background:#0D1626;}
.shared-name{font:600 12px 'IBM Plex Sans',system-ui,sans-serif;color:#EAF2FF;}
.service-chip{text-decoration:none;display:inline-block;}
.service-chip:hover{color:#EAF2FF;border-color:#38E1FF;}
@media(max-width:620px){.shared-row{grid-template-columns:1fr;gap:6px;}}
""".strip()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=str(EXAMPLES),
                    help="pages dir holding manifest.json (default: repo examples/)")
    ap.add_argument("--title", default="IoT Visualization Atlas")
    a = ap.parse_args()
    root = pathlib.Path(a.root)
    manifest_path = root / "manifest.json"
    if not manifest_path.is_file():
        print(f"build_index: {manifest_path} missing — run tools/page_build.py first")
        return 1
    manifest = json.loads(manifest_path.read_text())
    pages = [p for p in manifest.get("pages", []) if isinstance(p, dict) and p.get("file")]
    # Hrefs go into the generated page: only safe flat name.html or established
    # family/slug.html paths are allowed (no schemes, dots-up, or leading slash).
    for p in pages:
        if not isinstance(p["file"], str) or not SAFE_PAGE.fullmatch(p["file"]):
            print(f"build_index: refusing unsafe manifest path: {p['file']!r}")
            return 1
    pages.sort(key=lambda p: (p.get("family", ""), p.get("file", "")))

    try:
        crossref = catalog_for_pages(root, pages)
    except CrossrefError as ex:
        print(f"build_index: {ex}")
        return 1

    families = {}
    for p in pages:
        families.setdefault(p.get("family", "other"), []).append(p)

    out = [f"<title>{html.escape(a.title)}</title>",
           '<meta name="viewport" content="width=device-width, initial-scale=1">',
           f"<style>{CSS}</style>",
           '<div class="wrap">',
           f"<h1>{html.escape(a.title)}</h1>",
           f'<p class="sub">{len(pages)} pages · every diagram is generated from one '
           "JSON spec against the flowview template · all organizations and products "
           "are fictional</p>"]
    for fam in sorted(families):
        out.append(f"<h2>{html.escape(fam)}</h2>")
        out.append('<div class="grid">')
        for p in families[fam]:
            chips = "".join(f'<span class="chip w">{html.escape(w)}</span>'
                            for w in p.get("widgets", []))
            chips += "".join(f'<span class="chip">{html.escape(t)}</span>'
                             for t in p.get("tags", []))
            out.append(
                f'<a class="card" href="{html.escape(p["file"])}">'
                f'<p class="t">{html.escape(p.get("title", p["file"]))}</p>'
                f'<p class="d">{html.escape(p.get("description", ""))}</p>'
                f'<div class="chips">{chips}</div></a>')
        out.append("</div>")
    shared = shared_service_groups(crossref)
    if shared:
        out.append("<h2>Shared services</h2>")
        out.append('<div class="shared">')
        for service_title, records in shared:
            links = "".join(
                f'<a class="chip w service-chip" href="{html.escape(record["file"])}">'
                f'{html.escape(record["title"])}</a>'
                for record in records
            )
            out.append(
                f'<div class="shared-row"><span class="shared-name">'
                f'{html.escape(service_title)}</span><div class="chips">{links}</div></div>'
            )
        out.append("</div>")
    out.append("</div>")
    html_text = "\n".join(out) + "\n"
    (root / "index.html").write_text(html_text)
    crossref_text = json.dumps(crossref, indent=2, ensure_ascii=False) + "\n"
    (root / "crossref.json").write_text(crossref_text)
    print(f"built {root / 'index.html'} ({len(html_text)} bytes, {len(pages)} pages, "
          f"{len(families)} families, {len(shared)} shared services); "
          f"wrote {root / 'crossref.json'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
