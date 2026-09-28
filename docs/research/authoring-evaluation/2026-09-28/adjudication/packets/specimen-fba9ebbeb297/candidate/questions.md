Before I build "kestrel-overnight", I have a few questions. Each has a suggested default, so you can answer "ok" to any of them. I haven't changed the story yet.

1. Technical level. Which one fits your audience?
   - Story: people, the porch, the camera, the phone and outcomes. The backend is one plain box ("Kestrel cloud"), with no service names, API names or code on screen.
   - Mixed: the same story, plus the main Kestrel services by name (event intake, clip storage, device status, notifications, the classifier), with plain captions.
   - Engineering: every service hop, the API calls, the failure rules and the reviewed code references.
   Default: Mixed. (The Story dropdown currently shows the editor's starting value; I'm not treating it as your choice.)

2. Audience and takeaway. Who will watch this, and what should they remember?
   Default: product and support teams. Takeaway: "Overnight on a weak battery, the Porch Cam ignores the raccoon, warns you once about low battery, starts charging at sunrise, and still tells you about the package, late but not lost, even if Wi-Fi is down."

3. The night and its times. The design gives no clock times, so these defaults are illustrative and will be labeled that way on the page:
   Tue, Sep 29 to Wed, Sep 30, 2026. Bedtime 10:30 PM. Raccoon about 12:40 AM. The low-battery warning comes at the first check-in where the battery reaches 20%, which is about 2:30 AM at the design's stated usage. Sunrise about 7:00 AM. Courier about 9:15 AM. In the Wi-Fi-down version, Wi-Fi comes back about 9:25 AM. The page would use a 12-hour clock and short dates such as "Wed, Sep 30".
   Please correct any time you know. If you give a time, I'll use it exactly.

4. Endings. Default: two endings that share the same night.
   (a) Wi-Fi is up at the delivery. The package alert arrives and the resident opens the clip.
   (b) Wi-Fi is down at the delivery. The clip waits on the camera's memory card, uploads when Wi-Fi returns, and the package alert arrives late. This ending stops when the late alert arrives, because the design doesn't say what the resident does next.
   Should both endings be shown, and should either one end differently?

5. What the viewer sees beside the system map. Default: a porch camera view (raccoon, courier, package), the camera's battery level, the phone's notifications, and the app's camera page ("Battery NN% · updated <time>", charging, online). Should any of these be dropped or added?

6. Starting situation at bedtime. Default: the phone is on the nightstand with no earlier alerts. The app shows "Battery 25% · updated 10:30 PM", not charging, online. Is that right?

Decisions I've made from the design unless you say otherwise: the battery drains about 1% per hour plus 1% per recorded clip, and solar adds 3.5% per hour (the middle of the design's 3–4%). The low-battery warning is sent only once. The 10-minute Wi-Fi outage is too short for the app to mark the camera offline, so the app just shows an older "updated" time. The classifier isn't in the supplied service catalog, so it won't be linked.

Please send your answers as your next message in the editor.
