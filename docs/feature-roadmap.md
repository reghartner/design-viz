# Ranked expansion roadmap

September 13, 2026. Ranking is product judgment based on this codebase:
breadth across software/IoT, explanatory value, authoring effort, and how
much existing engine machinery can be reused. It is not a measured demand
score. Honeycomb trace import moves to the top following Chuck's suggestion.

The strongest direction is **multiple evidence-backed views of one design**:
structure, behavior, data state, constraints, and observed execution. Keep one
declarative spec, reproducible step jumps, source links, and standalone output.
The current project already has 20 widgets, layout, an inspector, typed setup
forms, undo/redo, source diffing, drafts, Mermaid import, and an agent contract;
those do not need to be reinvented.

## Ranked features

Effort is relative: S = a focused extension; M = several connected surfaces;
L = a schema or architecture change. “Built” describes the current PR stack.

September 14 update: the trace work is split into [import and panels (#50)](https://github.com/reghartner/design-viz/pull/50),
[dependency rows and lane routing (#51)](https://github.com/reghartner/design-viz/pull/51),
and [service-internal timing (#52)](https://github.com/reghartner/design-viz/pull/52).
Large-trace preview and focus are built in [#53](https://github.com/reghartner/design-viz/pull/53).
The effective-state inspector is the next PR in this stack.

| Rank | Feature | What it explains / representative use cases | Approach and scope | Effort | Status |
|---|---|---|---|---|---|
| 1 | Honeycomb trace → diagram | An actual request, service relationships, parallel calls, recorded errors | Local JSON importer, custom fields, source link, observed service board, timed waterfall, span inspection; CLI shares converter | M | Built, first slice |
| 2 | Data state table | Database writes, cache hits, idempotency records, device shadows, configuration deltas | `table`: named columns, explicit snapshots, authored added/changed/removed badges | S | Built |
| 3 | Decision and invariant checks | Authorization scope, dedupe, transaction preconditions, device safety interlocks, firmware verification | `checks`: declared checks, per-step outcome and evidence; no executable rules | S | Built |
| 4 | Resource budgets | Memory pressure, latency allowance, queue capacity, power envelope, token/cost consumption | `budget`: multiple upper bounds, explicit warning thresholds, no-data state and overflow amount | S | Built |
| 5 | Searchable document outline | Navigation in long specs and invisible tabs; edgeless narrative steps and unplaced nodes | Source-based search, exact-path inspector selection, hidden-tab reveal, ⌘/Ctrl K | S | Built |
| 6 | Scenario branches on a shared design | Success vs timeout, partition, duplicate delivery, authorization denial, recovery | Named scenario step sequences over shared topology; compare without duplicating node definitions | L | Next design pass |
| 7 | Trace ↔ HLD comparison | Expected path vs observed execution; unexpected dependencies; incomplete instrumentation | Explicit service/span-to-node mapping and evidence annotations; never equate “not observed” with “does not exist” | L | Next integration slice |
| 8 | Retry / timeout / circuit-breaker view | Attempts, deadlines, jitter windows, retry storms, open/half-open recovery, store-and-forward | Reuse offset waterfall + checks + state; add a small attempt ledger only where existing views lose meaning | M | Planned |
| 9 | Deployment and trust boundaries | Regions, AZs, tenant isolation, VPCs, edge/cloud ownership, secure boot partitions | Semantic nested containers with relationship types; distinct deployment view instead of forcing the serpentine flow layout | L | Planned |
| 10 | Replication and consistency panel | Leader/follower versions, quorum, stale reads, conflicts, CRDT or offline reconciliation | Replica rows with term/version/commit position and explicitly authored read outcomes | M | Planned |
| 11 | Queue / stream depth and ownership | Consumer lag, partitions, ordering, visibility timeout, redelivery, dead letters | Extend mailbox and budget with bounded message sets and partition lanes; preserve per-message identity | M | Planned |
| 12 | Canary and migration rollout | Cohorts, traffic split, schema compatibility, dual writes, rollback conditions; firmware fleets | Cohort tiles + checks + traffic shares; separate release version from runtime health | M | Planned |
| 13 | Source coverage and uncertainty | Which claims are sourced, missing facts, assumptions, conflicting passages | Import the existing coverage ledger into selectable anchors; show “unknown” and source excerpts without inventing values | M | Planned |
| 14 | Visual revision review | Before/after topology, changed payload fields, changed thresholds and behavior | Extend existing structural diff with a baseline/current board and navigation between changes | M | Planned |
| 15 | API / event contract inspector | Required fields, schema versions, producer/consumer compatibility, transformations | Extend contract cards and tables; initial import from a bounded OpenAPI/AsyncAPI subset | M | Planned |
| 16 | Identity / credential lifecycle | Token issuance, exchange, expiry, rotation, device provisioning and revocation | Entity lifetimes and explicit grants across a timeline; no secret material in specs | M | Planned |
| 17 | AI agent / retrieval execution | Agent tool calls, retrieval/reranking, model choice, context size, token spend and tool failure | Trace importer + table + budget + checks; add a context composition panel only if needed | M | Planned |
| 18 | Storage / data lifecycle | Retention, tiering, deletion propagation, backups, restore windows, offline buffers | Object cohorts and lifecycle transitions; reuse timeline, buffer and table first | M | Planned |
| 19 | Scheduling / contention | Thread pools, locks, leases, priority inversion, rate limits, realtime deadlines | Resource lanes with occupancy intervals, ownership and waiting reason | M | Planned |
| 20 | Architecture tradeoff comparison | Availability vs latency, cost vs fleet autonomy, consistency vs offline operation | Side-by-side explicit assumptions and scenario outputs; no fabricated benchmarks | M | Planned |

## Workbench sequence

1. **Find and orient (built):** outline search works across tabs and opens the
   existing inspector. Source changes must render successfully before a fresh
   outline item is mapped onto the preview.
2. **Inspect observed behavior (built):** trace import is reversible; malformed
   input is diagnosed without replacing the current work. Span selection is
   the same step selection the editor already supports.
3. **Explain inherited state (built):** a selected step's effective panel
   state sits alongside its sparse patch, with initial/inherited/transient
   origins, computed input history, exact source links and selectable snapshot
   JSON. Source edits clear stale values until refreshed.
4. **Scenario timeline:** insert, reorder and duplicate beats in a compact
   list; preview changed fields and show concurrent intervals explicitly.
5. **Safer structural edits:** preview reference changes for node/panel renames
   and deletions; add shortcuts for existing history without intercepting
   normal text-editor undo. Preserve native typing history.
6. **Large-document workspace:** resizable preview/inspector/source columns,
   focused section mode, persistent outline expansion and search filters.
7. **Shared definitions:** reusable service identities and panel presets with
   explicit instance overrides. Design this with scenario branches so edits
   cannot silently propagate across unrelated stories.

## Cross-domain starting points

| Design problem | Useful combination |
|---|---|
| Checkout / duplicate payment | Flow + data table + idempotency checks + observed trace |
| OAuth / tenant authorization | Trust boundary + decision checks + credential timeline |
| Cache invalidation / stale reads | Data table + replica version panel + scenario branches |
| Kafka / worker pipeline | Partition lanes + queue budget + retry ledger |
| Database migration | Schema table + compatibility gates + rollout cohorts |
| Kubernetes / region failover | Deployment view + replica health + recovery scenarios |
| Mobile offline sync | Local/server table + conflict outcomes + reconnect timeline |
| AI tool execution / RAG | Trace + retrieved-item table + token/cost budget + tool checks |
| Device shadow reconciliation | Desired/reported table + version/interlock checks + memory budget |
| Firmware update | Existing xray/tiles + signature checks + staging budget + rollback story |
| Battery camera wake path | Existing battery/PIR/screen + latency budget + wake interlocks |
| Industrial actuator control | Existing signal/timeline + safety checks + deadline occupancy |

## Design constraints

- Prefer a reusable panel over a device-specific metaphor when the meaning
  is shared: the same bounded resource view can explain RAM, bytes, or tokens.
- Keep authored outcomes separate from measurements and simulations. A check
  panel is an explanation, not a validator of the real system.
- Reuse existing widgets before adding another type. An operational scenario
  often needs a starter recipe, not a new rendering primitive.
- Preserve missing data and partial-trace warnings. Time offsets and parent
  relationships are distinct; neither proves causality, transport or retries.
- Ship each addition through renderer, validator, picker, inspector, agent
  contract, example and tests together.

## Research grounding

Trace timing is grounded in spans and their parent/context relationships,
which is why nested durations must not be added as request latency.
[OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/)

Runtime flows and deployment structure answer different questions. C4's
deployment view supports giving placement and infrastructure a dedicated
representation instead of overloading today's message-flow layout.
[C4 deployment diagrams](https://c4model.com/diagrams/deployment)

Retry behavior includes limits, backoff and jitter, supporting a future view
that represents attempts and deadlines rather than merely repeating arrows.
[AWS guidance on limiting retries](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html)

Honeycomb's documented Events export and MCP trace retrieval give separate
entry points for local-file and future account-backed workflows.
[Events export](https://docs.honeycomb.io/investigate/analyze/explore-events),
[MCP concepts](https://docs.honeycomb.io/integrations/mcp/concepts)
