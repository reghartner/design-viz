# Company integration handoff: Flowview on Forge

## Scope

The repository-side implementation is complete when its local checks pass.
The external agent has no access to the company's Confluence Cloud. The company's
agent owns registration, installation, real-platform validation and rollout.
Do not interpret a local preview as a deployed Forge app.

Keep editing outside Confluence. The macro imports a snapshot from JSON or a file;
the workbench offers **Export for Confluence** and **Copy JSON for Confluence**.
Do not add direct publishing, an embedded workbench, an attachment synchronizer,
or external storage as part of this integration.

## Architecture and persisted contract

| Surface | Implementation |
|---|---|
| Shared JSON handoff | `src/confluence.js`, used by the workbench, Forge app and CLI |
| CLI for authoring agents | `tools/confluence-export.js` |
| Production Forge entry | `apps/confluence/src/entry.mjs` |
| Import and viewer UI | `apps/confluence/src/app.mjs` and `index.html` |
| Shared renderer build | `apps/confluence/build.mjs` concatenates the repo engine through esbuild |
| Local-only simulated bridge | `apps/confluence/src/preview.mjs` |
| Tests | `tests/confluence.test.js`, `apps/confluence/tests/` |

The `flowview` block macro uses Custom UI for both its view and custom config.
`view.getContext()` supplies `extension.config` and
`extension.macro.isConfiguring`. The configuration UI submits:

```js
await view.submit({
  config: {
    specJson: "<compact original spec JSON>",
    section: "all", // or a 1-based section ordinal string in rendering order
    focus: "spec",  // spec | home | data
    skin: "spec"    // spec | aurora | daylight | editorial | terminal | pastel | blueprint
  }
});
```

These are string fields; retain their names when adapting host integration.
`view.close()` cancels. Rendering and previewing never submit. Source navigation
uses `router.open()`. Do not introduce `useConfig`/UI Kit simply to wrap this
vanilla-JavaScript Custom UI resource. Check current bridge documentation if the
site reveals different refresh behavior after configuration submission.

There is no backend resolver and no Confluence API permission to configure.
JSON is stored in the macro, so there is no independent app database ACL to
maintain. Verify access through real page restrictions rather than adding a
separate unrestricted document service.

## Register and deploy on the company side

Use a company-owned Atlassian developer account and Node 24. From the repo:

```sh
cd apps/confluence
npm ci
npm run verify
npm run forge -- login
npm run forge -- register
npm run forge -- lint
npm run forge -- deploy --environment development
npm run forge -- install --environment development --product confluence --site YOUR-SITE.atlassian.net
```

`manifest.yml` intentionally contains an all-zero, unregistered app ID. Register
once and retain the real ID in the company integration checkout. Do not repeatedly
register the same app when upgrading it. No developer credentials belong in git.
If the company already registered an app for this project, use its existing ID.

The macro uses `styles: unsafe-inline` because the renderer emits dynamic SVG
style attributes and CSS variables. Scripts and bundled fonts are local resource
files; external egress and inline/eval script permissions are not needed. The
manifest intentionally omits the macro's fixed `viewportSize` so content can
auto-size. Its configuration modal uses `max`.

After validating development, promote to the desired Forge environment and
enable the appropriate internal distribution settings. A production deployment
alone is not proof that non-contributor colleagues can access it.

## Required acceptance run inside Confluence

1. **Insert and reload:** export `src/starters/homemap-story.json`; insert the
   macro via file import, save, publish and reload. Repeat using pasted JSON.
   Reopen configuration and verify the source and selected display settings.
2. **Interaction:** play/pause, select Internet down step 3, check the failed hop,
   step to the earlier alternate ending, then switch Home/Data flow. Confirm
   state and step stay aligned. Test reduced motion and a narrow page column.
3. **Complex trace:** import `src/starters/complex-trace.json`; test lane routing,
   Auto/Fit width/Readable, service-internal timing and concurrent spans.
4. **Multiple instances:** put two different macros on one page. Updating one
   must not alter the other. Check full-width pages and columns for resize loops
   and excess whitespace, particularly after toggling Home/Data flow.
5. **Draft semantics:** preview a changed export, cancel, and confirm the old
   published macro remains. Save in an unpublished page draft and check the
   published view from another session. Publish and verify the new snapshot.
6. **Copies and history:** copy the macro/page; change the copy and ensure the
   original is independent. Restore an older page version and verify its JSON
   and display configuration. Do not assume these semantics from local tests.
7. **Access:** restricted page, view-only reader and edit-capable author. Verify
   the viewer works for authorized readers and does not expose content to a
   reader who cannot access the page. Test non-developer colleagues before rollout.
8. **Failures and limits:** invalid JSON, broken step IDs, denied save and a
   payload near 128 KiB. Confirm errors preserve input and don't save an old
   preview. Measure both escaped configuration payload size and raw spec size;
   lower the app bound if the host rejects a supported payload. Never truncate.
9. **Platform behavior:** check CSP console errors, bundled fonts, source links,
   stale configuration after save, mobile web and browser back/forward. PDF/Word
   output and native mobile are explicitly outside this version's acceptance.

Record the tested app ID/environment, company site, revision, browser and results
in the company's tracking system. Report any integration fixes back as focused
PRs against the host adapter; avoid copying or rewriting the shared renderer.

## References checked for this implementation

- [Macro module and Custom UI configuration](https://developer.atlassian.com/platform/forge/manifest-reference/modules/macro/)
- [Custom macro configuration and submission](https://developer.atlassian.com/platform/forge/add-custom-configuration-to-a-macro/)
- [Custom UI resources and bridge](https://developer.atlassian.com/platform/forge/extend-ui-with-custom-options/)
- [Content security permissions](https://developer.atlassian.com/platform/forge/manifest-reference/permissions/)
- [App distribution](https://developer.atlassian.com/platform/forge/distribute-your-apps/)
- [Currently unavailable Forge capabilities](https://developer.atlassian.com/platform/adopting-forge-from-connect/connect-forge-equivalences/connect-forge-capabilities-notavailable/)
