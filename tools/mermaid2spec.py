#!/usr/bin/env python3
"""Convert a mermaid sequenceDiagram into a SKELETON flowspec page JSON.

Usage: mermaid2spec.py <input.(md|mmd)> [-o out.json] [--title TITLE]

The input is either bare mermaid or markdown; the first ```mermaid fence
containing a sequenceDiagram is used. Output is a deliberately bland skeleton
(icon "gear", tint "cmd" everywhere) — enriching titles, icons, tints,
protocols, and prose is the authoring LLM's job, per the pipeline design.

Supported subset (anything else fails loud):
  participant X / participant X as Label
  X->>Y: message      solid arrow  -> main edge
  X-->>Y: message     dashed arrow -> ret:true edge
  autonumber          ignored
  alt/opt/loop/par    NOT converted: block headers land in a top-level
                      "todos" array (with skipped-message counts) and a
                      stderr summary, for the enriching agent to hand-add
  Note ...            recorded in "todos", otherwise ignored

Repeated from->to pairs fold into one edge (first message wins the edge's
label/kind); every message still becomes a step referencing that pair, so
the narrative survives even where the drawing dedupes.
"""
import argparse
import json
import re
import sys


class MermaidError(ValueError):
    pass


RX_FENCE = re.compile(r"^```mermaid\s*$(.*?)^```\s*$", re.S | re.M)
RX_PARTICIPANT = re.compile(r"^participant\s+(\S+?)(?:\s+as\s+(.+?))?\s*$")
RX_MESSAGE = re.compile(r"^(\S+?)\s*(-->>|->>)\s*(\S+?)\s*:\s*(.+?)\s*$")
RX_BLOCK = re.compile(r"^(alt|opt|loop|par)\b\s*(.*)$")
RX_NOTE = re.compile(r"^Note\b", re.I)

KIND_HTTPS = re.compile(r"https?|POST|GET", re.I)
KIND_MQTT = re.compile(r"publish|subscribe|mqtt|qos", re.I)


def extract_mermaid(text):
    """Return the mermaid source: first ```mermaid fence, else the whole text."""
    m = RX_FENCE.search(text)
    if m:
        return m.group(1)
    return text


def slug(raw):
    s = re.sub(r"[^a-z0-9]+", "", raw.lower())
    if not s:
        raise MermaidError(f"participant id {raw!r} slugs to nothing")
    return s


def infer_kind(message):
    if KIND_HTTPS.search(message):
        return "https"
    if KIND_MQTT.search(message):
        return "mqtt"
    return "int"


def parse(source):
    """Parse mermaid sequenceDiagram source into an intermediate model.

    Returns dict with: order (participant slugs in encounter order),
    titles (slug -> title), messages [(frm, to, ret, text)], todos [str].
    """
    lines = [ln.strip() for ln in source.splitlines()]
    lines = [ln for ln in lines if ln]
    if not lines or lines[0] != "sequenceDiagram":
        head = lines[0] if lines else "<empty>"
        raise MermaidError(
            f"not a sequenceDiagram (first line is {head!r}); "
            "only mermaid sequenceDiagram input is supported")

    order, titles = [], {}
    messages, todos = [], []
    depth = 0
    skipped_in_block = 0
    block_header = None

    def ensure(pid, title=None):
        s = slug(pid)
        if s not in titles:
            order.append(s)
            titles[s] = title or pid
        elif title:
            titles[s] = title
        return s

    for n, ln in enumerate(lines[1:], start=2):
        if ln == "autonumber":
            continue
        if RX_NOTE.match(ln):
            todos.append(f"note not converted: {ln}")
            continue
        b = RX_BLOCK.match(ln)
        if b:
            if depth == 0:
                block_header = f"{b.group(1)} {b.group(2)}".strip()
                skipped_in_block = 0
            depth += 1
            continue
        if ln == "else" or ln.startswith("else "):
            if depth == 0:
                raise MermaidError(f"line {n}: 'else' outside a block")
            continue
        if ln == "end":
            if depth == 0:
                raise MermaidError(f"line {n}: 'end' without an open block")
            depth -= 1
            if depth == 0:
                todos.append(
                    f"{block_header!s} block not converted "
                    f"({skipped_in_block} message(s) inside) — add by hand")
            continue
        p = RX_PARTICIPANT.match(ln)
        if p:
            if depth == 0:
                ensure(p.group(1), p.group(2))
            continue
        m = RX_MESSAGE.match(ln)
        if m:
            if depth > 0:
                skipped_in_block += 1
                continue
            frm = ensure(m.group(1))
            to = ensure(m.group(3))
            messages.append((frm, to, m.group(2) == "-->>", m.group(4)))
            continue
        raise MermaidError(
            f"line {n}: unsupported syntax {ln!r} — supported: participant, "
            "->> / -->> messages, autonumber, alt/opt/loop/par blocks, Note")

    if depth != 0:
        raise MermaidError("unclosed alt/opt/loop/par block")
    if not messages:
        raise MermaidError("no messages found outside alt/opt/loop/par blocks")
    return {"order": order, "titles": titles, "messages": messages, "todos": todos}


def convert(model, title):
    edges, edge_index = [], {}
    steps = []
    for frm, to, ret, text in model["messages"]:
        key = f"{frm}->{to}"
        if key not in edge_index:
            edge = {"from": frm, "to": to, "kind": infer_kind(text), "label": text}
            if ret:
                edge["ret"] = True
            edge_index[key] = edge
            edges.append(edge)
        steps.append({"edge": key, "text": text})

    order = model["order"]
    half = (len(order) + 1) // 2
    rows = [order[:half]]
    if order[half:]:
        rows.append(order[half:])

    nodes = {s: {"title": model["titles"][s], "sub": "", "icon": "gear", "tint": "cmd"}
             for s in order}
    return {
        "page": {
            "title": title,
            "sections": [{
                "heading": title,
                "text": ["Skeleton generated by mermaid2spec.py — enrich titles, "
                         "subs, icons, tints, protocols, and prose before use."],
                "diagram": {"view": "ambient", "nodes": nodes, "rows": rows,
                            "edges": edges, "steps": steps},
            }],
        },
        "todos": model["todos"],
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("input")
    ap.add_argument("-o", "--out", help="output file (default stdout)")
    ap.add_argument("--title", default="Converted sequence")
    args = ap.parse_args(argv)

    try:
        text = open(args.input).read()
        model = parse(extract_mermaid(text))
        spec = convert(model, args.title)
    except (OSError, MermaidError) as ex:
        print(f"mermaid2spec: error: {ex}", file=sys.stderr)
        return 1

    out = json.dumps(spec, indent=2)
    if args.out:
        open(args.out, "w").write(out + "\n")
    else:
        print(out)

    d = spec["page"]["sections"][0]["diagram"]
    print(f"mermaid2spec: {len(d['nodes'])} nodes, {len(d['edges'])} edges, "
          f"{len(d['steps'])} steps, {len(spec['todos'])} todo(s)", file=sys.stderr)
    for t in spec["todos"]:
        print(f"mermaid2spec: TODO: {t}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
