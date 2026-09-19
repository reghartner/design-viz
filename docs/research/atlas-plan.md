# IoT visualization atlas — campaign plan

Goal: a browsable library of visualizations covering the full consumer IoT
camera / doorbell / sensor space — fictional high-level design docs (HLDs)
modeled on real market offerings, each rendered as a design-viz page,
under one index.

This records the original atlas campaign. Its sequencing and branch names below
are historical context; current maintenance follows the authoring skill and
`docs/panel-modularity.md`.

## Phases

1. **Research** (parallel, running): `iot-device-catalog.md` (Codex, from
   knowledge) + `iot-market-scan.md` (web-sourced). Output: device landscape +
   use-case enumeration + interaction patterns worth diagramming.
2. **Matrix + gap analysis**: merge research into `usecase-matrix.md` — every
   use case × the widget(s) that can carry it × gap (widget missing). The
   supported set now comes from `src/panels/types/` and the authoring contract.
   Use Radar for sensing geometry and explicitly author its alert transitions;
   preserve factual PIR hardware names in the source.
3. **Fake HLDs** (parallel by device family): `docs/hlds/<family>/<device>.md`.
   RULES: fictional company + product names (the repo precedent is
   doorbuzz-cloud/chime — never real brands); every permalink is a fake
   `https://github.com/<fictional-org>/<repo>/blob/main/...` path; every
   backend service invented but architecturally plausible; each HLD names the
   flows a diagram must show and carries at least one wire-contract table.
4. **Panel implementation**: one complete definition per
   `src/panels/types/<type>.js`, using the shared lifecycle and editor services.
   Include focused tests, a contract entry, an authored example and appropriate
   skin/print/reduced-motion behavior. Discovery, CSS and compatibility metadata
   are assembled automatically; coordinate edits to shared primitives separately.
   See `docs/panel-modularity.md`; do not add a central renderer switch.
5. **Specs + pages** (parallel by family): one spec JSON per HLD →
   `node tools/validate.js` clean → inject → `examples/<family>/`. Each page's
   entry added to `examples/manifest.json`.
6. **Index**: `tools/build_index.py` generates `examples/index.html` from
   `examples/manifest.json` (cards: title, fictional vendor, category tags,
   widgets used, link). Test: every example page present in the manifest and
   vice versa.
7. **Reviews + commits**: work on branch `iot-atlas` (on top of
   `thermo-pir-cookbook`, PR #11); Codex review per phase; push at the end.

## Conventions for all agents

- Authoring contract (`contract/authoring-contract.md`) is law; `cookbook/`
  has the worked recipes, including `adjustments.md` for geometry.
- Specs must validate with zero errors and warnings; follow the current
  authoring skill for any explicitly authorized exception.
- Fictional-universe consistency: one fictional company per real-world
  archetype, reused across its whole family (devices, services, permalinks).
- Every diagram argues something (a flow, a tradeoff, a failure mode) — no
  box-and-line inventories.
