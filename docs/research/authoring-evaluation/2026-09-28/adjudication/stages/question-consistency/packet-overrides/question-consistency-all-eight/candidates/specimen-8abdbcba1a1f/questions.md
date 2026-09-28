I've read the Kestrel Porch Cam design. Before I build "kestrel-overnight", I need a few decisions from you. Each question has a suggested default, so you can reply "ok" or answer by number (for example "1 Story, rest ok").

1. How technical should it be?
   - Story: people, the porch, the camera, the phone and outcomes. The backend is one plain box ("Kestrel cloud"), with no service names or protocols.
   - Mixed: the same story, plus the main Kestrel services by name (event intake, clip storage, device status, notifications) and plain captions.
   - Engineering: every service hop, API call, failure rule and code reference.
   The "Story" setting currently in the editor dropdown is only the default, so I haven't treated it as your choice. Suggested: Mixed.

2. Who is it for, and what should they take away? Suggested audience: the product and support team. Suggested takeaway: "On one night on battery, the Porch Cam keeps recording, warns once when the battery gets low and starts recharging at sunrise. If Wi-Fi is down, the package alert arrives late but isn't lost."

3. When does it happen? The design only says "evening", "late night", "before dawn", "sunrise" and "morning". I'd use these example times and label them as examples on the page:
   - Mon, Sep 28, 10:30 PM: bedtime, battery 25%
   - 1:40 AM: raccoon
   - 2:30 AM: low-battery alert (where the design's drain rates put 20%)
   - 6:50 AM: sunrise, with charging showing in the app at 7:00 AM
   - 9:30 AM: courier delivers the package
   - Wi-Fi ending: Wi-Fi drops just before 9:30 AM and returns about 9:40 AM, then the late alert arrives.
   The clock would be 12-hour with short dates ("Tue, Sep 29"). Should any moment happen at a different time, such as the low-battery alert near 5 AM? If so, I'll keep your time and note on the page that it doesn't match the design's drain rate.

4. Which endings? Suggested: both. (a) The normal morning, where the package alert arrives and the resident opens the clip. (b) Wi-Fi is down at the delivery, so the clip waits on the camera's memory card and the alert arrives about 10 minutes late. The design doesn't say what the resident does next, so this ending stops at the late alert.

5. What does the phone show at the start? Suggested: the resident is asleep with the phone locked and no Kestrel alerts. The camera's page in the app shows "Battery 25% · updated 10:30 PM", not charging, online.

6. What should the viewer see? Suggested views:
   - an overview diagram of the camera, home router, Kestrel cloud and phone
   - the porch scene (raccoon, then courier)
   - the camera's actual battery level
   - the phone, with alerts, the camera's page and its event list
   The raccoon would appear only in the event list, with no alert, as the design describes. Is there any moment you want to stand out, or any view to drop?

Notes, no answer needed:
- The design names one component that isn't in the supplied catalog (the service that labels clips). Its box will have no catalog link. I've logged this as an engineering gap.
- No browser is available to me, so I won't be able to check the page visually.

Your questions, my working assumptions and the full source inventory are saved in story.ledger.md. I haven't changed the story yet.
