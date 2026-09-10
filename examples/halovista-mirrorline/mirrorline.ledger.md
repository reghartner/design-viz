# Coverage ledger — Mirrorline — Event-Store Replication
source: docs/hlds/halovista-mirrorline/mirrorline.md | version: n/a | updated: 09-09-2026 09:22
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "A write means quorum" | camera event write appends locally, ships to sync and async replicas, acknowledges at primary-plus-sync quorum, then reaches Chronicle | covered @ page.blocks[0].tabs[1].sections[0] |
| 2 | flow | "Lag and read-your-writes" | session write token routes an immediate read to a replica at-or-past the committed offset while tokenless stale-tolerant reads may use the lagging async replica | covered @ page.blocks[0].tabs[2].sections[0] |
| 3 | flow | "Primary crash and election" | loss of the primary triggers Marshal's miss budget and fenced promotion, blocks writes until a new sync exists, then resumes the committed stream | covered @ page.blocks[0].tabs[3].sections[0] |
| 4 | flow | "Rejoin, rewind, resync" | Drawbridge discards the fenced unacknowledged tail, rewinds, replays the new epoch, verifies checksums, and restores replica roles | covered @ page.blocks[0].tabs[4].sections[0] |
| 5 | contract | "WAL ship frame (Sluice):" | WAL frame fields are epoch, offset, crc, and kind with the stated samples and meanings | covered @ page.blocks[0].tabs[1].sections[0].contract |
| 6 | contract | "Election result (Marshal):" | election-result fields are epoch, primary, eligible, and fenced with the stated samples and meanings | covered @ page.blocks[0].tabs[3].sections[0].contract |
| 7 | failure | "loss of any one node" | any single-node loss preserves every acknowledged event record with zero data loss | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 8 | failure | "whole region" | whole-region loss preserves acknowledged data subject to bounded, measured async lag | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 9 | failure | "is 8 s behind after a burst" | async lag can make tokenless reads stale, so only stale-tolerant surfaces may land on vault-b1 | covered @ page.blocks[0].tabs[2].sections[0].bullets[3] |
| 10 | failure | "loses both power feeds" | primary crash stops heartbeats and causes a fenced election plus write unavailability until quorum is restored | covered @ page.blocks[0].tabs[3].sections[0] |
| 11 | failure | "diverged WAL tail" | a rejoining node's fenced, never-acknowledged WAL tail is discarded before replay and resync | covered @ page.blocks[0].tabs[4].sections[0] |
| 12 | failure | "Sync replica loss" | default behavior blocks writes until vault-b1 catches up and is promoted; primary-only acknowledgment requires the operator's documented degraded-mode switch | covered @ page.blocks[0].tabs[5].sections[0].bullets[0] |
| 13 | failure | "Region B loss" | losing region B has no write impact and leaves the DR copy lagging until return | covered @ page.blocks[0].tabs[5].sections[0].bullets[1] |
| 14 | failure | "Sluice stall" | a Sluice stall fires lag alarms but does not by itself trigger an election | covered @ page.blocks[0].tabs[5].sections[0].bullets[2] |
| 15 | failure | "Double primary" | epoch fencing prevents double-primary acknowledgment because followers refuse fenced-epoch frames and acknowledgments require follower acks | covered @ page.blocks[0].tabs[5].sections[0].bullets[3] |
| 16 | service | "**Vault** — the clip/event store API" | Vault is the clip/event store API over the replica set and receives the camera event write | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.api |
| 17 | service | "**Sluice** — WAL shipper" | Sluice streams WAL to replicas and tracks follower ack offsets | covered @ page.blocks[0].tabs[1].sections[0].diagram.steps[1] |
| 18 | service | "**Marshal** — election coordinator" | Marshal handles heartbeats, epoch fencing, elections, and promotion | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.marshal |
| 19 | service | "**Chronicle** — the searchable event index" | Chronicle consumes and indexes only the committed stream | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.chron |
| 20 | service | "**Conduit** — API layer" | Conduit performs session-sticky read-your-writes routing | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.conduit |
| 21 | service | "**Drawbridge** — resync service" | Drawbridge rewinds a rejoining node's diverged WAL tail and replays from the new primary | covered @ page.blocks[0].tabs[4].sections[0].diagram.nodes.bridge |
| 22 | service | "`vault-a1` (primary)" | vault-a1 starts as the region-A primary, crashes, then rejoins as the new sync replica | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.a1 |
| 23 | service | "`vault-a2` (sync replica)" | vault-a2 starts as the region-A sync replica and is promoted to primary | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.a2 |
| 24 | service | "`vault-b1` (async replica)" | vault-b1 is the region-B async replica, catches up to become sync after the crash, then settles back to async | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.b1 |
| 25 | number | "A third replica" | the DR follower is the third replica | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 26 | number | "a second region" | the async DR replica is in a second region | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 27 | number | "loss of any one node" | acknowledged records survive loss of one node | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 28 | number | "zero data loss" | acknowledged records have zero data loss under any one-node loss | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 29 | number | "Three store nodes" | the replica set contains three store nodes | covered @ page.blocks[0].tabs[0].sections[0].bullets[1] |
| 30 | number | "primary, epoch 12" | vault-a1's original fencing epoch is 12; that epoch is later fenced and its rejoining tail discarded | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 31 | number | "acks offset 4181" | the sync replica acknowledges WAL offset 4181 | covered @ page.blocks[0].tabs[1].sections[0].bullets[3] |
| 32 | number | "acks 2.4 s later" | the async replica acknowledgment trails quorum by 2.4 seconds | covered @ page.blocks[0].tabs[1].sections[0].bullets[5] |
| 33 | number | "append 2 ms" | WAL append consumes 2 milliseconds of the commit budget | covered @ page.blocks[0].tabs[1].sections[0].diagram.panels[1].spans[0].ms |
| 34 | number | "ship 3 ms" | follower shipping consumes 3 milliseconds of the commit budget | covered @ page.blocks[0].tabs[1].sections[0].diagram.panels[1].spans[1].ms |
| 35 | number | "sync fsync+ack 9 ms" | sync fsync plus acknowledgment consumes 9 milliseconds of the commit budget | covered @ page.blocks[0].tabs[1].sections[0].diagram.panels[1].spans[2].ms |
| 36 | number | "total 14 ms" | total commit budget is 14 milliseconds | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 37 | number | "offset 4188" | the resident session's write token carries offset 4188 | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 38 | number | "is 8 s behind" | vault-b1 lags by 8 seconds after a burst | covered @ page.blocks[0].tabs[2].sections[0].diagram.steps[3].panels.lag.value |
| 39 | number | "alerting at 30 s" | vault-b1 lag alert threshold is 30 seconds | covered @ page.blocks[0].tabs[2].sections[0].diagram.panels[0].max |
| 40 | number | "loses both power feeds" | the primary loses both of its power feeds | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 41 | number | "3 beats" | Marshal's miss budget is three heartbeat beats | covered @ page.blocks[0].tabs[3].sections[0].bullets[1] |
| 42 | number | "2 s" | each beat in the miss budget is two seconds | covered @ page.blocks[0].tabs[3].sections[0].bullets[1] |
| 43 | number | "offset-complete at 4203" | vault-a2 is offset-complete at WAL offset 4203 | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 44 | number | "mints epoch 13" | the new primary epoch is 13 | covered @ page.blocks[0].tabs[3].sections[0].bullets[3] |
| 45 | number | "a lone primary" | one primary without a sync replica cannot form quorum | covered @ page.blocks[0].tabs[3].sections[0].bullets[5] |
| 46 | number | "write-unavailability 24 s" | total write unavailability is 24 seconds | covered @ page.blocks[0].tabs[3].sections[0].bullets[7] |
| 47 | number | "11 s to promotion" | promotion takes 11 seconds | covered @ page.blocks[0].tabs[3].sections[0].diagram.steps[3].text |
| 48 | number | "13 s" | establishing the new sync takes a further 13 seconds | covered @ page.blocks[0].tabs[3].sections[0].diagram.steps[5].text |
| 49 | number | "RPO through the crash: 0" | acknowledged records have crash RPO zero | covered @ page.blocks[0].tabs[3].sections[0].diagram.steps[3].panels.log.log[0].text |
| 50 | number | "12 records past 4203" | vault-a1 returns with 12 never-acknowledged records beyond offset 4203 | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 51 | number | "0x9E441C02" | sample WAL-frame CRC is 0x9E441C02 | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[2].v |
| 52 | permalink | "https://github.com/halovista/platform/blob/main/vault/store.go#L112" | Vault store implementation link | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.api.link |
| 53 | permalink | "https://github.com/halovista/platform/blob/main/sluice/ship.go#L64" | Sluice shipper implementation link | covered @ page.blocks[0].tabs[1].sections[0].diagram.steps[1].link<br>page.blocks[0].tabs[3].sections[0].diagram.steps[4].link |
| 54 | permalink | "https://github.com/halovista/platform/blob/main/marshal/elect.go#L37" | Marshal election implementation link | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.marshal.link |
| 55 | permalink | "https://github.com/halovista/platform/blob/main/drawbridge/rewind.go#L29" | Drawbridge rewind implementation link | covered @ page.blocks[0].tabs[4].sections[0].diagram.nodes.bridge.link |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)

- The Vault API→vault-a1 edge asserts internal transport and labels the API-side message `event.put`, but the HLD names no transport there and uses `event.put` only as the WAL-frame kind; at page.blocks[0].tabs[1].sections[0].diagram.edges[0].
- The `append @ 4181` log attributes offset 4181 to the primary append, while the HLD attaches 4181 to the sync acknowledgment and WAL-frame sample; at page.blocks[0].tabs[1].sections[0].diagram.steps[1].panels.log.log[0].text.
- The `quorum 2/3 — ACK caller` log introduces derived quorum arithmetic that the HLD never states as `2/3`; at page.blocks[0].tabs[1].sections[0].diagram.steps[2].panels.log.log[0].text.
- The `indexed 4181` log assigns offset 4181 to Chronicle's indexing action, while the HLD says only that Chronicle consumes and indexes the committed record; at page.blocks[0].tabs[1].sections[0].diagram.steps[4].panels.log.log[0].text.
- The vault-a1→Chronicle edge asserts a direct primary-to-index connection using internal transport, while the HLD says only that Chronicle consumes the committed stream; at page.blocks[0].tabs[1].sections[0].diagram.edges[3].
- The Resident App→Conduit edge asserts HTTPS, but the HLD names no transport for the list request; at page.blocks[0].tabs[2].sections[0].diagram.edges[0].
- The Conduit→vault-a2 edge asserts internal transport, but the HLD names no transport for routed reads; at page.blocks[0].tabs[2].sections[0].diagram.edges[1].
- The Conduit→vault-b1 edge asserts internal transport, but the HLD names no transport for tokenless stale-tolerant reads; at page.blocks[0].tabs[2].sections[0].diagram.edges[2].
- The lag gauge starts at 0 seconds even though the HLD gives no initial lag value; at page.blocks[0].tabs[2].sections[0].diagram.panels[0].initial.value.
- The `token 4188 issued` log asserts token issuance, while the HLD only says Conduit sees a session write token carrying offset 4188; at page.blocks[0].tabs[2].sections[0].diagram.steps[0].panels.log.log[0].text.
- The Marshal→vault-a2 promotion edge asserts internal transport, but the HLD names no mechanism for promotion; at page.blocks[0].tabs[3].sections[0].diagram.edges[0].
- The Marshal→vault-a1 edge asserts a directed fencing message over internal transport to the powered-off node, while the HLD says Marshal fences epoch 12 without specifying such a message or mechanism; at page.blocks[0].tabs[3].sections[0].diagram.edges[1].
- The promotion step is assigned to the WAL lane even though the HLD presents promotion as a Marshal election action and does not say it travels on WAL; at page.blocks[0].tabs[3].sections[0].diagram.steps[3].lane.
- The `parity @ 4203` panel note assigns the election-time offset 4203 to vault-b1's later parity, while the HLD states only that vault-b1 reaches offset parity; at page.blocks[0].tabs[3].sections[0].diagram.steps[5].panels.set2.b1.sub.
- The Drawbridge→vault-a1 rewind edge asserts internal transport, but the HLD names no mechanism for the rewind action; at page.blocks[0].tabs[4].sections[0].diagram.edges[0].
- The resync replica-set panel leaves vault-b1 in its initial SYNC state through the final step, contradicting the HLD's settled role of b1 async; at page.blocks[0].tabs[4].sections[0].diagram.panels[0].initial.b1 and page.blocks[0].tabs[4].sections[0].diagram.steps[4].panels.set3.
