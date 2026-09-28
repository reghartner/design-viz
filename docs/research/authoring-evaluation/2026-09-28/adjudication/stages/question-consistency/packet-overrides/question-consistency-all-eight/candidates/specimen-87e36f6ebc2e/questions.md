I've read the Kestrel Porch Cam design, the service catalog and the reviewed code locations. Before I build the "kestrel-overnight" story I need a few decisions from you. Each question has a suggested default, so you can reply "ok" to accept it or change only the ones you want.

1. Technical level: which version should I build?
   - Story: people, the porch, the camera, the phone and the app. The cloud appears as one or two plainly named boxes. No service names, APIs or code on screen.
   - Mixed: the same story, plus the main Kestrel services by name, still with plain captions.
   - Engineering: every service hop, API call, failure rule and code reference.
   Default: Story. (The Story setting in the editor was only the starting default, so please confirm or change it.)

2. Audience and takeaway: who will watch this, and what one sentence should they remember?
   Default audience: product and customer support. Default takeaway: "Through a low-battery night the camera keeps the resident informed, and a Wi-Fi drop only delays the package alert. Nothing is lost."

3. Timeline: the design gives no clock times. May I use these illustrative times?
   Default: Friday, Oct 2. Bedtime 10:00 PM (battery 25%). Raccoon around 1:00 AM. Low-battery alert at the 2:00 AM check-in. Sunrise and charging start around 6:45 AM. Courier around 9:15 AM. The Wi-Fi-down ending recovers about 10 minutes later. 12-hour clock, short date ("Fri, Oct 2").
   With these times, the design's power figures reach exactly 20% before dawn. I'll mark all of these times as illustrative on the page.

4. Endings: should I show both endings as two choices within the same night?
   Default: yes.
   (a) Normal delivery: package alert, and the resident opens the clip.
   (b) Wi-Fi is down at delivery: the clip is saved on the camera and uploads when Wi-Fi returns, then the alert arrives late. This ending stops at the late alert, because the design doesn't describe what the resident does next.

5. Starting situation: how should the phone look at bedtime?
   Default: the phone is locked with no Kestrel alerts. The camera's page in the app shows "Battery 25% · updated 10:00 PM", not charging.

6. Must-see moments: which views matter most?
   Default: four views.
   - The porch: raccoon, sunrise, courier.
   - Phone alerts: low battery, package.
   - The camera's page in the Kestrel app: battery, charging icon, "updated" time.
   - The camera's actual battery.
   Is there anything you want added, dropped or emphasized, for example the quiet raccoon event that sends no alert?

7. Only if you pick Story or Mixed: should I also add a separate engineering view of the same night for reviewers?
   Default: no. The service and code links will still sit behind the boxes either way.

After your answers arrive I'll build the storyboard, validate it and propose the story in the editor. Nothing has been changed in the editor yet. I've saved these questions and the evidence inventory in story.ledger.md.
