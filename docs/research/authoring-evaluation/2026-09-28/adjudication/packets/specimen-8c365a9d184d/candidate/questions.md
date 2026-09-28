Before I build "kestrel-overnight", I need a few decisions. Each has a proposed default, so you can answer "ok" to any of them (or "all ok"). Nothing has been changed in the editor yet.

1. Technical level. Which fits your viewers?
   - Story: the camera, the porch, the phone and what the resident sees. The cloud is one or two plainly named boxes ("Kestrel cloud"); no service names, APIs or code on screen.
   - Mixed: the same story, plus the main Kestrel services by name (event intake, clip storage, device status, notifications, the clip classifier), with plain captions.
   - Engineering: every service hop, the API calls, the low-battery and offline rules, and code links on each step.
   Proposed default: Mixed. (The "Story" setting currently shown in the editor is only a starting default, so I have not treated it as your choice.)

2. Audience and takeaway. Who will watch, and what should they remember?
   Proposed default: product and support teams. Takeaway: "On a low battery, the Porch Cam still catches the night's events quietly, warns once when the battery gets low, starts recovering at sunrise, and still delivers the package alert if Wi-Fi drops, just late."

3. Timing. The design names parts of the night but gives no clock times, so these would be shown as illustrative:
   Friday, Oct 2: 10:30 PM resident goes to bed (battery 25%, not charging) → 1:10 AM raccoon on the porch → 2:30 AM battery reported at 20%, low-battery alert → 7:00 AM sunrise, charging starts → 9:15 AM courier drops the package → (Wi-Fi-down ending only) Wi-Fi back about 9:25 AM, late alert.
   Clock shown as 12-hour with a short date ("Sat, Oct 3").
   Do you want real times or a different date, or are these fine?

4. Endings. Show both endings as one night that splits at the delivery: (a) normal Wi-Fi, alert arrives right away; (b) Wi-Fi down, clip saved on the camera's card, alert arrives about 10 minutes late?
   Proposed default: yes, both, with the normal delivery as the main path.

5. Starting situation. Proposed default: at bedtime the phone has no unread Kestrel alerts, and the app's camera page shows "Battery 25%" as last reported at bedtime. Anything else already on the phone or porch we should show?

6. Moments to highlight. Proposed default: the raccoon clip saved with no alert (so the resident sleeps), the single low-battery alert (and that it doesn't repeat), the charging icon appearing after sunrise, and the package alert. On the Wi-Fi-down ending: the clip safe on the camera's card, the app still showing the last status (not "offline"), then the late alert. I'd also include a simple porch camera view showing the raccoon and the courier. Add, drop or reorder anything?

7. Ending of the normal path. The design says the resident opens the clip after the package alert. Proposed default: end the normal path there, and end the Wi-Fi-down path when the late alert arrives (the design doesn't say what the resident does next). OK?

I'll wait for your answers before planning or proposing anything. No visual (browser) checks have been done; none are possible in this session.
