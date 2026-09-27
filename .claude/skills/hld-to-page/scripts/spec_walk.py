#!/usr/bin/env python3
"""Print every path of a Flowview spec as a step-by-step table for the
self-audit, and flag common storyboard slips.

Usage:
  python3 spec_walk.py <spec.json> [--catalog <catalog.json>]
                       [--rate <panel>[.<field>]=<min>:<max>] ... [--state]
                       [--expect <path>/<step>:<panel>.<key>[.<sub>]=<value>] ...
                       [--viz <VIZ checkout>]

  --catalog  the supplied Backstage catalog snapshot. Every binding's
             entityRef must be a catalog service; a given api.entityRef or
             api.operationId (and method/path) must belong to that service.
             Catalog services bound to no node are listed as a NOTE only.
  --rate     the allowed change per hour for a number, from the source, e.g.
             --rate batt=-1:4   (battery panel "batt": at most 1 point per
             hour down, 4 per hour up) or --rate app.battery=-1:4 (device-app
             field) or --rate therm=-20:16 (thermo panel "therm"). A battery
             panel's range that excludes zero (e.g. --rate batt=-4:-1) also
             makes a battery that never changes a WARN once the span requires
             at least one point of change.
             A battery panel may declare `node` (the diagram node whose
             battery it shows); a device-app battery card is then matched to
             it through the card's `source` and that source's `node`.
  --state    after each step, print the folded state of every panel (what the
             viewer sees). Read it at every state change.
  --expect   a checkable expectation from worksheet section I, tested against
             the folded state: path id (or * for every path that has the
             step), step id, panel id, then a dotted key. The value is JSON
             when it parses (23, true, null, "Open") and plain text otherwise.
             e.g. --expect 'offline/b-morning:phoneapp.door.value=Open'
  --viz      the VIZ checkout whose engine folds the spec. Default: the
             directory four levels above this script.

State comes from the real engine: scripts/fold_states.cjs loads the VIZ
validator and engine sources in Node and folds each path exactly as the
viewer does (notification stacks, enterOnce, step-local signals, whole-item
replacement). Node is required; there is no Python fallback fold.

For each diagram and path it prints, per step: the step id, the story clock,
the edges lit, the failures, each panel as P (patched) or . (holds), icon
patches, and code references. Then it prints every numeric change (battery,
temperature, device-app numbers) with the elapsed time and the rate per hour.

WARN lines state what the spec plus the command-line inputs prove wrong (a
written reason in the worksheet can still justify one). CHECK lines are
prompts to re-read a step, not defects. NOTE lines are information.

Story time: each clock panel's time is its `clock` plus its `date`. A date
change is measured in real days when both dates parse ("Thu, Sep 24",
"Mon Oct 5", "Oct 12", "24 Sep", "2026-09-24"; no year means the previous
date's year, and Nov/Dec to Jan/Feb rolls into the next year). When a date
change cannot be measured ("Mon" -> "Tue", "Day 2"), the interval across it
is unknown: no rate, no "no clock change" warning, and freshness checks do
not span it.

WARN (provable from the spec and the command-line inputs):
  - validator errors (fix these first)
  - a clock-bearing panel (phone, deviceapp, appscreens) whose clock goes
    backward
  - a number that changes faster than --rate allows
  - a battery panel that never changes over a span where a --rate for it
    that excludes zero requires at least one point of change
  - codeRefs: not a full SHA, bad anchors, or on steps but not on a node
  - bindings without entityRef; with --catalog, bindings that name a
    service, API or operation the catalog does not have
  - a failed --expect, or an --expect whose path/step does not exist
CHECK (re-read the step; not a defect by itself):
  - no clock on any declared phone/deviceapp/appscreens panel
  - one clock panel advancing while another stays put on a step
  - a number that changes with no time passing (the interval is known to be
    zero)
  - battery charge that rises while the battery was not charging
  - a device-app battery card that starts to differ from the battery panel
    (declared through the card's `source` and that source's `node`, or the
    sole battery panel) while its detail names no report time ("6:05 PM",
    "2 h ago")
  - relative freshness text left unchanged longer than it can be true:
    "just now", "now" or "1 min ago" for 15 min or more; "N min ago" or
    "N h ago" for two units or more (any rounding allowed). A step whose own
    patch assigns the detail, even to the same text, restarts the count
  - a battery panel that never changes over 2 h or more (without a --rate
    that proves it must)
  - a reported (device-app) value that changes, or a detail that turns
    "just now", when no delivered (lit, not failed) edge of the step is
    shown to carry it: with the field's `source` naming a device-app source
    that has a `node`, a delivered edge must touch that node (or the panel's
    own `node`); with only the panel's `node`, a delivered edge must end
    there; with neither declared, the route is unknown and it is always a
    CHECK (see the reported-state rule)
  - a reported value that changes while a detail stating its age or time
    ("5 min ago", "Last report 6:05 PM") stays the same; descriptive
    details ("Outdoor sensor") are not checked
  - a device node (tint "dev") that, in one step, sends through a declared
    intermediate r (a->r lit, r->b declared) and also straight to b (a->b)
  - a codeRef on a step whose own nodes, edges, failures and tone patch do
    not touch the owning node (a tone carried from an earlier step does not
    count)
  - scene 'static-noise' used while active or recording
  - response edges labeled like acknowledgements ("200", "202", "ack")
  - a step that lights nothing while its caption clearly describes a message
  - fields refreshed by one report where a sibling field kept older freshness
  - at a screen change to/from unavailable or boot, or a card turning
    stale/error: every carried device-app state text
  - a panel never patched on a path
NOTE:
  - more than one diagram (each starts from its own initial state)
  - a codeRef on a node but on no step; catalog services bound to no node
"""
import json
import os
import re
import shutil
import subprocess
import sys

CLOCK_PANELS = ("phone", "deviceapp", "appscreens")
# Only unambiguous "a message moves" verbs. Nouns ("report", "notification")
# and verbs with common non-message senses ("returns", "calls", "writes")
# are left out on purpose.
MESSAGE_VERBS = re.compile(
    r"\b(sends|publishes|posts|uploads|forwards|pushes|transmits|relays|"
    r"streams|delivers)\b", re.I)
FRESH = re.compile(r"\bago\b|just now", re.I)
JUST_NOW = re.compile(r"just now|updated now", re.I)
SAYS_WHEN = re.compile(r"\b\d{1,2}:\d{2}\b|\bago\b", re.I)
ACK_LABEL = re.compile(r"^\s*(\d{3}\b|ack\b|ok\b|accepted\b)", re.I)
STATE_WORDS = re.compile(r"\b(recording|paused|live|online|offline|connected|"
                         r"disconnected|shut ?down|booting|rebooting|normal|hot|"
                         r"overheat\w*|cooling|charging|armed|on|off)\b", re.I)
HERE = os.path.dirname(os.path.abspath(__file__))


def minutes(clock):
    m = re.match(r"\s*(\d{1,2}):(\d{2})\s*([AaPp][Mm])?", clock or "")
    if not m:
        return None
    h, mi, ap = int(m.group(1)), int(m.group(2)), (m.group(3) or "").lower()
    if ap == "pm" and h != 12:
        h += 12
    if ap == "am" and h == 12:
        h = 0
    return h * 60 + mi


def hm(mins):
    return "%dh%02d" % (mins // 60, mins % 60) if mins >= 60 else "%d min" % mins


def fold_spec(spec_path, viz):
    node = shutil.which("node")
    if not node:
        sys.exit("spec_walk: Node.js is required (the walk folds state with the real VIZ engine "
                 "through scripts/fold_states.cjs). Install node and retry; there is no Python fallback.")
    cmd = [node, os.path.join(HERE, "fold_states.cjs"), spec_path]
    if viz:
        cmd += ["--viz", viz]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("spec_walk: fold_states.cjs failed (%d):\n%s" % (r.returncode, r.stderr.strip()))
    return json.loads(r.stdout)


def numbers(pid, ptype, st, fields):
    """Numeric series to track: battery charge, thermo value, device-app numbers."""
    out = {}
    if ptype == "battery" and isinstance(st.get("charge"), (int, float)):
        out[pid] = st["charge"]
    elif ptype == "thermo" and isinstance(st.get("value"), (int, float)):
        out[pid] = st["value"]
    elif ptype == "deviceapp":
        for k in fields:
            v = st.get(k)
            if isinstance(v, dict) and isinstance(v.get("value"), (int, float)) \
                    and not isinstance(v.get("value"), bool):
                out["%s.%s" % (pid, k)] = v["value"]
    return out


def visible(st):
    return {k: v for k, v in (st or {}).items() if not k.startswith("_")}


def compact(v):
    if isinstance(v, dict):
        return "{" + ", ".join("%s:%s" % (k, compact(x)) for k, x in v.items()
                               if x is not None and not k.startswith("_")) + "}"
    if isinstance(v, list):
        return "[%d]" % len(v)
    return str(v)


MONTHS = {m: i + 1 for i, m in enumerate(
    ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"))}
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
_WD = r"(?:(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+)?"
DATE_MD = re.compile(_WD + r"([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?$")
DATE_DM = re.compile(_WD + r"(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]{3,9})\.?(?:,?\s+(\d{4}))?$")
DATE_ISO = re.compile(r"(\d{4})-(\d{1,2})-(\d{1,2})$")


def parse_date(text):
    """(year or None, month, day, weekday index or None) from a date label such
    as "Thu, Sep 24", "Mon Oct 5", "Oct 12", "24 Sep", "September 24, 2026" or
    "2026-09-24". None when the text is not a recognizable calendar date
    ("Mon", "Tomorrow", "Day 2"): the walk then treats the interval as unknown."""
    t = re.sub(r"\s+", " ", str(text or "").strip().lower())
    m = DATE_ISO.match(t)
    if m:
        y, mo, d, wd = int(m.group(1)), int(m.group(2)), int(m.group(3)), None
    else:
        m = DATE_MD.match(t)
        if m:
            wd, mon, d, y = m.group(1), m.group(2), int(m.group(3)), m.group(4)
        else:
            m = DATE_DM.match(t)
            if not m:
                return None
            wd, d, mon, y = m.group(1), int(m.group(2)), m.group(3), m.group(4)
        mo = MONTHS.get(mon[:3])
        if mo is None or (len(mon) > 3 and not _month_word(mon)):
            return None
        y = int(y) if y else None
        wd = WEEKDAYS.index(wd) if wd else None
    if not (1 <= mo <= 12 and 1 <= d <= 31):
        return None
    return (y, mo, d, wd)


def _month_word(word):
    full = ("january", "february", "march", "april", "may", "june", "july", "august",
            "september", "october", "november", "december")
    return any(f.startswith(word) for f in full) or word == "sept"


def date_ordinal(parsed, prev_ordinal=None, this_year=None):
    """Day number of a parsed date. A date without a year takes the year of
    the previous date (or, for the first date, the year nearest this year whose
    weekday matches, else this year). A Nov/Dec date followed by a Jan/Feb date
    rolls into the next year; any other earlier date stays earlier (the clock
    went backward). None when the date does not exist."""
    import datetime
    y, mo, d, wd = parsed

    def make(year):
        try:
            return datetime.date(year, mo, d)
        except ValueError:
            return None

    if y is not None:
        dt = make(y)
        return dt.toordinal() if dt else None
    this_year = this_year or datetime.date.today().year
    if prev_ordinal is not None:
        prev = datetime.date.fromordinal(prev_ordinal)
        dt = make(prev.year)
        if dt and dt < prev and prev.month >= 11 and mo <= 2:
            dt = make(prev.year + 1)
        return dt.toordinal() if dt else None
    years = sorted(range(this_year - 6, this_year + 7), key=lambda x: (abs(x - this_year), x))
    for year in years:
        dt = make(year)
        if dt and (wd is None or dt.weekday() == wd):
            return dt.toordinal()
    for year in years:  # weekday matches no nearby year: ignore it
        dt = make(year)
        if dt:
            return dt.toordinal()
    return None


def elapsed(t0, t1):
    """Minutes from t0 to t1, or None when either is unknown or they sit on
    either side of a date change the walk could not measure."""
    if t0 is None or t1 is None or t0[0] != t1[0]:
        return None
    return t1[1] - t0[1]


class Clock:
    """Per-panel story clock. `now` is (epoch, minutes) or None. Minutes count
    from the first date shown; a date change the walk can parse moves the day
    base by the real number of days. A date change it cannot parse starts a new
    epoch: times in different epochs are not comparable (elapsed unknown)."""

    def __init__(self):
        self.text, self.date, self.day_ord, self.base, self.epoch, self.now = None, None, None, 0, 0, None

    def update(self, st):
        c, d = st.get("clock"), st.get("date")
        prev = self.now
        changed = False
        if d and d != self.date:
            parsed = parse_date(d)
            o = date_ordinal(parsed, self.day_ord) if parsed else None
            if self.date is not None and o is not None and self.day_ord is not None:
                self.base += (o - self.day_ord) * 1440
            elif self.date is not None or self.now is not None:
                # the day changed (or a date first appeared under a running clock)
                # by an amount the walk cannot establish
                self.epoch += 1
                self.base = 0
            self.day_ord, self.date, changed = o, d, True
        if c and c != self.text:
            self.text, changed = c, True
        if changed:
            m = minutes(self.text)
            self.now = None if m is None else (self.epoch, self.base + m)
        return prev, self.now


def walk(dg, rates, show_state, warn, check, note, expects):
    d = dg["diagram"]
    panels = [p for p in d.get("panels", []) or [] if isinstance(p, dict) and p.get("id")]
    ptype = {p["id"]: p.get("type") for p in panels}
    fields = {p["id"]: [f.get("id") for f in p.get("fields", []) or [] if isinstance(f, dict)]
              for p in panels if p.get("type") == "deviceapp"}
    batt_fields = {pid: [f for f in p.get("fields", []) or [] if isinstance(f, dict) and f.get("kind") == "battery"
                         and f.get("id")]
                   for p in panels for pid in [p["id"]] if p.get("type") == "deviceapp"}
    field_decl = {p["id"]: {f.get("id"): f for f in p.get("fields", []) or [] if isinstance(f, dict)}
                  for p in panels if p.get("type") == "deviceapp"}
    source_node = {p["id"]: {s.get("id"): s.get("node") for s in p.get("sources", []) or []
                             if isinstance(s, dict) and s.get("id")}
                   for p in panels if p.get("type") == "deviceapp"}
    app_node = {p["id"]: p.get("node") for p in panels
                if p.get("type") == "deviceapp" and isinstance(p.get("node"), str) and p.get("node")}
    batt_panels = [p for p in panels if p.get("type") == "battery"]
    clock_panels = [pid for pid, t in ptype.items() if t in CLOCK_PANELS]
    nodes = d.get("nodes") or {}
    print("\n=== %s" % dg["name"])
    node_refs, step_refs, ref_owner = set(), set(), {}
    check_topology(d, check)
    for node_id, node in nodes.items():
        b = node.get("binding") if isinstance(node, dict) else None
        if isinstance(b, dict) and not b.get("entityRef"):
            warn("node %s binding has no entityRef (a binding names a catalog service)" % node_id)
        for ref in (node.get("codeRefs") if isinstance(node, dict) else None) or []:
            node_refs.add(ref.get("id"))
            ref_owner.setdefault(ref.get("id"), set()).add(node_id)
            check_ref("node " + node_id, ref, warn)
    if clock_panels:
        has_clock = any(dg["initial"].get(pid, {}).get("clock") for pid in clock_panels) or any(
            s["state"].get(pid, {}).get("clock") for path in dg["paths"] for s in path["steps"] for pid in clock_panels)
        if not has_clock:
            check("no clock on any %s panel (%s): story time is invisible" % (
                "/".join(sorted({ptype[p] for p in clock_panels})), ", ".join(clock_panels)))
    story_has_clock = False
    for path in dg["paths"]:
        seq = path["steps"]
        print("\n--- path %s  (panels: %s)" % (path["id"], " ".join(ptype)))
        print("  %-14s %-9s %-44s %-12s %s" % ("step", "clock", "edges", "panels", "icons / code"))
        state = {pid: dg["initial"].get(pid, {}) for pid in ptype}
        clocks = {pid: Clock() for pid in clock_panels}
        for pid in clock_panels:
            clocks[pid].update(state[pid])
        story_now = lambda: next((clocks[p].now for p in clock_panels if clocks[p].now is not None), None)
        now = story_now()
        last_num = {}
        for pid, t in ptype.items():
            for k, v in numbers(pid, t, state[pid], fields.get(pid, [])).items():
                last_num[k] = (now, v)
        # span: the story time the walk can measure on this path (a lower bound
        # when a date change could not be measured)
        span, touched, batt_changes, drift = 0, set(), 0, []
        batt_mismatch, lagging, fresh_flagged = set(), set(), set()
        fresh_since = {}   # (panel, field) -> (freshness text, panel time it was first shown)
        for pid in fields:
            for fk in fields[pid]:
                fv = state[pid].get(fk)
                det = fv.get("detail") if isinstance(fv, dict) else None
                if freshness_window(det) is not None:
                    fresh_since[(pid, fk)] = (det, clocks[pid].now)
        for idx, s in enumerate(seq):
            sid = s.get("id") or "step%d" % (idx + 1)
            pending = []

            def swarn(msg, _p=pending):
                _p.append(("WARN", msg))

            def scheck(msg, _p=pending):
                _p.append(("CHECK", msg))

            patches = s.get("patch") or {}
            prev_state, state = state, s["state"]
            prev_now = now
            marks, extras = [], []
            for pid in ptype:
                p = patches.get(pid)
                marks.append("P" if p else ".")
                if not p:
                    continue
                touched.add(pid)
                if isinstance(p, dict):
                    for key, val in p.items():
                        if isinstance(val, dict) and "icon" in val:
                            extras.append("%s.%s.icon=%s" % (pid, key, val["icon"]))
                if ptype[pid] == "battery" and isinstance(p, dict) and "charge" in p:
                    batt_changes += 1
            # per-panel clocks
            moved_by = {}
            for pid in clock_panels:
                c0 = clocks[pid].text
                before, after = clocks[pid].update(state[pid])
                el = elapsed(before, after)
                if el is not None and el < 0:
                    swarn("%s: %s clock goes backward (%s -> %s)" % (sid, pid, c0, clocks[pid].text))
                moved_by[pid] = el
            advanced = [p for p, el in moved_by.items() if el is not None and el > 0]
            held = [p for p, el in moved_by.items() if el is not None and el == 0]
            if not held:
                lagging.clear()
            if advanced and held and not set(held) <= lagging:
                lagging.update(held)
                scheck("%s: %s clock moved to %s but %s still shows %s; every clock-bearing panel shows the same story time" % (
                    sid, "/".join(advanced), clocks[advanced[0]].text, "/".join(held),
                    ", ".join(str(clocks[p].text) for p in held)))
            now = story_now()
            clock_txt = next((clocks[p].text for p in clock_panels if clocks[p].now is not None), "") or ""
            if now is not None:
                story_has_clock = True
            step_el = elapsed(prev_now, now)
            if step_el and step_el > 0:
                span += step_el
            # numbers: jumps, rates, charging
            for pid, t in ptype.items():
                for key, v in numbers(pid, t, state[pid], fields.get(pid, [])).items():
                    t0, v0 = last_num.get(key, (None, None))
                    last_num[key] = (now, v)
                    if v0 is None or v == v0:
                        continue
                    el = elapsed(t0, now)
                    rate = None if not el else (v - v0) * 60.0 / el
                    drift.append("%s %s: %s -> %s over %s%s" % (
                        sid, key, v0, v,
                        hm(el) if el else ("0 min" if el == 0 else
                                           "(no clock)" if now is None else "an unknown interval"),
                        "" if rate is None else " = %+.1f/h" % rate))
                    if el == 0:
                        scheck("%s: %s changes %s -> %s with no clock change" % (sid, key, v0, v))
                    lim = rates.get(key)
                    if lim and rate is not None and not (lim[0] <= rate <= lim[1]):
                        swarn("%s: %s rate %+.1f/h is outside the stated %g..%g/h" % (sid, key, rate, lim[0], lim[1]))
                    if t == "battery" and v > v0 and state[pid].get("trend") != "charging" \
                            and prev_state[pid].get("trend") != "charging":
                        scheck("%s: %s charge rises %s -> %s but the trend is not charging before or at this "
                               "step; check that charging started earlier in the interval" % (sid, key, v0, v))
            # device-app battery card vs battery panel: CHECK when a mismatch starts
            # (an older report can be right). The pair is the one the spec declares
            # (card source's node == battery panel's node), else the sole battery
            # panel, and the message says the link is undeclared.
            for ap, fdecls in batt_fields.items():
                for fdecl in fdecls:
                    f = fdecl["id"]
                    card = state[ap].get(f) if isinstance(state[ap].get(f), dict) else {}
                    v, det = card.get("value"), str(card.get("detail") or "")
                    src = card.get("source") or fdecl.get("source")
                    cnode = source_node.get(ap, {}).get(src) if src else None
                    bp, proven = battery_for_card(cnode, batt_panels)
                    bval = numbers(bp["id"], "battery", state[bp["id"]], []).get(bp["id"]) if bp else None
                    key = (ap, f)
                    if bval is not None and isinstance(v, (int, float)) and not isinstance(v, bool) and v != bval:
                        # an older report is fine when the card's detail says when it was
                        if key not in batt_mismatch and not SAYS_WHEN.search(det):
                            msg = ("%s: %s.%s shows %s but battery panel %s shows %s (fine only if the app shows "
                                   "an older report and its detail says when)" % (sid, ap, f, v, bp["id"], bval))
                            if proven:
                                scheck(msg)
                            else:
                                scheck(msg + "; the spec does not declare that they are the same battery (a "
                                       "card source with a node, and that node on the battery panel, would)")
                        batt_mismatch.add(key)
                    else:
                        batt_mismatch.discard(key)
            fails = s.get("failures") or {}
            delivered = [str(e) for e in s.get("edges") or [] if e not in fails]
            ends = [tuple(x.strip() for x in e.split("->", 1)) for e in delivered if "->" in e]
            # only this step's own activity: tones carried from earlier steps do not count
            involved = set(s.get("nodes") or []) | set((s.get("tonePatch") or {}).keys())
            for e in list(s.get("edges") or []) + list(fails):
                involved.update(x.strip() for x in str(e).split("->"))
            for pid, t in ptype.items():
                if t != "deviceapp":
                    continue
                pel = moved_by.get(pid)
                pmoved = pel is not None and pel >= 5
                fresh_now = []   # fields whose detail turned "just now" here
                ppatch = patches.get(pid) if isinstance(patches.get(pid), dict) else {}
                for fk in fields.get(pid, []):
                    fv, old = state[pid].get(fk), prev_state[pid].get(fk)
                    if not isinstance(fv, dict):
                        continue
                    old = old if isinstance(old, dict) else {}
                    det, odet = fv.get("detail"), old.get("detail")
                    fpatch = ppatch.get(fk)
                    # this step's own patch assigns the detail (even to the same text): a new report
                    redetailed = isinstance(fpatch, dict) and "detail" in fpatch
                    # freshness text left on screen longer than it can stay true
                    win = freshness_window(det)
                    if win is None:
                        fresh_since.pop((pid, fk), None)
                    elif redetailed or (fresh_since.get((pid, fk)) or (None,))[0] != det:
                        fresh_since[(pid, fk)] = (det, clocks[pid].now)
                        fresh_flagged.discard((pid, fk, det))
                    else:
                        shown = elapsed(fresh_since[(pid, fk)][1], clocks[pid].now)
                        if shown is not None and shown >= win and (pid, fk, det) not in fresh_flagged:
                            fresh_flagged.add((pid, fk, det))
                            scheck("%s: %s.%s.detail %r has been shown unchanged for %s; that text stays "
                                  "true for less than %s of story time, so rewrite it" % (
                                      sid, pid, fk, det, hm(shown), hm(win)))
                    v, v0 = fv.get("value"), old.get("value")
                    src = fv.get("source") or (field_decl.get(pid, {}).get(fk) or {}).get("source")
                    gap = route_gap(delivered, ends, source_node.get(pid, {}).get(src) if src else None,
                                    app_node.get(pid))
                    if v != v0 and "value" in old and gap:
                        scheck("%s: %s.%s reported value %r -> %r but %s. A reported card advances only when "
                               "its report's delivery path is lit, or when the source says reports succeed on "
                               "that cadence and nothing in the story (outage, offline) stops them: then show the "
                               "latest scheduled report as illustrative and name its time in the detail" % (
                                   sid, pid, fk, v0, v, gap))
                    # a descriptive detail ("Outdoor sensor") need not change with the value; a report
                    # age or time does
                    if v != v0 and "value" in old and odet and det == odet and says_age(odet) \
                            and not (pmoved and FRESH.search(odet)):
                        scheck("%s: %s.%s value %r -> %r but detail %r was not rewritten" % (sid, pid, fk, v0, v, det))
                    if isinstance(det, str) and JUST_NOW.search(det) and det != odet:
                        fresh_now.append(fk)
                        if gap:
                            scheck("%s: %s.%s.detail says %r but %s (no report shown arriving)" % (
                                sid, pid, fk, det, gap))
                # one report refreshed a field; a sibling that shared its freshness kept older text
                for fk in fresh_now:
                    odet = (prev_state[pid].get(fk) or {}).get("detail") if isinstance(prev_state[pid].get(fk), dict) else None
                    if not odet:
                        continue
                    for other in fields.get(pid, []):
                        if other == fk or other in fresh_now:
                            continue
                        o0 = prev_state[pid].get(other)
                        o1 = state[pid].get(other)
                        if isinstance(o0, dict) and isinstance(o1, dict) and o0.get("detail") == odet \
                                and not JUST_NOW.search(o1.get("detail") or ""):
                            scheck("%s: %s.%s turned %r but %s.%s, which shared its freshness (%r), now says %r. "
                                   "If the same report carries %s, refresh it too" % (
                                       sid, pid, fk, state[pid][fk].get("detail"), pid, other, odet,
                                       o1.get("detail"), other))
            # transition: something changed state; list carried state-like card texts
            changed_state = []
            for pid, t in ptype.items():
                m0, m1 = prev_state[pid].get("mode"), state[pid].get("mode")
                if t == "screen" and m0 != m1 and {m0, m1} & {"unavailable", "boot"}:
                    changed_state.append("%s.mode %s->%s" % (pid, m0, m1))
                if t == "deviceapp":
                    for fk in fields.get(pid, []):
                        fv, old = state[pid].get(fk), prev_state[pid].get(fk)
                        if isinstance(fv, dict) and isinstance(old, dict) and fv.get("status") != old.get("status") \
                                and {fv.get("status"), old.get("status")} & {"stale", "error"}:
                            changed_state.append("%s.%s.status %s->%s" % (pid, fk, old.get("status"), fv.get("status")))
            if changed_state:
                for pid, t in ptype.items():
                    if t != "deviceapp":
                        continue
                    for fk in fields.get(pid, []):
                        fv = state[pid].get(fk)
                        if isinstance(fv, dict) and fv == prev_state[pid].get(fk) \
                                and isinstance(fv.get("value"), str) and STATE_WORDS.search(fv["value"]):
                            scheck("%s: %s; %s.%s still says %r (carried). Still true? Rewrite it if not" % (
                                sid, ", ".join(changed_state), pid, fk, fv["value"]))
            # direct edge that bypasses a declared intermediate
            lit = set(str(e) for e in s.get("edges") or [])
            for e in sorted(lit):
                a, _, b = e.partition("->")
                if (nodes.get(a) or {}).get("tint") != "dev" or (nodes.get(b) or {}).get("tint") == "dev":
                    continue  # the relay check is about a device's route to a non-device destination
                for r in bypassed(d, a, b):
                    # the intermediate sits on the device side (a hub, router or bridge)
                    if (nodes.get(r) or {}).get("tint") == "dev" and "%s->%s" % (a, r) in lit:
                        scheck("%s: device %s sends through %s (%s->%s) and also straight to %s (%s) in the "
                              "same step; the spec routes %s->%s->%s, so drop the direct hop or say why it "
                              "exists" % (sid, a, r, a, r, b, e, a, r, b))
            for ref in s.get("codeRefs") or []:
                step_refs.add(ref.get("id"))
                extras.append("code:" + str(ref.get("id")))
                check_ref("step " + str(sid), ref, warn)
                owners = ref_owner.get(ref.get("id")) or set()
                if owners and not (owners & involved):
                    scheck("%s: codeRef %s belongs to %s, which no edge, failure or tone in this step "
                          "touches; attach it to a step only when that code runs there" % (
                              sid, ref.get("id"), "/".join(sorted(owners))))
            cap = s.get("caption") or ""
            if not s.get("edges") and not fails and MESSAGE_VERBS.search(cap):
                scheck("%s: no edges lit, but the caption says %r; light each hop it claims, or reword"
                       % (sid, MESSAGE_VERBS.search(cap).group(0)))
            for (ep, estep, epid, ekey, eval_) in expects:
                if estep == sid and ep in ("*", path["id"]):
                    got = state.get(epid)
                    for part in ekey:
                        got = got.get(part) if isinstance(got, dict) else None
                    ok = got == eval_
                    pending.append(("EXPECT", "EXPECT %s %s/%s:%s.%s = %s%s" % (
                        "ok  " if ok else "FAIL", path["id"], sid, epid, ".".join(ekey), json.dumps(eval_),
                        "" if ok else " (got %s)" % json.dumps(got))))
                    if not ok:
                        pending.append(("WARN", "expectation failed: %s/%s:%s.%s = %s, got %s" % (
                            path["id"], sid, epid, ".".join(ekey), json.dumps(eval_), json.dumps(got))))
                    expects_seen.add((ep, estep, epid, tuple(ekey)))
            etxt = ", ".join(s.get("edges") or []) + ("" if not fails else "  X " + ", ".join("%s:%s" % kv for kv in fails.items()))
            print("  %-14s %-9s %-44s %-12s %s" % (sid, clock_txt or "-", etxt or "(no edge)", "".join(marks), "; ".join(extras)))
            for kind, msg in pending:
                if kind == "EXPECT":
                    print("  " + msg)
                else:
                    (warn if kind == "WARN" else check)(msg)
            if show_state:
                for pid in ptype:
                    changed = visible(state[pid]) != visible(prev_state[pid])
                    print("      %s %-8s %s" % ("*" if changed else " ", pid, compact(state[pid])[:400]))
        for pid in ptype:
            if pid not in touched:
                check("panel %s is never patched on path %s (holds everywhere? give each step a holds: reason)" % (pid, path["id"]))
        for pid, t in ptype.items():
            if t != "battery" or batt_changes or span <= 0:
                continue
            lim = rates.get(pid)
            # the smallest change the stated rate allows over the span
            least = 0 if not lim or lim[0] <= 0 <= lim[1] else min(abs(lim[0]), abs(lim[1])) * span / 60.0
            if least >= 1:
                warn("battery panel %s never changes over %s on path %s, but --rate %s=%g:%g requires at "
                     "least %.1f points of change" % (pid, hm(span), path["id"], pid, lim[0], lim[1], least))
            elif span >= 120:
                check("battery panel %s never changes over %s on path %s: right if the source says it is idle "
                      "or drifts less than a point; otherwise add drift (pass --rate to test it)" % (
                          pid, hm(span), path["id"]))
        if drift:
            print("  numeric changes (compare each rate with the source's stated rate):")
            for line in drift:
                print("    " + line)
    for pnl in panels:
        if pnl.get("type") == "screen" and pnl.get("scene") == "static-noise":
            modes = {st["state"].get(pnl["id"], {}).get("mode") for p in dg["paths"] for st in p["steps"]}
            modes.add(dg["initial"].get(pnl["id"], {}).get("mode"))
            if modes & {"active", "live", "rec", "save"}:
                check("screen %s uses scene 'static-noise' (a test pattern) while active/recording; "
                     "pick a scene that fits the story, or drop the screen" % pnl["id"])
    for r in sorted(x for x in step_refs - node_refs if x):
        warn("codeRef %s is on steps but on no node; attach it to the owning node too" % r)
    for r in sorted(x for x in node_refs - step_refs if x):
        note("codeRef %s is on its node but on no step: correct only if that code never "
             "runs in this story (say so in worksheet section H)" % r)


expects_seen = set()

NOWISH = re.compile(r"\bjust now\b|\bupdated now\b|\bmoments? ago\b|(?:^|[\u00b7:,-]\s*)now\s*$", re.I)
AGO = re.compile(r"\b(\d+)\s*(m|mins?|minutes?|h|hrs?|hours?|d|days?)\s+ago\b", re.I)
NOWISH_MINUTES = 15


def freshness_window(detail):
    """How long (minutes of story time) a relative-age text can stay on
    screen unchanged and still be true, or None when the text states no age.
    "just now", "now" and "1 min ago" are true for under 15 minutes. "N min
    ago" or "N h ago" allows any rounding: the real age lies in [N-1, N+1)
    units, so the text can stay unchanged for less than two units."""
    if not isinstance(detail, str):
        return None
    if NOWISH.search(detail):
        return NOWISH_MINUTES
    m = AGO.search(detail)
    if not m:
        return None
    n, unit = int(m.group(1)), m.group(2).lower()
    per = 1440 if unit.startswith("d") else 60 if unit.startswith("h") else 1
    if n * per <= 1:
        return NOWISH_MINUTES
    return 2 * per


TIME_OF_DAY = re.compile(r"\b\d{1,2}:\d{2}\b")


def says_age(detail):
    """True when a detail states a report age or time ("just now", "5 min ago",
    "Last report 6:05 PM"), i.e. text that goes out of date when a new value
    arrives. Descriptive text ("Outdoor sensor") does not."""
    return isinstance(detail, str) and bool(
        freshness_window(detail) is not None or FRESH.search(detail) or TIME_OF_DAY.search(detail))


def route_gap(delivered, ends, source_node, panel_node):
    """None when a delivered (lit, not failed) edge of this step can carry a
    device-app field's change, else the reason it cannot be shown to.
    `ends` holds (from, to) for each delivered edge. A field whose source
    declares a `node` needs a delivered edge touching that node or the
    panel's own `node`. With only the panel's `node` declared, a delivered
    edge must end there. With nothing declared the route is unknown."""
    if not delivered:
        return "this step delivers no edge"
    if source_node:
        near = {source_node} | ({panel_node} if panel_node else set())
        if any(a in near or b in near for a, b in ends):
            return None
        return "no delivered edge in this step touches its source node %s%s" % (
            source_node, " or the panel's node %s" % panel_node if panel_node else "")
    if panel_node:
        if any(b == panel_node for _, b in ends):
            return None
        return "no delivered edge in this step ends at the panel's node %s" % panel_node
    return ("the spec declares no route for it (no field source with a node, no panel node), so the "
            "walk cannot tell whether this step's delivered edges (%s) carry it" % ", ".join(delivered))


def battery_for_card(card_node, batt_panels):
    """(battery panel, proven) for a device-app battery card. Proven when the
    card's source names a node and a battery panel declares that `node`. With
    no declared link on either side, a sole battery panel is a candidate only
    (not proven). A declared link to a different node rules the panel out."""
    if card_node:
        for bp in batt_panels:
            if bp.get("node") == card_node:
                return bp, True
    if len(batt_panels) == 1 and not (card_node and batt_panels[0].get("node")):
        return batt_panels[0], False
    return None, False


def bypassed(d, a, b):
    """Declared nodes r with a->r and r->b (forward edges) when a->b is declared too."""
    fwd = {(e.get("from"), e.get("to")) for e in d.get("edges") or [] if isinstance(e, dict) and not e.get("ret")}
    if (a, b) not in fwd:
        return []
    return sorted(r for (x, r) in fwd if x == a and r != b and (r, b) in fwd)


def check_topology(d, check):
    """Acknowledgement-style response edges: the spec cannot show whether the source supports them."""
    for e in d.get("edges") or []:
        if isinstance(e, dict) and e.get("ret") and ACK_LABEL.search(str(e.get("label") or "")):
            check("response edge %s->%s %r: keep it only if the source or code shows this response" % (
                e.get("from"), e.get("to"), e.get("label")))


def check_ref(where, ref, warn):
    rev = str(ref.get("revision", ""))
    if not re.fullmatch(r"[0-9a-fA-F]{40,64}", rev):
        warn("%s codeRef %s revision is not a full immutable commit SHA (40-64 hex characters)" % (where, ref.get("id")))
    a = ref.get("anchor") or {}
    if not a.get("start") or not a.get("end") or a.get("start") == a.get("end"):
        warn("%s codeRef %s needs distinct start/end anchors" % (where, ref.get("id")))


def check_catalog(path, all_diagrams, warn, note):
    cat = json.load(open(path))
    services = {s.get("entityRef"): s for s in cat.get("services", []) if isinstance(s, dict)}
    bound = set()
    for dg in all_diagrams:
        for nid, node in (dg["diagram"].get("nodes") or {}).items():
            b = node.get("binding") if isinstance(node, dict) else None
            if not isinstance(b, dict) or not b.get("entityRef"):
                continue
            ref = b["entityRef"]
            bound.add(ref)
            svc = services.get(ref)
            if svc is None:
                warn("node %s binding %s is not a service in the catalog" % (nid, ref))
                continue
            api = b.get("api")
            if not isinstance(api, dict) or not api:
                continue  # api is optional in the binding contract
            apis = [x for x in svc.get("apis", []) or [] if isinstance(x, dict)]
            if api.get("entityRef"):
                apis_named = [x for x in apis if x.get("entityRef") == api["entityRef"]]
                if not apis_named:
                    warn("node %s binding api %s is not an API of %s (catalog has: %s)" % (
                        nid, api["entityRef"], ref, ", ".join(str(x.get("entityRef")) for x in apis) or "none"))
                    continue
                apis = apis_named
            if api.get("operationId"):
                ops = [o for x in apis for o in x.get("operations", []) or [] if isinstance(o, dict)]
                match = [o for o in ops if o.get("operationId") == api["operationId"]]
                if not match:
                    warn("node %s binding operation %s is not under %s (catalog has: %s)" % (
                        nid, api["operationId"], ref,
                        ", ".join("%s %s %s" % (o.get("operationId"), o.get("method"), o.get("path")) for o in ops) or "none"))
                else:
                    o = match[0]
                    for k in ("method", "path"):
                        a_v, c_v = str(api.get(k) or ""), str(o.get(k) or "")
                        if k == "method":
                            a_v, c_v = a_v.upper(), c_v.upper()
                        if api.get(k) and o.get(k) and a_v != c_v:
                            warn("node %s binding operation %s: %s %r differs from the catalog's %r" % (
                                nid, api["operationId"], k, api[k], o[k]))
    unbound = sorted(r for r in services if r not in bound)
    if unbound:
        note("catalog services bound to no node (fine if they are not in this story): %s" % ", ".join(unbound))


def parse_expect(text):
    m = re.match(r"^([^/]+)/([^:]+):([^.=]+)\.([^=]+)=(.*)$", text)
    if not m:
        sys.exit("spec_walk: bad --expect %r; use <path>/<step>:<panel>.<key>[.<sub>]=<value>" % text)
    raw = m.group(5)
    try:
        val = json.loads(raw)
    except ValueError:
        val = raw
    return (m.group(1), m.group(2), m.group(3), m.group(4).split("."), val)


def main():
    args = sys.argv[1:]
    if not args or args[0] in ("-h", "--help"):
        print(__doc__)
        sys.exit(0 if args else 2)
    spec_path, catalog, rates, show_state, viz, expects = None, None, {}, False, None, []
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--catalog":
            catalog = args[i + 1]; i += 2; continue
        if a == "--rate":
            key, rng = args[i + 1].split("=")
            lo, hi = rng.split(":")
            rates[key] = (float(lo), float(hi)); i += 2; continue
        if a == "--state":
            show_state = True; i += 1; continue
        if a == "--viz":
            viz = args[i + 1]; i += 2; continue
        if a == "--expect":
            expects.append(parse_expect(args[i + 1])); i += 2; continue
        spec_path = a; i += 1
    if not spec_path:
        sys.exit("spec_walk: no spec given")
    warnings, checks = [], []

    def warn(msg):
        if msg not in warnings:  # shared steps repeat on every path
            warnings.append(msg)
            print("  WARN " + msg)

    def check(msg):
        if msg not in checks:
            checks.append(msg)
            print("  CHECK " + msg)

    def note(msg):
        print("  NOTE " + msg)

    folded = fold_spec(spec_path, viz)
    for e in folded["validation"]["errors"]:
        warn("validator error: " + e)
    all_d = folded["diagrams"]
    if len(all_d) > 1:
        note("%d diagrams on this page; each starts from its own initial state, so state does not carry "
             "between them" % len(all_d))
    for dg in all_d:
        walk(dg, rates, show_state, warn, check, note, expects)
    for (ep, estep, epid, ekey, eval_) in expects:
        if (ep, estep, epid, tuple(ekey)) not in expects_seen:
            warn("expectation never tested: no path %s has step %s" % (ep, estep))
    if catalog:
        print("\n=== catalog")
        check_catalog(catalog, all_d, warn, note)
    print("\n%d warning(s), %d check(s)" % (len(warnings), len(checks)))


if __name__ == "__main__":
    main()
