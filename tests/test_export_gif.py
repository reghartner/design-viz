"""Pure encoder/link tests plus an optional Chrome capture smoke test."""

import json
import pathlib
import socket
import subprocess
import tempfile
import unittest
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import export_gif  # noqa: E402

CHROME = export_gif.find_chrome()


class ExportGifPureTests(unittest.TestCase):
    def test_out_path_resolution_defaults_beside_page_and_accepts_directories(self):
        import pathlib, tempfile
        page = pathlib.Path("/site/diagrams/drip-commander.html")
        # default: beside the page, named after it
        self.assertEqual(export_gif.resolve_out_path(None, page, None),
                         pathlib.Path("/site/diagrams/drip-commander.gif"))
        # --section given: reference appended so multi-section exports differ
        self.assertEqual(export_gif.resolve_out_path(None, page, "visit-path"),
                         pathlib.Path("/site/diagrams/drip-commander-visit-path.gif"))
        # slashes in a fallback reference cannot escape the directory
        self.assertEqual(export_gif.resolve_out_path(None, page, "a/b"),
                         pathlib.Path("/site/diagrams/drip-commander-a-b.gif"))
        # explicit file path wins verbatim
        self.assertEqual(export_gif.resolve_out_path("walk.gif", page, "visit-path"),
                         pathlib.Path("walk.gif"))
        # an existing directory receives the derived name
        with tempfile.TemporaryDirectory() as td:
            self.assertEqual(export_gif.resolve_out_path(td, page, None),
                             pathlib.Path(td) / "drip-commander.gif")
        # a trailing separator marks a directory even if it does not exist yet
        self.assertEqual(export_gif.resolve_out_path("gifs/", page, None),
                         pathlib.Path("gifs/drip-commander.gif"))

    def test_deep_link_fragment_builder_matches_engine_order_and_encoding(self):
        self.assertEqual(export_gif.build_step_fragment(2), "#m=step&s=2")
        self.assertEqual(
            export_gif.build_step_fragment("await ack", "Write quorum"),
            "#t=Write%20quorum&m=step&s=await%20ack",
        )
        self.assertEqual(
            export_gif.build_step_fragment("await ack", diagram_number=4),
            "#d=4&m=step&s=await%20ack",
        )
        self.assertEqual(
            export_gif.build_step_fragment(
                "await ack", diagram_reference="write-quorum"),
            "#d=write-quorum&m=step&s=await%20ack",
        )

    def test_fragment_builder_uses_positions_for_duplicate_ids(self):
        plan = export_gif.build_step_fragments(
            [{"id": "repeat"}, {"id": "repeat"}, {"id": "last"}],
            "flow",
        )
        self.assertTrue(plan.forced_positional_refs)
        self.assertEqual(plan.references, ("1", "2", "3"))
        self.assertEqual(plan.fragments, (
            "#t=flow&m=step&s=1",
            "#t=flow&m=step&s=2",
            "#t=flow&m=step&s=3",
        ))

    def test_fragment_builder_avoids_numeric_id_position_collision(self):
        plan = export_gif.build_step_fragments([
            {"id": "2"},
            {},
            {"id": "03"},
        ])
        self.assertTrue(plan.forced_positional_refs)
        self.assertEqual(plan.references, ("001", "002", "003"))
        self.assertEqual(len(set(plan.fragments)), 3)
        self.assertEqual(plan.fragments, (
            "#m=step&s=001",
            "#m=step&s=002",
            "#m=step&s=003",
        ))

    def test_fallback_encoder_writes_two_parseable_frames(self):
        # Two 2x1 RGB frames: red/green, then blue/white.
        first = bytes((255, 0, 0, 0, 255, 0))
        second = bytes((0, 0, 255, 255, 255, 255))
        encoded = export_gif.encode_gif([first, second], 2, 1, delay_ms=120)
        self.assertEqual(encoded[:6], b"GIF89a")
        self.assertEqual(encoded[-1:], b";")
        self.assertEqual(export_gif.gif_frame_count(encoded), 2)

    def test_pad_rgb_frame_grows_with_corner_color_and_keeps_pixels_in_place(self):
        # 2x2 frame, top-left pixel white; grow to 3x3.
        frame = bytes((255, 255, 255,  10, 20, 30,
                       40, 50, 60,  70, 80, 90))
        padded = export_gif.pad_rgb_frame(frame, 2, 2, 3, 3)
        self.assertEqual(len(padded), 3 * 3 * 3)
        self.assertEqual(padded[0:3], b"\xff\xff\xff")          # original corner
        self.assertEqual(padded[3:6], bytes((10, 20, 30)))       # row 0 kept
        self.assertEqual(padded[6:9], b"\xff\xff\xff")          # right pad
        self.assertEqual(padded[9:12], bytes((40, 50, 60)))      # row 1 kept
        self.assertEqual(padded[18:27], b"\xff\xff\xff" * 3)    # bottom pad row
        self.assertEqual(export_gif.pad_rgb_frame(frame, 2, 2, 2, 2), frame)
        with self.assertRaises(ValueError):
            export_gif.pad_rgb_frame(frame, 2, 2, 1, 2)

    def test_skin_and_dim_alpha_expressions_embed_values(self):
        expression = export_gif.skin_expression("daylight")
        self.assertIn("window.dvSetSkin", expression)
        self.assertIn('"daylight"', expression)
        self.assertIn("window.dvSkins", expression)
        # Skin names go through JSON so quotes cannot break the script.
        self.assertIn('\\"', export_gif.skin_expression('a"b'))
        dim = export_gif.dim_alpha_expression(0.35)
        self.assertIn("--dv-dim", dim)
        self.assertIn('"0.35"', dim)

    def test_clip_expression_embeds_reference_and_margin(self):
        expression = export_gif.clip_expression("delivery-flow", 16)
        self.assertIn("'section-' + \"delivery-flow\"", expression)
        self.assertIn("var pad = 16", expression)
        self.assertIn(".boardgrid", expression)
        self.assertIn(".termbar", expression)
        # Reference goes through JSON so quotes cannot break the script.
        self.assertIn('\\"', export_gif.clip_expression('a"b', 0))

    def test_section_selection_uses_canonical_heading_slug_address(self):
        spec = {"page": {"blocks": [{"tabs": [
            {"label": "Intro", "sections": [{"heading": "Words"}]},
            {"label": "Flow Two", "sections": [{
                "heading": "Diagram", "diagram": {"steps": [
                    {"id": "wake"}, {},
                ]},
            }]},
        ]}]}}
        target = export_gif.choose_target(spec, 2)
        self.assertEqual(target.tab_selector, "flow-two")
        self.assertEqual(target.section_reference, "diagram")
        self.assertEqual(target.step_refs, ("wake", "2"))
        self.assertEqual(target.fragments, (
            "#d=diagram&m=step&s=wake",
            "#d=diagram&m=step&s=2",
        ))
        self.assertFalse(target.forced_positional_refs)

    def test_later_stepper_in_same_tab_is_addressable(self):
        spec = {"page": {"blocks": [{"tabs": [{
            "label": "Two flows",
            "sections": [
                {"heading": "First", "diagram": {"steps": [{"id": "a"}]}},
                {"heading": "Second", "diagram": {"steps": [{"id": "b"}, {}]}},
            ],
        }]}]}}
        target = export_gif.choose_target(spec, 2)
        self.assertEqual(target.heading, "Second")
        self.assertEqual(target.section_reference, "second")
        self.assertEqual(target.fragments, (
            "#d=second&m=step&s=b",
            "#d=second&m=step&s=2",
        ))

    def test_duplicate_heading_slugs_and_headingless_fallback_match_renderer(self):
        spec = {"page": {"sections": [
            {"heading": "Shared Flow", "diagram": {"steps": [{"id": "a"}]}},
            {"heading": "Shared Flow", "diagram": {"steps": [{"id": "b"}]}},
            {"diagram": {"steps": [{"id": "c"}]}},
            {"heading": "Shared Flow", "diagram": {"steps": [{"id": "d"}]}},
        ]}}
        self.assertEqual(export_gif.choose_target(spec, 1).section_reference, "shared-flow")
        self.assertEqual(export_gif.choose_target(spec, 2).fragments,
                         ("#d=shared-flow-2&m=step&s=b",))
        self.assertEqual(export_gif.choose_target(spec, 3).fragments,
                         ("#d=3&m=step&s=c",))
        self.assertEqual(export_gif.choose_target(spec, 4).fragments,
                         ("#d=shared-flow-3&m=step&s=d",))

    def test_legacy_numeric_and_tab_fragment_producers_are_unchanged(self):
        self.assertEqual(
            export_gif.build_step_fragments([{"id": "wake"}], diagram_number=2).fragments,
            ("#d=2&m=step&s=wake",),
        )
        self.assertEqual(
            export_gif.build_step_fragments([{"id": "wake"}], "guided").fragments,
            ("#t=guided&m=step&s=wake",),
        )


@unittest.skipUnless(CHROME, "Chrome/Chromium not available")
class ExportGifChromeSmokeTest(unittest.TestCase):
    def inspect_page(self, page, fragment, expression):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = pathlib.Path(temp)
            profile = temp_path / "profile"
            profile.mkdir()
            with socket.socket() as probe:
                probe.bind(("127.0.0.1", 0))
                port = probe.getsockname()[1]
            process = subprocess.Popen([
                CHROME,
                "--headless=new",
                "--disable-gpu",
                "--disable-background-networking",
                "--no-first-run",
                f"--remote-debugging-port={port}",
                f"--user-data-dir={profile}",
                "about:blank",
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            try:
                endpoint = export_gif._wait_for_page_endpoint(port, process, 20)
                with export_gif._DevToolsSocket(endpoint) as devtools:
                    devtools.command("Page.enable")
                    devtools.command("Runtime.enable")
                    devtools.command("Page.navigate", {
                        "url": page.resolve().as_uri() + fragment,
                    })
                    export_gif._wait_for_rendered_page(devtools, process, 20)
                    result = devtools.command("Runtime.evaluate", {
                        "expression": expression,
                        "returnByValue": True,
                    })
                    return result["result"]["value"]
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=3)

    def test_below_fold_page_captures_distinct_steps_and_preserves_frame_count(self):
        page = ROOT / "examples" / "basecraft-keep" / "keep.html"
        spec = export_gif.read_embedded_spec(page)
        target = export_gif.choose_target(spec)
        fragments = target.fragments[:2]
        with tempfile.TemporaryDirectory() as temp:
            temp_path = pathlib.Path(temp)
            screenshots = export_gif.capture_frames(
                page, fragments, CHROME, 1280, temp_path,
                section_reference=str(target.section_reference))
            self.assertEqual(len(screenshots), 2)
            self.assertTrue(all(path.read_bytes().startswith(export_gif.PNG_SIGNATURE)
                                for path in screenshots))
            self.assertGreaterEqual(
                len({path.read_bytes() for path in screenshots}),
                2,
                "deep-linked step frames must not all capture identical page-top content",
            )
            width, height, rgb = export_gif.decode_png(screenshots[0].read_bytes())
            # Clipped to the diagram: narrower than the 1280px viewport, and
            # no longer hard-locked to the 720px 16:9 viewport height.
            self.assertLess(width, 1280)
            self.assertGreater(width, 320)
            self.assertGreater(height, 100)
            self.assertEqual(len(rgb), width * height * 3)
            out = temp_path / "smoke.gif"
            export_gif.write_animated_gif(screenshots, out, 80)
            encoded = out.read_bytes()
            self.assertTrue(encoded.startswith(b"GIF8"))
            self.assertEqual(export_gif.gif_frame_count(encoded), len(fragments))

    def test_scale_doubles_pixel_dimensions_without_changing_layout(self):
        page = ROOT / "examples" / "basecraft-keep" / "keep.html"
        spec = export_gif.read_embedded_spec(page)
        target = export_gif.choose_target(spec)
        fragment = [target.fragments[0]]
        with tempfile.TemporaryDirectory() as temp:
            temp_path = pathlib.Path(temp)
            (temp_path / "s1").mkdir()
            (temp_path / "s2").mkdir()
            base = export_gif.capture_frames(
                page, fragment, CHROME, 1280, temp_path / "s1",
                section_reference=str(target.section_reference), scale=1)
            doubled = export_gif.capture_frames(
                page, fragment, CHROME, 1280, temp_path / "s2",
                section_reference=str(target.section_reference), scale=2)
            w1, h1, _ = export_gif.decode_png(base[0].read_bytes())
            w2, h2, _ = export_gif.decode_png(doubled[0].read_bytes())
            # The clip is measured in CSS pixels either way; scale multiplies
            # only the rendered output (allow 1px rounding per edge).
            self.assertLessEqual(abs(w2 - 2 * w1), 2)
            self.assertLessEqual(abs(h2 - 2 * h1), 2)

    def _inject_doorbell(self, temp_path):
        # keep.html and the other committed example pages predate the
        # --dv-dim CSS; build a fresh page from the current template so the
        # skin and dim-alpha paths are exercised against current src/.
        page = temp_path / "doorbell.html"
        subprocess.run(
            [sys.executable, str(ROOT / "tools" / "inject.py"),
             str(ROOT / "examples" / "doorbell" / "doorbell.spec.json"),
             str(ROOT / "template" / "flowview.html"), str(page)],
            check=True, capture_output=True)
        return page

    def test_skin_switch_and_dim_alpha_change_the_captured_frame(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = pathlib.Path(temp)
            page = self._inject_doorbell(temp_path)
            spec = export_gif.read_embedded_spec(page)
            target = export_gif.choose_target(spec)
            fragment = [target.fragments[0]]
            for name in ("plain", "day", "dim"):
                (temp_path / name).mkdir()
            plain = export_gif.capture_frames(
                page, fragment, CHROME, 1280, temp_path / "plain",
                section_reference=str(target.section_reference), scale=1)
            day = export_gif.capture_frames(
                page, fragment, CHROME, 1280, temp_path / "day",
                section_reference=str(target.section_reference), scale=1,
                skin="daylight")
            dim = export_gif.capture_frames(
                page, fragment, CHROME, 1280, temp_path / "dim",
                section_reference=str(target.section_reference), scale=1,
                dim_alpha=1.0)
            _, _, rgb_plain = export_gif.decode_png(plain[0].read_bytes())
            _, _, rgb_day = export_gif.decode_png(day[0].read_bytes())
            # Corner pixel sits in the margin around the diagram: dark on the
            # aurora default, light once daylight is applied.
            self.assertLess(sum(rgb_plain[0:3]), 240)
            self.assertGreater(sum(rgb_day[0:3]), 500)
            # Alpha 1.0 un-dims every non-highlighted element, so the step
            # frame cannot be identical to the default dim.
            self.assertNotEqual(plain[0].read_bytes(), dim[0].read_bytes())

    def test_unknown_skin_fails_with_the_page_token_list(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = pathlib.Path(temp)
            page = self._inject_doorbell(temp_path)
            spec = export_gif.read_embedded_spec(page)
            target = export_gif.choose_target(spec)
            with self.assertRaises(RuntimeError) as ctx:
                export_gif.capture_frames(
                    page, [target.fragments[0]], CHROME, 1280, temp_path,
                    section_reference=str(target.section_reference), scale=1,
                    skin="sepia")
            self.assertIn("sepia", str(ctx.exception))
            self.assertIn("aurora", str(ctx.exception))

    def test_dim_alpha_sets_the_variable_the_dim_rules_read(self):
        with tempfile.TemporaryDirectory() as temp:
            temp_path = pathlib.Path(temp)
            page = self._inject_doorbell(temp_path)
            spec = export_gif.read_embedded_spec(page)
            target = export_gif.choose_target(spec)
            value = self.inspect_page(
                page, target.fragments[0],
                "(function(){" + export_gif.dim_alpha_expression(0.42) + ";"
                "var edge = document.querySelector('.board.stepmode .edge:not(.lit)');"
                "return edge ? getComputedStyle(edge).opacity : 'no dimmed edge found';"
                "})()")
            self.assertEqual(value, "0.42")

    def test_clip_excludes_section_heading_and_covers_board_and_termbar(self):
        page = ROOT / "examples" / "basecraft-keep" / "keep.html"
        spec = export_gif.read_embedded_spec(page)
        target = export_gif.choose_target(spec)
        state = self.inspect_page(page, target.fragments[0], """
          (function(){
            var clip = %s;
            var ref = %s;
            var sec = document.getElementById('section-' + ref);
            var grid = sec.querySelector('.boardgrid');
            var bar = sec.querySelector('.termbar');
            function pageRect(el){
              var r = el.getBoundingClientRect();
              return {top: r.top + window.scrollY, bottom: r.bottom + window.scrollY,
                      left: r.left + window.scrollX, right: r.right + window.scrollX};
            }
            var gridRect = pageRect(grid);
            var introBottom = null;
            Array.prototype.forEach.call(sec.children, function(child){
              if (child === grid || child === bar) return;
              var r = pageRect(child);
              if (r.bottom - r.top <= 0 || r.bottom > gridRect.top + 1) return;
              if (introBottom === null || r.bottom > introBottom) introBottom = r.bottom;
            });
            return {
              clip: clip,
              introBottom: introBottom,
              grid: gridRect,
              bar: bar && !bar.hidden ? pageRect(bar) : null
            };
          })()
        """ % (export_gif.clip_expression(str(target.section_reference), 16),
               json.dumps(str(target.section_reference))))
        clip = state["clip"]
        self.assertIsNotNone(clip)
        grid = state["grid"]
        self.assertLessEqual(clip["x"], grid["left"])
        self.assertLessEqual(clip["y"], grid["top"])
        self.assertGreaterEqual(clip["x"] + clip["width"], grid["right"])
        self.assertGreaterEqual(clip["y"] + clip["height"], grid["bottom"])
        if state["bar"]:
            self.assertGreaterEqual(clip["y"] + clip["height"], state["bar"]["bottom"])
        if state["introBottom"] is not None:
            self.assertGreaterEqual(
                clip["y"], state["introBottom"],
                "clip must start below the section's heading and prose")

    def test_composed_fragment_restores_tab_later_step_and_row_with_row_scroll_priority(self):
        page = ROOT / "examples" / "chime-radar" / "chime-radar.html"
        fragment = (
            "#t=distance-gate&d=alert-only-inside-15-feet&m=step&s=6"
            "&c=alert-only-inside-15-feet&r=2"
        )
        state = self.inspect_page(page, fragment, """
          (function(){
            var row = document.querySelector('.ctrow.dv-hash-target');
            var step = document.querySelector('.schip[aria-current="true"]');
            var tab = document.querySelector('.tabbtn[aria-selected="true"]');
            var board = document.querySelector('#section-alert-only-inside-15-feet .board');
            return {
              hash: location.hash,
              row: row && row.id,
              focused: document.activeElement && document.activeElement.id,
              rowTop: row && Math.round(row.getBoundingClientRect().top),
              step: step && step.textContent,
              tab: tab && tab.textContent,
              stepMode: !!(board && board.classList.contains('stepmode'))
            };
          })()
        """)
        self.assertEqual(state["hash"], fragment)
        self.assertEqual(state["row"],
                         "contract-alert-only-inside-15-feet-row-2")
        self.assertEqual(state["focused"], state["row"])
        self.assertLessEqual(abs(state["rowTop"]), 1)
        self.assertEqual(state["step"], "6")
        self.assertEqual(state["tab"], "Distance gate")
        self.assertTrue(state["stepMode"])


if __name__ == "__main__":
    unittest.main()
