# Editing panel text on the panel (design)

Status: proposal for Chuck's decision. Ticket #969, child 12 of epic #959.
Baseline: `origin/inline-text-editing` at `d50d0183`. All `file:line` references
are at that commit.

Scope: desktop Workbench only (Standard and Explore views). No phone or
narrow-width editing, and no phone-width editing tests. Panels are not imported,
so the imported-nodes rule does not apply.

## Summary

- Panel renderers receive the panel declaration and one folded state snapshot.
  They do not know where each string came from, and the markup does not
  record it (`src/panels/shared.js:430-452`).
- 34 of the 38 panel types show at least one authored string that can be edited
  in place. These are item labels in the declaration, and free-text state such
  as `note`, `incident` or log lines. The rest of the text stays in Inspect:
  computed text (counts, totals, story time), enum labels, numbers, live data,
  and text merged with other values.
- New contract: a renderer marks each editable string with
  `data-dv-text="decl:<path>"` or `data-dv-text="state:<path>"`. A new
  Workbench resolver turns that marker into a source location. Declaration
  paths resolve directly. State paths resolve through the existing provenance
  model (`builderEffectivePanelStates`). Panel types with special folds add an
  optional `authoring.textSource` facet.
- The editor is the shared inline editor from #960 (`src/workbench/inline-text.js`)
  with one new host: an overlay placed over the text and attached to the panel
  card, so that panel repaints do not remove it.
- For a state value set at an earlier step, the editor shows where the save
  will go. By default it saves where the value was set. The author can switch to
  "from this step on". Chuck decides this default (Decision 1).

## How panel text reaches the screen today

| Stage | Where | What it does |
| --- | --- | --- |
| Declaration | `diagram.panels[i]` | Setup fields (`rows`, `labels`, `unit`, …) authored once. Inspect builds a row for each field from `authoring.setupFields` (`src/workbench/inspector.js:1906-1960`). |
| Starting state | `panels[i].initial` | Edited in Inspect → **Starting state** when the type sets `authoring.initialFields` (`inspector.js:1922`). |
| Step patches | `steps[k].panels[id]` (legacy `steps[k].patch[id]`) | Sparse changes at one step. Edited by `panelPatchControl` (`inspector.js:1270-1333`), which writes through `planSetField` for `initial` or `planStepSetPanelPatch` for a step (`inspector.js:1328-1329`). The step must already list the panel (`src/workbench/commands/narrative.js:412-413`). |
| Fold | `foldPanelStates` (`src/core/state.js:40-56`) | Turns the patches into one complete snapshot per step. The default fold (`foldCommonPanelStates`, `src/panels/shared.js:134`) carries values forward, appends `log`, and applies `enterOnce` for one step. 16 types supply their own `fold`. |
| Story time | `descriptor.storyTime` (`state.js:52`) | Derives clock, date, freshness and battery charge after the fold, and marks the derived fields (`src/core/story-time.js:192-202`). |
| Render | `renderPanelBody` (`shared.js:432-491`) | Calls the renderer with `(host, panel, state, …)` and replaces `.pbody` innerHTML (`shared.js:449-451`), unless the renderer returns a `patch` for surgical updates. |
| Card | `buildPanels` (`shared.js:531-560`) | Each card carries `data-dv-panel="<declaration index>"` (`:536`), a `.ptitle` (`:537-541`, double-click edit is #963) and the `.pbody` (`:543-545`). |
| Provenance | `builderEffectivePanelStates` (`src/workbench/inspector-model.js:40-125`) | For each top-level state key at a step, says where the value came from: `initial`, `step` (set at this step), `inherited` (from step N), `transient` (`enterOnce`), `history` (appended), `story` (derived), or `engine` (default). Each source carries its exact JSON path (`:62-67`). A type can override this with `authoring.origin` (`:114-116`). |

Existing pieces that already map rendered panel elements to source data:

- Home map's `editor.clickTarget` maps a click on `[data-device]`,
  `[data-subject]` or `[data-home-room]` to a Home element
  (`src/panels/types/homemap.js:2905-2919`; markers at `:775`, `:962`, `:1045`).
  `src/workbench/interactions.js:514-517` calls it before generic targeting.
- Device app's `visibilityEvidence` returns a trusted DOM address
  `{attribute:'data-da-field', value:field}` (`src/panels/types/deviceapp.js:980-986`;
  contract in `docs/visibility-evidence.md:75-81`).
- Row identity attributes: `data-contract-field` (data-contract), `data-sensor-id`
  (security), `data-responder-id` (dispatch), `data-screen-id` (appscreens),
  `data-da-field` / `data-da-source` (deviceapp).

Per-field metadata today: `authoring.setupFields`, `authoring.patchFields` and
`authoring.fieldMeta` (`src/workbench/field-values.js:21-54`). The per-field panel
definition kit (Chuck, 2026-10-18: each field declares its type, default and step
rule once) is not in the repository at this baseline. No code, issue or pull
request for it was found. This design uses today's field tuples. When the kit
lands, its per-field step rule (carries, appends, one step, operation) supplies
the same information that `textSource` supplies here, and the facet can be
derived from it.

## 1. Inventory

Each renderer was read. Lines `:N` refer to `src/panels/types/<type>.js` unless
another file is named.

- **Declaration**: authored once on the panel.
- **State**: from `initial` or step patches. The fold rule follows in brackets:
  carry (shallow carry), snapshot (a later patch replaces the whole object or
  array), append (each visible item comes from exactly one `initial` or step
  entry), once (`enterOnce` or a one-step operation), or merge (merged key by key).
- **Not editable in place**: computed, enum label, number, live data, merged
  with other text, or an identifier.
- `shell note` means `state.note`, drawn by the shared `softwarePanelShell` as
  `.swnote` (`src/panels/shared.js:269-275`). Eight types use it: checks, budget,
  funnel, data-contract, dispatch, grid, table and truth-table.

| Type | Declaration text | State text [rule] | Not editable in place | Notes |
| --- | --- | --- | --- | --- |
| appscreens | `screens[i].label` :44, `screens[i].caption` :45 | — | `clock` :50 and `date` :51: story time derives them unless pinned (storyTime :312 → `story-time.js:206-224`). Text inside the uploaded image :31. | `data-screen-id` :33 |
| battery | — | `note` :173-175 [carry] | `charge` :138-143 (story-time drain, :56-80). Zone chip shows `state.label` or a computed zone label :148-151. `source` and `trend` are enum labels :167-172. | `level` tween rewrites `.btval` (`shared.js:387`) |
| budget | `metrics[i].label` :82-83 | shell note | Values are numbers :90-91. Badges are computed :35-46. "/ max unit" merges two fields :93-96. Remaining :125-131. | `values` is a whole snapshot (fieldMeta :198) |
| buffer | `capacity` :148 | `note` :151 [carry] (falls back to hidden legacy `label` :114) | Summary counts :104-115 | |
| checks | `checks[i].label` :63-64 | shell note; `results[id].detail` :71 [snapshot] | Pass count :55-60. Status token :66-69. | `results` is a whole snapshot (:128) |
| chime | — | `text` :34, :39 [carry or once; `transientFields` :49] | Playback label :38. Default message when unset :34. | |
| cost | `period` :131, `routes[i].label` :142/:185, `items[k].label` :162/:187, `routes[i].tradeoff` :190, `assumptions` :192 | `note` :193 [carry] | Totals, amounts and deltas :142-181. Volume line merges number and unit :130. Rate line merges three values :188. | Rates, tradeoffs, assumptions and note sit in a collapsed `<details>` :183 |
| data-contract | `fieldLabel` :76, `columns[j].label` :77, `fields[i].label` :83, `fields[i].cells[col]` :86 | `highlights[id].label` :84 [snapshot]; shell note. A step can replace `columns`, `fields` and `fieldLabel` (`content()` :22-30) | "—" for a missing cell :86 | The source of a header or cell depends on whether a step replaced the declaration array. `tr[data-contract-field]` |
| deviceapp | `device` :456, `subtitle` :456, `fields[i].label` :478-480, `sources[i].label` / `.endpoint` / `.detail` :521-525 | `note` :428/:500/:539 [carry]; notification cards [append, as phone] | Card `detail` :495 shows freshness text derived from story time unless pinned (:236-253). `clock` / `date` :449-450 (story time). Status badge :493. Value and unit merged :483-488. `appName` has a three-level fallback :397. | Mapped field cards are `<button data-da-source>` (:440, :468) with click handlers (:542-585) |
| dispatch | `agency` :127, `responders[i].label` :122, `responders[i].callsign` :122 | `dispatcher` :128, `incident` :133, `detail` :135, `location` :110 [carry]; `state[unit].detail` :125 [snapshot per unit]; shell note | Status and priority labels :10-12, :127-128. Counts :136. SVG vehicle label is a copy that falls back across two fields (`callsign || label || id`, :88, :108), so its source is not one field. | Returns `patch` (:142-154). `li[data-responder-id]` |
| edit-history | — | — | All text is runtime evidence: who, when, changes (:18-71) | Rows are `<details>` that take clicks. Exclude. |
| funnel | `stages[i].label` :205 | shell note | Counts are numbers [merge, `funnelFold` :119-132] :208. Percentages and deltas :193-197. "N unit in" merges number and unit :213. | |
| gauge | `unit` :10 (setup :100) | — | `value` is a number :9 | `level` tween |
| grid | `cols[j].label` :259, `rows[i].label` :264 | shell note | Cells are numbers [merge, `gridFold` :165-184] :271. Marks are an enum :272. Key range :277-278. | |
| homemap | `rooms[i].label` :798-805, `devices[i].label` :679-687 / :1030-1037, `subjects[i].label` :1085-1093 (only with `showSubjectLabels`) | `state[id].audio.source` / `.text` / `.reason` [snapshot] (`src/panels/audio.js:76-79`) | Audio enum labels (`audio.js:73-78`). "No devices configured" :1096-1100. | SVG. Single click already selects the Home element (:2905-2919). Builds an animated string and a settled baseline string; settling removes the animated elements (:1118-1133, `shared.js:315-329`). Audio captions carry no owner id. |
| image | `caption` :28 | — | "Open reference" :30-34. Placeholder :27. | |
| inflight | `lanes[i].label` :213 | Bar `label` :243 [once: comes from one step's `start` operation; fold :65-110] | Ticks :204. Axis label :196. | The bar label needs `textSource` to find its step and operation |
| leds | `leds[i].label` :12 | — | The LED mode is shown only as a colour | The label is a bare text node beside `.leddot`; it needs a wrapping element |
| live-status | — | — | Ticket keys, titles and states are fetched from Jira and GitHub at view time | Buttons, sorting and drag throughout the body (:95-156). Exclude. |
| log | — | `log[k].text` :21, `log[k].tag` :17 [append, `shared.js:142-146`] | Tag colour comes from `panel.tags` | A log entry may be a plain string or `{tag,text}` |
| orbit | — | — | `states[i]` :57-68 are tokens that `state.state` and `colors` refer to. Current state :70-75. `via` :76-80 [carry] shares its text node with the "via " prefix. | SVG |
| phone | — | Notification `app`, `title` [append, newest first, `src/panels/notifications.js:22-31`]; `audio.source` :163, `audio.reason` :166 [snapshot or once] | Notification `text` is rendered Markdown (`notifications.js:50`). `audio.text` :164 shares its node with quote marks. `clock` / `date` :194-197 (story time). Audio enum labels :158-165. Badge count :211. Brand name and monogram are inherited brand text :207-209. | Only the newest three cards render (`notifications.js:36`) |
| queue | — | `label` :64, `from` :78, `to` :81, `reason` :86-87 [carry; each is shown only in some states] | `state` token :83. "empty" :63. | |
| radar | `zones[i].label` :333-342 | `banner` :453-458 [carry] | `status` :441-451 is authored or computed from `alert` | SVG. Zones are filtered (:164-223), so the rendered position differs from the array index. |
| replicas | `replicas[i].label` :212 | `note` :242 [carry]; `replicas[id].role` :216 [snapshot] | Comparisons and scale :191-209. Reference line merges two fields :183. "Sequence:" / "Observed:" prefixes share the text node :220-232. | The note and the disclaimer share the class `rep-note` |
| screen | — | `banner` :510-516, `reason` :524-528 [carry or once]; `audio.source` / `.text` / `.reason` [snapshot] (`audio.js:76-79`) | Mode chips, siren and spotlight labels :507-535. Scene SVG text :205, :236. | `patch` rebuilds the overlays and the audio slot at each step (:543-578) |
| security | `site` :139, `videoLabel` :98, `sensors[i].label` :127, `sensors[i].zone` :130 | `operator` :140, `incident` :144, `detail` :144, `note` :148 [carry]; `state[id].detail` :131 [snapshot] | Status, alarm and assessment labels. Counts :141-145. | Returns `patch` (:162-181). `li[data-sensor-id]`. Sensors sit in a collapsed `<details>` :145. |
| signal | `links[i].label` :131 | `state[link].note` :138 [snapshot per link] | Transport tag :130. State token :137. | |
| state | — | — | `states[i]` chips :14-15 and the readout :5, :11-12 are tokens that other fields refer to | |
| table | `columns[i].label` :116 | shell note; `rows[r].cells[col]` :122 [snapshot of the `rows` array] | Change badge :124-129 | Rows carry no id attribute |
| thermo | `unit` :139-140 | — | Value is a number :133-138. Zone chip shows `label` or a computed zone label :143-147. Scale numbers are clamped :207-233. | `level` tween |
| tiles | `tiles[i].label` :82 | `state[tile].sub` :89 [snapshot per tile] | State chip :83-88 | |
| timeline | `lanes[i].label` :539-547 (the renderer shortens it to 13 characters) | — | Event labels merge declared `panel.events` and appended `state.events` into one list and sort it (:427-431), and a label is dropped when it collides with another (:267). Ticks, badges and the meta line :884-893. | SVG. Event labels show only in some modes. |
| trace | `spans[sel].name` :248 | — | Service names are shared by many spans :240. Span ids and parent ids are references :250-252. Metrics are computed. | Step buttons and the service select navigate (`src/engine.js:2243-2265`) |
| truth-table | `columns[i].label` :101, `cases[r].label` :105 | shell note [carry or once; `transientFields` :146] | "Active" :105. Typed cell values :108. `columns[i].empty` is shared by every empty cell in the column :30, :37. | |
| waterfall | `spans[i].label` :100-101 | — | `total` is a number :115-116. Duration and unit share a node :108-109. | |
| xray | `layers[i].label` :44 | `hop` :58-64 [carry] | OPEN / SEALED :41. The "key: " prefix shares the node with `holder` :46. | The `layers` state is a whole snapshot |
| zoneframe | `zones[i].label` :85-91 | — | Verdict banner enum :101-108 | SVG |

The two text columns list only strings that meet the four rules in section 2.
Totals: 34 of 38 types show at least one such string. 28 types have declaration
text and 25 have free-text state. Four types have none: edit-history and
live-status (runtime data), state (tokens), and orbit (tokens, and `via` shares
its text node with a prefix).

**Shortened display.** Many editable strings can be shown shortened. Rule 1 in
section 2 allows this, because the editor opens with the full source value,
not the displayed text. Known cases:

- CSS ellipsis on one line: battery `.btnote` (`battery.js:332`), buffer
  `.bfnote` (`buffer.js:195`), funnel `.funnel-label` (`funnel.js:235`), grid row
  and column heads (`.grid-table th`, `grid.js:294`), inflight `.iflabel` and
  `.ifbar` (`inflight.js:332`, `:340`), phone `.phoneapp` and `.phonetitle`
  (`phone.js:299`) and `.phonecallsource` (`:322`), queue `.qmsg`
  (`queue.js:120`) and `.qside` (`:163`), screen `.cliptitle` (`screen.js:791`),
  security `.secmon-feed-label` (`security.js:252`), signal `.sglabel`
  (`signal.js:164`) and `.sgnote` (`:189`), tiles `.tllabel` (`tiles.js:115`)
  and `.tlsub` (`:122`), waterfall `.wflabel` (`waterfall.js:139`, `:148`).
- Line clamp: queue `.qreason` (`queue.js:175`), phone `.phonecallreason`
  (`phone.js:323`).
- Shortened by the renderer: timeline lane labels (`timeline.js:539`).

The search covered `text-overflow: ellipsis` and `line-clamp` in the panel type
styles and `src/style.core.css`. Clipping by a fixed height with
`overflow: hidden` alone was not searched exhaustively. The classification does
not depend on this list, because rule 1 treats every kind of shortened display
the same way.

## 2. What is directly editable and what stays in Inspect

A string is directly editable when all four rules hold:

1. **One authored string, not joined with other text.** The element shows one
   authored string value and nothing else. It is not rendered as Markdown, and
   it is not joined with a prefix, a suffix, a unit or another value in the same
   text node. Shortened display is allowed: CSS ellipsis, line clamp, or a
   renderer that shortens the value (timeline lanes). The resolver reads the
   value from the source, never from the DOM, so the editor always opens with
   the full value. The editor box widens to show it (section 5). CSS case
   changes are allowed.
2. **The source can be found.** It is a declaration path, or a state value whose
   provenance is `initial`, `step`, `inherited` or `transient`, or a default-fold
   `log` entry, or a value the type's `textSource` facet resolves.
3. **It is not an identifier or a key that other data refers to.** Examples:
   span ids, orbit and state tokens, node references.
4. **It is not inside a control that already takes clicks:** `button`, `a`,
   `select` or `summary`. The current double-click guard already skips
   `a,button,input,textarea` (`src/workbench/inline-text.js:111`).

Stays in Inspect:

| Group | Examples | Reason |
| --- | --- | --- |
| Computed text | counts, totals, percentages, comparisons, "N remain" | No authored source |
| Enum and status labels | "Healthy", "RANGE ALERT", "Playing", mode chips | The source is a token chosen from a list. Inspect already offers that picker. |
| Story-time text | phone, deviceapp and appscreens `clock` / `date`; deviceapp card `detail` freshness; battery `charge` | An edit pins the value and stops the derivation. See Decision 3. |
| Numbers | gauge `value`, funnel counts, grid cells, budget values, waterfall `total` | Numbers need parsing and range checks, and many are shown rounded. See Decision 4. |
| Rendered Markdown | phone and deviceapp notification `text` | The DOM shows rendered Markdown, not the source. Possible later with the Markdown editor mode. |
| Brand text | phone, screen, security and deviceapp brand name and monogram | The brand editor picks the scope (diagram or panel) (`inspector.js:1981`) |
| Live or runtime data | live-status, edit-history | Not stored in the spec |
| Placeholders shown when a state field is unset | "No incident recorded", "Waiting for the next ring." | The text is a constant in code. Typing over it would create a new value with no obvious target. See Decision 5. |
| Text in images and scene art | appscreens images, Screen scene SVG text | Not authored text |
| Text inside existing controls | deviceapp mapped cards, trace rows, `summary` lines | Rule 4 |
| Merged text | timeline event labels (two lists merged), the "via …" prefix, value + unit nodes | Rule 1. A renderer change can split some of these later (see section 6). |

A declaration string that shows a fallback while it is unset is editable. The
fallback is either the item id (`label || id`, used by most row types) or a
default in code (for example `site` → "Security monitoring",
`security.js:139`). The editor opens empty, with the fallback as placeholder
text. Saving sets the field. Saving an empty value removes it, and the fallback
shows again. This matches #963 for untitled panels.

## 3. Which location a state edit writes to

Declaration strings have exactly one source. State strings can have several
possible locations. Provenance from `builderEffectivePanelStates` (path-aware,
`inspector-model.js:41-46`) decides what the editor offers. The editor shows a
"Saves to" line under the input:

| Provenance at the shown step | "Saves to" line | Choices |
| --- | --- | --- |
| `step` (set at this step) | "This step (step 4)" | none |
| `inherited` (set at step 2) | "Where it was set: step 2 (shows on steps 2–5)" / "From this step on: step 4" | two |
| `initial` | "Starting state (shows until step 3)" / "From this step on: step 4" | two |
| `transient` (`enterOnce` at this step) | "This step only (enterOnce)" | none |
| `history`, default `log` append | "The entry added at step 2" | none |
| `engine` (unset), `story` | not editable: the renderer emits no marker, or the resolver returns a reason (resolver rule 5) | — |

"Shows on steps 2–5" runs from the source step up to the step before the next
assignment of the same key on the current path. It is computed from the same
patches. If the target step is shared by several paths, the line adds "shared
by N paths", using the same sharing check as Inspect's "Shared step — edits
apply to: …" note (`inspector.js:2939`). Chuck's ruling on #960 (an edit to a
shared step changes every path that uses it) applies here too.

How each choice saves:

- **Where it was set**: a surgical edit at the source path that provenance
  returned (`inspector-model.js:62-67`) plus the sub-path inside it, using
  `planSetField` or `planReplaceValue` (`src/workbench/commands/common.js:97-113`).
  For a snapshot (for example `results` set at step 2), this edits
  `steps[2].panels[id].results.<checkId>.detail` in place.
- **From this step on**: write the key into the current step's patch. A
  snapshot field copies the effective value and changes one sub-value. This is
  the same work the Inspect composers do today (`src/workbench/panel-collections.js`).
  If the step does not list the panel yet, the same plan adds
  `steps[k].panels[id]`. Today that takes two actions (`planStepTogglePanel`,
  `narrative.js:383-401`, then `planStepSetPanelPatch`, `:403-418`). One save
  must be one Undo, so this needs one new planner that does both:
  `planStepPanelField(text, raw, section, stepIndex, panelId, subPath, valueText)`.
  This planner is new.
- **Transient fields** (`authoring.transientFields`) keep their storage. An
  `enterOnce` value is edited inside `enterOnce`, as `panelPatchControl` already
  requires (`inspector.js:1310-1313`).

Recommendation: show both choices, with **Where it was set** selected by
default. Most in-place edits fix wording, and fixing it where it was set
corrects every step that shows it. An author who wants the story to change at
this step picks "From this step on" before saving. See Decision 1.

## 4. How a renderer marks a rendered string (new contract)

This is a new contract. Nothing today records which field a rendered panel
string came from.

**Markup.** The element whose whole text is the editable string carries one
attribute:

```html
<span class="tllabel" data-dv-text="decl:tiles.2.label">North door</span>
<div class="swnote" data-dv-text="state:note">Retry scheduled</div>
<span data-dv-text="state:log.4.text">Event received · 200 OK</span>
```

- `decl:` paths are relative to the panel declaration (`diagram.panels[i]`).
  Array indices are declaration indices, not rendered positions. Renderers that
  filter or deduplicate rows must use the original index, as Home map already
  does (`panel.rooms.indexOf(room)`, `homemap.js:775`). Radar, timeline, signal,
  grid and inflight filter their lists.
- `state:` paths are relative to the folded snapshot the renderer received.
- Segments are object keys and array indices joined by `.`. Keys that contain
  `.` are percent-encoded. The shared helper below does this.
- SVG `<text>` elements carry the same attribute.

**Shared helper.** `panelTextMark(scope, path)` in `src/panels/shared.js`
returns the escaped attribute string, so renderers do not build it by hand.
`softwarePanelShell` (`shared.js:269-275`) uses it for `.swnote`, which covers
eight types in one change.

**Resolver (Workbench, new).** `panelTextSource(diagram, panelIndex, stepIndex,
pathId, marker)` in a new `src/workbench/panel-text.js` returns either
`{value, kind:'single-line', choices:[{label, path, plan, empty}]}` or
`{reason}` when the string is not editable. Its rules:

1. `decl:`: the path under `panels[i]`. The current source value must be a
   string, or absent while the renderer shows a fallback (section 2). Otherwise
   the string is not editable (the same check as `inline-text.js:19-21`).
2. `state:` with a top-level key whose provenance is `initial`, `step`,
   `inherited` or `transient`: the provenance input path plus the rest of the
   marker path. The section 3 choices are added.
3. `state:log.k…` with the default fold: entry `k` is mapped to `initial.log`
   or one step's `log` array by adding up the lengths of earlier arrays on the
   current path. A string entry is replaced whole. An object entry has its
   `text` set.
4. Anything else: call the type's optional `authoring.textSource(panel,
   statePath, context)`. The context is the one `authoring.origin` receives
   (`inspector-model.js:115`). The facet returns a source path or `null`.
   Phone and deviceapp notifications and inflight bars need it. Timeline events
   would need it if a later renderer change shows their labels whole.
5. No marker: nothing new happens. The two clicks of the double-click select
   as they do today, and Inspect shows the panel. A marker whose resolver result
   is `{reason}` (for example the source value is no longer a string, or
   `textSource` returned `null`): no editor opens, and the reason is shown
   through the existing inspector message line (`inspectorMessage`, which the
   inline editor already uses for save errors at `interactions.js:44`). No
   tooltip is added.

**Why not reuse `visibilityEvidence`.** That facet answers whether a whole card
is visible, and its address names one card
(`{attribute:'data-da-field', value}`). Editing needs one address for each
string, with a path into the declaration or the state. The marker takes the same
idea (trusted, renderer-owned DOM addresses) one level further down.

**Markers in published output.** The attribute is inert. Emitting it in every
host keeps the Workbench preview identical to the viewer. The other option is
to emit it only in the Workbench. See Decision 2.

## 5. Gesture, keys, Undo and validation

These follow the epic's shared rules (#959).

| Behavior | Rule for panel text |
| --- | --- |
| Open | Double-click a marked string. The editor opens over the text and takes focus. Single click is unchanged: it selects the panel, or the Home element, or keeps the panel's own click behavior. |
| Editor host | New overlay host: an absolutely positioned element appended to the panel card (`.pwidget`, outside `.pbody`) at the marked element's box. Its width is at least the element's width and grows to fit the full value, up to the card's width; past that the input scrolls. This shows the whole value of a string that is displayed shortened. The overlay is needed because `.pbody` innerHTML is replaced on repaint (`shared.js:449-451`), Screen, Security and Dispatch `patch` rebuild sub-trees (for example `screen.js:543-578`), settling removes animated elements (`shared.js:325-329`), and SVG text has no HTML container. The editor keeps the marker path, not the element. On save it finds the element again by path. |
| Playback | Opening the editor pauses playback through the existing `opts.pause` (`inline-text.js:53`; `interactions.js:42`). |
| Save | Single-line: Enter or click outside. v1 has no multi-line panel text. |
| Save location | When section 3 offers two choices, they are two radio buttons inside the editor, below the input. Tab moves from the input to them, the arrow keys change the choice, and Enter saves. Clicking a choice does not count as clicking outside. |
| Cancel | Escape restores the text and writes nothing (`inline-text.js:98`). |
| History | One save is one Undo entry, through `opts.commit` (`interactions.js:43-50`). "From this step on" with a new step patch is still one plan (`planStepPanelField`). |
| Empty value | Same result as clearing the matching Inspect control. A declaration `text` field or a rows column without `req` removes the key (`inspector.js:213-216`). A rows column with `req` refuses the empty value. A state `text` field stores an empty string, as Inspect's **Set value** does (`src/workbench/field-values.js:65`). A log entry refuses the empty value: the Inspect composer marks text as required (`panel-collections.js:128`). The empty rule comes from the field's existing setup or patch field definition. |
| Validation | Only string fields are edited in v1, so nothing is parsed. After saving, the normal render and validator run, as for every Inspect edit. |
| Stale source | If the source changed while the editor was open, the draft is dropped (`inline-text.js:24`). If the marked element no longer exists after a repaint (for example the step moved), the editor closes without saving. |
| Keyboard | No new tab stops inside panels and no new shortcut. Keyboard users keep the Inspect route. This matches the epic's F2 ruling. See Decision 7. |
| Field entry | One entry in #960's field list: selector `[data-dv-panel] .pbody [data-dv-text]`, target kind `panel`, field resolved for each element by `panelTextSource`, single-line, save plan from the resolver, empty rule from the resolver. |
| User guide | The child that ships the first route adds a sentence to `src/workbench/human-guide.html:33` (Visual panels). |

## 6. Proposed PR split, smallest first

Each implementation ticket proves the same path: a real double-click on the
panel text, then the `#src` field changes (declaration, `initial` or step patch,
as designed), then the rendered panel text changes, then Undo restores the exact
previous source. Browser tests run at desktop width only.

1. **Contract and declaration pilot: leds and image.** Add `panelTextMark`, the
   resolver for `decl:` paths, the overlay host and the field entry. Mark
   `leds[i].label` (wrap the bare text node) and `image.caption`. Test (new
   `tools/browser-tests/tests/panel-text-inline.spec.mjs`): double-click the LED
   label; the editor is focused with the source value; type, then Enter;
   `panels[i].leds[0].label` changes; the label renders; Undo restores the
   source. Also cover: Escape writes nothing; empty removes `label` and the id
   shows; a single click still selects the panel. Flip: today a double-click
   opens nothing. Pure test (new `tests/panel-text-source.test.js`): decl paths,
   filtered index, non-string refusal.
2. **Carried state: `.swnote` (eight types) and queue.** Add the `state:` rule,
   the "Saves to" line with both choices, and `planStepPanelField`. Test: a note
   set at step 1 and shown at step 3. The default save edits step 1. The other
   choice adds `steps[3].panels[id].note`, including when step 3 did not list
   the panel, and both cases take one Undo. Add an `enterOnce` case (truth-table)
   and a shared-step case (two paths).
3. **Appended entries: log.** Add the `log.k` mapping. Test: lines from `initial`
   and from two steps. Editing a step-2 line while step 4 is shown writes to
   `steps[2].panels[id].log[j]`. String entries and object entries are both
   covered.
4. **Snapshot sub-values:** checks `detail`, table string cells, tiles `sub`,
   signal `note`, security and dispatch item `detail`, data-contract headers and
   cells (declaration or step override). Test: "where it was set" edits inside the
   snapshot. "From this step on" copies the effective snapshot with one change.
5. **Declaration labels, remaining HTML types**, one PR per family: software
   panels (budget, table, truth-table, funnel, grid, waterfall, replicas, xray,
   buffer, cost); device panels (deviceapp, security, dispatch, appscreens,
   thermo, gauge unit); the others (tiles, signal, inflight lanes, trace span
   name).
6. **SVG labels:** radar, zoneframe, timeline lanes, and Home map rooms,
   devices and subjects.
   Home map keeps its single-click selection (`homemap.js:2905-2919`).
7. **`textSource` facet:** phone and deviceapp notification `app` / `title`,
   and inflight bar labels.
8. **Optional later, after the decisions below:** split merged text nodes (the
   "via" prefix, value + unit); numbers; Markdown notification text; story-time
   fields.

Steps 2, 3, 5 and 6 depend only on step 1 and can run in parallel after it.
Step 4 reuses step 2's save choices. Step 7 reuses step 3's append mapping.

## Decisions for Chuck

1. **Where a state edit saves when the value was set at an earlier step.**
   A: always the shown step ("from this step on"). B: always where it was set,
   with no choice in the editor. C: show both, with "where it was set" selected.
   **Recommend C.**
2. **Text markers in published output.** A: emit `data-dv-text` in every host.
   B: emit it only in the Workbench (a render flag that every renderer must
   respect). **Recommend A**: one rendering, nothing to keep in step. Unverified:
   whether any test compares panel HTML byte for byte. The pilot PR will show
   this.
3. **Story-time text** (clock, date, deviceapp freshness detail, battery
   charge). A: stays in Inspect. B: editable in place, with a "Pins until story
   time moves" note in the editor. **Recommend A** for now.
4. **Authored numbers** (gauge value, funnel counts, grid cells, budget values).
   A: later phase. B: include in v1 with number parsing and range checks.
   **Recommend A.**
5. **Placeholder text shown when a value is unset.** A declaration string that
   falls back to the id or a default opens an empty editor, and saving sets the
   field, as #963 does for titles. **Recommend yes.** State placeholders such as
   "No incident recorded": A: not editable in v1. B: editable, saving to the
   starting state or this step. **Recommend A.**
6. **Pilot types.** **Recommend leds and image** (declaration only), then
   `.swnote` (eight types) for the first state edits.
7. **Keyboard route.** A: none new; Inspect stays the keyboard route.
   B: a tab stop on every marked string. **Recommend A.**

## Unverified

- The inventory comes from reading each renderer at `d50d0183`. It was not
  checked against a running Workbench.
- Whether the Workbench preview sends trace step-button clicks through the
  same handler as the viewer (`engine.js:2243-2265`).
- Whether any existing test compares rendered panel HTML exactly (Decision 2).
- No tests or builds were run for this document.
