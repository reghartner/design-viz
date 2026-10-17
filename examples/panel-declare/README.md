# Panel declaration overrides

Open `panel-declare.spec.json` in the workbench, or open the generated HTML.
A pump controller first reports flow in litres per minute. At the third step
of the **Hourly reporting** path the gauge's `declare` changes its `max`,
`unit` and `title` to hourly volume, and the latency budget's `spans` gain a
compression span. On the **Link down** path the readings table's `declare`
adds a **Stored locally** column that the other path never has.

Select a step → Inspect → Panel changes → **Declaration overrides** (under
Advanced) to edit the JSON object; choose **This step only** to apply it to one
beat. Select a step on the other path to see that overrides do not cross
paths. All content is fictional.
