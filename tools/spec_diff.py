#!/usr/bin/env python3
"""Compare two design-viz specs and optionally annotate contract rows.

Usage:
  python3 tools/spec_diff.py <old.spec.json> <new.spec.json>
      [--annotate <out.spec.json>] [--quiet]

Contract cards are paired by their complete section-heading/card-title
identity and shared field keys. Diagram structure is paired by section
heading. Differences are informational: a successful comparison exits zero
even when breaking changes are found.
"""

from __future__ import annotations

import argparse
import copy
from dataclasses import dataclass, field
import json
import pathlib
import sys
from typing import Any, Iterable


@dataclass
class SectionRef:
    """A section in the same flattened order used by the page renderer."""

    ordinal: int
    heading: str
    section: dict[str, Any]
    path: str

    @property
    def contract(self) -> dict[str, Any] | None:
        value = self.section.get("contract")
        return value if isinstance(value, dict) else None

    @property
    def diagram(self) -> dict[str, Any] | None:
        value = self.section.get("diagram")
        return value if isinstance(value, dict) else None


@dataclass(frozen=True)
class FieldChange:
    kind: str
    section_heading: str
    card_title: str
    key: str
    old: dict[str, Any] | None = None
    new: dict[str, Any] | None = None


@dataclass(frozen=True)
class DiagramChange:
    section_heading: str
    old_steps: int
    new_steps: int
    panels_added: tuple[str, ...] = ()
    panels_removed: tuple[str, ...] = ()
    nodes_added: tuple[str, ...] = ()
    nodes_removed: tuple[str, ...] = ()


@dataclass
class SpecDiff:
    field_changes: list[FieldChange] = field(default_factory=list)
    diagram_changes: list[DiagramChange] = field(default_factory=list)
    generated_from_version: tuple[Any, Any] | None = None

    @property
    def has_changes(self) -> bool:
        return bool(self.field_changes or self.diagram_changes or
                    self.generated_from_version is not None)


def page_of(spec: Any) -> dict[str, Any]:
    """Normalize the three input shapes accepted by the renderer."""
    if not isinstance(spec, dict):
        return {}
    if isinstance(spec.get("page"), dict):
        return spec["page"]
    if "blocks" in spec or "sections" in spec:
        return spec
    if "nodes" in spec and "rows" in spec:
        return {"sections": [{"diagram": spec}]}
    return {}


def iter_sections(spec: Any) -> Iterable[SectionRef]:
    """Yield ordinary and tabbed sections in renderer/display order."""
    page = page_of(spec)
    raw = page.get("blocks", page.get("sections", []))
    if not isinstance(raw, list):
        return
    ordinal = 0
    prefix = "blocks" if "blocks" in page else "sections"
    for block_index, block in enumerate(raw):
        if not isinstance(block, dict):
            continue
        tabs = block.get("tabs")
        if isinstance(tabs, list):
            for tab_index, tab in enumerate(tabs):
                if not isinstance(tab, dict) or not isinstance(tab.get("sections"), list):
                    continue
                for section_index, section in enumerate(tab["sections"]):
                    if not isinstance(section, dict):
                        continue
                    ordinal += 1
                    heading = section.get("heading")
                    yield SectionRef(
                        ordinal,
                        heading if isinstance(heading, str) else "",
                        section,
                        f"{prefix}[{block_index}].tabs[{tab_index}].sections[{section_index}]",
                    )
        else:
            ordinal += 1
            heading = block.get("heading")
            yield SectionRef(
                ordinal,
                heading if isinstance(heading, str) else "",
                block,
                f"{prefix}[{block_index}]",
            )


def _title(ref: SectionRef) -> str:
    contract = ref.contract or {}
    title = contract.get("title")
    return title if isinstance(title, str) else ""


def _pair_refs(
    old_refs: list[SectionRef],
    new_refs: list[SectionRef],
    *,
    title_fallback: bool,
) -> tuple[list[tuple[SectionRef, SectionRef]], list[SectionRef], list[SectionRef]]:
    """Greedily pair refs, preferring exact heading/title identity."""
    pairs: list[tuple[SectionRef, SectionRef]] = []
    old_left = list(old_refs)
    new_left = list(new_refs)

    def pair_where(predicate) -> None:
        nonlocal old_left, new_left
        next_old: list[SectionRef] = []
        for old in old_left:
            match_index = next((i for i, new in enumerate(new_left)
                                if predicate(old, new)), None)
            if match_index is None:
                next_old.append(old)
            else:
                pairs.append((old, new_left.pop(match_index)))
        old_left = next_old

    pair_where(lambda old, new: old.heading == new.heading and
               _title(old) == _title(new))
    pair_where(lambda old, new: bool(old.heading) and old.heading == new.heading)
    # Heading-less sections have no better primary identity than their order.
    pair_where(lambda old, new: not old.heading and not new.heading)
    if title_fallback:
        pair_where(lambda old, new: bool(_title(old)) and _title(old) == _title(new))
    return pairs, old_left, new_left


def _valid_fields(contract: dict[str, Any] | None) -> list[dict[str, Any]]:
    if not contract or not isinstance(contract.get("fields"), list):
        return []
    return [row for row in contract["fields"]
            if isinstance(row, dict) and isinstance(row.get("k"), str) and row["k"]]


def _field_map(contract: dict[str, Any] | None) -> dict[str, dict[str, Any]]:
    # The validator warns about malformed rows; first occurrence wins here so
    # annotation remains deterministic even for a warning-bearing spec.
    out: dict[str, dict[str, Any]] = {}
    for row in _valid_fields(contract):
        out.setdefault(row["k"], row)
    return out


def _pair_contract_refs(
    old_refs: list[SectionRef],
    new_refs: list[SectionRef],
) -> tuple[list[tuple[SectionRef, SectionRef]], list[SectionRef], list[SectionRef]]:
    """Pair cards only within a full identity (heading + card title).

    Duplicate cards cannot use document order as their primary discriminator:
    reordering them would make unrelated rows look changed. Within one
    identity the assignment maximizes TOTAL shared ``k`` count (exact search
    for small groups, greedy beyond that), with occurrence distance breaking
    ties. Zero-overlap pairings are refused inside multi-card groups (they
    would fabricate matches) — but when an identity is left with exactly one
    unmatched old and one unmatched new card, they pair regardless of
    overlap, so a fully-rewritten card diffs as one card (removed + added
    rows) instead of a removed card plus an added card.
    """
    groups: dict[tuple[str, str], tuple[list[int], list[int]]] = {}
    for index, ref in enumerate(old_refs):
        groups.setdefault((ref.heading, _title(ref)), ([], []))[0].append(index)
    for index, ref in enumerate(new_refs):
        groups.setdefault((ref.heading, _title(ref)), ([], []))[1].append(index)

    def shared(oi: int, ni: int) -> int:
        return len(set(_field_map(old_refs[oi].contract)) &
                   set(_field_map(new_refs[ni].contract)))

    paired_old: set[int] = set()
    paired_new: set[int] = set()
    indexed_pairs: list[tuple[int, int]] = []

    import itertools
    EXACT_LIMIT = 6
    for _identity, (olds, news) in groups.items():
        if not olds or not news:
            continue
        group_pairs: list[tuple[int, int]] = []
        if min(len(olds), len(news)) <= EXACT_LIMIT and max(len(olds), len(news)) <= EXACT_LIMIT:
            # exact assignment: maximize total shared keys, then minimize
            # total occurrence distance; zero-overlap pairs excluded here
            best = None
            small, large, small_is_old = (olds, news, True) if len(olds) <= len(news) else (news, olds, False)
            for perm in itertools.permutations(large, len(small)):
                total, dist, cand = 0, 0, []
                for spos, (a, b) in enumerate(zip(small, perm)):
                    oi, ni = (a, b) if small_is_old else (b, a)
                    s = shared(oi, ni)
                    if s:
                        total += s
                        dist += abs(olds.index(oi) - news.index(ni))
                        cand.append((oi, ni))
                key = (-total, dist)
                if best is None or key < best[0]:
                    best = (key, cand)
            group_pairs = best[1] if best else []
        else:
            cands = sorted(
                (-shared(oi, ni), abs(olds.index(oi) - news.index(ni)), oi, ni)
                for oi in olds for ni in news if shared(oi, ni))
            used_o: set[int] = set()
            used_n: set[int] = set()
            for _s, _d, oi, ni in cands:
                if oi in used_o or ni in used_n:
                    continue
                used_o.add(oi)
                used_n.add(ni)
                group_pairs.append((oi, ni))
        for oi, ni in group_pairs:
            paired_old.add(oi)
            paired_new.add(ni)
            indexed_pairs.append((oi, ni))
        # unique residual: one old + one new left in this identity pair
        # unconditionally, even with zero field overlap
        rest_o = [i for i in olds if i not in paired_old]
        rest_n = [i for i in news if i not in paired_new]
        if len(rest_o) == 1 and len(rest_n) == 1:
            paired_old.add(rest_o[0])
            paired_new.add(rest_n[0])
            indexed_pairs.append((rest_o[0], rest_n[0]))

    indexed_pairs.sort()
    pairs = [(old_refs[old_index], new_refs[new_index])
             for old_index, new_index in indexed_pairs]
    old_left = [ref for index, ref in enumerate(old_refs) if index not in paired_old]
    new_left = [ref for index, ref in enumerate(new_refs) if index not in paired_new]
    return pairs, old_left, new_left


def _pair_diagram_refs(
    old_refs: list[SectionRef],
    new_refs: list[SectionRef],
) -> tuple[list[tuple[SectionRef, SectionRef]], list[SectionRef], list[SectionRef]]:
    """Pair diagram sections by heading, then by node-id similarity.

    Same discipline as contract cards: duplicate-heading sections are paired
    by shared node ids (exact assignment for small groups), never by raw
    document order, so reordering them cannot fabricate node/panel/step
    changes. A unique residual old+new inside one heading pairs
    unconditionally.
    """
    import itertools
    groups: dict[str, tuple[list[int], list[int]]] = {}
    for index, ref in enumerate(old_refs):
        groups.setdefault(ref.heading, ([], []))[0].append(index)
    for index, ref in enumerate(new_refs):
        groups.setdefault(ref.heading, ([], []))[1].append(index)

    def shared(oi: int, ni: int) -> int:
        return len(_node_ids(old_refs[oi].diagram) & _node_ids(new_refs[ni].diagram))

    paired_old: set[int] = set()
    paired_new: set[int] = set()
    indexed_pairs: list[tuple[int, int]] = []
    EXACT_LIMIT = 6
    for _heading, (olds, news) in groups.items():
        if not olds or not news:
            continue
        group_pairs: list[tuple[int, int]] = []
        if max(len(olds), len(news)) <= EXACT_LIMIT:
            best = None
            small, large, small_is_old = (olds, news, True) if len(olds) <= len(news) else (news, olds, False)
            for perm in itertools.permutations(large, len(small)):
                total, dist, cand = 0, 0, []
                for a, b in zip(small, perm):
                    oi, ni = (a, b) if small_is_old else (b, a)
                    s = shared(oi, ni)
                    if s:
                        total += s
                        dist += abs(olds.index(oi) - news.index(ni))
                        cand.append((oi, ni))
                key = (-total, dist)
                if best is None or key < best[0]:
                    best = (key, cand)
            group_pairs = best[1] if best else []
        else:
            cands = sorted(
                (-shared(oi, ni), abs(olds.index(oi) - news.index(ni)), oi, ni)
                for oi in olds for ni in news if shared(oi, ni))
            used_o: set[int] = set()
            used_n: set[int] = set()
            for _s, _d, oi, ni in cands:
                if oi in used_o or ni in used_n:
                    continue
                used_o.add(oi)
                used_n.add(ni)
                group_pairs.append((oi, ni))
        for oi, ni in group_pairs:
            paired_old.add(oi)
            paired_new.add(ni)
            indexed_pairs.append((oi, ni))
        rest_o = [i for i in olds if i not in paired_old]
        rest_n = [i for i in news if i not in paired_new]
        if len(rest_o) == 1 and len(rest_n) == 1:
            paired_old.add(rest_o[0])
            paired_new.add(rest_n[0])
            indexed_pairs.append((rest_o[0], rest_n[0]))

    indexed_pairs.sort()
    pairs = [(old_refs[oi], new_refs[ni]) for oi, ni in indexed_pairs]
    old_left = [ref for i, ref in enumerate(old_refs) if i not in paired_old]
    new_left = [ref for i, ref in enumerate(new_refs) if i not in paired_new]
    return pairs, old_left, new_left


def _panel_ids(diagram: dict[str, Any] | None) -> set[str]:
    if not diagram or not isinstance(diagram.get("panels"), list):
        return set()
    return {panel["id"] for panel in diagram["panels"]
            if isinstance(panel, dict) and isinstance(panel.get("id"), str)}


def _node_ids(diagram: dict[str, Any] | None) -> set[str]:
    if not diagram or not isinstance(diagram.get("nodes"), dict):
        return set()
    return {key for key in diagram["nodes"] if isinstance(key, str)}


def _step_count(diagram: dict[str, Any] | None) -> int:
    return len(diagram["steps"]) if diagram and isinstance(diagram.get("steps"), list) else 0


def _label(old: SectionRef | None, new: SectionRef | None) -> str:
    ref = new or old
    assert ref is not None
    return ref.heading or f"section {ref.ordinal}"


def compare_specs(old_spec: Any, new_spec: Any) -> SpecDiff:
    """Return contract, diagram, and provenance differences."""
    result = SpecDiff()
    old_sections = list(iter_sections(old_spec))
    new_sections = list(iter_sections(new_spec))

    old_contracts = [ref for ref in old_sections if ref.contract is not None]
    new_contracts = [ref for ref in new_sections if ref.contract is not None]
    pairs, old_only, new_only = _pair_contract_refs(old_contracts, new_contracts)

    for old, new in pairs:
        old_map = _field_map(old.contract)
        new_map = _field_map(new.contract)
        heading = _label(old, new)
        title = _title(new) or _title(old)
        for row in _valid_fields(old.contract):
            key = row["k"]
            if old_map.get(key) is not row:
                continue
            if key not in new_map:
                result.field_changes.append(
                    FieldChange("removed", heading, title, key, old=row))
            elif (row.get("v"), row.get("g")) != (
                    new_map[key].get("v"), new_map[key].get("g")):
                result.field_changes.append(
                    FieldChange("changed", heading, title, key,
                                old=row, new=new_map[key]))
        for row in _valid_fields(new.contract):
            key = row["k"]
            if new_map.get(key) is row and key not in old_map:
                result.field_changes.append(
                    FieldChange("added", heading, title, key, new=row))

    for old in old_only:
        for row in _valid_fields(old.contract):
            result.field_changes.append(FieldChange(
                "removed", _label(old, None), _title(old), row["k"], old=row))
    for new in new_only:
        for row in _valid_fields(new.contract):
            result.field_changes.append(FieldChange(
                "added", _label(None, new), _title(new), row["k"], new=row))

    old_diagrams = [ref for ref in old_sections if ref.diagram is not None]
    new_diagrams = [ref for ref in new_sections if ref.diagram is not None]
    diagram_pairs, old_diagrams_only, new_diagrams_only = _pair_diagram_refs(
        old_diagrams, new_diagrams)
    diagram_inputs: list[tuple[SectionRef | None, SectionRef | None]] = [
        *diagram_pairs,
        *((ref, None) for ref in old_diagrams_only),
        *((None, ref) for ref in new_diagrams_only),
    ]
    for old, new in diagram_inputs:
        old_diagram = old.diagram if old else None
        new_diagram = new.diagram if new else None
        old_panels, new_panels = _panel_ids(old_diagram), _panel_ids(new_diagram)
        old_nodes, new_nodes = _node_ids(old_diagram), _node_ids(new_diagram)
        old_steps, new_steps = _step_count(old_diagram), _step_count(new_diagram)
        change = DiagramChange(
            _label(old, new),
            old_steps,
            new_steps,
            tuple(sorted(new_panels - old_panels)),
            tuple(sorted(old_panels - new_panels)),
            tuple(sorted(new_nodes - old_nodes)),
            tuple(sorted(old_nodes - new_nodes)),
        )
        if (old_steps != new_steps or change.panels_added or change.panels_removed or
                change.nodes_added or change.nodes_removed):
            result.diagram_changes.append(change)

    old_page, new_page = page_of(old_spec), page_of(new_spec)
    old_source = old_page.get("generatedFrom")
    new_source = new_page.get("generatedFrom")
    old_version = old_source.get("version") if isinstance(old_source, dict) else None
    new_version = new_source.get("version") if isinstance(new_source, dict) else None
    if old_version != new_version:
        result.generated_from_version = (old_version, new_version)
    return result


def _annotate_pair(old: SectionRef, new: SectionRef) -> None:
    old_fields = _valid_fields(old.contract)
    new_contract = new.contract
    if new_contract is None:
        return
    raw_new_fields = new_contract.get("fields")
    if not isinstance(raw_new_fields, list):
        raw_new_fields = []
        new_contract["fields"] = raw_new_fields

    old_map = _field_map(old.contract)
    new_map = _field_map(new_contract)
    for row in raw_new_fields:
        if not isinstance(row, dict):
            continue
        row.pop("delta", None)
        key = row.get("k")
        if not isinstance(key, str) or new_map.get(key) is not row:
            continue
        if key not in old_map:
            row["delta"] = "added"
        elif (old_map[key].get("v"), old_map[key].get("g")) != (
                row.get("v"), row.get("g")):
            row["delta"] = "changed"

    # Insert removed rows in their old relative order. Prefer the closest old
    # predecessor already present, then the closest surviving successor.
    for old_index, old_row in enumerate(old_fields):
        key = old_row["k"]
        if key in new_map:
            continue
        removed = copy.deepcopy(old_row)
        removed["delta"] = "removed"
        insert_at: int | None = None
        previous_keys = [row["k"] for row in old_fields[:old_index]]
        for previous in reversed(previous_keys):
            found = next((i for i, row in enumerate(raw_new_fields)
                          if isinstance(row, dict) and row.get("k") == previous), None)
            if found is not None:
                insert_at = found + 1
                break
        if insert_at is None:
            next_keys = [row["k"] for row in old_fields[old_index + 1:]]
            for following in next_keys:
                found = next((i for i, row in enumerate(raw_new_fields)
                              if isinstance(row, dict) and row.get("k") == following), None)
                if found is not None:
                    insert_at = found
                    break
        if insert_at is None:
            insert_at = len(raw_new_fields)
        raw_new_fields.insert(insert_at, removed)


def annotate_spec(old_spec: Any, new_spec: Any) -> Any:
    """Deep-copy new_spec and apply added/changed/removed row deltas."""
    annotated = copy.deepcopy(new_spec)
    old_contracts = [ref for ref in iter_sections(old_spec) if ref.contract is not None]
    new_contracts = [ref for ref in iter_sections(annotated) if ref.contract is not None]
    pairs, _old_only, new_only = _pair_contract_refs(old_contracts, new_contracts)
    for old, new in pairs:
        _annotate_pair(old, new)
    for new in new_only:
        contract = new.contract
        if not contract:
            continue
        for row in _valid_fields(contract):
            row.pop("delta", None)
            row["delta"] = "added"
    return annotated


def _shown(value: Any) -> str:
    return "(absent)" if value is None else json.dumps(value, ensure_ascii=False)


def format_summary(diff: SpecDiff) -> str:
    """Format a stable, human-readable summary for CLI and page_build."""
    if not diff.has_changes:
        return "SPEC_DIFF: no differences"
    structural_items = 0
    for change in diff.diagram_changes:
        structural_items += int(change.old_steps != change.new_steps)
        structural_items += len(change.panels_added) + len(change.panels_removed)
        structural_items += len(change.nodes_added) + len(change.nodes_removed)
    provenance_count = int(diff.generated_from_version is not None)
    lines = [
        "SPEC_DIFF: "
        f"{len(diff.field_changes)} contract field change(s), "
        f"{len(diff.diagram_changes)} diagram(s) changed "
        f"({structural_items} structural fact(s)), "
        f"{provenance_count} provenance change(s)"
    ]
    for change in diff.field_changes:
        where = change.section_heading
        if change.card_title:
            where += f" / {change.card_title}"
        detail = f"  contract {where}: {change.kind} field {change.key}"
        if change.kind == "changed" and change.old is not None and change.new is not None:
            detail += (f" (v: {_shown(change.old.get('v'))} -> {_shown(change.new.get('v'))}; "
                       f"g: {_shown(change.old.get('g'))} -> {_shown(change.new.get('g'))})")
        lines.append(detail)
    for change in diff.diagram_changes:
        prefix = f"  diagram {change.section_heading}:"
        if change.old_steps != change.new_steps:
            lines.append(f"{prefix} steps {change.old_steps} -> {change.new_steps}")
        if change.panels_added:
            lines.append(f"{prefix} panels added: {', '.join(change.panels_added)}")
        if change.panels_removed:
            lines.append(f"{prefix} panels removed: {', '.join(change.panels_removed)}")
        if change.nodes_added:
            lines.append(f"{prefix} nodes added: {', '.join(change.nodes_added)}")
        if change.nodes_removed:
            lines.append(f"{prefix} nodes removed: {', '.join(change.nodes_removed)}")
    if diff.generated_from_version is not None:
        old, new = diff.generated_from_version
        lines.append(f"  generatedFrom.version: {_shown(old)} -> {_shown(new)}")
    return "\n".join(lines)


def _load(path: pathlib.Path) -> Any:
    with path.open(encoding="utf-8") as handle:
        return json.load(handle)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("old_spec", metavar="old.spec.json")
    parser.add_argument("new_spec", metavar="new.spec.json")
    parser.add_argument("--annotate", metavar="out.spec.json")
    parser.add_argument("--quiet", action="store_true",
                        help="suppress a successful comparison summary")
    args = parser.parse_args(argv)
    try:
        old_spec = _load(pathlib.Path(args.old_spec))
        new_spec = _load(pathlib.Path(args.new_spec))
        diff = compare_specs(old_spec, new_spec)
        if args.annotate:
            out_path = pathlib.Path(args.annotate)
            annotated = annotate_spec(old_spec, new_spec)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            out_path.write_text(
                json.dumps(annotated, indent=2, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )
        if not args.quiet:
            print(format_summary(diff))
            if args.annotate:
                print(f"  annotated: {args.annotate}")
        return 0
    except (OSError, json.JSONDecodeError, ValueError) as exc:
        print(f"SPEC_DIFF FAIL: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
