# Company evidence and delivery

Read only the matching part. All repository paths below are relative to VIZ.
An authoring request does not authorize installation, publication, source-pin
acceptance, or changes to company systems.

## Confluence

For a Confluence handoff, author and validate the same spec outside Confluence.
Use `node <VIZ>/tools/confluence-export.js <spec.json> -o <OUT>/<name>.confluence.json`
or the workbench's **Export for Confluence** / **Copy JSON for Confluence** buttons.
This is ordinary compact spec JSON, not HTML, ADF or wiki markup; all authored
content is retained. The macro imports a snapshot and presentation settings only.
Do not move the editor into Confluence or add direct publishing. The company-side
agent handles Forge registration, installation and actual Confluence validation.

## Catalog, code drift, and incident evidence

**Connect to company evidence when requested.** Read `docs/canon.md`. Preserve
HLD provenance; use optional `page.canon` for design/canonical ownership. Resolve
node service/API bindings from a supplied catalog, never invent company entities.
Attach reviewed code references with full commit SHAs and unique literal anchors;
require stable step IDs. Canonical status and behavioral impact require human
review. The fictional `examples/canon/` catalog is for demonstrations only. For the
central repository, drift scanner, review dispositions and company adapter, use
`docs/canon.md`. Plain PR closure never accepts a source revision; a regression
keeps the expected story unchanged and links its issue.
For scheduled GitHub scans and company setup, use `docs/github-drift-automation.md`.
The live sample registry is `examples/canon/github/registry.json`; the local mock
registry contains fictional repositories and must not be enabled for live scans.
Scanning opens evidence reviews, never automatic behavioral acceptance.
Published node bindings also drive Backstage's automatic **Diagrams** tab; see
`apps/backstage/README.md`. Use the full kind/namespace/name identity. Do not add a
parallel manual diagram list or infer service associations from display names.
Backstage mounts inert specs with trusted bundled native code in an owned
ShadowRoot; describe the actual host policy and explicit links, not a sandboxed
frame or network-blocking iframe CSP. Company installation remains separate.
Bound nodes expose saved Backstage/API/source/code destinations through
right-click and a keyboard/touch **…** button. Preserve `binding` URLs and
immutable `codeRefs`; do not invent destinations from node titles. Code from
steps involving the node is labeled **Related step code**, not node ownership.
See the node-reference menu section in `docs/backstage-integration.md`.
For approved reference traces and incident alternates, use
`cookbook/canonical-incidents.md` and `tools/canon/trace-cli.mjs`. Bind exact
service/operation names with `traceMatch`; disambiguate parallel/repeated calls
with explicit selectors, never timestamp guesses. Budgets are authored. Missing
spans/metrics mean unknown; queue pressure and failed delivery require explicit
evidence. Generate independent IDs from the first differing beat and preserve
only the unchanged prefix. Do not copy happy-path physical/phone outcomes after
the fork without evidence and review. Keep the canonical spec unchanged until
an explicit spec review accepts the overlay. Company integration handoff:
`docs/backstage-integration.md`.
For a runnable code-drift demonstration, use the fixed fictional app in
`examples/canon/doorbell-app/` and `tools/canon/doorbell-rehearsal.mjs`; it tests a
refactor and a timeout regression in an isolated local Git history. The rehearsal's
review decisions are simulations, never automatic approval of company changes.
