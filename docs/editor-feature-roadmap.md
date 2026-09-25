# Editor authoring checklist

Implement in this order. Each item includes its user guide update, browser
interaction coverage, independent review, and passing CI before merge.

- [x] **1. Starting state** — Camera and Device App use their typed step controls
  for initial values. Preserve advanced fields and keep step edits separate.
  Merged in [PR #218](https://github.com/reghartner/design-viz/pull/218).
- [x] **2. Notifications** — Shared Phone / Device App composer for app, title,
  and message; add/remove/reorder, clear earlier notifications, and initial state.
  Merged in [PR #219](https://github.com/reghartner/design-viz/pull/219).
- [x] **3. Protocols and lanes** — All built-in protocols are selectable; create
  and edit custom connection types and story lanes through the inspector.
  Merged in [PR #220](https://github.com/reghartner/design-viz/pull/220).
- [ ] **4. Visibility timing** — Captioned start/end controls for connections,
  bullets, and contract rows. Explain and test timing on alternate paths.
- [ ] **5. Nested prose** — Select, add, indent/outdent, and reorder nested
  bullets; small formatting helpers using the existing safe text syntax.
- [ ] **6. Drilldown mappings** — Parent/child step selectors replace mapping
  JSON, with missing-target feedback and a preview action.
- [ ] **7. Temporary state** — Carry-forward / this-step-only controls for
  supported Camera and Phone fields, with an explicit way to inherit again.

The authoring model is: what exists, its starting state, and what changes at a
story step. Raw JSON remains available for advanced fields. Existing paths,
views, Home layout editing, and catalog binding keep their current owners.
