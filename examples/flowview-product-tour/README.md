# Flowview · from Claude to Backstage

Open [the walkthrough](flowview-product-tour.html), or edit its
[spec](flowview-product-tour.spec.json) and [coverage ledger](flowview-product-tour.ledger.md).
The tour explains how a fictional doorbell story becomes a reviewed diagram
that a teammate can find from a service page.

| Tab | Story | Stops |
|---|---|---|
| Create | Connect an empty folder, supply a business story, HLD, or Honeycomb trace, and ask Claude for a draft. | 8 per source |
| Reconnect | Reopen the accepted files and ask for clearer resident-facing wording. This is an alternative entry to Create. | 7 |
| Review | First creation checks an empty baseline and accepts a draft. Update existing catches an unsupported claim, discards the draft, requests a correction, and reviews it again. | 6 / 10 |
| Backstage | Find the bound diagram on Recording service, jump to the recording request, expand it, and return to the service page. | 7 |

Create's source choices are tour controls. The actual Workbench
Story/Mixed/Engineering setting chooses audience detail; it does not choose
source material. The illustrative Claude conversation begins after connection.
The newest exchange stays visible beside the capture; the spec retains the
full conversation log.

Use **Review → First creation** after Create and **Review → Update existing**
after Reconnect. The diagram handoffs open the Review section; they do not
select its path. First creation uses a representative, source-neutral candidate,
not a recorded result of one of the three illustrative source conversations.

The diagrams summarize the process above the changing evidence. Both entry
diagrams read left to right. Review shows direct acceptance on the main route
and correction as a loop back to human review. Backstage follows a compact
two-row route. The saved Standard layouts use a 24-column grid, with readable
step captions at left and a larger evidence panel at right. Narrow screens
stack the panels and let the process map scroll horizontally; short screens
scroll the page instead of shrinking the text.

## Evidence and product boundaries

The six-beat story comes from [the fictional doorbell spec](../canon/specs/doorbell.json):
quiet porch → button event → recording request → stored clip metadata →
queued notification → notification sent. The [happy trace](../canon/traces/happy.json)
supports the service spans and queue-to-notification link. It does not prove the
physical press, resident-app receipt, playback, or a failure outcome.

**Commit update** accepts the proposed spec and ledger together in the local
diagram folder. It is not a Git commit or publication. The repository review
hop is conceptual; Backstage reads a separately published snapshot. The local
Backstage fixture demonstrates one associated spec, not company SSO, a GitHub
loader deployment, or a populated multi-spec dropdown. Explicit Component/API
bindings create associations; a text mention does not.

Reopening a folder restores accepted files and Workbench history. A new Claude
conversation needs fresh setup and does not inherit native chat memory. See
[folder sessions](../../docs/folder-agent-session.md) and the
[Backstage plugin](../../apps/backstage/README.md) for the underlying behavior.

## Screenshot provenance

Original PNGs remain in [screenshots](screenshots/), embedded byte-for-byte in
the spec and portable HTML. This revision changes layout and narration, not
the captured product UI. The archive also retains captures omitted from the
shorter tour; the spec identifies active screens.

- New-build captures came from the local landing page and Workbench on
  2026-10-07. `agent-first-request-*`, `agent-working-empty-diagram`, and
  `agent-review-ready-empty-diagram` show actual states of a local disk-backed
  empty-folder fixture. Copy request registers the request before Agent working
  appears; the ready state follows submission of a candidate spec and ledger.
- `reconnect-*` and `resume-folder.png` show a real saved-folder fixture.
  Focused captures omit one-time connection IDs. Adjacent YOU/CLAUDE dialogue
  is illustrative, not a captured transcript.
- `first-create-neutral-*` shows the empty Current scaffold, a representative
  first proposal, its ledger, and its Applied receipt.
- `update-*` shows an existing accepted baseline, a wording-only candidate,
  its Not applied receipt, a second corrected proposal, and its Applied receipt.
  The accepted files remain unchanged between the two proposals.
- `review-correction-illustrative*` is a labeled conversation illustration.
- `backstage-*` came from the React plugin's local preview shell with fictional
  catalog data and a reference adapter, not a company deployment.
- `*-wide.png` composites put the complete source window beside a magnified
  detail of the same capture. Orange outlines mark real controls for the tour;
  they are presentation annotations.

## Regenerate and check

```sh
python3 tools/build.py
node tools/validate.js examples/flowview-product-tour/flowview-product-tour.spec.json
python3 tools/build_index.py
python3 examples/flowview-product-tour/build.py
```

Check all 54 path/step states, including backward seeks and source changes.
At 1280×800 and 1440×900, verify readable captions, decoded images, complete
process maps, and non-overlapping panels. Check the stacked layout at a narrow
width, the final node handoffs, and the distinction between local acceptance
and separate publication. Saved captures are evidence illustrations; their
pictured controls do not operate the product.
