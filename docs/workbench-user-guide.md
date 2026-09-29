# The human guide

The workspace chapter explains top inspector actions, collapsed muted section
headers, same-selection expansion retention, and group-scoped Apply controls.

Open **User guide** in the workbench header or workspace toolbar. It is available
from welcome, during editing, and in Focus workspace. The guide ships inside
`workbench/flowspec.html`, including downloaded/offline copies and company nginx
installations. No separate documentation service is required.

Start with **Your first diagram** for a complete walkthrough. The chapter list
then covers the workspace, rows and free placement, quick connections, step
playback, alternate paths, panels, Home editing, named views, catalogs and code
evidence, copying, sharing, and working with an agent. The **Alternate outcomes**
chapter illustrates a shared prefix, independent failure/recovery beats, and a
shared suffix, and explains when to make a step independent. **Steps & playback**
explains story time: the section's start and formats, each step's time,
battery drain rates, and device-app report times whose "Updated … ago" text the
cards compute (see [story time](step-time.md)).

**Find your way** covers **Inspect → Document settings** for the saved title,
skin and source line, the preview-only **Canvas appearance** controls, and
**Initially collapse prose** for section paragraphs and bullets. Document edits
use the same Save/Export and Undo path as other inspector fields.

**Work with an agent** walks through the Recommended copy/paste and Beta Monitor
choices, opening or creating a diagram folder, pasting setup, choosing message
context, previewing the proposed diagram and ledger, and preparing the accepted
pair for a Git commit. It explains conflict feedback and ledger reconciliation
after a merge. The standalone brief and older automatically applied local-session
route have separate disclosures so their instructions do not interrupt this flow.
**How this works · Agent walkthrough** on the workflow choices and folder setup
opens this chapter directly. Closing it returns focus to the originating control,
including when the folder setup dialog is still open underneath.

Choose a chapter to jump within the guide. **Close** or Escape returns to your
previous work. Reading does not change the spec, selection, undo history, or
welcome navigation. Browser Find and normal text copying remain available.

## Maintaining the guide

The single content source is `src/workbench/human-guide.html`; its small dialog
controller is `src/human-guide.workbench.js`. Edit the source and run
`python3 tools/build.py`. Do not edit the generated workbench directly.
Keep the human-facing steps and control names aligned with the real UI when
changing authoring behavior. This guide complements the agent authoring skill
and the detailed feature docs; it should not become a schema reference.
An opener with `data-open-human-guide="hg-agent"` targets that chapter; an empty
attribute opens the guide at its existing reading position. Keep agent authoring
instructions here; the [reader tour](tour.md) runs only on read-only diagrams.

The [canon library guide](workbench-canon-library.md) explains how a company
ships its reviewed diagrams beside the editor.
