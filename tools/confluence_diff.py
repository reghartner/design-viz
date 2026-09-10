#!/usr/bin/env python3
"""Diff two historical versions of a Confluence page without printing either page.

Usage:
  python3 tools/confluence_diff.py <page-id-or-url> [--versions A B]
      [--base <url>] [--email <email>] [--token <token>]
      [--context N] [--raw] [--out <file>]
  python3 tools/confluence_diff.py <page-id-or-url> [--base <url>] --list
  python3 tools/confluence_diff.py --files <old-file> <new-file>
      [--versions A B] [--context N] [--raw] [--out <file>]

Authentication comes from CONFLUENCE_TOKEN and, for Cloud basic auth,
CONFLUENCE_EMAIL. Command-line values override the environment. By default
the command compares normalized readable text from the two newest versions;
--raw compares storage XHTML lines instead.

--files needs no credentials and makes no requests: each file is either a
saved JSON API/MCP response (the storage body and version metadata are
extracted from it) or the raw storage XHTML itself. Use it when another
tool — such as a Confluence MCP server — already fetched the two versions.
"""

from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
import difflib
from html import unescape
from html.parser import HTMLParser
import json
import os
import re
import sys
from typing import Any, Callable, Iterable, Mapping
from urllib.error import HTTPError
from urllib.parse import parse_qs, quote, urlencode, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener


FetchFunction = Callable[[str, Mapping[str, str]], Any]
FALLBACK_STATUSES = {400, 401, 403, 404, 410}
BLOCK_TAGS = {"p", "blockquote", "pre", "tr", "li", *(f"h{n}" for n in range(1, 7))}


class ConfluenceDiffError(Exception):
    """An actionable error safe to show on the command line."""


class RedirectRefusedError(ConfluenceDiffError):
    """A redirect was stopped before authentication could be forwarded."""


class MissingBodyError(ConfluenceDiffError):
    """A successful response did not contain a usable storage body."""


class ArgumentParser(argparse.ArgumentParser):
    """Turn argparse usage failures into the tool's one-line exit contract."""

    def error(self, message: str) -> None:
        raise ConfluenceDiffError(message)


class RejectRedirectHandler(HTTPRedirectHandler):
    """Refuse redirects so authenticated requests never change origin."""

    def redirect_request(
        self,
        req: Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> Request | None:
        destination = urlsplit(urljoin(req.full_url, newurl))
        host = destination.hostname or "(unknown host)"
        raise RedirectRefusedError(
            f"redirect refused to host {host}; authentication was not forwarded"
        )


@dataclass(frozen=True)
class VersionInfo:
    number: int
    when: str = ""
    author: str = ""
    message: str = ""
    title: str = ""


@dataclass(frozen=True)
class VersionBody:
    info: VersionInfo
    body: str
    api: str
    endpoint: str


def parse_page_reference(value: str) -> tuple[str, str | None]:
    """Return ``(numeric page id, derived base or None)`` for an id or URL."""
    candidate = value.strip()
    if re.fullmatch(r"[0-9]+", candidate):
        return candidate, None

    parsed = urlsplit(candidate)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("page must be a numeric id or a full http(s) Confluence page URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("page URL must not contain credentials")

    path_match = re.search(r"(?:^|/)pages/([0-9]+)(?:/|$)", parsed.path)
    page_id = path_match.group(1) if path_match else None
    if page_id is None:
        query = parse_qs(parsed.query)
        for key, values in query.items():
            if key.lower() == "pageid" and values and re.fullmatch(r"[0-9]+", values[0]):
                page_id = values[0]
                break
    if page_id is None:
        raise ValueError("page URL has no numeric /pages/<id>/ path or pageId query parameter")
    return page_id, derive_base_from_page_url(candidate)


def parse_page_input(value: str) -> tuple[str, str | None]:
    """Compatibility name for callers that describe the positional as input."""
    return parse_page_reference(value)


def derive_base_from_page_url(value: str) -> str:
    """Derive the API base specified for Cloud and non-Cloud page URLs."""
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("cannot derive a base from a non-http(s) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("page URL must not contain credentials")
    path = "/wiki" if (parsed.hostname or "").lower().endswith(".atlassian.net") else ""
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, path, "", ""))


def normalize_base(value: str) -> str:
    """Validate and canonicalize a user-supplied API base URL."""
    parsed = urlsplit(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("base must be a full http(s) URL")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("base URL must not contain credentials")
    if parsed.query or parsed.fragment:
        raise ValueError("base URL must not contain a query or fragment")
    path = parsed.path.rstrip("/")
    return urlunsplit((parsed.scheme.lower(), parsed.netloc, path, "", ""))


def resolve_base(
    explicit: str | None,
    derived: str | None,
    environ: Mapping[str, str] | None = None,
) -> str:
    """Resolve --base, then CONFLUENCE_BASE, then the page URL's base."""
    env = os.environ if environ is None else environ
    value = explicit if explicit is not None else env.get("CONFLUENCE_BASE") or derived
    if not value:
        raise ValueError("no base URL; pass --base or set CONFLUENCE_BASE")
    return normalize_base(value)


def auth_headers(
    email: str | None = None,
    token: str | None = None,
    environ: Mapping[str, str] | None = None,
) -> dict[str, str]:
    """Build Basic (email + token) or Bearer (token only) request headers."""
    env = os.environ if environ is None else environ
    resolved_email = email if email is not None else env.get("CONFLUENCE_EMAIL")
    resolved_token = token if token is not None else env.get("CONFLUENCE_TOKEN")
    if not resolved_token:
        raise ValueError("no token; pass --token or set CONFLUENCE_TOKEN")
    if resolved_email:
        credentials = f"{resolved_email}:{resolved_token}".encode("utf-8")
        authorization = "Basic " + base64.b64encode(credentials).decode("ascii")
    else:
        authorization = "Bearer " + resolved_token
    return {"Accept": "application/json", "Authorization": authorization}


def request_json(
    url: str,
    headers: Mapping[str, str],
    *,
    method: str = "GET",
    payload: Any = None,
) -> tuple[Any, dict[str, str]]:
    """Request JSON through the redirect-refusing transport.

    ``payload`` is serialized only when supplied. Tests normally replace this
    network boundary, while sibling tools reuse it so authenticated writes get
    the same redirect protections as reads.
    """
    request_headers = dict(headers)
    data = None
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")
    request = Request(url, data=data, headers=request_headers, method=method)
    opener = build_opener(RejectRedirectHandler())
    with opener.open(request) as response:
        raw = response.read()
        response_headers = dict(response.headers.items())
        if not raw:
            return None, response_headers
        charset = response.headers.get_content_charset() or "utf-8"
        try:
            decoded = json.loads(raw.decode(charset))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise ConfluenceDiffError(f"invalid JSON returned by {url}") from exc
        return decoded, response_headers


def fetch_json(url: str, headers: Mapping[str, str]) -> tuple[Any, dict[str, str]]:
    """GET JSON and response headers. Tests replace this network boundary."""
    return request_json(url, headers)


def _payload_and_headers(response: Any) -> tuple[Any, Mapping[str, str]]:
    if isinstance(response, tuple) and len(response) == 2:
        payload, headers = response
        return payload, headers if isinstance(headers, Mapping) else {}
    return response, {}


def status_code(exc: BaseException) -> int | None:
    """Return a conventional HTTP status attribute from an exception."""
    for name in ("code", "status", "status_code"):
        value = getattr(exc, name, None)
        if isinstance(value, int):
            return value
    return None


def _fetch_failure(url: str, exc: BaseException) -> ConfluenceDiffError:
    status = status_code(exc)
    detail = f"HTTP {status}" if status is not None else type(exc).__name__
    return ConfluenceDiffError(f"request failed for {url} ({detail})")


def _header(headers: Mapping[str, str], name: str) -> str | None:
    wanted = name.lower()
    for key, value in headers.items():
        if str(key).lower() == wanted:
            return str(value)
    return None


def _same_origin(current: str, following: str) -> bool:
    left, right = urlsplit(current), urlsplit(following)
    return (left.scheme.lower(), left.netloc.lower()) == (right.scheme.lower(), right.netloc.lower())


def _with_cursor(current: str, cursor: str) -> str:
    parsed = urlsplit(current)
    query = parse_qs(parsed.query, keep_blank_values=True)
    query["cursor"] = [cursor]
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path,
                       urlencode(query, doseq=True), parsed.fragment))


def _next_url(current: str, payload: Any, headers: Mapping[str, str]) -> str | None:
    next_value: Any = None
    if isinstance(payload, dict):
        links = payload.get("_links")
        if isinstance(links, dict):
            next_value = links.get("next")
        if not next_value:
            next_value = payload.get("next") or payload.get("nextCursor")
    if isinstance(next_value, dict):
        next_value = next_value.get("href") or next_value.get("url") or next_value.get("cursor")

    link_header = _header(headers, "Link")
    if not next_value and link_header:
        for part in link_header.split(","):
            match = re.search(r"<([^>]+)>\s*;[^,]*\brel\s*=\s*[\"']?next[\"']?", part,
                              re.IGNORECASE)
            if match:
                next_value = match.group(1)
                break

    if isinstance(next_value, str) and next_value.strip():
        next_value = next_value.strip()
        if not re.search(r"[/?=]", next_value) and not next_value.startswith("http"):
            following = _with_cursor(current, next_value)
        else:
            following = urljoin(current, next_value)
        if not _same_origin(current, following):
            raise ConfluenceDiffError("pagination link changed origin; refusing to forward authentication")
        return following

    # Older v1 servers may expose only offset metadata.
    if isinstance(payload, dict):
        start, limit, size, total = (
            payload.get("start"), payload.get("limit"), payload.get("size"),
            payload.get("totalSize", payload.get("total")),
        )
        if all(isinstance(value, int) for value in (start, limit, size)) and size:
            more = start + size < total if isinstance(total, int) else size >= limit
            if more:
                parsed = urlsplit(current)
                query = parse_qs(parsed.query, keep_blank_values=True)
                query["start"] = [str(start + size)]
                return urlunsplit((parsed.scheme, parsed.netloc, parsed.path,
                                   urlencode(query, doseq=True), parsed.fragment))
    return None


def _results(payload: Any, endpoint: str) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict):
        for key in ("results", "values", "versions"):
            value = payload.get(key)
            if isinstance(value, list):
                return [item for item in value if isinstance(item, dict)]
    raise ConfluenceDiffError(f"version list response from {endpoint} has no results array")


def _dig(value: Any, *path: str) -> Any:
    for key in path:
        if not isinstance(value, dict):
            return None
        value = value.get(key)
    return value


def _first_string(values: Iterable[Any]) -> str:
    for value in values:
        if isinstance(value, str) and value:
            return value
    return ""


def version_info(value: Any, fallback_number: int = 0) -> VersionInfo:
    """Normalize common v1/v2 version metadata shapes."""
    item = value if isinstance(value, dict) else {}
    wrapper = next((item.get(key) for key in ("result", "data", "page")
                    if isinstance(item.get(key), dict)), {})
    if wrapper:
        # A few v2 deployments wrap the version resource while others return
        # it directly. Keep direct fields authoritative and fill from wrapper.
        item = {**wrapper, **item}
    nested = item.get("version") if isinstance(item.get("version"), dict) else {}
    number = item.get("number", nested.get("number", fallback_number))
    try:
        parsed_number = int(number)
    except (TypeError, ValueError):
        parsed_number = fallback_number

    author_objects = [
        item.get("author"), item.get("by"), nested.get("author"), nested.get("by")
    ]
    display_name = _first_string(
        obj.get("displayName") if isinstance(obj, dict) else None for obj in author_objects
    )
    author_id = _first_string([
        item.get("authorId"), nested.get("authorId"),
        *(
            candidate
            for obj in author_objects if isinstance(obj, dict)
            for candidate in (obj.get("authorId"), obj.get("accountId"), obj.get("username"), obj.get("id"))
        ),
    ])
    return VersionInfo(
        number=parsed_number,
        when=_first_string([
            item.get("createdAt"), item.get("when"), item.get("created_at"),
            nested.get("createdAt"), nested.get("when"), nested.get("created_at"),
        ]),
        author=display_name or author_id,
        message=_first_string([item.get("message"), nested.get("message")]),
        title=_first_string([
            item.get("title"), nested.get("title"), _dig(item, "content", "title"),
            _dig(nested, "content", "title"),
        ]),
    )


def _merge_info(primary: VersionInfo, fallback: VersionInfo | None) -> VersionInfo:
    if fallback is None:
        return primary
    return VersionInfo(
        primary.number or fallback.number,
        primary.when or fallback.when,
        primary.author or fallback.author,
        primary.message or fallback.message,
        primary.title or fallback.title,
    )


def _list_api(
    initial_url: str,
    headers: Mapping[str, str],
    fetcher: FetchFunction,
) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()
    url: str | None = initial_url
    while url:
        if url in seen:
            raise ConfluenceDiffError(f"pagination loop detected at {url}")
        seen.add(url)
        payload, response_headers = _payload_and_headers(fetcher(url, headers))
        items.extend(_results(payload, url))
        url = _next_url(url, payload, response_headers)
    return items


def list_versions(
    base: str,
    page_id: str,
    headers: Mapping[str, str],
    fetcher: FetchFunction | None = None,
) -> tuple[list[VersionInfo], str]:
    """List all versions through v2, falling back to v1 on 400/404/410."""
    get = fetch_json if fetcher is None else fetcher
    v2_url = f"{base}/api/v2/pages/{quote(page_id, safe='')}/versions?" + urlencode({
        "limit": 200,
    })
    try:
        raw = _list_api(v2_url, headers, get)
        api = "v2"
    except Exception as exc:
        if status_code(exc) not in FALLBACK_STATUSES:
            if isinstance(exc, ConfluenceDiffError):
                raise
            raise _fetch_failure(v2_url, exc) from exc
        v1_url = f"{base}/rest/api/content/{quote(page_id, safe='')}/version?" + urlencode({
            "expand": "content", "limit": 200,
        })
        try:
            raw = _list_api(v1_url, headers, get)
        except Exception as fallback_exc:
            if isinstance(fallback_exc, ConfluenceDiffError):
                raise
            raise _fetch_failure(v1_url, fallback_exc) from fallback_exc
        api = "v1"

    by_number: dict[int, VersionInfo] = {}
    for item in raw:
        info = version_info(item)
        if info.number > 0:
            by_number[info.number] = info
    return [by_number[number] for number in sorted(by_number)], api


def extract_storage_body(payload: Any) -> str | None:
    """Probe common direct and wrapped v1/v2 storage-body response shapes."""
    roots = [payload]
    seen: set[int] = set()
    while roots:
        root = roots.pop(0)
        if not isinstance(root, dict):
            continue
        identity = id(root)
        if identity in seen:
            continue
        seen.add(identity)
        candidates = [
            _dig(root, "body", "storage", "value"),
            _dig(root, "body", "storage"),
            _dig(root, "body", "value"),
            _dig(root, "storage", "value"),
            root.get("storage"),
            _dig(root, "bodyStorage", "value"),
            root.get("bodyStorage"),
        ]
        for candidate in candidates:
            if isinstance(candidate, str):
                return candidate
        for key in ("result", "data", "page", "content", "version"):
            nested = root.get(key)
            if isinstance(nested, dict):
                roots.append(nested)
        results = root.get("results")
        if isinstance(results, list):
            roots.extend(item for item in results if isinstance(item, dict))
    return None


def _fetch_one(
    url: str,
    number: int,
    api: str,
    headers: Mapping[str, str],
    fetcher: FetchFunction,
) -> VersionBody:
    payload, _response_headers = _payload_and_headers(fetcher(url, headers))
    body = extract_storage_body(payload)
    if body is None:
        raise MissingBodyError(f"no storage body in response from {url}")
    return VersionBody(version_info(payload, number), body, api, url)


def _body_fetch_failure(endpoints: Iterable[str], exc: BaseException) -> ConfluenceDiffError:
    tried = "; ".join(endpoints)
    if isinstance(exc, MissingBodyError):
        detail = "last response had no extractable storage body"
    elif isinstance(exc, RedirectRefusedError):
        detail = str(exc)
    else:
        status = status_code(exc)
        detail = f"last request returned HTTP {status}" if status is not None else (
            f"last request failed with {type(exc).__name__}"
        )
    return ConfluenceDiffError(
        f"unable to fetch historical storage body; endpoints tried: {tried} ({detail})"
    )


def fetch_version(
    base: str,
    page_id: str,
    number: int,
    headers: Mapping[str, str],
    fetcher: FetchFunction | None = None,
) -> VersionBody:
    """Fetch one historical body through v2 page lookup, then v1 historical content."""
    get = fetch_json if fetcher is None else fetcher
    escaped_id = quote(page_id, safe="")
    v2_url = f"{base}/api/v2/pages/{escaped_id}?" + urlencode({
        "body-format": "storage", "version": number,
    })
    try:
        return _fetch_one(v2_url, number, "v2", headers, get)
    except Exception as exc:
        should_fallback = isinstance(exc, MissingBodyError) or status_code(exc) in FALLBACK_STATUSES
        if not should_fallback:
            if isinstance(exc, RedirectRefusedError):
                raise _body_fetch_failure([v2_url], exc) from exc
            if isinstance(exc, ConfluenceDiffError):
                raise
            raise _body_fetch_failure([v2_url], exc) from exc

    v1_url = f"{base}/rest/api/content/{escaped_id}?" + urlencode({
        "status": "historical", "version": number, "expand": "body.storage,version",
    })
    try:
        return _fetch_one(v1_url, number, "v1", headers, get)
    except Exception as exc:
        raise _body_fetch_failure([v2_url, v1_url], exc) from exc


@dataclass
class _LineContext:
    tag: str
    order: int
    fragments: list[str]
    list_level: int = 0
    cells: list[list[str]] | None = None
    cell_index: int | None = None


class StorageTextParser(HTMLParser):
    """Loss-tolerant storage XHTML to stable, semantic text lines."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.elements: list[tuple[str, _LineContext | None]] = []
        self.contexts: list[_LineContext] = []
        self.anchors: list[tuple[str, list[str]]] = []
        self.records: list[tuple[int, list[str]]] = []
        self.loose: _LineContext | None = None
        self.counter = 0

    def _order(self) -> int:
        self.counter += 1
        return self.counter

    def _active(self, tag: str) -> bool:
        return any(element_tag == tag for element_tag, _context in self.elements)

    def _append(self, value: str) -> None:
        if not value:
            return
        if self.anchors:
            self.anchors[-1][1].append(value)
            return
        if self.contexts:
            context = self.contexts[-1]
            if context.tag == "tr" and context.cells is not None:
                if context.cell_index is not None:
                    context.cells[context.cell_index].append(value)
                return
            context.fragments.append(value)
            return
        if self.loose is None:
            self.loose = _LineContext("text", self._order(), [])
        self.loose.fragments.append(value)

    def _flush_loose(self) -> None:
        if self.loose is not None:
            self._finish_context(self.loose)
            self.loose = None

    def _separate_table_cell(self) -> _LineContext | None:
        table = next((item for item in reversed(self.contexts) if item.tag == "tr"), None)
        if table is None or table.cells is None or table.cell_index is None:
            return None
        cell = table.cells[table.cell_index]
        joined = "".join(cell)
        if _collapse(joined) and not joined.rstrip(" \t\r").endswith("\n"):
            cell.append("\n")
        return table

    def _start_context(self, tag: str) -> _LineContext | None:
        if tag != "tr" and self._separate_table_cell() is not None:
            return None
        # Paragraph wrappers inside an already semantic block do not create a
        # duplicate line; their readable text belongs to that outer block.
        if tag == "p" and self.contexts and self.contexts[-1].tag in {
                "li", "blockquote", "pre", "tr"}:
            return None
        self._flush_loose()
        level = sum(context.tag == "li" for context in self.contexts)
        context = _LineContext(
            tag, self._order(), [], list_level=level,
            cells=[] if tag == "tr" else None,
        )
        self.contexts.append(context)
        return context

    def _finish_context(self, context: _LineContext) -> None:
        lines: list[str] = []
        if context.tag == "tr" and context.cells is not None:
            cells = [
                "; ".join(
                    part for part in (_collapse(value) for value in "".join(cell).splitlines())
                    if part
                )
                for cell in context.cells
            ]
            if any(cells):
                lines = [" | ".join(cells)]
        elif context.tag == "pre":
            lines = [_collapse(line) for line in "".join(context.fragments).splitlines()]
            lines = [line for line in lines if line]
        else:
            line = _collapse("".join(context.fragments))
            if line:
                if re.fullmatch(r"h[1-6]", context.tag):
                    line = "#" * int(context.tag[1]) + " " + line
                elif context.tag == "li":
                    line = "  " * context.list_level + "- " + line
                lines = [line]
        if lines:
            self.records.append((context.order, lines))

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        lowered = tag.lower()
        attributes = {key.lower(): value or "" for key, value in attrs}
        context: _LineContext | None = None
        if lowered in BLOCK_TAGS:
            context = self._start_context(lowered)
        elif lowered in {"td", "th"}:
            table = next((item for item in reversed(self.contexts) if item.tag == "tr"), None)
            if table is not None and table.cells is not None:
                table.cells.append([])
                table.cell_index = len(table.cells) - 1
        elif lowered == "a":
            self.anchors.append((attributes.get("href", ""), []))
        elif lowered == "br":
            self._append("\n")
        elif lowered == "ac:structured-macro":
            self._flush_loose()
            name = attributes.get("ac:name") or attributes.get("name") or "unknown"
            self.records.append((self._order(), [f"[macro:{_collapse(name) or 'unknown'}]"]))
        elif lowered == "ri:page" and self._active("ac:link"):
            title = attributes.get("ri:content-title") or attributes.get("content-title")
            if title:
                self._append(f"[page-link:{_collapse(title)}]")
        elif lowered == "ri:attachment" and self._active("ac:image"):
            filename = attributes.get("ri:filename") or attributes.get("filename")
            if filename:
                self._append(f"[image:{_collapse(filename)}]")
        self.elements.append((lowered, context))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        lowered = tag.lower()
        match = next((index for index in range(len(self.elements) - 1, -1, -1)
                      if self.elements[index][0] == lowered), None)
        if match is None:
            return
        closing = self.elements[match:]
        del self.elements[match:]
        for element_tag, context in reversed(closing):
            if element_tag == "a" and self.anchors:
                href, fragments = self.anchors.pop()
                label = _collapse("".join(fragments))
                if label or href:
                    shown = label or href
                    self._append(f"[{shown}]({href})" if href else shown)
            if element_tag in {"td", "th"}:
                table = next((item for item in reversed(self.contexts) if item.tag == "tr"), None)
                if table is not None:
                    table.cell_index = None
            if element_tag in BLOCK_TAGS and context is None:
                self._separate_table_cell()
            if context is not None and context in self.contexts:
                self.contexts.remove(context)
                self._finish_context(context)

    def handle_data(self, data: str) -> None:
        self._append(data)

    def unknown_decl(self, data: str) -> None:
        # Confluence plain-text macro bodies commonly use CDATA sections.
        if data.startswith("CDATA["):
            self._append(data[6:])

    def finish(self) -> list[str]:
        try:
            self.close()
        except Exception:
            pass
        while self.anchors:
            href, fragments = self.anchors.pop()
            label = _collapse("".join(fragments))
            self._append(f"[{label or href}]({href})" if href else label)
        for context in list(reversed(self.contexts)):
            self._finish_context(context)
        self.contexts.clear()
        self._flush_loose()
        self.records.sort(key=lambda record: record[0])
        return [line for _order, lines in self.records for line in lines if line]


def _collapse(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_storage(value: str) -> str:
    """Convert storage XHTML to stable readable lines, never raising on markup."""
    parser = StorageTextParser()
    try:
        parser.feed(value if isinstance(value, str) else str(value))
        return "\n".join(parser.finish())
    except Exception:
        # HTMLParser is forgiving, but a final plain-text degradation keeps
        # arbitrary input from turning a document diff into a tool failure.
        raw = value if isinstance(value, str) else str(value)
        return _collapse(unescape(re.sub(r"<[^>]*>", " ", raw)))


def one_line(value: Any, empty: str = "") -> str:
    """Collapse arbitrary metadata to one printable line."""
    shown = _collapse(str(value)) if value is not None else ""
    return shown or empty


def format_version_table(versions: Iterable[VersionInfo]) -> str:
    lines = ["number\twhen\tauthor\tmessage"]
    for item in versions:
        lines.append("\t".join([
            str(item.number), one_line(item.when), one_line(item.author),
            one_line(item.message),
        ]))
    return "\n".join(lines) + "\n"


def format_diff(
    page_id: str,
    older: VersionBody,
    newer: VersionBody,
    *,
    context: int = 3,
    raw: bool = False,
) -> str:
    """Return metadata plus a unified diff containing only changed hunks."""
    title = newer.info.title or older.info.title
    page_line = f"page: {page_id}" + (f" | title: {one_line(title)}" if title else "")

    def metadata(version: VersionBody) -> str:
        info = version.info
        return (
            f"v{info.number}: when={one_line(info.when, '(unknown)')} | "
            f"author={one_line(info.author, '(unknown)')} | "
            f"message={one_line(info.message, '(none)')} | api={version.api}"
        )

    header = [page_line, metadata(older), metadata(newer)]
    diff = unified_storage_diff(
        older.body,
        newer.body,
        fromfile=f"v{older.info.number}",
        tofile=f"v{newer.info.number}",
        context=context,
        raw=raw,
    )
    if not diff:
        header.append(f"no changes between v{older.info.number} and v{newer.info.number}")
        return "\n".join(header) + "\n"
    return "\n".join([*header, diff.rstrip("\n")]) + "\n"


def unified_storage_diff(
    older_body: str,
    newer_body: str,
    *,
    fromfile: str,
    tofile: str,
    context: int = 3,
    raw: bool = False,
) -> str:
    """Return only changed hunks for two storage bodies.

    Normalization is presentation-only. Callers retain and write their
    original storage strings without a parse/re-serialize round trip.
    """
    old_text = older_body if raw else normalize_storage(older_body)
    new_text = newer_body if raw else normalize_storage(newer_body)
    diff = difflib.unified_diff(
        old_text.splitlines(), new_text.splitlines(),
        fromfile=fromfile, tofile=tofile, n=context, lineterm="",
    )
    output = "\n".join(diff)
    return output + "\n" if output else ""


def redact(value: str, secrets: Iterable[str | None]) -> str:
    """Replace each secret with [redacted], in every form a message can carry
    it: verbatim, whitespace-collapsed (error text is line-normalized), and
    repr-escaped (argparse quotes bad values with repr)."""
    unique: set[str] = set()
    for secret in secrets:
        if not secret:
            continue
        rep = repr(secret)
        for form in (secret, " ".join(secret.split()), rep, rep[1:-1]):
            if len(form) >= 2:
                unique.add(form)
    for secret in sorted(unique, key=len, reverse=True):
        value = value.replace(secret, "[redacted]")
    return value


def prescan_credentials(argv: Iterable[str]) -> tuple[list[str], list[str]]:
    """Collect credential-shaped option values before argparse can echo them.

    Matches any PREFIX of token/email behind any number of dashes (a
    mistyped "--tok SECRET", "-token SECRET", "-t SECRET"): abbreviation is
    disabled on the parser, so such a flag fails to parse and its value
    would otherwise be echoed unredacted. Over-capturing here is harmless —
    entries only join the redaction set."""
    values = list(argv)
    tokens: list[str] = []
    emails: list[str] = []
    destinations = {"token": tokens, "email": emails}
    for index, value in enumerate(values):
        flag, eq, inline = value.partition("=")
        if not flag.startswith("-"):
            continue
        stem = flag.lstrip("-")
        if not stem:
            continue
        for option, destination in destinations.items():
            if not option.startswith(stem):
                continue
            if eq:
                destination.append(inline)
            elif index + 1 < len(values):
                destination.append(values[index + 1])
    return tokens, emails


def credential_redactions(token: str | None, email: str | None) -> list[str | None]:
    secrets: list[str | None] = [token, email]
    if token and email:
        raw = f"{email}:{token}"
        encoded = base64.b64encode(raw.encode("utf-8")).decode("ascii")
        secrets.extend([raw, encoded, f"Basic {encoded}"])
    if token:
        secrets.append(f"Bearer {token}")
    return secrets


def argument_redactions(
    argv: Iterable[str], known_options: Iterable[str]
) -> list[str]:
    """Collect argv values that argparse might repeat in a parse error.

    Option names remain readable. Every other element, plus inline ``=``
    values, joins the parse-error-only redaction set.
    """
    options = set(known_options)
    secrets: list[str] = []
    for element in argv:
        if element not in options:
            secrets.append(element)
        _stem, separator, inline = element.partition("=")
        if separator and inline:
            secrets.append(inline)
    return secrets


def read_local_version(path: str, fallback_number: int) -> VersionBody:
    """Build a VersionBody from a local file, for pipelines where another
    tool (e.g. a Confluence MCP server) already fetched the versions.

    Accepts either a saved JSON API/MCP response — the storage body and any
    version metadata are extracted with the same probes as a live fetch —
    or the raw storage XHTML itself. A JSON object/array with no extractable
    body is an error rather than a silent JSON-text diff."""
    try:
        with open(path, "r", encoding="utf-8", newline="") as handle:
            text = handle.read()
    except OSError as exc:
        raise ConfluenceDiffError(
            f"cannot read {path}: {exc.strerror or type(exc).__name__}") from exc
    body: str | None = None
    info = VersionInfo(number=fallback_number)
    if text.lstrip()[:1] in ("{", "[", '"'):
        try:
            payload = json.loads(text)
        except ValueError:
            payload = None
        if isinstance(payload, list):
            # a saved list response: the first dict item is the record —
            # version_info cannot see through a synthetic wrapper
            payload = next((item for item in payload if isinstance(item, dict)), None)
            if payload is None:
                raise MissingBodyError(
                    f"{path}: JSON list holds no response objects")
        if isinstance(payload, str):
            body = payload
        elif isinstance(payload, dict):
            body = extract_storage_body(payload)
            if body is None:
                raise MissingBodyError(
                    f"{path}: JSON carries no storage body — save the "
                    "body.storage.value content, the raw storage XHTML, or "
                    "the full API response")
            info = version_info(payload, fallback_number)
    if body is None:
        body = text
    return VersionBody(info, body, "file:" + os.path.basename(path), path)


def _emit(value: str, output_path: str | None) -> None:
    if output_path:
        try:
            with open(output_path, "w", encoding="utf-8") as handle:
                handle.write(value)
        except OSError as exc:
            raise ConfluenceDiffError(f"cannot write --out {output_path} ({exc.__class__.__name__})") from exc
    else:
        print(value, end="")


def _parser() -> ArgumentParser:
    # allow_abbrev=False: an abbreviated "--tok SECRET" must fail parsing (and
    # be caught by the credential pre-scan) instead of silently matching
    parser = ArgumentParser(description=__doc__, allow_abbrev=False)
    parser.add_argument("page", nargs="?",
                        help="numeric page id or full Confluence page URL "
                             "(omit when using --files)")
    parser.add_argument("--files", nargs=2, metavar=("OLD", "NEW"),
                        help="diff two local files instead of fetching: each is "
                             "a saved JSON API/MCP response or raw storage "
                             "XHTML; no credentials or network used")
    parser.add_argument("--base", help="site base; overrides CONFLUENCE_BASE")
    parser.add_argument("--email", help="Cloud email; overrides CONFLUENCE_EMAIL")
    parser.add_argument("--token", help="API/PAT token; overrides CONFLUENCE_TOKEN")
    parser.add_argument("--versions", nargs=2, type=int, metavar=("A", "B"))
    parser.add_argument("--list", action="store_true", help="list page versions and exit")
    parser.add_argument("--context", type=int, default=3,
                        help="unified diff context lines (default: 3)")
    parser.add_argument("--raw", action="store_true", help="diff storage XHTML verbatim")
    parser.add_argument("--out", metavar="FILE", help="write output to FILE")
    return parser


def main(
    argv: list[str] | None = None,
    *,
    fetcher: FetchFunction | None = None,
    environ: Mapping[str, str] | None = None,
) -> int:
    env = os.environ if environ is None else environ
    raw_argv = list(sys.argv[1:] if argv is None else argv)
    scanned_tokens, scanned_emails = prescan_credentials(raw_argv)
    token_candidates = [env.get("CONFLUENCE_TOKEN"), *scanned_tokens]
    email_candidates = [env.get("CONFLUENCE_EMAIL"), *scanned_emails]
    redaction_secrets: list[str | None] = [*token_candidates, *email_candidates]
    for token in token_candidates:
        for email in email_candidates:
            redaction_secrets.extend(credential_redactions(token, email))
    # Parse in its own guard: a parse error can echo arbitrary argv (typo'd
    # flags, values in wrong positions), any of which may be a pasted
    # credential the prefix pre-scan cannot anticipate. Redact from the error
    # every argv element — and every "=" value part — that is not a known
    # option name; only option names themselves stay readable.
    parser = _parser()
    known_options = set(parser._option_string_actions)
    argv_secrets = argument_redactions(raw_argv, known_options)
    try:
        args = parser.parse_args(raw_argv)
    except ConfluenceDiffError as exc:
        message = redact(one_line(exc, "invalid arguments"),
                         [*redaction_secrets, *argv_secrets])
        print(f"CONFLUENCE_DIFF FAIL: {message}")
        return 1
    try:
        if args.context < 0:
            raise ConfluenceDiffError("--context must be zero or greater")
        if args.versions and (args.versions[0] < 1 or args.versions[1] < 1 or
                              args.versions[0] >= args.versions[1]):
            raise ConfluenceDiffError("--versions requires positive A B with A older than B")

        if args.files:
            if args.list:
                raise ConfluenceDiffError("--list needs a live page; it cannot be used with --files")
            if args.page is not None:
                raise ConfluenceDiffError("--files takes exactly two files and no page argument")
            fallback_old, fallback_new = args.versions if args.versions else (1, 2)
            older = read_local_version(args.files[0], fallback_old)
            newer = read_local_version(args.files[1], fallback_new)
            output = format_diff("local files", older, newer, context=args.context, raw=args.raw)
            _emit(redact(output, redaction_secrets), args.out)
            return 0
        if args.page is None:
            raise ConfluenceDiffError("pass a page id/URL, or --files OLD NEW")

        page_id, derived_base = parse_page_reference(args.page)
        base = resolve_base(args.base, derived_base, env)
        resolved_token = args.token if args.token is not None else env.get("CONFLUENCE_TOKEN")
        resolved_email = args.email if args.email is not None else env.get("CONFLUENCE_EMAIL")
        redaction_secrets.extend(credential_redactions(resolved_token, resolved_email))
        headers = auth_headers(args.email, args.token, env)
        authorization = headers.get("Authorization")
        redaction_secrets.extend([
            authorization,
            authorization.split(" ", 1)[1] if authorization and " " in authorization else None,
        ])
        get = fetch_json if fetcher is None else fetcher

        if args.list:
            versions, _api = list_versions(base, page_id, headers, get)
            _emit(redact(format_version_table(versions), redaction_secrets), args.out)
            return 0

        listed: list[VersionInfo] = []
        if args.versions:
            older_number, newer_number = args.versions
        else:
            listed, _api = list_versions(base, page_id, headers, get)
            if len(listed) < 2:
                raise ConfluenceDiffError("page has fewer than two versions to compare")
            older_number, newer_number = listed[-2].number, listed[-1].number

        older = fetch_version(base, page_id, older_number, headers, get)
        newer = fetch_version(base, page_id, newer_number, headers, get)
        if listed:
            by_number = {item.number: item for item in listed}
            older = VersionBody(_merge_info(older.info, by_number.get(older_number)),
                                older.body, older.api, older.endpoint)
            newer = VersionBody(_merge_info(newer.info, by_number.get(newer_number)),
                                newer.body, newer.api, newer.endpoint)
        output = format_diff(page_id, older, newer, context=args.context, raw=args.raw)
        _emit(redact(output, redaction_secrets), args.out)
        return 0
    except (ConfluenceDiffError, ValueError) as exc:
        message = redact(one_line(exc, "unknown error"), redaction_secrets)
        print(f"CONFLUENCE_DIFF FAIL: {message}")
        return 1
    except HTTPError as exc:
        message = f"request failed (HTTP {exc.code})"
        print(f"CONFLUENCE_DIFF FAIL: {message}")
        return 1
    except Exception as exc:
        # Do not interpolate arbitrary transport/fetcher exceptions: they can
        # contain serialized Authorization headers.
        print(f"CONFLUENCE_DIFF FAIL: unexpected {type(exc).__name__}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
