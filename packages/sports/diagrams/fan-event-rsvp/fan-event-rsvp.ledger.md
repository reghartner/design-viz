# Coverage ledger — One invite. Three honest outcomes.
source: user description (conversation) and accepted top-two ideation | version: n/a | updated: 10-19-2026

This is a proposed marketing journey, not evidence of the Islanders’ deployed technology. Official imagery does not make the campaign, integration or event real. Product UI is a focused, reference-based mockup. The current user authorized development of the top two proposed stories. No questions needed: audience, illustrative premise, panels and outcomes are settled by that request and the preceding discussion. The team’s actual catalog, implementation and integrations are outside this prototype, not assumed deployed.

## Coverage
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

## Amendments
| # | question | operator answer | date | applied at | status |
|---|---|---|---|---|---|
| A1 | Real or illustrative campaign? | illustrative; develop top two ideated stories | 10-19-2026 | all paths | active |
| A2 | Desktop or mobile editing? | Desktop-only document editing; depicted fan phone is not an editor | 10-19-2026 | verification | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|---|---|---|
| D1 | Use official imagery already retrieved, condensed brand headline, native phone status bar and home indicator | Preserve approved visual direction | all fan screens |
| D2 | Reference-based UI crops, not full vendor navigation or fake actual account screenshots | Readable at desktop panel size | record panel |
| D3 | Use Example partner; no invented actual sponsor, event date, venue or capacity count; separate optional permission | Avoid unsupported business rules/affiliations | branch screens |
| D4 | No transport/API/protocol claims, automation guarantees or actual backend implementation refs | Proposed workflow; public product documentation supports capabilities only | graph and captions |
| D5 | No arena map, metrics dashboard, lead score or additional panel | Each would distract from the marketing decision | default view |

## Storyboard worksheet
### A. Story
Audience: Islanders marketing and ticket sales/sponsorship staff; business story with requested vendor names, not an implementation diagram.
Takeaway: A confirmed reservation, a waitlist place and sponsor permission are separate facts—and should produce different follow-up.
Story: A fan sees an Islanders-branded invitation for an explicitly illustrative fan social. The event details match the Contentful headline, image, partner credit and RSVP button. With capacity available, the fan registers and independently chooses whether to opt into sponsor marketing. Both choices produce the same reservation status and event confirmation, but only an explicit Yes enters the proposed sponsor audience. If the event is full, the button changes to Join waitlist; the outcome and follow-up say Waitlisted, never Reserved, and sponsor permission is Not collected.
Most important moment: reserved-no / followup-no—reservation preserved, sponsor audience excluded.
Expected evidence included: promotion creative/link, content mapping, branch input, operational record, honest fan result. Must not imply real vendor adoption, completed purchase, actual campaign delivery or real event/sponsor affiliation.

| View | Audience/task | Takeaway | Focal evidence | Density / reading order |
|---|---|---|---|---|
| default | Marketing review | A confirmed reservation, a waitlist place and sponsor permission are separate facts—and should produce different follow-up. | reserved-no / record registered-no + phone reserved-no | Compact graph left, operational screen center, fan phone right; native steps below |

### B. Panel plan
| Panel | Type | Meaning | Question | Best moment | Initial | Must never show |
|---|---|---|---|---|---|---|
| destination | appscreens, phone | Reported fan UI in illustrative scenario | What does the fan actually see? | reserved-no | promo | Reserved on a waitlist path |
| record | appscreens, no frame | Reported proposed workspace | Which source/record explains it? | followup-no | promo | Sponsor consent inferred from registration |
Rejected: arena map, arbitrary counts, device telemetry. Native graph retains vendor responsibilities and native controls retain steps/paths.
Fan-visible items map to complete destination screens: promotion/button=promo; matching landing copy=linked; optional question=form-yes/form-no; reservation=reserved-yes/reserved-no; full=full; waitlist=waitlisted; truthful emails=email-yes/email-no/email-waitlist.

### C. Paths
| Path | Label | Shared prefix | First different step | Ending | Unknowns |
|---|---|---|---|---|---|
| reserved | Reserved + opt-in | promo, details, content | form | followup | No open story decision; deployed implementation unverified |
| nooptin | Reserved, no opt-in | promo, details, content | form-no | followup-no | No open story decision; deployed implementation unverified |
| full | Event is full | promo, details, content | full | waitlist-followup | No open story decision; deployed implementation unverified |

### D. Time
Staging only: storyTime 2026-10-19T09:41, span 1m, 12h, date none. Steps are inspection beats within this illustration, not elapsed operational time. All retain 09:41; no delivery deadline, future date, battery model or reporting cadence is asserted. No physical devices/telemetry. Native phone glyphs are decorative status chrome.
| Path | Steps | Time | Source | Battery/report/freshness/day-night |
|---|---|---|---|---|
| reserved | promo, details, content, form, reserved, followup | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |
| nooptin | promo, details, content, form-no, reserved-no, followup-no | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |
| full | promo, details, content, full, waitlist, waitlist-followup | inherited 09:41 for every step | illustrative staging | N/A; no telemetry or elapsed-time claim |

### E. Step × panel matrix
All complete screen selections replace stale visible content; no overlay or field can leak between outcomes. No changing semantic node icons/tones, no code executes in this authored illustration. Edges represent proposed business handoffs, not network traces.

#### promo
Paths: reserved, nooptin, full. Time: inherited staging 09:41.
Beat: Show the invitation. A proposed fan-social campaign uses official Islanders imagery with an explicitly fictional partner. The email’s Reserve my place button leads to event details—not directly to a confirmed reservation.
Hops claimed / edges: none; focus node email. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=promo.
record: patch: screen=promo.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### details
Paths: reserved, nooptin, full. Time: inherited staging 09:41.
Beat: Open the event details. The fan sees the proposed creative, partner placement and RSVP action. No real date, venue or event is being advertised; this is a walkthrough for reviewing the journey.
Hops claimed / edges: email->site. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=details.
record: patch: screen=content.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### content
Paths: reserved, nooptin, full. Time: inherited staging 09:41.
Beat: Match the creative to its source. A is the event headline; B is the RSVP button. Contentful’s proposed custom fields line up with the phone, including the example partner credit.
Hops claimed / edges: content->site. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=linked.
record: patch: screen=content.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### form
Paths: reserved. Time: inherited staging 09:41.
Beat: Make permission a separate choice. On the available-capacity path, the fan chooses the optional sponsor checkbox. The Eventbrite-style order form is a focused mockup; custom questions can be optional.
Hops claimed / edges: site->registration. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=form-yes.
record: patch: screen=form.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### reserved
Paths: reserved. Time: inherited staging 09:41.
Beat: Confirm only a completed registration. In this simulated outcome the RSVP succeeded. The organizer record shows Registered and sponsor opt-in Yes as separate values. A click on the invitation did not establish either fact.
Hops claimed / edges: none; focus node registration. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=reserved-yes.
record: patch: screen=registered-yes.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### followup
Paths: reserved. Time: inherited staging 09:41.
Beat: Use the confirmed facts. The proposed integration passes registration and the separate opt-in answer to Marketing Cloud. The fan receives the reservation message; the sponsor audience includes only explicit opt-ins. No sponsor message is sent in this story.
Hops claimed / edges: registration->email. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=email-yes.
record: patch: screen=followup-yes.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### form-no
Paths: nooptin. Time: inherited staging 09:41.
Beat: Leave sponsor opt-in unchecked. The same optional question stays unanswered/No. The fan can still finish the RSVP. Declining partner marketing must not change the availability or reservation decision in this proposed journey.
Hops claimed / edges: site->registration. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=form-no.
record: patch: screen=form.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### reserved-no
Paths: nooptin. Time: inherited staging 09:41.
Beat: The place is still reserved. This simulated registration is successful with sponsor opt-in No. Compare the two fields; the fan’s confirmation must not imply that a sponsor subscription was required.
Hops claimed / edges: none; focus node registration. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=reserved-no.
record: patch: screen=registered-no.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### followup-no
Paths: nooptin. Time: inherited staging 09:41.
Beat: Send the event message, not sponsor marketing. The proposed integration carries Registered plus opt-in No. The reservation confirmation still goes out; the fan is excluded from the proposed sponsor audience.
Hops claimed / edges: registration->email. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=email-no.
record: patch: screen=followup-no.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### full
Paths: full. Time: inherited staging 09:41.
Beat: Capacity changes the action. Eventbrite supports a waitlist when the configured ticket type or event is full. The fan now sees Join waitlist, not Reserve my place. No place is held at this step.
Hops claimed / edges: site->registration. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: destination.
destination: patch: screen=full.
record: patch: screen=capacity.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### waitlist
Paths: full. Time: inherited staging 09:41.
Beat: A waitlist is not a ticket. The simulated fan joins the waitlist and sees an honest acknowledgement. Sponsor permission is not collected on this path; no automatic ticket release or reservation is shown.
Hops claimed / edges: none; focus node registration. Missing hops: none at this business-handoff abstraction. Report: no delivery claimed; inspect current state.
Focus: destination.
destination: patch: screen=waitlisted.
record: patch: screen=waitlist.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

#### waitlist-followup
Paths: full. Time: inherited staging 09:41.
Beat: Keep follow-up consistent. The proposed integration carries Waitlisted, not Registered, with sponsor permission Not collected. The fan receives a waitlist message and is excluded from the proposed sponsor audience.
Hops claimed / edges: registration->email. Missing hops: none at this business-handoff abstraction. Report: proposed handoff changes selected workspace/screen, not observed telemetry.
Focus: record.
destination: patch: screen=email-waitlist.
record: patch: screen=followup-waitlist.
State cleared: both complete screens replaced; earlier outcomes cleared. Icons: none, stable vendor roles. Tones: none. Code/binding: none, proposed third-party/aggregate workflow. Evidence: coverage 1–6, public UI references below; example records are illustrative.

### F. Coverage grid
| Path | Steps | destination | record |
|---|---|---|---|
| reserved | promo, details, content, form, reserved, followup | P P P P P P | P P P P P P |
| nooptin | promo, details, content, form-no, reserved-no, followup-no | P P P P P P | P P P P P P |
| full | promo, details, content, full, waitlist, waitlist-followup | P P P P P P | P P P P P P |
Boring-panel check: both panels change for distinct decisions; repeated record/content views intentionally support the A/B comparison, not filler. Busy-step focus is stated in E and captions.

### G. Icons
No semantic icon transitions; native phone bar retained. All vendor icons denote role, not status. No data-state icon is removed.

### H. Bindings, code and documentation
Checked workbench/catalog.json: services empty. Existing sports examples and supplied export contain no approved Islanders backend implementation or catalog identity. No repository or authenticated vendor account was supplied. Third-party products and hypothetical site aggregates do not acquire invented bindings/codeRefs. These stories describe proposed capability, not deployed code.
| Node | Binding | API/code | Verified docs / discovery gap | Running steps |
|---|---|---|---|---|
| email | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://trailhead.salesforce.com/content/learn/modules/journey-builder-campaigns/build-a-journey-campaign | none |
| content | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://www.contentful.com/help/content-and-entries/entry-editor/ | none |
| site | not applicable: hypothetical site aggregate | no actual implementation supplied; not an implementation claim | No real event site exists; proposed aggregate from accepted ideation | none |
| registration | not applicable: third-party product | no actual implementation supplied; not an implementation claim | https://www.eventbrite.co.uk/help/en-us/articles/811539/how-to-set-up-an-event-waitlist/ | none |

Additional public references: [Sales Cloud lead records](https://trailhead.salesforce.com/content/learn/modules/lead-record-step-by-step/work-with-a-lead-record), [Contentful entry editor](https://www.contentful.com/help/content-and-entries/entry-editor/), [Content Builder](https://trailhead.salesforce.com/content/learn/modules/content-builder-features/create-and-edit-your-content), [Eventbrite order forms](https://www.eventbrite.com/help/en-gb/articles/246376/how-to-collect-information-from-all-event-attendees/), [Eventbrite waitlist](https://www.eventbrite.co.uk/help/en-us/articles/811539/how-to-set-up-an-event-waitlist/). Eventbrite waitlist full-page fetch rate-limited; indexed official documentation and official availability help verified the capacity-triggered behavior. No custom opt-in collection is asserted on the waitlist path.

### I. Checkable expectations / visible-beat evidence
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

## Imagery and rights
Official crowd and member-community images are reused from ../member-campaign/assets/provenance.json. They do not depict the proposed event or its attendees.
Official Islanders primary logo is the existing sports asset. Team/NHL imagery remains copyrighted; user requested real team assets for this local prototype. No broader license, actual endorsement or permission to deploy publicly is claimed.

## Engineer handoff
Stable section fan-event-rsvp; paths reserved, nooptin, full. Before deployment, verify actual products, ownership, field mappings, destination URLs, routing/consent rules, capacity controls, acknowledgement source and integration reliability. No production behavior is implemented by this diagram. No data collected, purchases made or messages sent. Desktop authoring only.

## Verification and self-audit
- Production page composer ran on the new topology. Its first layout is retained in ignored .local/fan-event-rsvp/arranged.spec.json for comparison.
- Manual refinement applies the latest user-approved hierarchy: graph left (8 columns), marketing center (10), phone right (6), steps below the left two tiles. The four-node production graph and routes were retained; concise labels and the common panel placement make the marketer/fan comparison primary.
- Spec validator: zero errors and warnings. State walk: six explicit critical screen assertions pass, zero warnings/checks. Visibility: 36 whole-panel expectations pass across every path/step; eligibility is not treated as pixel proof.
- Native playback at 1280 and 1440: every path, every step, both decoded screen selections, previous-step restoration, branch reset, native 9:41 phone status bar and signal/battery glyphs, UTF-8, no browser errors. No mobile editor testing or product work.
- Source capture rejects body/footer overlap and undecoded images. Key native captures reviewed for readable source-to-screen mapping, fan CTA/status, no overlap and compact graph. Main workspace fields are legible; secondary fine print remains smaller at the user's layout scale. Native graph zoom and page expansion remain available.
- 1,756,535 bytes in the portable spec; each image below 512 KiB, total below 2 MiB. PNG QA captures retained; phone photos embedded as quality-90 JPEG.
- Canon refreshed with eight distinct landing thumbnails. Friends source-parity/validation test passes. Fresh isolated desktop contexts confirm the landing card/theme, Canon reader, focal step and Edit in Workbench for both stories. Initial second-document edit test encountered the expected existing-draft guard; retested in a fresh context rather than overwriting a draft. No user browser state was changed.
- Source narrative/edge semantic fields match generated output. Canon spec is byte-identical to package spec, with the ledger mirrored alongside it.
- No remote deployment, messages, forms, bookings or sponsor-data transfers. Product code untouched; this is authored content and local preview tooling.


### Final workspace refinement
The Salesforce follow-up screen now uses the reference-based Journey Builder activity canvas: registration data, an orange Decision Split, and distinct confirmation/waitlist email activities. The selected route matches the branch. The lower sponsor-audience rule is explicitly proposed, not presented as an exact Salesforce settings panel. Rebuilt and reran all three paths at 1280 and 1440 after this change; actual source and native captures reviewed.
