# A doorbell protects itself — proposed teaching design v1

This is a fictional design for explaining temperature protection. It is not
Ring firmware documentation or a claim about Ring notifications. All values,
thresholds, control messages, recovery rules and notification text below are
authored demonstration facts, not product measurements. The audience is both
engineers and business readers; both views follow the same full timeline.

## Components and temperature policy

The doorbell contains an always-on Controller and a separately powered Camera.
Controller can turn Camera off while continuing to send health telemetry. It
uses an internal control link to Camera and MQTT to Health Service. Camera sends
clips to Clip Service over HTTPS. Health Service and Clip Service request notices
from Notifications over HTTPS; Notifications delivers to Resident Phone over HTTPS.
Cloud services on the Home map summarizes Health Service, Clip Service and
Notifications. The two porch device markers represent parts of one doorbell.

The displayed temperature is a device-body reading, not outdoor air or a die
measurement. The illustrated thresholds are cold critical at -15°C, cold warning
at 0°C, hot warning at 50°C and hot critical at 65°C, inclusive. The plotted
range is -30°C through 90°C. At hot warning the camera reduces video capability;
at hot or cold critical the controller turns Camera off. At cold warning charging
pauses while Camera may remain active. Charging resumes only after recovery.
For this example the hot restart gate is below 40°C and the cold restart gate
is above 5°C. Temperature returning to the gauge's nominal interval alone is
not the restart event. Controller's health connection remains available throughout.

This scenario takes place after dark; the recorded approach uses night lighting.
Initial conditions: 22°C, battery 82%, wired charging, active camera with a quiet
porch, no recording, no visitor and no notifications. A closed front door separates
the porch from the entry. The resident is inside. Battery charge remains 82% in
this short illustrative sequence; no energy-consumption calculation is implied.

## Normal operation

1. Ready: the camera is active at 22°C.
2. A visitor approaches; the reading is 24°C. The camera sees the approach.
3. The visitor presses the button. Controller requests recording; the camera records.
4. Camera finishes recording and sends the clip to Clip Service, which retains it.
5. Clip Service requests a notice; Notifications delivers “Visitor at the front door”
   with text “A clip is available.” The resident moves toward the entry.
6. The resident opens the door and welcomes the visitor inside. The saved clip remains.

## Overheating alternate

Shares Ready, then diverges before the visitor approaches.

2. Device temperature reaches 55°C. Camera remains active with reduced video capability.
3. The reading reaches 70°C. Controller disables Camera and pauses charging.
4. Controller reports the protection state to Health Service while Camera stays off.
5. Health Service requests a notice; Notifications delivers “Camera paused: too hot”
   with text “Video is unavailable while the doorbell cools.”
6. A visitor reaches the door and presses the button while Camera is off. Controller
   refuses capture; no recording or clip upload occurs. The resident remains inside.
7. The reading falls to 55°C. Camera remains off while the doorbell cools.
8. The reading reaches 35°C, below the restart gate. Camera is still off until restart.
9. Controller powers Camera up; it boots. The visitor leaves without being recorded.
10. Camera returns active and charging resumes. The missed visit remains missed.
    The earlier temperature notification remains on the phone; no recovery notice
    or retroactive clip is generated in this design.

## Cold-weather alternate

Shares Ready, then diverges before the visitor approaches.

2. The reading falls to -5°C. Charging pauses; Camera remains active.
3. The reading falls to -18°C. Controller disables Camera; charging remains paused.
4. Controller reports the protection state to Health Service while Camera stays off.
5. Health Service requests a notice; Notifications delivers “Camera paused: too cold”
   with text “Video is unavailable until the doorbell warms.”
6. A visitor reaches the door and presses the button while Camera is off. Controller
   refuses capture; no recording or clip upload occurs. The resident remains inside.
7. The reading rises to 3°C. The gauge is nominal, but Camera stays off because the
   cold restart gate has not yet been reached.
8. At 8°C the restart gate is satisfied; Camera is still off until restart.
9. Controller powers Camera up; it boots. The visitor leaves without being recorded.
10. Camera returns active and charging resumes. The missed visit remains missed.
    The earlier cold notification stays; there is no recovery notice or retroactive clip.

## Presentation intent

Use a large Home map, device temperature gauge, camera screen, capability table,
phone and battery. Heat waves and frost are symbolic overlays, not literal fire
or observed ice. Thermal condition and operating state are independent: the hot
or frozen appearance survives shutdown. The unavailable screen gives the reason
and hides the scene, so the visitor on the Home map is not falsely shown as recorded.
The normal path shows the recorded visitor approach using an illustrative nighttime
porch scene; the Home map is the physical ground truth. Replay of saved media is
not a claim that the camera is live. Motion and layout geometry are illustrative.
Show the full topology in both Home and Data flow views. Open paused. Optimize for
desktop and intended embedded page widths.
