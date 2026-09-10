#!/usr/bin/env python3
"""Surgically replace one exact anchor in Confluence storage XHTML.

Live mode fetches the current page, replaces one uniquely matching substring,
writes current version + 1, re-fetches, and prints a verification diff plus a
restore command. File mode performs the same exact replacement on a saved JSON
response or raw storage XHTML without credentials or network access.
"""

from __future__ import annotations

import argparse
from dataclasses import replace as dataclass_replace
import os
import shlex
import sys
from typing import Any, Callable, Mapping
from urllib.error import HTTPError
from urllib.parse import quote

import confluence_diff


FetchFunction = confluence_diff.FetchFunction
PutFunction = Callable[[str, Mapping[str, str], Any], Any]
DEFAULT_MESSAGE = "surgical edit via confluence_patch"


class ConfluencePatchError(confluence_diff.ConfluenceDiffError):
    """An actionable error safe to show on the command line."""


class VersionConflictError(ConfluencePatchError):
    """The page advanced after it was fetched."""


def replace_unique_anchor(body: str, anchor: str, replacement: str) -> str:
    """Replace ``anchor`` exactly once without parsing or re-emitting ``body``."""
    if not anchor:
        raise ConfluencePatchError("anchor must not be empty")
    matches = 0
    offset = 0
    while True:
        index = body.find(anchor, offset)
        if index < 0:
            break
        matches += 1
        offset = index + 1
    if matches == 0:
        raise ConfluencePatchError("anchor not found")
    if matches != 1:
        raise ConfluencePatchError(
            f"anchor matches {matches} times — extend the anchor with more surrounding context"
        )
    return body.replace(anchor, replacement, 1)


def put_json(url: str, headers: Mapping[str, str], payload: Any) -> Any:
    """PUT JSON through confluence_diff's redirect-refusing transport."""
    return confluence_diff.request_json(
        url, headers, method="PUT", payload=payload
    )


def _v2_payload(
    page_id: str,
    title: str,
    body: str,
    version_number: int,
    message: str,
) -> dict[str, Any]:
    return {
        "id": page_id,
        "status": "current",
        "title": title,
        "body": {"representation": "storage", "value": body},
        "version": {"number": version_number, "message": message},
    }


def _v1_payload(
    title: str,
    body: str,
    version_number: int,
    message: str,
) -> dict[str, Any]:
    return {
        "type": "page",
        "title": title,
        "version": {"number": version_number, "message": message},
        "body": {
            "storage": {"value": body, "representation": "storage"},
        },
    }


def _put_validation_error(
    endpoint: str, expected_version: int, got_version: Any
) -> ConfluencePatchError:
    observed = got_version if type(got_version) is int else "unavailable"
    return ConfluencePatchError(
        f"invalid PUT response from {endpoint}: "
        f"expected version {expected_version}, got {observed}"
    )


def _validate_put_response(
    response: Any,
    endpoint: str,
    page_id: str,
    expected_version: int,
) -> None:
    """Require the documented page identity and version without echoing JSON."""
    payload = (
        response[0]
        if isinstance(response, tuple) and len(response) == 2
        else response
    )
    version = payload.get("version") if isinstance(payload, Mapping) else None
    got_version = version.get("number") if isinstance(version, Mapping) else None
    got_id = payload.get("id") if isinstance(payload, Mapping) else None
    if (
        got_id != page_id
        or type(got_version) is not int
        or got_version != expected_version
    ):
        raise _put_validation_error(endpoint, expected_version, got_version)


def _put_request_error(endpoint: str, exc: BaseException) -> ConfluencePatchError:
    status = confluence_diff.status_code(exc)
    detail = f"HTTP {status}" if status is not None else type(exc).__name__
    return ConfluencePatchError(f"PUT failed for {endpoint} ({detail})")


def put_page(
    base: str,
    page_id: str,
    title: str,
    body: str,
    version_number: int,
    message: str,
    headers: Mapping[str, str],
    *,
    preferred_api: str = "v2",
    putter: PutFunction | None = None,
) -> str:
    """Write one new page version and return the API used.

    A v2 endpoint-availability/permission response gets the same v1 fallback
    treatment as confluence_diff's fetches. A 409 is never retried through a
    different API because it means the optimistic version check failed.
    """
    send = put_json if putter is None else putter
    escaped_id = quote(page_id, safe="")

    def send_v1() -> None:
        url = f"{base}/rest/api/content/{escaped_id}"
        try:
            response = send(
                url, headers, _v1_payload(title, body, version_number, message)
            )
        except Exception as exc:
            if confluence_diff.status_code(exc) == 409:
                raise VersionConflictError("page changed since fetch — re-run") from exc
            if isinstance(exc, confluence_diff.ConfluenceDiffError) and not isinstance(
                exc, confluence_diff.RedirectRefusedError
            ):
                raise _put_validation_error(url, version_number, None) from exc
            raise _put_request_error(url, exc) from exc
        _validate_put_response(response, url, page_id, version_number)

    if preferred_api == "v1":
        send_v1()
        return "v1"

    v2_url = f"{base}/api/v2/pages/{escaped_id}"
    try:
        response = send(v2_url, headers, _v2_payload(
            page_id, title, body, version_number, message
        ))
    except Exception as exc:
        status = confluence_diff.status_code(exc)
        if status == 409:
            raise VersionConflictError("page changed since fetch — re-run") from exc
        if status in confluence_diff.FALLBACK_STATUSES:
            send_v1()
            return "v1"
        if isinstance(exc, confluence_diff.ConfluenceDiffError) and not isinstance(
            exc, confluence_diff.RedirectRefusedError
        ):
            raise _put_validation_error(v2_url, version_number, None) from exc
        raise _put_request_error(v2_url, exc) from exc

    _validate_put_response(response, v2_url, page_id, version_number)
    return "v2"


def fetch_current(
    base: str,
    page_id: str,
    headers: Mapping[str, str],
    fetcher: FetchFunction | None = None,
) -> confluence_diff.VersionBody:
    """Fetch the newest listed storage body through confluence_diff."""
    get = confluence_diff.fetch_json if fetcher is None else fetcher
    versions, _api = confluence_diff.list_versions(base, page_id, headers, get)
    if not versions:
        raise ConfluencePatchError("page has no current version")
    number = versions[-1].number
    current = confluence_diff.fetch_version(base, page_id, number, headers, get)
    info = dataclass_replace(
        current.info,
        number=number,
        title=current.info.title or versions[-1].title,
    )
    if not info.title:
        raise ConfluencePatchError("current page response has no title")
    return confluence_diff.VersionBody(
        info, current.body, current.api, current.endpoint
    )


def _intended_version(
    current: confluence_diff.VersionBody,
    body: str,
    message: str,
) -> confluence_diff.VersionBody:
    info = confluence_diff.VersionInfo(
        number=current.info.number + 1,
        message=message,
        title=current.info.title,
    )
    return confluence_diff.VersionBody(info, body, "local-patch", "local")


def verification_report(
    page_id: str,
    before: confluence_diff.VersionBody,
    intended: confluence_diff.VersionBody,
    refetched: confluence_diff.VersionBody | None = None,
) -> str:
    """Format the operator diff and an extra server-normalization diff."""
    observed = intended if refetched is None else refetched
    output = confluence_diff.format_diff(page_id, before, observed)
    if refetched is not None and refetched.body != intended.body:
        normalization_diff = confluence_diff.unified_storage_diff(
            intended.body,
            refetched.body,
            fromfile=f"local-patched-v{intended.info.number}",
            tofile=f"refetched-v{refetched.info.number}",
        )
        output += "INFO: server normalized the storage body\n"
        output += normalization_diff or "no readable changes after server normalization\n"
    return output


def restore_command(base: str, page_id: str, version_number: int) -> str:
    """Return a shell-safe command that restores a prior live version."""
    return shlex.join([
        "python3",
        "tools/confluence_patch.py",
        page_id,
        "--base",
        base,
        "--restore",
        str(version_number),
    ])


def _read_text(path: str, purpose: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", newline="") as handle:
            return handle.read()
    except OSError as exc:
        detail = exc.strerror or type(exc).__name__
        raise ConfluencePatchError(f"cannot read {purpose} {path}: {detail}") from exc
    except UnicodeError as exc:
        raise ConfluencePatchError(f"cannot read {purpose} {path}: invalid UTF-8") from exc


def _write_storage(path: str, body: str) -> None:
    try:
        with open(path, "w", encoding="utf-8", newline="") as handle:
            handle.write(body)
    except OSError as exc:
        raise ConfluencePatchError(
            f"cannot write --out {path} ({type(exc).__name__})"
        ) from exc


def _parser() -> confluence_diff.ArgumentParser:
    parser = confluence_diff.ArgumentParser(
        description=__doc__, allow_abbrev=False
    )
    parser.add_argument("page", nargs="?", help="numeric page id or full page URL")
    parser.add_argument("--file", metavar="INPUT",
                        help="saved JSON response or raw storage XHTML")
    parser.add_argument("--out", metavar="OUTPUT",
                        help="write patched storage XHTML in --file mode")
    find_group = parser.add_mutually_exclusive_group()
    find_group.add_argument("--find", help="exact storage XHTML anchor")
    find_group.add_argument("--find-file", metavar="FILE",
                            help="read exact anchor from FILE")
    replace_group = parser.add_mutually_exclusive_group()
    replace_group.add_argument("--replace", help="replacement text; empty is deletion")
    replace_group.add_argument("--replace-file", metavar="FILE",
                               help="read replacement text from FILE")
    parser.add_argument("--restore", type=int, metavar="VERSION",
                        help="restore this historical body as a new version")
    parser.add_argument("--dry-run", action="store_true",
                        help="print the intended diff without writing")
    parser.add_argument("--message", default=None,
                        help=f"version message (default: {DEFAULT_MESSAGE!r})")
    parser.add_argument("--base", help="site base; overrides CONFLUENCE_BASE")
    parser.add_argument("--email", help="Cloud email; overrides CONFLUENCE_EMAIL")
    parser.add_argument("--token", help="API/PAT token; overrides CONFLUENCE_TOKEN")
    return parser


def _edit_values(args: argparse.Namespace) -> tuple[str, str]:
    if args.find is None and args.find_file is None:
        raise ConfluencePatchError("pass exactly one of --find or --find-file")
    if args.replace is None and args.replace_file is None:
        raise ConfluencePatchError("pass exactly one of --replace or --replace-file")
    anchor = args.find if args.find is not None else _read_text(args.find_file, "--find-file")
    replacement = (
        args.replace
        if args.replace is not None
        else _read_text(args.replace_file, "--replace-file")
    )
    return anchor, replacement


def _redaction_secrets(
    raw_argv: list[str], env: Mapping[str, str]
) -> list[str | None]:
    scanned_tokens, scanned_emails = confluence_diff.prescan_credentials(raw_argv)
    token_candidates = [env.get("CONFLUENCE_TOKEN"), *scanned_tokens]
    email_candidates = [env.get("CONFLUENCE_EMAIL"), *scanned_emails]
    secrets: list[str | None] = [*token_candidates, *email_candidates]
    for token in token_candidates:
        for email in email_candidates:
            secrets.extend(confluence_diff.credential_redactions(token, email))
    return secrets


def main(
    argv: list[str] | None = None,
    *,
    fetcher: FetchFunction | None = None,
    putter: PutFunction | None = None,
    environ: Mapping[str, str] | None = None,
) -> int:
    env = os.environ if environ is None else environ
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    redaction_secrets = _redaction_secrets(raw_argv, env)
    parser = _parser()
    argv_secrets = confluence_diff.argument_redactions(
        raw_argv, parser._option_string_actions
    )
    try:
        args = parser.parse_args(raw_argv)
    except confluence_diff.ConfluenceDiffError as exc:
        message = confluence_diff.redact(
            confluence_diff.one_line(exc, "invalid arguments"),
            [*redaction_secrets, *argv_secrets],
        )
        print(f"CONFLUENCE_PATCH FAIL: {message}")
        return 1

    try:
        if args.restore is not None and args.restore < 1:
            raise ConfluencePatchError("--restore VERSION must be positive")
        if args.file:
            if args.page is not None:
                raise ConfluencePatchError("--file takes no page argument")
            if args.restore is not None:
                raise ConfluencePatchError("--restore needs a live page")
            if not args.out:
                raise ConfluencePatchError("--file requires --out")
            if args.message is not None:
                raise ConfluencePatchError("--message needs a live page")
            anchor, replacement = _edit_values(args)
            before = confluence_diff.read_local_version(args.file, 1)
            patched_body = replace_unique_anchor(before.body, anchor, replacement)
            intended = _intended_version(before, patched_body, DEFAULT_MESSAGE)
            report = verification_report("local file", before, intended)
            if not args.dry_run:
                _write_storage(args.out, patched_body)
            print(confluence_diff.redact(report, redaction_secrets), end="")
            return 0

        if args.page is None:
            raise ConfluencePatchError("pass a page id/URL, or --file INPUT --out OUTPUT")
        if args.out:
            raise ConfluencePatchError("--out is only used with --file")
        if args.restore is not None:
            if any(value is not None for value in (
                    args.find, args.find_file, args.replace, args.replace_file)):
                raise ConfluencePatchError("--restore cannot be combined with find/replace")
            if args.message is not None:
                raise ConfluencePatchError(
                    "--restore uses the fixed message 'restore of v<N>'"
                )
        else:
            anchor, replacement = _edit_values(args)

        page_id, derived_base = confluence_diff.parse_page_reference(args.page)
        base = confluence_diff.resolve_base(args.base, derived_base, env)
        resolved_token = args.token if args.token is not None else env.get("CONFLUENCE_TOKEN")
        resolved_email = args.email if args.email is not None else env.get("CONFLUENCE_EMAIL")
        redaction_secrets.extend(
            confluence_diff.credential_redactions(resolved_token, resolved_email)
        )
        headers = confluence_diff.auth_headers(args.email, args.token, env)
        authorization = headers.get("Authorization")
        redaction_secrets.extend([
            authorization,
            authorization.split(" ", 1)[1]
            if authorization and " " in authorization else None,
        ])
        get = confluence_diff.fetch_json if fetcher is None else fetcher
        current = fetch_current(base, page_id, headers, get)

        if args.restore is not None:
            historical = confluence_diff.fetch_version(
                base, page_id, args.restore, headers, get
            )
            patched_body = historical.body
            message = f"restore of v{args.restore}"
        else:
            patched_body = replace_unique_anchor(current.body, anchor, replacement)
            message = args.message if args.message is not None else DEFAULT_MESSAGE

        intended = _intended_version(current, patched_body, message)
        if args.dry_run:
            report = verification_report(page_id, current, intended)
            print(confluence_diff.redact(report, redaction_secrets), end="")
            return 0

        put_page(
            base,
            page_id,
            current.info.title,
            patched_body,
            intended.info.number,
            message,
            headers,
            preferred_api=current.api,
            putter=putter,
        )
        # From here the PUT has succeeded: ANY verification failure — an
        # exception as much as a wrong version — must still hand the operator
        # the restore command for the prior version.
        try:
            refetched = confluence_diff.fetch_version(
                base, page_id, intended.info.number, headers, get
            )
        except Exception as exc:
            failure = "CONFLUENCE_PATCH FAIL: the edit was written but its "
            failure += "verification fetch failed ("
            if isinstance(exc, (ConfluencePatchError,
                                confluence_diff.ConfluenceDiffError, ValueError)):
                failure += confluence_diff.one_line(exc, "unknown error")
            elif isinstance(exc, HTTPError):
                failure += f"HTTP {exc.code}"
            else:
                # arbitrary transport exceptions can carry serialized
                # Authorization headers — name the type only
                failure += f"unexpected {type(exc).__name__}"
            failure += f")\nprior version: v{current.info.number}\n"
            failure += "restore: " + restore_command(
                base, page_id, current.info.number
            ) + "\n"
            print(confluence_diff.redact(failure, redaction_secrets), end="")
            return 1
        if refetched.info.number != intended.info.number:
            failure = (
                "CONFLUENCE_PATCH FAIL: invalid verification response from "
                f"{refetched.endpoint}: expected version {intended.info.number}, "
                f"got {refetched.info.number}\n"
            )
            failure += f"prior version: v{current.info.number}\n"
            failure += "restore: " + restore_command(
                base, page_id, current.info.number
            ) + "\n"
            print(confluence_diff.redact(failure, redaction_secrets), end="")
            return 1
        report = verification_report(page_id, current, intended, refetched)
        report += f"prior version: v{current.info.number}\n"
        report += "restore: " + restore_command(
            base, page_id, current.info.number
        ) + "\n"
        print(confluence_diff.redact(report, redaction_secrets), end="")
        return 0
    except VersionConflictError:
        print("CONFLUENCE_PATCH FAIL: page changed since fetch — re-run")
        return 1
    except (ConfluencePatchError, confluence_diff.ConfluenceDiffError, ValueError) as exc:
        message = confluence_diff.redact(
            confluence_diff.one_line(exc, "unknown error"), redaction_secrets
        )
        print(f"CONFLUENCE_PATCH FAIL: {message}")
        return 1
    except HTTPError as exc:
        if exc.code == 409:
            print("CONFLUENCE_PATCH FAIL: page changed since fetch — re-run")
        else:
            print(f"CONFLUENCE_PATCH FAIL: request failed (HTTP {exc.code})")
        return 1
    except Exception as exc:
        # Arbitrary fetcher/putter exceptions can include serialized headers or
        # documents, so only their type is safe to print.
        print(f"CONFLUENCE_PATCH FAIL: unexpected {type(exc).__name__}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
