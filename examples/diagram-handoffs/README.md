# Diagram handoffs

Four separate documents show a fictional doorbell event fan-out: an overview,
notification delivery, data ingestion, and automation. Each overview endpoint
is a `node.handoff`, not a nested detail section. The source is an illustrative
design, not a claim about a real product or measured execution.

Build linked pages for your own hosting directory:

```sh
python3 tools/build.py
python3 examples/diagram-handoffs/build.py \
  --base-url http://localhost:8765/diagram-handoffs/ \
  --out /tmp/flowview-demo/diagram-handoffs
python3 -m http.server 8765 --directory /tmp/flowview-demo
```

Open `http://localhost:8765/diagram-handoffs/overview.html`. Each arrow opens
another document in a new tab. The build changes only generated output;
committed specs retain clearly fictional placeholder URLs. For another device,
use the server's reachable address as `--base-url`.

The overview source is [diagram-handoffs.json](../../src/starters/diagram-handoffs.json).
The workbench's **Event fan-out handoffs** template contains it.
Replace its placeholder URLs or configure a host resolver for its spec IDs.
The three matching source documents are `push.spec.json`, `lake.spec.json`
and `action.spec.json` in this directory. All four stories are authored
independently; navigating between them does not transfer playback or execute
downstream behavior.
