#!/usr/bin/env python3
"""Regression tests for spec_walk.py. Run with plain python3:

  python3 .claude/skills/hld-to-page/scripts/test_spec_walk.py

Each walk test writes a small spec to a temporary directory, checks that the
repository validator accepts it with no errors or warnings, runs the walker
(which folds state with the real engine through fold_states.cjs, so Node is
required) and asserts on its WARN / CHECK lines.
"""
import copy
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
VIZ = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
sys.path.insert(0, HERE)
import spec_walk  # noqa: E402

REF = {
    "id": "svc.handler", "label": "handler",
    "repository": "https://github.com/example/svc", "path": "src/handler.ts",
    "revision": "1111111111111111111111111111111111111111",
    "anchor": {"start": "// flow:handler:start", "end": "// flow:handler:end"},
}


def page(diagram):
    base = {
        "view": "step",
        "nodes": {
            "cam": {"title": "Camera", "icon": "camera", "tint": "dev"},
            "svc": {"title": "Service", "icon": "server", "tint": "cmd"},
            "app": {"title": "App", "icon": "phone", "tint": "dev"},
        },
        "rows": [["cam", "svc", "app"]],
        "edges": [
            {"from": "cam", "to": "svc", "kind": "https", "label": "report"},
            {"from": "svc", "to": "app", "kind": "https", "label": "push"},
        ],
    }
    base.update(diagram)
    return {"page": {"title": "Walk fixture", "contract": "1", "blocks": [
        {"id": "fixture", "heading": "Walk fixture", "diagram": base}]}}


def app_panel(initial, fields=None, sources=None):
    p = {"id": "phone", "type": "deviceapp", "title": "Phone", "device": "Camera",
         "fields": fields or [{"id": "clip", "label": "Last clip", "icon": "camera"}],
         "initial": initial}
    if sources is not None:
        p["sources"] = sources
    return p


def batt_panel(charge=50, node=None):
    p = {"id": "batt", "type": "battery", "title": "Camera battery", "low": 20, "crit": 10,
         "initial": {"charge": charge, "source": "cells", "trend": "draining"}}
    if node:
        p["node"] = node
    return p


def step(sid, phone=None, batt=None, **extra):
    s = {"id": sid, "text": "Step %s." % sid}
    panels = {}
    if phone is not None:
        panels["phone"] = phone
    if batt is not None:
        panels["batt"] = batt
    if panels:
        s["panels"] = panels
    s.update(extra)
    return s


class Walk:
    def __init__(self, out):
        self.out = out
        self.warns = [l[7:] for l in out.splitlines() if l.startswith("  WARN ")]
        self.checks = [l[8:] for l in out.splitlines() if l.startswith("  CHECK ")]

    def warned(self, text):
        return any(text in w for w in self.warns)

    def checked(self, text):
        return any(text in c for c in self.checks)


class WalkTest(unittest.TestCase):
    tmp = None

    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="spec_walk_test_")

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.tmp, ignore_errors=True)

    def walk(self, spec, *args, clean=True):
        path = os.path.join(self.tmp, "%s.spec.json" % self.id().split(".")[-1])
        with open(path, "w") as fh:
            json.dump(spec, fh)
        v = subprocess.run(["node", os.path.join(VIZ, "tools", "validate.js"), path],
                           capture_output=True, text=True)
        self.assertEqual(v.returncode, 0, v.stdout + v.stderr)
        lines = v.stdout.strip().splitlines()
        if clean:
            self.assertTrue(len(lines) == 1 and lines[0].endswith(": 0 errors, 0 warnings"),
                            "fixture must validate cleanly:\n" + v.stdout)
        r = subprocess.run([sys.executable, os.path.join(HERE, "spec_walk.py"), path] + list(args),
                           capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        return Walk(r.stdout)

    # ---- finding 1: dates -------------------------------------------------

    def test_multi_day_date_delta_sets_elapsed_time(self):
        spec = page({"panels": [app_panel({"clock": "9:00 AM", "date": "Mon, Oct 5"}), batt_panel(50)],
                     "steps": [step("tue", phone={"clock": "9:00 AM", "date": "Tue, Oct 6"}, batt={"charge": 48}),
                               step("fri", phone={"clock": "9:00 AM", "date": "Fri, Oct 9"}, batt={"charge": 42})]})
        w = self.walk(spec, "--rate", "batt=-1:0")
        self.assertIn("tue batt: 50 -> 48 over 24h00", w.out)
        self.assertIn("fri batt: 48 -> 42 over 72h00", w.out)
        self.assertFalse(w.warned("no clock change"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_same_clock_next_day_is_not_zero_elapsed(self):
        spec = page({"panels": [app_panel({"clock": "9:00 AM", "date": "Sat, Oct 17"}), batt_panel(50)],
                     "steps": [step("next", phone={"date": "Oct 18"}, batt={"charge": 49})]})
        w = self.walk(spec)
        self.assertIn("next batt: 50 -> 49 over 24h00", w.out)
        self.assertFalse(w.warned("no clock change"), w.out)

    def test_unknown_date_format_makes_interval_unknown(self):
        spec = page({"panels": [app_panel({"clock": "9:00 AM", "date": "Mon"}), batt_panel(50)],
                     "steps": [step("tue", phone={"date": "Tue"}, batt={"charge": 45})]})
        w = self.walk(spec, "--rate", "batt=-0.1:0")
        self.assertIn("tue batt: 50 -> 45 over an unknown interval", w.out)
        self.assertFalse(w.warned("no clock change"), w.out)
        self.assertFalse(w.warned("rate"), w.out)

    def test_date_parsing_and_rollover(self):
        p = spec_walk.parse_date
        for text in ("Thu, Sep 24", "Mon Oct 5", "Oct 12", "Sat, Oct 17", "24 Sep", "September 24, 2026",
                     "2026-09-24", "Sept 24"):
            self.assertIsNotNone(p(text), text)
        for text in ("Mon", "Tomorrow", "Day 2", "", "Monday 5"):
            self.assertIsNone(p(text), text)
        o = lambda t, prev=None: spec_walk.date_ordinal(p(t), prev, this_year=2026)
        self.assertEqual(o("Oct 12", o("Mon Oct 5")) - o("Mon Oct 5"), 7)
        self.assertEqual(o("Jan 1", o("Dec 31")) - o("Dec 31"), 1)          # year rollover
        self.assertEqual(o("Oct 5", o("Oct 12")) - o("Oct 12"), -7)         # backward, not a year later
        self.assertEqual(o("Mar 1", o("Feb 28, 2028")) - o("Feb 28, 2028"), 2)  # leap year

    def test_clock_tracks_date_changes(self):
        c = spec_walk.Clock()
        c.update({"clock": "11:00 PM", "date": "Dec 31"})
        before, after = c.update({"clock": "1:00 AM", "date": "Jan 1"})
        self.assertEqual(spec_walk.elapsed(before, after), 120)
        before, after = c.update({"date": "Tue"})
        self.assertIsNone(spec_walk.elapsed(before, after))

    # ---- finding 2b: freshness text -------------------------------------

    def fresh_spec(self, detail, later_clock):
        return page({"panels": [app_panel({"clock": "6:00 PM", "date": "Fri, Oct 2",
                                            "clip": {"value": "Motion", "status": "ready", "detail": detail}})],
                     "steps": [step("s1", phone={"clock": "6:04 PM"}),
                               step("s2", phone={"clock": later_clock})]})

    def test_rounded_hours_text_may_stay_a_few_minutes(self):
        w = self.walk(self.fresh_spec("Updated 3 h ago", "6:30 PM"))
        self.assertEqual(w.warns, [], w.out)

    def test_hours_text_cannot_stay_two_hours(self):
        w = self.walk(self.fresh_spec("Updated 3 h ago", "8:05 PM"))
        self.assertTrue(w.checked("'Updated 3 h ago' has been shown unchanged for 2h05"), w.out)

    def test_just_now_may_stay_under_fifteen_minutes(self):
        w = self.walk(self.fresh_spec("Updated just now", "6:10 PM"))
        self.assertEqual(w.warns, [], w.out)

    def test_just_now_cannot_stay_fifteen_minutes(self):
        w = self.walk(self.fresh_spec("Updated just now", "6:20 PM"))
        self.assertTrue(w.checked("'Updated just now' has been shown unchanged for 20 min"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_freshness_window(self):
        f = spec_walk.freshness_window
        self.assertEqual(f("just now"), 15)
        self.assertEqual(f("Updated 1 min ago"), 15)
        self.assertEqual(f("5 min ago"), 2)
        self.assertEqual(f("Updated 3 h ago"), 120)
        self.assertEqual(f("2 days ago"), 2880)
        self.assertIsNone(f("Last report 6:05 PM"))
        self.assertIsNone(f("Recording now live"))

    # ---- finding 2c: idle battery ----------------------------------------

    def idle_spec(self):
        return page({"panels": [app_panel({"clock": "6:00 PM"}), batt_panel(50)],
                     "steps": [step("s1", phone={"clock": "7:00 PM"}), step("s2", phone={"clock": "9:00 PM"})]})

    def test_idle_battery_without_rate_is_a_check(self):
        w = self.walk(self.idle_spec())
        self.assertTrue(w.checked("battery panel batt never changes over 3h00"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_idle_battery_with_rate_that_allows_zero_is_a_check(self):
        w = self.walk(self.idle_spec(), "--rate", "batt=-1:2")
        self.assertTrue(w.checked("battery panel batt never changes"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_idle_battery_with_rate_excluding_zero_is_a_warn(self):
        w = self.walk(self.idle_spec(), "--rate", "batt=-2:-1")
        self.assertTrue(w.warned("battery panel batt never changes over 3h00"), w.out)
        self.assertFalse(w.checked("battery panel batt never changes"), w.out)

    # ---- finding 2a: battery card correspondence -------------------------

    def card_spec(self, declared, detail="Battery level"):
        fields = [{"id": "battery", "label": "Battery", "kind": "battery"}]
        sources = None
        if declared:
            fields[0]["source"] = "camsrc"
            sources = [{"id": "camsrc", "label": "Camera", "node": "cam"}]
        return page({"panels": [app_panel({"clock": "6:00 PM", "battery": {"value": 50, "detail": detail}},
                                          fields=fields, sources=sources),
                                batt_panel(50, node="cam" if declared else None)],
                     "steps": [step("s1", phone={"clock": "7:00 PM"}, batt={"charge": 49})]})

    def test_battery_card_without_declared_source_is_a_check(self):
        w = self.walk(self.card_spec(False))
        self.assertTrue(w.checked("phone.battery shows 50 but battery panel batt shows 49"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_battery_card_with_declared_source_is_a_check(self):
        w = self.walk(self.card_spec(True))
        self.assertTrue(w.checked("phone.battery shows 50 but battery panel batt shows 49"), w.out)

    def test_battery_card_that_names_its_report_time_is_fine(self):
        w = self.walk(self.card_spec(True, detail="Last report 5:40 PM"))
        self.assertEqual(w.warns, [], w.out)
        self.assertFalse(w.checked("phone.battery"), w.out)

    def test_battery_card_declared_for_another_node_is_not_compared(self):
        spec = self.card_spec(True)
        spec["page"]["blocks"][0]["diagram"]["panels"][1]["node"] = "svc"
        w = self.walk(spec)
        self.assertFalse(w.warned("phone.battery"), w.out)
        self.assertFalse(w.checked("phone.battery"), w.out)

    # ---- finding 3: codeRef ownership vs carried tones -------------------

    def coderef_spec(self, ref_on):
        # app owns the codeRef; "toned" sets app's tone, "carried" only carries it
        spec = page({"steps": [step("toned", edges=["cam->svc"], tone={"app": "warn"}),
                               step("carried", nodes=["cam"])]})
        d = spec["page"]["blocks"][0]["diagram"]
        d["nodes"]["app"]["codeRefs"] = [copy.deepcopy(REF)]
        for s in d["steps"]:
            if s["id"] == ref_on:
                s["codeRefs"] = [copy.deepcopy(REF)]
        return spec

    def test_coderef_on_step_whose_tone_patch_touches_owner(self):
        w = self.walk(self.coderef_spec("toned"))
        self.assertFalse(w.checked("codeRef svc.handler belongs to app"), w.out)

    def test_coderef_on_step_with_only_a_carried_tone_is_a_check(self):
        w = self.walk(self.coderef_spec("carried"))
        self.assertTrue(w.checked("carried: codeRef svc.handler belongs to app"), w.out)

    # ---- review round 5: per-field delivery -----------------------------

    def route_spec(lit, declared=True, panel_node=None, change=None):
        """A lock node with its own unrelated edge; the app's temp card reads from cam."""
        field = {"id": "temp", "label": "Temperature", "icon": "temperature"}
        sources = None
        if declared:
            field["source"] = "camsrc"
            sources = [{"id": "camsrc", "label": "Camera", "node": "cam"}]
        panel = app_panel({"clock": "6:00 PM", "temp": {"value": 21, "detail": "Outdoor sensor"}},
                          fields=[field], sources=sources)
        if panel_node:
            panel["node"] = panel_node
        spec = page({"panels": [panel],
                     "steps": [step("s1", phone=dict({"clock": "6:10 PM"}, **(change or {"temp": {"value": 22}})),
                                    edges=lit)]})
        d = spec["page"]["blocks"][0]["diagram"]
        d["nodes"]["lock"] = {"title": "Lock", "icon": "lock", "tint": "dev"}
        d["rows"] = [["cam", "svc", "app"], ["lock"]]
        d["edges"].append({"from": "lock", "to": "svc", "kind": "https", "label": "lock event"})
        return spec
    route_spec = staticmethod(route_spec)

    def test_unrelated_delivered_edge_does_not_count_as_delivery(self):
        w = self.walk(self.route_spec(["lock->svc"]))
        self.assertTrue(w.checked("s1: phone.temp reported value 21 -> 22 but no delivered edge in this step "
                                  "touches its source node cam"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_edge_touching_the_source_node_counts_as_delivery(self):
        w = self.walk(self.route_spec(["cam->svc"]))
        self.assertFalse(w.checked("reported value"), w.out)

    def test_failed_edge_at_the_source_node_is_not_delivery(self):
        spec = self.route_spec(["cam->svc"])
        spec["page"]["blocks"][0]["diagram"]["steps"][0]["failures"] = {"cam->svc": "dropped"}
        w = self.walk(spec)
        self.assertTrue(w.checked("reported value 21 -> 22 but this step delivers no edge"), w.out)

    def test_panel_node_route(self):
        w = self.walk(self.route_spec(["svc->app"], declared=False, panel_node="app"))
        self.assertFalse(w.checked("reported value"), w.out)
        w = self.walk(self.route_spec(["lock->svc"], declared=False, panel_node="app"))
        self.assertTrue(w.checked("no delivered edge in this step ends at the panel's node app"), w.out)

    def test_undeclared_route_is_always_a_check(self):
        w = self.walk(self.route_spec(["cam->svc", "svc->app"], declared=False))
        self.assertTrue(w.checked("reported value 21 -> 22 but the spec declares no route for it"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_just_now_with_unrelated_edge_is_a_check(self):
        w = self.walk(self.route_spec(["lock->svc"], change={"temp": {"detail": "Updated just now"}}))
        self.assertTrue(w.checked("phone.temp.detail says 'Updated just now' but no delivered edge in this "
                                  "step touches its source node cam"), w.out)

    def test_just_now_with_related_edge_is_fine(self):
        w = self.walk(self.route_spec(["cam->svc"], change={"temp": {"detail": "Updated just now"}}))
        self.assertFalse(w.checked("phone.temp.detail says"), w.out)

    # ---- review round 5: re-patched freshness, descriptive details -------

    def test_repatched_just_now_restarts_freshness(self):
        spec = page({"panels": [app_panel({"clock": "6:00 PM", "date": "Fri, Oct 2",
                                            "clip": {"value": "Motion", "status": "ready",
                                                     "detail": "Updated just now"}})],
                     "steps": [step("s1", phone={"clock": "6:10 PM", "clip": {"detail": "Updated just now"}},
                                    edges=["cam->svc", "svc->app"]),
                               step("s2", phone={"clock": "6:20 PM"})]})
        w = self.walk(spec)
        self.assertFalse(w.checked("has been shown unchanged"), w.out)

    def test_descriptive_detail_need_not_change_with_value(self):
        w = self.walk(self.route_spec(["cam->svc"]))
        self.assertFalse(w.checked("was not rewritten"), w.out)

    def test_report_time_detail_must_change_with_value(self):
        spec = self.route_spec(["cam->svc"])
        spec["page"]["blocks"][0]["diagram"]["panels"][0]["initial"]["temp"]["detail"] = "Last report 5:40 PM"
        w = self.walk(spec)
        self.assertTrue(w.checked("value 21 -> 22 but detail 'Last report 5:40 PM' was not rewritten"), w.out)

    def test_says_age(self):
        for text in ("Updated just now", "5 min ago", "Last report 6:05 PM", "Updated now"):
            self.assertTrue(spec_walk.says_age(text), text)
        for text in ("Outdoor sensor", "Front door", "", None):
            self.assertFalse(spec_walk.says_age(text), text)

    # ---- story time (diagram.storyTime + step.time) ----------------------

    def story_spec(self, rates=True, **app_initial):
        """Overnight story: no panel clocks, no battery charge patches."""
        d = {"storyTime": {"start": "2026-09-24T22:30", "end": "2026-09-25T09:00", "clock": "12h"},
             "panels": [app_panel(dict({"clip": {"value": "None", "status": "ready"}}, **app_initial)),
                        batt_panel(50)],
             "steps": [step("armed", nodes=["cam"]),
                       step("motion", time="+2h10m", batt={"drain": 1.5}, edges=["cam->svc"]),
                       step("push", time="+1m", edges=["svc->app"]),
                       step("fox", time="04:15", batt={"drain": 1}),
                       step("check", time="08:20")]}
        if rates:
            d["deviceDefaults"] = {"battery": {"drainPerHour": 0.5, "chargePerHour": 10}}
        return page(d)

    def test_story_time_drives_clocks_and_battery(self):
        w = self.walk(self.story_spec(), "--rate", "batt=-0.5:0")
        self.assertIn("  motion         12:40 AM", w.out)
        self.assertIn("  fox            4:15 AM", w.out)       # 12-hour clock across midnight
        self.assertIn("  check          8:20 AM", w.out)
        self.assertFalse(w.checked("no clock on any"), w.out)
        self.assertFalse(w.checked("never changes"), w.out)
        self.assertFalse(w.checked("with no clock change"), w.out)   # drain at an unmoved clock
        self.assertFalse(w.checked("pins the panel"), w.out)
        self.assertFalse(w.checked("built-in placeholder"), w.out)
        self.assertIn("motion batt: 50 -> 47.42 over 2h10 = -0.5/h after extra drain 1.5", w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_story_time_rate_uses_resolved_clock(self):
        w = self.walk(self.story_spec(), "--rate", "batt=-0.2:0")
        self.assertTrue(w.warned("fox: batt rate -0.5/h is outside the stated -0.2..0/h"), w.out)

    def test_story_time_explicit_panel_clock_is_a_check(self):
        spec = self.story_spec()
        spec["page"]["blocks"][0]["diagram"]["steps"][3]["panels"]["phone"] = {"clock": "4:10 AM"}
        w = self.walk(spec)
        self.assertTrue(w.checked("fox: phone shows clock '4:10 AM' but the story time is '4:15'"), w.out)
        self.assertEqual(w.warns, [], w.out)

    def test_story_time_builtin_rate_is_a_check(self):
        w = self.walk(self.story_spec(rates=False))
        self.assertIn("battery batt: drain 1 %/h (built-in placeholder)", w.out)
        self.assertTrue(w.checked("battery batt drifts on the built-in placeholder drainPerHour 1 %/h"), w.out)

    def test_story_time_backward_is_a_warn(self):
        spec = self.story_spec()
        spec["page"]["blocks"][0]["diagram"]["steps"][4]["time"] = "2026-09-25T03:00"
        w = self.walk(spec, clean=False)
        self.assertTrue(w.warned("check: story time goes backward (4:15 AM -> 3:00 AM)"), w.out)

    def test_story_time_rounded_battery_card_matches_panel(self):
        spec = self.story_spec(battery={"value": 50, "status": "ready", "detail": "Battery level"})
        d = spec["page"]["blocks"][0]["diagram"]
        d["panels"][0]["fields"].append({"id": "battery", "label": "Battery", "kind": "battery"})
        d["steps"][1]["panels"]["phone"] = {"battery": {"value": 47}}   # panel 47.42
        w = self.walk(spec)
        self.assertFalse(w.checked("motion: phone.battery shows 47"), w.out)
        self.assertTrue(w.checked("fox: phone.battery shows 47 but battery panel batt shows 44.63"), w.out)

    # ---- review round 4: uppercase SHAs ---------------------------------

    def test_uppercase_full_shas_are_accepted(self):
        for rev in ("A" * 40, "B" * 64):
            spec = self.coderef_spec("toned")
            d = spec["page"]["blocks"][0]["diagram"]
            d["nodes"]["app"]["codeRefs"][0]["revision"] = rev
            for st in d["steps"]:
                for r in st.get("codeRefs") or []:
                    r["revision"] = rev
            w = self.walk(spec)
            self.assertFalse(w.warned("not a full immutable commit SHA"), w.out)


if __name__ == "__main__":
    unittest.main(verbosity=2)
