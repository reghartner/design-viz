# Islanders marketing stories

Active Canon document: `islanders-marketing`. One native tab per approved story:
Member campaign, Group night, Fan event RSVP. All eight paths and the latest
approved geometry remain intact. Editing is desktop-only; the phone is a fan
experience mockup, not a mobile authoring surface.

Open locally:
http://127.0.0.1:8879/workbench/flowspec.html?diagram=islanders-marketing&theme=islanders

The original three Canon cards are retired. Their package sources and original
Canon folders are retained for recovery; only this combined document is in the
active registry. No remote deployment is implied.

## Maintenance

The generated spec and ledger are a pair. Preserve later Workbench edits before
rebuilding: reconcile user exports into the relevant source story first. Never
overwrite a newer combined export by blindly regenerating from older sources.

From the repository root:

```sh
python3 tools/build.py
node packages/sports/diagrams/islanders-marketing/build-document.mjs
node --test tests/friends-stories.test.js
node tools/validate.js packages/sports/diagrams/islanders-marketing/islanders-marketing.spec.json
node tools/visibility-check.cjs packages/sports/diagrams/islanders-marketing/islanders-marketing.spec.json packages/sports/diagrams/islanders-marketing/islanders-marketing.visibility.json
node tools/canon/library.mjs --registry canon.json --out workbench/diagrams.json --thumbnails
node packages/sports/diagrams/islanders-marketing/check-document.mjs
```

The checker uses isolated headless browsers against localhost:8879; override
with `FLOWVIEW_PREVIEW_ORIGIN` if needed. It does not use the internal browser.
Build output and preview captures live in ignored `.local/islanders-marketing/`.

Embedded images retain their dimensions. Smaller WebP encodings are accepted
only at measured PSNR >= 38 dB. Original exports are untouched. The combined
file fits the 4 MiB whole-file open limit, not the 2 MiB additive/clipboard or
Confluence limits. Use Open/file import or Canon's Edit in Workbench.

Browser draft recovery is not reliable for this image-heavy document: Workbench
stores multiple source copies, exceeding the browser storage quota. Use
**Export → Export project** before closing, and reopen the saved JSON in a fresh
Workbench session. Keep the matching authored ledger alongside it. This is an
existing storage constraint, not a claim that automatic recovery passed.
