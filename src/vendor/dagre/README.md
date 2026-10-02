# Editor layout dependency

`dagre.min.js` is the official self-contained browser distribution of
[@dagrejs/dagre 3.1.1](https://github.com/dagrejs/dagre), including
[@dagrejs/graphlib 4.0.5](https://github.com/dagrejs/graphlib). Both are MIT,
Copyright (c) 2012–2014 Chris Pettitt; their identical license is in `LICENSE`
and the distribution's legal notice is embedded in the script for portable HTML.
The bundle has no runtime network requests or external dependencies.

Reproduce from the repository root with `python3 tools/vendor-dagre.py`.
The script downloads the pinned npm tarball, verifies its SHA-512 integrity,
copies the upstream minified browser build and embeds its legal notice. It
removes the external license/source-map comments because portable HTML has no
sidecar files. Updating requires explicitly reviewing and changing the version,
integrity and bundled graphlib version; inspect the upstream code and release
changes, then run the planner, browser and source-assembly tests.

The source manifest includes this only in `builder.workbench.js`. Viewer exports,
backend and native viewers use saved floats and do not contain Dagre. The planner
uses deterministic insertion order and top-to-bottom layered layouts, recursively
packing groups using renderer padding. Only positions are used, never Dagre's
orthogonal edge paths. Input is bounded to 150 nodes, 150 groups, 500 connections,
and 20 group levels to keep a synchronous one-shot edit small. Crossings and
edge/node intersections are possible, especially between groups and in cycles.
