I built the kestrel-overnight diagram at story level. It has two endings: a normal morning, and a morning when the home Wi-Fi is down as the courier arrives. The build finished with 0 errors and 0 warnings. The skill's step-by-step check of the spec found 0 warnings and 0 items to review, and every time and battery value you gave checks out.

I couldn't look at the page because no browser was available. Still unchecked: the layout and whether labels get cut off, the phone clock and date, the charging and package icons appearing, the porch view appearing at 8:10 and playing, and switching between the two endings.

**What the viewer sees**
- **10:30 PM Thursday:** the resident goes to bed. Battery at 25%, not charging, no alerts.
- **1:05 AM:** a raccoon clip is recorded and saved. Animals don't send an alert.
- **4:00 AM:** the regular check-in reports 20%, and the phone gets one "Porch Cam battery low" alert. It won't repeat until the battery is back above 30%.
- **6:50 AM:** sunrise, and the battery meter starts climbing. The 7:00 AM check-in reports that it is charging.
- **Normal morning:** at 8:10 the package alert arrives right away. At 8:12 the resident opens the clip, and the camera page shows 21% from the 8:00 check-in, charging from the sun.
- **Wi-Fi down:** at 8:10 the clip is saved on the camera's memory card and no alert goes out. At 8:20 Wi-Fi is back, the clip uploads, and the package alert arrives about 10 minutes late. The camera is never marked offline.

**One conflict you should know about:** with the design's own figures (about 1% an hour idle, plus 1% per clip), the battery would hit 20% around 2:30 AM, not 4 AM. I kept your 4 AM time. The battery meter stays at 25% until the 4:00 AM check-in reports 20%, and the page says in one line that the times and usage figures disagree. Because of that, the raccoon clip's 1% isn't shown on its own.

**Choices you didn't make** (I've listed them in the ledger for an engineer to check):
- The Kestrel backend is five plainly named boxes, such as "Camera check-ins" and "Alerts", instead of a single "Kestrel cloud" box. That way each box can link to its catalog entry and code without any service name appearing on screen.
- Exact minutes, check-in times and the camera page values at 8:12 are illustrative, and the page says so.
- Solar charging uses 3% an hour, the low end of the design's 3–4%.
- The phone stays on its lock screen all night. The camera page only appears when the resident opens the clip, and it isn't shown in the Wi-Fi ending because the design doesn't say they open it.
- I took "no answer" as "yes" for your questions 5–7. The raccoon appears only in the step description, because the app isn't open overnight.

**Gaps:** motion-classifier ("Clip sorter") isn't in the catalog, so it has no link. The home router, Apple/Google push and the camera itself aren't catalog services, and no camera code was supplied. The offline rule is attached to its box but never runs, because the outage is shorter than an hour.

I briefly wrote scratch files to `/tmp` by mistake, then moved them into `out/work/` and deleted the `/tmp` copy. Nothing in the repository or the skill was changed.

Files are in `out/`:
- `kestrel-overnight.html`
- `kestrel-overnight.spec.json`
- `kestrel-overnight.ledger.md` (coverage table, your answers, my choices, the storyboard and the checks I ran)
- `manifest.json`
- `QUESTIONS.md`
- `work/` (the script that generates the spec, and the unstamped spec)