---
name: hld-to-page
description: Convert one HLD (any path, any document structure) into one built visualizer page. Loads only the reference material the HLD actually needs. Use for any "turn this HLD into a page/diagram" request.
---

# HLD → page

You convert ONE high-level design document (HLD) into ONE page spec, build
it, and prove the page tells the same story as the HLD.

The design-viz is a TOOL your project pulls in — you normally work in
your own project, not inside the visualizer checkout. Establish three paths
before starting (ask the operator for any you don't have):

- **HLD** — the document to convert; any path, any structure.
- **VIZ** — the design-viz checkout (the repo with
  `tools/page_build.py`). Read-only: you read its contract, cookbook, and
  tools, and never write inside it.
- **OUT** — the directory in YOUR project where the built page lands
  (created if missing).

Every `tools/`, `contract/`, and `cookbook/` path here is relative to VIZ.
Your durable deliverables are exactly two files, both in your own project:
the spec JSON and its sibling coverage ledger
(`<spec minus .spec.json>.ledger.md`). Scratch files (saved document
versions for diffing, a sanitized bug repro under a scratch `--root`) are
fine in scratch locations.

## Mindset: think with the domain, never invent from it

You are an engineer who has actually read and understood this design. Use
that understanding everywhere it helps: to recognize that two flows run in
parallel, that a retry loop is really a state machine, that a latency
narrative is a waterfall, that a failure section mirrors the happy path.
Bring that thinking to the operator conversation and to every step you
author.

The hard line is between UNDERSTANDING and INVENTING. Every FACT the page
asserts — a number, a transport, an actor, an ordering, a payload field, an
outcome — comes from the HLD or from an operator answer, never from what
you know about how such systems usually work. Domain knowledge tells you
what to ask and how to show; it never fills a gap. Concretely:

- The design looks wrong about its own subject → render what it says; you
  may note your concern to the operator, but the page follows the document.
- The document contradicts ITSELF → quote both passages and stop; the
  operator's fix or ruling resolves it.
- The document is MISSING a fact the page must assert → stop and ask (see
  the STOP list). Plausible is not a source.
- Never drop content because it seems unimportant, and never "improve" the
  design.

## 1 — Read the HLD; build the coverage ledger

Read the document end to end. It contains no visualization instructions —
what to draw is decided in the conversation (step 3). The ledger records
what the document SAYS.

Sweep the whole document (structure varies — classify by what a thing IS,
wherever it sits) and write one row per: **flow** (any sequence of
messages/actions between components), **wire contract** (any payload field
table or list), **failure mode** (any degradation/outage description,
wherever it appears), **named service/component**, **number** (every count,
duration, threshold, capacity, percentage in the flows you'll render —
shown or not), and **permalink** (every URL attached to a component,
message, or flow). Every row ends in exactly one state:
`covered @ <spec location>` or `out-of-scope: <one-line reason>`. Silent
omission is the failure mode the ledger exists to kill.

The ledger is a deliverable with the page's lifetime — a later update agent
starts from it. Persist it to `<spec minus .spec.json>.ledger.md` in this
fixed, parseable format:

```markdown
# Coverage ledger — <page title>
source: <HLD url or path> | version: <vN or n/a> | updated: MM-DD-YYYY hh:mm

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Motion flow" numbered list | motion→clip walkthrough | covered @ blocks[1].tabs[0] |
| 2 | number | "holds events for 30s" | relay hold 30s | covered @ contract ttl row |
| 3 | number | "99.9% availability target" | uptime target | out-of-scope: no rendered flow asserts SLOs |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | transport for X→Y? | SQS | 09-08-2026 | blocks[0].diagram.edges[2] | active |
```

Rules that keep it parseable and durable: `class` is one of flow / contract
/ failure / service / number / permalink / amendment. `HLD anchor` is a
short VERBATIM quote (relocatable after edits), never a section number. An
operator answer that refines an existing row's fact UPDATES that row in
place with anchor `amendment A1`; an answer fitting no row gets a NEW
`amendment`-class row. Amendment `status` is `active` or
`voided: <what changed>`. Escape `|` as `\|` and line breaks as `<br>` in
cells. Ids are stable — never renumber; new entries take the next unused
number. `version: n/a` only for a genuinely unversioned local source; an
unknown version of a versioned source is a missing-provenance question for
the operator.

## 2 — Load only what this HLD needs

Always read (short, every page needs them):

- `contract/authoring-contract.md` — SKIP two spans: the `### panels`
  widget catalog (from `### panels` to `### steps`) and the
  `## Complete example`. Everything else is required. If ranged reads are
  awkward, reading the whole file once is fine — then you already hold
  every widget's docs and skip the fetches below.
- `cookbook/README.md` — the recipe table.

Everything else is fetched on demand, driven by what the HLD is about:

- **Widget docs**: `python3 <VIZ>/tools/widget_doc.py --list` names the
  types; fetch the ones this document's content calls for in ONE command,
  e.g. `python3 <VIZ>/tools/widget_doc.py --contract-card state log thermo`.
  Fetch liberally among plausible candidates — comparing and rejecting a
  widget is normal and cheap, and you need its real contract to propose it
  or to spot a required value the HLD never states. Never load a widget's
  docs twice.
- **Recipes**: the cookbook README table maps scenarios (temperature,
  battery, motion geometry, link health, mailbox, fleets…) to recipe files;
  read the ones that match. `cookbook/adjustments.md` maps visual
  complaints and warnings to knobs — grep it when you hit one.

Don't bulk-load reference material the document gives you no reason to
need; don't re-read what you already hold.

## 3 — The conversation: agree on what to draw

The page's shape is decided WITH the operator, never alone and never from
the document. Draft a compact proposal and STOP for approval before writing
any spec. Ideas are welcome — this is where your domain thinking earns its
keep. Propose the page you would actually want to read:

- **Structure**: sections/tabs, one line each on what that section argues.
- **Widgets**: per section, which panels and WHY — and your ideas: two
  flows that race each other, a state machine underlying a retry ladder, a
  waterfall for a latency budget, a failure tab mirroring the happy path.
  Name close alternatives you rejected.
- **Contract cards**: which wire table lands where.
- **Failure modes**: where each goes (own section, extra steps, or bullet),
  and any you propose to leave off — with the reason.
- **Everything accounted**: every ledger row maps to a proposed carrier or
  sits in the leave-off list with its reason. A row the proposal never
  mentions is a proposal defect; approval of such a proposal excludes
  nothing.
- **Open questions, batched**: missing facts (edge transports, actors),
  self-contradictions (quote both passages), and every widget that REQUIRES
  a value the HLD never states (battery % — a waterfall needs per-span ms
  when only a total exists). Never invent such a value, never silently
  downgrade; ask, offering the alternative.

Operator answers and adjustments are authoritative amendments: record them
in the ledger (update-or-create, step 1) and carry the exchange into the
report. The approved proposal governs authoring; a mid-authoring surprise
(a widget that doesn't fit, a new gap) goes back to the operator as a
delta, not an improvisation.

## 4 — Author the spec

**Structure**: one page = the whole HLD; the unit is the SECTION. Each
rendered flow gets a section with its diagram; prose-only sections are
normal (a second contract card, failure notes). Group sections into tabs
when the page has more than ~3. A section's top text/bullets carry the
HLD's own steps for that flow near-verbatim — the HLD's order, links, and
formatting — so the reader gets the document's words first, the animation
second. One contract card per section (a second table gets its own
section). `out-of-scope` is never a taste call: only operator agreement or
a genuine carrier limit qualifies — and plain text is a carrier (bullets,
step text, log lines can state almost anything), so carrier limits are
rare.

**Write each step like you were there.** For every step ask: what actually
happens at this beat? Which components act, and which merely wait? What
must the reader see to grasp the INTENT — the race, the handoff, the
timeout — while every word and number stays TRUE to the HLD? A step is a
claim about the system at a moment in time: its edge, its lit nodes, its
panel patches, and its text must all describe the same moment, and the
panels may only show states whose cause has already happened (a viewfinder
goes `live` when the stream starts and back to `off` when its session
ends).

**Facts vs authoring geometry.** Story numbers — anything the reader sees
or that drives a computed outcome: durations, thresholds, counts,
capacities, temperatures, stated geometry like a 130° field of view — go in
VERBATIM with a ledger row. Where a widget takes real units, enter them in
the HLD's units (radar `scale:{pxPerUnit,unit}`; sector zones in real
units; polygon `points` stay pixels — prefer sectors when the HLD gives
real geometry). Where a field is pixel-space with no scale (pir cone reach,
subject positions), draw proportionally and put the stated figure verbatim
in visible text — never type feet into a pixel field. Authoring geometry is
only what the HLD does NOT state (pixel placement, sensor origin, subject
paths): yours to choose, under one constraint — it must make the engine
COMPUTE the outcome the HLD narrates. Never invent ids, sequence numbers,
or finer breakdowns than the document gives.

**Computed outcomes stay computed.** `pir` trips, `radar` alerts/occupancy,
`thermo`/`battery` zones are computed from your inputs — choose inputs that
produce the HLD's outcome and do not use the force-flags the widget docs
advertise (`tripped`, `alert`): they bypass exactly this. `zoneframe` is
the authored exception — you place zones AND set the `verdict`, so check by
eye that they agree.

**Prose restates, never derives.** Step text and bullets may carry what
edges can't (acks, repeats, relay hops) — that is legitimate and
load-bearing. But copy the actor and the number from the HLD sentence; no
new arithmetic, no new attributions.

**Edge kinds are claims.** An edge's `kind` (and legend entry) asserts the
mechanism, so it comes from the HLD — use the matching built-in or declare
a custom kind in `page.protocols`. When the HLD says a message travels but
not HOW: that's a missing fact — STOP AND ASK, never a plausible default.
Named services survive: every service row appears as a node/float or is
named in the step text/bullet of the beat where it acts.

**Known engine limits** (workarounds, noted in your report):

- One addressable edge per `from->to` pair — a second message between the
  same pair in the same direction lives in step text or a log line. A
  return message is its own opposite-direction edge with `"ret": true`.
- `screen` has no playback mode — recorded-clip views are `save` + banner
  or step text, never `live`.
- Buffers: `mark` only cells the story has written (the `head` shows the
  write position); `dropped` (red) exactly when data was LOST, `empty` for
  mere reuse. Every threshold a panel declares (`warn`/`low`/`crit`) is
  exercised by some step, or its non-exercise is a deliberate ledger row
  with the normal covered/out-of-scope disposition.
- Pick 0-based index language and keep it; when the HLD's unit differs from
  the widget's cells, state the conversion once in a caption or bullet.
- Step hygiene: every step carries an edge, nodes, or a patch; two steps
  must never share the same FIRST edge (reorder each step's `edges` list —
  true firing order is preserved with `packets`); an overflowing edge
  label gets shortened, not nudged.

**Fidelity mechanics**: copy names and permalinks verbatim; never introduce
a real brand. An HLD field name missing on a widget translates to the
documented equivalent from the widget's docs (report every translation);
STOP only for an unknown widget TYPE or a field with no equivalent —
citing which catalog you checked. Every permalink ledger row lands on the
element it documents (`source` on sections and contract cards, per-field
`link`, node `link`, step `link`, or an inline bullet link — an inline link
always fits as last resort). A permalink follows its content: rendered
content carries its link; content out of scope under the admissible
reasons takes its permalink with it. "No natural element" is never a
reason to drop a link. Mirror the HLD's formatting where it has any
(nested bullets via `sub`, the same bolded terms, `*italic*` emphasis,
`` `code` `` identifiers — only section text/bullets and contract `note`
render markup; step text and labels are plain). Plain-prose sources get the
contract's own bulleting style, declared in your report as yours. Every
page declares `page.generatedFrom` — `{url, label, version, at}` — the
source's canonical URL and title, its version (unknown version of a
versioned source = operator question, never invented), and `at` = when you
produced the page, "MM-DD-YYYY hh:mm", your clock.

## 5 — Build

    python3 <VIZ>/tools/page_build.py <your spec> --root <OUT> \
        --desc "<one sentence>" --tags <comma,separated>

`--root <OUT>` is required in normal use (absolute path; created if
missing): the page HTML, source-named spec copy, and OUT's `manifest.json` land
flat there; nothing is written inside VIZ. The spec basename supplies the page
name. The one exception is maintaining VIZ's own example pages (HLD under VIZ
`docs/hlds/`): preserve that library's existing layout by passing its explicit
`<family>/<slug>` and omitting `--root`. (An explicit short kebab-case
`<family>/<slug>`, such as `payments/checkout-flow`, is also the optional nested
form for other libraries.)

The gate is 0 errors AND 0 warnings — never `--allow-warnings` on your own
decision. Fix what the tool prints (`cookbook/adjustments.md` maps warnings
to knobs), re-run to an idempotent `PAGE_BUILD OK`, and check the printed
widget list matches what you declared. Optional index over OUT:
`python3 <VIZ>/tools/build_index.py --root <OUT> --title "<name>"`.

## 6 — Audit against the HLD, not your memory

The build already ran the validator — do not re-run `validate.js`
separately; this phase is the checking the build cannot do.
Re-open the HLD. Walk the ledger row by row, pointing every `covered` row
at its actual spec location. Then replay the spec start to finish with the
document beside you: every panel state matches the narrative at that beat;
every number (JSON literals AND digits inside strings) matches its ledger
row — authoring geometry exempt from tracing but still producing the HLD's
outcomes; every bullet/step sentence names the same actor doing the same
thing as its source sentence; formatting and permalinks survived. Fix,
rebuild, re-walk what changed.

## 7 — Report

First WRITE the final ledger to its file — every row final, every amendment
recorded. Then reply with: spec path, html path, ledger path, manifest key,
widget list, the ledger, the full proposal exchange (proposal, every
operator answer/ruling, what each amended), every field translation, every
engine-limit workaround, and every `out-of-scope` row with its reason. Do
not commit — the coordinator commits.

## Updating an existing page after the HLD changed

Start from the ledger file beside the spec — it is the page's coverage
memory. If it is MISSING, a diff cannot recover coverage (deleted facts
have no rows; past amendments are unrecorded): do a full reconciliation
instead — Phase-1 sweep of the CURRENT version into a new ledger, then a
reverse audit walking the SPEC and flagging every rendered piece no row
covers (each flag goes to the operator, never silently kept or deleted),
and note in the header that amendment history restarts. Skip the
hunk-matching below in that case.

With a ledger, work from a diff — never re-read both full versions:

- **Confluence via MCP** (preferred with an MCP tool): save each version to
  a file, then `VIZ/tools/confluence_diff.py --files <old> <new>` — no
  credentials or network.
- **Confluence via REST**: `VIZ/tools/confluence_diff.py <page-url>
  --versions <old> <new>` (env `CONFLUENCE_BASE`/`CONFLUENCE_EMAIL`/
  `CONFLUENCE_TOKEN`; `--list` shows versions).
- **Other sources**: ask for a diff, or save two versions and use
  `--files`.

The diff is normalized readable text with hyperlink targets preserved.
Read only the hunks (a thin hunk → read that section; the whole document
only as last resort). Re-walk ONLY the rows the hunks touch — match by HLD
anchors against the hunk's removed AND added lines, falling back to the
row's fact and context when the anchor itself changed. A changed passage
VOIDS any amendment that answered a question about it (mark `voided:`;
re-ask if the gap remains). New material takes the normal steps; new
questions STOP, batched into one round. Unchanged rows and authoring
geometry stay untouched. One ledger write at the end (rows updated,
statuses current, header bumped). Update `page.generatedFrom`, build with
`--diff-prev`, and report: versions compared, each hunk → rows re-walked →
spec fields changed, AND every hunk judged out of scope with its reason —
a hunk producing no spec change never disappears from the audit trail.

**Never claim a missing engine capability from memory** — agents have
requested engine work for features that exist (multi-row layouts are
`rows`; staged reveals are `revealAt`; extra kinds are `protocols`). Before
writing "cannot be rendered", check and CITE the authoritative catalog:
`tools/widget_doc.py <type>` for a widget's fields (fetch it if never
loaded), `contract/authoring-contract.md` for page/diagram/step features,
the routed recipe for a scenario. No citation → the claim is invalid and
the content is not dropped. A cited genuine gap follows the STOP list; a
genuine engine bug follows the sanitized bug report.

## Fixing a gap found during review (paired change)

When the operator reports a defect spanning document and page (or resolves
HLD comments that change the design): the HLD is CANON, the page
supplementary. Draft ONE paired change — (1) an HLD patch as an exact
anchor/replace pair for `VIZ/tools/confluence_patch.py` (live or file mode
per available access), (2) the spec patch, (3) the ledger row add/update
binding them (anchors from the NEW text). Present both patches together;
apply NOTHING until the operator approves the pair in one round — approval
of one side alone is not approval to proceed, and a question raised by the
pair STOPS under the normal amendment discipline. Then HLD
first, spec second, rebuild with `--diff-prev`, one shared change token in
the Confluence version message and the ledger row. A change touching no
ledger row (pure authoring geometry — a tab label quoting no HLD text) is
spec-only: say so and leave the HLD alone.

## STOP and ask instead of proceeding when

- **A fact the page must assert is missing** — an edge's mechanism, an
  actor, a direction, a widget-required value. Ask precisely ("which
  mechanism carries X→Y — SQS or RMQ?"), batched in the step-3 proposal
  where possible; later discoveries still stop. A direct answer is an
  authoritative amendment: treat it like HLD text, record it in the ledger
  (update-or-create), and list it in the report. An answer about a NAMED
  channel amends the channel — every beat the HLD explicitly places on that
  same channel inherits it (flag each extension in the report); a beat NOT
  placed on that channel is a new question, as is any differently-described
  channel. Authoring geometry is not such a fact — that stays yours.
- **The HLD contradicts itself** — quote both passages with locations;
  never pick silently. A ruling gets the direct-answer treatment; an HLD
  fix means re-walking the affected rows.
- **A widget TYPE doesn't exist or a field has no documented equivalent** —
  with the catalog citation (see the capability rule above).
- **The validator warns and neither its message nor
  `cookbook/adjustments.md` names the knob.**
- **The framework itself misbehaves** — the tool fails for a reason not
  caused by your spec, or the engine renders what the contract says it
  shouldn't. File a SANITIZED bug report (below); never one quoting your
  HLD or spec.

A stopped page with a precise report is a success; a guessed page is not.

## Reporting a framework bug (sanitized reproduction required)

Everything derived from the HLD — names, transports, contract fields and
values, numbers, permalinks, prose — is confidential and must not appear in
a bug report. Build the reproduction FROM SCRATCH (never by editing your
spec — redaction leaks): nodes `svc-a`/`dev-1` titled "Service A", built-in
edge kinds or `proto-x`, fields `k1`/`k2` with `"v1"`/`"v2"`, links
`https://example.com/a`, neutral numbers — keeping only a trigger value's
STRUCTURAL property (length, position, sign), synthesized fresh. Then two
checks in order: (1) REPRODUCE — run the placeholder spec through the same
tool (`node <VIZ>/tools/validate.js <repro>` for validator bugs;
`python3 <VIZ>/tools/page_build.py <repro> bugrepro/x --root <scratch>`
outside OUT and VIZ for build bugs); a repro that stopped reproducing lost
its trigger — re-synthesize, never fall back to real content. (2) LEAK
CHECK — walk every confidential class against the repro and report text,
using your ledger's rows for services/numbers/permalinks plus the unlisted
classes (transports, field names/values, copied phrases). The report:
framework file/tool, what the contract says should happen (quotable), what
happens instead (tool's own message minus your echoed content), the repro
spec, the exact command. File it separately from your conversion report.
