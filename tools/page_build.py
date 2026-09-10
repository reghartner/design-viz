#!/usr/bin/env python3
"""page_build.py — the ONE command a page-authoring agent runs.

Usage:
  page_build.py <spec.json> [<family>/<slug> | <slug>] [--root <dir>]
                [--desc "..."] [--tags a,b,c] [--allow-warnings]
                [--diff-prev]

Output modes:
  page_build.py path/to/name.spec.json
      Writes path/to/name.html and path/to/manifest.json. The authored spec
      is already beside the page, so it is not copied.
  page_build.py path/to/name.spec.json --root <dir>
      Writes <dir>/name.html, copies the spec beside it using its source
      filename, and maintains <dir>/manifest.json.
  page_build.py <spec.json> <family>/<slug> [--root <dir>]
      Keeps the established nested layout under <dir> (or repo examples/).
  page_build.py <spec.json> <slug> --root <dir>
      Writes a deliberately named flat page and <slug>.spec.json under <dir>.

In flat modes the manifest family defaults to the output directory's name.
For source-adjacent builds, a hidden .<name>.page-build-prev.json snapshot is
updated after every successful build so --diff-prev can compare with the last
built state without making a redundant destination spec copy.

Does, in order, stopping loudly at the first failure:
  1. Validates the spec with tools/validate.js (the real validator + lint).
     Requires 0 errors AND 0 warnings (pass --allow-warnings only when a
     human told you a specific warning is acceptable — say which in the
     commit message).
  2. Injects the spec into template/flowview.html via tools/inject.py and
     copies the spec only when the selected layout needs a destination copy.
  3. Updates the selected output root's manifest.json under an exclusive
     file lock. Title and widgets are computed FROM THE SPEC; description
     and tags come from flags and survive re-runs when flags are omitted.

Exit code 0 = page built and manifest updated; anything else = STOP and
report the printed reason verbatim.
"""
import argparse
import fcntl
import json
import pathlib
import re
import shutil
import subprocess
import sys

from crossrefs import (
    CrossrefError,
    SAFE_PAGE,
    SAFE_SPEC,
    inject_backlink_block,
    page_backlinks,
)
from spec_diff import compare_specs, format_summary

ROOT = pathlib.Path(__file__).resolve().parent.parent
TEMPLATE = ROOT / "template" / "flowview.html"
KEBAB = re.compile(r"[a-z0-9-]+")


def fail(msg: str) -> "sys.NoReturn":
    print(f"PAGE_BUILD FAIL: {msg}")
    sys.exit(1)


def collect_widgets(obj, out):
    """Walk the spec; every panels[].type string is a used widget."""
    if isinstance(obj, dict):
        panels = obj.get("panels")
        if isinstance(panels, list):
            for p in panels:
                if isinstance(p, dict) and isinstance(p.get("type"), str):
                    out.add(p["type"])
        for v in obj.values():
            collect_widgets(v, out)
    elif isinstance(obj, list):
        for v in obj:
            collect_widgets(v, out)


def flat_stem(spec_path: pathlib.Path) -> str:
    """Derive the page name from either name.spec.json or plain name.json."""
    name = spec_path.name
    suffix = ".spec.json" if name.endswith(".spec.json") else ".json"
    if not name.endswith(suffix):
        fail(f"spec filename must end in .spec.json or .json when dest is omitted: {name}")
    stem = name[:-len(suffix)]
    candidate = f"{stem}.html"
    if not stem or not SAFE_PAGE.fullmatch(candidate):
        fail(f"spec filename does not produce a safe flat page name: {name}")
    return stem


def directory_family(path: pathlib.Path) -> str:
    """Use the selected directory name, resolving only aliases such as '.'."""
    return path.name or path.resolve().name


def load_manifest(manifest_path: pathlib.Path):
    """Read a manifest while preserving its non-page top-level fields."""
    if not manifest_path.is_file():
        return {"pages": []}
    try:
        manifest = json.loads(manifest_path.read_text())
    except json.JSONDecodeError as ex:
        fail(f"{manifest_path} is corrupt ({ex}) — fix it by hand")
    if not isinstance(manifest, dict):
        fail(f"{manifest_path} is corrupt (top level must be an object) — fix it by hand")
    return manifest


def nested_owner(output_root: pathlib.Path, html_path: pathlib.Path):
    """Return a parent-manifest spec owning this adjacent path, when present."""
    parent_manifest = output_root.parent / "manifest.json"
    if not parent_manifest.is_file() or not output_root.name:
        return None
    manifest = load_manifest(parent_manifest)
    key = f"{output_root.name}/{html_path.name}"
    for entry in manifest.get("pages", []):
        if not isinstance(entry, dict) or entry.get("file") != key:
            continue
        spec_rel = entry.get("spec")
        if isinstance(spec_rel, str) and SAFE_SPEC.fullmatch(spec_rel):
            return (output_root.parent / spec_rel).resolve()
        fail(f"cannot verify existing nested page owner: unsafe spec path {spec_rel!r}")
    return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("spec")
    ap.add_argument(
        "dest", nargs="?",
        help="optional <family>/<slug>, or a flat <slug> when --root is supplied",
    )
    ap.add_argument("--desc", default=None)
    ap.add_argument("--tags", default=None)
    ap.add_argument("--root", default=None)
    ap.add_argument("--allow-warnings", action="store_true")
    ap.add_argument(
        "--diff-prev", action="store_true",
        help="report changes from the previous successfully built spec state",
    )
    a = ap.parse_args()

    spec_path = pathlib.Path(a.spec)
    if not spec_path.is_file():
        fail(f"spec not found: {spec_path}")
    # Resolve inputs to absolute paths up front: the validate and inject
    # subprocesses below run with cwd=ROOT, so a spec or --root given
    # relative to the caller's directory would otherwise resolve inside
    # this repo (or not at all) once handed to them.
    spec_path = spec_path.resolve()
    root_dir = pathlib.Path(a.root).resolve() if a.root is not None else None
    if a.dest is not None:
        dest_parts = pathlib.PurePosixPath(a.dest).parts
        if (pathlib.PurePosixPath(a.dest).is_absolute()
                or any(part in (".", "..") for part in dest_parts)
                or "\\" in a.dest):
            fail(f"refusing path traversal in dest: {a.dest}")

    snapshot_path = None
    if a.dest is None:
        slug = flat_stem(spec_path)
        output_root = root_dir if root_dir is not None else spec_path.parent
        dest_dir = output_root
        html_rel = f"{slug}.html"
        spec_rel = spec_path.name
        spec_copy = dest_dir / spec_rel
        family = directory_family(output_root)
    elif "/" in a.dest:
        match = re.fullmatch(r"([a-z0-9-]+)/([a-z0-9-]+)", a.dest)
        if not match:
            fail(f'dest must be "<family>/<slug>" in kebab-case, got: {a.dest}')
        family, slug = match.group(1), match.group(2)
        output_root = root_dir if root_dir is not None else ROOT / "examples"
        dest_dir = output_root / family
        html_rel = f"{family}/{slug}.html"
        spec_rel = f"{family}/{slug}.spec.json"
        spec_copy = dest_dir / f"{slug}.spec.json"
    else:
        if a.root is None:
            fail("a bare slug requires --root; omit the slug to build beside the spec")
        if not KEBAB.fullmatch(a.dest):
            fail(f"flat slug must be kebab-case with no path traversal, got: {a.dest}")
        slug = a.dest
        output_root = root_dir
        dest_dir = output_root
        html_rel = f"{slug}.html"
        spec_rel = f"{slug}.spec.json"
        spec_copy = dest_dir / f"{slug}.spec.json"
        family = directory_family(output_root)

    source_adjacent = a.dest is None and spec_path.resolve() == spec_copy.resolve()
    if source_adjacent:
        snapshot_path = dest_dir / f".{slug}.page-build-prev.json"

    if not family:
        fail(f"cannot derive manifest family from output directory: {output_root}")
    if not SAFE_PAGE.fullmatch(html_rel):
        fail(f"refusing unsafe output page path: {html_rel!r}")
    if not SAFE_SPEC.fullmatch(spec_rel):
        fail(f"refusing unsafe output spec path: {spec_rel!r}")

    html_path = output_root / html_rel
    if html_path.resolve() == spec_path.resolve():
        fail(f"refusing to write page over its source spec: {spec_path}")
    if (output_root / "manifest.json").resolve() == spec_path.resolve():
        fail(f"refusing to write manifest over its source spec: {spec_path}")

    try:
        spec = json.loads(spec_path.read_text())
    except json.JSONDecodeError as ex:
        fail(f"spec is not valid JSON: {ex}")
    page = spec.get("page") or {}
    title = page.get("title")
    if not title:
        fail("spec has no page.title — the manifest needs it; add one")

    # 1. validate
    r = subprocess.run(
        ["node", str(ROOT / "tools" / "validate.js"), str(spec_path)],
        capture_output=True, text=True, cwd=ROOT,
    )
    out = (r.stdout + r.stderr).strip()
    if r.returncode != 0:
        fail(f"validator errors — fix every one, then re-run:\n{out}")
    # Parse the summary line ("N errors, M warnings"); a substring test could
    # be spoofed by a file PATH containing "0 warnings".
    summary = re.search(r"(\d+) errors, (\d+) warnings\s*$", out)
    if not summary:
        fail(f"could not parse the validator summary line:\n{out}")
    if int(summary.group(2)) != 0 and not a.allow_warnings:
        fail(
            "validator warnings — fix them (cookbook/adjustments.md maps the "
            f"common ones to spec knobs), then re-run:\n{out}"
        )

    if not TEMPLATE.is_file():
        fail("template/flowview.html missing — run python3 tools/build.py first")

    # 2 + 3. The manifest lock covers ownership checks, destination copying,
    # backlink injection, and the manifest read-modify-write. Agents building
    # different pages into one root therefore cannot lose one another's entry.
    output_root.mkdir(parents=True, exist_ok=True)
    dest_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = output_root / "manifest.json"
    lock_path = output_root / ".manifest.lock"
    previous_spec = None
    previous_diff_error = None
    snapshot_write_error = None

    with open(lock_path, "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        manifest = load_manifest(manifest_path)
        pages = [p for p in manifest.get("pages", []) if isinstance(p, dict)]
        prev = next((p for p in pages if p.get("file") == html_rel), None)

        # Ownership blocks regardless of whether the HTML currently exists:
        # a manifest entry (or, below, a parent manifest / adjacent nested
        # spec) claims the name even while its output is deleted or unbuilt.
        if prev is not None and prev.get("spec") != spec_rel:
            fail(
                f"refusing to write {html_path}: manifest assigns it to "
                f"different spec {prev.get('spec')!r}"
            )

        if source_adjacent and prev is None:
            owner = nested_owner(output_root, html_path)
            if owner is not None and owner != spec_path.resolve():
                fail(
                    f"refusing to write {html_path}: the name belongs to a "
                    f"different spec via the parent manifest: {owner}"
                )
            canonical = dest_dir / f"{slug}.spec.json"
            if (owner is None and canonical.is_file()
                    and canonical.resolve() != spec_path.resolve()):
                fail(
                    f"refusing to write {html_path}: the name belongs to the "
                    f"adjacent nested-convention spec {canonical}"
                )

        baseline = snapshot_path if snapshot_path is not None else spec_copy
        if a.diff_prev:
            if baseline.is_file():
                try:
                    previous_spec = json.loads(baseline.read_text())
                except Exception as ex:
                    # Diff reporting is advisory and must never turn a valid build red.
                    previous_diff_error = str(ex)
            elif snapshot_path is not None:
                previous_diff_error = "no previous successful build snapshot"

        r2 = subprocess.run(
            ["python3", str(ROOT / "tools" / "inject.py"),
             str(spec_path), str(TEMPLATE), str(html_path)],
            capture_output=True, text=True, cwd=ROOT,
        )
        if r2.returncode != 0:
            fail(f"inject failed:\n{(r2.stdout + r2.stderr).strip()}")
        copied = spec_path.resolve() != spec_copy.resolve()
        if copied:
            shutil.copyfile(spec_path, spec_copy)

        # Derived cross-page data lives beside, never inside, the authored spec.
        # inject.py also discovers it for direct callers; doing this explicitly
        # keeps page_build's selected --root authoritative.
        try:
            backlinks = page_backlinks(output_root, spec, html_rel)
            if backlinks is not None:
                html_path.write_text(inject_backlink_block(
                    html_path.read_text(), backlinks, str(html_path)
                ))
        except CrossrefError as ex:
            fail(f"crossref injection failed: {ex}")

        widgets = set()
        collect_widgets(page, widgets)
        entry = {
            "file": html_rel,
            "spec": spec_rel,
            "title": title,
            "family": family,
            "description": (
                a.desc if a.desc is not None else (prev or {}).get("description", "")
            ),
            "tags": (
                [t.strip() for t in a.tags.split(",") if t.strip()]
                if a.tags is not None else (prev or {}).get("tags", [])
            ),
            "widgets": sorted(widgets),
        }
        pages = [p for p in pages if p.get("file") != html_rel] + [entry]
        pages.sort(key=lambda p: (p.get("family", ""), p.get("file", "")))
        manifest["pages"] = pages
        manifest_path.write_text(
            json.dumps(manifest, indent=2, ensure_ascii=False) + "\n"
        )

        if snapshot_path is not None:
            try:
                snapshot_path.write_text(
                    json.dumps(spec, indent=2, ensure_ascii=False) + "\n"
                )
            except OSError as ex:
                # Like comparison rendering, snapshot persistence is advisory;
                # the validated page and locked manifest update remain successful.
                snapshot_write_error = str(ex)

    shown_html = html_path.relative_to(ROOT) if html_path.is_relative_to(ROOT) else html_path
    shown_spec = spec_copy.relative_to(ROOT) if spec_copy.is_relative_to(ROOT) else spec_copy
    print(f"PAGE_BUILD OK: {shown_html}")
    if copied:
        print(f"  spec copy:  {shown_spec}")
    else:
        print(f"  spec:       {shown_spec} (already beside page; not copied)")
    print(f"  manifest:   {html_rel} (widgets: {', '.join(sorted(widgets)) or 'none'})")
    if previous_spec is not None:
        try:
            print(format_summary(compare_specs(previous_spec, spec)))
        except Exception as ex:  # keep an advisory feature from failing the build
            print(f"SPEC_DIFF unavailable: {ex}")
    elif previous_diff_error is not None:
        print(f"SPEC_DIFF unavailable: {previous_diff_error}")
    if snapshot_write_error is not None:
        print(f"SPEC_DIFF snapshot unavailable: {snapshot_write_error}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
