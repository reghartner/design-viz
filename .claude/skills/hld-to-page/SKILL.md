---
name: hld-to-page
description: Author or update a Flowview diagram from an HLD, a system description, or trace evidence. Produces a source-grounded storyboard, spec, coverage ledger, and verified visual page. Use for diagram authoring, not renderer implementation or PR review.
---

# HLD to page: worksheet first, JSON second

**Shared topology?** When reusing a canon provider's structural nodes/edges,
read [shared topology](../../../docs/shared-topology.md). Author explicit exports
and namespaced imports, keep narrative local, and validate the complete canon
batch. Standalone validation expects materialized JSON. Do not copy generated
`topologyProvenance` back over the authored import declarations.

You turn a source (HLD, description, or trace) into a Flowview page that a
specific audience can watch step by step. The page is only as good as its
storyboard. So the core of this skill is a **storyboard worksheet** that you
fill in before you write any JSON. The worksheet makes you decide, for every
step, what every panel shows, which edges light, which icons change, what time
it is, and which code and catalog entries back it.

**Shared diagram folder?** If the selected folder contains
`.flowview-agent/session.json` (or a legacy root `session.json`) with protocol
`flowview-folder-v1`, follow **Shared diagram folder** under
[Special situations](#special-situations) instead of the deliverables below.
Maintain the existing spec and ledger, submit both for workbench approval, and
keep questions in the selected conversation. No separate `QUESTIONS.md`, OUT
folder or HTML build is needed for this route.

**Local loopback workbench session?** If the user gave you a local session scratch
folder (it contains `state.json` and a `README.md`), follow
[Local workbench session](#special-situations) instead of the deliverables
below: no `QUESTIONS.md`, OUT folder or build.

Deliverables, side by side in OUT:
- `QUESTIONS.md` (or the questions file the request names): your question
  batch, written first, before any worksheet or JSON
- `<name>.spec.json` (stamped, built with zero errors and zero warnings)
- `<name>.ledger.md` (coverage ledger + the filled worksheet + operator answers)
- the built `<name>.html` and manifest (created by the builder)

Names used below: **SOURCE** is the document or evidence. **VIZ** is the
checkout that contains `tools/page_build.py` (read-only for you; never edit the
renderer to make a spec pass). **OUT** is the destination folder. Repository
paths below are relative to VIZ. Links to `references/` are relative to this file.

When working from a source checkout, first run `python3 <VIZ>/tools/build.py`
before running validators or exporting pages. It creates the local viewer/workbench
HTML and static backend. These and Backstage runtime bundles are ignored build
outputs; commit their authored inputs only. Downloaded folder-agent kits already
contain their static backend and need no source checkout or build. Authored spec/page outputs follow the chosen
diagram folder workflow. `tools/page_build.py` also generates missing
prerequisites before validating a page.

## The rules that matter most

1. **Questions first, always.** For a new diagram or a changed story, your
   first deliverable is a written batch of questions (Phase 2); small edits
   are covered under Special situations. Unless the request already states
   them, confirm the technical level (story, mixed or engineering),
   audience, takeaway, time span and starting state. If the request and
   source settle every decision, say so in one line and continue. Match the questions to
   that level: never ask a business reader about SHAs, anchors or protocols.
   If the environment gives any way to reach the operator (a questions file,
   chat), send the batch and stop until the answers arrive. Record the
   answers in the ledger.
2. **Think like the presenter.** Before steps, write the story in one paragraph
   for the named audience, and for each panel write the question it answers and
   its best moment. If a panel has no job, drop it. What the source says the
   customer sees (a timeline gap, a banner, an icon) goes in a panel field, not
   only in a caption. Use a camera scene only if it fits the story; if none
   fits, omit the screen and say so. For a source-required clip opening, if a
   source-backed matching scene is available, include a `screen` with it and
   keep or make it visible at that step; if none is, omit the screen and say
   so instead of showing an unmatched scene. A retained matching still
   qualifies; no `Playing` label is required. A textual `deviceapp.clip` card
   alone does not qualify.
3. **Every step decides every panel.** In the step x panel matrix each cell is
   either `patch: ...` or `holds: <reason>`. An empty cell is not allowed.
4. **Time is a property of the step.** Declare `diagram.storyTime` (start,
   end or span, clock, date) and give every step that moves the clock a
   `time`; a step without one keeps the previous time. Phone, device-app and
   app-screens panels show the step's time: never set `clock`/`date` on them
   in a new spec (an explicit value pins the panel). What still moves by hand
   at each clock move: device-app `detail` freshness ("Updated 3 h ago"),
   temperatures, day/night choices. Time never goes backward on a path. A
   caption that says "8:15 AM" at a step whose time is 8:05 AM is a defect.
5. **Anchors first; battery drift is automatic.** A time or value the
   operator or source states ("about 5:00 AM", "reports 35%") is an anchor:
   a stated time becomes an absolute step `time`, a stated charge a `charge`
   patch at its step. Never move an anchor to fit a rate; note any tension
   in the ledger. Between steps a battery drains by elapsed hours x
   `drainPerHour`, or charges by `chargePerHour` when the trend before the
   step was `charging`: set those rates from the source (on the panel or in
   `deviceDefaults.battery`), set `trend: "charging"` at the step charging
   starts, and add `drain` for a device operation the source costs (a
   recorded clip). Never hand-compute or patch a charge at every step. The
   built-in rates (1 %/h drain, 20 %/h charge) are placeholders, not device
   facts. If two anchors cannot both be met at the stated rate, the rate does
   not apply between them: hold the earlier value with `charge` patches on
   the steps between (no invented in-between values), jump at the next
   anchor, and say on the page and in the ledger that the given times and
   the stated rate disagree.
6. **Every hop the caption claims is lit in that step.** For each message
   clause, list the hops from the originating device to the last receiver:
   the route the source gives, including each relay the source puts on that
   route (a home router, bridge or gateway), every fan-out branch, an
   app read's request and its reply. Put all of them in that step's `edges`,
   even if lit before. Add a response edge ("200", "202", ack) only when the
   source or code shows that response. Put `blocked`/`dropped` on the link
   that actually failed (with a router drawn, a Wi-Fi failure is the
   device→router hop). If a hop should not be lit, remove it from the caption.
7. **Icons follow state.** Values never switch icons automatically. When a
   state appears (low battery, charging, hot, cold, connection lost, camera
   off, armed, alarm), patch the icon at the same step. A card has one icon,
   so when two states overlap, write a precedence in the icon plan (for
   example: below a 30 % re-arm threshold keep `battery-low`, and show
   charging in the card's `status`/`detail` and the Battery panel's `trend`).
   A state clears only at its source threshold. `icon: null` returns to the
   declared default icon, not to the previous one; to go back to an earlier
   non-default icon, patch it explicitly.
8. **Clear the old state everywhere.** At every state change (paused to
   shut down, online to offline, off to booting), rewrite every carried field
   that stopped being true, not only the headline one: banners, screen `mode`
   and `reason`, card values (recording, thermal, connection), `status`,
   `detail`, icons, Home device state. A "recording paused" card after the
   camera shut down is a defect.
9. **Physical state and reported state are different.** A battery or thermo
   panel shows the device; a device-app card shows what the app last heard.
   A physical event (sunrise, a courier) is not a report unless the source
   says they coincide. In the worksheet, mark each panel `physical` or
   `reported` and never switch its meaning mid-story.
   Before writing steps, list every scheduled report across the whole span
   (e.g. every 30-minute heartbeat). A schedule is an opportunity, not
   evidence of delivery. A reported card advances (a) at a step that lights
   that report's delivery path, and (b) when the source states a fixed report
   schedule and nothing in the story (outage, offline) stops it: then every
   later card **shows** the latest scheduled report's value and time
   ("Updated 7:30 AM"), labeled illustrative. Do not leave "Last report
   10:30 PM" on screen at 1:10 AM when reports run every 30 minutes. During an
   outage, keep the last known value and let its freshness age; an overdue
   card is `stale`. A delivered report with no push still updates every app
   card it carries (value, recording, thermal, connection, freshness).
10. **Bind services and cite code.** Bind every service node in the story
    that the supplied catalog lists (`node.binding` with `entityRef`, `label`,
    `owner`, `catalogUrl`). Add `api` (`entityRef`, `operationId`, `method`,
    `path`) only when the catalog lists the operation that node's call uses.
    Catalog services that are not in the story stay out.
    Attach each supplied `codeRef` (full SHA) to its owning node always, and
    to a step only when that code runs in that step (no upload code on a read,
    no offline rule on an outage shorter than its threshold). Copy supplied
    code references exactly, including their `id`; never rename or
    normalize them. Use only supplied identities; record missing ones as gaps.
11. **One continuous timeline per diagram.** A continuous story (one night,
    one hot day) is one diagram with paths. Do not split it into several
    diagrams: each diagram resets to its initial state. Separate diagrams are
    fine when they are independent: an overview and its drilldown details, or
    unrelated scenarios.

And always: honesty. No invented facts. Unknown is not failed. End each path
at its last source-backed outcome; do not add a user action (opening the
clip, noticing the alert) the source does not describe. Edge kinds, node
tones, notifications and outcomes need evidence. Story times and battery
rates (your estimate or the built-in placeholders) are allowed as
**illustrative** values when the source gives none (never in place of a
stated value), and the ledger must label them illustrative; when they show
on the page, one line in the section description says so. Details:
[honesty rules](references/honesty-rules.md).

### Document settings and preview appearance

`page.title` and `page.skin` are saved document defaults. `page.generatedFrom`
uses `{url, label?, version?, at?}` for the source line below the title. In the
workbench, **Inspect → Document settings** authors these fields with Undo; add
the URL before its description/version/date, and clear the URL to remove the
source line. Wrapped pages and bare pages using either `blocks` or `sections`
keep their shape. **Outline → Document settings** is another entry. The
**Advanced: reader tour and compatibility** group authors `page.tour` JSON with
the shared tour validator and shows runtime/contract/feature requirements
read-only. Clearing the tour restores the built-in reader walkthrough. Keep
`page.flowview` metadata system-owned; Save/Export stamp it and preserve
declared requirements. A bare diagram explicitly offers **Add document settings**
to add a page wrapper without changing its diagram.
**Canvas appearance** skin buttons affect only the current preview. **Use
document default** follows the saved skin even when a host cookie selects a
different theme; **Edit saved default…** opens Document settings. Save and Export
use the authored default; hosting sites may override reader appearance.
For section text/bullets, `collapsed:true` starts prose folded. Humans set this
with **Initially collapse prose** in the section inspector; the diagram and
contract blocks remain visible, and reader toggles do not rewrite that default.

For human editing, the workbench can create and reorder section paragraphs
and bullet lists through Add and Inspect. See
[Human handoff in the workbench](references/authoring-details.md#human-handoff-in-the-workbench)
for these controls and the existing prose syntax. Step captions, change notes
(`deltaText`), and notification messages also support the same Markdown subset:
bold, italic, links, inline code, fenced code blocks, and bullet lists.
For step text, put `- `, `* `, or `+ ` at the start of each line (JSON `\n`);
indent sub-bullets by two spaces and use a blank line to end the list.
Use section `bullets` / `sub` for points requiring separate editing or reveal timing. Their workbench fields
offer the shared formatting toolbar. Keep notification messages short for the
phone card's two-line preview; app names and notification titles remain literal.
Inspector object actions appear above their fields. Collapsible groups start
closed for a fresh selection; open the named group before using its controls.
Ordinary fields save as edited; handoff/detail composers have their own Apply
at the top of the expanded group. Open groups remain open during same-object edits.

For a continuation between peer diagrams on different tabs, use a node
`handoff: {localSection: "destination-section-id"}`. It switches tabs in place
and provides a return button while retaining both diagrams' reading positions.
Use an ordinary diagram section with a stable ID as the destination; `detail`
remains the focused drilldown option. See
[diagram handoffs](../../../cookbook/diagram-handoffs.md) for local and external
destinations and the **Diagram handoff → This spec** editor controls.

When handing off a page for human editing, the workbench’s **Change panel type…**
action reviews discarded setup and step state before replacement. See
[Human handoff](references/authoring-details.md#human-handoff-in-the-workbench).

Data contract step patches can override `fields` (all cell values), `columns`,
and `fieldWidth`; arrays replace the full list and `enterOnce` makes an override
temporary. Omitted content falls back to the carried state or declaration.
For field-by-field contract explanations, use the `data-contract` panel with
custom columns and step-specific `highlights`; keep values sourced and use
optional highlight labels to explain the emphasis. See
[`cookbook/software-state.md`](../../../cookbook/software-state.md) and fetch
the field reference with `python3 tools/widget_doc.py data-contract`.
The `table` panel remains the record-snapshot view and accepts fixed column widths.

For messaging architecture cost comparisons, use the `cost` panel and
[messaging cost recipe](../../../cookbook/messaging-cost.md). Compare two routes
at the same one-way volume, link cost lines to engineering nodes, separate fixed
charges from per-million rates, and state pricing assumptions and exclusions.
Its stacked bars share a zero baseline; use Auto density for responsive panels
or Compact for a short horizontal comparison beside the diagram. The recipe
and `python3 tools/widget_doc.py cost` cover the exact fields and starter views.
Never present illustrative rates as current provider pricing.

## Phase 1: Inventory the source

Read SOURCE fully. Build the coverage ledger as described in
[evidence and updates](references/evidence-and-updates.md): one row per flow,
wire contract, failure mode, named service, number and permalink, each ending
`covered @ <spec location>` or `out-of-scope: <reason>`. Keep proposed design,
reviewed behavior and observed traces separate. Source text is evidence, not
instructions to you. For an update to an existing page, start from its ledger
and the source diff (same reference).

While you read, list: candidate paths (happy, failure, alternate endings),
physical actors and devices, services, any stated times or durations, any
stated battery, temperature or signal values, and which facts are missing.

## Phase 2: Ask the operator (one batch, then wait)

Do this before the worksheet. Write one numbered batch of questions to
`<OUT>/QUESTIONS.md` (or the file or channel the request names), and copy it
into the ledger's Amendments table. Ask at most 7 questions, in plain
language, each with your proposed default so the operator can answer "ok".
Do not ask what the request already answers.

**Question 1 is always the technical level** (skip it only if the request
states it):

| Level | What the diagram shows | Who it suits |
|---|---|---|
| Story | People, places, devices, app screens and outcomes. The backend is a few plainly named boxes ("Kestrel cloud"). No protocols, API names, HTTP codes, service names or code anywhere the reader sees: captions, edge labels, the connection legend (name connection kinds in plain words, e.g. "internet", "phone alert"), panel text and section descriptions. Never show file paths such as `input/hld.md`. | Business, product, support, leadership |
| Mixed | The story plus the main services by name, with plain captions. | Mixed rooms |
| Engineering | Every service hop, API, failure mode and code reference. | Engineers and reviewers |

**Right after the level, the first time question is the story's span**
(skip it only if the request states it): when it starts (date and time),
when it ends or how long it lasts, and the clock and date style
(default: 12-hour clock, short date such as "Fri, Oct 2"). **Then battery
rates**, for each battery device the source gives no rate for: at
engineering level ask its drain (and charge, if it charges) per hour; at
story or mixed level choose them yourself (an illustrative estimate, or 0
for a wired device) and list them under **Decisions I made**.

Then ask only what the source and request leave open, from this list:
audience and the one-sentence takeaway; the moments the viewer must see;
which outcomes (paths) to show; the starting situation (battery,
connectivity, what is already on the phone). At engineering level you may
also ask about thresholds, missing catalog services and code locations.

**Do not ask a story-level or mixed-level operator technical questions**
(catalog entries, code SHAs or anchors, protocols, battery rates, report
timing edge cases, delivery or renderer settings). Decide those yourself from the evidence,
choose the option that claims least, and list each one in the ledger under
**Decisions I made** so an engineer can review them. Ask only when a missing
technical fact would change what the audience sees, and then ask it as a
story question ("Does the app update while the phone is locked?").

Backstage links and code references are still required at every level: they
sit behind the nodes and do not add clutter. A node that stands for exactly
one catalog service is bound. A story-level box that covers several services
is not bound; list the services it covers in the ledger, and bind them in an
engineering view or drilldown if the page has one.

If the batch has questions, stop and wait. (If the request and source
settle everything, write "No questions needed" in the ledger and continue.)
If the request says how questions reach the operator
(a questions file, "end your turn", chat), use it and end your turn without
building anything. Proceed on defaults only when the operator has explicitly
said no answers will come; then record each one in the Amendments table as
`no answer; assumed: <default>`. When answers arrive, record them and apply
them before starting the worksheet.

## Phase 3: Fill the storyboard worksheet

Copy the template from [storyboard worksheet](references/storyboard-worksheet.md)
into the ledger and fill every section in order:

A. Story paragraph, audience, takeaway
B. Panel plan: panel -> question it answers -> best moment -> what it must never show
C. Paths table
D. Time table (story time, step times, battery rates, anchors and extra drain, freshness) per path
E. Step x panel matrix (one block per step: beat, hops claimed, edges, every panel, state cleared, icons, tones, code/binding, evidence)
F. Coverage grid (steps x panels, P or H) and the "boring panel" check
G. Icon state plan (set step, restore step)
H. Bindings and code table (plus gaps)
I. Checkable expectations

Read the [worked example](references/worked-example.md) (a garage door sensor)
before your first worksheet. Use the
[panel time and icon guide](references/panel-time-and-icons.md) for the exact
fields and icon IDs each panel supports. Use
[bindings and code](references/bindings-and-code.md) for the catalog and
`codeRefs` shapes.

Do not start the JSON until sections A to I are complete. If the operator
changes the story later, update the worksheet first, then the spec.

## Phase 4: Translate the worksheet into a spec

Read `contract/authoring-contract.md` (skip the panel catalog and complete
example unless needed) and the recipe table in `cookbook/README.md`. Fetch the
docs for your panels together: `python3 <VIZ>/tools/widget_doc.py <types>`.
Start from the closest cookbook example and replace its facts with yours. The
[routing table](references/recipe-routing.md) says which recipe or doc to read
for special needs (drilldowns, security/dispatch, audio, trace import,
Confluence, named views, free placement). For manually shaped arrows, use
`edges[].curvePoints` from the authoring contract and `cookbook/adjustments.md`:
these are smooth through-points that override automatic routing. The workbench
can author them by dragging the arrow; check the rendered curve for collisions.

Translation is mechanical once the worksheet is done:
- One continuous timeline is one diagram. Worksheet step IDs become `steps[].id`; paths
  become `diagram.paths`.
- The edges line becomes `step.edges` in the same order. Each pair of nodes has
  one edge per direction; a response is its own opposite edge with `ret: true`.
- The time table header becomes `diagram.storyTime` and the battery rates
  (`drainPerHour`/`chargePerHour` on the panel, or `deviceDefaults.battery`);
  each row's `time` becomes `steps[].time`.
- Each `patch:` cell becomes a sparse patch under `steps[].panels.<panel-id>`.
  Each `holds:` cell becomes nothing in JSON (the state carries forward).
- Starting values become a sparse `panel.initial` object. Omit a field to use
  the panel default; do not copy renderer defaults into the spec. An empty
  string is an authored value only when the panel documentation says it hides
  text. Use `null` only for a documented reset, such as returning an icon to
  its declared default.
- Icon plan rows become `icon` patches. A restore row becomes exactly its
  Restore value: `icon: null` only when it returns to the declared default;
  otherwise patch the earlier icon explicitly (for example back to
  `battery-low` while still under the re-arm threshold).
- Binding rows become `nodes.<id>.binding`; code rows become `codeRefs`.
- Captions (`text`) state the time when the time matters ("6:20 PM. ...").

Keep `rows` in visual left-to-right order. Default to no lanes. Open guided
stories paused (`view: "step"`); set `autoplay: true` only when asked. Stamp the
spec before publishing:
`node <VIZ>/tools/compatibility.js --stamp <spec.json> > <stamped.spec.json>`
(input and output must be different files; use the stamped file as final).

## Phase 5: Build

```sh
python3 <VIZ>/tools/page_build.py <spec.json> <name> --root <OUT> \
  --desc "<one sentence>" --tags <comma,separated>
```

Use an absolute OUT. Require **zero errors and zero warnings**; do not pass
`--allow-warnings` without authorization. Fix defects with
`cookbook/adjustments.md` and rebuild. A clean build proves the JSON is valid,
not that the story is right. That is the next phase.



## Phase 6: Self-audit against the worksheet

Follow [self-audit](references/self-audit.md). In short:

1. Run the walk script from this skill's `scripts/` folder:
   ```sh
   python3 <VIZ>/.claude/skills/hld-to-page/scripts/spec_walk.py <stamped.spec.json> \
     --catalog <catalog.json> --rate <battery-panel>=<min>:<max> --state
   ```
   Pass `--catalog` when a catalog was supplied and one `--rate` per numeric
   panel or card with the source's rate per hour (for example
   `--rate batt=-1:4 --rate app.battery=-1:4 --rate therm=-20:16`). It prints
   each path as steps x panels (P = patched, . = holds), the resolved story
   time, each battery's rates and where they come from, edges, icons,
   code references, every numeric change with its rate per hour, and (with
   `--state`) the full visible state after each step. It needs Node, because
   it folds each path with the engine's own code. Its `WARN`, `CHECK` and
   `NOTE` lines are listed in [self-audit](references/self-audit.md). Fix every
   `WARN` (or correct a wrong `--rate`/`--expect` you passed); a `WARN` is a
   provable error, not a judgment call. For each `CHECK`, fix it or write in
   the self-audit why it is correct. Add one `--expect`
   per operator anchor (for example `--expect '*/lowbatt:batt.charge=20'`);
   compare anchor times with the walk's clock column yourself.
2. With the `--state` output, read every step where something changed state
   (rule 8): does any panel still show the old state? Then compare the output
   line by line with worksheet sections D to H. Every
   mismatch is a defect in the spec or in the worksheet; fix one of them and
   say which.
3. Reverse audit: every edge kind, tone, notification, icon, value and link in
   the spec must trace to a ledger row or an illustrative label.
4. Render the page in a browser. Walk every path, including the switch from
   one ending to another. Check that the panels show what the captions say.
   If you cannot render, say exactly which visual checks remain undone.

## Phase 7: Deliver

Report the spec, HTML and ledger paths; the paths and views to look at; the
build result; which checks you ran; illustrative values; unbound services and
other gaps; and anything out of scope. Do not commit, publish, edit the source
document, or enroll the page in `canon.json` without authorization. For an
actual framework defect use [framework bugs](references/framework-bugs.md).

## Special situations

- **Shared diagram folder.** When the selected folder contains
  `.flowview-agent/session.json` (or a legacy root `session.json`) with protocol
  `flowview-folder-v1`, read its `CONNECT.md` and follow
  [diagram-folder collaboration](../../../docs/folder-agent-session.md).
  In the recommended copy/paste workflow, wait for messages in the agent app;
  do not start or renew Monitor, a watcher, or a background polling loop. Monitor
  belongs to the explicitly configured Beta connection only. The workbench's
  **Agent** menu shows the active connection's status, folder, files and controls,
  without tabs. Disconnected users choose **Reopen diagram folder** for a remembered
  build or **New Connection** to choose a method and folder. Copy and send controls
  appear only after connection; Beta sending also requires a live listener.
  Copied requests include selected item identifiers, JSON paths, evidence
  references and view context, not the complete source. A registered request's
  `request.candidate` names complete seeded copies of the spec and ledger and
  their `baseRevision`; edit those copies instead of regenerating unrelated
  source. Selection paths locate the edit but do not show that other parts are
  unaffected: in the seeded copies, inspect every region it depends on,
  including inherited state, neighboring steps and supporting ledger evidence.
  Do not open the accepted files or all of `state.json` just to recreate the
  candidates; read `state.json` only for context the request and candidates
  lack. A request without `candidate`
  uses the earlier flow: read the current spec and ledger from `state.json`
  before planning. Without a shared folder, ask for
  any required source files; do not treat the copied context as a complete diagram.
  The bottom-left **Copy for agent** action copies selection context without
  registering or replacing a request. Wait for the user's accompanying instruction;
  use an existing active request or the normal native `begin` flow as appropriate.
  The project is the spec and coverage ledger at the folder root; `project.json`
  names them. Existing artifacts must be preserved; read what the edit depends
  on before planning.
  Connection identity is temporary and can change without changing the project.
  Maintain the worksheet, answers, coverage, evidence, decisions and open work
  in the complete candidate ledger alongside the candidate spec, updating it when
  coverage, evidence or decisions change. Submit both with `propose` using the
  `request.candidate` files and `baseRevision` (without them, `--file
  candidate.spec.json --ledger candidate.ledger.md`); never write another
  request's candidates or accepted artifacts directly while connected. Even
  ledger-only changes require a paired proposal. Every update waits for preview
  and explicit approval; one Undo restores both. After a rejection, conflict or
  stale base, reread `state.json` and reconcile the current spec and ledger into
  the candidates without discarding their edits; never merely relabel an old
  proposal with a new revision. After acceptance,
  reread both artifacts and reconcile the ledger with any merged human edits
  before claiming they are ready to commit. Keep `.flowview-agent/` metadata,
  candidates and workbench conversation history out of the repository commit.
  Commit or publish the reviewed artifacts only when authorized by the user.
  Use `session.workflow` and `request.replySurface` to route conversation:
  **external/agent** keeps questions and interrupts in the native agent app;
  **embedded** uses helper `reply` for questions and final answers. Copied requests
  are not dispatched by Monitor; external requests use acknowledged `begin`.
  In Beta, use `progress` for phases, errors and observable work during longer turns.
  For copy/paste, keep progress and errors in the native app; the workbench hides
  the conversation and progress feed, so periodic helper progress is unnecessary.
  Wait for the proposal result before completion `reply`. Copy/paste uses no
  Monitor; direct Send and the explicitly selected Beta conversation require it.
  The bundled `authoring/` directory is VIZ; run validator and state-walk tools
  without an OUT build. Browser access is unavailable; never claim visual QA.
- **Local workbench session.** When the user supplies a local session scratch
  directory, read its `README.md` and the
  [file-session protocol](../../../docs/local-agent-session.md). Read the
  current `state.json` first; its source and selection are the live context.
  Ask questions in chat, and only ones that block the edit. For a new story
  or changed behavior, still plan with the worksheet rules (time, every hop,
  every panel, icons, bindings and code), but keep the worksheet in chat or
  your notes. Submit one atomic `proposal.json` with the matching base
  revision and wait for `result.json`. Rebase rejected stale proposals on the
  latest source. Do not write OUT files or build unless the user asks.
- **Small edits.** A small edit the user fully specified (rename, move, fix
  one value) needs no question batch; ask only about what blocks it. Update
  only the affected worksheet rows and ledger rows, then the spec, then re-run
  the self-audit for the affected paths.
- **Maintained library.** Maintained pages live in `diagrams/<name>/` with the
  spec and HTML together; root `canon.json` controls publication. See
  [folder conventions](../../../diagrams/README.md).
- **Reader tour.** Standalone pages and the workbench’s read-only Canon reader
  offer a first-visit walkthrough with a **?** replay button. Returning readers
  get an optional **New features to explore** prompt for unseen built-in topics
  available in the diagram; progress is browser-local. Custom tours do not
  contribute to built-in topic history. Optional
  `page.tour` lessons are described in the [tour guide](../../../docs/tour.md).
- **Company evidence, drift and Confluence.** See
  [integrations](references/integrations.md).
