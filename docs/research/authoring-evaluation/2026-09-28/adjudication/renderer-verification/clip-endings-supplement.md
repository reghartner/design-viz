# Clip-open ending facts

Both historical normal endings render an **illustrated camera scene in a separate panel**, in addition to their device-app fields. Neither is device-health fields alone. The scene is the stock vector `package-drop` illustration: porch/door/package, with an authored banner identifying it as the opened or playing clip. It is not an embedded video file or a thumbnail rendered inside the phone.

The original exact published HTML was opened in Chromium 153.0.8010.12 / Node 24.21.0 at 1800×1200 with reduced motion. The normal route was selected and advanced using Next; active path and source-step index were asserted. Each scene panel was visible, contained one `svg.scene` with 34 vector elements, had class `screenbox m-save`, and contained zero `<video>` and zero `<img>` elements. Both phone surfaces contained zero scene SVGs and zero video elements. Full DOM facts, source/HTML hashes, screen renderer hash and screenshots are in [clip-endings-supplement.json](clip-endings-supplement.json). Frozen evidence JSON and accepted specs remained byte-for-byte unchanged.

## Historical business

- Normal endpoint: `a-open`, `/page/blocks/0/diagram/steps/6`, 08:12.
- Screen declaration: `/page/blocks/0/diagram/panels/2`, id `porch`, type `screen`, scene `package-drop`.
- Visibility becomes true at `/page/blocks/0/diagram/steps/5/panelVisibility/porch` and carries into the endpoint.
- Endpoint screen patch: `/page/blocks/0/diagram/steps/6/panels/porch`, mode `save`, banner **“Clip playing in the Kestrel app”**. Prior `scenePlayback:playing` also carries.
- Phone field: `/page/blocks/0/diagram/steps/6/panels/app/event`, value **“Package”**, detail **“8:10 AM · clip playing”**. This is a text field, not an in-phone thumbnail or playback surface.
- The event card is rendered below the phone's initial scrollport. A real mouse wheel inside the phone scrolls 121 px and fully exposes the 94.44 px card.

Proof: [full ending](historical-business/normal-a-open.png), [camera scene](historical-business/ending-camera-scene.png), [phone after scrolling](historical-business/ending-phone-scrolled.png).

## Historical engineering

- Normal endpoint: `h-open`, `/page/blocks/0/diagram/steps/8`, resolved 08:06.
- Screen declaration: `/page/blocks/0/diagram/panels/2`, id `clip`, type `screen`, scene `package-drop`.
- Visibility becomes true at `/page/blocks/0/diagram/steps/6/panelVisibility/clip`. Mode becomes `save` at `/page/blocks/0/diagram/steps/7/panels/clip/mode` and carries into the endpoint.
- Endpoint screen patch: `/page/blocks/0/diagram/steps/8/panels/clip`, banner **“Opened in the Kestrel app 8:06 AM”**.
- Phone field declaration: `/page/blocks/0/diagram/panels/1/fields/4`, id `clipcard`, label **“Clip”**, source `clipstore`.
- Endpoint field patch: `/page/blocks/0/diagram/steps/8/panels/phoneapp/clipcard`, `visible:true`, value **“Package · 8:05 AM”**, detail **“Playing · ~20 s”**. This is a text card with an icon, not an in-phone thumbnail or playback surface.
- That Clip card is rendered below the phone's initial scrollport. A real mouse wheel inside the phone scrolls 123 px and fully exposes the 115.19 px card.

Proof: [full ending](historical-engineer/happy-h-open.png), [camera scene](historical-engineer/ending-camera-scene.png), [phone after scrolling](historical-engineer/ending-phone-scrolled.png).

## Same descriptive categories across all eight

This table is derived from the frozen final-step state and source pointers. It describes authored/rendered categories without assigning scores. `D` abbreviates `/page/blocks/0/diagram`.

| Story / endpoint | Separate screen scene at ending | In-phone endpoint content beyond health fields | Exact source locations |
|---|---|---|---|
| run-01 / open | No screen panel | Last-event text “Package · alert sent”; no Clip field | `D/steps/6`; field registry `D/panels` |
| run-02 / a-open | No screen panel | Last-event text “Package delivered”, detail “8:10 AM · clip opened” | `D/steps/6/panels`; field registry `D/panels` |
| run-03 / a-open | Visible screen `cam`, `mode:save`, banner “Playing on the resident's phone” | Last-event text “Package · 8:10 AM” | `D/panels/3`; `D/steps/7/panels` |
| run-04 / open-clip | No screen panel | Dedicated Clip text field “Package · 8:05 AM”, detail “Opened 8:07 AM from the push” | `D/steps/9/panels`; field registry `D/panels` |
| run-05 / open-clip | No screen panel | Last-event text “Package · 8:05 AM”, detail “Clip opened 8:06 AM” | `D/steps/10/panels`; field registry `D/panels` |
| run-06 / openclip | No screen panel | Battery, power and online only; caption says clip opens | `D/steps/6`; field registry `D/panels` |
| historical-business / a-open | Visible `package-drop` scene, playing banner | Last-event Package text plus “clip playing” detail | Exact pointers above |
| historical-engineer / h-open | Visible `package-drop` scene, opened banner | Dedicated Clip text field plus “Playing · ~20 s” detail | Exact pointers above |

Renderer basis: `src/panels/types/screen.js:341–382` renders the authored stock scene for `active/live/rec/save` and uses the authored `banner` in save mode; `src/core/state.js:60` folds panel visibility. `src/panels/types/deviceapp.js:432–478` renders phone fields as text/icon/value/detail cards. The factual categories distinguish a separate illustrated scene, a text-only clip/event card, and a caption-only statement; they do not assert that any category is worth a particular number of points.
