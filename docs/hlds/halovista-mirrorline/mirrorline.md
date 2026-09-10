# halovista Mirrorline — event-store replication (HLD)

Org: `halovista` (canon shared with Aegis: Halogate auth, Conduit media
plane, Vault clip storage, Chronicle event index, Clarion push). This HLD
covers the database layer under Vault and Chronicle: how clip metadata and
event records replicate, what a write means, and what an election does.

## 1. Overview

Mirrorline is the replicated event store behind Vault. A write commits only
at quorum: the primary plus its same-region sync replica. A third replica in
a second region follows asynchronously for disaster recovery. Elections are
coordinated by Marshal with epoch fencing, so a deposed primary can never
acknowledge writes. Safety property: an acknowledged event record survives
the loss of any one node with zero data loss, and survives the loss of a
whole region with bounded, measured loss (the async lag).

## 2. Hardware

Three store nodes: `vault-a1` (primary) and `vault-a2` (sync replica) in
region A on separate racks and power feeds; `vault-b1` (async replica) in
region B. Each node: NVMe WAL device separate from the data volume.

## 3. Backend services

- **Vault** — the clip/event store API over the replica set.
  https://github.com/halovista/platform/blob/main/vault/store.go#L112
- **Sluice** — WAL shipper: streams the write-ahead log to replicas, tracks
  ack offsets per follower. https://github.com/halovista/platform/blob/main/sluice/ship.go#L64
- **Marshal** — election coordinator: heartbeats, epoch tokens, promotion.
  https://github.com/halovista/platform/blob/main/marshal/elect.go#L37
- **Chronicle** — the searchable event index; consumes the committed stream
  only (never reads uncommitted WAL).
- **Conduit** — API layer; routes reads (session-sticky read-your-writes).
- **Drawbridge** — resync service: rewinds a rejoining node's diverged WAL
  tail and replays from the new primary.
  https://github.com/halovista/platform/blob/main/drawbridge/rewind.go#L29

## 4. Flows

### 4.1 A write means quorum
1. A camera event record arrives at Vault on `vault-a1` (primary, epoch 12).
2. The primary appends to its WAL and hands the record to Sluice.
3. Sluice streams it to `vault-a2` (sync) and `vault-b1` (async) in parallel.
4. `vault-a2` fsyncs and acks offset 4181.
5. Quorum reached (primary + sync): the write is ACKNOWLEDGED to the caller.
6. `vault-b1` acks 2.4 s later; its lag is recorded, not waited on.
7. Chronicle consumes the committed record and indexes it.
8. Commit budget: append 2 ms, ship 3 ms, sync fsync+ack 9 ms, total 14 ms.

### 4.2 Lag and read-your-writes
1. A resident uploads a clip; the event commits at quorum in region A.
2. The resident's app immediately lists recent events.
3. Conduit sees the session's write token (offset 4188) and routes the read
   to a node at-or-past that offset: primary or sync replica.
4. `vault-b1` is 8 s behind after a burst; reads without a token MAY land
   there (stale-tolerant surfaces only: dashboards, counts).
5. The lag gauge tracks `vault-b1` seconds-behind; alerting at 30 s.

### 4.3 Primary crash and election
1. `vault-a1` loses both power feeds; heartbeats to Marshal stop.
2. Marshal waits the miss budget (3 beats · 2 s), then opens an election.
3. Only `vault-a2` is quorum-eligible (sync, offset-complete at 4203).
4. Marshal mints epoch 13, fences epoch 12, promotes `vault-a2` to primary.
5. Sluice re-targets: new primary streams to `vault-b1` (async, catching up).
6. Writes stay BLOCKED: a lone primary cannot form quorum, and the default is
   safety over availability (§6) — no degraded single-node acknowledgments.
7. `vault-b1` reaches offset parity; Marshal promotes it to SYNC.
8. Writes resume; total write-unavailability 24 s (11 s to promotion, 13 s to
   a new sync). RPO through the crash: 0 — every acknowledged record was on
   the sync replica by definition.
9. Chronicle resumes from the committed stream, no re-index needed.

### 4.4 Rejoin, rewind, resync
1. `vault-a1` returns with a diverged WAL tail: 12 records past 4203 that
   never reached quorum (never acknowledged to any caller).
2. Drawbridge compares epochs: the tail belongs to fenced epoch 12 — it is
   discarded (those records were never promised to anyone).
3. Drawbridge rewinds to the divergence point and replays epoch-13 WAL from
   the new primary.
4. Checksums verify; `vault-a1` joins as the new sync replica.
5. Roles settle: a2 primary, a1 sync, b1 async — quorum protection restored.

## 5. Wire contracts

WAL ship frame (Sluice):

| field | sample | meaning |
|---|---|---|
| epoch | 12 | writing primary's fencing epoch; followers refuse stale epochs |
| offset | 4181 | monotonic WAL position — the ack currency |
| crc | 0x9E441C02 | frame checksum, verified before fsync |
| kind | "event.put" | record type in the frame |

Election result (Marshal):

| field | sample | meaning |
|---|---|---|
| epoch | 13 | new fencing epoch; embedded in every subsequent frame |
| primary | "vault-a2" | the only node allowed to acknowledge writes |
| eligible | ["vault-a2"] | offset-complete candidates at election time |
| fenced | ["vault-a1@12"] | deposed writers and their dead epochs |

## 6. Failure modes

- **Sync replica loss**: writes degrade to primary-only acknowledgment ONLY
  if the operator flips the documented degraded mode; default behavior is to
  block writes (safety over availability) while Marshal promotes `vault-b1`
  to sync after catch-up (the same rule §4.3 follows after an election).
- **Region B loss**: no write impact; DR copy lags until the region returns.
- **Sluice stall**: lag alarms fire; election is NOT triggered by lag alone.
- **Double primary**: prevented by epoch fencing — followers refuse frames
  from a fenced epoch, and acknowledgment requires follower acks.
