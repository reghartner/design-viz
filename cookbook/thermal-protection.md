# Thermal protection — hot/cold Home devices and unavailable video

Start with **starters… → thermal protection**, or use the complete teaching seed:

- [Source design](../docs/hlds/thermal-doorbell.md)
- [Storyboard and coverage ledger](../docs/diagrams/thermal-doorbell/thermal-doorbell.ledger.md)
- [Executable spec](../docs/diagrams/thermal-doorbell/thermal-doorbell.spec.json)
- [Interactive page](../docs/diagrams/thermal-doorbell/thermal-doorbell.html)

This is a proposed design, not a claim about Ring hardware, thresholds or alerts.
The normal path welcomes a visitor; overheating and cold branches show charging,
protective camera shutdown, a supported health notice, a missed visit and recovery.
Home and Data flow use the same registry and retain the selected path and beat.

## Keep independent state dimensions

The Home device's operating state, thermal condition, camera screen, charging
and actual temperature are separate. None automatically sets another. For a
panel named `home` with camera device `cam`, these are sparse step patches:

```
{"home":{"cam":{"thermal":"warm"}}}
{"home":{"cam":{"state":"off","thermal":"hot"}},
 "screen":{"mode":"unavailable","reason":"Protective shutdown · too hot"}}
{"home":{"cam":{"thermal":"normal"}}}
{"home":{"cam":"scan"},"screen":{"mode":"active","reason":null}}
```

Warm/hot show amber/red heat waves and a thermometer. Cold/freezing show a
blue halo, frost and a snowflake. These are symbolic cues, not literal flames
or proof of ice. Thermal effects remain visible with the device off. A transition
back to normal fades the overlay; reduced motion shows the settled state.

Structured attributes merge independently. A legacy string changes only the
operating state and preserves any thermal condition. Omission inherits;
`thermal:"normal"` explicitly clears it. Devices already using strings continue
to work. Subjects still use `{x,y}` or null, and signals remain step-local.

The Home step inspector has separate **state** and **Temperature** controls with
Inherit for each. In the shared inspector, expand **Starting device conditions**
to set the initial values. Each edit is one undoable change. Screen patches add
**Unavailable** mode and **reason**. A reason is plain text, appears only in that
mode and carries across steps; null clears it to the default explanation.

## Show the safe interval honestly

The `thermo` declaration supports `lowWarn` and `lowCrit` alongside existing
`warn` and `crit`. Low limits are inclusive at-or-below; hot limits are inclusive
at-or-above. Cold critical must be at/below cold warning, and the inner cold
limit must remain below the inner hot limit. Invalid/reversed/overlapping
limits produce validator warnings. Omit cold limits for legacy behavior.

Label what is measured: ambient air, device body, battery, or silicon die.
Do not substitute one measurement or another product's thresholds. Only use
numbers supported by the source, or explicitly authored hypothetical values.
Restart gates can differ from warning boundaries: the seed's cold branch is
nominal at 3°C while the camera stays off, awaiting its above-5°C restart gate.

Charging can stop while video continues. Camera shutdown does not establish
loss of health telemetry; the seed explicitly declares an always-on controller.
A notice requires a supported communication path. An offline device alone
does not establish temperature as the cause. A missed recording cannot appear
retroactively after restart.

## Build and verify

Use `tools/page_build.py` with an absolute output directory. The semantic checks
in `tests/thermal-story.test.js` cover the limits, independent state folding,
branches, editor patches, unavailable screen and teaching seed. Inspect the built
page at intended desktop and embed widths: heat/frost during shutdown, the camera
scene disappearing, notification timing, restart without a fabricated clip,
view switches and reduced motion. Rebuild old HTML with the current template to
use these fields; deploy updated host assets through the normal integration path.
