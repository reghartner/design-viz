# Shared icons and company branding

Flowview uses one library of 58 colored SVG icons for diagram nodes, groups,
Home elements, Device app cards, audio controls, monitoring and dispatch. Battery,
temperature and alarm variants differ in shape as well as color. Icons describe
the authored story; choosing an alarm icon does not trigger or verify an alarm.

## Choose an icon in the workbench

Select a node or group and open **Inspect → icon → Browse icons**. Search by
name or token, filter **Category**, then choose a tile to apply it. The same
picker appears in Home's **Edit layout** device/subject rows, Device app's
**fields** rows, each card's **Starting state** and step controls, and the
**Company branding → Library icon** control. Arrow keys move between tiles;
Escape closes the picker. The adjacent select remains available.

Home cameras, hubs and sensors accept explicit icon choices. Without one they
use `camera`, `router` and `gear`, respectively; subjects keep their person
avatar. An icon choice changes the marker, preserving its device kind and state.
For a changing Home marker, use **Starting device and subject conditions** or
the selected step's **Home at this step** editor. The element's **icon** row
offers **Inherit previous icon**, **Restore layout icon**, and the shared picker.
Initial/step objects accept a known `icon` ID; omission carries the earlier
choice and `icon:null` restores the layout icon. State, temperature, audio and
position changes leave an existing icon choice intact. Entry doors keep their
geometric artwork. Hiding a subject with a whole-subject `null` clears its
carried icon/audio too; an icon-only patch does not show a hidden subject.

For Device app, `fields[].icon` declares a card's default. **Starting state** can
set a different icon at the beginning of every path. Select a story step, open
**Inspect → Panel changes**, and choose the card's **icon** to change it at that
step. This choice carries forward independently of value, status and visibility.
**Inherit** removes the assignment at the selected step, allowing earlier state
to carry. In JSON, `icon:null` resets to the declaration's icon, or the normal
card default when none was declared. A battery card defaults to `battery`; a
text card without an icon has none. A numeric value alone does not choose an
alarm, hot or low-battery icon.

## Share a company name and mark

Select a **Phone**, **Device app**, **Camera screen** or **Security monitoring**
panel and expand **Inspect → Company branding**. **Use brand** offers:

- **Shared across this diagram**: edit the name and mark once for every
  supported panel that inherits this diagram's brand.
- **Override for this panel**: customize this panel while retaining omitted
  shared values.
- **No brand on this panel**: hide the shared brand on this panel.

Set **Company / app name** and choose **Library icon**, **Monogram**, or
**Upload logo**. Choosing a mark replaces the other mark formats in that scope.
Monograms contain 1–4 characters. Uploads accept PNG, JPEG or WebP up to 512 KiB
and 4096 × 4096 pixels; the image is embedded in the saved spec. **Accent color**,
**Monogram background**, and **Text color** accept `#RGB` or `#RRGGBB`.

The shared declaration is `diagram.brand`. A missing `panel.brand` inherits;
`false` suppresses branding; an object overrides supplied properties. A valid
local `logoImage`, `icon`, or `logo` replaces the shared mark as a unit. If a
manually authored object contains multiple marks, rendering prefers
`logoImage`, then `icon`, then `logo`. The compact Camera watermark needs a mark;
an app name alone is shown on the other supported surfaces.

```json
{
  "brand": {"app":"Northstar Home","icon":"house","accent":"#318585"},
  "panels": [
    {"id":"phone","type":"phone"},
    {"id":"camera","type":"screen","brand":{"icon":"camera"}},
    {"id":"desk","type":"security","brand":false}
  ]
}
```

This is a diagram fragment: the phone inherits the house mark, the camera uses
the same name and accent with a camera mark, and the monitoring desk is unbranded.
Use `logoImage:"data:image/png;base64,..."` only with an actual embedded raster.
Remote logo URLs and authored SVG markup are unsupported.

## Recipe: narrate independent card changes

Declare each card once, then patch its icon only when the story calls for a new
meaning. Values and freshness remain separate authored facts:

```json
{
  "id":"device",
  "type":"deviceapp",
  "device":"Front door camera",
  "fields":[
    {"id":"battery","label":"Battery","kind":"battery","icon":"battery"},
    {"id":"temperature","label":"Temperature","icon":"temperature","unit":" °C"}
  ],
  "initial":{
    "battery":{"value":82,"status":"ready","icon":"battery-full"},
    "temperature":{"value":22,"status":"ready"}
  }
}
```

A step patch `{"device":{"battery":{"icon":"battery-charging"}}}` belongs
under `steps[n].panels`; it changes the icon while preserving the reported
charge. A later `{"device":{"battery":{"icon":null}}}` restores the
declared `battery` icon. Keep temperature changes, camera availability and
monitoring assessments explicit rather than deriving them from another card.

See the complete [shared-icons spec](../examples/shared-icons/shared-icons.spec.json)
and [generated viewer](../examples/shared-icons/shared-icons.html).

## Library and renderer contract

[`src/icons/library.js`](../src/icons/library.js) owns the geometry and frozen
metadata. `FlowIcons.ids` contains every supported ID;
`FlowIcons.registry[id]` exposes `id`, `label`, `category`, `tone`, `primary`,
`accent` and `legacy`. `has(id)` validates a known ID; `resolve(id, fallback)`
chooses a known fallback, defaulting to `gear`.

```js
FlowIcons.render('battery-charging', {className:'device-power', label:'Charging'});
FlowIcons.render('sensor', {tone:'alert'});
FlowIcons.glyph('camera', {monochrome:true}); // inner <g>, 24 × 24 coordinates
```

`render` returns inline SVG; `glyph` returns its inner group for placement in a
larger SVG. Both resolve IDs through the library. Label and class options are
escaped; callers never supply SVG paths. Decorative icons are hidden from
assistive technology by default. Pass a label for a meaningful standalone icon,
and retain adjacent state text where color would otherwise carry the meaning.

Palettes are `neutral`, `blue`, `teal`, `green`, `amber`, `red`, and `violet`.
Aliases `ok`, `warn`, `alert`, `cold`, and `muted` map to green, amber, red, blue,
and neutral. `monochrome:true` uses inherited `currentColor`. The optional
[`library.css`](../src/icons/library.css) supplies 1.25em sizing and forced-color
support; SVG paint fallbacks work without CSS or an external sprite in offline
exports and native ShadowRoots. CSS consumers can override
`--fv-icon-primary`, `--fv-icon-accent`, and `--fv-icon-wash`.

`symbols()` emits the 37 new `#i-*` symbols by default. The source loader appends
them to the existing 21-symbol sprite, preserving legacy diagram tint behavior.
`symbols({newOnly:false})` emits all 58 for consumers that have no legacy sprite.
Do not append the full set to a document that already contains those IDs.

[`src/icons/brand.js`](../src/icons/brand.js) owns `FlowBrand.clean`, `resolve`,
`warnings`, and `render`. [`src/panels/media.js`](../src/panels/media.js) owns the
shared embedded-raster validator used by images, app screens and branding.
The editor owns transactions and form lifetime through
[`icon-picker.js`](../src/workbench/icon-picker.js) and
[`brand.js`](../src/workbench/brand.js); panel modules reuse these controls.

## Icon IDs

| Category | IDs |
| --- | --- |
| Software | `terminal gear db server chip` |
| Connectivity | `cloud antenna router wifi wifi-off cloud-off signal` |
| Security | `shield key lock alarm armed disarmed triggered door motion smoke water sensor` |
| Temperature | `thermo temperature hot cold snowflake` |
| Home | `pump package phone house doorbell bulb car person` |
| Video | `camera monitor camera-off` |
| Audio | `speaker microphone microphone-muted recorded chime siren detection headset` |
| Power | `battery battery-full battery-low battery-charging plug solar` |
| Dispatch | `police fire medical security` |

## Review of all 30 panel types

Shared icons replace reusable pictograms. Quantitative marks, authored scene
artwork and arbitrary state vocabularies remain with their panel. The review
below records the current migration boundary; possible later uses are explicit.

| Panel | Current use or retained presentation |
| --- | --- |
| `appscreens` | Captured screens and existing status bar remain; shared status icons are a possible later use. |
| `battery` | Shared zone, charging and snowflake icons; charge glyph and history chart retain their quantitative meaning. |
| `budget` | Limit bars and existing status text remain; a shared badge is a possible later use. |
| `buffer` | Cells and existing head marker remain. |
| `checks` | Authored result text remains; a shared status icon is a possible later use. |
| `deviceapp` | Shared app/card/status icons, per-card icon patches and company branding. |
| `dispatch` | Shared responder and headset icons; neighborhood and vehicle artwork remain. |
| `gauge` | Quantitative gauge; no pictogram migration. |
| `homemap` | Shared device, subject and thermal icons; sparse initial/step icon overrides; doors, cones and physical motion remain. |
| `image` | Embedded reference image; no pictogram migration. |
| `inflight` | Lane/range data geometry remains. |
| `leds` | Existing authored indicator-dot vocabulary remains. |
| `log` | Text history; no pictogram migration. |
| `orbit` | Diagram geometry remains. |
| `phone` | Shared audio and branding; existing phone status bar and legacy monograms remain. |
| `queue` | Queue flow remains; a shared directional icon is a possible later use. |
| `radar` | Sensing geometry and explicit authored alarm remain independent; no new inference. |
| `replicas` | Position/lag display remains; shared status icons are a possible later use. |
| `screen` | Shared unavailable-camera icon and brand watermark; camera scenes remain. |
| `security` | Shared sensor/state icons and desk branding; operator artwork remains. |
| `signal` | Quantitative signal bars remain. |
| `state` | Arbitrary authored vocabulary remains; no inferred icon mapping. |
| `table` | Existing data rows remain; shared semantic badges are a possible later use. |
| `thermo` | Shared temperature-zone icon; thermometer and chart remain quantitative. |
| `tiles` | Arbitrary authored tile vocabulary remains. |
| `timeline` | Event/lanes data geometry remains. |
| `trace` | Timing model and span geometry remain. |
| `waterfall` | Timing geometry and existing error marker remain. |
| `xray` | Envelope geometry and existing open/closed labels remain. |
| `zoneframe` | Zone polygons and verdict geometry remain. |

`tests/icon-library.test.js` verifies the library's immutable metadata, safe ID
resolution, escaped attributes, distinct state geometry, palette overrides and
legacy/new sprite parity. Browser checks cover small icons, dark backgrounds,
the picker, branding controls and native ShadowRoot rendering.
