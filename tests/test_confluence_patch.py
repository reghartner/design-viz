"""Fully offline tests for tools/confluence_patch.py."""

import base64
import contextlib
import io
import json
import pathlib
import sys
import tempfile
import unittest
from unittest import mock
from urllib.parse import parse_qs, urlsplit

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))

import confluence_patch  # noqa: E402


BASE = "https://example.atlassian.net/wiki"
PAGE_ID = "123456"


class StatusError(Exception):
    def __init__(self, code):
        super().__init__(f"status {code}")
        self.code = code


def page_version(number, body, *, title="Widget Design Doc"):
    return {
        "id": PAGE_ID,
        "status": "current",
        "title": title,
        "version": {
            "number": number,
            "createdAt": f"2026-01-{number:02d}T12:00:00Z",
            "authorId": f"author-{number}",
            "message": f"revision {number}",
        },
        "body": {"storage": {"representation": "storage", "value": body}},
    }


class OfflineTestCase(unittest.TestCase):
    def setUp(self):
        super().setUp()
        socket_patcher = mock.patch(
            "socket.socket", side_effect=AssertionError("unit tests must not open sockets")
        )
        urlopen_patcher = mock.patch(
            "urllib.request.urlopen",
            side_effect=AssertionError("unit tests must use injected I/O"),
        )
        socket_patcher.start()
        urlopen_patcher.start()
        self.addCleanup(socket_patcher.stop)
        self.addCleanup(urlopen_patcher.stop)

    def run_main(self, argv, *, fetcher=None, putter=None, environ=None):
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = confluence_patch.main(
                argv,
                fetcher=fetcher,
                putter=putter,
                environ={} if environ is None else environ,
            )
        return code, stdout.getvalue() + stderr.getvalue()


class AnchorTests(OfflineTestCase):
    def test_anchor_must_match_exactly_once(self):
        with self.assertRaisesRegex(confluence_patch.ConfluencePatchError,
                                    "anchor not found"):
            confluence_patch.replace_unique_anchor("<p>alpha</p>", "beta", "gamma")
        self.assertEqual(
            confluence_patch.replace_unique_anchor(
                "<p>alpha</p><p>beta</p>", "alpha", "gamma"
            ),
            "<p>gamma</p><p>beta</p>",
        )
        with self.assertRaisesRegex(
            confluence_patch.ConfluencePatchError,
            "anchor matches 2 times — extend the anchor with more surrounding context",
        ):
            confluence_patch.replace_unique_anchor("alpha alpha", "alpha", "gamma")

    def test_empty_replacement_deletes_without_touching_other_bytes(self):
        original = "<p>before</p>\n<ac:macro data-x='1'>remove me</ac:macro>\n<p>after</p>"
        expected = "<p>before</p>\n\n<p>after</p>"
        self.assertEqual(
            confluence_patch.replace_unique_anchor(
                original, "<ac:macro data-x='1'>remove me</ac:macro>", ""
            ),
            expected,
        )

    def test_empty_and_overlapping_anchors_are_rejected(self):
        with self.assertRaisesRegex(confluence_patch.ConfluencePatchError,
                                    "anchor must not be empty"):
            confluence_patch.replace_unique_anchor("", "", "insert")
        with self.assertRaisesRegex(confluence_patch.ConfluencePatchError,
                                    "anchor matches 2 times"):
            confluence_patch.replace_unique_anchor("aaa", "aa", "x")


class FileModeTests(OfflineTestCase):
    def test_multiline_find_and_replace_files_are_verbatim(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "source.xhtml"
            find = root / "find.xhtml"
            replacement = root / "replace.xhtml"
            output = root / "patched.xhtml"
            source.write_text("<p>top</p>\n<p>one\n two</p>\n<p>end</p>", encoding="utf-8")
            find.write_text("<p>one\n two</p>", encoding="utf-8")
            replacement.write_text("<p>three\n four</p>", encoding="utf-8")
            code, report = self.run_main([
                "--file", str(source), "--out", str(output),
                "--find-file", str(find), "--replace-file", str(replacement),
            ], fetcher=lambda *_: self.fail("file mode fetched"),
               putter=lambda *_: self.fail("file mode put"))
            self.assertEqual(code, 0, report)
            self.assertEqual(
                output.read_text(encoding="utf-8"),
                "<p>top</p>\n<p>three\n four</p>\n<p>end</p>",
            )
            self.assertIn("-one two", report)
            self.assertIn("+three four", report)

    def test_saved_json_input_writes_only_patched_storage_xhtml(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "page.json"
            output = root / "patched.xhtml"
            source.write_text(json.dumps(page_version(
                7, "<h2>Widget</h2><p>old behavior</p>"
            )), encoding="utf-8")
            code, report = self.run_main([
                "--file", str(source), "--out", str(output),
                "--find", "old behavior", "--replace", "new behavior",
            ])
            self.assertEqual(code, 0, report)
            self.assertEqual(
                output.read_text(encoding="utf-8"),
                "<h2>Widget</h2><p>new behavior</p>",
            )
            self.assertIn("--- v7", report)
            self.assertIn("+++ v8", report)

    def test_dry_run_writes_nothing(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "page.xhtml"
            output = root / "must-not-exist.xhtml"
            source.write_text("<p>old</p>", encoding="utf-8")
            code, report = self.run_main([
                "--file", str(source), "--out", str(output),
                "--find", "old", "--replace", "new", "--dry-run",
            ])
            self.assertEqual(code, 0, report)
            self.assertFalse(output.exists())
            self.assertIn("-old", report)
            self.assertIn("+new", report)

    def test_empty_cli_replacement_is_deletion(self):
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "page.xhtml"
            output = root / "patched.xhtml"
            source.write_text("<p>keep</p><p>delete</p>", encoding="utf-8")
            code, report = self.run_main([
                "--file", str(source), "--out", str(output),
                "--find", "<p>delete</p>", "--replace", "",
            ])
            self.assertEqual(code, 0, report)
            self.assertEqual(output.read_text(encoding="utf-8"), "<p>keep</p>")


class LiveModeTests(OfflineTestCase):
    def v2_fetcher(self, before, after, *, current=4):
        calls = []

        def fetch(url, headers):
            calls.append(url)
            path = urlsplit(url).path
            if path.endswith("/versions"):
                return {"results": [{"number": current}]}
            number = int(parse_qs(urlsplit(url).query)["version"][0])
            return page_version(number, before if number == current else after)

        return fetch, calls

    def test_v2_put_payload_and_verification_restore_command(self):
        before = "<h2>Widget</h2><p>old behavior</p>"
        after = "<h2>Widget</h2><p>new behavior</p>"
        fetch, fetch_calls = self.v2_fetcher(before, after)
        puts = []

        def put(url, headers, payload):
            puts.append((url, headers, payload))
            return page_version(5, after), {"Content-Type": "application/json"}

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old behavior", "--replace", "new behavior",
            "--message", "paired change CT-42",
        ], fetcher=fetch, putter=put)
        self.assertEqual(code, 0, report)
        self.assertEqual(len(puts), 1)
        url, headers, payload = puts[0]
        self.assertEqual(url, f"{BASE}/api/v2/pages/{PAGE_ID}")
        self.assertEqual(headers["Authorization"], "Bearer test-token")
        self.assertEqual(payload, {
            "id": PAGE_ID,
            "status": "current",
            "title": "Widget Design Doc",
            "body": {"representation": "storage", "value": after},
            "version": {"number": 5, "message": "paired change CT-42"},
        })
        self.assertIn("-old behavior", report)
        self.assertIn("+new behavior", report)
        self.assertIn("prior version: v4", report)
        self.assertIn(f"--base {BASE} --restore 4", report)
        self.assertGreaterEqual(len(fetch_calls), 3, "write must be re-fetched")

    def test_v1_fetch_fallback_uses_v1_update_shape(self):
        before = "<p>old</p>"
        after = "<p>new</p>"
        puts = []

        def fetch(url, headers):
            path = urlsplit(url).path
            if "/api/v2/" in path:
                raise StatusError(404)
            if path.endswith("/version"):
                return {"results": [{"number": 8}]}
            number = int(parse_qs(urlsplit(url).query)["version"][0])
            return page_version(number, before if number == 8 else after)

        def put(url, headers, payload):
            puts.append((url, payload))
            return page_version(9, after)

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old", "--replace", "new",
        ], fetcher=fetch, putter=put)
        self.assertEqual(code, 0, report)
        self.assertEqual(puts, [(f"{BASE}/rest/api/content/{PAGE_ID}", {
            "type": "page",
            "title": "Widget Design Doc",
            "version": {"number": 9, "message": confluence_patch.DEFAULT_MESSAGE},
            "body": {"storage": {"value": after, "representation": "storage"}},
        })])

    def test_v2_put_endpoint_failure_falls_back_to_v1(self):
        before = "<p>old</p>"
        after = "<p>new</p>"
        fetch, _calls = self.v2_fetcher(before, after)
        puts = []

        def put(url, headers, payload):
            puts.append((url, payload))
            if "/api/v2/" in url:
                raise StatusError(404)
            return page_version(5, after)

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old", "--replace", "new",
        ], fetcher=fetch, putter=put)
        self.assertEqual(code, 0, report)
        self.assertEqual([url for url, _payload in puts], [
            f"{BASE}/api/v2/pages/{PAGE_ID}",
            f"{BASE}/rest/api/content/{PAGE_ID}",
        ])
        self.assertEqual(puts[1][1]["version"]["number"], 5)

    def test_v2_put_response_requires_page_id_and_expected_version(self):
        before = "<p>old behavior</p>"
        after = "<p>new behavior</p>"
        endpoint = f"{BASE}/api/v2/pages/{PAGE_ID}"
        cases = [
            ("none", None, "unavailable"),
            ("empty", {}, "unavailable"),
            ("unparseable", "not-json-response", "unavailable"),
            (
                "error envelope",
                {"statusCode": 400, "message": "private document content"},
                "unavailable",
            ),
            ("wrong version", page_version(4, after), "4"),
            (
                "wrong id",
                {**page_version(5, after), "id": "different-page"},
                "5",
            ),
            ("missing version", {"id": PAGE_ID}, "unavailable"),
        ]

        for label, response, observed in cases:
            with self.subTest(label=label):
                fetch, _calls = self.v2_fetcher(before, after)
                code, report = self.run_main([
                    PAGE_ID, "--base", BASE, "--token", "test-token",
                    "--find", "old behavior", "--replace", "new behavior",
                ], fetcher=fetch, putter=lambda *_args, value=response: value)
                self.assertEqual(code, 1)
                self.assertEqual(
                    report,
                    "CONFLUENCE_PATCH FAIL: invalid PUT response from "
                    f"{endpoint}: expected version 5, got {observed}\n",
                )
                for content in (
                    "private document content", before, after, "different-page"
                ):
                    self.assertNotIn(content, report)

    def test_v1_put_response_is_validated_at_v1_endpoint(self):
        before = "<p>old</p>"
        after = "<p>new</p>"

        def fetch(url, headers):
            path = urlsplit(url).path
            if "/api/v2/" in path:
                raise StatusError(404)
            if path.endswith("/version"):
                return {"results": [{"number": 8}]}
            number = int(parse_qs(urlsplit(url).query)["version"][0])
            return page_version(number, before if number == 8 else after)

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old", "--replace", "new",
        ], fetcher=fetch, putter=lambda *_: page_version(8, after))
        self.assertEqual(code, 1)
        self.assertEqual(
            report,
            "CONFLUENCE_PATCH FAIL: invalid PUT response from "
            f"{BASE}/rest/api/content/{PAGE_ID}: expected version 9, got 8\n",
        )

    def test_409_is_the_one_line_version_conflict_error(self):
        fetch, _calls = self.v2_fetcher("<p>old</p>", "<p>new</p>")

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old", "--replace", "new",
        ], fetcher=fetch, putter=lambda *_: (_ for _ in ()).throw(StatusError(409)))
        self.assertEqual(code, 1)
        self.assertEqual(
            report,
            "CONFLUENCE_PATCH FAIL: page changed since fetch — re-run\n",
        )

    def test_server_normalization_prints_second_diff(self):
        before = "<p>old behavior</p>"
        intended = "<p>new behavior</p>"
        server = "<p>new server behavior</p>"
        fetch, _calls = self.v2_fetcher(before, server)
        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old behavior", "--replace", "new behavior",
        ], fetcher=fetch, putter=lambda *_: page_version(5, intended))
        self.assertEqual(code, 0, report)
        self.assertIn("INFO: server normalized the storage body", report)
        self.assertIn("--- local-patched-v5", report)
        self.assertIn("+++ refetched-v5", report)
        self.assertIn("-new behavior", report)
        self.assertIn("+new server behavior", report)

    def test_verification_wrong_version_fails_and_prints_restore_command(self):
        before = "<p>old verification content</p>"
        after = "<p>new verification content</p>"

        def fetch(url, headers):
            path = urlsplit(url).path
            if path.endswith("/versions"):
                return {"results": [{"number": 4}]}
            requested = int(parse_qs(urlsplit(url).query)["version"][0])
            if requested == 4:
                return page_version(4, before)
            return page_version(6, after)

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old verification content",
            "--replace", "new verification content",
        ], fetcher=fetch, putter=lambda *_: page_version(5, after))
        self.assertEqual(code, 1)
        self.assertIn("expected version 5, got 6", report)
        self.assertIn("prior version: v4", report)
        self.assertIn(f"--base {BASE} --restore 4", report)
        self.assertNotIn(before, report)
        self.assertNotIn(after, report)

    def test_verification_fetch_exception_still_prints_restore_without_leaking(self):
        secret = "verify-exception-token"
        before = "<p>old exceptional content</p>"

        def fetch(url, headers):
            path = urlsplit(url).path
            if path.endswith("/versions"):
                return {"results": [{"number": 4}]}
            requested = int(parse_qs(urlsplit(url).query)["version"][0])
            if requested == 4:
                return page_version(4, before)
            raise RuntimeError(
                f"socket wrote Authorization: Bearer {secret} while sending {before}")

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", secret,
            "--find", "old exceptional content",
            "--replace", "new exceptional content",
        ], fetcher=fetch,
           putter=lambda *_: page_version(5, "<p>new exceptional content</p>"))
        self.assertEqual(code, 1)
        self.assertIn("the edit was written but its verification fetch failed", report)
        self.assertIn("last request failed with RuntimeError", report,
                      "arbitrary exception text is reduced to its type name")
        self.assertIn("prior version: v4", report)
        self.assertIn(f"--base {BASE} --restore 4", report)
        self.assertNotIn(secret, report)
        self.assertNotIn(before, report)

    def test_restore_fetches_historical_body_and_writes_new_version(self):
        current_body = "<p>current behavior</p>"
        old_body = "<p>known-good behavior</p>"
        puts = []

        def fetch(url, headers):
            path = urlsplit(url).path
            if path.endswith("/versions"):
                return {"results": [{"number": 2}, {"number": 6}]}
            number = int(parse_qs(urlsplit(url).query)["version"][0])
            bodies = {2: old_body, 6: current_body, 7: old_body}
            return page_version(number, bodies[number])

        def put(url, headers, payload):
            puts.append(payload)
            return page_version(7, old_body)

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token", "--restore", "2",
        ], fetcher=fetch, putter=put)
        self.assertEqual(code, 0, report)
        self.assertEqual(puts[0]["body"]["value"], old_body)
        self.assertEqual(puts[0]["version"], {"number": 7, "message": "restore of v2"})
        self.assertIn("-current behavior", report)
        self.assertIn("+known-good behavior", report)
        self.assertIn("--restore 6", report)

    def test_live_dry_run_does_not_put_or_refetch_new_version(self):
        before = "<p>old</p>"
        fetch, calls = self.v2_fetcher(before, "<p>new</p>")
        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--token", "test-token",
            "--find", "old", "--replace", "new", "--dry-run",
        ], fetcher=fetch, putter=lambda *_: self.fail("dry-run put"))
        self.assertEqual(code, 0, report)
        self.assertIn("+new", report)
        page_calls = [url for url in calls if urlsplit(url).path.endswith(f"/pages/{PAGE_ID}")]
        self.assertEqual(len(page_calls), 1)


class RedactionTests(OfflineTestCase):
    def test_put_failure_exception_text_cannot_leak_credentials_or_content(self):
        email = "writer@example.test"
        token = "write-path-token"
        encoded = base64.b64encode(f"{email}:{token}".encode()).decode()
        anchor = "private anchor text"
        document = f"<p>{anchor}</p><p>private document body</p>"
        fetch, _calls = LiveModeTests().v2_fetcher(document, "<p>replacement</p>")
        exception_text = " | ".join((token, encoded, anchor, document))

        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--email", email, "--token", token,
            "--find", anchor, "--replace", "replacement",
        ], fetcher=fetch, putter=lambda *_: (_ for _ in ()).throw(
            ValueError(exception_text)
        ))
        self.assertEqual(code, 1)
        for secret in (token, encoded, anchor, document, "private document body"):
            self.assertNotIn(secret, report)
        self.assertEqual(
            report,
            "CONFLUENCE_PATCH FAIL: PUT failed for "
            f"{BASE}/api/v2/pages/{PAGE_ID} (ValueError)\n",
        )

    def test_credentials_are_redacted_from_reports_and_basic_forms(self):
        email = "writer@example.test"
        secret = "storage-secret"
        encoded = base64.b64encode(f"{email}:{secret}".encode()).decode()
        with tempfile.TemporaryDirectory() as temp:
            root = pathlib.Path(temp)
            source = root / "page.xhtml"
            output = root / "patched.xhtml"
            source.write_text(f"<p>old {secret} {encoded}</p>", encoding="utf-8")
            code, report = self.run_main([
                "--file", str(source), "--out", str(output),
                "--find", "old", "--replace", "new",
            ], environ={"CONFLUENCE_EMAIL": email, "CONFLUENCE_TOKEN": secret})
        self.assertEqual(code, 0, report)
        self.assertNotIn(secret, report)
        self.assertNotIn(encoded, report)
        self.assertIn("[redacted]", report)

    def test_parse_errors_redact_every_non_option_value(self):
        anchor = "company-only\nanchor"
        credential = "parser-secret"
        code, report = self.run_main([
            PAGE_ID,
            "--find", anchor,
            "--replace", "replacement",
            "--restore", credential,
        ])
        self.assertEqual(code, 1)
        for fragment in (PAGE_ID, "company-only", "anchor", "replacement", credential):
            self.assertNotIn(fragment, report)
        self.assertIn("[redacted]", report)

    def test_abbreviated_token_flag_fails_without_leaking_value(self):
        secret = "abbreviated-token-secret"
        code, report = self.run_main([
            PAGE_ID, "--base", BASE, "--tok", secret,
            "--find", "old", "--replace", "new",
        ])
        self.assertEqual(code, 1)
        self.assertNotIn(secret, report)
        self.assertIn("[redacted]", report)


class PutTransportTests(OfflineTestCase):
    def test_put_transport_refuses_redirect_without_replaying_authorization(self):
        seen_requests = []

        class RedirectingOpener:
            def __init__(self, handler):
                self.handler = handler

            def open(self, request):
                seen_requests.append((
                    request.full_url,
                    request.get_method(),
                    request.get_header("Authorization"),
                ))
                redirected = self.handler.redirect_request(
                    request, None, 302, "Found", {},
                    "https://attacker.example/collect",
                )
                seen_requests.append((
                    redirected.full_url,
                    redirected.get_method(),
                    redirected.get_header("Authorization"),
                ))
                raise AssertionError("redirect handler returned a request")

        def fake_build_opener(handler):
            self.assertIsInstance(
                handler, confluence_patch.confluence_diff.RejectRedirectHandler
            )
            return RedirectingOpener(handler)

        with mock.patch.object(
            confluence_patch.confluence_diff,
            "build_opener",
            side_effect=fake_build_opener,
        ):
            with self.assertRaisesRegex(
                confluence_patch.confluence_diff.ConfluenceDiffError,
                "attacker[.]example",
            ):
                confluence_patch.put_json(
                    f"{BASE}/api/v2/pages/{PAGE_ID}",
                    {"Authorization": "Bearer never-forward-this"},
                    {"id": PAGE_ID, "version": {"number": 5}},
                )
        self.assertEqual(seen_requests, [(
            f"{BASE}/api/v2/pages/{PAGE_ID}",
            "PUT",
            "Bearer never-forward-this",
        )])


if __name__ == "__main__":
    unittest.main()
