# Questions for the operator — kestrel-overnight

Source: input/hld.md (Kestrel Porch Cam — overnight on battery), plus input/catalog.json and input/code-evidence.md.
Each question has a proposed default; answering "ok" (or "ok to all") accepts it.

1. **Technical level.** Story (people, porch, phone, one "Kestrel cloud" box), Mixed (story + main services by name), or Engineering (every hop: camera → home router → event-ingest / clip-store / motion-classifier / device-shadow / notify-service → phone, with POST /events, PUT /clips, heartbeats, Backstage links and code references)?
   **Default: Engineering.**

2. **Story span and clock.** When does the night start and end, and how should dates/times look?
   **Default:** starts Thu, Oct 1, 2026 at 10:00 PM (resident goes to bed, battery 25%, not charging) and ends Fri, Oct 2 at about 9:30 AM; 12-hour clock, short date ("Fri, Oct 2"). All times illustrative except where you give them.

3. **Key moment times.** The HLD says only "late night", "before dawn", "sunrise", "morning".
   **Default (illustrative), heartbeats on the :00 and :30:**
   - 1:10 AM raccoon clip (animal, no push)
   - 2:00 AM heartbeat reports 20% → one "Porch Cam battery low" push (follows from 25% at 10 PM, 1%/h idle, 1% for the clip)
   - 7:05 AM sunrise, panel starts producing; 7:30 AM heartbeat reports charging=yes (solar icon in the app)
   - 9:10 AM courier drops the package → "Package delivered at front door" push → resident opens the clip
   Change any of these if you have real times.

4. **Solar rate.** The HLD says "Solar in morning light adds about 3–4% per hour" and idle drain is about 1%/h. Is 3–4%/h the net gain shown on the battery (so charge rises ~3.5%/h), or gross (net ~2.5%/h after idle drain)?
   **Default: net +3.5%/h** from sunrise. (Either way the battery stays below 30% by 9:30 AM, so the low-battery alert does not re-arm in this story.)

5. **Wi-Fi outage window (alternate ending).** The HLD says Wi-Fi is down "at the delivery" and returns "about 10 minutes later". Should the outage swallow a scheduled heartbeat?
   **Default:** Wi-Fi drops at 9:05 AM, the courier comes at 9:10 (clip saved to SD card, retries every 2 min fail), Wi-Fi returns at 9:15; the queued clip uploads, a heartbeat is sent, then the package push arrives late (~9:16). No heartbeat is missed, so device-shadow never marks the camera offline (offline needs 60 min / two missed heartbeats) — the app just shows "updated 9:00 AM" until reconnect. The offline rule is shown on the device-shadow node, not as a step.

6. **End of the alternate path.** The HLD says the resident opens the clip on the happy path only.
   **Default:** the Wi-Fi-down path ends when the late push arrives (no "resident opens clip" step, since the source does not describe it there). Say if you want the open-clip step on both paths.

7. **Audience and takeaway.** **Default:** audience = Kestrel platform, device-state and mobile engineers and reviewers; takeaway = "On one night on battery, only the right events reach the phone — the raccoon stays silent, low battery alerts exactly once, and a package is announced even if Wi-Fi is down, just late."
