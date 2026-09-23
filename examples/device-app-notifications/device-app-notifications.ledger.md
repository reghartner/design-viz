# Resident device app example

Source: synthetic scenario demonstrating the renderer; no vendor API or measured
behavior is asserted. Source mappings are intentionally omitted.

| Step | Action | App result |
|---|---|---|
| ready | Open app | Battery, power, connection, recording and firmware tiles |
| press | Visitor presses doorbell | No app notification before its delivery |
| notify | Notification arrives | New notification; all tiles unchanged |
| recording | Recording completes | Recording tile changes; second notification |
| dismiss | Resident dismisses stack | No notifications; tile values retained |

The source-free presentation is deliberate. Add sources when the diagram needs
to explain backend provenance; `showSources:false` can hide an existing map.
