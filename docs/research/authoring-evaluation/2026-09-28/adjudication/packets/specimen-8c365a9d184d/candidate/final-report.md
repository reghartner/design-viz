COMPLETE: The editor accepted the kestrel-overnight story at the engineering level (revision ...-2). The accepted source has 0 errors and 0 warnings. I did not check it in a browser; see the last section for what that leaves open.

What's in it
- Two paths that share the same night:
  - "Wi-Fi up at delivery": bed → raccoon → lowbatt → sunrise → chargerpt → courier → openclip
  - "Wi-Fi down at delivery": the same first five steps, then b-courier → b-retry → b-reconnect → b-latepush
- Story time runs from Thu, Sep 24 10:30 PM to Fri, Sep 25 8:30 AM, 12-hour clock. It uses your anchor times: raccoon 1:10, low battery 4:00, sunrise 6:50, courier 8:05.
- Nodes: Porch Cam, home router, event-ingest, motion-classifier, clip-store, device-shadow, notify-service, Apple/Google push, and the Kestrel app.
- Five catalog services are linked to their Backstage entries (event-ingest, clip-store, device-shadow, notify-service, kestrel-app). Four of them also carry an API operation.
- All 7 approved code references are attached to the node that owns them. On a step, a reference appears only where that code runs. shadow.offline is on its node only, because the 10-minute outage never reaches its 60-minute rule.
- Panels:
  - The camera's real battery.
  - The device-shadow record, which is what the app reads.
  - The camera's SD-card upload queue.
  - The resident's phone, showing notifications and cards for battery, power source and connection. Each card shows "Last report <time>".
- How the app lags: at 6:50 AM the battery panel is charging, but the record and the app still show 18% and "not charging" from the 6:30 heartbeat. The 7:00 heartbeat is what brings the solar icon.
- On the Wi-Fi-down path: the clip waits on the SD card. The app still shows Online with a last report of 8:00 AM, because the camera isn't marked offline until 60 minutes pass. At 8:15 the clip uploads and a heartbeat goes out, then the package push arrives about 10 minutes late.

One conflict for you to review
- At the HLD's drain of about 1%/h, 25% at 10:30 PM minus one clip reaches 20% around 2:30 AM, not 4:00 AM.
- I kept both of your figures. The battery holds at 24% after the 1:10 clip, is set to the reported 20% at 4:00 AM, and the 1%/h rate applies again from there.
- The page states this conflict in its section text.

Illustrative values (labeled on the page)
- Times you didn't give: the 7:00 charging heartbeat, 8:07 clip opened, retries at 8:07 and 8:09, reconnect at 8:15.
- Heartbeat values shown between lit steps: 1:00 AM 25%, 6:30 AM 18%, 8:00 AM 21%.
- Solar charging at 3.5%/h, the middle of the HLD's 3–4%/h.
- On the Wi-Fi-down path, Wi-Fi drops just after the 8:00 heartbeat is delivered.

Gaps for engineering review (details in story.ledger.md)
- motion-classifier is not in the catalog and has no code reference, so it isn't linked.
- The HLD doesn't say when the app reads device-shadow or how it fetches the clip. No read edge is drawn, and the opening-the-clip step lights only the app.
- The API operations on clip-store (uploadClip), device-shadow (putState) and notify-service (sendPush), and the POST /heartbeats edge label, come from the catalog, not the HLD. The HLD names only POST /events.
- The device page's "last event" card is left out because its data source isn't stated.
- I didn't add a porch camera view: there is no built-in scene for a raccoon.

Checks
- Validator: 0 errors, 0 warnings.
- State walk against the catalog: 0 warnings, all 6 expected values matched. It raised 4 checks and 1 note, and I left each one as is on purpose:
  - 3 checks are the scheduled-heartbeat app values. Each card names its report time.
  - 1 check is that the SD queue never changes on the happy path.
  - The note is that the offline-rule code is on its node only.
- Not done: any browser or visual check. Board layout, overlapping labels and how the panels fit are unverified. No standalone HTML was built, because the accepted editor story is the deliverable here.

The coverage ledger, your answers, the decisions I made and the full storyboard are in story.ledger.md.
