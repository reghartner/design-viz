# Saved geometry and explicit reader Views

`diagram.sectionLayout` saves panel, diagram and control placement. Its presence
does not request another reader View. Keep placement-only geometry. Use canonical
Tab Views or deliberately named `diagram.layouts` arrangements when readers need
different perspectives. See [section layouts](section-layouts.md) and
[Tab Views](tab-views.md) for the supported authoring and link contracts.

## Upstream inventory

Audit baseline: `d4e86e4dd3dbd46b366192d7b08045112da43ad6` (upstream `main`,
2026-10-14). The audit parsed every tracked JSON file recursively, including
`examples/`, `src/starters/`, `docs/diagrams/`, `diagrams/`, `company/`, test
fixtures, and `canon.json`; it was not limited to the example directory.
The baseline contains 66 `sectionLayout` objects in 24 files: 9 top-level
diagram geometries and 57 named-arrangement geometries. Ten of the latter are
in four test-fixture files. Upstream `canon.json` has an empty `diagrams` array;
there are no matching specs under upstream `diagrams/` or `company/`.

Paths below are repository-relative. Section and tab indexes are zero-based.

| Spec | Diagram(s) | Classification and action |
| --- | --- | --- |
| `docs/diagrams/doorbell-perspectives/doorbell-perspectives.spec.json` | `page.sections[0]` | Intentional distinct perspectives. The prose explicitly says to switch between **Resident story** and **Data flow**; the ledger requires both. Convert to explicit `layout` / `flow` arrangements. |
| `docs/diagrams/thermal-doorbell/thermal-doorbell.spec.json` | `page.sections[0]` | Intentional distinct perspectives. The prose and ledger require both views over the complete timeline. Preserve **At the door** and **Data flow** as explicit `layout` / `flow` arrangements. |
| `docs/diagrams/backstage/backstage.spec.json` | `page.blocks[0].tabs[6].sections[0]` and `tabs[7].sections[0]` | The **Deployment map** and **Viewer walkthrough** labels were explicitly authored. The secondary Data flow intent is uncertain from prose alone. Conservatively preserve both existing choices with explicit `layout` / `flow` arrangements rather than silently removing either. |
| `examples/app-screens/app-screens.spec.json` | `page.sections[0]` | Placement only: app screens and playback accompany the graph. Keep the geometry; no additional View is needed. |
| `examples/app-screens/phone-dates.spec.json` | `page.sections[0]` | Placement only: three device presentations show date changes on one timeline. Keep the geometry. |
| `examples/independent-extraction/before.spec.json` | `page.sections[0]` | Placement only: a graph and job panel demonstrate extraction. Keep the geometry. |
| `src/starters/operation-cost.json` | `page.sections[0]` | Placement only: ambient graph and cost panel. Keep the geometry. |
| `src/starters/cost-six-operations.json` | `page.sections[0]` | Placement only: a cost panel and the default graph tile. Keep the geometry. |
| `examples/device-app-navigation/device-app-navigation.spec.json` | `page.sections[0]` | Already explicit **App & flow** arrangement; preserve unchanged. |
| `examples/device-app-notifications/device-app-notifications.spec.json` | `page.sections[0]` | Already explicit **App & flow** arrangement; preserve unchanged. |
| `examples/step-colors/step-colors.spec.json` | `page.sections[0]` | Already explicit **App & flow** arrangement; preserve unchanged. |
| `examples/shared-icons/shared-icons.spec.json` | `page.sections[0]` | Already explicit **Customer & monitoring** arrangement; preserve unchanged. |
| `examples/flowview-product-tour/flowview-product-tour.spec.json` | `page.blocks[0].tabs[0..3].sections[0]` | Four explicit **Walkthrough** arrangements; preserve unchanged. |
| `docs/diagrams/platform/flowview-platform.spec.json` | `page.blocks[0].tabs[0..7].sections[0]` | Nineteen explicit **Presentation**, **Diagram + panels**, and applicable **Backstage close-up** arrangements; preserve unchanged. |
| `src/starters/audio-story.json` | `page.sections[0..2]` | Nine explicit audience arrangements, including **At the home**, **Call view**, **Response desk**, and **Service flow**; preserve unchanged. |
| `src/starters/device-app-sources.json` | `page.sections[0]` | Explicit **App + sources** and **End-to-end** arrangements; preserve unchanged. |
| `src/starters/messaging-cost.json` | `page.sections[0]` | Explicit **Architecture & cost** and **Compact comparison** arrangements; preserve unchanged. |
| `src/starters/named-layouts.json` | `page.sections[0]` | Explicit **Home story** and **Service flow** arrangements; preserve unchanged. |
| `src/starters/onboarding.json` | `page.sections[0]` | Explicit **Story** and **System flow** arrangements; preserve unchanged. |
| `src/starters/security-response.json` | `page.sections[0]` | Explicit **Response room**, **At the property**, and **Service flow** arrangements; preserve unchanged. |

The four migrated diagrams retain their original saved profile objects under
the `layout` arrangement, keep the old label, and open that arrangement by
default. The explicit `flow` arrangement uses the existing automatic flow
composition. Existing `v=layout` and `v=flow` links still address the intended
arrangements. For placement-only diagrams those legacy links resolve to an
existing View instead of recreating an extra choice; exact authored IDs take
precedence. The navigation tests and the section-layout guide define that
fallback, including canonical Views.

Test data is also inventoried: `tests/fixtures/agent-intent/cases.json`,
`baseline-2026-09-28.json`, `engineering-hardened-2026-09-28.json`, and
`hardened-2026-09-28.json` (all in that directory) contain explicit Story and
Engineering layouts. These expected decisions remain valid and need no
migration. Historical generated HTML is not a source spec; rebuild affected
presentations with the current renderer when distributing them.

## Agent guidance and PR #500

[PR #500](https://github.com/reghartner/design-viz/pull/500) was inspected at
`e5d58f0a04d24186620f77a6a7fd206b454a8055`. It changes authoring instructions and
their tests to prohibit `sectionLayout` and the page composer, routing new
graphs through the graph-only arranger instead. It does not change the reader's
View enumeration or diagram buttons, so it is a workaround rather than this
product fix.

After this fix, update or supersede that PR's blanket prohibition. Geometry is
supported and the page composer can save placement without requesting extra
Views. Retain guidance to preserve intended perspectives and membership; tell
agents to express those perspectives explicitly. Choosing the graph-only
arranger can remain a separate authoring preference, but is no longer needed
to prevent implicit reader choices. Do not merge the obsolete prohibition
unchanged as though it were the product contract.

## Company integration requirement

This audit covers upstream only. It does not establish the company fork's
inventory or validate any company Backstage or Confluence installation.

Integrate the reviewed upstream commit through the company's established
upstream-pull process. In the **same company merge/PR**, inventory every company
spec containing `diagram.sectionLayout` or `layouts[].sectionLayout`, including
specs reached through `canon.json`, `diagrams/**`, and any other locations used
by that repository. Classify each diagram as placement only, intentionally
distinct reader views, or uncertain. Preserve placement; explicitly migrate
intentional perspectives and repair their deep links. Investigate uncertain
intent rather than discarding it. Do not manufacture Views for placement-only
diagrams or blindly delete geometry.

Rebuild and validate affected specs and rendered pages, compare visible choices
before and after, and test representative Backstage/Confluence presentations
where used. Report each affected diagram, classification, change or reason no
change was needed, link behavior, and verification result. Keep code integration
and all required diagram fixes in that one reviewable company rollout. Document
editing and Arrange acceptance remain desktop-only.
