# Panel presentation audit — October 2026

This is a drop-in renderer and catalog refresh. Existing declaration fields, state
folding, insertion templates and authored geometry are preserved. Three optional
camera scene IDs are additive. The picker uses isolated illustrative data; no
sample rooms, activity, or screenshot becomes insertion defaults. Images, scene
art and fonts require no new network dependency.

Workbench/project/document authoring remains desktop-only. Small-width checks
below exercise panels inside a desktop document, not mobile editing.

## Sizing policy

Every panel now declares its native minimum/preferred/maximum width through the
existing `layout.sectionSizing` metadata. The production Explore resize/display
minimum consumes `minWidth`; opening an undersized saved panel clamps only the
displayed geometry, without writing source. A deliberate resize persists its new
width. The Standard layout continues to respect authored tile geometry and uses
internal reflow/scrolling. Preferred/maximum widths remain placement hints, not
new constraints on saved widths.

Compact gauge, battery, temperature, buffer, LEDs, tiles and signal bodies opt
into existing canvas content-fit sizing (480px maximum); charts/maps keep their
aspect policies and dense reports retain scroll regions. Phone/device-app
portraits retain their intrinsic device shape. App screens removes the fixed
390px body minimum and derives its unsized stage from panel width. Saved section
tiles continue to fit the screenshot within their available body.

## Coverage

Native widths are minimum / preferred / maximum pixels. Internal data scrollers
are intentional for dense tables and biological tracks. Scene artwork uses a
physical material/light palette; UI surfaces use the existing skin tokens.

| Panel | Visual change | Scenario | Native widths |
| --- | --- | --- | --- |
| `appscreens` | Panel-relative stage, refined device frame, dedicated local portrait security dashboard preview | Imported app screens; home security dashboard | 230 / 300 / 420 |
| `battery` | Larger tabular charge readout and wrapping status heading | Solar camera charge | 155 / 195 / 420 |
| `budget` | Prominent tabular measurement and clearer threshold track | Detection latency budget | 230 / 310 / 550 |
| `buffer` | Taller segments with clearer write-head separation | Pre-roll recording buffer | 180 / 280 / 600 |
| `cellscene` | Lighter cell boundary and restrained molecule shadows | Cell signaling (biology) | 320 / 560 / 900 |
| `checks` | Separate evidence rows and wrapping check headers | Incident verification gates | 220 / 270 / 500 |
| `chime` | Refined device surface and calmer label rhythm | Doorbell chime | 220 / 300 / 480 |
| `cost` | Route surfaces and component separation; tabular totals | Cloud event processing cost | 420 / 570 / 1000 |
| `data-contract` | Stronger headers, alternating records and distinct highlight reasons | Device event schema | 300 / 540 / 1000 |
| `deviceapp` | Refined hardware frame and card separation; scalable existing phone units | Camera battery and source provenance | 230 / 290 / 364 |
| `dispatch` | Clearer response headline, scene frame and responder cards | Verified incident response | 480 / 610 / 1000 |
| `frames` | Separated track header and roomier codon rows | Reading frames (biology) | 320 / 520 / 1000 |
| `funnel` | Clearer row labels, bar ends and tabular counts | Detection filtering funnel | 240 / 360 / 600 |
| `gauge` | Large measurement readout, clearer unit and thicker track | Camera power draw | 160 / 200 / 420 |
| `grid` | More legible cells, headers and wrapping scale key | Sensor correlation matrix | 240 / 380 / 700 |
| `homemap` | Stronger room boundaries/labels; room-based security preview with active devices | Home entry and camera notification | 230 / 350 / 520 |
| `image` | Refined image corners and caption rhythm | Reference photograph or architecture | 240 / 350 / 600 |
| `inflight` | Taller tracks and operation labels | Concurrent clip uploads | 260 / 400 / 800 |
| `leds` | Individual indicator surfaces and clearer diode sizing | Radio and power state | 150 / 180 / 420 |
| `locus` | Separated heading and clearer feature bands | Gene regions (biology) | 360 / 600 / 1000 |
| `log` | Intrinsic short-log height, alternating event rows, wrapped text | Device event log | 240 / 340 / 700 |
| `orbit` | Wider intrinsic lifecycle drawing and clearer current-state label | Camera lifecycle | 220 / 280 / 420 |
| `phone` | Larger notification text, roomier cards and refined handset | Home security notification | 202 / 210 / 250 |
| `queue` | Clearer held-message slot and bounded message text | Queued camera events | 190 / 250 / 450 |
| `radar` | Refined field border, range rings, track and zone labels; range/approach preview | Motion range and occupancy | 240 / 340 / 600 |
| `reads` | Larger alignment cells, separated header and calmer scroller | Sequence alignment (biology) | 360 / 560 / 1000 |
| `replicas` | Reference summary, stronger values and more track separation | Replicated event history | 280 / 360 / 700 |
| `screen` | Architectural/material/light detail in existing clips; driveway arrival, garage opening and side gate one-shots | Residential security clips | 240 / 310 / 480 |
| `seatmap` | Separated summary metrics and quieter venue field | Venue occupancy | 360 / 560 / 900 |
| `security` | More prominent camera within operator scene and refined surfaces | Monitoring-center review | 480 / 610 / 1000 |
| `sequence` | Separated header and clearer legend swatches | Sequence motifs (biology) | 320 / 520 / 1000 |
| `signal` | Separated, wrapping radio rows and clearer bars | Wi-Fi and cellular signal | 190 / 240 / 450 |
| `state` | Larger current state and stronger selected-chip underline | Armed/live device state | 150 / 180 / 420 |
| `strandscene` | Refined scene corners, callouts and restrained actor shadows | Molecular mechanism (biology) | 320 / 560 / 900 |
| `table` | Alternating record rows and stronger header surface | Device inventory | 260 / 400 / 900 |
| `thermo` | Larger reading and clearer thermal state chip | Camera thermal limit | 190 / 280 / 500 |
| `tiles` | Adaptive card columns, roomier labels and wrapping detail | Device fleet status | 180 / 300 / 600 |
| `timeline` | Clearer labels and current-time marker | Heartbeat and alarm chronology | 300 / 460 / 900 |
| `trace` | Separated metrics and clearer selected operation | Detection pipeline timing | 280 / 380 / 700 |
| `waterfall` | Adaptive label width, taller bars and tabular durations | Clip processing latency | 260 / 380 / 700 |
| `xray` | Roomier nested layers and separated access conclusion | Encrypted clip access | 240 / 340 / 600 |
| `zoneframe` | Porch architecture behind clearer region outlines and high-contrast field labels | Armed/ignored camera regions | 240 / 340 / 600 |

## Verification

The browser audit renders all 42 real modules under all six skins at their own
minimum, 340px and 640px desktop panel widths. It checks outer overflow and
captures catalog contact sheets. Existing App screens, Device app and content
sizing suites cover upload/display behavior and deliberate internal scrolling.
Camera checks exercise every registered scene through modes, retained DOM and
scene override folding. The new clip browser test seeks animation poses, checks
independent waiting/playback while recording, and checks print/reduced-motion
stills. A production Explore test covers an undersized saved camera and explicit
resize persistence without an automatic source edit.

Visual review artifacts are kept in `scratch/panel-refresh/captures/` locally,
not shipped. No external media was introduced. Long data remains scrollable;
this refresh does not repack previously authored Standard-layout tiles.
