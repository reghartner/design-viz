# Story steps

Open the **Steps** tab in the workbench editor. Choose a section, including one
in a hidden tab, then search by caption, step ID, lane, node, hop or panel ID.
Numbers always refer to the full selected path (or the full story without paths). The metadata counts explicitly listed
hops, nodes and panel patches at that beat, not the resulting inherited state.
The list displays up to 200 matches per page, with Previous/Next controls.

Select a beat to reveal its scenario, pause at that step and prepare its
inspector. The Steps tab and keyboard focus stay in the list; use **Inspect
selected step** to open the fields. The path beneath the inspector title opens
the element's exact JSON source. Arrow
keys and Home/End move focus; Enter or Space selects the focused beat. The
filter keeps normal text-editing behavior. Focusing this editor pauses Play.
An `ambient-only` diagram still permits source editing but has no step preview;
change `diagram.view` in JSON to `step` or `ambient` to show one.

Under **Panel changes → Panel visibility**, every declared panel has **Show**,
**Hide**, and **Inherit**, even if it has no content patch. Show/Hide carries
forward along the selected path; Inherit removes only this beat’s override.
Select a panel to set its **Starting visibility**. Hidden panels preserve their
space and keep receiving content updates; attached playback controls stay
available. A layout’s hidden elements remain hidden. Ambient shows all panels
included in the view. Use Outline to select a hidden panel. Try the
[panel visibility example](../examples/panel-visibility/panel-visibility.spec.json).

For an **App screens** panel, every step inspector includes an **App screen**
selector under **Panel changes**, even before the step has a panel patch. Choose
a named uploaded screen, inherit the previous screen, or explicitly clear it.
The optional **Date** field carries forward too; **Hide date** and **Inherit date**
make the override explicit. All three phone panels (App screens, Phone and
Device app) have a **Starting date** in their panel inspector.
Upload and manage the collection by selecting the panel itself. See
[manual Figma screens](../cookbook/app-screens.md).

- **Append step** adds a beat at the end of the chosen path. It uses an
  existing hop when possible; a diagram without edges gets an edgeless beat.
- **Duplicate** inserts a complete copy after the selected beat. An existing
  step ID gets a unique `-copy1`, `-copy2`, … suffix. ID-less beats stay ID-less.
  The step inspector also has a **duplicate step** action.
- **Earlier / Later** move the selected beat by one position in the full
  story, including neighbors hidden by the filter. End controls are disabled.
- **Reuse steps…**, available on paths, copies or shares beats from another
  path with a destination-state preview. **Make independent here** detaches
  a shared beat in place; **Remove from this path** removes only its occurrence.
  See [step reuse](workbench-step-reuse.md) for selecting ranges and continuations.

These actions clear the filter, select their result and use one existing
builder undo entry each. Undo/redo restores the source; it clears the builder
selection as usual. Selecting a beat or browsing pages does not create history.

Copying repeats the authored operations, including appended log entries and
notifications. Moving changes the order in which sparse state is inherited.
Reveal/hide thresholds remain numeric story positions, just as with the
existing inspector move controls. Review the resulting story after structural
edits; duplication does not claim another observed trace event occurred.

Typing in JSON immediately clears the list and disables edits until Render
succeeds. This protects against acting on stale section or step positions.
Finish ADD TO STEP or an edge connection before using list actions. The list
does not intercept text-editor undo or save its navigation state into the spec.

See [alternate paths](alternate-paths.md) for forking after a beat, choosing an
outcome, and editing shared steps across multiple sequences.
