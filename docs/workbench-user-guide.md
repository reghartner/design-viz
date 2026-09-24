# The human guide

Open **User guide** in the workbench header or workspace toolbar. It is available
from welcome, during editing, and in Focus workspace. The guide ships inside
`workbench/flowspec.html`, including downloaded/offline copies and company nginx
installations. No separate documentation service is required.

Start with **Your first diagram** for a complete walkthrough. The chapter list
then covers the workspace, rows and free placement, quick connections, step
playback, alternate paths, panels, Home editing, named views, catalogs and code
evidence, copying, sharing, and working with an agent. The **Alternate outcomes**
chapter illustrates a shared prefix, independent failure/recovery beats, and a
shared suffix, and explains when to make a step independent.

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

The [canon library guide](workbench-canon-library.md) explains how a company
ships its reviewed diagrams beside the editor.
