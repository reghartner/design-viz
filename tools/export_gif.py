#!/usr/bin/env python3
"""Export a diagram step-through from a built page as an animated GIF.

Usage:
  python3 tools/export_gif.py <built-page.html> [--section <n>]
      [--width 1280] [--delay-ms 1600] [--out <path.gif | directory>]
      [--chrome <path>]

Output lands HERE by default: beside the page, named after it — with the
section reference appended when --section picked one, so exporting several
sections never overwrites. --out takes an exact .gif path, or a directory
(existing, or marked by a trailing slash) to receive the derived name.

Chrome/Chromium captures one PNG for every canonical heading-slug step deep
link. Pillow is used when available; a bundled PNG reader, fixed-palette
quantizer, and simple GIF LZW stream keep the command functional on a bare
Python 3 installation.
"""

from __future__ import annotations

import argparse
import base64
from dataclasses import dataclass
import hashlib
import json
import os
import pathlib
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import time
from typing import Any, Iterable
from urllib.parse import quote, urlsplit
from urllib.request import urlopen
import zlib


PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
FLOWSPEC_BLOCK = re.compile(
    r"<script\b(?=[^>]*\bid=[\"']flowspec[\"'])[^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)


@dataclass(frozen=True)
class PageSection:
    number: int
    section: dict[str, Any]
    block_index: int
    tab_index: int | None = None
    tab_label: str | None = None
    reference: str | None = None

    @property
    def steps(self) -> list[Any]:
        diagram = self.section.get("diagram")
        if not isinstance(diagram, dict) or not isinstance(diagram.get("steps"), list):
            return []
        return diagram["steps"]


@dataclass(frozen=True)
class StepTarget:
    section_number: int
    heading: str
    tab_selector: str | None
    step_refs: tuple[str, ...]
    fragments: tuple[str, ...]
    forced_positional_refs: bool
    section_reference: str


@dataclass(frozen=True)
class StepFragmentPlan:
    references: tuple[str, ...]
    fragments: tuple[str, ...]
    forced_positional_refs: bool


def slugify(value: Any) -> str:
    """Mirror src/engine.js slugify exactly for tab deep links."""
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return slug or "tab"


def section_slugify(value: Any) -> str:
    """Mirror the renderer's heading slug algorithm for section references."""
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    slug = slug or "section"
    return "section-" + slug if slug.isdigit() else slug


def section_references(headings: Iterable[Any]) -> tuple[str, ...]:
    """Return unique document-order heading slugs with positional fallbacks."""
    used: set[str] = set()
    references: list[str] = []
    for index, heading in enumerate(headings):
        if not isinstance(heading, str) or not heading.strip():
            reference = str(index + 1)
        else:
            base = section_slugify(heading)
            reference = base
            suffix = 2
            while reference in used:
                reference = f"{base}-{suffix}"
                suffix += 1
        used.add(reference)
        references.append(reference)
    return tuple(references)


def build_step_fragment(
    step: Any,
    section: Any | None = None,
    diagram_number: int | None = None,
    diagram_reference: Any | None = None,
) -> str:
    """Build a renderer step fragment, preserving the legacy call shape.

    ``section`` is the deep-link routing selector (normally a tab slug). It
    is omitted for a page whose first stepper is not inside tabs. New exporter
    targets pass ``diagram_number`` (the 1-based rendered section index), which
    can address every stepped diagram; calls without it keep emitting the
    historical ``#t=...&m=step&s=...`` form. ``diagram_number`` remains the
    legacy numeric producer; canonical exporter plans pass the heading-derived
    ``diagram_reference`` instead.
    """
    if step is None or str(step) == "":
        raise ValueError("step reference must not be empty")
    parts: list[str] = []
    if section is not None:
        parts.append("t=" + quote(str(section), safe="-._~"))
    if diagram_number is not None and diagram_reference is not None:
        raise ValueError("pass either diagram_number or diagram_reference, not both")
    if diagram_number is not None:
        if diagram_number < 1:
            raise ValueError("diagram number must be at least 1")
        parts.append("d=" + str(diagram_number))
    elif diagram_reference is not None:
        if str(diagram_reference) == "":
            raise ValueError("diagram reference must not be empty")
        parts.append("d=" + quote(str(diagram_reference), safe="-._~"))
    parts.append("m=step")
    parts.append("s=" + quote(str(step), safe="-._~"))
    return "#" + "&".join(parts)


def build_step_fragments(
    steps: Iterable[Any],
    section: Any | None = None,
    diagram_number: int | None = None,
    diagram_reference: Any | None = None,
) -> StepFragmentPlan:
    """Build one distinct, correctly resolving fragment for every step.

    The renderer's canonical reference is a non-empty string id, falling back
    to the 1-based position. Duplicate ids and numeric ids that shadow a
    positional fallback make that mixed form ambiguous, so the whole diagram
    switches to positional references. Leading zeroes are added only when
    needed to keep those references from being mistaken for numeric ids; the
    renderer still parses them as positions.
    """
    canonical_refs: list[str] = []
    step_ids: set[str] = set()
    for index, step in enumerate(steps):
        step_id = step.get("id") if isinstance(step, dict) else None
        if isinstance(step_id, str) and step_id:
            canonical_refs.append(step_id)
            step_ids.add(step_id)
        else:
            canonical_refs.append(str(index + 1))

    forced_positional = len(set(canonical_refs)) != len(canonical_refs)
    references = canonical_refs
    if forced_positional:
        references = [str(index + 1) for index in range(len(canonical_refs))]
        if any(reference in step_ids for reference in references):
            numeric_id_lengths = [len(step_id) for step_id in step_ids
                                  if re.fullmatch(r"[0-9]+", step_id)]
            width = max([len(str(len(references))), *numeric_id_lengths]) + 1
            references = [reference.zfill(width) for reference in references]

    fragments = tuple(build_step_fragment(reference, section, diagram_number,
                                           diagram_reference)
                      for reference in references)
    if len(set(fragments)) != len(fragments):
        raise ValueError("could not build a distinct fragment for every diagram step")
    return StepFragmentPlan(tuple(references), fragments, forced_positional)


def _page_of(spec: Any) -> dict[str, Any]:
    if not isinstance(spec, dict):
        return {}
    if isinstance(spec.get("page"), dict):
        return spec["page"]
    if "blocks" in spec or "sections" in spec:
        return spec
    if "nodes" in spec and "rows" in spec:
        return {"sections": [{"diagram": spec}]}
    return {}


def _sections(page: dict[str, Any]) -> list[PageSection]:
    raw = page.get("blocks", page.get("sections", []))
    if not isinstance(raw, list):
        return []
    result: list[PageSection] = []
    number = 0
    for block_index, block in enumerate(raw):
        if not isinstance(block, dict):
            continue
        tabs = block.get("tabs")
        if isinstance(tabs, list):
            for tab_index, tab in enumerate(tabs):
                if not isinstance(tab, dict):
                    continue
                tab_sections = tab.get("sections")
                if not isinstance(tab_sections, list):
                    continue
                label = tab.get("label")
                shown_label = label if isinstance(label, str) else f"Tab {tab_index + 1}"
                for section in tab_sections:
                    if not isinstance(section, dict):
                        continue
                    number += 1
                    result.append(PageSection(
                        number, section, block_index, tab_index, shown_label))
        else:
            number += 1
            result.append(PageSection(number, block, block_index))
    references = section_references(
        section.section.get("heading") for section in result)
    return [PageSection(
        section.number, section.section, section.block_index, section.tab_index,
        section.tab_label, references[index])
        for index, section in enumerate(result)]


def _addressable_targets(
    page: dict[str, Any],
    sections: list[PageSection],
) -> list[StepTarget]:
    """Return every stepped section addressable by its canonical section ref."""
    targets: list[StepTarget] = []
    for section in sections:
        if not section.steps:
            continue
        selector = slugify(section.tab_label) if section.tab_index is not None else None
        reference = section.reference or str(section.number)
        fragment_plan = build_step_fragments(
            section.steps, diagram_reference=reference)
        heading = section.section.get("heading")
        targets.append(StepTarget(
            section.number,
            heading if isinstance(heading, str) and heading else f"section {section.number}",
            selector,
            fragment_plan.references,
            fragment_plan.fragments,
            fragment_plan.forced_positional_refs,
            reference,
        ))
    return targets


def choose_target(spec: Any, section_number: int | None = None) -> StepTarget:
    page = _page_of(spec)
    if not page:
        raise ValueError("embedded flowspec does not contain a renderable page")
    all_sections = _sections(page)
    targets = _addressable_targets(page, all_sections)
    if section_number is None:
        if not targets:
            raise ValueError("page has no deep-link-addressable diagram with steps")
        return min(targets, key=lambda target: target.section_number)
    selected = next((section for section in all_sections
                     if section.number == section_number), None)
    if selected is None:
        raise ValueError(
            f"section {section_number} does not exist (page has {len(all_sections)} section(s))")
    if not selected.steps:
        raise ValueError(f"section {section_number} has no diagram step-through")
    target = next((target for target in targets
                   if target.section_number == section_number), None)
    if target is None:
        raise ValueError(f"section {section_number} is not addressable")
    return target


def read_embedded_spec(page_path: pathlib.Path) -> Any:
    text = page_path.read_text(encoding="utf-8")
    matches = FLOWSPEC_BLOCK.findall(text)
    if len(matches) != 1:
        raise ValueError(
            f"expected one embedded flowspec block in {page_path}, found {len(matches)}")
    try:
        return json.loads(matches[0])
    except json.JSONDecodeError as exc:
        raise ValueError(f"embedded flowspec is invalid JSON: {exc}") from exc


COMMON_CHROME_PATHS = (
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/snap/bin/chromium",
)


def _usable_binary(value: str | None) -> str | None:
    if not value:
        return None
    expanded = os.path.expanduser(value)
    if os.path.sep not in expanded:
        found = shutil.which(expanded)
        return found
    path = pathlib.Path(expanded)
    return str(path.resolve()) if path.is_file() and os.access(path, os.X_OK) else None


def find_chrome(explicit: str | None = None) -> str | None:
    """Resolve --chrome, then CHROME, then common macOS/Linux locations."""
    if explicit is not None:
        return _usable_binary(explicit)
    env_binary = _usable_binary(os.environ.get("CHROME"))
    if env_binary:
        return env_binary
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser"):
        found = shutil.which(name)
        if found:
            return found
    for candidate in COMMON_CHROME_PATHS:
        found = _usable_binary(candidate)
        if found:
            return found
    return None


def capture_frames(
    page_path: pathlib.Path,
    fragments: Iterable[str],
    chrome: str,
    width: int,
    output_dir: pathlib.Path,
) -> list[pathlib.Path]:
    """Capture one 16:9 viewport PNG for each deep-link fragment."""
    height = max(1, round(width * 9 / 16))
    screenshots: list[pathlib.Path] = []
    base_url = page_path.resolve().as_uri()
    for index, fragment in enumerate(fragments):
        screenshot = output_dir / f"frame-{index:04d}.png"
        profile = output_dir / f"chrome-profile-{index:04d}"
        profile.mkdir()
        log_path = output_dir / f"chrome-{index:04d}.log"
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            debug_port = probe.getsockname()[1]
        cmd = [
            chrome,
            "--headless=new",
            "--disable-gpu",
            "--disable-background-networking",
            "--disable-component-update",
            "--disable-default-apps",
            "--disable-extensions",
            "--disable-sync",
            "--hide-scrollbars",
            "--metrics-recording-only",
            "--no-first-run",
            "--no-default-browser-check",
            f"--window-size={width},{height}",
            "--force-device-scale-factor=1",
            f"--remote-debugging-port={debug_port}",
            f"--user-data-dir={profile}",
            "about:blank",
        ]
        with log_path.open("w+", encoding="utf-8") as log:
            process = subprocess.Popen(cmd, stdout=log, stderr=log, text=True)
            capture_error: Exception | None = None
            try:
                endpoint = _wait_for_page_endpoint(debug_port, process, 20)
                with _DevToolsSocket(endpoint) as devtools:
                    devtools.command("Page.enable")
                    devtools.command("Runtime.enable")
                    devtools.command("Emulation.setDeviceMetricsOverride", {
                        "width": width,
                        "height": height,
                        "deviceScaleFactor": 1,
                        "mobile": False,
                    })
                    devtools.command("Page.navigate", {"url": base_url + fragment})
                    _wait_for_rendered_page(devtools, process, 20)
                    # Two animation frames ensure the instant deep-link scroll and
                    # the resulting compositor update are both visible to capture.
                    devtools.command("Runtime.evaluate", {
                        "expression": (
                            "new Promise(function(resolve){requestAnimationFrame("
                            "function(){requestAnimationFrame(resolve);});})"
                        ),
                        "awaitPromise": True,
                    })
                    result = devtools.command("Page.captureScreenshot", {
                        "format": "png",
                        "fromSurface": True,
                    })
                    data = base64.b64decode(result.get("data", ""), validate=True)
                    if not data.startswith(PNG_SIGNATURE):
                        raise RuntimeError("Chrome returned a non-PNG screenshot")
                    screenshot.write_bytes(data)
            except Exception as exc:
                capture_error = exc
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=3)
            log.seek(0)
            detail = log.read().strip()
        if capture_error is not None:
            if len(detail) > 800:
                detail = detail[-800:]
            raise RuntimeError(
                f"Chrome failed or timed out while capturing step {index + 1}"
                f": {capture_error}"
                + (f"\n{detail}" if detail else "")) from capture_error
        screenshots.append(screenshot)
    return screenshots


def _wait_for_page_endpoint(port: int, process: subprocess.Popen, timeout: float) -> str:
    deadline = time.monotonic() + timeout
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Chrome exited with status {process.returncode}")
        try:
            with urlopen(f"http://127.0.0.1:{port}/json/list", timeout=0.25) as response:
                targets = json.load(response)
            page = next((item for item in targets
                         if item.get("type") == "page" and item.get("webSocketDebuggerUrl")),
                        None)
            if page:
                return page["webSocketDebuggerUrl"]
        except Exception as exc:
            last_error = exc
        time.sleep(0.05)
    raise RuntimeError(f"Chrome debugging endpoint was not ready: {last_error}")


def _wait_for_rendered_page(
    devtools: "_DevToolsSocket",
    process: subprocess.Popen,
    timeout: float,
) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError(f"Chrome exited with status {process.returncode}")
        result = devtools.command("Runtime.evaluate", {
            "expression": (
                "document.readyState !== 'loading' && document.body && "
                "document.getElementById('docview') && "
                "document.getElementById('docview').children.length > 0"
            ),
            "returnByValue": True,
        })
        if result.get("result", {}).get("value") is True:
            return
        time.sleep(0.05)
    raise RuntimeError("rendered flowview did not become ready")


class _DevToolsSocket:
    """Small standard-library WebSocket client for Chrome DevTools commands."""

    _GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

    def __init__(self, endpoint: str):
        parsed = urlsplit(endpoint)
        if parsed.scheme != "ws" or parsed.hostname is None or parsed.port is None:
            raise RuntimeError(f"invalid Chrome WebSocket endpoint: {endpoint}")
        self.sock = socket.create_connection((parsed.hostname, parsed.port), timeout=10)
        self.sock.settimeout(10)
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        path = parsed.path + (("?" + parsed.query) if parsed.query else "")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {parsed.hostname}:{parsed.port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(request.encode("ascii"))
        response = bytearray()
        while not response.endswith(b"\r\n\r\n"):
            response.extend(self._recv_exact(1))
            if len(response) > 16384:
                raise RuntimeError("oversized Chrome WebSocket handshake")
        header = response.decode("iso-8859-1")
        if not header.startswith("HTTP/1.1 101"):
            raise RuntimeError("Chrome refused WebSocket handshake: " + header.splitlines()[0])
        expected = base64.b64encode(
            hashlib.sha1((key + self._GUID).encode("ascii")).digest()
        ).decode("ascii")
        accept = next((line.split(":", 1)[1].strip() for line in header.splitlines()
                       if line.lower().startswith("sec-websocket-accept:")), None)
        if accept != expected:
            raise RuntimeError("Chrome WebSocket handshake had a bad accept key")
        self.next_id = 0

    def __enter__(self) -> "_DevToolsSocket":
        return self

    def __exit__(self, exc_type, exc, traceback) -> None:
        try:
            self._send_frame(0x8, b"")
        except OSError:
            pass
        self.sock.close()

    def _recv_exact(self, size: int) -> bytes:
        out = bytearray()
        while len(out) < size:
            chunk = self.sock.recv(size - len(out))
            if not chunk:
                raise RuntimeError("Chrome closed the WebSocket")
            out.extend(chunk)
        return bytes(out)

    def _send_frame(self, opcode: int, payload: bytes) -> None:
        mask = os.urandom(4)
        size = len(payload)
        header = bytearray([0x80 | opcode])
        if size < 126:
            header.append(0x80 | size)
        elif size < 65536:
            header.append(0x80 | 126)
            header.extend(struct.pack(">H", size))
        else:
            header.append(0x80 | 127)
            header.extend(struct.pack(">Q", size))
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        self.sock.sendall(bytes(header) + mask + masked)

    def _recv_message(self) -> dict[str, Any]:
        payload = bytearray()
        message_opcode: int | None = None
        while True:
            first, second = self._recv_exact(2)
            finished = bool(first & 0x80)
            opcode = first & 0x0F
            size = second & 0x7F
            if size == 126:
                size = struct.unpack(">H", self._recv_exact(2))[0]
            elif size == 127:
                size = struct.unpack(">Q", self._recv_exact(8))[0]
            masked = bool(second & 0x80)
            mask = self._recv_exact(4) if masked else b""
            part = self._recv_exact(size)
            if masked:
                part = bytes(byte ^ mask[index % 4] for index, byte in enumerate(part))
            if opcode == 0x8:
                raise RuntimeError("Chrome closed the WebSocket")
            if opcode == 0x9:
                self._send_frame(0xA, part)
                continue
            if opcode in (0x1, 0x2):
                message_opcode = opcode
                payload = bytearray(part)
            elif opcode == 0x0 and message_opcode is not None:
                payload.extend(part)
            else:
                continue
            if finished:
                if message_opcode != 0x1:
                    raise RuntimeError("Chrome sent an unexpected binary WebSocket message")
                return json.loads(payload.decode("utf-8"))

    def command(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        self.next_id += 1
        command_id = self.next_id
        message: dict[str, Any] = {"id": command_id, "method": method}
        if params:
            message["params"] = params
        self._send_frame(0x1, json.dumps(message, separators=(",", ":")).encode("utf-8"))
        while True:
            reply = self._recv_message()
            if reply.get("id") != command_id:
                continue
            if "error" in reply:
                raise RuntimeError(f"Chrome {method} failed: {reply['error']}")
            return reply.get("result", {})


def _paeth(a: int, b: int, c: int) -> int:
    estimate = a + b - c
    pa, pb, pc = abs(estimate - a), abs(estimate - b), abs(estimate - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def decode_png(data: bytes) -> tuple[int, int, bytes]:
    """Decode the non-interlaced 8-bit PNG forms emitted by Chrome."""
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("screenshot is not a PNG")
    position = len(PNG_SIGNATURE)
    width = height = bit_depth = color_type = interlace = None
    palette: bytes | None = None
    compressed = bytearray()
    while position + 12 <= len(data):
        length = struct.unpack(">I", data[position:position + 4])[0]
        chunk_type = data[position + 4:position + 8]
        payload_start = position + 8
        payload_end = payload_start + length
        if payload_end + 4 > len(data):
            raise ValueError("truncated PNG chunk")
        payload = data[payload_start:payload_end]
        position = payload_end + 4
        if chunk_type == b"IHDR":
            if len(payload) != 13:
                raise ValueError("invalid PNG IHDR")
            width, height, bit_depth, color_type, compression, filtering, interlace = \
                struct.unpack(">IIBBBBB", payload)
            if compression != 0 or filtering != 0:
                raise ValueError("unsupported PNG compression/filter method")
        elif chunk_type == b"PLTE":
            palette = payload
        elif chunk_type == b"IDAT":
            compressed.extend(payload)
        elif chunk_type == b"IEND":
            break
    if not width or not height or bit_depth != 8 or interlace != 0:
        raise ValueError("fallback PNG reader requires non-interlaced 8-bit screenshots")
    channels_by_type = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
    channels = channels_by_type.get(color_type)
    if channels is None:
        raise ValueError(f"unsupported PNG color type {color_type}")
    stride = width * channels
    raw = zlib.decompress(bytes(compressed))
    if len(raw) != height * (stride + 1):
        raise ValueError("unexpected PNG scanline size")
    rows: list[bytearray] = []
    cursor = 0
    previous = bytearray(stride)
    for _ in range(height):
        filter_type = raw[cursor]
        cursor += 1
        source = raw[cursor:cursor + stride]
        cursor += stride
        row = bytearray(stride)
        for x, value in enumerate(source):
            left = row[x - channels] if x >= channels else 0
            up = previous[x]
            up_left = previous[x - channels] if x >= channels else 0
            if filter_type == 0:
                predictor = 0
            elif filter_type == 1:
                predictor = left
            elif filter_type == 2:
                predictor = up
            elif filter_type == 3:
                predictor = (left + up) // 2
            elif filter_type == 4:
                predictor = _paeth(left, up, up_left)
            else:
                raise ValueError(f"unsupported PNG filter {filter_type}")
            row[x] = (value + predictor) & 0xFF
        rows.append(row)
        previous = row

    rgb = bytearray(width * height * 3)
    out = 0
    for row in rows:
        for x in range(width):
            base = x * channels
            if color_type == 0 or color_type == 4:
                r = g = b = row[base]
            elif color_type == 2 or color_type == 6:
                r, g, b = row[base:base + 3]
            else:
                palette_index = row[base] * 3
                if palette is None or palette_index + 3 > len(palette):
                    raise ValueError("indexed PNG has an invalid palette")
                r, g, b = palette[palette_index:palette_index + 3]
            rgb[out:out + 3] = bytes((r, g, b))
            out += 3
    return width, height, bytes(rgb)


def _palette_332() -> bytes:
    palette = bytearray()
    for index in range(256):
        red = ((index >> 5) & 7) * 255 // 7
        green = ((index >> 2) & 7) * 255 // 7
        blue = (index & 3) * 255 // 3
        palette.extend((red, green, blue))
    return bytes(palette)


def _quantize_332(rgb: bytes) -> bytes:
    if len(rgb) % 3:
        raise ValueError("RGB frame length must be divisible by three")
    indexed = bytearray(len(rgb) // 3)
    for pixel, source in enumerate(range(0, len(rgb), 3)):
        indexed[pixel] = ((rgb[source] >> 5) << 5) | \
                         ((rgb[source + 1] >> 5) << 2) | \
                         (rgb[source + 2] >> 6)
    return bytes(indexed)


def _literal_lzw(indexed: bytes) -> bytes:
    """Emit a simple valid GIF LZW stream with periodic clear codes."""
    clear_code, end_code = 256, 257
    codes: list[int] = []
    # A clear every 250 literal pixels keeps the code width fixed at 9 bits,
    # avoiding a dictionary implementation while remaining much smaller than
    # clearing before every pixel.
    for start in range(0, len(indexed), 250):
        codes.append(clear_code)
        codes.extend(indexed[start:start + 250])
    if not indexed:
        codes.append(clear_code)
    codes.append(end_code)
    packed = bytearray()
    bits = 0
    bit_count = 0
    for code in codes:
        bits |= code << bit_count
        bit_count += 9
        while bit_count >= 8:
            packed.append(bits & 0xFF)
            bits >>= 8
            bit_count -= 8
    if bit_count:
        packed.append(bits & 0xFF)
    return bytes(packed)


def _subblocks(data: bytes) -> bytes:
    result = bytearray()
    for start in range(0, len(data), 255):
        block = data[start:start + 255]
        result.append(len(block))
        result.extend(block)
    result.append(0)
    return bytes(result)


def encode_gif(
    frames: Iterable[bytes],
    width: int,
    height: int,
    delay_ms: int = 1600,
    loop: int = 0,
) -> bytes:
    """Encode RGB byte frames as a looping GIF89a without dependencies."""
    frame_list = [bytes(frame) for frame in frames]
    if not frame_list:
        raise ValueError("at least one frame is required")
    if not (1 <= width <= 65535 and 1 <= height <= 65535):
        raise ValueError("GIF dimensions must be between 1 and 65535")
    expected = width * height * 3
    if any(len(frame) != expected for frame in frame_list):
        raise ValueError(f"each RGB frame must contain exactly {expected} bytes")
    if delay_ms <= 0:
        raise ValueError("delay_ms must be positive")
    if not (0 <= loop <= 65535):
        raise ValueError("loop must be between 0 and 65535")
    delay_cs = min(65535, max(1, round(delay_ms / 10)))

    output = bytearray(b"GIF89a")
    output.extend(struct.pack("<HHBBB", width, height, 0xF7, 0, 0))
    output.extend(_palette_332())
    output.extend(b"!\xff\x0bNETSCAPE2.0\x03\x01")
    output.extend(struct.pack("<H", loop))
    output.append(0)
    for rgb in frame_list:
        output.extend(b"!\xf9\x04\x04")  # disposal=1, no transparency
        output.extend(struct.pack("<H", delay_cs))
        output.extend(b"\x00\x00")
        output.append(0x2C)
        output.extend(struct.pack("<HHHHB", 0, 0, width, height, 0))
        output.append(8)
        output.extend(_subblocks(_literal_lzw(_quantize_332(rgb))))
    output.append(0x3B)
    return bytes(output)


def gif_frame_count(data: bytes) -> int:
    """Parse a GIF stream and count image descriptors (useful for QA/tests)."""
    if len(data) < 13 or data[:6] not in (b"GIF87a", b"GIF89a"):
        raise ValueError("not a GIF stream")
    packed = data[10]
    cursor = 13
    if packed & 0x80:
        cursor += 3 * (2 ** ((packed & 0x07) + 1))
    frames = 0

    def skip_subblocks(position: int) -> int:
        while True:
            if position >= len(data):
                raise ValueError("truncated GIF sub-block")
            size = data[position]
            position += 1
            if size == 0:
                return position
            position += size
            if position > len(data):
                raise ValueError("truncated GIF sub-block payload")

    while cursor < len(data):
        marker = data[cursor]
        cursor += 1
        if marker == 0x3B:
            return frames
        if marker == 0x21:
            if cursor >= len(data):
                raise ValueError("truncated GIF extension")
            cursor += 1  # extension label
            cursor = skip_subblocks(cursor)
        elif marker == 0x2C:
            frames += 1
            if cursor + 9 > len(data):
                raise ValueError("truncated GIF image descriptor")
            image_packed = data[cursor + 8]
            cursor += 9
            if image_packed & 0x80:
                cursor += 3 * (2 ** ((image_packed & 0x07) + 1))
            if cursor >= len(data):
                raise ValueError("truncated GIF image data")
            cursor += 1  # LZW minimum code size
            cursor = skip_subblocks(cursor)
        else:
            raise ValueError(f"unknown GIF block marker 0x{marker:02x}")
    raise ValueError("GIF trailer is missing")


def write_animated_gif(
    screenshots: list[pathlib.Path],
    out_path: pathlib.Path,
    delay_ms: int,
) -> tuple[str, int, int]:
    """Write screenshots through Pillow or the bundled fallback."""
    try:
        from PIL import Image
    except ImportError:
        Image = None

    if Image is not None:
        images = []
        for path in screenshots:
            with Image.open(path) as source:
                images.append(source.convert("RGB"))
        if not images:
            raise ValueError("no screenshots to encode")
        width, height = images[0].size
        if any(image.size != (width, height) for image in images):
            raise ValueError("Chrome screenshots do not have identical dimensions")
        images[0].save(
            out_path,
            format="GIF",
            save_all=True,
            append_images=images[1:],
            duration=delay_ms,
            loop=0,
            disposal=1,
            optimize=False,
        )
        return "Pillow", width, height

    decoded = [decode_png(path.read_bytes()) for path in screenshots]
    if not decoded:
        raise ValueError("no screenshots to encode")
    width, height = decoded[0][:2]
    if any(item[:2] != (width, height) for item in decoded):
        raise ValueError("Chrome screenshots do not have identical dimensions")
    out_path.write_bytes(encode_gif(
        (item[2] for item in decoded), width, height, delay_ms=delay_ms))
    return "bundled", width, height


def resolve_out_path(
    out_arg: str | None,
    page_path: pathlib.Path,
    section_reference: str | None,
) -> pathlib.Path:
    """Where the GIF lands. Default: beside the page, named after it — with
    the section reference appended when --section chose one, so exporting
    several sections of one page never overwrites. --out may be an existing
    directory (or end with a path separator): the derived name lands inside
    it. Otherwise --out names the exact .gif file."""
    default_name = page_path.stem
    if section_reference is not None:
        default_name += "-" + str(section_reference).replace("/", "-")
    default_name += ".gif"
    if out_arg is None:
        return page_path.parent / default_name
    candidate = pathlib.Path(out_arg)
    if candidate.is_dir() or out_arg.endswith(("/", os.sep)):
        return candidate / default_name
    return candidate


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("built_page", metavar="built-page.html")
    parser.add_argument("--section", type=int,
                        help="1-based rendered section number (default: first step-through)")
    parser.add_argument("--width", type=int, default=1280)
    parser.add_argument("--delay-ms", type=int, default=1600)
    parser.add_argument("--out", metavar="path.gif")
    parser.add_argument("--chrome", metavar="path")
    args = parser.parse_args(argv)

    try:
        page_path = pathlib.Path(args.built_page)
        if not page_path.is_file():
            raise ValueError(f"built page not found: {page_path}")
        if args.section is not None and args.section < 1:
            raise ValueError("--section must be a positive 1-based number")
        if args.width < 320 or args.width > 4096:
            raise ValueError("--width must be between 320 and 4096")
        if args.delay_ms <= 0:
            raise ValueError("--delay-ms must be positive")
        chrome = find_chrome(args.chrome)
        if chrome is None:
            if args.chrome:
                raise ValueError(
                    f"Chrome binary is not executable: {args.chrome}. Install Google Chrome "
                    "or Chromium, or pass its executable with --chrome.")
            raise ValueError(
                "Chrome/Chromium was not found. Install Google Chrome or Chromium, then "
                "pass --chrome <path> or set the CHROME environment variable.")
        spec = read_embedded_spec(page_path)
        target = choose_target(spec, args.section)
        fragments = target.fragments
        out_path = resolve_out_path(
            args.out, page_path,
            str(target.section_reference) if args.section is not None else None)
        if out_path.suffix.lower() != ".gif":
            raise ValueError("--out must name a .gif file or an existing directory")
        if out_path.resolve() == page_path.resolve():
            raise ValueError("--out must not overwrite the built HTML page")
        out_path.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="design-viz-gif-") as temp:
            screenshots = capture_frames(
                page_path, fragments, chrome, args.width, pathlib.Path(temp))
            encoder, width, height = write_animated_gif(
                screenshots, out_path, args.delay_ms)
        reference_note = (
            "; positional step references used for every frame because ids "
            "were duplicate or collided with a position"
            if target.forced_positional_refs else ""
        )
        print(
            f"EXPORT_GIF OK: {out_path} ({len(fragments)} frames, {width}x{height}, "
            f"{args.delay_ms} ms, {encoder} encoder; section {target.section_number}: "
            f"{target.heading} [d={target.section_reference}]{reference_note})")
        return 0
    except (OSError, ValueError, RuntimeError, zlib.error) as exc:
        print(f"EXPORT_GIF FAIL: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
