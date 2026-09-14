# Inspect effective panel state

Select a diagram step in the workbench, then expand **Effective state · all
panels** in its inspector. Every declared panel appears, including those that
have no patch on the selected step. Expand a panel to see its folded values
and where they came from.

| Origin label | Meaning |
|---|---|
| Initial state | The value comes from the panel's `initial` object. |
| Set at this step | This step explicitly assigns the field, even if the value is unchanged. |
| Inherited from step N | A previous step supplied the current carried value. |
| This step only · enterOnce | A transient override applies at this step; it does not carry forward. |
| Accumulated / computed history | The engine combines operations; input-location buttons show relevant fields in the history. Some inputs may have been superseded or ignored. |
| Engine default / metadata | The engine supplies a value such as an empty log or the inflight step count. |

For example, a panel starts with `state: "OFF"`. Step 1 sets `state: "ON"`,
step 2 uses `enterOnce: {state: "TEMP"}`, and step 3 has no panel patch. The
inspector shows ON at step 1, TEMP at step 2, and ON inherited from step 1 at
step 3. It does not mistake the transient TEMP for a carried assignment.

Choose a source button to open the JSON source and select the exact authored
value. This does not change the selected playback step or alter the document.
**Folded JSON** exposes the complete snapshot in a read-only textarea;
**Select JSON** selects it for copying.

This is the state passed to the renderer after patch folding. Widget-specific
render defaults can still apply afterward. For example, `log: []` may appear
as an engine default on a panel that does not display a log. No validation of
the real software system or device is implied.

Nested maps retain their normal whole-map replacement behavior. Logs,
timeline events and misses, buffer paints, phone notifications and inflight
operations use the engine's existing reducers. Their computed fields list
input history rather than claiming a single assignment created the value.
Long histories show the latest twelve input locations with the total count;
the complete folded snapshot remains available as JSON.

Editing the JSON source clears displayed values immediately. Choose
**Refresh effective state** to calculate from the current JSON at that step;
choose **Render** to update the board as usual. Source-location buttons refuse
to use a stale snapshot. Open state and panel disclosures are retained while
switching steps or using the inspector's normal field editors.

The view is read-only. To change behavior, edit the authored patch or initial
state using its existing controls. A folded snapshot may contain accumulated
state or engine metadata and should not be pasted wholesale as a patch.
