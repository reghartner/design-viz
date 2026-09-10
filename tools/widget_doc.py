#!/usr/bin/env python3
"""Print the authoring-contract documentation for named panel widget types.

Usage:
  python3 tools/widget_doc.py thermo battery        # those two widgets
  python3 tools/widget_doc.py --list                # valid type names
  python3 tools/widget_doc.py --contract-card       # the message-contract card section

Reads contract/authoring-contract.md live (no generated copies to drift).
The panels-section intro (declaration mechanics) always prints before the
requested widget blocks, and the shared tail (sparse-patch folding,
enterOnce) always prints after them. Unknown names exit 2 and print the
valid list on stderr.
"""
import re
import sys
from pathlib import Path

CONTRACT = Path(__file__).resolve().parent.parent / "contract" / "authoring-contract.md"
PANELS_HEAD = "### panels"
CARD_HEAD = "### message-contract card"
BULLET_RE = re.compile(r"^- `([a-z]+)` ")


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

    card = "\n".join(section(CARD_HEAD)).rstrip()

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
    return card, "\n".join(intro).rstrip(), "\n".join(tail).strip(), blocks


def main(argv):
    card, intro, tail, blocks = load_sections(CONTRACT.read_text())
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
