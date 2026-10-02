# Auto arrange

The workbench's **Auto arrange** button acts on the active diagram. Its dialog
warns that placement and edge settings will be replaced. Cancel leaves the
source untouched. Successful arrangement is one Undo entry; drag cards and
curve handles afterward to refine it. The diagram canvas fits the result;
this changes the current viewport, not saved camera settings.

Groups, nesting, node definitions, connection order and identity, labels,
steps, paths, panels, named views and other sections are preserved. Rows and
floats become ordinary positioned floats. Old routing, ports, bends, curve
points and label nudges are replaced with explicit ports, native cubic controls
and computed label nudges. Existing viewers need the `layout.cubic-curves`
capability to display the new routes faithfully.

Grouped graphs compare two global clustered Graphviz dot candidates (top to
bottom and left to right). Ungrouped graphs also compare two deterministic
WebCola stress layouts with Graphviz nop2 spline routing. External Graphviz
labels preserve the graph's ranks while leaving room for labels. Candidate
generation keeps at least 48 logical units between final card rectangles;
layered ranks receive additional clearance for their routed connections.
scoring uses the final viewer geometry, including ports and computed nested
group boxes: reject overlapping cards/groups and routes through unrelated
cards, then minimize nonincident crossing pairs, total route length and area.
This bounded search does not promise an optimal or crossing-free result.

There are at most four candidates, 80 nodes and 160 edges per diagram. A worker
has a 20-second deadline and is terminated on cancellation, source changes,
section changes, project retirement or builder teardown. Failure never changes
the source. Freshness is checked again before the atomic session transaction.
Native paths are stored in the spec, so opening or exporting never recomputes
layout. Moving nodes deforms their authored routes without running a layout.

## Distribution and maintenance

The workbench embeds Viz.js 3.31.0 (1,329,882 bytes) and WebCola 3.4.0
(79,814 bytes), plus shared geometry and worker code. They are initialized only
when needed, in a Blob worker. Offline/file workbenches require no CDN or npm.
A host CSP must permit `worker-src blob:` and WebAssembly compilation in the
worker; a blocked worker reports an error and leaves the spec unchanged.
Viewers, backend packages and standalone exports contain no layout engines.

`src/source-bundles.json` inventories worker sources and notices;
`tools/source-loader.cjs` embeds them with HTML-safe string escaping. Every
workbench includes MIT notices for Viz.js, WebCola and Expat, and Graphviz's
EPL-2.0 license plus its corresponding source/build URLs. The vendored bundle
and notices are pinned in `src/workbench/vendor/manifest.json`.

Run `python3 tools/vendor-auto-arrange.py` to verify the committed checksums.
`--refresh` downloads integrity-checked, pinned npm archives and reimports the
same browser bundles; normal builds are network-free. Build with
`python3 tools/build.py`. Never commit its ignored generated HTML/runtime files.

`tests/auto-arrange.test.js` includes the approved 20-node/36-edge/6-group
fixture: ten nonincident crossing pairs, no node/group overlap and no route
through an unrelated card. Browser contracts inspect the actual SVG, native
control and card dragging, cancellation, one Undo/Redo, reload and export.
