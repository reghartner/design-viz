# Coverage ledger — hearthline Sentry Cloud — cross-region failover
source: docs/hlds/hearthline-failover/failover.md | version: n/a | updated: 09-09-2026 09:23
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Healthy posture: journal first, replicate always" | journal-first ingest, acknowledgement, southbound replication, parity, and healthy fencing posture | covered @ page.blocks[0].tabs[1].sections[0] |
| 2 | flow | "Region loss mid-incident" | region outage, fencing-token move, reconnect reconciliation, replay, dispatch, and acknowledgement | covered @ page.blocks[0].tabs[2].sections[0] |
| 3 | flow | "The fence: no double dispatch" | recovered Northline is fenced, late sessions redirect, and standby requires a full healthy window | covered @ page.blocks[0].tabs[3].sections[0] |
| 4 | flow | "Failback without a gap" | reverse replication, parity, entitlement replay, token move, steering return, and standby restoration | covered @ page.blocks[0].tabs[4].sections[0] |
| 5 | contract | "Journal replication record (Tether)" | acct, seq, incident, epoch, kind, and ts fields | covered @ page.blocks[0].tabs[1].sections[0].contract |
| 6 | contract | "Reconnect hello (panel → Hearthgate, first frame of every session)" | acct, panel_seq, and open_incidents fields | covered @ page.blocks[0].tabs[2].sections[0].contract |
| 7 | contract | "Reconnect hello-ack (Hearthgate → panel, the response)" | journal_seq and replay_from fields | covered @ page.blocks[0].tabs[2].sections[1].contract |
| 8 | contract | "Fencing decision (Crossbar)" | token_holder, epoch, probes, and holddown_s fields | covered @ page.blocks[0].tabs[3].sections[0].contract |
| 9 | failure | "NO ACKNOWLEDGED ALARM IS LOST" | acknowledged-event loss is prevented by panel retention and reconnect reconciliation | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 10 | failure | "A replayed event that was already dispatched" | a replayed dispatched event updates the existing incident ticket and cannot open another ticket | covered @ page.blocks[0].tabs[0].sections[0].bullets[1].sub[0] |
| 11 | failure | "Northline loses power and network together" | total Northline power-and-network outage during an open incident | covered @ page.blocks[0].tabs[2].sections[0].bullets[1] |
| 12 | failure | "delivery of seq 5202 times out" | panel holds the timed-out event and retries | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 13 | failure | "still believes it is active" | recovered Northline holds stale-active state and its append is refused by fencing | covered @ page.blocks[0].tabs[3].sections[0].bullets[1] |
| 14 | failure | "Any late panel session reaching Northline" | a late session reaching a fenced gateway is refused and redirected | covered @ page.blocks[0].tabs[3].sections[0].bullets[3] |
| 15 | failure | "Replication link loss only" | Tether loss raises a lag alarm but does not itself trigger failover | covered @ page.blocks[0].tabs[5].sections[0].bullets[0] |
| 16 | failure | "Steering flaps" | hold-down rate limiting prevents steering flaps from bouncing the token | covered @ page.blocks[0].tabs[5].sections[0].bullets[1] |
| 17 | failure | "Panel-side outage" | device-layer cellular failover remains independent of region failover | covered @ page.blocks[0].tabs[5].sections[0].bullets[2] |
| 18 | failure | "Region loss inside the replication lag" | panel retention and hello reconciliation recover a journal record lost with the region, including a final event | covered @ page.blocks[0].tabs[5].sections[0].bullets[3] |
| 19 | failure | "Split brain" | the current epoch token prevents double append and dispatch | covered @ page.blocks[0].tabs[5].sections[0].bullets[4] |
| 20 | service | "Sentry Cloud runs active/standby" | Sentry Cloud is the active/standby regional system | covered @ page.blocks[0].tabs[0].sections[0].text[1] |
| 21 | service | "existing Sentry Panel" | Sentry Panel retains, retries, reconnects, replays, and receives acknowledgements | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.panel |
| 22 | service | "**Hearthgate** — per-region device gateway" | Hearthgate terminates panel TLS sessions, hands events to Overwatch, and redirects when fenced | covered @ page.blocks[0].tabs[0].sections[0].bullets[3] |
| 23 | service | "**Overwatch** — per-region alarm intake" | Overwatch journals, dedupes, acknowledges, replicates, and routes alarms | covered @ page.blocks[0].tabs[0].sections[0].bullets[4] |
| 24 | service | "**Summons** — dispatch integration" | Summons dispatches to monitoring centers | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.summons |
| 25 | service | "**Register** — entitlements" | Register entitlement changes replay during failback | covered @ page.blocks[0].tabs[4].sections[0].bullets[2] |
| 26 | service | "**Tether** — the cross-region journal replication link" | Tether ships the journal south and reverses for failback catch-up | covered @ page.blocks[0].tabs[1].sections[0].diagram.steps[3] |
| 27 | service | "**Crossbar** — failover controller" | Crossbar probes regions, owns the fencing token, and controls regional roles | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.crossbar |
| 28 | service | "**Pathfinder** — traffic steering" | Pathfinder routes panel sessions and shifts or returns steering | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.path |
| 29 | service | "Northline (active)" | Northline is the initial active regional stack, later dark, fenced, standby, and active again | covered @ page.blocks[0].tabs[1].sections[0].diagram.groups.north |
| 30 | service | "Southline (standby)" | Southline is the initial standby regional stack, becomes active, then returns to standby | covered @ page.blocks[0].tabs[1].sections[0].diagram.groups.south |
| 31 | number | "across two regions" | two regions: Northline and Southline | covered @ page.blocks[0].tabs[0].sections[0].text[1] |
| 32 | number | "dual-path" | Sentry Panel has two device paths, broadband and cellular | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 33 | number | "24 h battery" | Sentry Panel battery capacity is 24 h | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 34 | number | "from three vantage" | Crossbar probes from three vantage points | covered @ page.blocks[0].tabs[0].sections[0].bullets[8] |
| 35 | number | "single fencing token" | exactly one fencing token controls append and dispatch authority | covered @ page.blocks[0].tabs[0].sections[0].bullets[8] |
| 36 | number | "seq 5201" | alarm sequence 5201 is journaled, acknowledged, replicated, and used as the regional journal watermark | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 37 | number | "typical lag 1.8 s" | typical replication lag is 1.8 s | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 38 | number | "seq 5202" | alarm sequence 5202 times out, is retained and replayed, then appends in Southline | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 39 | number | "hold-down window (30 s)" | Crossbar hold-down is 30 s | covered @ page.blocks[0].tabs[2].sections[0].bullets[3] |
| 40 | number | "INC-88121-5199" | stable incident id sample is INC-88121-5199 | covered @ page.blocks[0].tabs[2].sections[0].bullets[6].text |
| 41 | number | "one incident, sequence unbroken" | dispatcher sees one incident with an unbroken sequence | covered @ page.blocks[0].tabs[2].sections[0].bullets[8] |
| 42 | number | "92 s" | total detection-to-ack budget is 92 s | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 43 | number | "180 s RTO target" | RTO target is 180 s | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 44 | number | "5202–5230" | failback ships journal sequence range 5202–5230 | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 45 | number | "parity is reached at seq 5230" | failback parity watermark is sequence 5230 | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 46 | number | "over the next hour" | panel steering drifts back within the next hour | covered @ page.blocks[0].tabs[4].sections[0].bullets[4] |
| 47 | number | "HL-88121" | account sample is HL-88121 | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[0].v |
| 48 | number | "\| epoch \| 7 \|" | journal record fencing epoch sample is 7 | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[3].v |
| 49 | number | "\| epoch \| 8 \|" | fencing decision epoch sample is 8 | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[1].v |
| 50 | number | "3/3 down" | all three vantage probes are down | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[2].v |
| 51 | number | "60 s" | Southline replication-lag alarm threshold is 60 s | covered @ page.blocks[0].tabs[5].sections[0].bullets[0] |
| 52 | number | "AT-LEAST-ONCE" | monitoring-center delivery is at-least-once | covered @ page.blocks[0].tabs[0].sections[0].bullets[1] |
| 53 | number | "exactly-once" | ticket effect is exactly-once | covered @ page.blocks[0].tabs[0].sections[0].bullets[1] |
| 54 | permalink | "https://github.com/hearthline/cloud/blob/main/overwatch/journal.go#L88" | Overwatch journal implementation permalink | covered @ page.blocks[0].tabs[0].sections[0].bullets[4].text |
| 55 | permalink | "https://github.com/hearthline/cloud/blob/main/summons/dispatch.go#L41" | Summons dispatch implementation permalink | covered @ page.blocks[0].tabs[0].sections[0].bullets[5].text |
| 56 | permalink | "https://github.com/hearthline/cloud/blob/main/tether/ship.go#L23" | Tether journal-shipping implementation permalink | covered @ page.blocks[0].tabs[0].sections[0].bullets[7].text |
| 57 | permalink | "https://github.com/hearthline/cloud/blob/main/crossbar/fence.go#L57" | Crossbar fencing implementation permalink | covered @ page.blocks[0].tabs[0].sections[0].bullets[8].text |
| 58 | permalink | "https://github.com/hearthline/cloud/blob/main/pathfinder/steer.go#L19" | Pathfinder steering implementation permalink | covered @ page.blocks[0].tabs[0].sections[0].bullets[9].text |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- Unsupported transport `ethernet` is assigned to the Northline reachability link at `page.blocks[0].tabs[2].sections[0].diagram.panels[1].links[0].transport`; the HLD names network loss and DNS + anycast steering but does not identify this link as Ethernet.
- Unsupported transport `ethernet` is assigned to the Southline reachability link at `page.blocks[0].tabs[2].sections[0].diagram.panels[1].links[1].transport`; the HLD names network loss and DNS + anycast steering but does not identify this link as Ethernet.
- Derived count `29 records` appears at `page.blocks[0].tabs[4].sections[0].diagram.panels[0].capacity`; the HLD states the range 5202–5230 but never states a record count.
- Derived count `29 records` appears at `page.blocks[0].tabs[4].sections[0].diagram.steps[0].panels.cat.note`; the HLD states the range 5202–5230 but never states a record count.
- Derived epoch `epoch 9 → northline` appears at `page.blocks[0].tabs[4].sections[0].diagram.steps[2].panels.log.log[0].text`; the HLD states that epochs increment on each move and supplies samples 7 and 8, but never states epoch 9.
