# Start a project in Flowview Workbench

Open `workbench/flowspec.html` to begin at the welcome screen. The three entry
points all lead to the same editor:

- **Paste JSON** accepts a Flowview page spec or a bare diagram. Paste JSON
  without Markdown fences. Invalid JSON or a spec validation error stays on the
  welcome screen so you can correct it; the current project remains available.
- **Open file** reads a local `.json` file in the browser and validates it before
  opening the editor. Imports are not uploaded.
- **Start new project** offers a curated set of editable examples and a **Blank
  diagram**. The blank has one diagram section with no nodes, edges, or steps.
  Use the editor’s insert controls to add the first elements.

Examples cover simple service requests, retries, traces, Backstage architecture,
rollout decisions, a shared engineering/business story, a connected home, and
an app’s backend sources. Category filters help narrow the choices. These specs
are embedded in the built HTML; they also work when the workbench is opened from
a downloaded file. Each new example uses the pastel skin by default. An explicit
skin choice or hosting preference can override it.

Use **← New / open** in the workspace toolbar, or the Flowview wordmark, to return
to welcome. **Continue** returns to the current project with its undo history.
Opening another valid project is one undoable replacement. Welcome navigation
cancels temporary editor modes and pauses playback.

If this browser has a saved draft, welcome offers **Resume** with its title and
save time. A partially edited draft can still be recovered when its JSON is
unfinished. Drafts are browser-local; save a JSON file for a portable copy. The
welcome screen itself does not replace a saved draft. A canonical diagram link
using `?canon=…` opens directly in the editor. Starting another project detaches
that review and clears its URL parameters, so reloading offers your local draft.

## Build with your own agent

Choose **Build it with your agent** to create a ready-to-copy prompt. Choose
whether to explain a design, explore a codebase, or improve an existing diagram;
optionally describe the question and select the audience. The prompt directs
your coding agent to the repository’s
[authoring skill](../.claude/skills/hld-to-page/SKILL.md), then asks for a source-grounded
story, a `.spec.json`, a coverage ledger, validation, and a checked visual result.

Copy the prompt into your agent’s conversation and provide the design, docs,
code, or existing spec it should use. The agent runs in your own tools; the
workbench does not start an agent session. Open the resulting `.spec.json` with
**Paste JSON** or **Open file**.

Under **Using a company fork?**, set the GitHub repository URL and branch, tag,
or commit. GitHub Enterprise hosts are supported. Enter the repository root
without `/tree/…` or `/blob/…`; put the revision in its separate field. These
settings are stored in this browser and update both the prompt and the authoring
skill link. No access token belongs in the URL. If clipboard access is unavailable,
the workbench selects the prompt for manual copying with ⌘C or Ctrl+C.

## Team templates on a hosted workbench

Existing deployments can continue to place `starters.json` beside the workbench
HTML. The welcome screen loads it when **Start new project** opens and presents
its entries under **From your team**. This deployment filename is retained for
compatibility; the old editor Starters gallery has been replaced.

The manifest is a JSON array, or an object with a `starters` array. Each entry
contains a `name`, an optional `desc`, and the complete `spec` object:

```json
[
  {
    "name": "Our service template",
    "desc": "A blank section ready for a service story.",
    "spec": {
      "page": {
        "title": "New service story",
        "skin": "pastel",
        "blocks": [
          {"heading": "Request flow", "diagram": {"nodes": {}, "rows": [[]], "edges": [], "steps": []}}
        ]
      }
    }
  }
]
```

Missing manifests are normal. Invalid entries are counted, while valid entries
remain available; malformed manifests and failed requests show a message without
hiding the embedded examples. Team specs are validated when selected. Loading a
manifest requires an HTTP(S) host; downloaded `file:` pages use the embedded set.
