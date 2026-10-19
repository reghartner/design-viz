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

Narrative, layout, HTML, assets and ledgers live in the sibling member-campaign,
group-night and fan-event-rsvp folders. Their image-heavy standalone specs live
only in the original Canon folders, retained but unpublished. Duplicate package
copies were removed after CI exposed the offline kit's 8 MiB envelope limit;
the retained originals were byte-verified before removal. This avoids inflating
every author's kit with retired output and leaves all safety limits unchanged.
The generated spec and this ledger are mirrored together into
diagrams/friends/islanders-marketing. The local build helper is build-document.mjs.
Existing user drafts and files in Sandbox/temp are never overwritten.


## Source ledger: Member campaign

## Coverage ledger - Islanders member campaign

Source: Chuck's conversation and /Users/chuck/Sandbox/temp/your-people-our-island.spec.json.
Updated: 2026-10-19. Desktop-only Flowview authoring.

### Accepted direction and latest revision

Chuck approved the member campaign with compact native vendor nodes, branching steps and real illustrative creative. He then exported his own panel arrangement and asked to replace the confusing content/handoff table with a marketer-facing workspace, and restore the phone's top status bar.

- Imported Chuck's latest 12:12 export into story.source.json. The graph is now left (x0/y0/w9/h10), marketing in the middle (x9/y0/w9/h10), phone right (x18/y0/w6/h17), and steps underneath (x0/y10/w18/h7), in the 24-column grid. Preserved every tile exactly, along with all nodes, edges, frame and path sequences. The builder no longer overrides panel height. Original Sandbox/temp files remain untouched. Export SHA-256: c7c551c569ee2ed045cd312db63f9afd014890349bf988e7a72c474469345049.
- Native App Screens panel destination retains its phone frame. Nine fan images include seven original screens plus two annotated content-comparison screens.
- Starting clock 9:41 restores the existing native status bar, signal and battery glyphs. It is a static illustrative mockup time, not elapsed campaign time or a battery measurement. No renderer changes.
- Stable panel ID record now names an App Screens panel titled What marketing manages, with no phone frame. Four authored images show email setup, active Contentful content, ended-offer Contentful content, and the confirmed-purchase reminder decision.
- A/B markers match the actual hero headline and button in the marketer workspace and phone. They are explicitly walkthrough annotations, not proposed customer UI.
- After Chuck questioned Salesforce fidelity, replaced the generic branded forms with reference-based focused app views: Salesforce Marketing Cloud Content Builder's content/settings/HTML tabs and email preview, Contentful's entry fields and publication sidebar, and Journey Builder's selected decision split with Purchased and Remainder paths. App chrome stays neutral; Islanders branding appears in campaign creative.
- These are authored, reference-based mockups, not live screenshots or pixel-perfect product replicas. Product chrome is reduced for the saved panel size; custom field names, content, route configuration and ticketing integration are illustrative. Pictured controls are images; native Flowview steps drive their changes. Every app image identifies itself as a mockup and has an official design-reference link.
- Latest visual workflow pass replaces geometric placeholder creative with three real assets from the official Islanders membership site. The email and landing page share the same crowd photo; Contentful shows that image as the hero asset, alongside A/B copy. Confirmation uses a membership-community photograph; regular-ticket fallback includes the official membership banner intact. These are atmospheric assets, not new benefits, real purchasers or evidence that the fictional promotion exists.
- Rebuilt fan screens with readable copy, photo-led heroes and clear CTAs. Narrowed marketing captures to 520x480 focused product views with larger type, an explicit asset thumbnail and less secondary chrome. Contentful's sidebar is outside this focused crop; Published remains visible. Salesforce email shows the selected CTA and its destination; Journey Builder keeps both paths and the condition.
- No arena map, live credentials, ticket inventory, actual purchase, invented performance metrics, or mobile authoring requirements. The phone is the depicted fan experience, not a mobile document editor.

### Story and panel jobs

A marketing manager follows a member promotion from its email promise to the destination page and ticket offer, then checks the content source and reminder decision. Alternate paths show sign-in recovery and an expired campaign link.

The phone answers “What does the fan see?” Its best moments are the promotion, matching landing page, and fallback.
The marketing workspace answers “Which copy, destination, or reminder rule does marketing manage?” Its best moments are matching A/B fields in Contentful and the Purchased path that exits before a reminder after a simulated confirmed purchase. This decision evaluates available campaign purchase data; the illustration does not claim an immediate event-triggered exit or specify a wait interval.
The four-node diagram explains responsibility and handoffs; native steps remain the navigation.

### Step × panel decisions and visible-beat evidence

All targets are section member-campaign, default/flow view. Each row gives the complete selected state; repeated marketing selections deliberately hold that workspace.

| Path / step | Highlight | Fan screen | Marketing screen / purpose |
|---|---|---|---|
| all / email | Salesforce node | email | email: selected button and URL below the photo-led email preview; subject remains on the fan screen |
| member / member | email->membership | member | content: authored landing headline, button, offer destination |
| member / cms | content->membership | member-linked | content holds: matching official photo asset and A/B copy compare directly with phone |
| member + signin / tickets | membership->tickets | ticketing | content holds: source destination still explains handoff |
| member / followup | tickets->email | confirmation | journey: Purchased, confirmed purchase; exit reminder path |
| signin / signin | email->membership | signin | content: preserve original campaign destination during sign-in |
| signin / verified | membership node | member | content holds: return to the intended landing page |
| ended / expired | email->membership | expired | ended: published replacement headline and regular-ticket CTA |
| ended / paused | content->membership | expired-linked | ended holds: A/B compare fallback with phone |
| ended / general | membership->tickets | general | ended holds: regular tickets, no expired offer reference |

Every fan screen retains the native 9:41 status bar. Backwards seeks and switching paths must restore both panels, including the reminder workspace. Whole-panel eligibility is checked by member-campaign.visibility.json; screen IDs and clock are checked with spec_walk.py --expect. A/B internals and device chrome require rendered inspection, not eligibility alone.

### Sources and node references

| Node | Binding/code applicability | Sources checked | Result |
|---|---|---|---|
| email | Illustrative third-party vendor | Conversation; prior Salesforce product-documentation lookup | No actual Islanders implementation claimed |
| content | Illustrative CMS and custom content model | Conversation; prior Contentful documentation lookup | No evidence of Islanders Contentful use |
| membership | Conceptual member website/gate | Conversation, saved spec and existing source | No invented identity-provider binding or code |
| tickets | Third-party ticketing | Official Islanders Account Manager documentation | Ticketmaster use documented; proposed campaign integration hypothetical |

Previously checked references:
- [Islanders Account Manager](https://www.nhl.com/islanders/tickets/mobile-tickets-account-manager)
- [Contentful personalization](https://www.contentful.com/help/personalization/)
- [Salesforce email automation](https://help.salesforce.com/s/articleView?id=003789825&language=en_US&type=1)

Official UI references inspected for the cleaner app revision (2026-10-19):
- [Salesforce Content Builder editor](https://trailhead.salesforce.com/content/learn/modules/content-builder-features/create-and-edit-your-content): editor tabs, button text/link settings, persistent preview. Inspected the official editor screenshot; used its light chrome and blue active-tab treatment, not a generic Islanders-colored app.
- [Salesforce Journey Builder](https://trailhead.salesforce.com/content/learn/modules/journey-builder-campaigns/build-a-journey-campaign): activity canvas, data-based decision splits and remainder paths. Inspected the official journey screenshot; adapted teal email activities, orange decision diamond, light blue connectors and green path-end exit. The adjacent rule summary is simplified; it is not represented as an exact settings dialog.
- [Contentful entry editor](https://www.contentful.com/help/content-and-entries/entry-editor/) and [sidebar](https://www.contentful.com/help/content-and-entries/entry-editor-sidebar-overview/): neutral entry form, Editor tab, locale hints, Published status, Change status and Live Preview. Inspected official entry screenshot. The campaign's content model and A/B annotations remain custom examples.
- Reference screenshots are stored only in ignored .local/member-campaign/references for inspection; no vendor screenshot has been altered to impersonate an actual Islanders account.

Official Islanders logos are reused from packages/sports/assets/islanders with provenance there. Vendor names, unchanged example integration roles and illustrative campaign outcomes come from the approved prior story. No new service or API binding is invented.

Official imagery retrieved 2026-10-19 from [Season Ticket Membership](https://www.nhl.com/islanders/tickets/membership/). Exact asset URLs, source labels, rights note and intended use are retained in assets/provenance.json. Images were inspected before use. All fan screens link to this source page; marketing screens retain the product UI reference links. No public-domain or publication-license claim is made; this is Chuck's requested local preview, not a remote deployment. Images are embedded for offline playback, with no runtime image requests.

### Verification

- Spec validator: zero errors and warnings.
- State walk: nine expanded expectations, zero warnings and checks; tests screen pairs and the native clock.
- Visibility: five whole-panel expectations pass. No claim that eligibility alone proves pixel legibility.
- Automated desktop checks at 1280 and 1440: nine fan screens, four marketing screens, all three branches, backwards/reset restoration, 9:41 clock, signal/battery glyphs, retained four vendors and native controls, no table, UTF-8 and no browser errors.
- Geometry checks preserve the imported graph and every latest saved tile exactly. No re-arrangement, auto-layout, or change to user-selected panel dimensions.
- Marketing generation rejects overflow and content extending under the footer; fan generation rejects body/footer clipping. Reviewed the four 520x480 marketing captures and the nine 390x710 fan states, then checked actual native layouts at 1280 and 1440. Compact spacing corrections preserve key content and the mockup footer. Photo crops, exact A/B copy, CTA visibility, and the native status bar remain visible in the rendered walkthrough.
- Photo-based fan screens retain PNG review captures, while the portable spec embeds high-quality JPEG (95) to fit the documented 2 MiB reader limit. Marketing screens remain PNG. The rebuilt spec is 1,567,080 bytes; build rejects a larger-than-2-MiB spec.
- Key headlines, CTAs and fields are larger than before. Fine print remains secondary at the saved desktop scale; no claim of full-size product UI or mobile editing support.
- No internal/in-app browser is used. Browser verification runs in isolated headless test contexts.
- Refreshed Canon's source copy and all six landing-page thumbnails. Friends source-parity test passes. In a fresh isolated desktop browser, verified the updated Canon reader's official design-reference link and 9:41 bar, dismissed first-visit onboarding, and confirmed Edit in Workbench opens the authoring canvas. No existing user draft was touched.

### Delivery and maintenance

Authored inputs: story.source.json, creative.source.html, phone-capture.css, marketing.source.html, build-preview.mjs.
Native output: member-campaign.spec.json plus this ledger and member-campaign.visibility.json.
records.source.json is historical input from the replaced table and is no longer used.
Desktop checks: check-preview.mjs.
Preview captures: .local/member-campaign/native-contentful-*.png, native-journey-*.png, phone-statusbar-*.png.
Canon copy: diagrams/friends/member-campaign/member-campaign.spec.json. Existing user-authorized membership and owner remain unchanged. Refresh the published copy and library after checks so reopening Canon receives the revision. Existing editable Workbench drafts are not overwritten.
No remote deployment, commit, PR change, or unrelated file edits are included.

### 12:34 export amendment — 2026-10-19

Imported the subsequent user save, SHA-256 264e5e3b83028cb9acd796470eb72897ec94d17d034004d7adef4b49a6861c1d. Preserved its exact floats (left x207.4; bottom y299.8), unchanged edges and graphFrame, Canon metadata, and all four sectionLayout tiles: graph x0/y0/w8/h13, record x8/y0/w10/h13, steps x0/y13/w18/h7, phone x18/y0/w6/h17. This supersedes the earlier 12:12 geometry described above. Original temp files remain untouched.

Rebuilt and checked at 1280 and 1440: native bar, all three paths, exact screen restoration backwards/reset, UTF-8 and zero browser errors. Spec validation remains zero errors/warnings. Explicit comparison against the saved export passes for floats, edges, graphFrame, sectionLayout and page.canon. Actual desktop capture reviewed; no source geometry was changed to improve the graph. The new independent stories do not enlarge this member campaign.


## Source ledger: Group night

## Coverage ledger — Bring the whole crew.
source: user description (conversation) and accepted top-two ideation | version: n/a | updated: 10-19-2026

This is a proposed marketing journey, not evidence of the Islanders’ deployed technology. Official imagery does not make the campaign, integration or event real. Product UI is a focused, reference-based mockup. The current user authorized development of the top two proposed stories. No questions needed: audience, illustrative premise, panels and outcomes are settled by that request and the preceding discussion. The team’s actual catalog, implementation and integrations are outside this prototype, not assumed deployed.

### Coverage
| # | class | HLD anchor | fact | state |
|---|---|---|---|---|
| 1 | flow | “starting with your top two” | A sales handoff should carry the promise, the group’s request and a clear next action—not just an email address. | covered @ group-night.paths |
| 2 | contract | “SHOW the Promotion link, SHOW the content” | Fan creative and source fields are visible, not caption-only | covered @ promo, content panels |
| 3 | service | “ticket master, contentful etc” | Industry products with distinct responsibilities; adoption unverified | covered @ nodes |
| 4 | amendment | “small updates made and sent to temp again” | Original campaign geometry preserved from 12:34 export; new stories use its visual hierarchy | covered @ member-campaign and sectionLayout |
| 5 | number | “illustrative” | 9:41 is an illustrative staging clock, not delivery timing; no elapsed-time or SLA claims | covered @ storyTime |
| 6 | failure | “branching alternate paths” | Planning help vs tickets-only handoff; no purchase invented | covered @ paths |
| 7 | number | “illustrative” | 24 people is a fictional inquiry value, never a routing threshold; Alex Morgan and Harbor Club are fictional | covered @ inquiry, handoff |
| 10 | service | “industry standard products” | Salesforce: Marketing Cloud; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.email |
| 11 | service | “industry standard products” | Contentful: Campaign content; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.content |
| 12 | service | “industry standard products” | Group site: Choose next step; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.site |
| 13 | service | “industry standard products” | Salesforce: Sales Cloud; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.sales |
| 14 | service | “industry standard products” | Ticketmaster: Ticket options; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.tickets |

### Amendments
| # | question | operator answer | date | applied at | status |
|---|---|---|---|---|---|
| A1 | Real or illustrative campaign? | illustrative; develop top two ideated stories | 10-19-2026 | all paths | active |
| A2 | Desktop or mobile editing? | Desktop-only document editing; depicted fan phone is not an editor | 10-19-2026 | verification | active |

### Decisions I made
| # | decision | evidence or reason | applied at |
|---|---|---|---|
| D1 | Use official imagery already retrieved, condensed brand headline, native phone status bar and home indicator | Preserve approved visual direction | all fan screens |
| D2 | Reference-based UI crops, not full vendor navigation or fake actual account screenshots | Readable at desktop panel size | record panel |
| D3 | Route on explicit requested help, no invented numeric qualification threshold or promised response time | Avoid unsupported business rules/affiliations | branch screens |
| D4 | No transport/API/protocol claims, automation guarantees or actual backend implementation refs | Proposed workflow; public product documentation supports capabilities only | graph and captions |
| D5 | No arena map, metrics dashboard, lead score or additional panel | Each would distract from the marketing decision | default view |

### Storyboard worksheet
#### A. Story
Audience: Islanders marketing and ticket sales/sponsorship staff; business story with requested vendor names, not an implementation diagram.
Takeaway: A sales handoff should carry the promise, the group’s request and a clear next action—not just an email address.
Story: A fan sees Bring the whole crew in an Islanders email and follows Plan your group night. The landing page matches the source photo and copy in Contentful. The organizer asks for hospitality planning for a fictional group of 24; the submitted request becomes an open Sales Cloud lead with campaign context and a next task, while the fan sees an acknowledgement rather than a reservation. On the alternate path the fan requests tickets only and reaches a clearly labeled Ticketmaster handoff, without creating a planning lead or claiming a purchase.
Most important moment: handoff—fan request and open lead side by side.
Expected evidence included: promotion creative/link, content mapping, branch input, operational record, honest fan result. Must not imply real vendor adoption, completed purchase, actual campaign delivery or real event/sponsor affiliation.

| View | Audience/task | Takeaway | Focal evidence | Density / reading order |
|---|---|---|---|---|
| default | Marketing review | A sales handoff should carry the promise, the group’s request and a clear next action—not just an email address. | handoff / record lead + phone received | Compact graph left, operational screen center, fan phone right; native steps below |

#### B. Panel plan
| Panel | Type | Meaning | Question | Best moment | Initial | Must never show |
|---|---|---|---|---|---|---|
| destination | appscreens, phone | Reported fan UI in illustrative scenario | What does the fan actually see? | handoff | promo | Confirmed booking for an inquiry |
| record | appscreens, no frame | Reported proposed workspace | Which source/record explains it? | handoff | promo | Closed sale or fabricated lead score |
Rejected: arena map, arbitrary counts, device telemetry. Native graph retains vendor responsibilities and native controls retain steps/paths.
Fan-visible items map to complete destination screens: promotion/button=promo; matching landing copy=linked; preferences=form; acknowledgement=received; ticket handoff=ticketing.

#### C. Paths
| Path | Label | Shared prefix | First different step | Ending | Unknowns |
|---|---|---|---|---|---|
| help | Planning help | promo, landing, content | inquiry | next | No open story decision; deployed implementation unverified |
| tickets | Tickets only | promo, landing, content | choice | options | No open story decision; deployed implementation unverified |

#### D. Time
Staging only: storyTime 2026-10-19T09:41, span 1m, 12h, date none. Steps are inspection beats within this illustration, not elapsed operational time. All retain 09:41; no delivery deadline, future date, battery model or reporting cadence is asserted. No physical devices/telemetry. Native phone glyphs are decorative status chrome.
| Path | Steps | Time | Source | Battery/report/freshness/day-night |
|---|---|---|---|---|
| help | promo, landing, content, inquiry, handoff, next | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |
| tickets | promo, landing, content, choice, options | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |

#### E. Step × panel matrix
All complete screen selections replace stale visible content; no overlay or field can leak between outcomes. No changing semantic node icons/tones, no code executes in this authored illustration. Edges represent proposed business handoffs, not network traces.

##### promo
Paths: help, tickets. Time: inherited staging 09:41.
Beat: Start with the invitation. The fan sees the group-night email; Content Builder shows the same creative, button and campaign destination. This is a proposed campaign, not a live offer.
Hops claimed / edges: none; focus node email. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=promo.
record: patch: screen=promo.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### landing
Paths: help, tickets. Time: inherited staging 09:41.
Beat: Follow the promise. Plan your group night opens this campaign landing page—not a generic homepage. The two choices let the organizer ask for planning help or explore ticket options.
Hops claimed / edges: email->site. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=landing.
record: patch: screen=content.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### content
Paths: help, tickets. Time: inherited staging 09:41.
Beat: Check the source against the screen. Contentful holds the same official group photo and A headline shown on the phone. B is the planning CTA. These custom fields and their website mapping are proposed.
Hops claimed / edges: content->site. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=linked.
record: patch: screen=content.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### inquiry
Paths: help. Time: inherited staging 09:41.
Beat: Ask for useful context. The example organizer requests planning help for 24 people and hospitality. This is still a form, not a lead or a booking. Routing follows the request type, not an invented group-size threshold.
Hops claimed / edges: none; focus node site. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=form.
record: patch: screen=routing.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### handoff
Paths: help. Time: inherited staging 09:41.
Beat: Submit the planning request. In this proposed handoff, Sales Cloud receives the campaign, group size and preferences. Compare the phone acknowledgement with the lead record: inquiry received does not mean seats reserved.
Hops claimed / edges: site->sales. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=received.
record: patch: screen=lead.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### next
Paths: help. Time: inherited staging 09:41.
Beat: Give sales a useful next action. The lead is still open and not contacted. The proposed task is to discuss hospitality and game preferences; no quote, reservation or response deadline is implied.
Hops claimed / edges: none; focus node sales. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: record.
destination: patch: screen=received.
record: patch: screen=task.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### choice
Paths: tickets. Time: inherited staging 09:41.
Beat: Take the other path. This fan chooses Tickets only. The proposed campaign route does not create a planning inquiry just because someone clicked a link.
Hops claimed / edges: none; focus node site. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=choice.
record: patch: screen=routing.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### options
Paths: tickets. Time: inherited staging 09:41.
Beat: Hand off to ticketing. A configured Ticketmaster destination would own availability and checkout. This preview stops at the handoff: no group discount, inventory, payment or purchase is simulated.
Hops claimed / edges: site->tickets. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=ticketing.
record: patch: screen=ticketroute.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### F. Coverage grid
| Path | Steps | destination | record |
|---|---|---|---|
| help | promo, landing, content, inquiry, handoff, next | P P P P P P | P P P P P P |
| tickets | promo, landing, content, choice, options | P P P P P | P P P P P |
Boring-panel check: both panels change for distinct decisions; repeated record/content views intentionally support the A/B comparison, not filler. Busy-step focus is stated in E and captions.

#### G. Icons
No semantic icon transitions; native phone bar retained. All vendor icons denote role, not status. No data-state icon is removed.

#### H. Bindings, code and documentation
Checked workbench/catalog.json: services empty. Existing sports examples and supplied export contain no approved Islanders backend implementation or catalog identity. No repository or authenticated vendor account was supplied. Third-party products and hypothetical site aggregates do not acquire invented bindings/codeRefs. These stories describe proposed capability, not deployed code.
| Node | Binding | API/code | Verified docs / discovery gap | Running steps |
|---|---|---|---|---|
| email | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://trailhead.salesforce.com/content/learn/modules/content-builder-features/create-and-edit-your-content | none |
| content | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://www.contentful.com/help/content-and-entries/entry-editor/ | none |
| site | not applicable: hypothetical site aggregate | no actual implementation supplied; not an implementation claim | https://www.nhl.com/islanders/tickets/group-tickets | none |
| sales | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://trailhead.salesforce.com/content/learn/modules/lead-record-step-by-step/work-with-a-lead-record | none |
| tickets | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://www.nhl.com/islanders/tickets/group-tickets | none |

Additional public references: [Sales Cloud lead records](https://trailhead.salesforce.com/content/learn/modules/lead-record-step-by-step/work-with-a-lead-record), [Contentful entry editor](https://www.contentful.com/help/content-and-entries/entry-editor/), [Content Builder](https://trailhead.salesforce.com/content/learn/modules/content-builder-features/create-and-edit-your-content), [Eventbrite order forms](https://www.eventbrite.com/help/en-gb/articles/246376/how-to-collect-information-from-all-event-attendees/), [Eventbrite waitlist](https://www.eventbrite.co.uk/help/en-us/articles/811539/how-to-set-up-an-event-waitlist/). Eventbrite waitlist full-page fetch rate-limited; indexed official documentation and official availability help verified the capacity-triggered behavior. No custom opt-in collection is asserted on the waitlist path.

#### I. Checkable expectations / visible-beat evidence
| Requirement/source | Exact section/view/path/step | Panel | Expected visible state | Check |
|---|---|---|---|---|
| Accepted marketing story | group-night/flow/help/promo | destination + record | promo + promo; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | group-night/flow/help/content | destination + record | linked + content; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | group-night/flow/help/handoff | destination + record | received + lead; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | group-night/flow/help/next | destination + record | received + task; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | group-night/flow/tickets/promo | destination + record | promo + promo; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | group-night/flow/tickets/content | destination + record | linked + content; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | group-night/flow/tickets/choice | destination + record | choice + routing; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | group-night/flow/tickets/options | destination + record | ticketing + ticketroute; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |

Additional checks: every branch resets to promo/promo; previous-step returns exact screens; UTF-8 no mojibake; official images decode; each image ≤512KiB, full spec ≤2MiB; no panel/footer clipping at 1280 and 1440 desktop widths. Received is never a reservation; ticket path never shows the sales lead.

### Imagery and rights
Official group photo: https://media.d3.nhle.com/image/private/t_ratio16_9-size30/f_auto/prd/i2ueyu592npadvbcvgeq.jpg — retrieved from https://www.nhl.com/islanders/tickets/group-tickets and visually inspected. Its use is atmospheric, not a promise that the proposed request includes an ice photo.
Official Islanders primary logo is the existing sports asset. Team/NHL imagery remains copyrighted; user requested real team assets for this local prototype. No broader license, actual endorsement or permission to deploy publicly is claimed.

### Engineer handoff
Stable section group-night; paths help, tickets. Before deployment, verify actual products, ownership, field mappings, destination URLs, routing/consent rules, capacity controls, acknowledgement source and integration reliability. No production behavior is implemented by this diagram. No data collected, purchases made or messages sent. Desktop authoring only.

### Verification and self-audit
- Production page composer ran on the new topology. Its first layout is retained in ignored .local/group-night/arranged.spec.json for comparison.
- Manual refinement applies the latest user-approved hierarchy: graph left (8 columns), marketing center (10), phone right (6), steps below the left two tiles. The five-node star was tightened into a two-column diamond with a central group-site decision; shortened labels and explicit curves were inspected at desktop widths. This also resolves the first composer's below-viewport controls estimate in the compact standalone view.
- Spec validator: zero errors and warnings. State walk: six explicit critical screen assertions pass, zero warnings/checks. Visibility: 22 whole-panel expectations pass across every path/step; eligibility is not treated as pixel proof.
- Native playback at 1280 and 1440: every path, every step, both decoded screen selections, previous-step restoration, branch reset, native 9:41 phone status bar and signal/battery glyphs, UTF-8, no browser errors. No mobile editor testing or product work.
- Source capture rejects body/footer overlap and undecoded images. Key native captures reviewed for readable source-to-screen mapping, fan CTA/status, no overlap and compact graph. Main workspace fields are legible; secondary fine print remains smaller at the user's layout scale. Native graph zoom and page expansion remain available.
- 1,123,319 bytes in the portable spec; each image below 512 KiB, total below 2 MiB. PNG QA captures retained; phone photos embedded as quality-90 JPEG.
- Canon refreshed with eight distinct landing thumbnails. Friends source-parity/validation test passes. Fresh isolated desktop contexts confirm the landing card/theme, Canon reader, focal step and Edit in Workbench for both stories. Initial second-document edit test encountered the expected existing-draft guard; retested in a fresh context rather than overwriting a draft. No user browser state was changed.
- Source narrative/edge semantic fields match generated output. Canon spec is byte-identical to package spec, with the ledger mirrored alongside it.
- No remote deployment, messages, forms, bookings or sponsor-data transfers. Product code untouched; this is authored content and local preview tooling.


## Source ledger: Fan event RSVP

## Coverage ledger — One invite. Three honest outcomes.
source: user description (conversation) and accepted top-two ideation | version: n/a | updated: 10-19-2026

This is a proposed marketing journey, not evidence of the Islanders’ deployed technology. Official imagery does not make the campaign, integration or event real. Product UI is a focused, reference-based mockup. The current user authorized development of the top two proposed stories. No questions needed: audience, illustrative premise, panels and outcomes are settled by that request and the preceding discussion. The team’s actual catalog, implementation and integrations are outside this prototype, not assumed deployed.

### Coverage
| # | class | HLD anchor | fact | state |
|---|---|---|---|---|
| 1 | flow | “starting with your top two” | A confirmed reservation, a waitlist place and sponsor permission are separate facts—and should produce different follow-up. | covered @ fan-event-rsvp.paths |
| 2 | contract | “SHOW the Promotion link, SHOW the content” | Fan creative and source fields are visible, not caption-only | covered @ promo, content panels |
| 3 | service | “ticket master, contentful etc” | Industry products with distinct responsibilities; adoption unverified | covered @ nodes |
| 4 | amendment | “small updates made and sent to temp again” | Original campaign geometry preserved from 12:34 export; new stories use its visual hierarchy | covered @ member-campaign and sectionLayout |
| 5 | number | “illustrative” | 9:41 is an illustrative staging clock, not delivery timing; no elapsed-time or SLA claims | covered @ storyTime |
| 6 | failure | “branching alternate paths” | Available capacity with and without sponsor opt-in; full capacity with waitlist; no automatic recovery | covered @ paths |
| 10 | service | “industry standard products” | Salesforce: Marketing Cloud; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.email |
| 11 | service | “industry standard products” | Contentful: Event creative; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.content |
| 12 | service | “industry standard products” | Event site: Event details; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.site |
| 13 | service | “industry standard products” | Eventbrite: RSVP + capacity; third party or proposed aggregate, no applicable approved catalog identity | covered @ nodes.registration |

### Amendments
| # | question | operator answer | date | applied at | status |
|---|---|---|---|---|---|
| A1 | Real or illustrative campaign? | illustrative; develop top two ideated stories | 10-19-2026 | all paths | active |
| A2 | Desktop or mobile editing? | Desktop-only document editing; depicted fan phone is not an editor | 10-19-2026 | verification | active |

### Decisions I made
| # | decision | evidence or reason | applied at |
|---|---|---|---|
| D1 | Use official imagery already retrieved, condensed brand headline, native phone status bar and home indicator | Preserve approved visual direction | all fan screens |
| D2 | Reference-based UI crops, not full vendor navigation or fake actual account screenshots | Readable at desktop panel size | record panel |
| D3 | Use Example partner; no invented actual sponsor, event date, venue or capacity count; separate optional permission | Avoid unsupported business rules/affiliations | branch screens |
| D4 | No transport/API/protocol claims, automation guarantees or actual backend implementation refs | Proposed workflow; public product documentation supports capabilities only | graph and captions |
| D5 | No arena map, metrics dashboard, lead score or additional panel | Each would distract from the marketing decision | default view |

### Storyboard worksheet
#### A. Story
Audience: Islanders marketing and ticket sales/sponsorship staff; business story with requested vendor names, not an implementation diagram.
Takeaway: A confirmed reservation, a waitlist place and sponsor permission are separate facts—and should produce different follow-up.
Story: A fan sees an Islanders-branded invitation for an explicitly illustrative fan social. The event details match the Contentful headline, image, partner credit and RSVP button. With capacity available, the fan registers and independently chooses whether to opt into sponsor marketing. Both choices produce the same reservation status and event confirmation, but only an explicit Yes enters the proposed sponsor audience. If the event is full, the button changes to Join waitlist; the outcome and follow-up say Waitlisted, never Reserved, and sponsor permission is Not collected.
Most important moment: reserved-no / followup-no—reservation preserved, sponsor audience excluded.
Expected evidence included: promotion creative/link, content mapping, branch input, operational record, honest fan result. Must not imply real vendor adoption, completed purchase, actual campaign delivery or real event/sponsor affiliation.

| View | Audience/task | Takeaway | Focal evidence | Density / reading order |
|---|---|---|---|---|
| default | Marketing review | A confirmed reservation, a waitlist place and sponsor permission are separate facts—and should produce different follow-up. | reserved-no / record registered-no + phone reserved-no | Compact graph left, operational screen center, fan phone right; native steps below |

#### B. Panel plan
| Panel | Type | Meaning | Question | Best moment | Initial | Must never show |
|---|---|---|---|---|---|---|
| destination | appscreens, phone | Reported fan UI in illustrative scenario | What does the fan actually see? | reserved-no | promo | Reserved on a waitlist path |
| record | appscreens, no frame | Reported proposed workspace | Which source/record explains it? | followup-no | promo | Sponsor consent inferred from registration |
Rejected: arena map, arbitrary counts, device telemetry. Native graph retains vendor responsibilities and native controls retain steps/paths.
Fan-visible items map to complete destination screens: promotion/button=promo; matching landing copy=linked; optional question=form-yes/form-no; reservation=reserved-yes/reserved-no; full=full; waitlist=waitlisted; truthful emails=email-yes/email-no/email-waitlist.

#### C. Paths
| Path | Label | Shared prefix | First different step | Ending | Unknowns |
|---|---|---|---|---|---|
| reserved | Reserved + opt-in | promo, details, content | form | followup | No open story decision; deployed implementation unverified |
| nooptin | Reserved, no opt-in | promo, details, content | form-no | followup-no | No open story decision; deployed implementation unverified |
| full | Event is full | promo, details, content | full | waitlist-followup | No open story decision; deployed implementation unverified |

#### D. Time
Staging only: storyTime 2026-10-19T09:41, span 1m, 12h, date none. Steps are inspection beats within this illustration, not elapsed operational time. All retain 09:41; no delivery deadline, future date, battery model or reporting cadence is asserted. No physical devices/telemetry. Native phone glyphs are decorative status chrome.
| Path | Steps | Time | Source | Battery/report/freshness/day-night |
|---|---|---|---|---|
| reserved | promo, details, content, form, reserved, followup | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |
| nooptin | promo, details, content, form-no, reserved-no, followup-no | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |
| full | promo, details, content, full, waitlist, waitlist-followup | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |

#### E. Step × panel matrix
All complete screen selections replace stale visible content; no overlay or field can leak between outcomes. No changing semantic node icons/tones, no code executes in this authored illustration. Edges represent proposed business handoffs, not network traces.

##### promo
Paths: reserved, nooptin, full. Time: inherited staging 09:41.
Beat: Show the invitation. A proposed fan-social campaign uses official Islanders imagery with an explicitly fictional partner. The email’s Reserve my place button leads to event details—not directly to a confirmed reservation.
Hops claimed / edges: none; focus node email. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=promo.
record: patch: screen=promo.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### details
Paths: reserved, nooptin, full. Time: inherited staging 09:41.
Beat: Open the event details. The fan sees the proposed creative, partner placement and RSVP action. No real date, venue or event is being advertised; this is a walkthrough for reviewing the journey.
Hops claimed / edges: email->site. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=details.
record: patch: screen=content.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### content
Paths: reserved, nooptin, full. Time: inherited staging 09:41.
Beat: Match the creative to its source. A is the event headline; B is the RSVP button. Contentful’s proposed custom fields line up with the phone, including the example partner credit.
Hops claimed / edges: content->site. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=linked.
record: patch: screen=content.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### form
Paths: reserved. Time: inherited staging 09:41.
Beat: Make permission a separate choice. On the available-capacity path, the fan chooses the optional sponsor checkbox. The Eventbrite-style order form is a focused mockup; custom questions can be optional.
Hops claimed / edges: site->registration. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=form-yes.
record: patch: screen=form.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### reserved
Paths: reserved. Time: inherited staging 09:41.
Beat: Confirm only a completed registration. In this simulated outcome the RSVP succeeded. The organizer record shows Registered and sponsor opt-in Yes as separate values. A click on the invitation did not establish either fact.
Hops claimed / edges: none; focus node registration. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=reserved-yes.
record: patch: screen=registered-yes.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### followup
Paths: reserved. Time: inherited staging 09:41.
Beat: Use the confirmed facts. The proposed integration passes registration and the separate opt-in answer to Marketing Cloud. The fan receives the reservation message; the sponsor audience includes only explicit opt-ins. No sponsor message is sent in this story.
Hops claimed / edges: registration->email. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=email-yes.
record: patch: screen=followup-yes.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### form-no
Paths: nooptin. Time: inherited staging 09:41.
Beat: Leave sponsor opt-in unchecked. The same optional question stays unanswered/No. The fan can still finish the RSVP. Declining partner marketing must not change the availability or reservation decision in this proposed journey.
Hops claimed / edges: site->registration. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=form-no.
record: patch: screen=form.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### reserved-no
Paths: nooptin. Time: inherited staging 09:41.
Beat: The place is still reserved. This simulated registration is successful with sponsor opt-in No. Compare the two fields; the fan’s confirmation must not imply that a sponsor subscription was required.
Hops claimed / edges: none; focus node registration. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=reserved-no.
record: patch: screen=registered-no.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### followup-no
Paths: nooptin. Time: inherited staging 09:41.
Beat: Send the event message, not sponsor marketing. The proposed integration carries Registered plus opt-in No. The reservation confirmation still goes out; the fan is excluded from the proposed sponsor audience.
Hops claimed / edges: registration->email. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=email-no.
record: patch: screen=followup-no.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### full
Paths: full. Time: inherited staging 09:41.
Beat: Capacity changes the action. Eventbrite supports a waitlist when the configured ticket type or event is full. The fan now sees Join waitlist, not Reserve my place. No place is held at this step.
Hops claimed / edges: site->registration. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=full.
record: patch: screen=capacity.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### waitlist
Paths: full. Time: inherited staging 09:41.
Beat: A waitlist is not a ticket. The simulated fan joins the waitlist and sees an honest acknowledgement. Sponsor permission is not collected on this path; no automatic ticket release or reservation is shown.
Hops claimed / edges: none; focus node registration. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=waitlisted.
record: patch: screen=waitlist.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

##### waitlist-followup
Paths: full. Time: inherited staging 09:41.
Beat: Keep follow-up consistent. The proposed integration carries Waitlisted, not Registered, with sponsor permission Not collected. The fan receives a waitlist message and is excluded from the proposed sponsor audience.
Hops claimed / edges: registration->email. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=email-waitlist.
record: patch: screen=followup-waitlist.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### F. Coverage grid
| Path | Steps | destination | record |
|---|---|---|---|
| reserved | promo, details, content, form, reserved, followup | P P P P P P | P P P P P P |
| nooptin | promo, details, content, form-no, reserved-no, followup-no | P P P P P P | P P P P P P |
| full | promo, details, content, full, waitlist, waitlist-followup | P P P P P P | P P P P P P |
Boring-panel check: both panels change for distinct decisions; repeated record/content views intentionally support the A/B comparison, not filler. Busy-step focus is stated in E and captions.

#### G. Icons
No semantic icon transitions; native phone bar retained. All vendor icons denote role, not status. No data-state icon is removed.

#### H. Bindings, code and documentation
Checked workbench/catalog.json: services empty. Existing sports examples and supplied export contain no approved Islanders backend implementation or catalog identity. No repository or authenticated vendor account was supplied. Third-party products and hypothetical site aggregates do not acquire invented bindings/codeRefs. These stories describe proposed capability, not deployed code.
| Node | Binding | API/code | Verified docs / discovery gap | Running steps |
|---|---|---|---|---|
| email | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://trailhead.salesforce.com/content/learn/modules/journey-builder-campaigns/build-a-journey-campaign | none |
| content | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://www.contentful.com/help/content-and-entries/entry-editor/ | none |
| site | not applicable: hypothetical site aggregate | no actual implementation supplied; not an implementation claim | No real event site exists; proposed aggregate from accepted ideation | none |
| registration | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://www.eventbrite.co.uk/help/en-us/articles/811539/how-to-set-up-an-event-waitlist/ | none |

Additional public references: [Sales Cloud lead records](https://trailhead.salesforce.com/content/learn/modules/lead-record-step-by-step/work-with-a-lead-record), [Contentful entry editor](https://www.contentful.com/help/content-and-entries/entry-editor/), [Content Builder](https://trailhead.salesforce.com/content/learn/modules/content-builder-features/create-and-edit-your-content), [Eventbrite order forms](https://www.eventbrite.com/help/en-gb/articles/246376/how-to-collect-information-from-all-event-attendees/), [Eventbrite waitlist](https://www.eventbrite.co.uk/help/en-us/articles/811539/how-to-set-up-an-event-waitlist/). Eventbrite waitlist full-page fetch rate-limited; indexed official documentation and official availability help verified the capacity-triggered behavior. No custom opt-in collection is asserted on the waitlist path.

#### I. Checkable expectations / visible-beat evidence
| Requirement/source | Exact section/view/path/step | Panel | Expected visible state | Check |
|---|---|---|---|---|
| Accepted marketing story | fan-event-rsvp/flow/reserved/promo | destination + record | promo + promo; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/reserved/content | destination + record | linked + content; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/reserved/reserved | destination + record | reserved-yes + registered-yes; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/reserved/followup | destination + record | email-yes + followup-yes; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/nooptin/promo | destination + record | promo + promo; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/nooptin/content | destination + record | linked + content; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/nooptin/reserved-no | destination + record | reserved-no + registered-no; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/nooptin/followup-no | destination + record | email-no + followup-no; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/full/promo | destination + record | promo + promo; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/full/content | destination + record | linked + content; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/full/waitlist | destination + record | waitlisted + waitlist; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |
| Accepted marketing story | fan-event-rsvp/flow/full/waitlist-followup | destination + record | email-waitlist + followup-waitlist; native phone bar; images readable | pass: state/visibility; key desktop captures reviewed |

Additional checks: every branch resets to promo/promo; previous-step returns exact screens; UTF-8 no mojibake; official images decode; each image ≤512KiB, full spec ≤2MiB; no panel/footer clipping at 1280 and 1440 desktop widths. No-opt-in remains Registered; waitlist never shows Registered; permission absent on waitlist is not Yes.

### Imagery and rights
Official crowd and member-community images are reused from ../member-campaign/assets/provenance.json. They do not depict the proposed event or its attendees.
Official Islanders primary logo is the existing sports asset. Team/NHL imagery remains copyrighted; user requested real team assets for this local prototype. No broader license, actual endorsement or permission to deploy publicly is claimed.

### Engineer handoff
Stable section fan-event-rsvp; paths reserved, nooptin, full. Before deployment, verify actual products, ownership, field mappings, destination URLs, routing/consent rules, capacity controls, acknowledgement source and integration reliability. No production behavior is implemented by this diagram. No data collected, purchases made or messages sent. Desktop authoring only.

### Verification and self-audit
- Production page composer ran on the new topology. Its first layout is retained in ignored .local/fan-event-rsvp/arranged.spec.json for comparison.
- Manual refinement applies the latest user-approved hierarchy: graph left (8 columns), marketing center (10), phone right (6), steps below the left two tiles. The four-node production graph and routes were retained; concise labels and the common panel placement make the marketer/fan comparison primary.
- Spec validator: zero errors and warnings. State walk: six explicit critical screen assertions pass, zero warnings/checks. Visibility: 36 whole-panel expectations pass across every path/step; eligibility is not treated as pixel proof.
- Native playback at 1280 and 1440: every path, every step, both decoded screen selections, previous-step restoration, branch reset, native 9:41 phone status bar and signal/battery glyphs, UTF-8, no browser errors. No mobile editor testing or product work.
- Source capture rejects body/footer overlap and undecoded images. Key native captures reviewed for readable source-to-screen mapping, fan CTA/status, no overlap and compact graph. Main workspace fields are legible; secondary fine print remains smaller at the user's layout scale. Native graph zoom and page expansion remain available.
- 1,756,535 bytes in the portable spec; each image below 512 KiB, total below 2 MiB. PNG QA captures retained; phone photos embedded as quality-90 JPEG.
- Canon refreshed with eight distinct landing thumbnails. Friends source-parity/validation test passes. Fresh isolated desktop contexts confirm the landing card/theme, Canon reader, focal step and Edit in Workbench for both stories. Initial second-document edit test encountered the expected existing-draft guard; retested in a fresh context rather than overwriting a draft. No user browser state was changed.
- Source narrative/edge semantic fields match generated output. Canon spec is byte-identical to package spec, with the ledger mirrored alongside it.
- No remote deployment, messages, forms, bookings or sponsor-data transfers. Product code untouched; this is authored content and local preview tooling.


#### Final workspace refinement
The Salesforce follow-up screen now uses the reference-based Journey Builder activity canvas: registration data, an orange Decision Split, and distinct confirmation/waitlist email activities. The selected route matches the branch. The lower sponsor-audience rule is explicitly proposed, not presented as an exact Salesforce settings panel. Rebuilt and reran all three paths at 1280 and 1440 after this change; actual source and native captures reviewed.
