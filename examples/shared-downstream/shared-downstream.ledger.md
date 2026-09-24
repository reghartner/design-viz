# Shared downstream example

Synthetic authoring demonstration; no company implementation or measured behavior
is asserted. A button press and a confirmed motion event have different translation
paths, then reuse the same `process`, `persist`, and `notify` step IDs.

The motion path has one extra lead-in stop, so the common track is numbered 3–5
on the button path and 4–6 on the motion path. Both participating paths finish
there, so the track is a shared ending. The origin panel deliberately retains
Button or Motion: shared step definitions do not merge the paths’ folded state.

For a shared middle block followed by another split and rejoin, see
[the doorbell example](shared-blocks.spec.json) and its [ledger](shared-blocks.ledger.md).
