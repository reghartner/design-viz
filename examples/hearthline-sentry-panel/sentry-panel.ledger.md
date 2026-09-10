# Coverage ledger — hearthline Sentry Panel — Monitored Alarm
source: docs/hlds/hearthline-sentry-panel/sentry-panel.md | version: n/a | updated: 09-09-2026 09:21
amendment history starts at this version

| # | class | HLD anchor | fact | state |
|---|-------|------------|------|-------|
| 1 | flow | "Alarm over broadband, cellular failover mid-incident" | alarm signaling starts on broadband, fails over to cellular without losing or double-booking sequenced events, returns center acknowledgment, and probes for fail-back | covered @ page.blocks[0].tabs[0].sections[0] |
| 2 | flow | "Camera-verified dispatch" | camera clip review, agent talk-down, verified dispatch, and owner timeline | covered @ page.blocks[0].tabs[1].sections[0] |
| 3 | flow | "Walk test" | owner starts TEST, exercises the sensor inventory, remediates a failed sensor, exits TEST, lifts suppression, and stores the signed record | covered @ page.blocks[0].tabs[2].sections[0] |
| 4 | flow | "Entry-delay disarm, and the duress variant" | entry-delay code handling branches to normal disarm or a locally identical duress disarm with silent priority dispatch | covered @ page.blocks[0].tabs[3].sections[0] |
| 5 | contract | "Sensor frame (sensor → panel, sub-GHz 915 MHz)" | sensor frame fields: sensor_id, type, state, counter, batt_mv, and rssi | covered @ page.blocks[0].tabs[0].sections[0].contract |
| 6 | contract | "Signaling event (panel → Hearthgate, TLS over broadband or cellular)" | signaling event fields: acct, seq, event, zone, path, flags, and hmac | covered @ page.blocks[0].tabs[0].sections[1].contract |
| 7 | failure | "Broadband drops" | ack supervision triggers cellular failover and sequence dedupe makes the switch invisible to Register | covered @ page.blocks[0].tabs[0].sections[0].bullets[9] |
| 8 | failure | "Power fails" | the backup pack sustains the alarm core and on-demand LTE while wifi and camera liaison shed | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 9 | failure | "Both uplinks down" | local siren and alarm state persist while sequenced events queue in flash and flush in order on restore | covered @ page.blocks[0].tabs[0].sections[0].bullets[10] |
| 10 | failure | "Sensor battery low" | batt_mv supervision causes chirps and app nags, and silence across supervisory windows marks a sensor unsupervised | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 11 | failure | "Hearthgate region down" | panels retry the DNS-steered alternate region endpoint | covered @ page.blocks[0].tabs[4].sections[0].bullets[1] |
| 12 | failure | "Agent overload" | Overwatch queues incidents against SLA clocks and camera verification degrades to unverified dispatch | covered @ page.blocks[0].tabs[4].sections[0].bullets[2] |
| 13 | failure | "Walk test abandoned" | TEST expires automatically and dispatch suppression lifts even if the app session dies | covered @ page.blocks[0].tabs[2].sections[0].bullets[10] |
| 14 | service | "Sentry Panel is hearthline's professionally monitored home alarm" | Sentry Panel base-station component | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.pnl |
| 15 | service | "Ember-M0" | low-power alarm core owning the certified state machine, siren, sub-GHz handling, and event outbox | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.lp |
| 16 | service | "Hearth-A53" | high-power communications side owning wifi, LTE, TLS signaling, and camera liaison | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.hp |
| 17 | service | "Keypad" | sub-GHz keypad providing entry-delay beeps and local alarm-state indications | covered @ page.blocks[0].tabs[3].sections[0].diagram.nodes.kp |
| 18 | service | "Sensor family" | entry, motion, and glassbreak battery sensors participating in alarm and walk-test flows | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes |
| 19 | service | "Sentry Cam" | wifi camera providing verification clips and live talk-down media | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 20 | service | "Hearthgate — signaling ingest" | panel signaling ingest and account/sequence dedupe | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.gh |
| 21 | service | "Register — append-only alarm event journal" | append-only incident timeline journal | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.ldg |
| 22 | service | "Overwatch — monitoring-center core" | incident opening, agent assignment, acknowledgments, SLA clocks, and test suppression | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.vg |
| 23 | service | "Guardline — agent console backend" | agent console clip-review queue and live talk-down relay | covered @ page.blocks[0].tabs[1].sections[0].bullets[2] |
| 24 | service | "Clipline — clip store" | verification clip upload and incident attachment | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 25 | service | "Summons — dispatch bridge" | verified and priority dispatch bridge to regional emergency-services gateways | covered @ page.blocks[0].tabs[1].sections[0].bullets[6] |
| 26 | service | "Roster — account/device registry" | registry for sensor inventory, zone configuration, and walk-test records | covered @ page.blocks[0].tabs[2].sections[0].diagram.nodes.rs |
| 27 | service | "Beacon — owner push notifications" | owner timeline pushes with duress suppression | covered @ page.blocks[0].tabs[1].sections[0].bullets[7] |
| 28 | service | "Countersign — auth" | panel certificates, agent SSO, and keypad code policy including duress codes | covered @ page.blocks[0].tabs[3].sections[0].bullets[9] |
| 29 | service | "Glassbreak sensor GB-2" | the named glassbreak sensor originating the alarm flow | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.gb |
| 30 | number | "915 MHz sub-GHz transceiver" | sub-GHz radio frequency is 915 MHz | covered @ page.blocks[0].tabs[0].sections[0].contract.title |
| 31 | number | "runs 24 h on the backup pack alone" | backup-pack runtime is 24 h | covered @ page.blocks[0].tabs[4].sections[0].bullets[0] |
| 32 | number | "Radios: 2.4/5 GHz wifi" | wifi supports the 2.4 GHz band | uncovered |
| 33 | number | "Radios: 2.4/5 GHz wifi" | wifi supports the 5 GHz band | uncovered |
| 34 | number | "mains + 4×AA NiMH backup" | backup pack contains 4 AA NiMH cells | uncovered |
| 35 | number | "95 dB siren" | siren output is 95 dB | uncovered |
| 36 | number | "supervisory beacon every 12 minutes" | sensor supervisory interval is 12 minutes | uncovered |
| 37 | number | "signal seq 4181" | the alarm signal uses sequence value 4181 | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 38 | number | "alarm, zone 3" | the alarm signal and glassbreak sensor use zone 3 | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 39 | number | "acks it within 2 seconds" | broadband acknowledgment arrives within 2 seconds | covered @ page.blocks[0].tabs[0].sections[0].bullets[2] |
| 40 | number | "incident INC-7731" | the alarm and verification flows use incident identifier INC-7731 | covered @ page.blocks[0].tabs[0].sections[0].bullets[3] |
| 41 | number | "sends seq 4182" | the siren-on signal and signaling-contract sample use sequence value 4182 | covered @ page.blocks[0].tabs[0].sections[1].contract.fields[1] |
| 42 | number | "15-second ack supervision timer" | missing-ack supervision interval is 15 seconds | covered @ page.blocks[0].tabs[0].sections[0].bullets[5] |
| 43 | number | "continues with seq 4183" | cellular continuation uses sequence value 4183 | covered @ page.blocks[0].tabs[0].sections[0].bullets[6] |
| 44 | number | "uploads a 30-second clip" | verification clip duration is 30 seconds | covered @ page.blocks[0].tabs[1].sections[0].bullets[0] |
| 45 | number | "after two attempts" | the basement sensor is marked failed after two attempts | covered @ page.blocks[0].tabs[2].sections[0].bullets[4] |
| 46 | number | "last supervisory 3 days ago" | the failed basement sensor's last supervision was 3 days earlier | covered @ page.blocks[0].tabs[2].sections[0].bullets[4] |
| 47 | number | "starts the 30-second entry delay" | armed-away entry delay lasts 30 seconds | covered @ page.blocks[0].tabs[3].sections[0].bullets[0] |
| 48 | number | "keys a 4-digit code" | keypad disarm and duress codes contain 4 digits | covered @ page.blocks[0].tabs[3].sections[0].bullets[2] |
| 49 | number | "`flags.duress=1`" | duress flag value is 1 | covered @ page.blocks[0].tabs[3].sections[0].bullets[5] |
| 50 | number | "`0x3F82A1`" | sensor_id sample value is 0x3F82A1 | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[0].v |
| 51 | number | "`0x00B4`" | rolling counter sample value is 0x00B4 | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[3].v |
| 52 | number | "`2810`" | batt_mv sample value is 2810 mV | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[4].v |
| 53 | number | "below 2600 flags low battery" | low-battery threshold is 2600 mV | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[4].g |
| 54 | number | "`-71`" | rssi sample value is -71 | covered @ page.blocks[0].tabs[0].sections[0].contract.fields[5].v |
| 55 | number | "`HL-55021`" | signaling sample account identifier is HL-55021 | covered @ page.blocks[0].tabs[0].sections[1].contract.fields[0].v |
| 56 | number | "`9f31…`" | signaling sample hmac is 9f31… | covered @ page.blocks[0].tabs[0].sections[1].contract.fields[6].v |
| 57 | number | "past 3 supervisory windows" | silence threshold is 3 supervisory windows | covered @ page.blocks[0].tabs[2].sections[0].bullets[9] |
| 58 | number | "auto-expires after 60 minutes" | abandoned TEST timeout is 60 minutes | covered @ page.blocks[0].tabs[2].sections[0].bullets[10] |
| 59 | permalink | "https://github.com/hearthline/panel-fw/blob/main/ember/state_machine.c#L88" | Ember-M0 state-machine implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.lp.link |
| 60 | permalink | "https://github.com/hearthline/panel-fw/blob/main/hearth/uplink_super.c#L141" | Hearth-A53 uplink-supervision implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.hp.link |
| 61 | permalink | "https://github.com/hearthline/monitor-core/blob/main/hearthgate/ingest.go#L204" | Hearthgate ingest implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.gh.link |
| 62 | permalink | "https://github.com/hearthline/monitor-core/blob/main/overwatch/incident.go#L96" | Overwatch incident implementation link | covered @ page.blocks[0].tabs[0].sections[0].diagram.nodes.vg.link |
| 63 | permalink | "https://github.com/hearthline/monitor-core/blob/main/countersign/codes.go#L57" | Countersign code-policy implementation link | covered @ page.blocks[0].tabs[3].sections[0].bullets[9] |
| 64 | permalink | "https://github.com/hearthline/panel-fw/blob/main/ember/subghz_frame.h#L23" | sensor-frame wire-format link | covered @ page.blocks[0].tabs[0].sections[0].contract.source |
| 65 | permalink | "https://github.com/hearthline/monitor-core/blob/main/hearthgate/envelope.go#L61" | signaling-envelope wire-format link | covered @ page.blocks[0].tabs[0].sections[1].contract.source |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|

## Flags (operator review)
- Ledger row 32 is uncovered: the HLD's 2.4 GHz wifi band is absent from the spec.
- Ledger row 33 is uncovered: the HLD's 5 GHz wifi band is absent from the spec.
- Ledger row 34 is uncovered: the HLD's 4×AA NiMH backup-pack count is absent from the spec.
- Ledger row 35 is uncovered: the HLD's 95 dB siren output is absent from the spec.
- Ledger row 36 is uncovered: the HLD's 12-minute sensor supervisory interval is absent from the spec.
- The `Home ISP` intermediary is not named or described by the HLD; it sits at page.blocks[0].tabs[0].sections[0].diagram.nodes.isp.
- The `int` mechanism for the Ember-M0→Hearth-A53 handoff is not stated by the HLD; it sits at page.blocks[0].tabs[0].sections[0].diagram.edges[1].kind.
- The `https` mechanism for Hearth-A53→Home ISP is more specific than the HLD's broadband TLS statement; it sits at page.blocks[0].tabs[0].sections[0].diagram.edges[2].kind.
- The `https` mechanism for Home ISP→Hearthgate is more specific than the HLD's broadband TLS statement; it sits at page.blocks[0].tabs[0].sections[0].diagram.edges[3].kind.
- The `int` mechanism for Hearthgate→Register append is not stated by the HLD; it sits at page.blocks[0].tabs[0].sections[0].diagram.edges[8].kind.
- The `int` mechanism for Hearthgate→Overwatch forwarding is not stated by the HLD; it sits at page.blocks[0].tabs[0].sections[0].diagram.edges[9].kind.
- The `int` mechanism for Overwatch→Guardline agent assignment is not stated by the HLD; it sits at page.blocks[0].tabs[0].sections[0].diagram.edges[10].kind.
- `ARMED_AWAY` as the alarm board's initial state is not stated for the broadband-failover flow; it sits at page.blocks[0].tabs[0].sections[0].diagram.panels[0].initial.state.
- Cellular starting in `lost` state is not stated by the HLD; it sits at page.blocks[0].tabs[0].sections[0].diagram.panels[1].initial.cell.state.
- The panel outbox starting `empty` is not stated by the HLD; it sits at page.blocks[0].tabs[0].sections[0].diagram.panels[2].initial.state.
- `Owner phone` as the carrier of the walk-test app is not stated by the HLD; it sits at page.blocks[0].tabs[2].sections[0].diagram.nodes.ph.
- The `https` mechanism for Owner phone→Roster is not stated by the HLD; it sits at page.blocks[0].tabs[2].sections[0].diagram.edges[0].kind.
- The `https` mechanism for Roster→Sentry Panel is not stated by the HLD; it sits at page.blocks[0].tabs[2].sections[0].diagram.edges[1].kind.
- A direct Roster→Overwatch suppression edge and its `int` mechanism are not stated by the HLD; they sit at page.blocks[0].tabs[2].sections[0].diagram.edges[2].
- The `https` mechanism for Sentry Panel→Roster results is not stated by the HLD; it sits at page.blocks[0].tabs[2].sections[0].diagram.edges[6].kind.
- The `https` mechanism for Sentry Panel→Hearthgate test completion is more specific than the HLD's panel signaling description; it sits at page.blocks[0].tabs[2].sections[0].diagram.edges[7].kind.
- The `int` mechanism for Hearthgate→Overwatch suppression lift is not stated by the HLD; it sits at page.blocks[0].tabs[2].sections[0].diagram.edges[8].kind.
- All three walk-test inventory tiles starting `untested` is not stated by the HLD; it sits at page.blocks[0].tabs[2].sections[0].diagram.panels[0].initial.
- `DISARMED` as the walk-test board's initial panel mode is not stated by the HLD; it sits at page.blocks[0].tabs[2].sections[0].diagram.panels[1].initial.state.
- The `int` mechanism for Ember-M0→Hearth-A53 in the duress flow is not stated by the HLD; it sits at page.blocks[0].tabs[3].sections[0].diagram.edges[3].kind.
- The `https` mechanism for Hearth-A53→Hearthgate duress signaling is more specific than the HLD's TLS signaling description; it sits at page.blocks[0].tabs[3].sections[0].diagram.edges[4].kind.
- The `int` mechanism for Hearthgate→Overwatch silent-incident delivery is not stated by the HLD; it sits at page.blocks[0].tabs[3].sections[0].diagram.edges[5].kind.
- The `int` mechanism for Overwatch→agent-console routing is not stated by the HLD; it sits at page.blocks[0].tabs[3].sections[0].diagram.edges[6].kind.
- The agent-console→Overwatch dispatch-request route and its `int` mechanism are not stated in the duress flow; they sit at page.blocks[0].tabs[3].sections[0].diagram.edges[7].
- The Overwatch→Summons priority-dispatch route and its `int` mechanism are not stated in the duress flow; they sit at page.blocks[0].tabs[3].sections[0].diagram.edges[8].
- The owner-push suppression step highlights Overwatch even though the HLD assigns suppression to Beacon; the unsupported node attribution sits at page.blocks[0].tabs[3].sections[0].diagram.steps[7].nodes.
- The numeric claim `three boards above` describes page structure rather than an HLD fact and has no ledger row; it sits at page.blocks[0].tabs[4].sections[0].text[0].
