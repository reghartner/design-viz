# Reuse steps between paths

In the **Steps** tab, choose the destination path and select a step. Open
**Reuse steps…**, choose a source path in the same diagram, and select the
steps you want. Checkboxes can be selected in any order; insertion follows
the source path's order. Search by caption, ID or number. Shift-click selects
a range of matching steps, including across the picker's 100-row pages.
Selections remain checked when searching or paging.

**Copy and customize** is the default. Each selected step gets a new ID and
its own complete authored content: caption, hops, node focus, tones, failures,
panel patches, links and any additional fields. Editing a copy leaves the
source steps unchanged. **Use shared steps** adds references to the original
steps instead; subsequent edits affect every path referencing them. Consecutive
shared steps after a divergence form one visible common track. Paths can join
for **Shared steps**, split for independent outcomes, and join again later.
**Shared ending** means every path participating in that block ends there;
an early-ending path has no connection to later blocks it does not reference.
Separate copies remain independent; matching captions do not establish sharing.

The selected path supplies the common track's numbers and incoming state.
Clicking a shared circle keeps that path when it participates; otherwise the
circle identifies the participating path it will select. Clicking a path chip
returns to step 1. Shared beginnings keep their faded circles when there is no
downstream common block. See [alternate paths](alternate-paths.md) for full
sequence classification, views that hide stops, and conflicting shared orders.

Choose where the selection goes:

- **After selected step** inserts it and keeps the destination's remaining steps.
- **Replace selected step** replaces one occurrence with the selected steps.
- **Replace the rest after selected step** keeps the destination through the
  selected step and replaces its remaining sequence.

For a continuation, choose **Continue from here** beside a source step. It
selects that step and the full source ending, even when search hides some of
those steps, and chooses the third placement option. For example, select a
recovery beat on an alternate, then continue with the happy path's final
notification and cleanup steps. Copying remains the default; sharing is an
explicit choice.

The **Destination preview** shows the complete resulting sequence. Choose
any resulting step and panel to inspect its state before applying the change.
It uses the engine's normal folding of that destination path, including its
preceding state, accumulated events and transient changes. It does not paste
a folded snapshot as a patch. A copied door-opening step can therefore retain
an alerting hub from an alternate's earlier failure step. **Resulting panel
state** exposes the values sent to the widget as read-only JSON.

A path cannot reference the same ID twice. Sharing is refused if a selected
step remains elsewhere in the destination. Choose an independent copy for a
repeated operation, or replace the existing occurrence. References removed
by replacement do not cause a conflict. Replaced bodies remain in the registry.

## Change sharing without copying by hand

The step list identifies shared steps, including reuse after a branch. Its
selected-step controls and the inspector provide:

- **Make independent here** replaces this path's reference with a fresh copy
  at the same position. It preserves the step count and other paths. This
  action appears only when multiple paths use the step.
- **Remove from this path** removes only the selected occurrence and selects
  the following step, or the preceding step at the end. The body remains
  available to other paths and in the JSON registry. A path must retain at
  least one step.

The inspector's **Delete from all paths** remains the distinct global delete.
It removes the body and all references, subject to the existing nonempty-path
rule. **Remove alternate** removes the entire alternate instead.

Applying a reuse operation, making a step independent or removing an
occurrence each uses one builder undo entry. Previewing and cancelling do not
change the spec or history. Cancel/Escape restores focus to the opener.
Raw source edits, changed selections and active builder gestures invalidate
the picker; reopen it after rendering the current source. Native text editing
inside the picker does not trigger background builder shortcuts.

These are editor actions using the existing shared registry and path IDs.
No schema version change is needed. Reveal/hide thresholds remain numeric
positions within each path; review them after changing its sequence.
