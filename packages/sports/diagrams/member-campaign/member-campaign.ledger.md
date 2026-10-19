# Coverage ledger - Islanders member campaign

Source: Chuck's conversation and /Users/chuck/Sandbox/temp/your-people-our-island.spec.json.
Updated: 2026-10-19. Desktop-only Flowview authoring.

## Accepted direction and latest revision

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

## Story and panel jobs

A marketing manager follows a member promotion from its email promise to the destination page and ticket offer, then checks the content source and reminder decision. Alternate paths show sign-in recovery and an expired campaign link.

The phone answers “What does the fan see?” Its best moments are the promotion, matching landing page, and fallback.
The marketing workspace answers “Which copy, destination, or reminder rule does marketing manage?” Its best moments are matching A/B fields in Contentful and the Purchased path that exits before a reminder after a simulated confirmed purchase. This decision evaluates available campaign purchase data; the illustration does not claim an immediate event-triggered exit or specify a wait interval.
The four-node diagram explains responsibility and handoffs; native steps remain the navigation.

## Step × panel decisions and visible-beat evidence

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

## Sources and node references

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

## Verification

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

## Delivery and maintenance

Authored inputs: story.source.json, creative.source.html, phone-capture.css, marketing.source.html, build-preview.mjs.
Native output: member-campaign.spec.json plus this ledger and member-campaign.visibility.json.
records.source.json is historical input from the replaced table and is no longer used.
Desktop checks: check-preview.mjs.
Preview captures: .local/member-campaign/native-contentful-*.png, native-journey-*.png, phone-statusbar-*.png.
Canon copy: diagrams/friends/member-campaign/member-campaign.spec.json. Existing user-authorized membership and owner remain unchanged. Refresh the published copy and library after checks so reopening Canon receives the revision. Existing editable Workbench drafts are not overwritten.
No remote deployment, commit, PR change, or unrelated file edits are included.

## 12:34 export amendment — 2026-10-19

Imported the subsequent user save, SHA-256 264e5e3b83028cb9acd796470eb72897ec94d17d034004d7adef4b49a6861c1d. Preserved its exact floats (left x207.4; bottom y299.8), unchanged edges and graphFrame, Canon metadata, and all four sectionLayout tiles: graph x0/y0/w8/h13, record x8/y0/w10/h13, steps x0/y13/w18/h7, phone x18/y0/w6/h17. This supersedes the earlier 12:12 geometry described above. Original temp files remain untouched.

Rebuilt and checked at 1280 and 1440: native bar, all three paths, exact screen restoration backwards/reset, UTF-8 and zero browser errors. Spec validation remains zero errors/warnings. Explicit comparison against the saved export passes for floats, edges, graphFrame, sectionLayout and page.canon. Actual desktop capture reviewed; no source geometry was changed to improve the graph. The new independent stories do not enlarge this member campaign.
