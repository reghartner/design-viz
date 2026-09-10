# hearthline Sentry Cloud — cross-region failover (HLD)

Org: `hearthline` (canon shared with Sentry Panel: Hearthgate device gateway,
Overwatch alarm intake, Summons dispatch, Register entitlements). This HLD
covers the cloud side only: how a monitored alarm survives the loss of an
entire region.

## 1. Overview

Sentry Cloud runs active/standby across two regions, Northline (active) and
Southline (standby). Every alarm event is journaled before acknowledgment and
the journal is replicated south continuously. When Northline is lost, traffic
steering moves panels to Southline, which already holds the journal — an
alarm mid-incident continues on the same sequence numbers. Safety
properties, stated precisely: (1) NO ACKNOWLEDGED ALARM IS LOST — panels
retain acknowledged events until their incident closes end-to-end, and every
(re)connect starts with a watermark reconciliation that replays anything the
region's journal lacks, so replay does not depend on a later event arriving.
(2) DELIVERY TO THE MONITORING CENTER IS AT-LEAST-ONCE, and the TICKET
effect is exactly-once: every event carries a stable incident id assigned by
the panel when the incident opens (`INC-<acct>-<opening seq>`), the center
keys its ticket by that incident id, and event updates within the ticket are
deduped by (incident id, seq). A replayed event that was already dispatched
from the dead region lands as a replay-marked duplicate UPDATE of the same
ticket — it can never open a second one. Journal dedup inside a region is an
optimization, not the correctness mechanism; the incident key is.

## 2. Hardware

Cloud-only design; the device fleet is the existing Sentry Panel (dual-path
broadband + cellular, 24 h battery). Each region runs an independent full
stack; regions share nothing but the replication link and the steering layer.

## 3. Backend services

- **Hearthgate** — per-region device gateway; terminates panel TLS sessions.
- **Overwatch** — per-region alarm intake: journals, dedupes on (account,
  seq), routes to monitoring. https://github.com/hearthline/cloud/blob/main/overwatch/journal.go#L88
- **Summons** — dispatch integration to monitoring centers (region-pinned
  agents, cross-region account state). https://github.com/hearthline/cloud/blob/main/summons/dispatch.go#L41
- **Register** — entitlements; replicated the same way as the journal.
- **Tether** — the cross-region journal replication link: ordered, ack'd,
  lag-monitored. https://github.com/hearthline/cloud/blob/main/tether/ship.go#L23
- **Crossbar** — failover controller: probes both regions from three vantage
  points, owns the single fencing token, decides ACTIVE/FENCED/STANDBY.
  https://github.com/hearthline/cloud/blob/main/crossbar/fence.go#L57
- **Pathfinder** — traffic steering (DNS + anycast): moves panel connections
  between regions. https://github.com/hearthline/cloud/blob/main/pathfinder/steer.go#L19

## 4. Flows

### 4.1 Healthy posture: journal first, replicate always
1. A panel delivers alarm event seq 5201 to Pathfinder's steering address.
2. Pathfinder routes the session to Northline Hearthgate (active region).
3. Hearthgate hands the event to Northline Overwatch.
4. Overwatch appends seq 5201 to the journal, THEN acknowledges the panel.
   An ack means "journaled in the active region" — the panel still RETAINS
   the event until the incident closes (that retention is the cross-region
   durability anchor during replication lag).
5. Tether ships the journal record to Southline Overwatch (typical lag 1.8 s).
6. Southline Overwatch applies it and acks; Tether records parity at 5201.
7. Crossbar's probes read both regions healthy; fencing token stays north.

### 4.2 Region loss mid-incident
1. Seq 5201 is acked and dispatched; the incident is still open.
2. Northline loses power and network together (region outage).
3. The panel's delivery of seq 5202 times out; it holds the event and retries.
4. Crossbar's three vantage probes all fail for the hold-down window (30 s).
5. Crossbar moves the fencing token: Southline becomes ACTIVE.
6. Pathfinder shifts steering; the panel's retry connects to Southline
   Hearthgate on the next attempt.
7. RECONNECT RECONCILIATION, first thing on every connect: the panel sends
   hello (its high watermark 5202, unclosed incident INC-88121-5199);
   Overwatch answers hello-ack (journal at 5201, replay_from 5202). The
   panel then sends everything from replay_from out of its retained window —
   here that is exactly the held 5202: THE RETRY AND THE REPLAY ARE THE SAME
   MECHANISM. A final event with no successor is covered the same way,
   because replay is driven by connecting, never by observing a gap.
8. Seq 5202 appends under incident INC-88121-5199 and the SAME incident
   continues. (Had 5201 also died inside the 1.8 s lag, hello-ack would say
   replay_from 5201 and the panel would send both; if the dead region had
   already dispatched 5201, the center's ticket — keyed by the incident id —
   absorbs the duplicate as a replay-marked update, deduped by
   (incident id, seq).)
9. Summons in Southline reaches the monitoring center; the dispatcher sees
   one incident, sequence unbroken; the panel gets its ack.
10. Total detection-to-ack budget: 92 s against a 180 s RTO target.

### 4.3 The fence: no double dispatch
1. Northline power returns; its stack boots and its Overwatch wakes.
2. Northline Overwatch still believes it is active — it holds stale state.
3. Its first journal append attempt requires the fencing token; Crossbar
   refuses: Northline is FENCED (read-only).
4. Any late panel session reaching Northline is redirected by Hearthgate
   (fenced gateways refuse alarm traffic and return the steering address).
5. Crossbar's probes must stay green for a full hold-down window before
   Northline may even become STANDBY. Nothing is dispatched twice.

### 4.4 Failback without a gap
1. Tether reverses: Southline ships the journal segments written while it
   was active (5202–5230) back to Northline.
2. Northline applies the backlog; parity is reached at seq 5230.
3. Register replays entitlement changes the same way.
4. Crossbar verifies parity + green probes, then moves the fencing token
   north during a low-traffic window.
5. Pathfinder returns steering; panels drift back over the next hour.
6. Southline returns to STANDBY, still replicating, still ready.

## 5. Wire contracts

Journal replication record (Tether):

| field | sample | meaning |
|---|---|---|
| acct | HL-88121 | account the alarm belongs to |
| seq | 5202 | per-account alarm sequence — monotone, gap-checkable |
| incident | INC-88121-5199 | stable incident id (assigned at incident open) — the ticket key |
| epoch | 7 | fencing epoch that wrote it; stale epochs are refused |
| kind | "alarm.entry" | event type |
| ts | unix ms | panel timestamp, not region receive time |

Reconnect hello (panel → Hearthgate, first frame of every session):

| field | sample | meaning |
|---|---|---|
| acct | HL-88121 | account |
| panel_seq | 5202 | panel's high watermark — replay source of truth |
| open_incidents | ["INC-88121-5199"] | unclosed incidents the panel still retains |

Reconnect hello-ack (Hearthgate → panel, the response):

| field | sample | meaning |
|---|---|---|
| journal_seq | 5201 | highest journaled seq for the account in this region |
| replay_from | 5202 | panel must (re)send everything from here out of retention |

Fencing decision (Crossbar):

| field | sample | meaning |
|---|---|---|
| token_holder | "southline" | the only region allowed to append + dispatch |
| epoch | 8 | increments on every move; embedded in every append |
| probes | 3/3 down | vantage results that justified the move |
| holddown_s | 30 | how long probes must agree before a move |

## 6. Failure modes

- **Replication link loss only**: both regions healthy, Tether down — alarms
  keep flowing north; Southline lag alarm fires at 60 s; failover is NOT
  triggered by replication lag alone.
- **Steering flaps**: Pathfinder changes are rate-limited by the same
  hold-down; a flapping region cannot bounce the token.
- **Panel-side outage**: unchanged from the Sentry Panel HLD — cellular
  failover at the device layer is independent of region failover.
- **Region loss inside the replication lag**: the journal record may die with
  the region, but the panel still holds the event (retention until incident
  close); the hello/hello-ack reconciliation replays it — including a final
  event with no successor. If the dead region had already dispatched it, the
  center's ticket (keyed by the incident id) absorbs the duplicate as a
  replay-marked update deduped by (incident id, seq); delivery is
  at-least-once, the ticket effect exactly-once.
- **Split brain**: impossible to dispatch twice by construction — appends and
  dispatch both require the current epoch token.
