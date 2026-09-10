"""Fully offline tests for tools/confluence_diff.py."""

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

import confluence_diff  # noqa: E402


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
            "createdAt": f"2026-01-0{number}T12:00:00Z",
            "authorId": f"author-{number}",
            "message": f"revision {number}",
        },
        "body": {"storage": {"representation": "storage", "value": body}},
    }


def version_details(number):
    return {
        "number": number,
        "createdAt": f"2026-01-0{number}T12:00:00Z",
        "authorId": f"author-{number}",
        "message": f"revision {number}",
        "minorEdit": False,
        "contentTypeModified": False,
    }


def requested_version(url):
    return int(parse_qs(urlsplit(url).query)["version"][0])


class OfflineTestCase(unittest.TestCase):
    def setUp(self):
        super().setUp()
        socket_patcher = mock.patch(
            "socket.socket", side_effect=AssertionError("unit tests must not open sockets")
        )
        urlopen_patcher = mock.patch(
            "urllib.request.urlopen",
            side_effect=AssertionError("unit tests must use the injected fetcher"),
        )
        socket_patcher.start()
        urlopen_patcher.start()
        self.addCleanup(socket_patcher.stop)
        self.addCleanup(urlopen_patcher.stop)


class PageInputTests(OfflineTestCase):
    def test_bare_id_cloud_path_and_page_id_query(self):
        self.assertEqual(confluence_diff.parse_page_reference(PAGE_ID), (PAGE_ID, None))
        self.assertEqual(
            confluence_diff.parse_page_reference(
                f"https://example.atlassian.net/wiki/spaces/WD/pages/{PAGE_ID}/Widget-Design-Doc"
            ),
            (PAGE_ID, BASE),
        )
        self.assertEqual(
            confluence_diff.parse_page_reference(
                f"https://docs.example.test/viewpage.action?pageId={PAGE_ID}"
            ),
            (PAGE_ID, "https://docs.example.test"),
        )

    def test_base_precedence_and_validation(self):
        derived = "https://derived.example.test"
        env = {"CONFLUENCE_BASE": "https://environment.example.test/wiki/"}
        self.assertEqual(
            confluence_diff.resolve_base("https://flag.example.test/root/", derived, env),
            "https://flag.example.test/root",
        )
        self.assertEqual(
            confluence_diff.resolve_base(None, derived, env),
            "https://environment.example.test/wiki",
        )
        self.assertEqual(confluence_diff.resolve_base(None, derived, {}), derived)
        with self.assertRaisesRegex(ValueError, "must not contain credentials"):
            confluence_diff.normalize_base("https://reader:secret@example.test/wiki")


class AuthenticationTests(OfflineTestCase):
    def test_basic_and_bearer_selection(self):
        basic = confluence_diff.auth_headers(
            environ={"CONFLUENCE_EMAIL": "reader@example.test", "CONFLUENCE_TOKEN": "basic-secret"}
        )
        self.assertEqual(basic["Authorization"], "Basic cmVhZGVyQGV4YW1wbGUudGVzdDpiYXNpYy1zZWNyZXQ=")
        bearer = confluence_diff.auth_headers(
            token="bearer-secret",
            environ={"CONFLUENCE_EMAIL": "ignored@example.test", "CONFLUENCE_TOKEN": "ignored"},
            email="",
        )
        self.assertEqual(bearer["Authorization"], "Bearer bearer-secret")

    def test_token_is_redacted_from_printed_output(self):
        secret = "do-not-print-this"
        seen = []

        def fake_fetch(url, headers):
            seen.append((url, headers))
            return {"results": [{
                "number": 1,
                "when": "2026-01-01T00:00:00Z",
                "authorId": "author-1",
                "message": f"message containing {secret}",
            }]}

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = confluence_diff.main(
                [PAGE_ID, "--base", BASE, "--token", secret, "--list"],
                fetcher=fake_fetch,
                environ={},
            )
        self.assertEqual(code, 0)
        self.assertTrue(seen, "the injected fetcher was not used")
        self.assertEqual(seen[0][1]["Authorization"], f"Bearer {secret}")
        self.assertNotIn(secret, stdout.getvalue())
        self.assertIn("[redacted]", stdout.getvalue())
        self.assertNotIn(secret, seen[0][0], "credentials must not be put in URLs")

    def test_argparse_failure_redacts_token_in_wrong_flag_position(self):
        secret = "argument-parser-secret"
        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = confluence_diff.main(
                [PAGE_ID, "--base", BASE, "--token", secret, "--context", secret],
                fetcher=lambda url, headers: self.fail("parse failure must not fetch"),
                environ={},
            )
        output = stdout.getvalue() + stderr.getvalue()
        self.assertEqual(code, 1)
        self.assertNotIn(secret, output)
        self.assertIn("[redacted]", output)

    def test_abbreviated_token_flag_fails_without_leaking_the_value(self):
        secret = "abbreviated-flag-secret"
        for argv in ([PAGE_ID, "--base", BASE, "--tok", secret],
                     [PAGE_ID, "--base", BASE, f"--tok={secret}"],
                     [PAGE_ID, "--base", BASE, "-tok", secret],
                     [PAGE_ID, "--base", BASE, "-token", secret],
                     [PAGE_ID, "--base", BASE, f"-t={secret}"],
                     [PAGE_ID, "--base", BASE, "-te", secret],
                     [PAGE_ID, "--base", BASE, "--otken", secret],
                     [PAGE_ID, "--base", BASE, f"--{secret}"],
                     [PAGE_ID, "--base", BASE, f"--te={secret}"],
                     [PAGE_ID, "--base", BASE, "-te", "multi\nline-secret"],
                     [PAGE_ID, "--base", BASE, "--context", "multi\nline-secret"]):
            stdout = io.StringIO()
            stderr = io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                code = confluence_diff.main(
                    argv,
                    fetcher=lambda url, headers: self.fail("parse failure must not fetch"),
                    environ={},
                )
            output = stdout.getvalue() + stderr.getvalue()
            self.assertEqual(code, 1, output)
            for fragment in (secret, "multi", "line-secret"):
                self.assertNotIn(fragment, output,
                                 "a mistyped credential flag must not echo its "
                                 "value in any form: " + output)

    def test_v2_body_401_falls_back_to_v1(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            if "/api/v2/" in url:
                raise StatusError(401)
            return {
                "title": "Widget Design Doc",
                "body": {"storage": {"value": "<p>Restricted v2, open v1</p>"}},
                "version": {"number": 4, "when": "2026-01-04T12:00:00Z",
                            "by": {"displayName": "Example Author"},
                            "message": "historical revision"},
            }

        fetched = confluence_diff.fetch_version(BASE, PAGE_ID, 4, {}, fake_fetch)
        self.assertEqual(fetched.api, "v1",
                         "a 401-restricted v2 endpoint must still try v1")
        self.assertEqual(len(calls), 2)
        self.assertIn("/rest/api/content/", calls[1])

    def test_basic_base64_credential_is_redacted_from_output(self):
        email = "reader@example.test"
        secret = "basic-output-secret"
        encoded = base64.b64encode(f"{email}:{secret}".encode()).decode()
        seen_authorization = []

        def fake_fetch(url, headers):
            seen_authorization.append(headers["Authorization"])
            return {"results": [{
                "number": 1,
                "message": f"credential {encoded} token {secret}",
            }]}

        stdout = io.StringIO()
        stderr = io.StringIO()
        with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            code = confluence_diff.main(
                [PAGE_ID, "--base", BASE, "--email", email, "--token", secret, "--list"],
                fetcher=fake_fetch,
                environ={},
            )
        output = stdout.getvalue() + stderr.getvalue()
        self.assertEqual(code, 0)
        self.assertEqual(seen_authorization, [f"Basic {encoded}"])
        self.assertNotIn(secret, output)
        self.assertNotIn(encoded, output)
        self.assertIn("[redacted]", output)

    def test_out_file_redacts_raw_and_basic_credentials(self):
        email = "writer@example.test"
        secret = "file-output-secret"
        encoded = base64.b64encode(f"{email}:{secret}".encode()).decode()

        def fake_fetch(url, headers):
            number = requested_version(url)
            return page_version(number, f"<p>{secret} value {number} {encoded}</p>")

        with tempfile.TemporaryDirectory() as temp:
            target = pathlib.Path(temp) / "change.diff"
            code = confluence_diff.main(
                [PAGE_ID, "--base", BASE, "--email", email, "--token", secret,
                 "--versions", "2", "3", "--out", str(target)],
                fetcher=fake_fetch,
                environ={},
            )
            output = target.read_text()
        self.assertEqual(code, 0)
        self.assertNotIn(secret, output)
        self.assertNotIn(encoded, output)
        self.assertIn("[redacted]", output)


class FetchTests(OfflineTestCase):
    def test_transport_refuses_cross_host_redirect_without_replaying_auth(self):
        seen_requests = []

        class RedirectingOpener:
            def __init__(self, handler):
                self.handler = handler

            def open(self, request):
                seen_requests.append((request.full_url, request.get_header("Authorization")))
                redirected = self.handler.redirect_request(
                    request, None, 302, "Found", {}, "https://attacker.example/collect"
                )
                seen_requests.append(
                    (redirected.full_url, redirected.get_header("Authorization"))
                )
                raise AssertionError("redirect handler returned a request")

        def fake_build_opener(handler):
            self.assertIsInstance(handler, confluence_diff.RejectRedirectHandler)
            return RedirectingOpener(handler)

        with mock.patch.object(confluence_diff, "build_opener", side_effect=fake_build_opener):
            with self.assertRaisesRegex(
                confluence_diff.ConfluenceDiffError, "attacker[.]example"
            ):
                confluence_diff.fetch_json(
                    f"{BASE}/api/v2/pages/{PAGE_ID}",
                    {"Authorization": "Bearer never-forward-this"},
                )
        self.assertEqual(seen_requests, [
            (f"{BASE}/api/v2/pages/{PAGE_ID}", "Bearer never-forward-this")
        ])

    def test_v2_happy_path_uses_real_page_body_shape(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            path = urlsplit(url).path
            if "/versions/" in path:
                number = int(path.rsplit("/", 1)[1])
                return version_details(number)
            number = requested_version(url)
            return page_version(number, f"<p>Value {number}</p>")

        first = confluence_diff.fetch_version(BASE, PAGE_ID, 2, {}, fake_fetch)
        second = confluence_diff.fetch_version(BASE, PAGE_ID, 3, {}, fake_fetch)
        self.assertEqual((first.api, second.api), ("v2", "v2"))
        self.assertEqual(first.body, "<p>Value 2</p>")
        self.assertEqual(first.info.title, "Widget Design Doc")
        self.assertEqual(len(calls), 2)
        self.assertTrue(all(urlsplit(url).path.endswith(f"/pages/{PAGE_ID}") for url in calls))
        self.assertTrue(all(parse_qs(urlsplit(url).query)["body-format"] == ["storage"]
                            for url in calls))
        self.assertEqual([requested_version(url) for url in calls], [2, 3])

    def test_v2_body_404_falls_back_to_v1(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            if "/api/v2/" in url:
                raise StatusError(404)
            return {
                "title": "Widget Design Doc",
                "body": {"storage": {"value": "<p>Historical value</p>"}},
                "version": {
                    "number": 4,
                    "when": "2026-01-04T12:00:00Z",
                    "by": {"displayName": "Example Author"},
                    "message": "historical revision",
                },
            }

        fetched = confluence_diff.fetch_version(BASE, PAGE_ID, 4, {}, fake_fetch)
        self.assertEqual(fetched.api, "v1")
        self.assertEqual(fetched.info.author, "Example Author")
        self.assertEqual(len(calls), 2)
        self.assertIn("/rest/api/content/", calls[1])
        self.assertIn("status=historical", calls[1])

    def test_v2_metadata_only_200_falls_back_to_v1_body(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            if "/api/v2/" in url:
                return version_details(5)
            return {
                "title": "Widget Design Doc",
                "body": {"storage": {"value": "<p>Historical value</p>"}},
                "version": {"number": 5, "message": "historical revision"},
            }

        fetched = confluence_diff.fetch_version(BASE, PAGE_ID, 5, {}, fake_fetch)
        self.assertEqual(fetched.api, "v1")
        self.assertEqual(fetched.body, "<p>Historical value</p>")
        self.assertEqual(len(calls), 2)
        self.assertTrue(urlsplit(calls[0]).path.endswith(f"/api/v2/pages/{PAGE_ID}"))
        self.assertIn("/rest/api/content/", calls[1])

    def test_version_listing_paginates_from_link_header(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            if len(calls) == 1:
                return (
                    {"results": [{
                        "number": 1,
                        "createdAt": "2026-01-01T00:00:00Z",
                        "authorId": "author-1",
                        "message": "first",
                    }]},
                    {"Link": f'<{BASE}/api/v2/pages/{PAGE_ID}/versions?cursor=next-page>; rel="next"'},
                )
            return {"results": [{
                "number": 2,
                "createdAt": "2026-01-02T00:00:00Z",
                "author": {"displayName": "Example Author"},
                "message": "second",
            }]}

        versions, api = confluence_diff.list_versions(BASE, PAGE_ID, {}, fake_fetch)
        self.assertEqual(api, "v2")
        self.assertEqual([item.number for item in versions], [1, 2])
        self.assertEqual(versions[0].author, "author-1")
        self.assertEqual(versions[1].author, "Example Author")
        self.assertEqual(len(calls), 2)
        self.assertIn("cursor=next-page", calls[1])
        self.assertNotIn("body-format", calls[0])

    def test_v2_version_list_410_falls_back_and_v1_paginates(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            if "/api/v2/" in url:
                raise StatusError(410)
            if "start=1" in url:
                return {"results": [{"number": 2, "authorId": "author-2"}], "size": 1,
                        "limit": 1, "start": 1, "totalSize": 2}
            return {"results": [{"number": 1, "authorId": "author-1"}], "size": 1,
                    "limit": 1, "start": 0, "totalSize": 2}

        versions, api = confluence_diff.list_versions(BASE, PAGE_ID, {}, fake_fetch)
        self.assertEqual(api, "v1")
        self.assertEqual([item.number for item in versions], [1, 2])
        self.assertEqual(len(calls), 3)
        self.assertIn("/rest/api/content/", calls[1])

    def test_missing_body_error_names_endpoint(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            return version_details(7)

        with self.assertRaises(confluence_diff.ConfluenceDiffError) as raised:
            confluence_diff.fetch_version(BASE, PAGE_ID, 7, {}, fake_fetch)
        message = str(raised.exception)
        self.assertEqual(len(calls), 2)
        self.assertIn(f"api/v2/pages/{PAGE_ID}", message)
        self.assertIn(f"rest/api/content/{PAGE_ID}", message)
        self.assertIn("no extractable storage body", message)


class NormalizationTests(OfflineTestCase):
    def test_blocks_links_tables_and_confluence_elements(self):
        storage = """
            <h2>Widget &amp; behavior</h2>
            <p>Read the <a href="https://example.test/design?part=one&amp;mode=full">design note</a>.</p>
            <ul><li>Outer<ul><li>Inner item</li></ul></li></ul>
            <table>
              <tr><th>Field</th><th>Meaning</th></tr>
              <tr><td>state</td><td><p>Ready now</p></td></tr>
            </table>
            <ac:structured-macro ac:name="note"><ac:rich-text-body><p>Macro text</p></ac:rich-text-body></ac:structured-macro>
            <p><ac:link><ri:page ri:content-title="Widget Design Doc" /></ac:link>
               <ac:image><ri:attachment ri:filename="widget-view.png" /></ac:image></p>
            <ac:unknown><p>Unknown wrapper text</p></ac:unknown>
        """
        self.assertEqual(confluence_diff.normalize_storage(storage).splitlines(), [
            "## Widget & behavior",
            "Read the [design note](https://example.test/design?part=one&mode=full).",
            "- Outer",
            "  - Inner item",
            "Field | Meaning",
            "state | Ready now",
            "[macro:note]",
            "Macro text",
            "[page-link:Widget Design Doc] [image:widget-view.png]",
            "Unknown wrapper text",
        ])

    def test_nested_blocks_remain_joined_inside_table_cell(self):
        storage = (
            "<table><tr><th>Field</th><th>Details</th></tr>"
            "<tr><td>state</td><td><p>Intro</p><ul><li>First"
            "<ul><li>Nested</li></ul></li><li>Second</li></ul><p>End</p>Tail</td></tr></table>"
        )
        self.assertEqual(confluence_diff.normalize_storage(storage).splitlines(), [
            "Field | Details",
            "state | Intro; First; Nested; Second; End; Tail",
        ])

    def test_pre_lines_and_malformed_xhtml_never_raise(self):
        malformed = (
            "<pre>alpha  value<br/>beta &amp; value</pre>"
            "<blockquote><p>quote <b>text</blockquote><p>tail"
            "<ac:structured-macro ac:name='code'><ac:plain-text-body>"
            "<![CDATA[macro body]]></ac:plain-text-body>"
        )
        normalized = confluence_diff.normalize_storage(malformed)
        self.assertIn("alpha value", normalized)
        self.assertIn("beta & value", normalized)
        self.assertIn("quote text", normalized)
        self.assertIn("tail", normalized)
        self.assertIn("[macro:code]", normalized)
        self.assertIn("macro body", normalized)


class OutputTests(OfflineTestCase):
    def test_unified_diff_has_metadata_labels_and_only_changed_hunks(self):
        old_lines = "".join(f"<p>Line {number}</p>" for number in range(1, 12))
        new_lines = old_lines.replace("<p>Line 6</p>", "<p>Changed line</p>")
        older = confluence_diff.VersionBody(
            confluence_diff.version_info(page_version(2, old_lines)),
            old_lines,
            "v2",
            "example-v2-url",
        )
        newer = confluence_diff.VersionBody(
            confluence_diff.version_info(page_version(3, new_lines)), new_lines, "v1", "example-v1-url"
        )
        output = confluence_diff.format_diff(PAGE_ID, older, newer, context=1)
        self.assertIn(f"page: {PAGE_ID} | title: Widget Design Doc", output)
        self.assertIn("v2: when=2026-01-02T12:00:00Z", output)
        self.assertIn("api=v2", output)
        self.assertIn("api=v1", output)
        self.assertIn("--- v2\n+++ v3\n@@", output)
        self.assertIn("-Line 6", output)
        self.assertIn("+Changed line", output)
        self.assertNotIn(" Line 1\n", output)
        self.assertNotIn(" Line 11\n", output)

    def test_main_uses_two_most_recent_versions_and_reports_identical_text(self):
        calls = []

        def fake_fetch(url, headers):
            calls.append(url)
            if url.split("?")[0].endswith("/versions"):
                return {"results": [
                    {"number": 1, "createdAt": "2026-01-01T00:00:00Z"},
                    {"number": 4, "createdAt": "2026-01-04T00:00:00Z"},
                    {"number": 3, "createdAt": "2026-01-03T00:00:00Z"},
                ]}
            number = requested_version(url)
            return page_version(number, "<p>Same readable text</p>")

        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = confluence_diff.main(
                [PAGE_ID, "--base", BASE, "--token", "test-token"],
                fetcher=fake_fetch,
                environ={},
            )
        self.assertEqual(code, 0)
        self.assertIn("no changes between v3 and v4", stdout.getvalue())
        body_calls = [url for url in calls if urlsplit(url).path.endswith(f"/pages/{PAGE_ID}")]
        self.assertEqual([requested_version(url) for url in body_calls], [3, 4])
        self.assertNotIn(1, [requested_version(url) for url in body_calls])

    def test_out_writes_diff_without_using_network(self):
        def fake_fetch(url, headers):
            number = requested_version(url)
            return page_version(number, f"<p>Value {number}</p>")

        with tempfile.TemporaryDirectory() as temp:
            target = pathlib.Path(temp) / "change.diff"
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = confluence_diff.main(
                    [PAGE_ID, "--base", BASE, "--token", "test-token",
                     "--versions", "2", "3", "--out", str(target)],
                    fetcher=fake_fetch,
                    environ={},
                )
            self.assertEqual(code, 0)
            self.assertEqual(stdout.getvalue(), "")
            self.assertIn("--- v2\n+++ v3", target.read_text())


class LocalFileTests(OfflineTestCase):
    """--files mode: another tool (e.g. a Confluence MCP server) fetched the
    versions; the diff runs from local files with no credentials or network."""

    def run_files(self, argv):
        stdout = io.StringIO()
        with contextlib.redirect_stdout(stdout):
            code = confluence_diff.main(
                argv,
                fetcher=lambda url, headers: self.fail("--files must not fetch"),
                environ={},
            )
        return code, stdout.getvalue()

    def test_two_storage_xhtml_files_diff_without_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "old.xml"
            new = pathlib.Path(temp) / "new.xml"
            old.write_text("<p>hold for <b>30s</b></p>", encoding="utf-8")
            new.write_text("<p>hold for <b>45s</b></p>", encoding="utf-8")
            code, out = self.run_files(["--files", str(old), str(new)])
            self.assertEqual(code, 0, out)
            self.assertIn("--- v1\n+++ v2", out)
            self.assertIn("-hold for 30s", out)
            self.assertIn("+hold for 45s", out)
            self.assertIn("api=file:old.xml", out)
            self.assertIn("api=file:new.xml", out)

    def test_saved_json_responses_carry_metadata_into_the_header(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "v7.json"
            new = pathlib.Path(temp) / "v9.json"
            old.write_text(json.dumps({
                "title": "Widget Design Doc",
                "body": {"storage": {"value": "<p>seven</p>"}},
                "version": {"number": 7, "when": "2026-01-01T00:00:00Z",
                            "by": {"displayName": "Example Author"}},
            }), encoding="utf-8")
            new.write_text(json.dumps({
                "title": "Widget Design Doc",
                "body": {"storage": {"value": "<p>nine</p>"}},
                "version": {"number": 9, "when": "2026-01-02T00:00:00Z",
                            "by": {"displayName": "Example Author"}},
            }), encoding="utf-8")
            code, out = self.run_files(["--files", str(old), str(new)])
            self.assertEqual(code, 0, out)
            self.assertIn("title: Widget Design Doc", out)
            self.assertIn("v7: when=2026-01-01T00:00:00Z | author=Example Author", out)
            self.assertIn("--- v7\n+++ v9", out)

    def test_identical_files_report_no_changes(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "a.xml"
            new = pathlib.Path(temp) / "b.xml"
            old.write_text("<p>same</p>", encoding="utf-8")
            new.write_text("<p>same</p>", encoding="utf-8")
            code, out = self.run_files(["--files", str(old), str(new)])
            self.assertEqual(code, 0, out)
            self.assertIn("no changes between v1 and v2", out)

    def test_missing_file_and_list_conflict_fail_with_one_line_messages(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "old.xml"
            old.write_text("<p>x</p>", encoding="utf-8")
            code, out = self.run_files(["--files", str(old), str(old / "missing")])
            self.assertEqual(code, 1)
            self.assertIn("cannot read", out)
            code, out = self.run_files(["--files", str(old), str(old), "--list"])
            self.assertEqual(code, 1)
            self.assertIn("--list needs a live page", out)

    def test_json_string_and_json_list_payload_files(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "old.json"
            new = pathlib.Path(temp) / "new.json"
            # a bare JSON string is the decoded body, not quoted JSON text
            old.write_text(json.dumps("<p>seven</p>"), encoding="utf-8")
            # a saved LIST response: first object carries body + metadata
            new.write_text(json.dumps([{
                "body": {"storage": {"value": "<p>nine</p>"}},
                "version": {"number": 9, "by": {"displayName": "Example Author"}},
            }]), encoding="utf-8")
            code, out = self.run_files(["--files", str(old), str(new)])
            self.assertEqual(code, 0, out)
            self.assertIn("-seven", out)
            self.assertIn("+nine", out)
            self.assertNotIn('\\"', out, "JSON string bodies are decoded, not quoted")
            self.assertIn("v9: ", out, "list-response metadata reaches the header")
            self.assertIn("author=Example Author", out)

    def test_versions_flag_labels_raw_mode_and_page_argument_rejection(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "old.xml"
            new = pathlib.Path(temp) / "new.xml"
            old.write_text("<p>a</p>", encoding="utf-8")
            new.write_text("<p>b</p>", encoding="utf-8")
            code, out = self.run_files(
                ["--files", str(old), str(new), "--versions", "3", "5", "--raw"])
            self.assertEqual(code, 0, out)
            self.assertIn("--- v3\n+++ v5", out)
            self.assertIn("-<p>a</p>", out, "--raw diffs storage lines verbatim")
            code, out = self.run_files(["12345", "--files", str(old), str(new)])
            self.assertEqual(code, 1)
            self.assertIn("no page argument", out)

    def test_file_mode_still_redacts_environment_credentials(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "old.xml"
            new = pathlib.Path(temp) / "new.xml"
            old.write_text("<p>plain</p>", encoding="utf-8")
            new.write_text("<p>leaked file-mode-secret here</p>", encoding="utf-8")
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                code = confluence_diff.main(
                    ["--files", str(old), str(new)],
                    fetcher=lambda url, headers: self.fail("--files must not fetch"),
                    environ={"CONFLUENCE_TOKEN": "file-mode-secret"},
                )
            self.assertEqual(code, 0)
            self.assertNotIn("file-mode-secret", stdout.getvalue())
            self.assertIn("[redacted]", stdout.getvalue())

    def test_json_without_storage_body_is_an_error_not_a_json_text_diff(self):
        with tempfile.TemporaryDirectory() as temp:
            old = pathlib.Path(temp) / "meta.json"
            new = pathlib.Path(temp) / "body.xml"
            old.write_text(json.dumps({"version": {"number": 7}}), encoding="utf-8")
            new.write_text("<p>x</p>", encoding="utf-8")
            code, out = self.run_files(["--files", str(old), str(new)])
            self.assertEqual(code, 1)
            self.assertIn("no storage body", out)
            self.assertIn("meta.json", out)


if __name__ == "__main__":
    unittest.main()
