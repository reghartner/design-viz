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

## claude.ai artifacts

Publish only when the user asks. Build the HTML from the spec with the current
template: `python3 <VIZ>/tools/inject.py <spec.json> <VIZ>/template/flowview.html <out.html>`
(run `python3 <VIZ>/tools/build.py` first if `template/` may be stale). Publish it
with the Artifact tool. An ordinary page declares only
`capabilities: {comments: {"composer_only": true, "customAnchors": true}}`.
A tracked page (one with `page.tracking`, see the `live-status-board` skill)
adds the viewer's Jira connector:
`capabilities: {mcp: {servers: [{server: "Atlassian", tools: ["getAccessibleAtlassianResources", "searchJiraIssuesUsingJql"]}]}, comments: {"composer_only": true, "customAnchors": true}}`,
where `server` is the connector's exact display name in claude.ai Settings →
Connectors: "Atlassian" (or "Atlassian MCP", whichever the viewer's copy of
Atlassian's own directory connector shows), or the custom or mock connector's
own name. Never give a custom connector the name "Atlassian MCP":
claude.ai resolves that name to Atlassian's directory connector and asks for an
Atlassian login. The provider picks the connector by the tools it offers, so one
declared name is enough. See `docs/live-status.md` ("Publishing as a claude.ai
artifact") for connector setup, approval behavior and the mock server. Tool shapes follow
public documentation.
That lets the page label comments by Tab and View, make "Go to" switch Tab,
View and step, and keep step controls working in comment mode; see
`docs/tab-views.md` ("Comments on claude.ai artifacts"). Without the declaration
the page falls back to claude.ai's default comment placement.

To update an existing artifact, read it first and republish to its same URL.
The built page carries an agent guide block (`id="dv-agent-guide"`, written by
`tools/inject.py`) with that loop and the declaration to pass; see
`docs/live-status.md` ("Embedded agent guide").
Comments stay with the artifact URL; publishing a new artifact starts with
none. Older comments keep their saved location and label. claude.ai saves
comment locations as position paths, so a rebuild that changes page structure
can move an older comment to a different element.

## Catalog, code drift, and incident evidence

**Connect to company evidence when requested.** Read `docs/canon.md`. Preserve
HLD provenance. For maintained canon, root `canon.json` owns membership and
ownership; providers derive `page.canon` compatibility metadata without changing
the authored source. Resolve node service/API bindings from a supplied catalog;
never invent company entities.
Attach reviewed code references with full commit SHAs and unique literal anchors;
require stable step IDs. Canonical status and behavioral impact require human
review. Keep each maintained spec and generated HTML together under
`diagrams/<name>/`, and enroll its folder and owner in root `canon.json` only when
promotion is authorized. Python and nginx image builds publish that central list.
Do not edit the generated `diagrams.json`; per-spec flags do not enroll a document.
The fictional `examples/canon/` catalog is for demonstrations only. For the
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
For the current company topology, `backstage-diagrams` is one Flowview fork
containing engine/editor/specs, with a static nginx workbench and no hosted APIs.
The Backstage plugin reads diagram specs from GitHub and renders them with its
installed engine. The public toolkit's proxy/read-API adapter is a reference
rehearsal, not that company topology; label it accordingly. Consult
`docs/backstage-integration.md` for the GitHub-loader handoff and distinguish
operator-specified target architecture from verified implementation evidence.
Bound nodes expose saved Backstage/API/source/code destinations through
right-click and a keyboard/touch **…** button. Preserve `binding` URLs and
immutable `codeRefs`; do not invent destinations from node titles. Code from
steps involving the node is labeled **Related step code**, not node ownership.
The workbench service picker seeds a missing or blank node title from the catalog
name in the same Undo action as the binding; existing titles remain authored.
For bulk graph seeding, use **From service catalog** on the homepage or **Add to
diagram → Services from catalog**. Choose an explicit subset of approved service
identities. Optional connections come from `dependsOn` or `consumesApis` joined
to selected API providers; arrows point to the dependency/provider. Connections
use one edge per directed pair, retaining every consumed API title
and any explicit dependency. Existing authored edge labels remain unchanged.
API display titles prefer catalog metadata, then OpenAPI `info.title`, then the
entity name; the fully qualified entity reference remains the identity. Catalog
connections are structural relationships, not observed calls or an execution timeline. Author
steps from actual evidence separately. Existing bound nodes are reused; the
whole insertion is undoable. See `docs/workbench-catalog-sync.md` for the snapshot
shape, import path and dependency export configuration.
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


### Direct links to published canon diagrams

The static workbench serves read-only diagrams at
`workbench/flowspec.html?diagram=<page.canon.id>` (URL-encode the ID). Library
cards and the reader’s **Copy link** action expose that address. It needs the
built `workbench/diagrams.json`, not a Backstage connection or read API. Keep
canon IDs stable when moving spec files. Links show the latest published
snapshot at the document’s initial view/step; use standalone viewer links for a
specific playback position. `?canon=` is the legacy backend editing route, not
the public reader link. See [the publishing guide](../../../../docs/workbench-canon-library.md).

Diagram handoffs in Backstage 2.0.0 require `spec`; `handoff.url` is removed.
Use `siteBaseUrl` and `claudeUrl` for known target destinations. GO TO stays in
Backstage through `loadSpec`; unpinned IDs outside the association list need
`resolveHandoffDiagram` backed by the company's approved index. Never invent a
revision. See [the handoff migration recipe](../../../../cookbook/diagram-handoffs.md#continue-in-a-separate-document).

For tracked pages, always add the authored Live status panel as described in [live-status-board](../../live-status-board/SKILL.md#always-add-the-live-status-panel).
