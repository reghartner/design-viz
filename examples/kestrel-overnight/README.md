# Kestrel overnight — camera screen demo

One night with a Kestrel Porch Cam on battery: a raccoon at 1:04 AM, a
low-battery alert at 4:00 AM, solar charging at sunrise, and a package in the
morning. Two paths: **Normal morning** and **Wi-Fi down at delivery**.

## Provenance

`story.spec.json` and `story.ledger.md` started as exact copies of the agent
project originals in
`/Users/chuck/flowview-bench/tandem-guidance-live-2026-10-01-01/agent-project`.
Only these copies were changed. The originals are untouched.

The change is presentation only. It touches the camera screen panel `pkgclip`
and its step patches, adds one section-text line about illustrative clips, and
updates the stamped `page.flowview` metadata (see **Compatibility**). Steps,
paths, times, graph, bindings, code references, captions, battery/report values
and notifications are unchanged. The ledger records this as D22–D25. Earlier
decisions are under **History (superseded)**.

## Camera screen states

The single screen stays visible on every step of both paths, including the
first step and direct jumps.

| Step | Mode | Clip |
|---|---|---|
| bedtime, lowbatt, sunrise, charging, b-wifi-down | `off` → STANDBY | none (there is no live view) |
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

## Commands

The author of this change has no shell and ran none of these. Results are
recorded by the coordinator. Run them from the repository root after building:

```sh
python3 tools/build.py
node --test tests/compatibility.test.js tests/kestrel-screen.test.js tests/screen-scenes.test.js tests/security-video.test.js
node tools/compatibility.js examples/kestrel-overnight/story.spec.json
npm test --prefix tools/browser-tests -- tests/screen-raccoon.spec.mjs
python3 tools/inject.py examples/kestrel-overnight/story.spec.json template/flowview.html /tmp/kestrel-overnight.html
```

The browser command uses the shared Playwright global setup, which builds every
host fixture first. The smoke itself only needs `template/flowview.html` and
`tools/inject.py`.

## Limitations

- The raccoon and courier timings are illustrative. They do not show the real
  clip length (about 20 s) or system latency.
- An independent review ran `validate` (0 errors, 0 warnings) and `walk`
  (0 warnings, 4 checks) on the version before the 0.2.0 metadata and gait fix.
  They have not been re-run since.
- Viewers built before 0.2.0 cannot render these additions. They can only
  report them, as described above.
