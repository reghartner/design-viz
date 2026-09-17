# A visitor at the door — engineering and resident perspectives

Version 1. Fictional teaching design, authored for the Flowview cookbook.
Names, behavior, and transports below are invented for this example; none are
company catalog entries, observed telemetry, production guarantees, or real APIs.
There are no measured durations, physical dimensions, payload schemas, or code
references. Motion and layout are illustrative. The camera scene illustrates the
recorded porch approach; it is not a live feed of the later indoor scene.

The engineering question is how a doorbell event becomes a durable cloud clip,
a delivered phone notification, and an authorized playback. The business question
is what the resident and visitor experience at each stage, especially when the
clip cannot be stored or the notification is delayed. Both perspectives describe
the complete same sequence and alternate outcomes.

## Components and state

Camera, Event Gateway, Policy, Registry, Event Bus, Clip Worker,
Clip Store, Notifications, Push Provider, Phone, and Playback API
are separate components. The resident is initially in the living room. The
visitor is initially absent. The front door is closed. Camera is on without
recording or streaming. There are initially no notifications or pending delivery
items for this event. All checkpoints are initially incomplete.

This scenario takes place after dark; the recorded porch scene uses night lighting.
The home drawing separates the outdoor porch from the entry and living room.
The cloud icon summarizes the event/clip delivery services, rather than a physical
sensor. The phone marker locates the resident's phone. Subject coordinates and
sensor cones carry no physical measurements.

## Complete reference sequence

1. **Ready.** Camera is active; the porch is empty and the resident is inside.
2. **Recording armed.** A configured local schedule starts a porch recording
   before the visitor arrives. This recording has no livestream.
3. **Approach.** A visitor approaches from outside; the porch camera records it.
4. **Ring.** The visitor reaches the door and presses the doorbell. Camera sends
   the event to Event Gateway over MQTT. The visitor waits outside.
5. **Policy request.** Event Gateway asks Policy over HTTPS whether the
   device may publish this event.
6. **Device check.** Policy queries Registry using SQL and finds
   an enrolled, permitted device. Authorization succeeds.
7. **Publish work.** Policy publishes a clip-processing job to Event Bus
   using AMQP. The job is available to a worker.
8. **Consume work.** Event Bus delivers that job to Clip Worker using AMQP.
9. **Local clip ready.** The scheduled recording ends. Camera retains the local
   clip and uploads its bytes to Clip Worker over HTTPS. Camera stays powered on.
   The screen now represents the saved porch clip, not current recording or live
   video. The retained local clip survives either later failure outcome.
10. **Cloud persistence.** Clip Worker writes the clip to Clip Store over HTTPS;
    the write completes successfully.
11. **Delivery scheduled.** Clip Worker asks Notifications over HTTPS to
    notify the resident. Notifications places this delivery in its outbox.
12. **Push requested.** Notifications removes that item from the outbox
    and submits it to Push Provider over HTTPS.
13. **Resident notified.** Push Provider delivers over HTTPS to Phone.
    The phone shows an app named “Doorbell,” title “Visitor at the front door,”
    and message “Your porch clip is ready.” Delivery is complete and the outbox
    is empty. The resident starts walking from the living room toward the entry.
14. **Open clip.** The resident opens that notification; Phone requests
    the clip from Playback API over HTTPS.
15. **Fetch clip.** Playback API checks that this resident can access the clip,
    then fetches it from Clip Store over HTTPS. That authorization succeeds.
16. **View clip.** Playback API returns the clip over HTTPS to Phone.
    The resident can view the saved approach. The screen continues to illustrate
    that recorded clip; no second notification and no livestream are created.
17. **Welcome.** The resident opens the front door. The visitor moves through
    the threshold into the entry; the resident is beside the doorway.
18. **Inside.** The visitor joins the resident inside and the door closes. The
    clip remains locally retained, cloud stored, delivered, and playable.

## Alternate: cloud storage rejected

Steps 1–9 are unchanged. At step 10 the Clip Store rejects the attempted write
before persisting any bytes and returns HTTP 503 to Clip Worker over HTTPS.
This is a received application error, not lost communication. No cloud clip
exists for this event. Clip Worker records the failure and stops this workflow;
it does not schedule Notifications. Camera retains the local clip, the
resident receives no notification, and the visitor remains outside with the
door closed. The path ends at step 11; no retry or invitation is included.

## Alternate: push delayed

Steps 1–12 are unchanged. At step 13 Push Provider returns HTTP 429 to
Notifications over HTTPS before attempting delivery to Phone.
No phone notification has been delivered. At step 14 Notifications puts
the delivery back in its outbox, held for later retry. There is one pending item
for this story; no total queue depth or retry time is supplied. The clip is
retained locally and stored in the cloud. The visitor continues waiting outside,
the resident remains in the living room, and the door stays closed. The path ends
with delivery pending; it does not depict a retry or later arrival.

## Presentation intent

The engineering perspective keeps every component, communication, gate, and
failure visible. The resident perspective leads with the place, people, camera,
phone, and delivery outcome, while retaining the complete flow below it. Both
use the same steps, path IDs, and state. Switching perspective preserves the
selected step and outcome. Both perspectives must show all supported endings,
including a retained local clip with no cloud delivery. Animation illustrates
the stated physical movements and handoffs; it does not supply timing evidence.
