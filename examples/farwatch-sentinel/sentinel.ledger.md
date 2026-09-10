# Coverage ledger — Sentinel — Cellular Off-Grid Solar Camera
source: docs/hlds/farwatch-sentinel/sentinel.md | version: n/a | updated: 09-09-2026 09:28
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "The daily solar energy budget" | Almanac forecast → Ember budget calculation → Homestead energy history | covered @ page.blocks[0].tabs[1].sections[0].bullets |
| 2 | flow | "Continuous recording into the ring, with event indexing" | continuous ring recording → indexed event → thumbnail/notification/timeline/playback → retention expiry | covered @ page.blocks[0].tabs[2].sections[0].bullets |
| 3 | flow | "Cellular data-cap management" | metering → tier directives → restrictions → sealed reserve → cycle reset | covered @ page.blocks[0].tabs[3].sections[0].bullets |
| 4 | flow | "Cloudy week: degradation to preservation mode" | cloudy-week FULL → ECO → EVENT-ONLY → PRESERVATION → recovery sequence | covered @ page.blocks[0].tabs[4].sections[0].bullets |
| 5 | contract | "Daily energy ledger — camera → Homestead" | CBOR energy-ledger frame fields: day, panel_wh, load_wh, soc_pct, verdict, mode, chg_lock | covered @ page.blocks[0].tabs[1].sections[0].contract |
| 6 | contract | "Quota state frame — Tally → camera" | quota-state fields: cycle_used_mb, cap_mb, tier, caps, reserve_mb, resets_at | covered @ page.blocks[0].tabs[3].sections[0].contract |
| 7 | contract | "event-marker index record" | event-marker fields: marker_id, ts, class/conf, protected segs, uplinked none\|thumb\|clip | covered @ page.blocks[0].tabs[2].sections[0].contract |
| 8 | failure | "Cellular loss / Waystation / Tally down" | continue recording/indexing; queue markers; retain last tier; show last check-in age | covered @ page.blocks[0].tabs[5].sections[0].bullets[0] |
| 9 | failure | "Battery low" | shed quality, then recording, then reachability through the Flow 4 ladder | covered @ page.blocks[0].tabs[4].sections[0] |
| 10 | failure | "Cold snap" | below-freezing charge lock makes intake zero while the energy ladder continues | covered @ page.blocks[0].tabs[5].sections[0].bullets[1] |
| 11 | failure | "microSD failure" | index survives on flash; recording halts; text alert may use reserve | covered @ page.blocks[0].tabs[5].sections[0].bullets[2] |
| 12 | failure | "Quota sealed" | sealing is a data state; command reserve remains; recorded media is retained | covered @ page.blocks[0].tabs[3].sections[0].bullets[9] |
| 13 | service | "Sentinel is farwatch's off-grid camera" | Sentinel camera/system | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 14 | service | "Ember LP" | always-on low-power core that records, indexes, meters energy, and applies modes/tiers | covered @ page.blocks[0].tabs[0].sections[0].bullets[1].sub[0].text |
| 15 | service | "Blaze HP" | normally-off high-power AP/NPU for classification, crops, uploads, and live view | covered @ page.blocks[0].tabs[0].sections[0].bullets[1].sub[1].text |
| 16 | service | "Waystation" | cellular device gateway and store-and-forward relay | covered @ page.blocks[0].tabs[0].sections[0].bullets[5].sub[0].text |
| 17 | service | "Wrangler" | media intake/storage and on-demand clip service | covered @ page.blocks[0].tabs[0].sections[0].bullets[5].sub[1].text |
| 18 | service | "Tally" | SIM-pool meter and tier-directive service | covered @ page.blocks[0].tabs[0].sections[0].bullets[5].sub[2].text |
| 19 | service | "Almanac" | weather/solar forecast service | covered @ page.blocks[0].tabs[0].sections[0].bullets[5].sub[3].text |
| 20 | service | "Homestead" | accounts/app API, mirrored indexes, and energy card | covered @ page.blocks[0].tabs[0].sections[0].bullets[5].sub[4].text |
| 21 | service | "Signalfire" | push-delivery service invoked by Wrangler and Homestead | covered @ page.blocks[0].tabs[0].sections[0].bullets[5].sub[5].text |
| 22 | permalink | "waystation/session.go#L83" | Waystation implementation permalink | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.waystation.link |
| 23 | permalink | "wrangler/intake.go#L47" | Wrangler implementation permalink | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.wrangler.link |
| 24 | permalink | "tally/meter.go#L129" | Tally implementation permalink | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.tally.link |
| 25 | permalink | "almanac/outlook.go#L58" | Almanac implementation permalink | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.almanac.link |
| 26 | permalink | "homestead/api.go#L212" | Homestead implementation permalink | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.homestead.link |
| 27 | permalink | "signalfire/push.go#L31" | Signalfire implementation permalink | covered @ page.blocks[0].tabs[2].sections[0].bullets[6] |
| 28 | number | "the only paths in and out" | two external resource paths: LTE modem and solar panel | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 29 | number | "The design is two ledgers" | two system ledgers | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 30 | number | "recording **continuously**, 24/7" | continuous recording operates 24/7 | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 31 | number | "1/1.8\" 4 MP low-light sensor" | 1/1.8-inch sensor format | covered @ page.blocks[0].tabs[0].sections[0].bullets[0].text |
| 32 | number | "4 MP low-light sensor" | 4 MP sensor resolution | covered @ page.blocks[0].tabs[0].sections[0].bullets[0].text |
| 33 | number | "10 m PIR" | 10 m PIR range | covered @ page.blocks[0].tabs[0].sections[0].bullets[0].text |
| 34 | number | "~90 mW H.265 continuous encode" | approximately 90 mW continuous-encode draw | covered @ page.blocks[0].tabs[0].sections[0].bullets[1].sub[0].text |
| 35 | number | "H.265 continuous encode" | H.265 codec designation | covered @ page.blocks[0].tabs[0].sections[0].bullets[1].sub[0].text |
| 36 | number | "quad-core AP" | four-core Blaze HP AP | covered @ page.blocks[0].tabs[0].sections[0].bullets[1].sub[1].text |
| 37 | number | "2-TOPS NPU" | 2-TOPS NPU capacity | covered @ page.blocks[0].tabs[0].sections[0].bullets[1].sub[1].text |
| 38 | number | "LTE Cat-4 modem" | LTE category 4 | covered @ page.blocks[0].tabs[0].sections[0].bullets[2].text |
| 39 | number | "19,200 mAh" | 19,200 mAh pack capacity | covered @ page.blocks[0].tabs[0].sections[0].bullets[3].text |
| 40 | number | "≈71 Wh" | approximately 71 Wh pack capacity | covered @ page.blocks[0].tabs[0].sections[0].bullets[3].text |
| 41 | number | "5.4 W panel" | 5.4 W panel rating | covered @ page.blocks[0].tabs[0].sections[0].bullets[3].text |
| 42 | number | "below 0 °C" | 0 °C charging-interlock threshold | covered @ page.blocks[0].tabs[0].sections[0].bullets[3].text |
| 43 | number | "512 GB microSD ring" | 512 GB ring capacity | covered @ page.blocks[0].tabs[0].sections[0].bullets[4].text |
| 44 | number | "~9.5 days" | approximately 9.5 days of ring depth | covered @ page.blocks[0].tabs[0].sections[0].bullets[4].text |
| 45 | number | "at 1.5 Mbps" | 1.5 Mbps FULL recording bitrate | covered @ page.blocks[0].tabs[0].sections[0].bullets[4].text |
| 46 | number | "256 MB internal" | 256 MB internal-flash capacity | covered @ page.blocks[0].tabs[0].sections[0].bullets[4].text |
| 47 | number | "During the 03:00 radio window" | 03:00 forecast radio window | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 48 | number | "2.1 sun-hours" | forecast of 2.1 sun-hours | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 49 | number | "≈ 11.3 Wh" | approximately 11.3 Wh expected panel intake | covered @ page.blocks[0].tabs[1].sections[0].bullets[1] |
| 50 | number | "continuous encode 6.7 Wh" | 6.7 Wh continuous-encode load | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 51 | number | "ring writes 1.2 Wh" | 1.2 Wh ring-write load | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 52 | number | "radio windows 3.1 Wh" | 3.1 Wh radio-window load | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 53 | number | "AI wakes 1.4 Wh" | 1.4 Wh AI-wake load | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 54 | number | "≈ 12.4 Wh/day" | approximately 12.4 Wh/day total standing load | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 55 | number | "1.1 Wh short" | 1.1 Wh daily deficit | covered @ page.blocks[0].tabs[1].sections[0].bullets[3] |
| 56 | number | "pack at 64%" | 64% pack state of charge | covered @ page.blocks[0].tabs[1].sections[0].bullets[3] |
| 57 | number | "−0.9%/day" | 0.9% daily drawdown | covered @ page.blocks[0].tabs[1].sections[0].bullets[3] |
| 58 | number | "wakes for 20 seconds" | 20-second ledger-report wake/burst duration | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 59 | number | "delivering 5.1 W" | 5.1 W noon panel output | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 60 | number | "revises expected intake to 16 Wh" | 16 Wh revised expected intake | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 61 | number | "posts +3.2 Wh" | 3.2 Wh evening surplus | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 62 | number | "pack at 66%" | 66% evening pack charge | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 63 | number | "30-minute segments" | 30-minute ring segments | covered @ page.blocks[0].tabs[2].sections[0].bullets[0] |
| 64 | number | "boots in 380 ms" | 380 ms Blaze HP boot time | covered @ page.blocks[0].tabs[2].sections[0].bullets[3] |
| 65 | number | "person, 0.88" | 0.88 person-classification confidence | covered @ page.blocks[0].tabs[2].sections[0].bullets[3] |
| 66 | number | "the two covering segments" | two segments protected for an event | covered @ page.blocks[0].tabs[2].sections[0].bullets[4] |
| 67 | number | "Two weeks later" | two-week protected-pair retention | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 68 | number | "3 GB/cycle pool" | 3 GB per-cycle data pool | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 69 | number | "0 MB used" | cycle opens at 0 MB used | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 70 | number | "At 60% used" | tier-1 threshold at 60% used | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 71 | number | "day 19" | 60% threshold occurs on day 19 | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 72 | number | "tier-1 directive" | tier 1 directive | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 73 | number | "1080p → 720p" | FULL live-view resolution is 1080p | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 74 | number | "1080p → 720p" | tier-1 live-view resolution is 720p | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 75 | number | "day 26 of a 30-day cycle" | projected exhaustion on day 26 | covered @ page.blocks[0].tabs[3].sections[0].bullets[4] |
| 76 | number | "30-day cycle" | 30-day data cycle | covered @ page.blocks[0].tabs[3].sections[0].bullets[4] |
| 77 | number | "At 80%" | tier-2 threshold at 80% used | covered @ page.blocks[0].tabs[3].sections[0].bullets[5] |
| 78 | number | "tier 2" | tier 2 directive/state | covered @ page.blocks[0].tabs[3].sections[0].bullets[5] |
| 79 | number | "At 95%" | tier-3 threshold at 95% used | covered @ page.blocks[0].tabs[3].sections[0].bullets[6] |
| 80 | number | "tier 3" | tier 3 directive/state | covered @ page.blocks[0].tabs[3].sections[0].bullets[6] |
| 81 | number | "At 100%" | pool seals at 100% used | covered @ page.blocks[0].tabs[3].sections[0].bullets[7] |
| 82 | number | "15 MB command reserve" | 15 MB command reserve | covered @ page.blocks[0].tabs[3].sections[0].bullets[7] |
| 83 | number | "resets on the 1st" | cycle resets on the first day of the month | covered @ page.blocks[0].tabs[3].sections[0].bullets[8] |
| 84 | number | "tier 4 is a data state" | tier 4 is the sealed quota state | covered @ page.blocks[0].tabs[3].sections[0].bullets[9] |
| 85 | number | "`2026-09-05`" | daily-ledger sample date 2026-09-05 | covered @ page.blocks[0].tabs[1].sections[0].contract.fields[0].v |
| 86 | number | "`1843`" | quota-frame sample cycle usage 1843 MB | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[0].v |
| 87 | number | "`3072`" | quota-frame pool capacity 3072 MB | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[1].v |
| 88 | number | "0 = unrestricted" | tier 0 is unrestricted | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[2].g |
| 89 | number | "`2026-10-01T00:00Z`" | quota-frame next cycle boundary | covered @ page.blocks[0].tabs[3].sections[0].contract.fields[5].v |
| 90 | number | "Day 1 is overcast" | degradation day 1 | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 91 | number | "intake 4 Wh" | day-1 intake of 4 Wh | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 92 | number | "against a 12 Wh load" | day-1 load of 12 Wh | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 93 | number | "64% → 58%" | pack falls to 58% on day 1 and starts day 2 there | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 94 | number | "5-day outlook" | Almanac forecast horizon is 5 days | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 95 | number | "three more overcast days" | three additional overcast days forecast | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 96 | number | "1.5 → 0.8 Mbps" | ECO recording bitrate is 0.8 Mbps | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 97 | number | "Day 2 the pack falls" | degradation day 2 | covered @ page.blocks[0].tabs[4].sections[0].bullets[2] |
| 98 | number | "58% → 50%" | pack falls to 50% on day 2 | covered @ page.blocks[0].tabs[4].sections[0].bullets[2] |
| 99 | number | "4-hourly" | radio-window cadence stretches to every 4 hours | covered @ page.blocks[0].tabs[4].sections[0].bullets[2] |
| 100 | number | "Day 3 the pack hits" | degradation day 3 | covered @ page.blocks[0].tabs[4].sections[0].bullets[4] |
| 101 | number | "pack hits 41%" | EVENT-ONLY transition at 41% on day 3 | covered @ page.blocks[0].tabs[4].sections[0].bullets[4] |
| 102 | number | "Day 4 the pack hits" | degradation day 4 | covered @ page.blocks[0].tabs[4].sections[0].bullets[5] |
| 103 | number | "pack hits 28%" | pack reaches 28% on day 4 | covered @ page.blocks[0].tabs[4].sections[0].bullets[5] |
| 104 | number | "one 90-second check-in per day" | one daily radio check-in | covered @ page.blocks[0].tabs[4].sections[0].bullets[5] |
| 105 | number | "90-second check-in" | 90-second check-in duration | covered @ page.blocks[0].tabs[4].sections[0].bullets[5] |
| 106 | number | "pack crosses 15%" | PRESERVATION threshold at 15% | covered @ page.blocks[0].tabs[4].sections[0].bullets[6] |
| 107 | number | "one final 20-second modem burst" | one final preservation-entry modem burst | covered @ page.blocks[0].tabs[4].sections[0].bullets[7] |
| 108 | number | "Day 6 the sun returns" | recovery begins on day 6 | covered @ page.blocks[0].tabs[4].sections[0].bullets[8] |
| 109 | number | "at 30%" | EVENT-ONLY recovery threshold at 30% | covered @ page.blocks[0].tabs[4].sections[0].bullets[8] |
| 110 | number | "At 55%" | FULL recovery threshold at 55% | covered @ page.blocks[0].tabs[4].sections[0].bullets[9] |
| 111 | number | "treats intake as zero" | cold-snap ledger intake is zero | covered @ page.blocks[0].tabs[5].sections[0].bullets[1] |
| 112 | number | "the pack falls 64% → 58%" | pack starts the cloudy-week degradation at 64% | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 113 | number | "20-second modem burst" | final preservation-entry modem burst lasts 20 seconds | covered @ page.blocks[0].tabs[4].sections[0].bullets[7] |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- The tab label "Four dark days" derives a four-day count that the HLD never states as such; it sits at `page.blocks[0].tabs[4].label`.
- The "farwatch app" owner-phone subtitle brands the app beyond the HLD's plain "app" wording; it sits at `page.blocks[0].tabs[1].sections[0].diagram.nodes.phone.sub` and `page.blocks[0].tabs[3].sections[0].diagram.nodes.phone.sub`.
- The battery panel invents a 25% low threshold; it sits at `page.blocks[0].tabs[1].sections[0].diagram.panels[0].low`.
- The panel-input gauge invents a maximum of 6 W; it sits at `page.blocks[0].tabs[1].sections[0].diagram.panels[1].max`.
- The panel-input gauge asserts 0 W before/no later than the intake calculation although the HLD does not give that reading; it sits at `page.blocks[0].tabs[1].sections[0].diagram.panels[1].initial.value` and `page.blocks[0].tabs[1].sections[0].diagram.steps[1].panels.pv.value`.
- The battery panel switches to a draining trend during the intake-only calculation, before the HLD establishes the standing load and drawdown; it sits at `page.blocks[0].tabs[1].sections[0].diagram.steps[1].panels.soc.trend`.
- The +3.2 Wh evening-close result is patched during the earlier "Intake revised to 16 Wh" step; it sits at `page.blocks[0].tabs[1].sections[0].diagram.steps[6].panels.soc.note`.
- The event-marker contract calls `marker_id` unique although the HLD only names the field; it sits at `page.blocks[0].tabs[2].sections[0].contract.fields[0].g`.
- The event-marker contract calls `ts` site-local although the HLD only names the field; it sits at `page.blocks[0].tabs[2].sections[0].contract.fields[1].g`.
- The event-marker contract invents concrete protected segment ids 19–20; it sits at `page.blocks[0].tabs[2].sections[0].contract.fields[3].v`.
- The ring visualization invents a 24-cell compression and concrete cell/head indices 0, 18, 19, 20, and 23; it sits at `page.blocks[0].tabs[2].sections[0].diagram.panels[0]` and the `ring` patches under `page.blocks[0].tabs[2].sections[0].diagram.steps`.
- The quota gauge derives 2458 MB for the 80% step instead of carrying an HLD-stated number; it sits at `page.blocks[0].tabs[3].sections[0].diagram.steps[5].panels.used.value`.
- The quota gauge derives 2918 MB for the 95% step instead of carrying an HLD-stated number; it sits at `page.blocks[0].tabs[3].sections[0].diagram.steps[6].panels.used.value`.
- The battery panel invents a 25% low threshold; it sits at `page.blocks[0].tabs[4].sections[0].diagram.panels[0].low`.
- The battery panel initially says "deficit forecast" before the HLD's day-1 intake/load step establishes the deficit verdict; it sits at `page.blocks[0].tabs[4].sections[0].diagram.panels[0].initial.note`.
- The phrase "before complaints" changes the HLD's "before anyone notices missing features" assertion; it sits at `page.blocks[0].tabs[4].sections[0].diagram.steps[3].text`.
- The `int` mechanism on the Almanac→Waystation edge is not stated by the HLD; it sits at `page.blocks[0].tabs[1].sections[0].diagram.edges[0].kind`.
- The `int` mechanism on the LTE modem→Ember LP edge is not stated by the HLD; it sits at `page.blocks[0].tabs[1].sections[0].diagram.edges[2].kind`.
- The `int` mechanism on the Solar panel→Ember LP edge is not stated by the HLD; it sits at `page.blocks[0].tabs[1].sections[0].diagram.edges[3].kind`.
- The `int` mechanism on the Blaze HP→LTE modem edge is not stated by the HLD; it sits at `page.blocks[0].tabs[1].sections[0].diagram.edges[4].kind`.
- The `int` mechanism on the Waystation→Homestead edge is not stated by the HLD; it sits at `page.blocks[0].tabs[1].sections[0].diagram.edges[6].kind`.
- The `https` mechanism on the Homestead→Owner phone edge is not stated by the HLD; it sits at `page.blocks[0].tabs[1].sections[0].diagram.edges[7].kind`.
- The `int` mechanism on the Ember LP→microSD ring edge is not stated by the HLD; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[0].kind`.
- The `int` mechanism on the PIR→Ember LP edge is not stated by the HLD; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[1].kind`.
- The `int` mechanism on the Ember LP→Blaze HP edge does not preserve the HLD's named wake-interrupt mechanism; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[2].kind`.
- The `int` mechanism on the Blaze HP→microSD ring edge is not stated by the HLD; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[3].kind`.
- The `int` mechanism on the Blaze HP→LTE modem edge is not stated by the HLD; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[4].kind`.
- The `int` mechanism on the Waystation→Wrangler edge is not stated by the HLD; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[6].kind`.
- The direct Wrangler→Owner phone `https` push edge collapses Signalfire's stated push-delivery role and uses an unstated mechanism; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[7]`.
- The `https` mechanism on the Homestead→Owner phone marker-list edge is not stated by the HLD; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[8].kind`.
- The direct Owner phone→Waystation `https` play-clip route is not stated by the HLD; it sits at `page.blocks[0].tabs[2].sections[0].diagram.edges[9]`.
- The `int` mechanism on the Waystation→Tally edge is not stated by the HLD; it sits at `page.blocks[0].tabs[3].sections[0].diagram.edges[1].kind`.
- The `int` mechanism on the Tally→Waystation edge is not stated by the HLD; it sits at `page.blocks[0].tabs[3].sections[0].diagram.edges[2].kind`.
- The `int` mechanism on the LTE modem→Ember LP edge is not stated by the HLD; it sits at `page.blocks[0].tabs[3].sections[0].diagram.edges[4].kind`.
- The Tally→Homestead `int` cycle-state hop and mechanism are not stated by the HLD; they sit at `page.blocks[0].tabs[3].sections[0].diagram.edges[5]`.
- The `https` mechanism on the Homestead→Owner phone quota-bar edge is not stated by the HLD; it sits at `page.blocks[0].tabs[3].sections[0].diagram.edges[6].kind`.
- The `int` mechanism on the Solar panel→Ember LP edge is not stated by the HLD; it sits at `page.blocks[0].tabs[4].sections[0].diagram.edges[0].kind`.
- The `int` mechanism on the Almanac→Waystation edge is not stated by the HLD; it sits at `page.blocks[0].tabs[4].sections[0].diagram.edges[1].kind`.
- The "status ping" message label is not stated by the HLD; it sits at `page.blocks[0].tabs[4].sections[0].diagram.edges[3].label`.
- The `int` mechanism on the Waystation→Homestead edge is not stated by the HLD; it sits at `page.blocks[0].tabs[4].sections[0].diagram.edges[4].kind`.
- The `https` mechanism on the Homestead→Owner phone mode-banner edge is not stated by the HLD; it sits at `page.blocks[0].tabs[4].sections[0].diagram.edges[5].kind`.
