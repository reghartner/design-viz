# Honesty rules

The page must not claim more than the source supports. These rules apply to
every worksheet cell and every spec field. For longer discussion and examples
(branches, concurrency, partial traces) see [story planning](story-planning.md).

## Facts

- The source governs actors, transports, order, measurements and outcomes.
  Domain knowledge helps you interpret and suggest; it supplies no facts.
- Copy names, numbers and permalinks verbatim, with a ledger row for each.
  No new arithmetic, no finer breakdowns, no invented IDs or sequence numbers.
- Label hypothetical scenarios as hypothetical. Keep proposed design, reviewed
  behavior and observed traces separate, even on one page.
- **Allowed illustrative values**: story start, end and step times,
  elapsed-time freshness text, battery drain and charge rates (your estimate,
  or the built-in placeholders, which are never device facts), and layout
  coordinates, when the source gives none. Label each as `illus` in the
  worksheet and in a ledger row ("step times illustrative; source gives no
  times"). When such values are visible on the page, also say so on the page:
  one line in the section description, such as "Clock times and the battery
  drain rate are illustrative." Any value the source does state is used
  verbatim instead.
- Explicit factual corrections from the operator are evidence too; speculation,
  shorthand or a request to make an outcome look better is not a correction.
  If it is unclear whether they are correcting a fact or proposing a design,
  ask before changing it. An explicitly requested hypothetical can be authored
  as such, with its assumptions labelled and observed behavior kept separate.
  A time or value the operator gives is an
  anchor (an absolute step `time`, a `charge` patch); never move or replace
  it to fit an approximate rate. Drift fills gaps between anchors only where
  a supplied (or labeled illustrative) rate applies.
- Do not invent other values to fill a widget (queue depth, temperature
  readings between anchors, latency). Use an honest qualitative
  representation or leave the field unknown.

## Unknown is not failed

- Distinguish unknown, absent, failed, zero and pending. A timeout does not
  prove non-delivery. A missing span does not prove an action did not happen.
- Widget defaults are claims too: "no notifications", an empty table, a zero
  counter, or `status: "ready"` can contradict an unknown. Use `status:
  "unknown"` / `"stale"`, an explicit Unknown value, or hold the last known
  value with its age in `detail`.
- Separate a system's actual state from what someone knows about it. A service
  marking a device offline does not mean the device lost power.

## Edges, failures and tones

- An edge `kind` is a claim about the mechanism. Use the built-in kind that
  names it (`https`, `int`, `mqtt`, `sqs`, `rmq`, `pulsar`, `tls`, `ws`), or
  declare a named protocol in `page.protocols`. If the source states A talks to
  B but not how, declare a custom kind labeled "Transport unspecified".
- `failures`: `dropped` = sent but never arrived; `blocked` = never sent. An
  HTTP 500 is a delivered error response, not a broken edge. Failure marks last
  one step only; repeat them if the break must stay visible. Mark the link
  that actually failed, not a downstream one.
- A response or acknowledgement edge ("200", "202", "ack") is a claim. Draw it
  only when the source or code evidence shows that response.
- Node tones (`alert`, `warn`, `ok`, `dim`, `base`) carry forward. Use `alert`
  or `warn` only when the source says something fails or degrades at that beat,
  and clear or set `ok` only when the source says it recovers.
- A step's caption, lit edges, tones and panel patches must describe the same
  beat. A caption cannot repair a panel that shows something else.
- Presentation order and animation duration do not prove execution order or
  latency. Group simultaneous hops in one step when the source gives no order.

## Physical and panel claims

- Camera activity, recording, livestreaming and the physical event are
  separate states (`screen.mode` and `scenePlayback`).
- Home signals, markers and subject positions are claims: a notification never
  animates toward a camera; a subject that "entered" is inside the room.
- Radar distance and zone occupancy are geometry; its `alert` is authored.
  Security alarms, operator verification, dispatch assignment and arrival are
  separate authored facts (`cookbook/security-response.md`).
- A wire-contract card only for a sourced payload schema. Configuration and
  mechanism facts go in prose or an explanatory table.
- End each path where the source ends. Never borrow another path's recovery,
  notification or success.

## Asking

Ask when a contradiction or a missing fact blocks an honest depiction. If the
source itself is uncertain, show the uncertainty instead of asking the operator
to invent certainty. Record material answers as ledger amendments.
