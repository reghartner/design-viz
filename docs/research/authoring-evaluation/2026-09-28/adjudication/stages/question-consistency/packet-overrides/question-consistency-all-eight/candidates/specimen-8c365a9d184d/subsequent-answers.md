# Operator answers (engineer)

- **Technical level:** Engineering. Show every service hop, the API operations,
  and the code references.
- **Audience and takeaway:** Camera-platform and device-state engineers. They
  should see exactly which service does what at each moment, how the app's
  view lags the device's real battery, and how the Wi-Fi outage delays the
  package push.
- **Time:** Starts Thursday Sep 24 at 10:30 PM. Raccoon around 1:10 AM.
  Low-battery heartbeat around 4:00 AM. Sunrise 6:50 AM. Courier 8:05 AM.
  Use plausible illustrative minutes where not given.
- **Outcomes:** Happy path, plus the Wi-Fi-down alternate at the delivery.
- **Starting state:** Battery 25%, not charging, online, Wi-Fi good, no
  notifications on the phone.
- **Backstage / code:** Use `catalog.json` and `code-evidence.md` in the input
  folder. Those are the only approved identities and code locations.
- **Other:** Standalone HTML is fine. No need for mobile checks.
