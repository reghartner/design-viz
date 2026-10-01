# Kestrel overnight — camera screen demo

One night with a Kestrel Porch Cam on battery: a raccoon at 1:04 AM, a
low-battery alert at 4:00 AM, solar charging at sunrise, and a package in the
morning. Two paths: **Normal morning** and **Wi-Fi down at delivery**.

## Provenance

`story.spec.json` and `story.ledger.md` started as exact copies of the agent
project originals in
`/Users/chuck/flowview-bench/tandem-guidance-live-2026-10-01-01/agent-project`.
Only these copies were changed. The originals are untouched.

The changes are presentation only:

- the camera screen panel `pkgclip` and its step patches;
- one section-text line about illustrative clips and continuous sensing;
- the stamped `page.flowview` metadata (see **Compatibility**);
- continuous motion sensing on the Home map, with three detection beats
  inserted before the recording steps.

Graph, bindings, code references, battery/report values, notifications and the
original time anchors are unchanged. The ledger records these as D22–D26.
Earlier decisions are under **History (superseded)**.

## Continuous motion sensing, detect before record

The Home map camera stands for the camera's independent motion sensor. Its
cone and sweep stay on for every step of both paths: `scan` while watching,
`detect` when motion is noticed, `rec` while recording, then back to `scan`.
Continuous sensing is not continuous recording. The screen shows STANDBY
whenever nothing is being recorded, saved or played.

Each event is now split in two:

| Detection beat (new) | Next step (recording starts) | Paths | Time |
|---|---|---|---|
| `raccoon-detected` | `raccoon` | both | 1:04 AM |
| `a-motion-detected` | `a-courier` | normal | 8:12 AM |
| `b-motion-detected` | `b-courier` | wifi-down | 8:12 AM |

- **Detection beats are local.** They light only the camera node and have no
  edges, failures, alerts or battery debit. The raccoon or courier is shown,
  and the screen stays STANDBY. The package appears only on the recording
  step, which also takes the single 1% package drain.
- **Some patches moved earlier with the same values,** so the first 1:04 or
  8:12 beat never shows a computed overnight charge or an older report. The
  overnight `charge: null` and the app's 1:00 AM report moved to
  `raccoon-detected`, and the 8:00 AM report moved to `a-motion-detected`.
- **Old step IDs are kept,** so existing deep links still land on the
  recording steps.

## Camera screen states

The single screen stays visible on every step of both paths, including the
first step and direct jumps.

| Step | Mode | Clip |
|---|---|---|
| bedtime, raccoon-detected, lowbatt, sunrise, charging, a-motion-detected, b-wifi-down, b-motion-detected | `off` → STANDBY | none (there is no live view) |
| raccoon | `rec` → REC | `raccoon-at-night` (per-state `scene` override) |
| raccoon-saved | `save` "Animal clip saved · no alert" | raccoon clip continues |
| a-courier, b-courier | `rec` → REC | `scene: null` → declared `package-drop` |
| a-upload, b-reconnect | `save` "Package clip uploaded" | package clip |
| b-retry | `save` "Clip on memory card · Wi-Fi down" | package clip |
| a-alert, b-late-alert | `off` → STANDBY | none |
| a-open (normal only) | `playing` → PLAYING, title "Package clip, 8:12 AM" | package clip replays |

- `mode: "playing"` means a saved clip is being played back. It is not live
  view, and it is separate from `scenePlayback`, which only starts or holds the
  illustrated action.
- The wifi-down path has no playback because the source never says the
  resident opens a clip there.
- Clips are **illustrative animated SVG scenes**, not real footage. No video
  files, network requests or generated media are used. With reduced motion or
  in print, each clip shows a still frame. `raccoon-at-night` shows a masked,
  ring-tailed raccoon crossing the night porch. It stops from 35% to 62% of its
  nine-second clip: the body and legs stand still while the head sniffs the mat.

## Compatibility

Playing mode, the per-state `scene` override and the `raccoon-at-night` clip
are Flowview 0.2.0 capabilities. The spec's stamped metadata is:

- `authoredWith` and `minVersion`: `0.2.0`
- new features: `media.screen-playing`, `media.screen-scene-override`,
  `media.scene-raccoon-at-night`, plus `panel.screen`

A 0.1.0 viewer reports these features as missing and shows an upgrade notice
naming 0.2.0. It still renders best-effort: STANDBY at a-open and the declared
package clip at the raccoon step. Specs that use only the older modes and
scenes keep their 0.1.0 minimum. Other archived specs were not re-stamped.
The continuous-sensing refinement uses existing Home map states (`scan`,
`detect`, `rec`) and subjects, so the metadata does not change.

## Commands

The author of this change has no shell and ran none of these. Results are
recorded by the coordinator. Run them from the repository root after building:

```sh
python3 tools/build.py
node --test tests/compatibility.test.js tests/kestrel-screen.test.js tests/screen-scenes.test.js tests/security-video.test.js
node tools/compatibility.js examples/kestrel-overnight/story.spec.json
npm test --prefix tools/browser-tests -- tests/screen-raccoon.spec.mjs -g "continuous motion sensing"
npm test --prefix tools/browser-tests -- tests/screen-raccoon.spec.mjs
python3 tools/inject.py examples/kestrel-overnight/story.spec.json template/flowview.html /tmp/kestrel-overnight.html
```

The browser command uses the shared Playwright global setup, which builds every
host fixture first. The smoke itself only needs `template/flowview.html` and
`tools/inject.py`.

## Limitations

- The raccoon and courier timings are illustrative. They do not show the real
  clip length (about 20 s) or system latency. A detection beat and its
  recording beat share one minute. No delay between them is claimed.
- Under reduced motion the Home sensing cone stays visible, but its sweep line
  is hidden by design.
- An independent review ran `validate` (0 errors, 0 warnings) and `walk`
  (0 warnings, 4 checks) on the version before the 0.2.0 metadata and gait fix.
  They have not been re-run since.
- Viewers built before 0.2.0 cannot render these additions. They can only
  report them, as described above.
