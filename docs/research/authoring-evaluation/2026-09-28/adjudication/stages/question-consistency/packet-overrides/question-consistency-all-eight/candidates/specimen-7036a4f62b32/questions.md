Before I build kestrel-overnight, I need a few decisions from you. Each question has a proposed default. Reply "ok" to accept it, or tell me what to change.

1. How technical should it be? The Story dropdown's current setting is only a default, so please choose:
   - Story: people, the porch, the phone and outcomes. The backend is one box called "Kestrel cloud". No service names or technical terms on screen.
   - Mixed: the story plus the main Kestrel services by name, with plain captions.
   - Engineering: every service hop, API, failure rule and code reference.
   Proposed: Mixed.

2. When does it happen? The design doesn't give clock times, so these are made-up example times and the page will say so:
   - bedtime 10:30 PM, Thu, Oct 1
   - raccoon 1:10 AM
   - low-battery report 2:30 AM
   - sunrise about 7:05 AM, with charging showing at 7:30 AM
   - courier 10:15 AM, Fri, Oct 2 (in the Wi-Fi-down ending, the camera is back online about 10:25 AM)
   Times use a 12-hour clock with short dates like "Fri, Oct 2". The design's own numbers (25% at bedtime, 20% before dawn, 1% per hour, 1% per clip) fit these times. Proposed: as listed.

3. Who is it for, and what should they take away? Proposed: product and support teams, with this takeaway: "Overnight on battery, the Porch Cam stays quiet for animals, warns once when the battery runs low, recovers on solar, and still tells you about a package even if Wi-Fi drops."

4. Which endings should it show? Proposed: both endings, sharing the same night:
   (a) Wi-Fi works at delivery, so the alert arrives right away.
   (b) Wi-Fi is down at delivery. The clip is saved on the camera and the alert arrives about 10 minutes late.

5. Which moments must viewers see? Proposed: these five:
   - the raccoon clip is saved with no alert
   - the one-time low-battery alert
   - the battery switches to solar charging
   - the package alert
   - in the Wi-Fi-down ending, the late alert after Wi-Fi returns
   Anything to add or drop?

6. Should it show the phone? Proposed: yes. A phone would show the Kestrel app's camera page (battery %, charging, "updated" time) and the alerts as they arrive.

7. How should the Wi-Fi-works ending finish? The design says the resident opens the clip. Proposed: end with the clip playing in the app. The Wi-Fi-down ending stops at the late alert, because the design doesn't say the resident opens it there.

I haven't changed anything in the editor yet. These questions and my evidence notes are saved in story.ledger.md. I'll build the story once you answer.
