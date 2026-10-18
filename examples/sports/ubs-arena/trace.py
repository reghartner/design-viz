#!/usr/bin/env python3
"""Draw the UBS Arena (Elmont, NY) hockey sections as original polygons.

Record of how examples/sports/ubs-arena/arena.svg was made; the venue library
entry src/panels/venues/ubs-arena.js is generated from that SVG by
tools/seatmap-import.mjs (see cookbook/venue-map.md).

positions.json holds [id, x, y, w, h] boxes read off a public seating chart;
only each section's centre angle and ring are used, so no chart artwork is
copied. Each ring is one band between two rounded rectangles
(superellipses); the band is split between neighbouring sections at the
midpoint of their centre angles. A rink outline (<rect id="rink-outline">,
200 × 85 ft proportions with 28 ft corners) is added.

Section order, ring and zone come from examples/sports/arena-sections.csv
(section numbering from public seating guides), so the importer's even
capacity split gives every section the same capacity as the CSV import.
Each ring's polygons sit in a <g id="<ring id>"> group that the importer's
--level-map names.

  python3 examples/sports/ubs-arena/trace.py [output.svg]   # default: arena.svg beside this file
"""
import csv
import json
import math
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
CSV = HERE.parent / "arena-sections.csv"
CX, CY, N = 560.0, 402.0, 4.0
RING = {  # inner (a, b), outer (a, b): half-extents measured from the chart
    1: ((205, 123), (330, 227)),
    2: ((355, 272), (421, 312)),
    3: ((428, 328), (491, 386)),
}


def sp(t, a, b):
    c, s = math.cos(t), math.sin(t)
    r = 1 / ((abs(c) / a) ** N + (abs(s) / b) ** N) ** (1 / N)
    return (CX + r * c, CY + r * s)


def band(t0, t1, ring):
    (ai, bi), (ao, bo) = RING[ring]
    k = max(4, int(abs(t1 - t0) / 0.03))
    outer = [sp(t0 + (t1 - t0) * i / k, ao, bo) for i in range(k + 1)]
    inner = [sp(t1 - (t1 - t0) * i / k, ai, bi) for i in range(k + 1)]
    return outer + inner


def main():
    pos = json.loads((HERE / "positions.json").read_text())
    rows = list(csv.DictReader(CSV.open()))
    levels = list(dict.fromkeys(row["level"] for row in rows))
    ring_of = {row["id"]: levels.index(row["level"]) + 1 for row in rows}
    assert set(ring_of) == {p[0] for p in pos}, "positions.json and arena-sections.csv must list the same sections"
    polys = {}
    for ring in RING:
        angles = sorted(((math.atan2(y + h / 2 - CY, x + w / 2 - CX) % (2 * math.pi), sid)
                         for sid, x, y, w, h in pos if ring_of[sid] == ring))
        n = len(angles)
        for i, (t, sid) in enumerate(angles):
            tp = angles[i - 1][0]
            tn = angles[(i + 1) % n][0]
            dp = (t - tp) % (2 * math.pi)
            dn = (tn - t) % (2 * math.pi)
            typical = 2 * math.pi / n
            half_p = dp / 2 if dp < 2.2 * typical else min(dn / 2, typical / 2)
            half_n = dn / 2 if dn < 2.2 * typical else min(dp / 2, typical / 2)
            gap = 0.012 if ring == 1 else 0.008
            polys[sid] = band(t - half_p + gap, t + half_n - gap, ring)
    rw = 340
    rh = rw * 85 / 200
    rr = rw * 28 / 200
    pts = [p for v in polys.values() for p in v]
    pad = 10
    x0 = min(p[0] for p in pts) - pad
    y0 = min(p[1] for p in pts) - pad
    x1 = max(p[0] for p in pts) + pad
    y1 = max(p[1] for p in pts) + pad
    groups = []
    for index, level in enumerate(levels):
        body = "\n".join(
            f'<polygon id="{row["id"]}" data-zone="{row["zone"]}" points="'
            + " ".join(f"{x:.1f},{y:.1f}" for x, y in polys[row["id"]]) + '"/>'
            for row in rows if row["level"] == level)
        groups.append(f'<g id="{level.replace(" ", "-")}">\n{body}\n</g>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{x0:.0f} {y0:.0f} {x1-x0:.0f} {y1-y0:.0f}">\n'
           + "\n".join(groups) + "\n"
           f'<rect id="rink-outline" x="{CX-rw/2:.1f}" y="{CY-rh/2:.1f}" width="{rw}" height="{rh:.1f}" rx="{rr:.1f}"/>\n</svg>\n')
    out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "arena.svg"
    out.write_text(svg)
    print(len(polys), "sections")


if __name__ == "__main__":
    main()
