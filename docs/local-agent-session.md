# Design together through local files

For a hosted workbench with no localhost server, see the experimental
[Claude folder conversation](folder-agent-session.md). This page describes the
existing optional HTTP helper.


The local session connects an open workbench to an agent that can read source
repositories and write files. The agent needs no browser automation, screenshots,
extension, MCP server, or HTTP access. A small Node helper serves the workbench;
the browser polls it and exchanges document updates through a scratch directory.

## Start

From your Flowview checkout, with Node 20 or later and Python 3:

```sh
python3 tools/build.py
node tools/agent-session.mjs --port 8766
```

Open the localhost URL printed by the helper. Choose a template, open a JSON file,
or paste a document once. The header shows **Agent files · Disconnect** while
sharing. **File → Local agent session** shows the scratch folder and update status.
Give the agent the absolute path to that folder's `README.md`, your source-code
checkout, and the change you want. For example:

> Read the local session README in the scratch folder. Read the doorbell handler
> in my source checkout. Using the selected service as context, add a timeout
> alternate grounded in that code. Preserve the existing layout and unrelated
> content. Submit through proposal.json and check result.json. Do not use browser
> tools or modify the Flowview engine.

An omitted port chooses an available port. `--scratch /absolute/new-directory`
chooses a new scratch directory; existing directories are refused. The default
is an ignored `.local/agent-session-*` directory in the checkout. Scratch contains
private design content and is retained after stopping; it is not a Git commit.

Open the helper URL directly in your browser. The helper binds only to
`127.0.0.1`; it does not support phone/LAN access, a remotely hosted workbench,
or a cloud agent without access to the same filesystem. A remote source repository
can be cloned separately using the agent's existing authorized tools.

## Take turns

Selections and edits reach `state.json` approximately once a second. Select a
node, several nodes, a panel, or a story step before asking for a contextual edit.
The snapshot includes exact JSON source, selected authored addresses, and each
section's current view, path, and source step. Source code is read directly by
the agent from the authorized checkout; the helper never serves that checkout.

The agent writes a complete updated source string and the revision it read.
The workbench validates and applies it automatically, without reloading the page.
One **Undo** reverses the whole proposal; **Redo** restores it. The inspected
selection clears after an update so reordered objects cannot leave stale controls.
Preview restoration
uses the existing view/step identity rules. If an agent removes the current view
or step, the renderer uses its normal fallback.

For a wholly new diagram, the agent authors nodes and semantic connections
without coordinates or edge controls, then runs
`node tools/auto-arrange-spec.cjs --section <zero-based-section> <draft> <different-output>`
from the Flowview checkout and proposes that arranged
output. It repeats `--section` for multiple new diagrams and uses `--all` only
when every diagram is new. For an existing diagram, it keeps
all placement and route fields. A newly added node remains unpositioned with
automatic connections; use the Workbench **Auto arrange** button if you want to
replace the whole diagram's layout. The file session does not let the agent
claim that it pressed the browser button.

Updates wait while a text field is focused, a dialog is open, or a supported
editor gesture is active. Finish the edit and click outside the field. An update
based on older source is rejected, including after switching projects. The agent
must reread and reconcile your changes. It must not reuse an old replacement with
a freshly copied revision number. Unsaved and invalid handwritten JSON stays
recoverable through the existing editor history.

Only one tab owns the scratch session. Another tab waits until the owner
disconnects or its connection expires (about ten seconds after closing/crashing).
Reloading establishes a new revision identity. The last proposal from a previous
tab cannot silently apply to the new one. A proposal already delivered to one
tab stays assigned to that tab until acknowledged. If that tab crashes before
acknowledging, its outcome is unknown: reconnect it if possible, or inspect the
current source and submit a new proposal ID. Another tab cannot mark that earlier
edit rejected or applied. A browser draft may still need to be
resumed through the ordinary welcome screen.

**Disconnect** stops sharing and application of updates. **Connect** resumes it.
Stopping the helper also ends the connection; ordinary workbench edits remain
available. Use **Save** to write the finished source to your project. There is no
automatic commit, PR, push, or modification of the file originally opened.

## File protocol, version 1

| File | Writer | Purpose |
| --- | --- | --- |
| `README.md` | Helper | Session-specific handoff instructions and paths |
| `state.json` | Browser/helper | Current source, revision, selection, view context and connection status |
| `proposal.json` | Agent | One pending complete source replacement |
| `result.json` | Browser/helper | Last acknowledged proposal result |

Read `state.json` immediately before planning. Require `connected:true`,
`open:true`, and an `updatedAt` within the last 15 seconds. `source` is the exact
editor text, not a normalized spec. It can contain incomplete JSON; `parseError`
describes that case. `previewCurrent:false` means the source differs from the
rendered preview; selection and view context are then omitted. Selection `section`
and `index` values are zero-based raw
authoring addresses. `views[].sourceStep` is a raw source index, not the visible
stop number in a filtered view. Identifiers are scoped to this document.

Write this envelope to a temporary file in the scratch directory, then rename
it to `proposal.json`:

```json
{
  "id": "rename-camera-1",
  "baseRevision": "copy-from-state-revision",
  "source": "{\"page\": ... complete edited JSON ...}",
  "summary": "Renamed the selected camera to match the source code."
}
```

`id` and `baseRevision` contain 1–120 letters, digits, underscores or hyphens.
Use a new `id` for each proposal. `source` is at most 4 MiB in UTF-8; `summary`
is optional and at most 1,000 characters. Atomic rename prevents partial writes
from being read. Do not send JavaScript, commands, filesystem paths to load,
patch programs, or instructions in place of source JSON.

Wait for `result.json` with the matching `id` before writing the next proposal.
Statuses are `applied`, `unchanged`, or `rejected`; `message` explains the outcome
and `revision` identifies the resulting/current document. A rendering failure
after publication is reported in the message; the source remains undoable.
Malformed envelope/partial-file errors appear in the workbench status and do not
consume a proposal. Correct that file and retry. A disconnected or busy browser
may have no result yet. Do not repeatedly overwrite the pending proposal.

Example file-only submission in Python:

```python
import json
import pathlib
import uuid
from datetime import datetime, timezone

scratch = pathlib.Path("/absolute/path/printed/by/the/helper")
state = json.loads((scratch / "state.json").read_text())
assert state["connected"] and state["open"]
updated = datetime.fromisoformat(state["updatedAt"].replace("Z", "+00:00"))
assert (datetime.now(timezone.utc) - updated).total_seconds() < 15
spec = json.loads(state["source"])
# Make the requested, source-grounded changes to spec here.
proposal = {
    "id": uuid.uuid4().hex,
    "baseRevision": state["revision"],
    "source": json.dumps(spec, indent=2),
    "summary": "Describe the actual change.",
}
temporary = scratch / "proposal.tmp"
temporary.write_text(json.dumps(proposal))
temporary.replace(scratch / "proposal.json")
```

## Boundaries

The helper serves only the built workbench, bundled catalog/canon manifest and
viewer export template. Its only session operation exchanges structured JSON.
It neither executes agent code nor exposes a general filesystem, browser,
credential, shell, or screenshot API. HTTP requires the exact loopback host;
session calls require a per-run random authorization header and reject foreign
origins. No CORS access is enabled. The token is not written to scratch or logs.
The workbench cannot be framed through this helper.

Scratch is private to the operating-system account, with new directories/files
created using restrictive permissions. Proposal reads reject symlinks and
non-regular files. This does not sandbox an agent already running as your user;
that agent's independent filesystem/network permissions still apply. Sharing
source with an agent sends it into that agent's processing environment. Choose
the agent and source repositories accordingly.

This is a local authoring tool. It does not change the static deployment,
Backstage package, Confluence integration, or diagram schema. Multi-user hosted
sessions would need separate authentication and authorization work.
