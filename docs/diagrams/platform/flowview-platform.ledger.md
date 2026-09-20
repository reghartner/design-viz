# Flowview platform — presentation coverage ledger

Source: repository implementation and guides at `aac72e037a8b9cbc885135b9f8b59b4611dd8ed8`. Updated September 20, 2026.

Audience: engineers and stakeholders presenting the platform this week. Question: how do designs become discoverable, reviewable stories that stay connected to code? This is an implementation-grounded platform walkthrough and company deployment pattern, not a claim of company rollout. All diagram timings are illustrative. Custom edge kinds distinguish API transport from conceptual data/build/review handoffs.

## Sources and coverage

| ID | class | HLD anchor | fact | state |
|---|---|---|---|---|
| 1 | flow | [docs/runtime-compatibility.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/runtime-compatibility.md) — "The company fork of Flowview owns engine, panel, editor and compatibility changes." | Fork/designs/Backstage ownership | covered @ page.blocks[0].tabs[0] |
| 2 | flow | [docs/workbench-catalog-sync.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) — "The static editor never needs to contact Backstage." | Reviewed catalog snapshot is bundled in nginx | covered @ page.blocks[0].tabs[1] |
| 3 | flow | [apps/backstage/README.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) — "The renderer has no request transport." | Host-owned reads and trusted native rendering | covered @ page.blocks[0].tabs[2] |
| 4 | flow | [docs/github-drift-automation.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) — "It does not run watched code" | Source scanning produces evidence only | covered @ page.blocks[0].tabs[3] |
| 5 | flow | [docs/github-drift-automation.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) — "Report closure/merge alone is not approval." | Explicit human dispositions | covered @ page.blocks[0].tabs[4] |
| 6 | flow | [docs/canon.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) — "Missing telemetry is unknown, not a failure." | Reference trace and isolated incident evidence | covered @ page.blocks[0].tabs[5] |
| 7 | flow | [docs/build-entrypoints.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/build-entrypoints.md) — "entrypoints" | Shared assembly of host artifacts | covered @ page.blocks[0].tabs[6] |
| 8 | flow | [examples/backstage-e2e/README.md](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/examples/backstage-e2e/README.md) — "Neither setup nor CI merges PRs automatically." | Portable two-repository integration rehearsal | covered @ page.blocks[0].tabs[7] |

## Storyboard

| Tab / step ID | Actor/action | Incoming state → visible change | Evidence |
|---|---|---|---|
| 1 · Ownership / engine | Build engine and panel features in the company Flowview fork; publish a versioned release. | Prior state on this path → ownership: A new panel starts in the Flowview fork. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/runtime-compatibility.md) |
| 1 · Ownership / editor-release | The designs repo pins that release and builds the external workbench into its nginx image. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) |
| 1 · Ownership / editor-host | Authors open the workbench from the designs deployment. Backstage remains the reading surface. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) |
| 1 · Ownership / approved-data | The authenticated read service exposes approved specs from the designs repo. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 1 · Ownership / plugin-release | Backstage upgrades its pinned plugin through its own PR and app release. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/runtime-compatibility.md) |
| 1 · Ownership / ship-backstage | The Backstage deployment contains its renderer, styles, icons and fonts. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 1 · Ownership / read | At viewing time, Backstage fetches authorized JSON. It executes only its installed renderer. | Prior state on this path → ownership: Spec revision and renderer version are independent. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 2 · Author / fetch | A daily CI job requests processed Backstage catalog entities; repository-file mode is also available. | Prior state on this path → stage: IMPORT | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) |
| 2 · Author / catalog-pr | Validated, changed choices open a catalog-only PR. An unchanged export creates no new diff. | Prior state on this path → stage: REVIEW | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) |
| 2 · Author / bundle | After review and merge, the normal image deployment includes the approved catalog.json. | Prior state on this path → stage: BUNDLE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) |
| 2 · Author / pick | New workbench projects load local service, API and operation dropdowns. The browser need not call Backstage. | Prior state on this path → stage: AUTHOR | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) |
| 2 · Author / anchor | The author binds nodes, preserves the HLD link, and adds reviewed code references to stable step IDs. | Prior state on this path → boundary: Catalog sync never invents or updates authored code anchors. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 2 · Author / review-story | Review the spec and its source pins. Canonical promotion is an explicit human decision. | Prior state on this path → stage: SPEC REVIEW | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 2 · Author / bad-catalog | A failed or invalid import stops publication. The last approved catalog remains available. | Prior state on this path → stage: REFRESH FAILED | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/workbench-catalog-sync.md) |
| 3 · Backstage / associate | Approved node bindings automatically place the diagram on the matching service and API pages. | Prior state on this path → reader-state: Display names and repository URLs do not infer service identity. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 3 · Backstage / select | The reader selects a diagram or a linked step from the service association list. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 3 · Backstage / fetch | FetchApi and the authenticated proxy request the selected approved spec revision. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 3 · Backstage / response | The read API enforces viewer access and returns that exact approved JSON revision. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 3 · Backstage / mount | After compatibility checks, the installed renderer mounts into an owned ShadowRoot and opens paused. | Prior state on this path → reader-state: Shadow DOM isolates styles; the package remains trusted host JavaScript. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 3 · Backstage / navigate | Readers step through either outcome and open saved code, API, or external editor links explicitly. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 3 · Backstage / stale | If that revision is unavailable, the API returns HTTP 409. Refresh diagrams before fetching again. | Prior state on this path → reader-state: No silent substitution of a newer spec for an older step index. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 4 · Detect drift / start | The shared scanner runs weekday mornings at 08:23 America/New_York, or on manual dispatch. | Prior state on this path → status: READING | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 4 · Detect drift / registry | Read the checked-in registry, registered specs, code reference pins and prior drift decisions. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/tools/canon/github.mjs) |
| 4 · Detect drift / source | Read immutable source blobs at the reviewed pin and the current source default-branch revision through the API. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 4 · Detect drift / compare | Locate each unique literal anchor range and compare its text. Unrelated line movement alone is ignored. | Prior state on this path → status: COMPARING | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 4 · Detect drift / changed | Changed anchored text identifies every affected diagram and step. This still does not establish behavioral impact. | Prior state on this path → status: DRIFT | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 4 · Detect drift / report | Create or reuse one evidence PR for the changed reference scope, plus Markdown/JSON reports and an Actions summary. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 4 · Detect drift / clean | If anchored content is unchanged, record a clean scan. No behavioral decision or baseline update is needed. | Prior state on this path → status: CLEAN | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 4 · Detect drift / repair | If source or anchors cannot be resolved, save repair evidence and fail the scan visibly; expected behavior stays unchanged. | Prior state on this path → status: REPAIR | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / read | The maintainer reads the code diff and every affected diagram/step, then determines whether behavior changed. | Prior state on this path → gates: A report PR is evidence, not automatic behavioral approval. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / no-impact | For a harmless change, the maintainer applies flowview/no-impact and closes the report. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / validate | The decision runner verifies the report, live actor permission, exact disposition and current evidence before accepting it. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / accept | Commit the exact reviewed source pin and audit decision together. The expected narrative stays unchanged. | Prior state on this path → outcome: snapshot update | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / regression | For a regression, the maintainer links a real team issue, sets flowview/regression and closes the report. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / record-regression | After validating the regression decision, write its audit state while retaining the expected story and accepted source pin. | Prior state on this path → outcome: snapshot update | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / intended | For intended behavior, revise the spec and source pin in an ordinary PR; an agent may assist the author. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 5 · Human review / publish | The reviewed spec update changes the approved story and pin together; the next published snapshot is discoverable. | Prior state on this path → outcome: snapshot update | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/apps/backstage/README.md) |
| 5 · Human review / closed | Closing or merging a report with no disposition leaves the baseline unchanged. A later scan reuses that report. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/github-drift-automation.md) |
| 6 · Trace evidence / import | Import exported trace JSON and retain only supported operational identity, timing and error attributes. | Prior state on this path → status: IMPORT | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 6 · Trace evidence / map | Match exact service/operation selectors; ambiguous or missing matches remain visible. Do not guess concurrency from timestamps. | Prior state on this path → status: MAP | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 6 · Trace evidence / approve | Explicitly approve the sanitized reference mapping against the spec revision. Company integration applies real repository review policy. | Prior state on this path → status: APPROVE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/backstage-integration.md) |
| 6 · Trace evidence / expectation | Read the approved reference and authored expectations before comparing an incident trace. | Prior state on this path → status: COMPARE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 6 · Trace evidence / incident | Supply a new incident trace. Environment mismatches block comparison; missing measurements remain unknown. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 6 · Trace evidence / overlay | Build an isolated alternate at the first differing beat. Preserve only the unchanged prefix and use independent divergent steps. | Prior state on this path → status: PROPOSE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/backstage-integration.md) |
| 6 · Trace evidence / propose | A human or agent may edit the alternate and propose it through normal spec review; comparison alone never changes canon. | Prior state on this path → status: REVIEW, limits: snapshot update | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/canon.md) |
| 7 · Ship features / module | Add a panel type in its own module. Reuse shared folding, controls and lifecycle helpers. | Prior state on this path → stage: MODULE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/panel-modularity.md) |
| 7 · Ship features / assemble | Named entrypoints assemble standalone, workbench, backend, native Backstage and Forge artifacts. | Prior state on this path → stage: BUILD | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/build-entrypoints.md) |
| 7 · Ship features / verify | Review source changes and run the host tests plus pinned Chromium browser contracts. | Prior state on this path → stage: VERIFY | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/tools/browser-tests/README.md) |
| 7 · Ship features / release | Register the feature requirement, bump the renderer release, regenerate artifacts and publish internally. | Prior state on this path → stage: RELEASE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/runtime-compatibility.md) |
| 7 · Ship features / author | The designs repo upgrades its editor. Exports stamp the spec with its required renderer features. | Prior state on this path → stage: AUTHOR | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/runtime-compatibility.md) |
| 7 · Ship features / upgrade | Backstage upgrades through its own PR and release. Its installed renderer can show the new capability. | Prior state on this path → stage: COMPATIBLE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/runtime-compatibility.md) |
| 7 · Ship features / older | If Backstage is older, show an upgrade notice and supported content. An unsupported contract major prevents rendering. | Prior state on this path → stage: UPGRADE NEEDED | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/docs/runtime-compatibility.md) |
| 8 · Rehearsal / create | Generate two local Git repos: a mock company and a designer. The sample main branch remains healthy. | Prior state on this path → stage: CREATE | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/examples/backstage-e2e/README.md) |
| 8 · Rehearsal / seed | The production importer makes a Catalog API GET and seeds three sample services and three APIs. | Prior state on this path → stage: SEED | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/examples/backstage-e2e/README.md) |
| 8 · Rehearsal / view | Real Backstage ingests the sample catalog and loads the designer plugin through its authenticated proxy. | Prior state on this path → stage: VIEW | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/examples/backstage-e2e/README.md) |
| 8 · Rehearsal / branches | Create isolated refactor and timeout branches. Each change targets referenced recording code. | Prior state on this path → selected node / edge focus | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/examples/backstage-e2e/README.md) |
| 8 · Rehearsal / refactor | The refactor changes referenced text but preserves behavior. The scanner raises evidence for human review. | Prior state on this path → stage: REFACTOR, proof: Run the source contract tests for behavioral evidence; the scanner only reads source. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/examples/backstage-e2e/README.md) |
| 8 · Rehearsal / timeout | The timeout experiment breaks the sample storage contract and suppresses its recording/notification outcome. | Prior state on this path → stage: REGRESSION, proof: A real regression in fictional code. This is not a company incident. | [source](https://github.com/reghartner/design-viz/blob/aac72e037a8b9cbc885135b9f8b59b4611dd8ed8/examples/backstage-e2e/README.md) |

## Branches

| Tab / path | Shared prefix | First different beat | Endpoint |
|---|---|---|---|
| 2 · Author / Publish choices | base path | fetch | review-story |
| 2 · Author / Refresh failed | fetch | bad-catalog | bad-catalog |
| 3 · Backstage / Open diagram | base path | associate | navigate |
| 3 · Backstage / Revision changed | associate, select, fetch | stale | stale |
| 4 · Detect drift / Changed source | base path | start | report |
| 4 · Detect drift / No drift | start, registry, source, compare | clean | clean |
| 4 · Detect drift / Reference unreadable | start, registry, source | repair | repair |
| 5 · Human review / No impact | base path | read | accept |
| 5 · Human review / Regression | read | regression | record-regression |
| 5 · Human review / Intended change | read | intended | publish |
| 5 · Human review / Closed only | read | closed | closed |
| 7 · Ship features / Both upgraded | base path | module | upgrade |
| 7 · Ship features / Backstage behind | module, assemble, verify, release, author | older | older |
| 8 · Rehearsal / Non-breaking change | base path | create | refactor |
| 8 · Rehearsal / Breaking change | create, seed, view, branches | timeout | timeout |

## Checkable expectations

- Read succeeds only with the selected authorized revision. The HTTP 409 branch ends before mount; switching back to the read path clears the warning.
- Catalog refresh failure does not imply loss of the last approved snapshot and never updates code references.
- Unreadable source is a failed scan, not a clean result. Plain report closure does not advance a baseline.
- Regression review preserves the expected story and pin; an intended behavior change uses a spec PR.
- Trace evidence stays separate from expected behavior. Missing observations are unknown; the timeout screenshot is explicitly an authored example, not a trace-generated artifact.
- New capabilities come from a pinned renderer release, never JavaScript fetched from a spec repository.
- Every path opens paused. Image panels are static reference captures, not changing live applications.

## Capture provenance

Actual local Backstage running the plugin copied from `aac72e037a8b9cbc885135b9f8b59b4611dd8ed8` at localhost:3001, with an isolated backend at localhost:7087. The existing fictional rehearsal catalog/read API supplied data. Guest auth is local demonstration auth. The latest native artifact is used; capture verified one native viewer and zero iframes. No company data or credentials are in these screenshots.

- `backstage-native-home.jpg`: happy-path resident outcome.
- `backstage-native-links.jpg`: real node reference menu on the recording step.
- `backstage-native-timeout.jpg`: authored storage-timeout endpoint with no resident notification.

## Scope and presentation choices

- Detailed installation commands, exhaustive routes, credential configuration, retry mechanics and every review refusal are linked rather than repeated; this is a presentation tour, not an operations manual.
- The shared scanner schedule is weekdays at 08:23 America/New_York. The portable rehearsal has its own daily drift template; catalog refresh is daily. These are separate configured workflows.
- Company repo and host labels denote roles, not newly created repositories or deployed production services.
- The existing detailed `../backstage/` guide remains historical authoring provenance; this is a newly sourced presentation, not a silent rewrite of that ledger.
- Presentation uses a full-width diagram with attached step controls; Diagram + panels preserves the supporting side-by-side view. Backstage close-up retains the same steps while showing the capture at readable size.
- The full illustrated spec exceeds the manual Forge snapshot budget; use the portable HTML or individual text-only chapters for that route. No export limit is changed.

## Validation

- Normal page build: zero validator errors and zero warnings; compatibility metadata derived with the stamping CLI.
- Independent SOL review found no actionable factual or branch-state errors against the pinned implementation.
- Chromium visited all 81 path-step combinations, including success-to-alternate switches, with matching captions and zero JavaScript errors. The full page made only its initial HTML request.
- Every path endpoint was checked against the expected folded table and state panels. This is a semantic check beyond JSON validation.
- All 38 layout/width combinations were exercised at 1600 and 1100 pixels: no page-level horizontal overflow; every visible embedded image decoded. Full-width Presentation, Diagram + panels, and Backstage close-up retain live controls.
- Presenter mode and offline file opening/chapter navigation passed. Source links remain explicit outbound navigation.
- Eight static PNGs were captured from the generated Ambient views, without altering the rendered CSS. The current Backstage menu screenshot uses a viewport capture so the actual popover remains visible; captions were allowed to finish their transition before capture.
- This validates local presentation and fictional host captures, not company SSO, production deployment or installed Confluence policy.
