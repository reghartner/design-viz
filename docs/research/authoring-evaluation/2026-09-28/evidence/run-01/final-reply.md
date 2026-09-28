COMPLETE: The "Kestrel Porch Cam: one night on battery" story is now in your editor. It is built at Story level for support leads and product managers.

What you'll see
- Three panels: the house and porch (opens as the main view), the resident's phone with the Kestrel app, and the camera's actual battery. The data-flow view uses only plain names: Porch Cam, Home Wi-Fi, Kestrel cloud, Kestrel alerts, Phone push, Kestrel app. It shows no service names or APIs.
- The shared night (Thu, Oct 1 into Fri, Oct 2):
  - 10:30 PM: bedtime check-in, 25%, not charging.
  - 1:05 AM: a raccoon is recorded and saved, with no alert.
  - 4:00 AM: the check-in reports 20% and the phone shows "Porch Cam battery low".
  - 6:50 AM: sunrise, and solar charging starts.
  - 7:00 AM: the check-in reports charging, and the app shows the solar icon.
- Normal morning:
  - 8:05 AM: the courier drops the package and the phone shows "Package delivered at front door".
  - 8:07 AM: the resident opens the clip.
- Wi-Fi down at delivery:
  - 8:05 AM: Wi-Fi is down, so the camera keeps the clip on its SD card.
  - 8:07 AM: the camera retries (it tries every 2 minutes). The app still shows the camera online, because Kestrel only marks it offline after 60 minutes.
  - 8:15 AM: Wi-Fi is back, the clip uploads, and the package alert arrives 10 minutes late.

One thing to know: your times and the design's battery figures disagree. At the design's roughly 1% per hour drain, plus 1% for the raccoon clip, the battery would reach 20% around 2:30 AM, not 4 AM. I kept your 4:00 AM alert. The battery panel holds at 25% until the 4:00 AM check-in reports 20%, and the page says this in its description. If the alert should really come earlier, or the drain should be lower, tell me and I'll adjust.

Illustrative values (the page says so): the date, the exact minutes, the check-ins between the moments shown, and a solar charge of 3% per hour, the low end of the design's 3–4%. The design doesn't say whether that figure is before or after the idle drain.

Checks run: the validator found 0 errors and 0 warnings. The state walk found 0 warnings, and all 7 of my expected values matched, including 25% at bedtime and 20% at 4:00 AM on both mornings. It raised 2 notes: the app shows the 6:30 AM and 8:00 AM check-ins, which fall between the moments shown and aren't drawn as a step. The editor applied the story as revision -2, and Undo is available.

Not done: I couldn't check anything visually because no browser was available. That includes the layout, where the raccoon, courier and camera sit on the porch, label clipping, and switching between the two mornings on screen. Please look through both mornings in the editor.

Behind the boxes: the Kestrel alerts box links to the notify-service catalog entry and the Kestrel app box to kestrel-app. All 7 reviewed code references are attached to their boxes and to the steps where that code runs. The "Kestrel cloud" box covers several services, so it isn't linked to one catalog entry.

Gaps for an engineer are listed in story.ledger.md:
- The classifier isn't in the catalog.
- It isn't clear exactly how the app reads the camera's status.
- The design and the code disagree on which service skips animal alerts. Either way, no alert is sent.

The ledger also holds the full storyboard, your answers, my decisions and the self-audit.
