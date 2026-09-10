#!/usr/bin/env python3
"""Assemble the two committed single-file pages from src/.

  template/flowview.html   = flowview.skel.html  + core/flowview CSS + icons
                             + demo spec + (validator.js, engine.js, boot.flowview.js)
  workbench/flowspec.html  = workbench.skel.html + core/workbench CSS + icons
                             + (validator.js, engine.js, boot.workbench.js)

Deterministic: same src -> byte-identical output. Run from anywhere.
"""
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "src"


def read(name: str) -> str:
    return (SRC / name).read_text()


def js_bundle(*names: str) -> str:
    parts = []
    for n in names:
        parts.append("/* ---- src/" + n + " ---- */")
        parts.append(read(n).rstrip())
    return "\n".join(parts)


def fill(skel: str, mapping: dict) -> str:
    out = skel
    for key, val in mapping.items():
        marker = "{{" + key + "}}"
        if marker not in out:
            raise SystemExit(f"marker {marker} missing from skeleton")
        out = out.replace(marker, val)
    if "{{" in out:
        raise SystemExit("unfilled marker left in output: " + out[out.index("{{"):out.index("{{") + 40])
    return out


def main() -> int:
    icons = read("icons.svg").rstrip()
    core_css = read("style.core.css").rstrip()

    flowview = fill(read("flowview.skel.html"), {
        "STYLE_PAGE": read("style.flowview.css").rstrip(),
        "STYLE_CORE": core_css,
        "ICONS": icons,
        "DEMO_SPEC": read("flowview.demo.json").strip(),
        "JS": js_bundle("validator.js", "engine.js", "boot.flowview.js"),
    })
    (ROOT / "template" / "flowview.html").write_text(flowview)

    workbench = fill(read("workbench.skel.html"), {
        "STYLE_PAGE": read("style.workbench.css").rstrip(),
        "STYLE_CORE": core_css,
        "ICONS": icons,
        "JS": js_bundle("validator.js", "engine.js", "boot.workbench.js"),
    })
    (ROOT / "workbench" / "flowspec.html").write_text(workbench)

    print("built template/flowview.html (%d bytes) and workbench/flowspec.html (%d bytes)"
          % (len(flowview), len(workbench)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
