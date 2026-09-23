# Audio conversations and sound at the device

Use the complete [Sound at the door seed](../src/starters/audio-story.json), also
available in **New project → Sound at the door**. It has three fictional chapters:
a resident's delivery conversation, an operator's intervention, and a camera
hearing an alarm test. All audio is represented visually and through captions.
The viewer does not play sound, request microphone permission, or call a service.

## Choose the endpoint, then author what happens there

| Surface | Where to put the audio object | Meaning |
| --- | --- | --- |
| Camera Screen | `initial.audio` or step `panels.camera.audio` | Camera speaker output and camera microphone input |
| Security monitoring | `initial.audio` or step `panels.monitor.audio` | Operator headset output and operator microphone input |
| Phone | `initial.audio` or step `panels.phone.audio` | Phone speaker output and resident microphone input |
| Home map device | `initial.deviceId.audio` or step `panels.home.deviceId.audio` | Sound produced or captured at that device's location |
| Home map subject | `initial.personId.audio` or step `panels.home.personId.audio` | Sound produced by that person; include x/y when placing them |

These are endpoint facts. A resident speaking means the phone microphone is
`capturing`, while the doorbell output is `speech`. A visitor answering means
the camera microphone is `capturing`, while the phone or operator output is
`speech`. Author both views of the same event together. The renderer does not
infer network delivery from a person speaking.

Each `audio` object replaces the previous whole audio object. Omit it to carry
it forward, use `null` or `{}` to clear it, and include the fields that must stay.
A wholly invalid audio patch warns and is ignored. Camera Screen and Security
support `enterOnce.audio`; Phone supports `enterOnce.audio` without making its
notification operations transient. Home retains its own device/subject folding
rules and has no special `enterOnce` wrapper.

## Fields

| Field | Values and purpose |
| --- | --- |
| `connection` | `idle`, `connecting`, `connected`, `interrupted`, `ended` |
| `microphone` | `idle`, `listening`, `capturing`, `muted`, `unavailable`; listening is readiness, capturing is reported input |
| `output` | `silent`, `speech`, `recorded`, `chime`, `siren`; speaker activity at this endpoint |
| `playback` | `playing`, `queued`, `suppressed`, `failed`, `stopped` |
| `detection` | `none`, `sound`, `smoke-alarm`, `co-alarm`, `glass-break`; authored classification, not a physical smoke/CO reading |
| `text` | Spoken words or a short description of the sound |
| `source` | Who supplied the words, such as “Morgan · operator” or “Saved greeting” |
| `reason` | Explanation for interruption, suppression, failure or uncertainty |

Omitted connection/microphone/detection default to idle/idle/none. Output defaults
to silent. An explicitly authored non-silent output defaults to playing; set
`playback` explicitly for queued or failed requests. Connecting does not start
sound. A connected call does not imply anybody is speaking. A local chime or
recorded message can play independently of a live connection.

Speech uses smooth sound arcs; recorded messages use dashed arcs; chimes use
musical notes; sirens use angular pulses. Capturing uses inward marks. Text
labels distinguish states without relying on color. Queued, suppressed, failed and stopped output never shows active emission. Recording, scene action,
assessment and dispatch remain independently authored. Static/reduced-motion
and print retain the state without animated pulses.

## A complete conversation beat

The fragment below is a per-step patch, not a complete spec. The phone microphone
captures the resident's words, and the camera speaker actually plays them:

```
"panels": {
  "phone": {"audio": {
    "connection":"connected", "microphone":"capturing",
    "text":"Please leave the package by the door.", "source":"You"
  }},
  "camera": {"audio": {
    "connection":"connected", "microphone":"listening", "output":"speech",
    "text":"Please leave the package by the door.", "source":"Resident"
  }},
  "home": {"cam": {"audio": {
    "connection":"connected", "microphone":"listening", "output":"speech",
    "text":"Please leave the package by the door.", "source":"Resident"
  }}}
}
```

For full-duplex conversation, both microphone capturing and speaker speech can
be active. For alternating talk/listen, show one direction at each stop. Which
behavior a real product supports must come from its source documentation.

## Deterrence and alternatives

- Set `spotlight:"on"` or `"flash"` on a Home camera's device patch, a Screen
  patch, or a Security patch (the latter illuminates its monitor view). `off`
  clears it. Spotlight does not trigger a siren or change the recording mode.
- Queue a siren with `output:"siren", playback:"queued"`. Only change to playing
  after an authored confirmation. `failed` plus `reason` keeps the source silent.
- Quiet hours: show `output:"chime", playback:"suppressed"` on the indoor speaker.
  Keep its notification and video states as independently reported.
- Microphone denied: `microphone:"unavailable"` on the phone. Incoming speech may
  still play. Do not turn off camera video just because outbound audio failed.
- Downlink lost: show the sender capturing but the camera output failed, and
  use a broken edge only if the source establishes non-delivery.
- Listening for an alarm: show the alarm sounder emitting, then camera capture,
  then classification, then notification. “Smoke alarm heard” does not mean
  the camera measured smoke or an agent confirmed a fire.
- A visitor leaving, a verified incident, an activated spotlight and a dispatch
  request are separate authored steps. Never infer them from an animation ending.

A generic Home device of kind `sensor` with `icon:"speaker"` gives a speaker,
chime or alarm sounder a persistent identity. Its location and ordinary health
state remain independent of sound output. Configure audio in the Home's shared
initial inspector or the selected step's device/subject controls; the other
panels expose a typed **audio** field in their step inspectors.

## Evidence and validation

The seed is illustrative, not any provider's exact escalation policy. These
real capabilities motivated it: [Nest Talk and Listen](https://support.google.com/googlehome/answer/9219455),
[Ring Quick Replies](https://ring.com/support/articles/ztd70/Setting-),
[Ring Virtual Security Guard](https://ring.com/support/plans/virtual-security-guard),
[SimpliSafe Active Guard](https://support.simplisafe.com/articles/outdoor-cameras/what-is-simplisafe-active-guard-outdoor-protection),
and [Arlo alarm-sound detection](https://www.arlo.com/en_gb/support/faq/arlo-secure-features/what-is-the-arlo-smart-alarm-detection-feature).
Check the actual product, hardware and service documentation when authoring a
real design; do not copy the seed's service routes or decisions as evidence.

```
node tools/validate.js src/starters/audio-story.json
python3 tools/inject.py src/starters/audio-story.json template/flowview.html /tmp/audio-story.html
node --test tests/audio.test.js tests/audio-story.test.js
```
