"""Pure encoder/link tests plus an optional Chrome capture smoke test."""

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
                page, fragments, CHROME, 1280, temp_path)
            self.assertEqual(len(screenshots), 2)
            self.assertTrue(all(path.read_bytes().startswith(export_gif.PNG_SIGNATURE)
                                for path in screenshots))
            self.assertGreaterEqual(
                len({path.read_bytes() for path in screenshots}),
                2,
                "deep-linked step frames must not all capture identical page-top content",
            )
            width, height, rgb = export_gif.decode_png(screenshots[0].read_bytes())
            self.assertEqual((width, height), (1280, 720))
            self.assertEqual(len(rgb), width * height * 3)
            out = temp_path / "smoke.gif"
            export_gif.write_animated_gif(screenshots, out, 80)
            encoded = out.read_bytes()
            self.assertTrue(encoded.startswith(b"GIF8"))
            self.assertEqual(export_gif.gif_frame_count(encoded), len(fragments))

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
