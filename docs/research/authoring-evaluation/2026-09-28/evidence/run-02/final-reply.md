COMPLETE: The kestrel-overnight story is now in your editor (it replaced the empty starter; Undo is available). It is written at Story level for support leads and product managers.

What it shows, on Thu, Oct 1 into Fri, Oct 2:
- 10:30 PM: The resident goes to bed. The camera is on battery at 25% and checks in every 30 minutes.
- 1:05 AM: A raccoon crosses the porch. The clip is saved, but animals don't trigger an alert, so the phone stays quiet.
- 4:00 AM: A check-in reports 20%, so the phone gets one "Porch Cam battery low" alert. It won't repeat until the battery is back above 30%.
- 6:50 AM: The sun comes up and solar charging starts. The cloud learns this at the 7:00 AM check-in.
- Two endings, picked with the path control:
  - Normal morning: at 8:10 AM the courier drops the package and "Package delivered at front door" arrives right away. At 8:11 AM the resident opens the clip, and the camera page shows 21%, charging on solar, still flagged low.
  - Wi-Fi down at the delivery: at 8:10 AM the clip is saved on the camera's memory card, and at 8:12 AM the camera retries. At 8:20 AM Wi-Fi is back, the clip uploads, and the same alert arrives 10 minutes late. The camera is never marked offline, because that takes 60 minutes.

On screen are the home and porch map, the resident's phone, and the camera's battery. There are no service names, APIs or code in what readers see. The links to engineering records and code are attached behind the diagram boxes.

One thing to know: your times and the design's battery numbers don't quite agree. The design's rough figures (about 1% an hour, plus 1% per clip) would reach 20% around 2:30 AM, not 4 AM. I kept your 4 AM alert. The battery shows 25% until then instead of a calculated value, and the page says so in one line. After 4 AM the battery follows the design's figures. The exact minutes, plus the 7:00, 8:11, 8:12 and 8:20 AM times, are my choices, and the page labels them as approximate or illustrative.

Checks: the editor accepted the story. It passes validation with no errors or warnings. The step-by-step check found no warnings or open issues, and it confirmed 25% at 10:30 PM, 20% at 4 AM, 21% on the camera page at 8:11 AM, and Wi-Fi shown down during the retry. Visual checks were NOT done, because no browser was available. Please look at the map layout, the phone panel, and how both endings play in the preview.

For an engineer to review (all recorded in story.ledger.md, along with your answers, the full storyboard and the self-audit):
- The motion classifier has no catalog entry or code.
- There is no code for the camera's retry and memory card, or for playing the clip.
- The design doesn't say how the phone connects, or when the Wi-Fi outage started.
