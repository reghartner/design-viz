# Color phases within one flow

Select a step in the **Steps** tab and open **Inspect**. **Circle color** offers a
color picker, a hex input, and **Use default**. Each committed change has one
Undo/Redo entry. Empty hex input also restores the default.

Set the same color on adjacent steps to identify a phase. For example:

```json
{"id":"store", "edge":"recording->storage", "text":"Storage phase: save the clip.", "color":"#8b5cf6"}
```

Only that step's playback button and matching numbered diagram coin are colored.
The number automatically uses black or white for contrast, and the active step
keeps its selection ring. Nodes, edges, captions and panel state retain their
normal meaning. Repeat a color on each step in a phase; it does not carry forward.
Use captions to name phases rather than relying on color alone.

An omitted or null `color` keeps existing skin/path styling. Only opaque `#RGB`
and `#RRGGBB` are supported; invalid values warn and fall back. No schema-version
switch is required. Rebuild older generated HTML to display these overrides;
exports declare `flow.step-colors` for viewer compatibility checks.

Shared steps use the same color wherever they appear. Shared alternate shadows
remain at 35% opacity except when current or keyboard-focused. Path chips retain
their path color. To give an alternate a different circle, first use **Make
independent here**. Copies retain the authored color and can be customized.
Filtered layout views retain the colors of their visible source steps.

Open the [single-flow example](../examples/step-colors/step-colors.spec.json) to
see blue delivery, purple recording and teal resident-experience phases.
