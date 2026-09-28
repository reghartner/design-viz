COMPLETE: "Kestrel Porch Cam — overnight on battery" (kestrel-overnight) is in the editor at revision -2 (status: applied, Undo available). The validator reports 0 errors and 0 warnings on the accepted story.

One thing to know first: your 4:00 AM low-battery time doesn't match the design's drain rate. At about 1% per hour idle plus 1% per clip, 25% at 10:30 PM would reach 20% near 2:30 AM. I kept your 4:00 AM time. The camera battery holds at 25% until the 4:00 AM heartbeat reports 20%, and the 1%/h drain applies from then on. The page's section text, the battery note and the ledger all say this. If you'd rather keep the rate and move the alert to about 2:30 AM, tell me and I'll change it.

What's on the page (engineering level):
- Two paths share the first seven steps: "Delivery on Wi-Fi" and "Wi-Fi down at delivery". The shared steps:
  - 10:30 PM: heartbeat
  - 1:10 AM: raccoon clip uploaded and labeled animal, with no push
  - 4:00 AM: 20% heartbeat, low_battery set, one "Porch Cam battery low" push
  - 6:50 AM: sunrise; charging starts on the camera, but the app still says not charging
  - 7:00 AM: the next heartbeat reports charging, and the app shows the solar icon
- Delivery on Wi-Fi: the 8:05 AM clip uploads, is labeled package, and the "Package delivered at front door" push is sent. The resident opens the clip at 8:07.
- Wi-Fi down: Wi-Fi drops at 8:03. The 8:05 clip is queued on the SD card, and the camera→router hop is shown as dropped, with retries every 2 minutes. The app's last report ages but it stays Online, because no heartbeat is missed and the offline rule needs 60 minutes. Wi-Fi returns at 8:15; the clip uploads and a heartbeat is sent. The package push arrives at 8:16, 11 minutes late.
- Panels:
  - camera battery (physical)
  - device-shadow record (reported)
  - Kestrel app device page, with notifications and report times
  - SD-card upload queue
- Services: event-ingest, clip-store, device-shadow, notify-service and the Kestrel app are linked to their catalog entries, with API operations on the first four. All 7 reviewed code references sit on their services and on the steps where that code runs. The offline rule and the device-page code are attached to their services only, because neither runs in this story.

Values I chose (labeled illustrative on the page):
- Minutes you didn't give: 7:00 charging heartbeat, 8:03 Wi-Fi drop, 8:07 clip opened, 8:13 retry, 8:15 reconnect, 8:16 push.
- 2.5%/h net solar charge rate.
- The app's report values between the drawn heartbeats.

Gaps the design and approved evidence don't settle (listed in the ledger):
- motion-classifier isn't in the catalog, so it has no catalog link or code reference.
- The design doesn't say:
  - whether "adds 3–4% per hour" is net of the idle drain
  - where the "last event" timeline lives or how the app reads it
  - how the app fetches the clip when it's opened (no hop is drawn for that step)
  - when the app refreshes the device page (the panel shows what device-shadow would serve)
  - which operations the internal calls use (I used the only matching catalog operation: putState, sendPush)

Checks run:
- Validator: 0 errors, 0 warnings.
- State walk against the catalog, with the design's rates: 0 warnings, all 12 of my expected-value checks passed. The 6 points it flagged for review are explained in the ledger's self-audit.

Not done: no visual or browser check (no browser available) and no standalone HTML build (the editor story is the deliverable here).

The coverage ledger (41 rows), your answers, my decisions, the gaps, the complete storyboard (sections A–I) and the self-audit are in story.ledger.md.
