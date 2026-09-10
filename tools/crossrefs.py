"""Shared-component catalog and per-page backlink helpers.

The authored flowspec stays the only authoring surface.  Cross-page identity
starts with an exact, case-sensitive node title, then uses tint to avoid a
specific false positive: when *every* occurrence of a title has tint ``dev``,
only pages in the same product family are peers.  The manifest family and its
leading organization/product-family segment are family keys; an explicit node
``group`` is also a key so a component such as Sentry LP can recur across the
separately indexed Doorbuzz pages.  Device
records without a same-family peer are dropped.  If any occurrence instead has
a service tint (``cmd``, ``auth``, ``data``, or ``mqtt``) or no tint, matching
remains unrestricted across families.

That asymmetry is deliberate: a device chip repeated across one product's
pages is a real shared component, while the same generic phone title in
unrelated product pages is ordinarily coincidence.
"""
import json
import pathlib
import posixpath
import re


SAFE_PAGE = re.compile(r"^(?:[a-z0-9-]+/)?[A-Za-z0-9._-]+\.html$")
SAFE_SPEC = re.compile(r"^(?:[a-z0-9-]+/)?[A-Za-z0-9._-]+\.json$")
SAFE_BACKLINK = re.compile(
    r"^(?:"
    r"[A-Za-z0-9._-]+\.html|"
    r"[a-z0-9-]+/[A-Za-z0-9._-]+\.html|"
    r"\.\./[A-Za-z0-9._-]+\.html|"
    r"\.\./[a-z0-9-]+/[A-Za-z0-9._-]+\.html"
    r")$"
)
BACKLINK_BLOCK = re.compile(
    r'^(<script type="application/json" id="flowbacklinks">)\n.*?\n(</script>)',
    re.S | re.M,
)


class CrossrefError(ValueError):
    """A catalog input cannot safely or completely be derived."""


def node_identities(obj):
    """Return title -> occurrence tints and explicit product-group keys."""
    found = {}

    def walk(value):
        if isinstance(value, dict):
            nodes = value.get("nodes")
            if isinstance(nodes, dict):
                for node in nodes.values():
                    if not isinstance(node, dict):
                        continue
                    title = node.get("title")
                    if isinstance(title, str) and title:
                        identity = found.setdefault(title, {"tints": [], "groups": set()})
                        identity["tints"].append(node.get("tint"))
                        group = node.get("group")
                        if isinstance(group, str) and group:
                            identity["groups"].add(group)
            for child in value.values():
                walk(child)
        elif isinstance(value, list):
            for child in value:
                walk(child)

    walk(obj)
    return found


def node_titles(obj):
    """Return the set of explicit node title strings anywhere in a spec."""
    return set(node_identities(obj))


def _family_keys(family, groups):
    """Expand the repository's ``maker-product`` family convention."""
    keys = {family}
    if "-" in family:
        keys.add(family.split("-", 1)[0])
    keys.update(groups)
    return keys


def _device_peers(left, right):
    """Whether two all-dev page occurrences share a family key."""
    return bool(left["families"] & right["families"])


def _record_families(record):
    families = record.get("families", [])
    return set(families) if isinstance(families, list) else set()


def _catalog_records_are_peers(left, right):
    return bool(_record_families(left) & _record_families(right))


def catalog_for_pages(root, pages):
    """Read every manifest-named spec and return a deterministic catalog."""
    root = pathlib.Path(root)
    by_title = {}
    for page in pages:
        spec_rel = page.get("spec")
        if not isinstance(spec_rel, str) or not SAFE_SPEC.fullmatch(spec_rel):
            raise CrossrefError(f"refusing unsafe manifest spec path: {spec_rel!r}")
        spec_path = root / spec_rel
        if not spec_path.is_file():
            raise CrossrefError(f"manifest spec missing: {spec_rel!r}")
        try:
            spec = json.loads(spec_path.read_text())
        except json.JSONDecodeError as ex:
            raise CrossrefError(f"manifest spec is not valid JSON: {spec_rel!r} ({ex})") from ex

        file_name = page["file"]
        family = page.get("family") if isinstance(page.get("family"), str) else "other"
        page_title = page.get("title") if isinstance(page.get("title"), str) else file_name
        record = {"file": file_name, "family": family, "title": page_title}
        for title, identity in node_identities(spec).items():
            # One service occurrence per page even if several diagrams repeat it.
            by_title.setdefault(title, {})[file_name] = {
                "record": record,
                "tints": identity["tints"],
                "families": _family_keys(family, identity["groups"]),
            }

    services = {}
    for title in sorted(by_title):
        occurrences = [by_title[title][name] for name in sorted(by_title[title])]
        device_only = all(
            tint == "dev"
            for occurrence in occurrences
            for tint in occurrence["tints"]
        )
        if not device_only:
            services[title] = [occurrence["record"] for occurrence in occurrences]
            continue

        kept = []
        for occurrence in occurrences:
            if not any(
                other is not occurrence and _device_peers(occurrence, other)
                for other in occurrences
            ):
                continue
            record = dict(occurrence["record"])
            record["scope"] = "family"
            record["families"] = sorted(occurrence["families"])
            kept.append(record)
        if kept:
            services[title] = kept
    return {"services": services}


def shared_service_groups(catalog):
    """Return deterministic (title, records) rows without crossing dev families."""
    shared = []
    for title, records in catalog["services"].items():
        scoped = [record for record in records if record.get("scope") == "family"]
        if not scoped:
            if len(records) >= 2:
                shared.append((title, records))
            continue

        candidates = {}
        for record in scoped:
            keys = [("family", family) for family in sorted(_record_families(record))]
            for key in keys:
                candidates.setdefault(key, []).append(record)
        seen = set()
        for key in sorted(candidates):
            family_records = candidates[key]
            signature = tuple(record["file"] for record in family_records)
            if len(family_records) < 2 or signature in seen:
                continue
            seen.add(signature)
            shared.append((title, family_records))
    return shared


def page_backlinks(root, spec, current_file):
    """Derive one page's sibling links, or return None when no catalog exists."""
    root = pathlib.Path(root)
    catalog_path = root / "crossref.json"
    if not catalog_path.is_file():
        return None
    if not isinstance(current_file, str) or not SAFE_PAGE.fullmatch(current_file):
        raise CrossrefError(f"refusing unsafe current page path: {current_file!r}")
    try:
        catalog = json.loads(catalog_path.read_text())
    except json.JSONDecodeError as ex:
        raise CrossrefError(f"{catalog_path} is not valid JSON ({ex})") from ex
    services = catalog.get("services") if isinstance(catalog, dict) else None
    if not isinstance(services, dict):
        raise CrossrefError(f"{catalog_path} must contain an object at services")

    current_dir = posixpath.dirname(current_file)
    selected = {}
    for service_title in sorted(node_titles(spec)):
        raw_records = services.get(service_title)
        if raw_records is None:
            continue
        if not isinstance(raw_records, list):
            raise CrossrefError(
                f"{catalog_path} service {service_title!r} must contain a list"
            )
        current_record = next(
            (raw for raw in raw_records
             if isinstance(raw, dict) and raw.get("file") == current_file),
            None,
        )
        records = {}
        for raw in raw_records:
            if not isinstance(raw, dict):
                raise CrossrefError(
                    f"{catalog_path} service {service_title!r} has a non-object page"
                )
            target = raw.get("file")
            if not isinstance(target, str) or not SAFE_PAGE.fullmatch(target):
                raise CrossrefError(f"refusing unsafe crossref page path: {target!r}")
            if target == current_file:
                continue
            scope = raw.get("scope")
            if scope not in (None, "family"):
                raise CrossrefError(
                    f"{catalog_path} service {service_title!r} has invalid scope"
                )
            if scope == "family":
                if current_record is None or not _catalog_records_are_peers(
                        current_record, raw):
                    continue
            href = posixpath.relpath(target, current_dir)
            if not SAFE_BACKLINK.fullmatch(href):
                raise CrossrefError(f"refusing unsafe derived backlink: {href!r}")
            title = raw.get("title") if isinstance(raw.get("title"), str) else target
            records[target] = {"href": href, "title": title}
        if records:
            selected[service_title] = [records[name] for name in sorted(records)]
    return {"services": selected}


def inject_backlink_block(page_text, model, source="page"):
    """Replace exactly one line-anchored derived-data block."""
    hits = BACKLINK_BLOCK.findall(page_text)
    if len(hits) != 1:
        raise CrossrefError(
            f"expected exactly one line-anchored flowbacklinks block in {source}, "
            f"found {len(hits)}"
        )
    raw = json.dumps(model, indent=2, ensure_ascii=False)
    # An HTML script element terminates on a literal '<' sequence regardless
    # of JSON quoting.  Encoding it preserves the decoded title exactly.
    raw = raw.replace("<", "\\u003c")
    return BACKLINK_BLOCK.sub(
        lambda match: match.group(1) + "\n" + raw + "\n" + match.group(2),
        page_text,
        count=1,
    )


def discovered_page_backlinks(out_path, spec):
    """Find the nearest flat or nested output-root catalog for inject.py."""
    out_path = pathlib.Path(out_path).resolve()
    # A flat page's root is its parent; a nested page's root is its
    # grandparent. Prefer the nearer catalog so an independently indexed flat
    # library in a subdirectory remains authoritative for its own pages.
    for root in (out_path.parent, out_path.parent.parent):
        if not (root / "crossref.json").is_file():
            continue
        try:
            current_file = out_path.relative_to(root).as_posix()
        except ValueError:
            continue
        if SAFE_PAGE.fullmatch(current_file):
            return page_backlinks(root, spec, current_file)
    return None
