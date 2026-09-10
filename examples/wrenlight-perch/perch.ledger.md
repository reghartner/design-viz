# Coverage ledger — wrenlight Perch — Two-Year Battery Camera & Loft Module
source: docs/hlds/wrenlight-perch/perch.md | version: n/a | updated: 09-09-2026 09:30
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "What a wake-up costs (the battery-day ledger)" | PIR qualification, Bough capture, TwigLink delivery, wake receipt, and Abacus forecast flow | covered @ page.blocks[0].tabs[0].sections[0] |
| 2 | flow | "The TwigLink leash: retry and supervision" | hourly check-in, retry/backoff, UNSUPERVISED alert, staged-clip recovery, and alarm-clear flow | covered @ page.blocks[0].tabs[1].sections[0] |
| 3 | flow | "Clip upload with the Loft as gateway" | chunk transfer, repair, Loft custody, Granary upload, notification, and queue-drain flow | covered @ page.blocks[0].tabs[2].sections[0] |
| 4 | flow | "Cold weather: lithium chemistry and its limits" | thermistor report, cold profile, gauge correction, qualification tightening, Sunrail gating, and forecast flow | covered @ page.blocks[0].tabs[3].sections[0] |
| 5 | contract | "TwigLink clip chunk (camera → Loft, 908.4 MHz frame)" | `net_id`, `cam_id`, `seq`, `type`, `len`, and `mic` clip-chunk fields and meanings | covered @ page.blocks[0].tabs[2].sections[0].contract |
| 6 | contract | "Wake receipt (camera → Loft → Abacus)" | `event_id`, timing, current, metered cost, battery, and temperature receipt fields | covered @ page.blocks[0].tabs[0].sections[0].contract |
| 7 | contract | "The Loft → Granary upload manifest carries" | `clip_id`, `cam_id`, `sha256`, `bytes`, `queued_at`, and `attempts` manifest fields | covered @ page.blocks[0].tabs[2].sections[1].contract |
| 8 | failure | "On a missed ack Twig retries" | missed TwigLink ack escalates through retry, backoff, UNSUPERVISED reporting and push, then staged-clip recovery and alarm clearing | covered @ page.blocks[0].tabs[1].sections[0].diagram.steps |
| 9 | failure | "Lost chunks are re-requested by NACK bitmap" | lost chunks get at most three repair rounds because retries cost camera battery | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 10 | failure | "If Wi-Fi is down the queue simply holds" | house Wi-Fi loss leaves cameras unaffected while Loft buffers, later drains, and delays pushes | covered @ page.blocks[0].tabs[2].sections[0].bullets[8] |
| 11 | failure | "Twig applies the limits" | cold conditions cap IR and clip length, refuse sufficiently cold live view, change battery gauging, and tighten qualification | covered @ page.blocks[0].tabs[3].sections[0].bullets |
| 12 | failure | "charge controller suspends Li-ion charging" | Sunrail suspends Li-ion charging below 0 °C but still offsets daytime supervision draw | covered @ page.blocks[0].tabs[3].sections[0].bullets[5] |
| 13 | failure | "Loft drops the frame on mismatch" | a clip-chunk MIC mismatch causes the Loft to drop the frame | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[5].g |
| 14 | failure | "Loft loses power" | cameras remain locally armed, stage clips, spend extra battery retrying, and Roost declares the site offline after missed heartbeats | covered @ page.blocks[0].tabs[1].sections[0].bullets[8] |
| 15 | failure | "Battery low" | low battery progressively disables live view, shortens clips and check-in cadence, then falls back to PIR text events | covered @ page.blocks[0].tabs[0].sections[0].bullets[15] |
| 16 | failure | "Cloud down" | Loft and USB archiving continue while cloud-plan clips arrive in a later burst | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 17 | failure | "RF interference on 908 MHz" | per-attempt channel hopping precedes a Loft RF-environment alert with RSSI history | covered @ page.blocks[0].tabs[1].sections[0].bullets[9] |
| 18 | failure | "Alkaline cells installed" | alkaline detection voids the two-year app promise and changes the cold limit | covered @ page.blocks[0].tabs[3].sections[0].bullets[8] |
| 19 | service | "Perch camera" | Perch camera is the battery-powered camera containing the PIR, Twig, and Bough | covered @ page.blocks[0].tabs[0].sections[0].diagram.groups.cam |
| 20 | service | "Loft" | Perch Loft is the wall-powered sync module, TwigLink concentrator, buffer, and gateway | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.loft |
| 21 | service | "TwigLink radio" | TwigLink is the proprietary sub-GHz camera-to-Loft radio link | covered @ page.protocols.twig |
| 22 | service | "Twig (WL-LP1)" | Twig owns always-on sensing, qualification, the radio MAC, thermistor, and Bough power rail | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.twig |
| 23 | service | "Bough (WL-AP4)" | Bough is the retained-RAM video SoC that records clips into staging flash | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.bough |
| 24 | service | "Sunrail" | Sunrail is the optional solar mount with a Li-ion buffer and temperature-gated controller | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.sunrail |
| 25 | service | "Roost" | Roost holds Loft sessions and tracks camera supervision state | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.roost |
| 26 | service | "Granary" | Granary stores cloud-plan clips and indexes local-only USB manifests | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.granary |
| 27 | service | "Abacus" | Abacus folds wake receipts into the app's battery forecast | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.abacus |
| 28 | service | "Flitter" | Flitter fans out push notifications | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.flitter |
| 29 | service | "Molt" | Molt stages firmware that the Loft trickles to cameras during supervision windows | covered @ page.blocks[0].tabs[1].sections[0].bullets[1] |
| 30 | number | "two AA lithium cells" | camera power source has two AA lithium cells | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 31 | number | "two-year battery contract" | battery-life contract is two years | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 32 | number | "sleeps at 4 µA" | camera/Twig sleep current is 4 µA | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 33 | number | "proprietary 908 MHz" | overview identifies TwigLink as a 908 MHz link | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 34 | number | "3300 mAh" | AA-cell capacity is 3300 mAh | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 35 | number | "730 days" | two-year accounting horizon is 730 days | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 36 | number | "allowance of 4.5 mAh" | daily battery allowance is 4.5 mAh | covered @ page.blocks[0].tabs[0].sections[0].text[0] |
| 37 | number | "dual-chip split" | Perch camera contains a two-chip split | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 38 | number | "1080p video SoC" | Bough video resolution is 1080p | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 39 | number | "boots from retained RAM in 400 ms" | Bough retained-RAM boot takes 400 ms | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 40 | number | "64 MB staging flash" | Bough staging flash capacity is 64 MB | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 41 | number | "about 3 clips" | 64 MB staging flash holds about three clips | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 42 | number | "850 nm" | IR illuminator wavelength is 850 nm | covered @ page.blocks[0].tabs[0].sections[0].bullets[0] |
| 43 | number | "3300 mAh at 3 V" | AA pack nominal voltage is 3 V | covered @ page.blocks[0].tabs[0].sections[0].bullets[1] |
| 44 | number | "908.4 MHz FSK" | exact TwigLink carrier frequency is 908.4 MHz | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 45 | number | "500 kbps" | TwigLink bitrate is 500 kbps | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 46 | number | "AES-CCM-128" | TwigLink uses the AES-CCM-128 variant | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 47 | number | "exactly one Loft" | every camera is a leaf of exactly one Loft | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 48 | number | "32 GB eMMC" | Loft store-and-forward capacity is 32 GB | covered @ page.blocks[0].tabs[0].sections[0].bullets[3] |
| 49 | number | "serves up to 10 cameras" | one Loft serves at most ten cameras | covered @ page.blocks[0].tabs[0].sections[0].bullets[3] |
| 50 | number | "persistent TLS channel" | each Loft holds one outbound persistent TLS channel to Roost | covered @ page.blocks[0].tabs[1].sections[0].text[0] |
| 51 | number | "800 ms qualification pass" | Twig qualification duration is 800 ms | covered @ page.blocks[0].tabs[0].sections[0].bullets[6] |
| 52 | number | "at 2 mA" | Twig qualification current is 2 mA | covered @ page.blocks[0].tabs[0].sections[0].bullets[6] |
| 53 | number | "0.0004 battery-days" | rejected qualification costs 0.0004 battery-days | covered @ page.blocks[0].tabs[0].sections[0].bullets[6] |
| 54 | number | "400 ms at 120 mA" | Bough boot current is 120 mA | covered @ page.blocks[0].tabs[0].sections[0].bullets[7] |
| 55 | number | "12 s clip" | normal clip duration is 12 s | covered @ page.blocks[0].tabs[0].sections[0].bullets[8] |
| 56 | number | "at 180 mA" | recording current is 180 mA | covered @ page.blocks[0].tabs[0].sections[0].bullets[8] |
| 57 | number | "night adds 60 mA" | night IR adds 60 mA while recording | covered @ page.blocks[0].tabs[0].sections[0].bullets[8] |
| 58 | number | "2.4 MB encoded clip" | encoded clip size in the wake flow is 2.4 MB | covered @ page.blocks[0].tabs[0].sections[0].bullets[10] |
| 59 | number | "ships it in 8 s" | radio clip shipment takes 8 s | covered @ page.blocks[0].tabs[0].sections[0].bullets[10] |
| 60 | number | "at 45 mA" | TwigLink shipment current is 45 mA | covered @ page.blocks[0].tabs[0].sections[0].bullets[10] |
| 61 | number | "0.91 mAh total" | metered wake cost is 0.91 mAh | covered @ page.blocks[0].tabs[0].sections[0].bullets[12] |
| 62 | number | "0.20 battery-days" | metered wake cost is 0.20 battery-days | covered @ page.blocks[0].tabs[0].sections[0].bullets[12] |
| 63 | number | "one night event costs" | the cost comparison is for one night event | covered @ page.blocks[0].tabs[0].sections[0].bullets[12] |
| 64 | number | "a fifth of a day's allowance" | one night event costs one fifth of the daily allowance | covered @ page.blocks[0].tabs[0].sections[0].bullets[12] |
| 65 | number | "five night events a day" | five night events consume the full daily allowance | covered @ page.blocks[0].tabs[0].sections[0].bullets[14] |
| 66 | number | "today's eleven" | the example day has eleven events | covered @ page.blocks[0].tabs[0].sections[0].bullets[14] |
| 67 | number | "from 24" | forecast begins at 24 months | covered @ page.blocks[0].tabs[0].sections[0].bullets[14] |
| 68 | number | "to 22 months" | eleven events trim the forecast to 22 months | covered @ page.blocks[0].tabs[0].sections[0].bullets[14] |
| 69 | number | "Every 60 minutes" | regular Twig radio check-in interval is 60 minutes | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 70 | number | "a 200 ms check-in" | regular check-in radio wake lasts 200 ms | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 71 | number | "retries at +2 s" | first missed-ack retry is at +2 s | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 72 | number | "+8 s" | second missed-ack retry is at +8 s | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 73 | number | "+30 s" | third missed-ack retry is at +30 s | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 74 | number | "every 5 minutes" | unheard-camera backoff check-in interval is five minutes | covered @ page.blocks[0].tabs[1].sections[0].bullets[3] |
| 75 | number | "two silent check-in windows" | Loft declares UNSUPERVISED after two silent windows | covered @ page.blocks[0].tabs[1].sections[0].bullets[4] |
| 76 | number | "unreachable since 14:20" | sample unreachable-since time is 14:20 | covered @ page.blocks[0].tabs[1].sections[0].bullets[5] |
| 77 | number | "`missed=7, staged=2`" | recovered check-in reports seven missed check-ins | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 78 | number | "`missed=7, staged=2`" | recovered check-in reports two staged clips | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 79 | number | "1 KB sequenced TwigLink chunks" | clip chunks carry 1 KB each | covered @ page.blocks[0].tabs[2].sections[0].bullets[0] |
| 80 | number | "at most three repair rounds" | lost chunks permit no more than three repair rounds | covered @ page.blocks[0].tabs[2].sections[0].bullets[2] |
| 81 | number | "about three weeks of clips" | 32 GB represents about three weeks of clips | covered @ page.blocks[0].tabs[2].sections[0].bullets[7] |
| 82 | number | "An hourly check-in" | cold-flow thermistor reporting cadence is hourly | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 83 | number | "at −24 °C" | cold-flow wake temperature is −24 °C | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 84 | number | "capped at 50%" | cold profile caps IR illumination at 50% | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 85 | number | "12 s → 8 s" | cold profile caps clip duration at 8 s | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 86 | number | "below −30 °C" | lithium live view is refused below −30 °C | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 87 | number | "below 0 °C" | Sunrail Li-ion charging suspends below 0 °C | covered @ page.blocks[0].tabs[3].sections[0].bullets[5] |
| 88 | number | "at −20 °C nightly" | cold forecast example assumes −20 °C | covered @ page.blocks[0].tabs[3].sections[0].bullets[6] |
| 89 | number | "−20 °C nightly" | cold forecast example applies nightly | covered @ page.blocks[0].tabs[3].sections[0].bullets[6] |
| 90 | number | "forecast 24 → 19 months" | cold forecast falls to 19 months | covered @ page.blocks[0].tabs[3].sections[0].bullets[6] |
| 91 | number | "dead below −10 °C" | alkaline cells are dead below −10 °C | covered @ page.blocks[0].tabs[3].sections[0].bullets[7] |
| 92 | number | "`1847`" | clip-chunk sample sequence is 1847 | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[2].v |
| 93 | number | "`1024`" | clip-chunk sample payload length is 1024 bytes | covered @ page.blocks[0].tabs[2].sections[0].contract.fields[4].v |
| 94 | number | "`12000`" | wake-receipt sample recording duration is 12000 ms | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[2].v |
| 95 | number | "`8200`" | wake-receipt sample radio session duration is 8200 ms | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[4].v |
| 96 | number | "`81`" | wake-receipt sample post-event battery level is 81% | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[7].v |
| 97 | number | "stage up to 3 clips" | cameras stage at most three clips during a Loft outage | covered @ page.blocks[0].tabs[1].sections[0].bullets[8] |
| 98 | number | "after 5 missed Loft heartbeats" | Roost marks a site offline after five missed Loft heartbeats | covered @ page.blocks[0].tabs[1].sections[0].bullets[8] |
| 99 | number | "at 20%" | 20% battery disables live view | covered @ page.blocks[0].tabs[0].sections[0].bullets[15] |
| 100 | number | "at 8%" | 8% battery caps clips and changes check-in cadence | covered @ page.blocks[0].tabs[0].sections[0].bullets[15] |
| 101 | number | "clips cap at 5 s" | 8% battery caps clips at five seconds | covered @ page.blocks[0].tabs[0].sections[0].bullets[15] |
| 102 | number | "check-ins go daily" | 8% battery changes check-ins to a daily cadence | covered @ page.blocks[0].tabs[0].sections[0].bullets[15] |
| 103 | number | "at 3%" | 3% battery leaves PIR text events only | covered @ page.blocks[0].tabs[0].sections[0].bullets[15] |
| 104 | permalink | "twig/src/wake.c#L52" | Twig wake implementation → https://github.com/wrenlight/perch-firmware/blob/main/twig/src/wake.c#L52 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.twig.link |
| 105 | permalink | "twig/src/qualify.c#L118" | Twig qualification implementation → https://github.com/wrenlight/perch-firmware/blob/main/twig/src/qualify.c#L118 | covered @ page.blocks[0].tabs[0].sections[0].diagram.steps[1].link |
| 106 | permalink | "twig/src/coldprofile.c#L33" | Twig cold-profile implementation → https://github.com/wrenlight/perch-firmware/blob/main/twig/src/coldprofile.c#L33 | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.twig.link |
| 107 | permalink | "twig/rf/mac.c#L207" | TwigLink radio MAC implementation → https://github.com/wrenlight/perch-firmware/blob/main/twig/rf/mac.c#L207 | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.twig.link |
| 108 | permalink | "src/queue/emmc_store.c#L91" | Loft eMMC queue implementation → https://github.com/wrenlight/loft-firmware/blob/main/src/queue/emmc_store.c#L91 | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.loft.link |
| 109 | permalink | "services/roost/supervise.go#L144" | Roost supervision implementation → https://github.com/wrenlight/cloud/blob/main/services/roost/supervise.go#L144 | covered @ page.blocks[0].tabs[1].sections[0].diagram.nodes.roost.link |
| 110 | permalink | "services/granary/ingest.go#L60" | Granary ingest implementation → https://github.com/wrenlight/cloud/blob/main/services/granary/ingest.go#L60 | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.granary.link |
| 111 | permalink | "services/abacus/forecast.go#L76" | Abacus forecast implementation → https://github.com/wrenlight/cloud/blob/main/services/abacus/forecast.go#L76 | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.abacus.link |
| 112 | number | "a `sha256` digest" | upload manifest uses a sha256 digest | covered @ page.blocks[0].tabs[2].sections[1].contract.fields[2].k |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- Unsupported qualification result “real subject” at `page.blocks[0].tabs[0].sections[0].diagram.steps[1].text`; the HLD distinguishes qualified and rejected trips but never identifies a “real subject.”
- Event pre-notice is logged during the rail/boot beat at `page.blocks[0].tabs[0].sections[0].diagram.steps[2].panels.log.log[0].text`; the HLD places it in parallel with recording after the boot step.
- Derived `240 mA` at `page.blocks[0].tabs[0].sections[0].diagram.steps[3].panels.log.log[0].text`; the HLD states 180 mA recording and an added 60 mA of night IR but never states the summed value.
- Unsupported `int` service-call protocol on PIR→Twig at `page.blocks[0].tabs[0].sections[0].diagram.edges[0].kind`; the HLD states the wake action but not this mechanism.
- Unsupported `int` service-call protocol on Twig→Bough at `page.blocks[0].tabs[0].sections[0].diagram.edges[1].kind`; the HLD names a power rail, not a service call.
- Unsupported `int` service-call protocol on Bough→Twig at `page.blocks[0].tabs[0].sections[0].diagram.edges[2].kind`; the HLD says Bough hands the clip to Twig but gives no mechanism.
- Unsupported `https` protocol on Loft→Abacus at `page.blocks[0].tabs[0].sections[0].diagram.edges[4].kind`; the HLD gives the receipt path but not its transport.
- Unsupported direct Abacus→Owner phone hop and `https` protocol at `page.blocks[0].tabs[0].sections[0].diagram.edges[5]`; the HLD says the app graph updates but names neither this direct hop nor HTTPS.
- Unstated “Owner phone” component at `page.blocks[0].tabs[0].sections[0].diagram.nodes.phone`, `page.blocks[0].tabs[1].sections[0].diagram.nodes.phone`, `page.blocks[0].tabs[2].sections[0].diagram.nodes.phone`, and `page.blocks[0].tabs[3].sections[0].diagram.nodes.phone`; the HLD names an app and push notifications, not an owner-phone component.
- Derived claim that TwigLink “is not persistent” at `page.blocks[0].tabs[1].sections[0].text[0]`; the HLD describes sessions and periodic check-ins but does not state this property.
- Derived claim that Molt is “the service behind the firmware offer flag” at `page.blocks[0].tabs[1].sections[0].bullets[1]`; the HLD separately names the flag and Molt’s staging behavior without making that association.
- Derived “site-wide failure, distinct from a single camera” comparison at `page.blocks[0].tabs[1].sections[0].bullets[8]`; the HLD states the site-offline and camera-UNSUPERVISED behaviors separately but not this comparison.
- Unsupported `ack: no flags` at `page.blocks[0].tabs[1].sections[0].diagram.steps[1].panels.log.log[0].text`; the HLD lists possible pending flags but does not state that this ack has none.
- Premature `staged=2` at `page.blocks[0].tabs[1].sections[0].diagram.steps[3].panels.log.log[0].text`; the HLD first gives that exact count in the later link-return check-in.
- Wrong `https` protocol on Loft→Roost at `page.blocks[0].tabs[1].sections[0].diagram.edges[2].kind`; the HLD specifies one outbound persistent TLS channel.
- Unsupported `int` service-call protocol on Roost→Flitter at `page.blocks[0].tabs[1].sections[0].diagram.edges[3].kind`; the HLD states the notification action but not this mechanism.
- Unsupported direct Flitter→Owner phone hop and `https` protocol at `page.blocks[0].tabs[1].sections[0].diagram.edges[4]`; the HLD does not name that endpoint or transport.
- Unjustified signal-bar quantities in `page.blocks[0].tabs[1].sections[0].diagram.panels[0].initial`, `page.blocks[0].tabs[1].sections[0].diagram.steps[0].panels.rf.cam.bars`, `page.blocks[0].tabs[1].sections[0].diagram.steps[2].panels.rf.cam.bars`, and `page.blocks[0].tabs[1].sections[0].diagram.steps[6].panels.rf.cam.bars`; the HLD supplies no bar or RSSI values.
- Derived claim that the radio and Wi-Fi uplinks “can fail independently” at `page.blocks[0].tabs[2].sections[0].text[0]`; the HLD describes their separate failure behaviors but does not state independence.
- Wrong `https` protocol on Loft→Granary at `page.blocks[0].tabs[2].sections[0].diagram.edges[2].kind`; the HLD states house Wi-Fi TLS, not HTTP/HTTPS.
- Unsupported `int` service-call protocol on Granary→Flitter at `page.blocks[0].tabs[2].sections[0].diagram.edges[3].kind`; the HLD states that Granary triggers Flitter but gives no mechanism.
- Unsupported direct Flitter→Owner phone hop and `https` protocol at `page.blocks[0].tabs[2].sections[0].diagram.edges[4]`; the HLD does not name that endpoint or transport.
- Unjustified signal-bar quantities in `page.blocks[0].tabs[2].sections[0].diagram.panels[1].initial`, `page.blocks[0].tabs[2].sections[0].diagram.steps[0].panels.rf.cam.bars`, `page.blocks[0].tabs[2].sections[0].diagram.steps[4].panels.rf.wan.bars`, and `page.blocks[0].tabs[2].sections[0].diagram.steps[5].panels.rf.wan.bars`; the HLD supplies link states but no bar scale or bar values.
- Unjustified whole-queue `empty` initial state at `page.blocks[0].tabs[2].sections[0].diagram.panels[0].initial.state`; the HLD never says the Loft queue starts empty.
- Unjustified exact `repair round 1` at `page.blocks[0].tabs[2].sections[0].diagram.steps[2].panels.log.log[0].text`; the HLD gives only an upper bound of three repair rounds.
- Unjustified `drain 1/1` queue count at `page.blocks[0].tabs[2].sections[0].diagram.steps[5].panels.log.log[0].text`; the HLD gives no queue-entry count.
- Unjustified whole-queue `empty` final state at `page.blocks[0].tabs[2].sections[0].diagram.steps[6].panels.mbx.state`; the HLD says the uploaded entry flips state, not that the whole queue empties.
- Unsupported attribution of digest verification to Granary at `page.blocks[0].tabs[2].sections[0].diagram.steps[6].nodes`, `page.blocks[0].tabs[2].sections[0].diagram.steps[6].text`, and `page.blocks[0].tabs[2].sections[0].diagram.steps[6].panels.log.log[0].text`; the HLD says the Loft assembles the clip and computes its digest, and does not assign a later check to Granary.
- Unsupported “not lost” guarantee at `page.blocks[0].tabs[2].sections[0].diagram.steps[7].panels.log.log[0].text`; the HLD says pushes arrive late but does not state a no-loss guarantee.
- Unjustified `PC-2214` sample on the upload manifest at `page.blocks[0].tabs[2].sections[1].contract.fields[1].v`; the HLD supplies that sample for the TwigLink chunk contract, not for the manifest field list.
- Unsupported Sunrail→Twig `int` service-call edge and “hold” message at `page.blocks[0].tabs[3].sections[0].diagram.edges[2]`; the HLD states rail trickle and charge suspension but no such service call or message.
- Unsupported `https` protocol on Loft→Abacus at `page.blocks[0].tabs[3].sections[0].diagram.edges[3].kind`; the wake-receipt path supports the hop, but the HLD gives no transport.
- Unsupported direct Abacus→Owner phone hop and `https` protocol at `page.blocks[0].tabs[3].sections[0].diagram.edges[4]`; the HLD states an app forecast but not this endpoint or transport.
- Derived `−5 mo` arithmetic at `page.blocks[0].tabs[3].sections[0].diagram.edges[4].label`; the HLD states 24 → 19 months but never states the subtraction.
- Invented transition into an actual `DEEP-COLD` state at `page.blocks[0].tabs[3].sections[0].diagram.steps[7]`; the HLD states a below −30 °C refusal threshold but does not say the −24 °C flow later crosses it or names that state.
