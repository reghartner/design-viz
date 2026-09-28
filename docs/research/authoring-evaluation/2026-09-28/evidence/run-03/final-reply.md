COMPLETE: "Kestrel Porch Cam: one night on battery" (kestrel-overnight) is in the editor now. The editor accepted it as revision 2, and Undo is available. It's built at the Story level for support leads and product managers.

What you'll see
- Four views side by side: the home and porch; the camera's actual battery; the resident's phone (alerts, plus the camera page with battery, power, connection and last event); and the camera's view of the delivery, which appears from the delivery onward.
- Backend: one "Kestrel cloud" box. No service names or technical terms appear on screen.
- Shared night:
  - 10:30 PM Thursday: bedtime. Battery at 25%, not charging.
  - 1:04 AM: a raccoon. The clip is saved and marked "Animal"; no alert.
  - 4:00 AM Friday: the check-in reports 20%, and one "Porch Cam battery low" alert arrives.
  - 6:50 AM: sunrise; the battery starts charging.
  - 7:00 AM: the phone shows solar charging.
  - 8:10 AM: the courier drops the package.
- Two endings (choose one in the path picker):
  1. Normal morning: at 8:11 AM "Package delivered at front door" arrives, and at 8:12 AM the resident opens the clip.
  2. Wi-Fi down at delivery: at 8:11 AM the camera saves the clip to its SD card and keeps retrying. The phone still shows the 8:00 AM check-in and still says Online, because the camera is only marked offline after an hour. At 8:20 AM Wi-Fi returns, the clip is sent, and the package alert arrives 10 minutes late.

One thing to know
Your 4 AM alert time and the design's battery figures don't quite agree. At about 1% an hour, plus about 1% for the raccoon clip, 25% would reach 20% nearer 2:30 AM. I kept your 4 AM time, so the battery gauge stays at 25% until the 4:00 AM check-in instead of showing guessed values in between. The page says this in its description.

Values I chose (the page labels them as illustrative)
- Clock minutes and the date: Thu, Oct 1, 2026.
- Solar charging at 3.5% an hour, the middle of the design's 3–4%.
- Wi-Fi dropping after the 8:00 AM check-in.
- The phone's in-between check-ins at 1:00, 6:30 and 8:00 AM.
- The low-battery mark stays all morning, because the battery never gets back above 30%.

Checks
- Validator: 0 errors, 0 warnings.
- Step-by-step walk of both endings: 0 warnings, and all 6 checks on your times and battery values pass. It raised two notes about the phone updating at 6:30 and 8:00 AM without a drawn message. Those are the in-between check-ins, labeled illustrative on the page.
- Visual checks were NOT done, because no browser was available. Please look over the home map layout, how labels fit, and the phone cards.

Behind the scenes
- The Kestrel app box links to its catalog entry and its code.
- The Kestrel cloud box carries the six approved backend code references, and each is attached to the steps where it runs.
- Engineering gaps are listed in story.ledger.md: the motion classifier isn't in the catalog, there's no camera firmware code, there's no code for opening a clip, and the catalog and design disagree on the check-in path.

story.ledger.md also holds your answers, the storyboard and the coverage ledger.
