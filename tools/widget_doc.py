#!/usr/bin/env python3
"""Print the authoring-contract documentation for named panel widget types.

Usage:
  python3 tools/widget_doc.py thermo battery        # those two widgets
  python3 tools/widget_doc.py --list                # valid type names
  python3 tools/widget_doc.py --contract-card       # the message-contract card section

Reads contract/authoring-contract.md live (no generated copies to drift),
with any company/contract/*.md fragments appended. A fragment documents its
panels under its own `### panels` heading, one `- `type` ` bullet each.
The panels-section intro (declaration mechanics) always prints before the
requested widget blocks, and the shared tail (sparse-patch folding,
enterOnce) always prints after them. Unknown names exit 2 and print the
valid list on stderr.
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from company_overlay import contract_text  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contract" / "authoring-contract.md"
PANELS_HEAD = "### panels"
CARD_HEAD = "### message-contract card"
BULLET_RE = re.compile(r"^- `([a-z][a-z0-9-]*)` ")
# Cross-panel rule the hld-to-page skill repeats beside "Think like the
# presenter". Printed once before the intro when the request includes either
# clip panel (an author who skipped `screen` still asks for `deviceapp`).
CLIP_CUE_TYPES = ("deviceapp", "screen")
CLIP_CUE = (
    "For a source-required clip opening, if a source-backed matching scene is "
    "available, include a `screen` with it and keep or make it visible at that "
    "step; if none is, omit the screen and say so instead of showing an "
    "unmatched scene. A retained matching still qualifies; no `Playing` label "
    "is required. A textual `deviceapp.clip` card alone does not qualify."
)


def load_sections(text):
    """Return (card_text, intro_text, tail_text, {type: block_text}).

    intro = panels-section prose before the first widget bullet; tail =
    top-level prose after the last widget bullet (sparse-patch folding,
    enterOnce — general mechanics every widget consumer needs). Bullet
    continuation lines are indented; a column-0 non-bullet line ends the
    bullet list.
    """
    lines = text.splitlines()

    def section(head):
        start = next(i for i, l in enumerate(lines) if l.startswith(head))
        end = len(lines)
        for j in range(start + 1, len(lines)):
            if lines[j].startswith("### ") or lines[j].startswith("## "):
                end = j
                break
        return lines[start:end]

    card = "\n".join(section(CARD_HEAD) + [""] +
                     section("### Multiple contract blocks and widths")).rstrip()

    panel_lines = section(PANELS_HEAD)
    blocks, intro, tail, cur_type, cur = {}, [], [], None, []
    in_tail = False
    for line in panel_lines:
        m = BULLET_RE.match(line)
        if m and not in_tail:
            if cur_type:
                blocks[cur_type] = "\n".join(cur).rstrip()
            cur_type, cur = m.group(1), [line]
        elif cur_type and (in_tail or (line and not line.startswith((" ", "\t")))):
            # column-0 non-bullet prose after a bullet: general tail, not
            # part of the last widget's block
            in_tail = True
            tail.append(line)
        elif cur_type:
            cur.append(line)
        else:
            intro.append(line)
    if cur_type:
        blocks[cur_type] = "\n".join(cur).rstrip()
    # Later `### panels` sections (company contract fragments) add bullets only.
    starts = [i for i, l in enumerate(lines) if l.startswith(PANELS_HEAD)]
    for start in starts[1:]:
        extra_type, extra = None, []
        for line in lines[start + 1:] + ["## end"]:
            m = BULLET_RE.match(line)
            if extra_type and not m and (not line or line.startswith((" ", "\t"))):
                extra.append(line)
                continue
            if extra_type:
                if extra_type in blocks:
                    raise ValueError("panel type documented twice: " + extra_type)
                blocks[extra_type] = "\n".join(extra).rstrip()
                extra_type = None
            if line.startswith("### ") or line.startswith("## "):
                break
            if m:
                extra_type, extra = m.group(1), [line]
    return card, "\n".join(intro).rstrip(), "\n".join(tail).strip(), blocks


def main(argv):
    card, intro, tail, blocks = load_sections(contract_text(ROOT))
    if "--list" in argv:
        print(" ".join(sorted(blocks)))
        return 0
    if "--contract-card" in argv:
        print(card)
        argv = [a for a in argv if a != "--contract-card"]
        if not argv:
            return 0
    if not argv:
        print(__doc__.strip(), file=sys.stderr)
        return 2
    unknown = [a for a in argv if a not in blocks]
    if unknown:
        print("unknown widget type(s): %s" % " ".join(unknown), file=sys.stderr)
        print("valid: %s" % " ".join(sorted(blocks)), file=sys.stderr)
        return 2
    if any(t in argv for t in CLIP_CUE_TYPES):
        print(CLIP_CUE)
        print()
    print(intro)
    for name in argv:
        print()
        print(blocks[name])
    if tail:
        print()
        print(tail)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
