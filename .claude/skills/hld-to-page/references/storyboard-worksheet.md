# Storyboard worksheet

Copy this template into `<name>.ledger.md`, after the coverage and amendment
tables, under the heading `## Storyboard worksheet`. Fill every section in
order. Do not write spec JSON until sections A to I are complete. A filled
example is in [worked-example.md](worked-example.md).

The worksheet is a reviewable plan, not a reasoning transcript. Keep cells
short. But never leave a cell empty: the point of the format is that you make
a decision for every panel on every step.

---

## A. Story

**Audience:** <who watches; what they already know>
**Takeaway:** <one sentence they should remember>
**Story (60-second narration):** <One paragraph, written as if you were
presenting the page to that audience. Name what they see on the panels at the
key moments: "At 6:05 PM the car backs out and the door stays open. Fifteen
minutes later the resident's phone buzzes..." Start where the story starts
and end where the source ends, for each path.>

**What would I show?** Answer these three before continuing:
1. What is the single most important moment for this audience, and which
   panel shows it best?
2. What would this audience expect to see that the source supports but my
   plan does not show yet? (Add a beat or a panel change, or write why not.)
3. What must the audience NOT be led to believe? (For example: that the door
   closed, that the alarm was verified, that the message arrived.)

## B. Panel plan

One row per panel you will declare. A panel without a clear question is
dropped. Prefer fewer panels that change meaningfully over many static ones.

| Panel id | Type | Physical or reported | Question it answers for this audience | Best moment (step) | Starting state (source or operator) | Must never show |
|---|---|---|---|---|---|---|
| | | | | | | |

A `physical` panel (battery, thermo, Home map) shows the device itself. A
`reported` panel (device app) shows what the app last received. A panel keeps
this meaning for the whole story.

Also list panels you considered and rejected, with a reason.

Then list every thing the source says the customer sees (a device page
banner, a recording timeline gap, an offline icon, a notification text) and
the panel field that shows it, for example a device-app text card
`timeline` with value "Gap 12:30 PM to now". A customer-visible item named
only in captions is a defect.

## C. Paths

| Path id | Label | Shared prefix (step ids) | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| | | | | | |

Rules: each path starts from the panels' initial state. The first step that
differs gets its own ID. Retries get new IDs. End where the source ends; do not
add recovery or a notification for closure. See
[story planning](story-planning.md) for shared middles, rejoins and
concurrency.

## D. Time table

Time belongs to the step. Fill the header first; it becomes
`diagram.storyTime` and the battery rates.

**Story time:** start `<YYYY-MM-DDTHH:MM>`; end `<YYYY-MM-DDTHH:MM>` or span
`<9h, 1d2h>`; clock `12h|24h`; date `short|long|iso|none` (operator answer,
or `illus`).
**Battery rates:** per battery panel: drain %/h, charge %/h, and where each
comes from (source, operator, or `illus` estimate). Wired devices drain `0`.

Then one row per step, per path (shared steps appear once per path they are
on). Fill it even when the source gives no times: then pick plausible times
and mark them `illus`.

| Path | Step | `time` as written (blank keeps the previous) | Story time shown | Anchor, source or illus | Battery: trend change, extra `drain`, `charge` anchor | Last report (time, value) and freshness text | Day or night |
|---|---|---|---|---|---|---|---|
| | | | | | | | |

First list the **anchors**: every clock time and value the operator or source
states (for example "the 5:00 AM report shows 35%"). Write each in the row
where it happens, marked `anchor`, and never change it. Then fill the rows
between anchors.

Rules:
- `time` forms: a relative duration (`+15m`) where the source states one
  ("after 15 minutes"); an absolute date-time (`2026-10-02T21:40`) for an
  anchor, and for a shared step that must show one time on every path (a
  relative time resolves per path); a time of day (`06:50`) for other clock
  times. Seconds-long beats need no `time`. Time never goes backward on a
  path.
- Do not plan per-panel clocks or dates: phone, device-app and app-screens
  panels show the story time, including the date change after midnight.
- An anchor wins over arithmetic. If a rate implies 3:10 AM but the operator
  said about 5:00 AM, the step is at 5:00 AM showing the stated value; write
  the tension in the ledger ("rate implies 3:10; operator time kept").
- Battery values are computed, not typed: the engine drains elapsed hours x
  drain rate and charges x charge rate when the trend **before** the step was
  `charging`. So write only what changes the physics: a `trend` change at the
  step it happens (charging starts at sunrise, so the rise shows from the
  next step), an extra `drain` for a device operation the source costs (a
  recorded clip), and a `charge` anchor only where the operator or source
  states a value. The walk prints the resulting value at every step; copy it
  into checks, never compute it by hand.
- A rate applies only where its condition holds. If two anchors cannot both
  be met at the stated rate, hold the earlier value with `charge` patches on
  the steps between (no invented in-between values), jump at the next
  anchor, and say so on the page and in the ledger. Never invent an
  "effective rate" to connect anchors.
- When the source gives no rate, choose a slow illustrative estimate (for
  example 0.1 to 0.2 %/h for a low-power sensor), set it explicitly, and
  label it illustrative in the ledger and on the page. The built-in rates
  (1 %/h, 20 %/h) are placeholders; leaving them counts as illustrative too.
- Before the rows, write the full **report schedule** for the whole span
  (for example heartbeats at 10:30, 11:00, 11:30 ... 8:00). A schedule is an
  opportunity, not evidence of delivery.
- Keep two series: the physical value (battery or thermo panel) and the last
  report (device-app card). The report column changes at a step that lights
  the report's delivery path. It also changes at the first step after an
  unshown scheduled report whenever the source states a fixed report
  schedule and nothing in the story (outage, offline) stops it: write
  "last report 7:30, not shown, illus" and use the physical value at 7:30.
  During an outage the report column keeps its last value and its freshness
  ages. Place reports on the source's cadence from the last depicted report
  (every 15 min from 5:00 means 5:15, 5:30, not a sunrise at 5:22). A
  device-app battery card shows the whole percent the battery panel showed
  at the report time. A physical event (sunrise, a courier arrives) is its
  own row, not a report, unless the source says they coincide.
- Freshness text is authored: it is relative to the story time and the last
  report time. Last report 6:05 PM at 9:40 PM gives "Last report 6:05 PM" or
  "Updated 3 h ago". Recompute it on every step where the story time moves,
  for every visible card whose freshness is shown.
- A number crosses a threshold (low battery, re-arm level, warn, shutdown,
  restart gate) only at the step the source says it does, and the value on
  each side of the threshold must be consistent with that.
- Temperatures are authored and change only with a cause (weather over
  hours, a heater, load, cooling after shutdown). Never invent a reading
  between anchors: hold, or use the stated rate and write the arithmetic. A
  device that is off still cools; the app card keeps the last reported value
  until a report arrives.
- Day or night: there is no global day/night switch. Pick the camera `scene`
  that matches the time (for example `person-at-door-night` only at night),
  patch dispatch `timeOfDay` (`day|dusk|night`), pick app screen images that
  match, and name the time in captions. A screen has one fixed `scene` for the
  whole diagram: use it only if that scene fits the story (`package-drop` only
  when a delivery happens; `static-noise` is a test
  pattern, not normal recording). If no stock scene fits, drop the screen
  panel and show recording state in a device-app card.

## E. Step x panel matrix

One block per step, in path order (write a shared step once and list its
paths). Every line is required. Each panel line starts with `patch:` or
`holds:`. A `holds:` line must give a reason ("holds: nothing physical changes
in the house", "holds: resident is not looking at the phone yet").

```
### <step-id>   paths: <path ids>   time: <story time shown>
Beat: <one sentence: what happens, told to the audience>
Hops claimed: <for each message clause in the caption: every hop from the originating device to the last receiver, through each relay node (router, bridge)>
Edges: <every hop above, in firing order: a->b (request), b->a (response, ret, only with evidence), b->c, b->d (fan-out) ...>
Missing hops check: <"none" or the hops you added and why>
Report?: <"no report", "report at <time> delivered: <device-app fields> update", or "unshown scheduled report at <time>, illus: <fields>"; a reported value changes only for one of these>
Focus: <which panel carries this beat>
<panel-id>: patch: <fields and values>  |  holds: <reason>
<panel-id>: patch: ...                  |  holds: ...
... one line for EVERY declared panel ...
State cleared: <at a state change: every carried field on every panel, each with "still true" or its new value (banner, screen mode/reason, every card value/status/detail such as recording, thermal, connection, freshness; icon; Home device state); or "no state change">
Icons: <icon patches at this step, or "none: <why no state changed>">
Tones: <node tone patches with evidence, or "none">
Code/binding: <codeRefs whose code runs in THIS step (an upload ref only on an upload, a rule only when it fires); bound nodes involved; or "none">
Evidence: <ledger row numbers; "illus" for illustrative values>
```

Edge rules:
- List every hop the beat uses: the request and its evidenced response, every branch of
  a fan-out, every relay hop (A to broker to B is two hops). If the caption says
  it, an edge must light it in this step, even if the same edge was lit in an
  earlier step; if an edge is lit, the caption or evidence must support it.
- Common misses: the device's own first hop of a heartbeat or report
  (device -> ingest) when the caption starts at a backend write; the clip or
  data fetch when a person "opens" something (app -> store and its reply); a
  state write the caption implies (ingest -> shadow when the app value
  changes).
- Relays: each message follows the route the source gives. When the source
  puts devices behind a router, bridge or gateway, their messages go device
  -> relay -> service on every step, consistently. A direct device -> service
  path (cellular, a second radio, an intentional fan-out) is fine when the
  source supports it. Never add a relay hop, or delete a sourced direct path,
  just to make the topology look uniform.
- Responses: add a `ret: true` edge ("200", "202", "ack", "clip") only when
  the source or code evidence shows that response. A read (app opens a clip)
  has a sourced reply; a fire-and-forget report usually does not.
- A failure goes on the link that failed: Wi-Fi down means `cam->router` is
  `blocked`, not `cam->ingest`.
- One edge per ordered node pair. A response is a separate `ret: true` edge in
  the opposite direction. A second different message on the same pair goes in
  the caption or a log panel.
- Several steps may start with the same edge (a heartbeat every 30 minutes,
  a retry): each step gets its own numbered circle on that edge. Never drop or
  reorder a real hop to avoid repeating an edge; list hops in firing order.
- Known non-delivery goes in `failures` (`dropped` = sent, never arrived;
  `blocked` = never sent). A timeout alone is not a failure edge.

Panel rules:
- Consider every panel on every step, including panels the beat does not seem
  to be about: freshness text, the battery, the map.
- Patches are sparse and carry forward. A `holds:` line means "the previous
  state is still true at this moment". Check that it really is. Story time
  and battery drift move without a patch: write `holds: clock follows story
  time` or `holds: drift only`.
- A value change does not change freshness or icons. If a card's value is new,
  also patch its `status` and `detail`; if a state changed, also patch its
  `icon` (section G).

## F. Coverage grid

Summarize section E per path: `P` = patched, `H` = holds.

| Path: <id> | <step1> | <step2> | <step3> | ... |
|---|---|---|---|---|
| <panel-id> | P | H | P | |
| <panel-id> | H | P | P | |

**Boring panel check.** For each panel with `H` on most steps: is it earning
its place? Either find source-backed changes (clock, freshness, drift, a
subject moving), hide it on the steps where it does not matter
(`panelVisibility`), move it to another named view, or drop it. Write the
decision below the grid.

**Busy step check.** For each step where every panel is `P`: will the reader
know where to look? Name the focus panel in the caption.

## G. Icon state plan

One row per element whose icon should change during the story (device-app
cards, Home cameras/hubs/sensors, Home subjects).

| Panel.element | Default icon | State that appears | Set at step (icon) | State clears at step | Restore (`icon: null` or new id) |
|---|---|---|---|---|---|
| | | | | | |

A state clears at the source's clear or re-arm condition, not at the first
sign of recovery. A card shows one icon, so when states overlap write the
precedence here (for example: charging starts while still under the
low-battery re-arm level: keep `battery-low`, and show charging in the card's
`status`/`detail` and the Battery panel's `trend`). `icon: null` restores the
declared default, not the previous icon; to return to an earlier non-default
icon, patch that icon explicitly. If a state never clears
on a path, write "not restored on path X: state persists to the end". See [panel time and icons](panel-time-and-icons.md) for
the icon IDs and which elements accept icons.

## H. Bindings and code

| Node id | Catalog entityRef | API entityRef + operationId, method, path | codeRefs (id: path, lines) | Steps where that code runs (or "none: never runs in this story") | Gap |
|---|---|---|---|---|---|
| | | | | | |

Every service node gets a row. Every catalog service in the story is bound;
add its API operation when the catalog lists the operation that node's call
uses. Catalog services outside the story are not added. Every supplied code location is attached to its owning
node, even if it never runs in the story, and to each step where it runs. Test
each step against the code's purpose: an upload handler does not run on a
read; an offline rule does not run during an outage shorter than its
threshold. Devices, people and third parties that are not
catalog services get a row with `not a catalog service`. A service that should
be in the catalog but is not gets `unbound: not in supplied catalog` and a
ledger row. See [bindings and code](bindings-and-code.md).

## I. Checkable expectations

Three to six source-grounded statements you will verify after building, for the
hardest beats. Include one per operator anchor ("the 5:00 AM step shows 35%"). Examples: "On the offline path the door card never shows
Closed." "The clock reads 7:10 AM Sat at the last step." "The low-battery icon
appears at the same step the charge crosses 20." "Every step on the happy path
lights both the request and its response."
