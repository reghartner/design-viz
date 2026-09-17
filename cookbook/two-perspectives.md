# Seed — one complete flow for engineering and business readers

Use this larger example when a diagram needs both service-level detail and an
animated user story. It is deliberately fictional. Seed an agent with all three
authored artifacts, so it sees how evidence becomes a plan and then a spec:

- [Source design](../docs/hlds/doorbell-perspectives.md)
- [Storyboard, branches, motion plan and coverage ledger](../docs/diagrams/doorbell-perspectives/doorbell-perspectives.ledger.md)
- [Complete executable spec](../docs/diagrams/doorbell-perspectives/doorbell-perspectives.spec.json)
- [Built interactive page](../docs/diagrams/doorbell-perspectives/doorbell-perspectives.html)

The source follows 11 components through 18 happy-path steps. Storage rejection
ends at step 11; delayed notification ends at step 14. Both retain the local clip
and keep the visitor outside. An HTTP error is a delivered response, so neither
alternate draws a broken communication edge.

## What to learn from it

**One story, two presentations.** `diagram.steps` and `diagram.paths` occur once.
The named `sectionLayout` puts Home, camera and resident experience first. The
same complete service topology remains below the panels. **Data flow** emphasizes
the service graph with the same panels alongside/below. Switching perspectives
preserves the exact selected step and path; business readers do not receive a
shortened sequence that drops failure beats.

**Meaningful motion.** Recording starts while the porch is empty. The visitor
approaches and reaches the door. Supported handoffs animate between the correct
Home markers. The notification arrives before the resident starts walking. The
door opens as the visitor enters, then closes. The camera switches from recording
to a saved clip before the later indoor action; it is not mislabeled as live.

**Independent outcomes.** Local retention, cloud persistence, phone delivery,
and playback have separate checkpoints. A local clip can survive a cloud failure;
a cloud clip can exist while delivery remains held. The queue panel represents
this story's delivery item, not an invented total backlog.

**Readable detail.** The engineering graph uses reserved connector lanes and
short, source-defined component names. Auto / Fit width / Readable remain
available on narrow screens. The story arrangement has a large Home tile,
playback immediately below, and supporting panels before the complete graph.
Its controls tile reserves enough height for three branch rows and a wrapped
caption on a phone; checking page overflow alone will not catch a clipped caption.
Use the reader's Hide data flow control if a meeting needs to focus on people;
that does not remove any steps or edit the topology.

## Adapt it

Read the new source first. Replace this example's facts, rather than preserving
its services, protocols, schedule, clip lifecycle or notification as assumptions.
Write the new storyboard and first divergent beats, then adapt the JSON. Keep
the two perspectives on one registry; do not maintain parallel copies.

For an external project, build the adapted spec with:

```sh
python3 <VIZ>/tools/page_build.py <your.spec.json> --root <absolute-OUT> \
  --desc "<your story>" --tags home,engineering,business
```

The linked seed has a dedicated `tests/authoring-seed.test.js` drift check using
the real state-folding code. It verifies quiet recording, notification causality,
door/subject positions, local media survival, and held delivery. Browser checks
must additionally cover every path in both views, narrow layouts and reduced
motion; schema validation cannot prove those presentation properties.
