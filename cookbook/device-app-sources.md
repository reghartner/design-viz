# Device app: home screen, data cards, notifications and optional sources

Use `deviceapp` for one phone that moves from its home screen into a device app,
with data cards and notifications. Add source mappings only when explaining the backend is part of the story.
Use `phone` for a compact notification-only lock screen or two-way audio, and
`screen` for camera clips.

## Move from the home screen into the app

Set `initial.phoneScreen:"home"` on a Device app panel. Use `appName` for its
app icon and app header. Send a notification on a step, then open the app on the
next step. These are step patches:

```
{"panels":{"app":{"notify":{"app":"Homestead","title":"Doorbell pressed","text":"Someone is at the door."}}}}
```

```
{"panels":{"app":{"phoneScreen":"app","clear":true}}}
```

Return home with `{"panels":{"app":{"phoneScreen":"home"}}}`. `clear:true`
is optional and explicitly dismisses notifications; opening the app alone does
not do that. Screen selection, card visibility, and data carry independently.
Omitting `phoneScreen` starts in the app, so existing specs keep their opening
screen. The home-screen icons illustrate the phone; timeline steps drive navigation.

In the workbench, select the panel and choose **Starting phone screen**. On a
step, expand the panel controls and choose **Phone screen → Home screen / Device
app / Inherit**. The [complete seven-step example](../examples/device-app-navigation/device-app-navigation.spec.json)
shows notification arrival, opening the app, adding/removing cards, and returning home.

## Add and remove cards on steps

Declare possible cards once in `fields`. They start visible unless their initial
state sets `visible:false`; use **Cards shown initially** in the panel inspector.
Each step’s card controls offer **Card visibility → Show card / Hide card /
Inherit**. Inherit keeps the previous choice; it does not necessarily show the card.

```
{"panels":{"app":{"clip":{"visible":true,"value":"Just now","status":"ready"},"power":{"visible":false}}}}
```

This adds the recording card and removes the power card. Hiding a card does not
clear its data. It can update while hidden and show the latest value when restored.
Use `initial.clip.visible:false` to hold the recording card back until it exists.
Resize the panel tile to shrink the whole phone, including its text, icons and cards.
In a named layout it fits both the tile width and height, up to its normal size.
Changing steps or removing every card does not change the frame size; long
content scrolls inside. The optional source explanation keeps its normal text size.
Notifications come first, then visible cards in `fields` order. A card below the
phone's initial scroll position is reachable but not visible in the initial
unscrolled phone view, so declare the step's key evidence early. Hide cards or clear notifications only
when the source supports it; show required clip imagery in a separate `screen`.
A whole-field null reset restores default visibility and unknown data.

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

### Report times instead of freshness text

A hand-written "Last report: 2 minutes ago" is wrong as soon as the story moves
on. When the diagram declares `storyTime` (see [story time](../docs/step-time.md)),
mark the step that delivers a report with `reportedAt` and let the card compute
its freshness:

```
"panels": {"camera-app": {
  "battery": {"value": 64, "status": "ready", "reportedAt": "now"}
}}
```

Every later step shows "Updated just now" (under a minute), "Updated 5 min
ago", "Updated 3 h ago", and "Last report Thu, Sep 24, 6:05 PM" after a day,
from that step's story time. `reportedAt` also takes `"-2m"` (two minutes
before this step), `"06:05"` (the latest 6:05 at or before it) or a date-time.
Declare a field with `"freshness": "absolute"` to show "Last report 6:05 PM"
instead, or `"off"` to keep your own text. An explicit `detail` still wins until
the next report; a cached value still needs `"status": "stale"` from you.
Without `storyTime`, keep authoring `detail` as above.

## Optional tile badges

New picker tiles start with **Badge → Hidden**. Existing diagrams keep their
status badges until you change them. In **fields**, choose **Hidden**, **Custom**
or **Status**; Custom uses **Badge text** and a hex **Badge color**. This panel
declaration fragment shows all three choices:

```
"fields": [
  {"id": "battery", "label": "Battery", "kind": "battery", "badgeMode": "none"},
  {"id": "power", "label": "Power", "badgeMode": "custom", "badgeText": "Solar connected", "badgeColor": "#168878"},
  {"id": "firmware", "label": "Firmware", "badgeMode": "status"}
]
```

Starting state and step controls support the same three badge properties.
`{"power":{"badgeText":"On battery","badgeColor":"#915209"}}` changes the
custom label and color from that step onward. Omitted properties inherit prior
overrides; `badgeText:null` restores the declared label (likewise mode/color).
The assignment menu provides **Inherit** and **Use declared badge text/color**.
An empty custom label hides the pill; use **Set value** on an unset Badge text
assignment to author an empty string. Whole-field null resets restore defaults.
Color sets badge text plus a tinted background; unsafe/invalid colors are ignored.
Badges do not change `status`, battery data, `detail` or computed report freshness.

## Edit and view

- Add a **deviceapp** panel, then edit its app name, device, starting screen,
  initially shown cards, sources and fields in the panel inspector. Keep IDs stable; changing them requires updating references/patches.
- Select a step and expand the panel patch. Every declared field has value,
  status, source, detail, visibility and **Report time** controls; **Reported
  at this step** sets `reportedAt: "now"`, **Clear report time** sets `null`
  (no freshness from this step on, even for an inherited report) and
  **Inherit** removes this step's report time.
  Effective state shows the computed text as *Story time · derived freshness*. Blank controls mean no override in that
  patch. **Clear report time** writes the report-time `null` for you; use raw
  JSON only for other explicit `null` resets, such as a whole field.
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
