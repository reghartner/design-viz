The Kestrel overnight diagram is built as an engineering-level page, with a happy path and a Wi-Fi-down path. The build finished with 0 errors and 0 warnings, and the self-audit script also reports 0 warnings. I could not open the page in a browser, so nothing visual has been checked.

**Files in out/:**
- `kestrel-overnight.spec.json` (final, stamped)
- `kestrel-overnight.html` and `manifest.json`
- `kestrel-overnight.ledger.md` (coverage ledger, your answers, my decisions, the storyboard and the self-audit)
- `QUESTIONS.md` (the first-turn questions)

**The two paths** share the first six steps:
1. 10:30 PM heartbeat: 25%, not charging.
2. 1:10 AM raccoon: clip uploaded, labelled `animal`, no push.
3. 4:00 AM heartbeat reports 20%: the "Porch Cam battery low" push is sent once.
4. 6:50 AM sunrise: the battery is charging but the app still says "not charging".
5. 7:00 AM heartbeat reports charging: the app shows the solar icon, and the low-battery state stays set because the battery is under 30%.

Then:
- **Happy path:** the 8:05 AM package push goes out on time, and the resident opens the clip at 8:06.
- **Wi-Fi-down path:** Wi-Fi drops at 8:03. At 8:05 the clip goes to the SD card and the camera-to-router hop is shown as failed; retries every 2 minutes also fail. The app keeps showing "Online, updated 8:00 AM" because offline takes 60 minutes. At 8:15 the queued clip uploads, and the package push arrives at 8:16.

Each service in the catalog links to its Backstage entry and API operation. All seven approved code references sit on their services, and on the steps where that code runs.

**Your times and the design's battery drain disagree.** From 25% at 10:30 PM, the design's ~1% per hour plus 1% for the raccoon clip reaches 20% around 2:30 AM, not 4:00 AM. That would also send the low-battery push at 2:30. I kept your 4:00 AM time, held the battery at 25% until then and jumped to 20%, rather than invent a slower rate. The page and the ledger both say so.

**Questions you didn't answer, where I used my proposed default:**
- Solar charging is shown as a net gain of 3.5% per hour.
- The Wi-Fi outage runs 8:03–8:15, so no heartbeat is missed and the camera never goes offline.
- The Wi-Fi-down path ends at the late push, since the design doesn't say whether the resident opens the clip there.

**Illustrative values, labelled on the page:**
- The 7:00 AM charging heartbeat, 8:03 drop, retry times, 8:06 open and 8:16 push.
- The app's battery readings between the heartbeats the page shows.

**Gaps:**
- motion-classifier isn't in the catalog, so it has no link. The home router, the camera and Apple/Google push aren't catalog services.
- The design doesn't say which service serves the app's "Last event" card, so that card has no data source.
- The app's read of device-shadow isn't drawn because the design gives no timing, so the app's device-page code appears on the app box only.
- device-shadow's offline rule is linked on its box but never runs.
- The code references couldn't be checked against real code because no repository checkouts were supplied.

**Checks I ran:**
- The self-audit script over both paths, with 13 expected-value checks, all passed. They cover your 20% anchor, the app still showing "not charging" at sunrise, "Online" during the outage, and the low-battery icon to the end of both paths.
- A comparison of the result against the storyboard: step order, times, which panels change, icons, catalog links and code references.
- The script also raised six points for review, each explained in the ledger. One warning in a first run came from a check range I passed for the app's battery card. That range can't fit your 25%→20% jump, so I dropped it for the card rather than change your time.

**Not checked visually:**
- The layout and whether any labels collide.
- How the app cards and their "updated" times look.
- That the camera view stays hidden until the delivery.
- The notification stack.
- Switching between the two paths.
- The router's red and green colours.

Nothing was committed or published.