# Device app: data tiles, notifications and optional sources

Use `deviceapp` for data tiles and notifications together in a device-details
phone. Add source mappings only when explaining the backend is part of the story.
Use `phone` for a compact notification-only lock screen or two-way audio, and
`screen` for camera clips.

## A phone without the source explanation

New Device app panels start source-free. Omit `sources` and each field's `source`
to show plain data tiles. To hide the source map on an existing panel while
retaining its mappings, set `showSources:false`. The workbench panel inspector
has **Show data sources → Automatic / Show / Hide**. Automatic shows the map
only when sources exist; Show also needs at least one source. No source API is
called. Notes stay visible inside the app when the map is hidden.

Notifications use the same operations as the `phone` panel. This step patch
adds a notification and updates a tile independently:

```
{
  "panels": {
    "app": {
      "notify": {"app":"Homestead", "title":"Doorbell pressed", "text":"Someone is at the front door."},
      "battery": {"value":68, "status":"ready"}
    }
  }
}
```

A notification never changes data tiles implicitly. `clear:true` dismisses the
notification stack while keeping the tiles. `notify` can be an array; up to three
cards are shown with a count for the rest. Both initial state and steps accept
these operations. `notify`, `clear` and `notifications` are reserved field IDs;
use descriptive tile IDs instead. Empty `fields` is supported for a notification-only
device app. The [plain app example](../examples/device-app-notifications/device-app-notifications.spec.json)
shows a button press, recording update, and dismissal without any source mapping.


The complete [doorbell example](../src/starters/device-app-sources.json) is also
available from welcome under **Start new project → Behind the app**. Its APIs
and values are fictional. Replace those assumptions with company evidence for a real flow.
`tests/deviceapp.test.js` validates the starter and checks both paths.

## Storyboard

| Stop | Phone experience | Backend evidence |
|---|---|---|
| Open | Last known values marked Cached | Existing app snapshot |
| Refresh | Values remain visible, marked Loading | App requests a refresh |
| Identity | Model and firmware become Current | Registry response |
| Health | Battery is 68%, solar charging, Wi-Fi current | Telemetry response |
| Recording | Last recording becomes 9:40 AM | Recording catalog response |
| Alternate health | Battery stays 67%, power and Wi-Fi marked Cached | Telemetry request times out |
| Alternate recording | Recording and identity are Current; telemetry remains Cached | Other backend still responds |

The paths share the first three stops, then use distinct step IDs. A timeout
establishes an unavailable response, not proof that the camera stopped recording
or that a message was never delivered. Do not draw a severed delivery edge based
only on a timeout. Response ordering in this example is illustrative, not a claim
that the real backend serializes these calls.

## Author the mapping

A `sources` entry supplies an ID, label, optional hex color, optional diagram
`node` ID, endpoint label, and detail. Endpoints are inert text; the renderer
makes no API requests. Up to six sources get redundant color and A–F markers.

Each `fields` entry supplies its display label and may name a source. `kind:"battery"` draws
a numeric 0–100 meter; text is the default kind. Other useful fields include
charging accessory, charging state, signal strength, model, firmware, recording
availability and last sync. Use supported icons and explicit units.

Initial/step values are keyed by field ID. For example, this **partial patch**
keeps the previous battery value but marks it cached:

```
"panels": {"camera-app": {
  "battery": {"status": "stale", "detail": "Last report: 2 minutes ago"},
  "clip": {"value": "9:40 AM", "status": "ready"}
}}
```

Statuses are `unknown`, `loading`, `ready`, `stale`, `error`; the UI labels them
No data, Loading, Current, Cached, Unavailable. Values and statuses are independent.
Do not substitute zero for unknown battery, infer freshness from a value, or show
a cache as the live source without explaining it. `source` inside a field patch
can name a fallback source; `source:null` restores the declared source. A whole
field set to `null` clears it to unknown. Never author computed `_updated` data.

## Edit and view

- Add a **deviceapp** panel, then edit its device, sources and fields in the panel
  inspector. Keep IDs stable; changing them requires updating references/patches.
- Select a step and expand the panel patch. Every declared field has value,
  status, source and detail controls. Blank controls mean no override in that
  patch; use raw JSON for an explicit null reset.
- Use a wide named-layout tile for phone + source map. The example's **App +
  sources** view emphasizes the UI; **End-to-end** also includes the backend
  diagram and attaches playback to it. Both use the same steps and paths.
- Select a source card or field to highlight related fields and its service node.
  Enter/Space works too. Select it again to clear. This does not edit the spec.
- Updated cues identify changes at the selected step. Only an adjacent forward
  transition gets the gentle entry animation; jumps, backward navigation and
  reduced motion settle immediately. Alternate state always folds independently.

```
node tools/validate.js src/starters/device-app-sources.json
python3 tools/inject.py src/starters/device-app-sources.json template/flowview.html /tmp/doorbell-app.html
```
