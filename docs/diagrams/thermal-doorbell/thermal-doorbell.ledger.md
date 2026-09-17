# Coverage ledger — Thermal doorbell
source: docs/hlds/thermal-doorbell.md | version: 1 | updated: 09-17-2026 09:55

| # | class | HLD anchor | fact | state |
|---|---|---|---|---|
| 1 | flow | "both views follow the same full timeline" | One shared registry; Home and Data flow perspectives | covered @ diagram.steps, paths, sectionLayout |
| 2 | number | "cold critical at -15°C" | Illustrative device-body thresholds and safe interval | covered @ panels[temp] |
| 3 | number | "below 40°C" | Explicit restart gates differ from warning thresholds | covered @ steps[hot-safe,cold-safe] |
| 4 | number | "battery 82%" | Demonstration charge is held constant | covered @ panels[battery].initial |
| 5 | service | "always-on Controller" | Separate camera and health power domains | covered @ diagram.nodes and panels[home].devices |
| 6 | contract | "uses an internal control link" | Internal control, MQTT health, HTTPS clip/notice hops | covered @ diagram.edges |
| 7 | flow | "Cloud services on the Home map" | Cloud marker is a labeled summary of declared services | covered @ panels[home].devices[cloud] |
| 8 | failure | "no recording or clip upload occurs" | Protective shutdown suppresses capture; upload is not sent | covered @ steps[hot-missed,cold-missed] |
| 9 | flow | "Heat waves and frost are symbolic overlays" | Thermal appearance persists independently of operating state | covered @ Home cam state/thermal patches |
| 10 | flow | "unavailable screen gives the reason" | No live scene while camera is unavailable | covered @ screen mode/reason patches |
| 11 | flow | "earlier temperature notification remains" | Notifications carry; no recovery message or retroactive clip | covered @ phone patches and branch endpoints |

| 12 | service | "Controller" | Controller | covered @ diagram.nodes.controller |
| 13 | service | "Camera" | Camera | covered @ diagram.nodes.camera |
| 14 | service | "Health Service" | Health Service | covered @ diagram.nodes.health |
| 15 | service | "Clip Service" | Clip Service | covered @ diagram.nodes.clips |
| 16 | service | "Notifications" | Notifications | covered @ diagram.nodes.notify |
| 17 | service | "Resident Phone" | Resident Phone | covered @ diagram.nodes.phone |
| 18 | number | "cold critical at -15°C" | lowCrit = -15°C | covered @ panels[temp].lowCrit |
| 19 | number | "at 0°C" | lowWarn = 0°C | covered @ panels[temp].lowWarn |
| 20 | number | "hot warning at 50°C" | warn = 50°C | covered @ panels[temp].warn |
| 21 | number | "hot critical at 65°C" | crit = 65°C | covered @ panels[temp].crit |
| 22 | number | "-30°C" | min = -30°C | covered @ panels[temp].min |
| 23 | number | "90°C" | max = 90°C | covered @ panels[temp].max |
| 24 | number | "22°C" | ready: device body 22°C | covered @ panels[temp].initial |
| 25 | number | "24°C" | approach: device body 24°C | covered @ steps[approach].panels.temp |
| 26 | number | "55°C" | hot-warning: device body 55°C | covered @ steps[hot-warning].panels.temp |
| 27 | number | "70°C" | hot-shutdown: device body 70°C | covered @ steps[hot-shutdown].panels.temp |
| 28 | number | "35°C" | hot-safe: device body 35°C | covered @ steps[hot-safe].panels.temp |
| 29 | number | "-5°C" | cold-warning: device body -5°C | covered @ steps[cold-warning].panels.temp |
| 30 | number | "-18°C" | cold-shutdown: device body -18°C | covered @ steps[cold-shutdown].panels.temp |
| 31 | number | "3°C" | cold-cooling: device body 3°C | covered @ steps[cold-cooling].panels.temp |
| 32 | number | "8°C" | cold-safe: device body 8°C | covered @ steps[cold-safe].panels.temp |
| 33 | number | "above 5°C" | Cold restart gate is above 5°C | covered @ steps[cold-cooling,cold-safe] |
| 34 | flow | "The resident opens the door" | Happy path records, saves, notifies and admits the visitor | covered @ paths[happy] |
| 35 | failure | "Camera remains active with reduced video capability" | Hot warning reduces video before shutdown | covered @ steps[hot-warning] |
| 36 | failure | "Charging pauses; Camera remains active" | Cold warning suspends charging independently of capture | covered @ steps[cold-warning] |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|---|---|---|---|---|
| A1 | Add thermal visualization and a mock flow? | “yes let’s add all of that and then show me a mockup of a diagram flow” | 09-17-2026 | Proposed source design and complete spec | active |

## Storyboard
| step ID | actor/action | incoming state | visible outcome | evidence |
|---|---|---|---|---|
| ready | The porch is quiet. Camera and health telemetry are available; the device reads 22°C. | Prior beat on selected path | Controller active | Normal operation |
| approach | A visitor approaches the working doorbell. The device stays in the safe interval. | Prior beat on selected path | temp, home, screen, cap | Normal operation |
| record | The visitor presses the button. Controller requests recording; Camera begins capturing the visit. | Prior beat on selected path | home, screen, cap | Normal operation |
| upload | Recording ends. Camera uploads the saved clip to Clip Service. | Prior beat on selected path | home, screen, cap | Normal operation |
| notify | Clip Service requests a notice; the resident receives “Visitor at the front door.” | Prior beat on selected path | phone, home, cap | Normal operation |
| welcome | The resident opens the door and welcomes the visitor. The saved clip remains available. | Prior beat on selected path | home, cap | Normal operation |
| hot-warning | At 55°C Camera reduces video capability while staying active. | Prior beat on selected path | temp, home, battery, cap | Overheating alternate |
| hot-shutdown | At 70°C Controller disables Camera. Health telemetry stays connected; charging is paused. | Prior beat on selected path | temp, home, screen, battery, cap | Overheating alternate |
| hot-report | Controller reports thermal protection to Health Service over MQTT; the camera remains off. | Prior beat on selected path | home | Overheating alternate |
| hot-notify | Health Service requests a notice. The resident learns that the camera is too hot. | Prior beat on selected path | home, phone | Overheating alternate |
| hot-missed | A visitor presses the button. Controller refuses capture while Camera is off: no recording and no clip upload. | Prior beat on selected path | home, cap | Overheating alternate |
| hot-cooling | The reading falls to 55°C. Camera stays off while the device continues cooling. | Prior beat on selected path | cap, battery, temp, home, screen | Overheating alternate |
| hot-safe | At 35°C the restart gate is satisfied. Camera remains off until Controller starts it. | Prior beat on selected path | cap, temp, home, screen | Overheating alternate |
| hot-boot | Controller powers Camera up. It boots while the unrecorded visitor leaves. | Prior beat on selected path | home, screen, cap | Overheating alternate |
| hot-restored | Camera is active and charging resumes. The missed visit remains missed; no retroactive clip or recovery notice appears. | Prior beat on selected path | home, screen, battery, cap | Overheating alternate |
| cold-warning | At -5°C charging pauses, while Camera remains active. | Prior beat on selected path | temp, home, battery, cap | Cold-weather alternate |
| cold-shutdown | At -18°C Controller disables Camera. Health telemetry stays connected; charging is paused. | Prior beat on selected path | temp, home, screen, battery, cap | Cold-weather alternate |
| cold-report | Controller reports thermal protection to Health Service over MQTT; the camera remains off. | Prior beat on selected path | home | Cold-weather alternate |
| cold-notify | Health Service requests a notice. The resident learns that the camera is too cold. | Prior beat on selected path | home, phone | Cold-weather alternate |
| cold-missed | A visitor presses the button. Controller refuses capture while Camera is off: no recording and no clip upload. | Prior beat on selected path | home, cap | Cold-weather alternate |
| cold-cooling | The reading is 3°C: nominal on the gauge, but still below the above-5°C restart gate. | Prior beat on selected path | cap, battery, temp, home, screen | Cold-weather alternate |
| cold-safe | At 8°C the restart gate is satisfied. Camera remains off until Controller starts it. | Prior beat on selected path | cap, temp, home, screen | Cold-weather alternate |
| cold-boot | Controller powers Camera up. It boots while the unrecorded visitor leaves. | Prior beat on selected path | home, screen, cap | Cold-weather alternate |
| cold-restored | Camera is active and charging resumes. The missed visit remains missed; no retroactive clip or recovery notice appears. | Prior beat on selected path | home, screen, battery, cap | Cold-weather alternate |

## Branch table
| path | shared prefix | first different beat | ending |
|---|---|---|---|
| happy | ready | approach (2) | welcome (6) |
| hot | ready | hot-warning (2) | hot-restored (10), missed visit retained |
| cold | ready | cold-warning (2) | cold-restored (10), missed visit retained |

## Motion and evidence checks
- Normal: approach, record, upload, notification, resident movement, open door and entry. Saved media is labeled.
- Heat: amber waves → stronger hot halo → camera off with heat still visible → cooled state → boot → active.
- Cold: frost while charging pauses → critical frost with Camera off → nominal gauge while still gated → restart.
- The thermal overlay is authored explicitly from source state, not automatically linked to the gauge. Both must agree with this policy.
- Step-local Home signals show real supported telemetry/notice hops. Cold report/delivery beats use node focus and captions on the same topology, avoiding duplicate step coins.
- Alternate paths keep the door closed and the resident inside; Camera unavailable hides the visitor scene.
- No Ring push-notification, threshold, firmware or recovery guarantee is asserted. No code/API URLs or measured timing supplied.

## Checkable expectations
- Temperature changes alone never change Camera mode or charging.
- Hot/cold shutdown endpoints retain their own reason and notice; branch switches cannot borrow another outcome.
- At 3°C on the cold branch the gauge is nominal while Camera stays off.
- A blocked upload is never animated as a successful delivery.
- Restart does not create a clip of an earlier missed visitor.

## Delivery
Built with tools/page_build.py and this directory as OUT; zero errors and warnings. Browser QA visits all 26 beats at 1600, 1080 and 760 CSS pixels (desktop and constrained embed containers), switching Home/Data flow at every beat. Caption bounds and page overflow checked. Visual inspection covers hot/cold shutdown and the complete data topology. Reduced-motion rendering is checked separately from animated heat/frost. New editor attributes and shared initial values are checked with actual gestures and Undo/Redo. These are local renderer checks, not a deployment test in company Confluence or Backstage.

No supplied wire payload schema, code links, API URLs or measured time series are omitted; none was part of this fictional source. Node titles use shorter display names, with full service names preserved in subtitles.
