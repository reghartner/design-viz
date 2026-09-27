# Story time example

Synthetic renderer demonstration of story time, step clocks and automatic
battery drain. No company API, device model or measured battery behavior is
asserted. The drain and charge rates are illustrative diagram defaults, and the
app's battery card is an explicit report, not a live reading: its value is
authored at the steps that deliver a report (`reportedAt: "now"`), and its
"Updated … ago" text is computed from story time.
