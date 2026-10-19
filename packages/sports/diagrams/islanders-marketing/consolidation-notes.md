# Coverage ledger — Islanders marketing stories

Source: approved member-campaign, group-night and fan-event-rsvp specs and ledgers; user request “a new single document for those three one per tab.” Version: local approved stories, 2026-10-19.

## Consolidation scope

This is packaging, not a new story or a product feature. No questions about the
approved stories are needed. Preserve the latest user geometry, each source's
nodes, connections, captions, paths, steps, screen identities and native phone
bar. Document authoring remains desktop-only. No internal browser is used.

| Requirement | Destination | Evidence / check |
|---|---|---|
| One document, one story per tab | page.blocks[0].tabs | Member campaign; Group night; Fan event RSVP |
| Approved member journey | section member-campaign | Source data preserved; latest saved layout retained |
| Approved group-night journey | section group-night | Two source paths retained |
| Approved event journey | section fan-event-rsvp | Three source paths retained |
| Keep full branch behavior | all three sections | Native step/panel state, not flattened slides |
| Retire standalone duplicates | root canon.json and Friends publication list | Sources retained; not deleted |
| Source and imagery provenance | appended source ledgers below | No new factual/integration claims |

## Author decisions

- New Canon identity: islanders-marketing. Section IDs remain unchanged for
  reliable navigation. The member campaign is the opening tab.
- The single page legend reads “Illustrative marketing handoff.” This unifies
  the equivalent source-page legend labels; all edge kinds remain unchanged.
- Screen dimensions remain unchanged. Embedded pixels may be repackaged as
  high-quality WebP only when smaller and measured PSNR is at least 38 dB.
  Source images and source specs remain recoverable, unmodified. This keeps the
  combined document suitable for Workbench whole-file import (4 MiB).
- Per-story builders remain maintenance inputs. The combined spec is now the
  active review/edit document; do not rebuild it over later user edits without
  first reconciling those edits into the source stories.
- The three standalone Canon cards are superseded by this document. Other
  library entries are left alone unless retirement is separately confirmed.
- No renderer changes, commits, remote deployment, email, booking or data
  transfer. All source disclaimers about hypothetical integrations still apply.

## Visible-beat and state checks

The companion visibility file contains the union of the three existing files.
The source ledgers below retain each exact section/path/step/panel mapping.
Desktop checks must cover tab switching, all eight paths, forward/backward/reset
behavior, cross-tab state isolation, image decoding, iPhone status bars, import
and Canon editability. Native rendered captures must confirm legibility after
media packaging; presentation eligibility alone is not visual proof.

## Verification

- Native validation: zero errors and zero warnings. Source-parity regression
  checks pass: every non-pixel section value is unchanged, including geometry,
  all 30 unique steps, eight paths and six panels. Spec/ledger Canon copies match.
- All 63 inherited visibility expectations pass. Full engine-state walk of all
  eight paths reports zero warnings/checks. Explicit anchors verify Ticketmaster
  ticketing, the Sales Cloud lead, no-opt-in follow-up and waitlist follow-up.
- Native desktop checks at 1280 and 1440 verify every path's two screen states,
  forward/back/reset, return-to-tab isolation, all 48 decoded image dimensions,
  UTF-8 and native 9:41 phone bars. All passed. Rendered opening captures for
  all three tabs were inspected; no clipped panel content or corrupted text.
  The event no-opt-in Journey Builder/confirmation pair was also inspected.
- Canon now has six active entries: the new combined card, four earlier sports
  arcs and Copy gate. The three old standalone cards are absent. Combined card
  thumbnail, themed reader and Edit in Workbench pass.
- Combined source is 3,820,429 bytes. Whole-file import passes. Browser draft
  recovery does NOT pass: existing localStorage persistence duplicates source
  for baseline/draft and exceeds its quota. Use explicit Export project and a
  saved file; do not rely on refreshing to recover edits. No renderer/storage
  change is part of this consolidation.
- Explicit Export project produced the expected ZIP. Its saved JSON reopened
  in a fresh desktop session with all three tabs unchanged and no browser errors.
  This verifies file-based recovery, not automatic browser draft recovery.
- Local Friends prepare passed its staged-bundle verification: six active
  Canon documents, matching source specs, thumbnails and hosted starters, with
  science/sports runtime and authoring-kit contents present. No remote deploy.

## Recovery and maintenance

Original sources live in the sibling member-campaign, group-night and
fan-event-rsvp folders; their original Canon folders are retained but unpublished.
The generated spec and this ledger are mirrored together into
diagrams/friends/islanders-marketing. The local build helper is build-document.mjs.
Existing user drafts and files in Sandbox/temp are never overwritten.
