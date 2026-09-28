# Key facts a correct diagram must respect (Kestrel Porch Cam overnight)

- Heartbeat every 30 min: camera → event-ingest → device-shadow. The app shows the last reported battery and its time; it does not update between heartbeats.
- Motion: camera records ~20 s clip, POST /events to event-ingest, uploads clip to clip-store; event-ingest asks motion-classifier for a label; person/package → notify-service sends push; animal → saved, no push.
- Low battery: a heartbeat reporting ≤20% makes device-shadow mark low_battery and notify-service send ONE push; not again until above 30%.
- Solar: charging=yes appears on the next heartbeat after the panel produces power; the app shows the solar charging icon.
- Rates: idle ~1%/h; each clip ~1%; solar in morning light ~+3–4%/h.
- Wi-Fi down: camera records to SD, retries every 2 min; on reconnect uploads queued clips and sends a heartbeat. device-shadow marks offline only after two missed heartbeats (60 min); a ~10 min outage never reaches offline — the app keeps the last state with an older time.
- Alternate path: the package push is sent late, after the clip uploads on reconnect. The design does not say the resident opens the late clip.
- motion-classifier is NOT in the catalog: it must stay unbound.
- Operator anchors (engineer answers): Thu Sep 24 10:30 PM start at 25%, raccoon ~1:10 AM, low-battery heartbeat ~4:00 AM, sunrise 6:50 AM, courier 8:05 AM.
- IMPORTANT: judge anchors against `brief/answers.md` for THIS run only. The exact dates and minutes above come from the ENGINEER answer sheet. The BUSINESS answer sheet gives only approximate times ("around", "pick sensible minutes") and no calendar date: any sensible date that matches the stated weekday, and minutes close to the approximate times, are correct for a business run and must not be deducted.
