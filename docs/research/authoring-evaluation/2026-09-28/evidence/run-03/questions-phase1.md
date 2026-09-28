I've read the Kestrel Porch Cam design. Before I build "kestrel-overnight" I need a few decisions from you. Each question has a suggested answer, so you can just reply "ok" to any of them.

1. Level of detail. Which one should it be?
   - Story: people, the porch, the camera and the phone. The backend is one plain box ("Kestrel cloud"), with no service names or technical terms on screen.
   - Mixed: the story plus the main services by name (event intake, clip storage, device status, notifications), with plain captions.
   - Engineering: every service hop, API call, failure rule and code reference.
   Suggested: Story. The Story setting in the editor is only its default, so please confirm or pick another.

2. Audience and takeaway. Who will watch this, and what one sentence should they leave with?
   Suggested: product and support teams. "Overnight on battery, the camera stays quiet for animals, warns once when the battery gets low, recovers with morning sun, and still delivers the package alert (late, but not lost) when home Wi-Fi drops."

3. Date and times. The design says "evening", "late night", "before dawn", "sunrise" and "morning" but gives no clock times.
   Suggested: Friday Oct 2, 10:00 PM, to Saturday Oct 3, about 9:15 AM, on a 12-hour clock with short dates ("Fri, Oct 2"). Bedtime 10:00 PM, raccoon 1:10 AM, low-battery warning 2:00 AM, sunrise 6:45 AM (the phone shows charging at 7:00 AM), courier 9:00 AM, Wi-Fi back 9:10 AM.
   Note: from 25% at bedtime, the design's power figures reach 20% at about 2:00 AM. If "before dawn" should be later, say around 5:00 AM, those figures won't fit and I'll point that out on the page.

4. Endings. Suggested: two.
   (a) Normal morning: the package alert arrives and the resident opens the clip.
   (b) Wi-Fi down at the delivery: the camera saves the clip, sends it about 10 minutes later when Wi-Fi returns, and the alert arrives late. The design doesn't say the resident opens the clip in this ending, so I'd stop at the late alert. Should I?

5. Starting situation. Suggested: camera at 25% and not charging, Wi-Fi working, the phone's camera page showing "Battery 25% · updated 10:00 PM", and no alerts yet.

6. What to show side by side. Suggested: the porch scene; the resident's phone (alerts and the camera page); a battery gauge showing the camera's actual charge; and what the app last heard, so viewers can see the two differ between check-ins. Should I add anything, such as the raccoon clip appearing in the app's event list with no alert, or drop anything?

7. Page title. Suggested: "Kestrel Porch Cam: one night on battery".

What I've already decided from the design (no answer needed):
- The design's power figures are used as given: about 1% per hour idle, about 1% per clip, and about 3–4% per hour from morning sun.
- The low-battery alert is sent only once, because the battery stays under 30% all morning.
- The Wi-Fi outage lasts about 10 minutes, well short of the 60 minutes before the app would mark the camera offline. The phone just shows an older "updated" time.
- Links to the service catalog and code sit behind the diagram boxes whichever level you choose.

I've saved these questions and my notes in story.ledger.md. Nothing in the editor has changed yet. I'll build the story after you answer.
