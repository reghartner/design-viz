# Flowview releases and spec compatibility

The company fork, **`backstage-diagrams`**, contains the engine, panels, editor,
compatibility declarations and diagram specs in one repository. It publishes
internal Flowview releases and builds the nginx editor image from the same
versioned source. Catalog snapshots, trace evidence and drift automation also
live in this repo.

The separate company Backstage app repository pins its Flowview dependency
and upgrades through its normal PR, testing and deployment cycle. Viewing a newer diagram does not download or
execute a newer renderer.

## Three independent versions

- `page.contract` is the spec format's major version. It remains `"1"`.
- `page.flowview.minVersion` is the minimum renderer release required by the
  diagram. `authoredWith` records the editor release but does not itself require
  an upgrade. `features` names the capabilities the diagram uses.
- The existing spec/content revision identifies the approved diagram snapshot;
  it is unrelated to the renderer release or the design document's version.

For example, a diagram produced by the compatibility-aware baseline contains:

```json
{
  "page": {
    "contract": "1",
    "flowview": {
      "authoredWith": "0.1.0",
      "minVersion": "0.1.0",
      "features": ["panel.homemap", "flow.alternates"]
    }
  }
}
```

This is a metadata excerpt; an actual spec also needs its sections or blocks.
For a hypothetical future feature introduced in 1.4.0, the minimum would become
1.4.0. Merely editing the diagram with a 1.5.0 editor would not raise it again.
Use semantic versions, including prerelease identifiers when appropriate.
Build metadata such as `+company.1` does not affect semantic-version precedence;
use a new release number when compatibility changes.

## Authoring and export

Workbench **Save**, **Export**, **Export for Confluence**, **Copy JSON for
Confluence**, and **Propose spec update** stamp their output snapshots. They
detect panel types, alternate paths, failed communications, custom/named layouts
and view-specific step stops, including diagrams in tabs. The live JSON editor
and undo history are preserved. Incomplete JSON can still be saved as-is.

Declared minimums and feature IDs are retained, including ones unknown to an
older editor. Export does not silently lower requirements. Removing a feature
may therefore leave a conservative minimum; lower it only after checking the
diagram against the desired older release. Malformed metadata is reported and
preserved for repair rather than silently rewritten.

Agents or other authoring tools can stamp and check specs with:

```sh
node tools/compatibility.js --stamp input.spec.json > versioned.spec.json
node tools/compatibility.js versioned.spec.json
```

Use different input/output files: shell redirection truncates the destination
before the command runs. Stamping does not replace spec validation; run
`node tools/validate.js versioned.spec.json` as usual. The compatibility check
prints a JSON report and exits 1 if it finds a mismatch or invalid metadata.
Specs without metadata remain supported and are reported as `unversioned`;
they are not certified compatible with every historical renderer. Features
recognizable from their content are still checked.

## Backstage behavior

The installed plugin evaluates the fetched spec against compatibility metadata
generated from the exact same sources as its viewer. For a higher minimum or
missing capability it shows an upgrade notice with installed/required versions
and missing features, and attempts to show the supported content. The notice
remains visible if rendering fails. An unsupported contract major prevents
embedded rendering and asks for a Flowview upgrade. A newer `authoredWith`
alone does not show a warning. Standalone/workbench/Forge rendering also shows
compatibility notices, while retaining its existing best-effort rendering.

The host-independent checker is exported from the plugin as
`FlowviewCompatibility`. Company integrations rendering directly in a component
can call `FlowviewCompatibility.check(spec)` before mounting their viewer and
present the same `messages` / `status`; it has no DOM or frame dependency.

Upgrade messages target the Backstage maintainer, not the reader's browser.
The installed checker must be upgraded once to establish this baseline:
previous builds cannot retroactively learn how to show these notices.

The read API should deliver authorized specs and compatibility declarations
even when its renderer is older. Do not filter newer diagrams out of the list
or return an empty association set on compatibility mismatch. If company-side
indexing cannot understand a future format, retain generated association data
from the designs build and report that format explicitly. Authentication,
per-diagram visibility, content revision checks and payload limits still apply.

## Releasing a new capability in the company fork

`src/compatibility.js` is the release identity and feature registry. Version
0.1.0 establishes the compatibility-aware baseline for the existing feature
set; it does not reconstruct historical introduction versions.

1. Bump the renderer `version` for the internal release. Keep `baseline` and
   existing feature `since` values unchanged.
2. Register new feature IDs with a human-readable label and their first release
   in `features`. Extend `detect()` for new fields or behavior. Panel types are
   detected by type automatically, but their registry entry must specify the
   correct first release. Tests require coverage for every supported panel.
3. An incompatible spec format needs a contract-major decision as well. Panel
   additions normally use a new capability and release, not a contract bump.
4. Run `python3 tools/build.py` and, in `apps/backstage`, `npm run build:viewer`.
   Commit all generated runtime, compatibility and viewer artifacts. Run the
   tests and package the editor/viewer from that same commit.
5. Publish the internal release from `backstage-diagrams` and deploy its editor
   image. The separate Backstage app repo updates its plugin pin through its own
   PR and release cycle; compatibility notices cover the interval between the
   editor deployment and the Backstage upgrade.

New behavior within an existing panel also needs its own feature ID and detector
when old renderers would omit or misinterpret it. No versioning system can infer
an unregistered future semantic change. The company release process is
responsible for maintaining these declarations.
