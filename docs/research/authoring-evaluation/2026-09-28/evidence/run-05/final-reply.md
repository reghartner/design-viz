COMPLETE: "kestrel-overnight" is in the editor (revision c2c2dcc3-…-2). It's built at Engineering level for camera-platform and device-state engineers. The accepted source passes the validator with 0 errors and 0 warnings. The full ledger and storyboard are in story.ledger.md.

What's on the page
- One section, "kestrel-overnight". The story runs from Thu, Sep 24, 10:30 PM to Fri 8:30 AM.
- Map: Porch Cam → Home router → event-ingest, motion-classifier, clip-store, device-shadow, notify-service → Apple/Google push → Kestrel app.
- Panels: the camera's physical battery, the app's device page (what the resident's app shows), the device-shadow record, and a service log. The app and shadow panels change only when a heartbeat is delivered, so you can see them lag the real battery.
- Two paths share steps 1–8:
  - "Wi-Fi up at delivery" (11 steps): package push at 8:05 AM, then the resident opens the clip at 8:06.
  - "Wi-Fi down at delivery" (13 steps): the Wi-Fi link is shown blocked, the clip stays on the SD card, retries fail, and at 8:15 the queued clip uploads, a heartbeat is sent and the package push arrives about 10 minutes late. The camera never shows Offline, because the offline rule needs 60 minutes of missed heartbeats.
- Key moments:
  - 1:10 AM: the raccoon clip is labeled "animal" and no push is sent.
  - 4:00 AM: the heartbeat reports 20%, device-shadow marks low battery, and one "Porch Cam battery low" push goes out.
  - 6:50 AM: the battery starts charging, but the app still shows "Not charging, last report 6:30 AM".
  - 7:00 AM: the next heartbeat reports charging, and the app shows the solar icon.
- Services and code: event-ingest, clip-store, device-shadow, notify-service and the Kestrel app are linked to their catalog entries and API operations, copied exactly from catalog.json. All 7 reviewed code references are attached to their services, and to the steps where that code runs.

Please check this conflict
- Your 4:00 AM low-battery time doesn't fit the design's numbers. At about 1% per hour plus 1% for the raccoon clip, the battery would reach 20% around 2:30 AM (and be at 18.5% by 4:00).
- I kept your time. The battery is held at 25% until the 4:00 AM reading of 20%, and the page says so.
- If you'd rather keep the design's rate, the low-battery alert would move to about 2:30 AM.

Values I chose (the page says which are illustrative)
- Minutes not given: first heartbeat 10:30 PM, resident opens the clip at 8:06, retry step at 8:11, Wi-Fi back at 8:15.
- Solar charging at 3.5% per hour, the middle of the design's 3–4%, treated as net gain.
- The Wi-Fi outage starts at the 8:05 delivery, so the 8:00 heartbeat got through on both paths.
- Heartbeats between the steps shown are filled in on the 30-minute schedule.
- The app's battery card keeps the low-battery icon to the end, because the design only clears it above 30% and the battery never gets past 21%.

Gaps
- motion-classifier and Apple/Google push aren't in the catalog, so they aren't linked.
- There's no code reference for the camera firmware (SD queue, retries), for opening a clip, or for the classifier.
- The design doesn't say how service-to-service calls travel, so those links are marked "Transport unspecified".
- It also doesn't say where the timeline and "last event" are stored.

Checks
- Stamped and validated (0 errors, 0 warnings).
- State walk with the catalog: 0 warnings. All 12 expectations pass, including 25% at 1:10, 20% at 4:00, "Not charging" at sunrise, "Charging (solar)" at 7:00, and "Online" during the outage. The 5 other flags it raised are explained in the ledger.
- The first walk flagged the 25%→20% drop at 4:00 as faster than 1% per hour. That drop is the conflict above, so for the second walk I allowed that one stretch; every other stretch matches the design's rates.
- I haven't looked at the page in a browser, so layout, label crowding and switching between paths haven't been checked visually.
- No standalone HTML was built; the editor story is the deliverable.
