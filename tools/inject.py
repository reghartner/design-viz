#!/usr/bin/env python3
"""Inject a flowspec JSON file into the flowview template.

Usage: inject.py <spec.json> <template.html> <out.html>

Replaces the contents of the template's embedded JSON block (the script tag
with id "flowspec", matched at line start so prose mentions can never match),
and sets the page <title> from page.title when present. When the output uses
either the flat <root>/<page>.html or nested <root>/<family>/<page>.html layout
and the matching root has crossref.json, it also fills the separate derived
flowbacklinks block.
"""
import json
import re
import sys

from crossrefs import CrossrefError, discovered_page_backlinks, inject_backlink_block


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    spec_path, tpl_path, out_path = sys.argv[1:4]

    raw = open(spec_path).read().strip()
    try:
        spec = json.loads(raw)
    except json.JSONDecodeError as ex:
        print(f"error: {spec_path} is not valid JSON: {ex}", file=sys.stderr)
        return 1
    if "</script" in raw:
        print(f"error: {spec_path} contains a literal '</script' — escape it as '<\\/script' "
              "(see contract/authoring-contract.md, output rules)", file=sys.stderr)
        return 1

    tpl = open(tpl_path).read()
    block = re.compile(r'^(<script type="application/json" id="flowspec">)\n.*?\n(</script>)',
                       re.S | re.M)
    hits = block.findall(tpl)
    if len(hits) != 1:
        print(f"error: expected exactly one line-anchored flowspec block in {tpl_path}, "
              f"found {len(hits)}", file=sys.stderr)
        return 1
    out = block.sub(lambda m: m.group(1) + "\n" + raw + "\n" + m.group(2), tpl, count=1)

    title = (spec.get("page") or {}).get("title")
    if title:
        safe = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        out = re.sub(r"<title>.*?</title>", f"<title>{safe}</title>", out, count=1)

    try:
        backlinks = discovered_page_backlinks(out_path, spec)
        if backlinks is not None:
            out = inject_backlink_block(out, backlinks, tpl_path)
    except CrossrefError as ex:
        print(f"error: {ex}", file=sys.stderr)
        return 1

    open(out_path, "w").write(out)
    print(f"wrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
