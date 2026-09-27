# Worked example: garage door left open

A small, complete example of the worksheet and the spec it produces. The
domain, catalog, repository and SHA are fictional. Copy the method, not the
facts.

## The source (fictional `garage-door-hld.md`, v3, local file)

> 1. The tilt sensor on the garage door reports open or closed to the home hub
>    over Zigbee. It reports battery level with each report.
> 2. The hub publishes door state to the door service over MQTT
>    (`door/state`).
> 3. If the door stays open for 15 minutes, the door service asks the push
>    service to send a reminder to the resident app.
> 4. The resident can tap Close. The app calls `POST /door/close`; the door
>    service replies 202 and publishes a command on `door/cmd`. The hub drives
>    the opener relay and publishes `closed` when the opener's limit switch
>    confirms it.
> 5. The hub sends a heartbeat every 10 minutes. After three missed
>    heartbeats the door service marks the hub offline. The app shows the last
>    known door state, marked stale.

## Phase 2: questions sent, answers received

One batch of seven, in plain language, each with a proposed default.
Question 1 is the technical level because the request did not state it. The
batch proposes engineering, so it may include one technical question (5,
catalog and code). Had the request pointed to a story or mixed audience, the
batch would leave question 5 out, the author would decide catalog and code
handling from the evidence, and list those choices under "Decisions I made".
Questions 6 and 7 are gaps in the story itself and are asked at any level.

| # | Question (with proposed default) | Operator answer |
|---|---|---|
| 1 | How technical should the diagram be: story (people, devices, app screens; the backend as a few plain boxes), mixed (plus the main services by name), or engineering (every service hop, API and code reference)? (default: engineering, since the readers trace tickets into the backend) | Engineering |
| 2 | Who is it for, and what one sentence should they leave with? (default: support engineers; "the reminder fires after 15 min") | Support engineers who handle "my door was open all night" tickets. Takeaway: "The app can show Open for hours while the real door state is unknown." |
| 3 | Which outcomes, and over what time? (default: reminder then remote close, and hub offline overnight; Friday evening through the next morning, illustrative clocks) | Both. Fri Oct 3, from 6:04 PM to the next morning; illustrative |
| 4 | Starting situation? (default: door closed, car inside, sensor battery 23%, hub online, phone on its home screen) | OK; the last sensor report before the story was at 4:05 PM (closed, 23%) |
| 5 | Which catalog snapshot and code should nodes link to? (default: none supplied, so every node stays unbound and no step carries code) | `catalog.json`: `component:default/door-service` only. Push service is a vendor. Code: `https://github.com/example-garage/door-service` at `2222222222222222222222222222222222222222`; the reminder is in `src/reminder.ts` between `// flow:reminder:start` and `// flow:reminder:end` (lines 14 to 37) |
| 6 | The source does not say when the hub lost its link. (default: 9:10 PM, illustrative) | Say 9:10 PM, illustrative. |
| 7 | The source does not say how the app learns door state. (default: only from its own requests; a reminder push carries text, not card data) | The app reads the door record (`GET /door`: door state, sensor battery, hub status, each with its report time) when it comes to the foreground and every 30 s while on screen. In the background it keeps its last read. |

Not asked, because the source and request settle them or they claim little:
panels and delivery. They are in the ledger under "Decisions I made".

## Ledger excerpt

```markdown
## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | technical level? | engineering | 09-26-2026 | whole page (captions name protocols, APIs, code) | active |
| A2 | audience and takeaway? | support engineers; "the app can show Open for hours while the real door state is unknown" | 09-26-2026 | worksheet A; blocks[0].diagram.steps[5].text | active |
| A3 | outcomes and time? | both paths; Fri Oct 3, 6:04 PM to next morning, illustrative | 09-26-2026 | blocks[0].diagram.paths | active |
| A4 | starting situation? | door closed, 23%, last report 4:05 PM | 09-26-2026 | blocks[0].diagram.panels[1].initial | active |
| A5 | catalog and code? | door-service only; push service is a vendor; reminder code in src/reminder.ts | 09-26-2026 | blocks[0].diagram.nodes.cloud | active |
| A6 | when was the hub link lost? | 9:10 PM, illustrative | 09-26-2026 | blocks[0].diagram.steps[4].text | active |
| A7 | how does the app learn door state? | reads GET /door in the foreground and every 30 s | 09-26-2026 | blocks[0].diagram.edges[4] | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | panels: home map, resident phone app, sensor battery; no service `state` panel, no `phone` panel | the app card already shows the service's view; the device app shows notifications | blocks[0].diagram.panels |
| D2 | standalone page, desktop | the request names no other destination | page |
| D3 | `notify` and `app` left unbound | not in the supplied catalog (A5) | blocks[0].diagram.nodes.notify, .app |
| D4 | sensor battery drifts 23 to 22 to 21 overnight, marked illustrative | the source gives no drain rate; the drift stays above the low threshold (20) | blocks[0].diagram.steps[4], steps[5] |
| D5 | no edge at `b-offline` | missed heartbeats are an absence, not a message | blocks[0].diagram.steps[4] |
| D6 | phone app declares one source, `doorsvc` (Door service, `node: "cloud"`, `GET /door`); the door, battery and link cards all name it; the source map stays visible (`showSources` omitted) | A7: the app learns every card from the door record; the declared route lets the walk prove each card change rides a delivered `app->cloud`/`cloud->app` step, and the visible map tells support engineers the app shows the service's record, not the door | blocks[0].diagram.panels[1].sources, .fields |
```

## Storyboard worksheet

### A. Story

**Level:** engineering (A1): captions name protocols, APIs and the code that runs.
**Audience:** support engineers; they know the app well and follow a ticket into the backend.
**Takeaway:** the app can show "Open" for hours while the real door state is unknown.
**Story (60-second narration):** At 6:05 PM the car backs out and the garage
door stays open. The tilt sensor tells the hub, the hub tells the door service,
and a 15-minute timer starts. The phone is in a pocket: the app has not read
anything since the afternoon. At 6:20 PM the phone shows a reminder. In the
good ending the resident taps it at 6:22: the app reads the door (Open), the
resident taps Close, the service accepts it and commands the hub. At 6:23 the
opener's limit switch confirms closed, the hub publishes it, and the app's
next refresh shows Closed. In the bad ending nobody taps the reminder. The hub
loses its internet link at 9:10 PM; at 9:40 the service marks it offline. At
7:10 the next morning the resident opens the app: it reads the service and
shows Open, stale, last report 6:05 PM, 13 hours old. Nobody knows if the door
is still open.

**What would I show?**
1. Most important moment: 7:10 AM, the app card "Open · stale · last report
   6:05 PM · 13 h ago" next to a hub marked cloud-off. The phone app panel
   shows it best.
2. Expected but not yet shown: the car leaving (the reason the door is open),
   and the hub going offline on the map. Added: car subject moves out at
   `open`; hub icon `cloud-off` at `b-offline`.
3. Must not believe: that the door closed overnight, that the sensor died, or
   that the app knew the door was open before anyone opened it. The door stays
   `open` on the map; the sensor holds `ok`; the app card changes only on a
   step that lights the app's read.

### B. Panel plan

| Panel id | Type | Physical or reported | Question it answers | Best moment | Starting state | Must never show |
|---|---|---|---|---|---|---|
| home | homemap | physical | Where are the car and the door, and is the hub connected? | `open` (car leaves, door open) | door closed, car inside, hub idle (A4) | the door closing on the offline path |
| phoneapp | deviceapp | reported | What does the resident see, and how old is it? | `b-morning` (stale Open, 13 h) | home screen, 6:04 PM Fri Oct 3, door Closed and battery 23% from the 4:05 PM report, hub Online (A4) | a card change on a step that delivers nothing to the app; "just now" on old data |
| batt | battery | physical | Is the sensor's battery a factor? | `b-morning` (slow drift, still above low) | 23%, cells, draining (A4) | a sudden drop without a cause |

Rejected: a `state` panel for the door service (the app card already tells it);
a `phone` panel (the device app already shows notifications). Both in D1.

Source map: one source, `doorsvc` (Door service, node `cloud`, `GET /door`),
for all three cards (A7, D6). It stays visible: the reader's takeaway is that
the card shows the service's record, and the map says so on the phone.

Customer-visible items: the reminder notification (phoneapp `notify`); the
stale door card (phoneapp `door`, status `stale`); the hub offline state
(phoneapp `link` card).

### C. Paths

| Path id | Label | Shared prefix | First different step | Ending | Remaining unknowns |
|---|---|---|---|---|---|
| closed | Closed remotely | open, remind | a-close | door closed; the app's refresh shows Closed | none |
| offline | Hub offline overnight | open, remind | b-offline | app reads stale Open at 7:10 AM | real door position; why the link dropped |

### D. Time table

Anchors: 23% at start and the 4:05 PM report (A4); link lost at 9:10 PM
(A6); reminder 15 min after open, offline after 3 missed 10-min heartbeats
(source). No battery rate is given, so drift is illustrative (D4).

Report schedule: the tilt sensor reports on change only (4:05 PM closed, 6:05
PM open; no later sensor report on path offline). The hub heartbeats every 10
min; the last one arrives 9:10 PM, and 9:20, 9:30 and 9:40 are missed. The app
receives nothing on its own: it reads `GET /door` in the foreground (A7). A
schedule is an opportunity, not evidence: the app column changes only at a
step that lights `app->cloud` and `cloud->app`.

| Path | Step | Clock | Date | Elapsed | Anchor, source or illus | Physical battery | Last report the app holds, and freshness | Day or night |
|---|---|---|---|---|---|---|---|---|
| both | (initial) | 6:04 PM | Fri, Oct 3 | | 23% and 4:05 PM report anchor; clock illus | 23 | 4:05 PM (Closed, 23%): "Last report 4:05 PM" | evening |
| both | open | 6:05 PM | | 1 min | illus | 23 (holds: 1 min) | holds 4:05 PM: app in background, no read (the 6:05 PM report reaches the service only) | evening |
| both | remind | 6:20 PM | | 15 min | 15 min source; clock illus | 23 (holds: 15 min) | holds 4:05 PM: the push carries reminder text, not the record | evening |
| closed | a-close | 6:22 PM | | 2 min | illus | 23 (holds) | read at 6:22: 6:05 PM report (Open, 23%); door then "Close requested 6:22 PM"; battery "Last report 6:05 PM" | evening |
| closed | a-closed | 6:23 PM | | 1 min | illus | 23 (holds) | refresh at 6:23: door Closed, "Last report 6:23 PM" (hub publish, carries no battery); battery keeps "Last report 6:05 PM" | evening |
| offline | b-offline | 9:40 PM | | 3 h 20 min | 9:10 PM anchor; 30 min rule source | 22 illus drift | holds 4:05 PM: app in background | night |
| offline | b-morning | 7:10 AM | Sat, Oct 4 | 9 h 30 min | illus | 21 illus drift | read at 7:10: 6:05 PM report (Open, 23%), stale: "Last report 6:05 PM · 13 h ago"; hub Offline, "Last heartbeat 9:10 PM" | morning |

Freshness text names the report time, so it stays true while the clock moves;
only the 7:10 AM read adds an age. No panel here draws day or night; the
captions name the time.

### E. Step x panel matrix

```
### open   paths: closed, offline   clock: 6:05 PM
Beat: The car leaves, the door stays open; the sensor reports open and the hub publishes it.
Hops claimed: tilt sensor -> hub (open, 23%); hub -> door service (PUBLISH door/state)
Edges: sensor->hub (report), hub->cloud (PUBLISH door/state)
Missing hops check: none (no ack in the source; nothing goes to the app)
Report?: no report delivered to the app (the 6:05 PM report stops at the door service)
Focus: home
home: patch: gdoor open; car to driveway (225,165); signal tilt->hubdev
phoneapp: patch: clock 6:05 PM (cards hold: app in background, no read)
batt: holds: one minute passed, no drift
State cleared: door closed -> open (map); car inside -> driveway; app door card still Closed from 4:05 PM: still true as the app's last read
Icons: none: no card or marker state changed (door has no icon states)
Tones: none
Code/binding: codeRefs door-service.reminder on this step (the timer starts here; `hub->cloud` touches `cloud`, the owning node); no code located for state ingest
Evidence: L1, L2, L6; clock illus

### remind   paths: closed, offline   clock: 6:20 PM
Beat: 15 minutes open; the door service asks the push service to remind the resident.
Hops claimed: door service -> push service (send reminder); push service -> resident app (push)
Edges: cloud->notify (send reminder), notify->app (push)
Missing hops check: none
Report?: no report (the push carries reminder text, not the door record)
Focus: phoneapp
home: holds: nothing physical changes; door still open, car still out
phoneapp: patch: clock 6:20 PM; notify "Garage door open"
batt: holds: 15 minutes, below visible drift
State cleared: no state change (cards hold the 4:05 PM read)
Icons: none: no state change
Tones: none
Code/binding: codeRefs door-service.reminder on this step (the reminder is sent here; `cloud->notify` touches `cloud`)
Evidence: L3, L9

### a-close   paths: closed   clock: 6:22 PM
Beat: The resident taps the reminder; the app reads the door (Open), the resident taps Close, the service accepts it and commands the hub.
Hops claimed: app -> door service (GET /door, then POST /door/close); door service -> app (door record, then 202); door service -> hub (PUBLISH door/cmd)
Edges: app->cloud (GET /door · POST /door/close), cloud->app (door record · 202, ret), cloud->hub (PUBLISH door/cmd)
Missing hops check: added the response edge (source item 4 says the service replies 202; A7 gives the read); one edge per pair, both messages named in the label and caption
Report?: report at 6:22 PM delivered by the read: door (6:05 PM report, Open) and battery (23%, 6:05 PM); door then shows Closing from the app's own request
Focus: phoneapp
home: holds: the relay has not moved the door yet
phoneapp: patch: clock 6:22 PM; phoneScreen app; clear notifications (reminder tapped); door Closing, status loading, detail "Close requested 6:22 PM"; battery detail "Last report 6:05 PM"
batt: holds: minutes only
State cleared: phone home -> app; reminder notification cleared; door card Closed -> Closing; battery card 23 still true, report time 4:05 -> 6:05 PM; link Online still true
Icons: none
Tones: none
Code/binding: cloud binding api operation closeDoor (POST /door/close)
Evidence: L4, A7

### a-closed   paths: closed   clock: 6:23 PM
Beat: The hub drives the opener; the limit switch confirms closed; the hub publishes closed and the app's next refresh shows it.
Hops claimed: hub -> door service (PUBLISH door/state closed); app -> door service (GET /door, 30 s refresh); door service -> app (door record)
Edges: hub->cloud (PUBLISH door/state), app->cloud (GET /door), cloud->app (door record, ret)
Missing hops check: the source ties `closed` to the opener's limit switch (item 4), so the hub publishes without a new tilt-sensor report; no sensor->hub hop, and no battery update
Report?: report at 6:23 PM delivered by the refresh: door Closed update (the hub's publish carries no battery, so battery keeps its 6:05 PM report)
Focus: home
home: patch: gdoor closed; hubdev tx
phoneapp: patch: clock 6:23 PM; door Closed, status ready, detail "Last report 6:23 PM"
batt: holds: minutes only
State cleared: door open -> closed (map) and Closing -> Closed (app); car still in the driveway: still true; battery card 23, 6:05 PM: still true (no new sensor report)
Icons: none
Tones: none
Code/binding: none located
Evidence: L4, A7

### b-offline   paths: offline   clock: 9:40 PM
Beat: The hub lost its link at 9:10 PM; after three missed heartbeats the service marks it offline.
Hops claimed: none (missed heartbeats are an absence, not a message)
Edges: none (missed heartbeats are an absence, not a failed send we can see)
Missing hops check: none
Report?: no report (the app is in the background and reads nothing)
Focus: home
home: patch: hubdev icon cloud-off (door stays open: holds)
phoneapp: patch: clock 9:40 PM (cards hold the 4:05 PM read: the app does not know yet)
batt: patch: charge 22, note "illustrative drift"
State cleared: hub online -> offline (map, tone); app link card Online: still the app's last read, not yet refreshed; door card Closed: still the app's last read
Icons: hubdev -> cloud-off
Tones: hub warn (source: marked offline)
Code/binding: none located
Evidence: L5, A6 (9:10 PM), D4 illus drift

### b-morning   paths: offline   clock: 7:10 AM Sat
Beat: The resident opens the app next morning; it reads the service: Open, stale, 13 hours old.
Hops claimed: app -> door service (GET /door); door service -> app (door record)
Edges: app->cloud (GET /door), cloud->app (door record, ret)
Missing hops check: none (the service answers from its record; the hub is not asked)
Report?: report at 7:10 AM delivered by the read: door Open (6:05 PM report), battery 23% (6:05 PM), hub Offline (last heartbeat 9:10 PM)
Focus: phoneapp
home: holds: no evidence the door or the car moved; hub still offline
phoneapp: patch: clock 7:10 AM; date Sat, Oct 4; phoneScreen app; door Open, status stale, detail "Last report 6:05 PM · 13 h ago"; battery status stale, same detail; link Offline, status error, icon wifi-off, detail "Last heartbeat 9:10 PM"
batt: patch: charge 21 (illus drift)
State cleared: phone home -> app; door card Closed -> Open (stale); battery card 23 still true as reported, now stale; link Online -> Offline; reminder notification still on the stack (never tapped)
Icons: link card -> wifi-off; cloud-off persists (no reconnect in the source)
Tones: none new (hub warn carries)
Code/binding: none
Evidence: L5, A7, D4 illus
```

### F. Coverage grid

| Path: closed | open | remind | a-close | a-closed |
|---|---|---|---|---|
| home | P | H | H | P |
| phoneapp | P | P | P | P |
| batt | H | H | H | H |

| Path: offline | open | remind | b-offline | b-morning |
|---|---|---|---|---|
| home | P | H | P | H |
| phoneapp | P | P | P | P |
| batt | H | H | P | P |

Boring panel check: `batt` holds on the whole closed path because only 18
minutes pass. It earns its place on the offline path (drift across the night,
and it rules out "the sensor died"). Kept.

### G. Icon state plan

| Panel.element | Default icon | State | Set at (icon) | Clears at | Restore |
|---|---|---|---|---|---|
| home.hubdev | router | cloud unreachable | b-offline (`cloud-off`) | not restored on path offline: no reconnect in the source | none |
| phoneapp.link | wifi | hub offline | b-morning (`wifi-off`), the first read after the service marked it | not restored on path offline | none |
| phoneapp.battery | battery | low battery | not reached (app 23, sensor 21; low is 20) | | |

Precedence (a card shows one icon): if `phoneapp.battery` ever showed
`battery-low` and charging began while still below the re-arm level, it would
keep `battery-low`; charging would show in the card's `status`/`detail` and in
the `batt` panel's `trend: "charging"`. `icon: null` returns only to the
declared default (`battery`); returning to an earlier non-default icon needs
that icon patched by name. Here no battery icon changes, so no precedence
applies.

### H. Bindings and code

| Node | Catalog entityRef | API + operation | codeRefs | Steps | Gap |
|---|---|---|---|---|---|
| cloud | component:default/door-service | api:default/door-service, closeDoor POST /door/close | door-service.reminder: src/reminder.ts 14-37 | open (starts the timer), remind (sends the reminder) | `GET /door` comes from A7; the binding names the close call this story turns on |
| notify | | | | | not a catalog service (vendor) |
| hub, sensor | | | | | device, not a catalog service |
| app | | | | | not in supplied catalog: recorded as gap row (D3) |
| phoneapp source `doorsvc` (`node: "cloud"`) | through `cloud`: component:default/door-service | `GET /door` (A7) | | a-close, a-closed, b-morning | door, battery and link cards read the door record; each of these steps lights `app->cloud` and `cloud->app` |

### I. Checkable expectations

1. On path offline the map door never closes, and the app's door card changes
   only at `b-morning`, to Open (stale).
2. The last step of path offline reads 7:10 AM, Sat, Oct 4.
3. `a-close` lights the request and its response.
4. Every app card change sits on a step that lights `app->cloud` and
   `cloud->app`, the delivered edges that touch `cloud`, the node of the
   cards' declared source `doorsvc`.
5. No battery icon changes: the charge never reaches the low threshold (20).

## The spec this worksheet produced

This is the stamped final spec. The author wrote everything above
`page.flowview`, saved it as `garage.spec.json`, and ran
`node tools/compatibility.js --stamp garage.spec.json > garage.stamped.spec.json`
(input and output are different files). The stamp added only `page.flowview`
(it also reformats the file; the content is otherwise unchanged). The page was
built from `garage.stamped.spec.json` with zero errors and zero warnings, and
the walk below reads the same file. Note how each `holds:` line has no JSON,
and each `patch:` line is one sparse patch.

```json
{
  "page": {
    "title": "Garage door left open",
    "contract": "1",
    "protocols": {
      "zigbee": {"label": "Zigbee", "color": "#7BD88F"}
    },
    "blocks": [
      {
        "id": "garage-reminder",
        "heading": "Garage door left open: reminder and remote close",
        "text": ["Source: garage-door-hld.md (local file, v3), and operator answers. Clock times and battery drift are illustrative."],
        "diagram": {
          "view": "step",
          "primaryPanel": "home",
          "nodes": {
            "sensor": {"title": "Tilt sensor", "sub": "on garage door", "icon": "sensor", "tint": "dev"},
            "hub": {"title": "Home hub", "sub": "opener relay", "icon": "router", "tint": "dev"},
            "cloud": {
              "title": "Door service", "sub": "reminder timer", "icon": "server", "tint": "cmd",
              "binding": {
                "entityRef": "component:default/door-service",
                "label": "Door service",
                "owner": "group:default/garage-team",
                "catalogUrl": "https://backstage.example.test/catalog/default/component/door-service",
                "api": {
                  "entityRef": "api:default/door-service",
                  "title": "Door service API",
                  "operationId": "closeDoor",
                  "method": "POST",
                  "path": "/door/close"
                }
              },
              "codeRefs": [
                {
                  "id": "door-service.reminder",
                  "label": "reminder timer",
                  "repository": "https://github.com/example-garage/door-service",
                  "path": "src/reminder.ts",
                  "revision": "2222222222222222222222222222222222222222",
                  "anchor": {"start": "// flow:reminder:start", "end": "// flow:reminder:end"},
                  "startLine": 14,
                  "endLine": 37,
                  "purpose": "Starts the 15-minute open-door timer and sends the reminder"
                }
              ]
            },
            "notify": {"title": "Push service", "sub": "third party", "icon": "cloud", "tint": "cmd"},
            "app": {"title": "Resident app", "sub": "phone", "icon": "phone", "tint": "dev"}
          },
          "rows": [["sensor", "hub", "cloud"], ["app", "notify"]],
          "edges": [
            {"from": "sensor", "to": "hub", "kind": "zigbee", "label": "open / closed"},
            {"from": "hub", "to": "cloud", "kind": "mqtt", "label": "PUBLISH door/state"},
            {"from": "cloud", "to": "notify", "kind": "int", "label": "send reminder"},
            {"from": "notify", "to": "app", "kind": "https", "label": "push"},
            {"from": "app", "to": "cloud", "kind": "https", "label": "GET /door · POST /door/close"},
            {"from": "cloud", "to": "app", "kind": "https", "ret": true, "label": "door record · 202"},
            {"from": "cloud", "to": "hub", "kind": "mqtt", "label": "PUBLISH door/cmd"}
          ],
          "panels": [
            {
              "id": "home", "type": "homemap", "title": "Home",
              "outline": {"x": 40, "y": 10, "w": 240, "h": 110},
              "rooms": [
                {"label": "Garage", "x": 170, "y": 10, "w": 110, "h": 110},
                {"label": "Driveway", "kind": "outdoor", "x": 170, "y": 120, "w": 110, "h": 60}
              ],
              "devices": [
                {"id": "gdoor", "kind": "entry", "label": "Garage door", "display": "door", "x": 200, "y": 120, "facing": 0, "doorWidth": 48, "doorSwing": -90},
                {"id": "tilt", "kind": "sensor", "label": "Tilt sensor", "icon": "sensor", "x": 262, "y": 110},
                {"id": "hubdev", "kind": "hub", "label": "Home hub", "x": 100, "y": 60}
              ],
              "subjects": [{"id": "car", "label": "Car", "icon": "car", "x": 225, "y": 60}],
              "initial": {"gdoor": "closed", "tilt": "ok", "hubdev": "idle"}
            },
            {
              "id": "phoneapp", "type": "deviceapp", "title": "Resident phone",
              "device": "Garage door", "appName": "Garage",
              "sources": [
                {"id": "doorsvc", "label": "Door service", "node": "cloud", "endpoint": "GET /door", "detail": "Door record: door state, sensor battery and hub status, each with its report time"}
              ],
              "fields": [
                {"id": "door", "label": "Door", "icon": "door", "source": "doorsvc"},
                {"id": "battery", "label": "Sensor battery", "kind": "battery", "source": "doorsvc"},
                {"id": "link", "label": "Hub connection", "icon": "wifi", "source": "doorsvc"}
              ],
              "initial": {
                "phoneScreen": "home", "clock": "6:04 PM", "date": "Fri, Oct 3",
                "door": {"value": "Closed", "status": "ready", "detail": "Last report 4:05 PM"},
                "battery": {"value": 23, "status": "ready", "detail": "Last report 4:05 PM"},
                "link": {"value": "Online", "status": "ready"}
              }
            },
            {
              "id": "batt", "type": "battery", "title": "Tilt sensor battery", "low": 20, "crit": 10,
              "initial": {"charge": 23, "source": "cells", "trend": "draining"}
            }
          ],
          "steps": [
            {
              "id": "open", "edges": ["sensor->hub", "hub->cloud"],
              "text": "6:05 PM. The car leaves and the door stays open. The tilt sensor reports **open**; the hub publishes it to the door service, which starts a 15-minute timer. The app is in the background and has read nothing since the afternoon.",
              "codeRefs": [
                {
                  "id": "door-service.reminder",
                  "label": "reminder timer",
                  "repository": "https://github.com/example-garage/door-service",
                  "path": "src/reminder.ts",
                  "revision": "2222222222222222222222222222222222222222",
                  "anchor": {"start": "// flow:reminder:start", "end": "// flow:reminder:end"},
                  "startLine": 14,
                  "endLine": 37,
                  "purpose": "Starts the 15-minute open-door timer and sends the reminder"
                }
              ],
              "panels": {
                "home": {"gdoor": "open", "car": {"x": 225, "y": 165}, "signals": [{"from": "tilt", "to": "hubdev"}]},
                "phoneapp": {"clock": "6:05 PM"}
              }
            },
            {
              "id": "remind", "edges": ["cloud->notify", "notify->app"],
              "text": "6:20 PM. The door has been open for 15 minutes. The door service asks the push service to send a reminder to the resident's phone.",
              "codeRefs": [
                {
                  "id": "door-service.reminder",
                  "label": "reminder timer",
                  "repository": "https://github.com/example-garage/door-service",
                  "path": "src/reminder.ts",
                  "revision": "2222222222222222222222222222222222222222",
                  "anchor": {"start": "// flow:reminder:start", "end": "// flow:reminder:end"},
                  "startLine": 14,
                  "endLine": 37,
                  "purpose": "Starts the 15-minute open-door timer and sends the reminder"
                }
              ],
              "panels": {
                "phoneapp": {"clock": "6:20 PM", "notify": {"app": "Garage", "title": "Garage door open", "text": "Open for 15 minutes. Tap to close."}}
              }
            },
            {
              "id": "a-close", "edges": ["app->cloud", "cloud->app", "cloud->hub"],
              "text": "6:22 PM. The resident taps the reminder. The app reads the door record (**Open**, last report 6:05 PM), the resident taps **Close**, and the app posts the request. The door service replies 202 and publishes a close command to the hub.",
              "panels": {
                "phoneapp": {"clock": "6:22 PM", "phoneScreen": "app", "clear": true, "door": {"value": "Closing", "status": "loading", "detail": "Close requested 6:22 PM"}, "battery": {"detail": "Last report 6:05 PM"}}
              }
            },
            {
              "id": "a-closed", "edges": ["hub->cloud", "app->cloud", "cloud->app"],
              "text": "6:23 PM. The hub drives the opener relay. The opener's limit switch confirms closed and the hub publishes **closed**. The app's next refresh reads it.",
              "panels": {
                "home": {"gdoor": "closed", "hubdev": "tx"},
                "phoneapp": {"clock": "6:23 PM", "door": {"value": "Closed", "status": "ready", "detail": "Last report 6:23 PM"}}
              }
            },
            {
              "id": "b-offline", "nodes": ["cloud"], "tone": {"hub": "warn"},
              "text": "9:40 PM. The hub lost its internet link at 9:10 PM. After three missed heartbeats the door service marks the hub offline. The door is still open. The app, in the background, does not know.",
              "panels": {
                "home": {"hubdev": {"icon": "cloud-off"}},
                "phoneapp": {"clock": "9:40 PM"},
                "batt": {"charge": 22, "note": "illustrative drift"}
              }
            },
            {
              "id": "b-morning", "edges": ["app->cloud", "cloud->app"],
              "text": "7:10 AM next day. The resident opens the app, which reads the door record: **Open**, stale, from the 6:05 PM report. The real door position is unknown to the service.",
              "panels": {
                "phoneapp": {"clock": "7:10 AM", "date": "Sat, Oct 4", "phoneScreen": "app", "door": {"value": "Open", "status": "stale", "detail": "Last report 6:05 PM · 13 h ago"}, "battery": {"status": "stale", "detail": "Last report 6:05 PM · 13 h ago"}, "link": {"value": "Offline", "status": "error", "icon": "wifi-off", "detail": "Last heartbeat 9:10 PM"}},
                "batt": {"charge": 21}
              }
            }
          ],
          "paths": [
            {"id": "closed", "label": "Closed remotely", "steps": ["open", "remind", "a-close", "a-closed"]},
            {"id": "offline", "label": "Hub offline overnight", "steps": ["open", "remind", "b-offline", "b-morning"]}
          ]
        }
      }
    ],
    "flowview": {
      "authoredWith": "0.1.0",
      "minVersion": "0.1.0",
      "features": ["content.deviceapp", "content.deviceapp-navigation", "flow.alternates", "flow.drilldown", "media.shared-icons", "panel.battery", "panel.deviceapp", "panel.homemap"]
    }
  }
}
```

The self-audit walk of the stamped spec, with `--state` to print the folded
state of every panel after each step, and section I's card expectations as
`--expect` checks:

```
python3 scripts/spec_walk.py garage.stamped.spec.json --state \
  --expect 'offline/b-offline:phoneapp.door.value=Closed' \
  --expect 'offline/b-morning:phoneapp.door.value=Open' \
  --expect 'offline/b-morning:phoneapp.date=Sat, Oct 4' \
  --expect 'closed/a-closed:phoneapp.door.value=Closed'
```

prints:

```
=== Garage door left open: reminder and remote close

--- path closed  (panels: home phoneapp batt)
  step           clock     edges                                        panels       icons / code
  open           6:05 PM   sensor->hub, hub->cloud                      PP.          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[1]}
      * phoneapp {phoneScreen:home, clock:6:05 PM, date:Fri, Oct 3, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[0]}
        batt     {charge:23, source:cells, trend:draining, log:[0]}
  remind         6:20 PM   cloud->notify, notify->app                   .P.          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:home, clock:6:20 PM, date:Fri, Oct 3, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[1]}
        batt     {charge:23, source:cells, trend:draining, log:[0]}
  a-close        6:22 PM   app->cloud, cloud->app, cloud->hub           .P.          
        home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:app, clock:6:22 PM, date:Fri, Oct 3, door:{value:Closing, status:loading, detail:Close requested 6:22 PM}, battery:{value:23, status:ready, detail:Last report 6:05 PM}, link:{value:Online, status:ready}, notifications:[0]}
        batt     {charge:23, source:cells, trend:draining, log:[0]}
  a-closed       6:23 PM   hub->cloud, app->cloud, cloud->app           PP.          
  EXPECT ok   closed/a-closed:phoneapp.door.value = "Closed"
      * home     {gdoor:closed, tilt:ok, hubdev:tx, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:app, clock:6:23 PM, date:Fri, Oct 3, door:{value:Closed, status:ready, detail:Last report 6:23 PM}, battery:{value:23, status:ready, detail:Last report 6:05 PM}, link:{value:Online, status:ready}, notifications:[0]}
        batt     {charge:23, source:cells, trend:draining, log:[0]}
  CHECK panel batt is never patched on path closed (holds everywhere? give each step a holds: reason)

--- path offline  (panels: home phoneapp batt)
  step           clock     edges                                        panels       icons / code
  open           6:05 PM   sensor->hub, hub->cloud                      PP.          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[1]}
      * phoneapp {phoneScreen:home, clock:6:05 PM, date:Fri, Oct 3, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[0]}
        batt     {charge:23, source:cells, trend:draining, log:[0]}
  remind         6:20 PM   cloud->notify, notify->app                   .P.          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:home, clock:6:20 PM, date:Fri, Oct 3, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[1]}
        batt     {charge:23, source:cells, trend:draining, log:[0]}
  b-offline      9:40 PM   (no edge)                                    PPP          home.hubdev.icon=cloud-off
  EXPECT ok   offline/b-offline:phoneapp.door.value = "Closed"
      * home     {gdoor:open, tilt:ok, hubdev:{state:idle, icon:cloud-off}, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:home, clock:9:40 PM, date:Fri, Oct 3, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[1]}
      * batt     {charge:22, source:cells, trend:draining, note:illustrative drift, log:[0]}
  b-morning      7:10 AM   app->cloud, cloud->app                       .PP          phoneapp.link.icon=wifi-off
  EXPECT ok   offline/b-morning:phoneapp.door.value = "Open"
  EXPECT ok   offline/b-morning:phoneapp.date = "Sat, Oct 4"
        home     {gdoor:open, tilt:ok, hubdev:{state:idle, icon:cloud-off}, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:app, clock:7:10 AM, date:Sat, Oct 4, door:{value:Open, status:stale, detail:Last report 6:05 PM · 13 h ago}, battery:{value:23, status:stale, detail:Last report 6:05 PM · 13 h ago}, link:{value:Offline, status:error, detail:Last heartbeat 9:10 PM, icon:wifi-off}, notifications:[1]}
      * batt     {charge:21, source:cells, trend:draining, note:illustrative drift, log:[0]}
  numeric changes (compare each rate with the source's stated rate):
    b-offline batt: 23 -> 22 over 3h20 = -0.3/h
    b-morning batt: 22 -> 21 over 9h30 = -0.1/h

0 warning(s), 1 check(s)
```

The walk prints WARN only for what the spec and the command-line inputs prove
wrong, and CHECK for things to re-read; a CHECK is a prompt, not a defect.
There are no WARNs here, and no card change is flagged as undelivered:
the door, battery and link cards name the source `doorsvc`, whose `node` is
`cloud`, and every step that changes a card (`a-close`, `a-closed`,
`b-morning`) lights `app->cloud` and `cloud->app`. Without that declared
source the walk cannot tell which edge feeds a card and prints a CHECK ("the
spec declares no route for it") at each card change. The one CHECK on path closed is expected: section E
gives a `holds:` reason for `batt` on every step (only 18 minutes pass). The
code reference appears on both `open` (the timer starts) and `remind` (the
reminder is sent), matching section H.

In the `--state` lines, `*` marks a panel whose folded state changed at that
step. `home` is starred at `remind` although the step does not patch it (`.`
in the panels column): the tilt-to-hub signal from `open` is step-local, so it
clears (`signals:[1]` to `signals:[0]`). Read each starred line against
section E: the door stays `open` on path offline, and the app cards change
only at steps that light `app->cloud` and `cloud->app`. Every other line
matches sections D to I. The 9h30 at `b-morning` is measured across the date
change (Fri, Oct 3 to Sat, Oct 4); a date the walk cannot parse would make
that interval unknown and print no rate. Note what the walk does not flag: the
app's battery card reads 23 while the sensor is at 22 and 21, because each
card's detail names the 6:05 PM or 4:05 PM report it shows. Had a detail named
no report time, the mismatch would be a CHECK, not a WARN: this spec does not
declare that the card and `batt` show the same battery: the card's source
`doorsvc` names node `cloud`, and `batt` names no node (a source whose `node`
matched a `node` on `batt` would declare it), so the walk cannot prove it
wrong.
