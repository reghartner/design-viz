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

The operator's initial brief, supplied with the HLD, asks for an engineering
diagram for support engineers handling "my door was open all night" tickets.
It says to show both HLD outcomes: remote close and hub offline overnight. The
takeaway is "The app can show Open for hours while the real door state is
unknown." The brief also supplies the starting situation: door closed, car
inside, sensor battery 23%, hub online, phone on its home screen, with the last
app read at 4:05 PM (Closed, 23%). It says the story opens when the resident
backs the car out and the door remains open. It includes `catalog.json`, where only
`component:default/door-service` matches the story; identifies push as a vendor;
and supplies the reminder code at
`https://github.com/example-garage/door-service`, revision
`2222222222222222222222222222222222222222`, `src/reminder.ts`, between
`// flow:reminder:start` and `// flow:reminder:end` (lines 14 to 37). An
attached interface note says the tilt sensor sends door state and battery only
when the door state changes; the reminder push contains display text but no
door-record data; and `GET /door` returns door state, sensor battery and hub
status, each with its report time.

## Phase 2: questions sent, answers received

The author does not ask for the level, audience, takeaway, outcomes, starting
state, catalog or code: the initial brief already supplies them, and HLD items
4 and 5 already describe both outcomes. Clock/date formatting and the precise
link-loss time are cosmetic illustrative choices, declared below as D7 and D8
rather than disguised as questions.

The batch asks four independently answerable decisions. Each row has one choice
even when its default includes enough context to answer "ok". The author then
waits for all four answers before starting the worksheet.

| # | Question (with proposed default) | Operator answer |
|---|---|---|
| 1 | The HLD gives no battery drain rate for the tilt sensor. What rate should the diagram use? (default: 0.15% per hour, labeled illustrative) | No measured figure; use the estimate, labeled illustrative. |
| 2 | Should the app read the door record when it comes to the foreground? (default: yes) | Yes. |
| 3 | While the app stays on screen, how often should it refresh the door record? (default: every 30 seconds) | Every 30 seconds. |
| 4 | Does the app refresh the door record while it is in the background? (default: no; it keeps its last read) | No; keep the last read. |

Not asked, because the source and initial brief settle them or they claim
little: technical level, audience, takeaway, paths, starting state, catalog,
code, the opening event, report and push behavior, response fields, panels,
delivery, the illustrative story times,
clock/date formatting and the link-loss time. The author choices are in the
ledger under "Decisions I made".

## Ledger excerpt

```markdown
## Supplied brief and assets
| # | supplied fact | provenance | applied at |
|---|---------------|------------|------------|
| I1 | engineering level | operator's initial brief | whole page (captions name protocols, APIs and code) |
| I2 | support-engineer audience; takeaway: "The app can show Open for hours while the real door state is unknown" | operator's initial brief | worksheet A; blocks[0].diagram.steps[5].text |
| I3 | show remote-close and hub-offline outcomes | operator's initial brief, selecting HLD items 4 and 5 | blocks[0].diagram.paths |
| I4 | start closed, car inside, sensor at 23%, hub online, phone on home screen; last app read at 4:05 PM | operator's initial brief | blocks[0].diagram.panels[*].initial |
| I5 | `catalog.json` identifies only door-service; push is a vendor; reminder code identity and location supplied | operator's initial brief and attached assets | blocks[0].diagram.nodes.cloud |
| I6 | `GET /door` returns door state, sensor battery and hub status, each with report time | attached interface note | blocks[0].diagram.panels[1].sources, .fields |
| I7 | the resident backs the car out and the door remains open | operator's initial brief | worksheet A; blocks[0].diagram.steps[0] |
| I8 | the tilt sensor reports door state and battery only when door state changes | attached interface note | worksheet D; blocks[0].diagram.steps[0], steps[3] |
| I9 | the reminder push carries display text, not door-record data | attached interface note | worksheet D and E; blocks[0].diagram.steps[1] |

## Amendments
| # | question | operator answer | date | applied at | status |
|---|----------|-----------------|------|------------|--------|
| A1 | sensor drain rate? | none measured; 0.15%/h estimate, labeled illustrative | 09-26-2026 | blocks[0].diagram.panels[2].drainPerHour, .initial.note; blocks[0].text | active |
| A2 | read when entering foreground? | yes | 09-26-2026 | blocks[0].diagram.edges[4]; worksheet D | active |
| A3 | foreground refresh interval? | every 30 s while on screen | 09-26-2026 | worksheet D and E | active |
| A4 | background refresh? | no; keep the last read | 09-26-2026 | worksheet A, D and E | active |

## Decisions I made
| # | decision | evidence or reason | applied at |
|---|----------|--------------------|------------|
| D1 | panels: home map, resident phone app, sensor battery; no service `state` panel, no `phone` panel | the app card already shows the service's view; the device app shows notifications | blocks[0].diagram.panels |
| D2 | standalone page, desktop | the request names no other destination | page |
| D3 | `notify` and `app` left unbound | not in the supplied catalog (I5) | blocks[0].diagram.nodes.notify, .app |
| D4 | the sensor battery drifts by itself at 0.15 %/h (A1): 23 at 6:04 PM, 22 at 9:40 PM, 21 at 7:10 AM; no charge patches | an illustrative estimate; the drift stays above the low threshold (20); the page says the rate is illustrative | blocks[0].diagram.panels[2] |
| D5 | no edge at `b-offline` | missed heartbeats are an absence, not a message | blocks[0].diagram.steps[4] |
| D6 | phone app declares one source, `doorsvc` (Door service, `node: "cloud"`, `GET /door`); the door, battery and link cards all name it; the source map stays visible (`showSources` omitted) | A2-A4 and I6: the app learns every card from the door record; the declared route lets the walk prove each card change rides a delivered `app->cloud`/`cloud->app` step, and the visible map tells support engineers the app shows the service's record, not the door | blocks[0].diagram.panels[1].sources, .fields |
| D7 | the hub lost its link at 9:10 PM (illustrative); `b-offline` is at 9:40 PM | the source gives no time; three missed 10-minute heartbeats after 9:10 is 9:40 (source item 5) | blocks[0].diagram.steps[4].time, .text |
| D8 | stage the supplied overnight story from 6:04 PM Fri Oct 2, 2026, through 7:30 AM next day; use a 12-hour clock and short dates | illustrative exact times and reasonable cosmetic formatting; the brief requires an overnight span but supplies no anchors or format | blocks[0].diagram.storyTime; blocks[0].text |
```

## Storyboard worksheet

### A. Story

**Level:** engineering (I1): captions name protocols, APIs and the code that runs.
**Audience:** support engineers; they know the app well and follow a ticket into the backend.
**Takeaway:** the app can show "Open" for hours while the real door state is unknown.
**Story (60-second narration):** At 6:05 PM the car backs out and the garage
door stays open. The tilt sensor tells the hub, the hub tells the door service,
and a 15-minute timer starts. The phone is in a pocket: the app has not read
anything since the afternoon. At 6:20 PM the phone shows a reminder. In the
good ending the resident taps it at 6:22: the app reads the door (Open), the
resident taps Close, the service accepts it and commands the hub. At 6:23 the
opener's limit switch confirms closed, the tilt sensor reports the closed state
and battery, the hub publishes closed, and the app's next refresh shows both
reports from 6:23 PM. In the bad ending nobody taps the reminder. The hub
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
| home | homemap | physical | Where are the car and the door, and is the hub connected? | `open` (car leaves, door open) | door closed, car inside, hub idle (I4) | the door closing on the offline path |
| phoneapp | deviceapp | reported | What does the resident see, and how old is it? | `b-morning` (stale Open, 13 h) | home screen, door Closed and battery 23% from the 4:05 PM report, hub Online (I4); clock and date from story time | a card change on a step that delivers nothing to the app; "just now" on old data |
| batt | battery | physical | Is the sensor's battery a factor? | `b-morning` (slow drift, still above low) | 23%, cells, draining (I4); drains 0.15 %/h (A1) | a sudden drop without a cause |

Rejected: a `state` panel for the door service (the app card already tells it);
a `phone` panel (the device app already shows notifications). Both in D1.

Source map: one source, `doorsvc` (Door service, node `cloud`, `GET /door`),
for all three cards (I6, D6). It stays visible: the reader's takeaway is that
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

**Story time:** start `2026-10-02T18:04`; end `2026-10-03T07:30`; clock
`12h`; date `short` (D8; times illustrative).
**Battery rates:** `batt` drains 0.15 %/h (A1, illustrative estimate, said on
the page); it never charges, so no charge rate is needed.

Anchors: 23% at start and the 4:05 PM report (I4). Source durations: the
reminder 15 min after open; offline after 3 missed 10-min heartbeats. The
link loss at 9:10 PM is illustrative (D7), so `b-offline` sits at 9:40 PM.

Report schedule: the tilt sensor reports on change only (I4, I8: 4:05 PM closed,
6:05 PM open; no later sensor report on path offline). The hub heartbeats every 10
min; the last one arrives 9:10 PM, and 9:20, 9:30 and 9:40 are missed. The app
receives nothing on its own: it reads `GET /door` on foreground entry and then
every 30 seconds while visible (A2-A3), but not in the background (A4). A
schedule is an opportunity, not evidence: the app column changes only at a
step that lights `app->cloud` and `cloud->app`.

| Path | Step | `time` | Story time shown | Anchor, source or illus | Battery | Last report the app holds, and freshness | Day or night |
|---|---|---|---|---|---|---|---|
| both | (start) | | 6:04 PM, Fri, Oct 2 | 23% and 4:05 PM report anchor; clock illus | 23, draining | 4:05 PM (Closed, 23%): "Last report 4:05 PM" | evening |
| both | open | `18:05` | 6:05 PM | illus | drift only | holds 4:05 PM: app in background, no read (the 6:05 PM report, 23%, reaches the service only) | evening |
| both | remind | `+15m` | 6:20 PM | 15 min source | drift only | holds 4:05 PM: the push carries reminder text, not the record (I9) | evening |
| closed | a-close | `18:22` | 6:22 PM | illus | drift only | read at 6:22: 6:05 PM report (Open, 23%); door then "Close requested 6:22 PM"; battery "Last report 6:05 PM" | evening |
| closed | a-closed | `+1m` | 6:23 PM | illus | drift only | tilt sensor reports Closed and battery; hub publishes Closed; refresh shows both with "Last report 6:23 PM" | evening |
| offline | b-offline | `21:40` | 9:40 PM | 9:10 PM illus (D7) + 30 min source rule | drift only | holds 4:05 PM: app in background | night |
| offline | b-morning | `07:10` | 7:10 AM, Sat, Oct 3 | illus | drift only | read at 7:10: 6:05 PM report (Open, 23%), stale: "Last report 6:05 PM · 13 h ago"; hub Offline, "Last heartbeat 9:10 PM" | morning |

No `batt` panel patch anywhere: no operation costs extra charge and no value is
stated after the start. The walk prints what the drift shows (22.46 at 9:40
PM, 21.03 at 7:10 AM, read as 22% and 21%). Freshness text names the report
time, so it stays true while the clock moves; only the 7:10 AM read adds an
age. No panel here draws day or night; the captions name the time.

### E. Step x panel matrix

```
### open   paths: closed, offline   time: 6:05 PM (`18:05`)
Beat: The car leaves, the door stays open; the sensor reports open and the hub publishes it.
Hops claimed: tilt sensor -> hub (open, 23%); hub -> door service (PUBLISH door/state)
Edges: sensor->hub (report), hub->cloud (PUBLISH door/state)
Missing hops check: none (no ack in the source; nothing goes to the app)
Report?: no report delivered to the app (the 6:05 PM report stops at the door service)
Focus: home
home: patch: gdoor open; car to driveway (225,165); signal tilt->hubdev
phoneapp: holds: clock follows story time; cards hold (app in background, no read)
batt: holds: drift only
State cleared: door closed -> open (map); car inside -> driveway; app door card still Closed from 4:05 PM: still true as the app's last read
Icons: none: no card or marker state changed (door has no icon states)
Tones: none
Code/binding: codeRefs door-service.reminder on this step (the timer starts here; `hub->cloud` touches `cloud`, the owning node); no code located for state ingest
Evidence: L1, L2, L6, I7, I8; time illus

### remind   paths: closed, offline   time: 6:20 PM (`+15m`)
Beat: 15 minutes open; the door service asks the push service to remind the resident.
Hops claimed: door service -> push service (send reminder); push service -> resident app (push)
Edges: cloud->notify (send reminder), notify->app (push)
Missing hops check: none
Report?: no report (I9: the push carries reminder text, not the door record)
Focus: phoneapp
home: holds: nothing physical changes; door still open, car still out
phoneapp: patch: notify "Garage door open"
batt: holds: drift only (below a visible point)
State cleared: no state change (cards hold the 4:05 PM read)
Icons: none: no state change
Tones: none
Code/binding: codeRefs door-service.reminder on this step (the reminder is sent here; `cloud->notify` touches `cloud`)
Evidence: L3, L9, I9

### a-close   paths: closed   time: 6:22 PM (`18:22`)
Beat: The resident taps the reminder; the app reads the door (Open), the resident taps Close, the service accepts it and commands the hub.
Hops claimed: app -> door service (GET /door, then POST /door/close); door service -> app (door record, then 202); door service -> hub (PUBLISH door/cmd)
Edges: app->cloud (GET /door · POST /door/close), cloud->app (door record · 202, ret), cloud->hub (PUBLISH door/cmd)
Missing hops check: added the response edge (source item 4 says the service replies 202; A2 and I6 give the read); one edge per pair, both messages named in the label and caption
Report?: report at 6:22 PM delivered by the read: door (6:05 PM report, Open) and battery (23%, 6:05 PM); door then shows Closing from the app's own request
Focus: phoneapp
home: holds: the relay has not moved the door yet
phoneapp: patch: phoneScreen app; clear notifications (reminder tapped); door Closing, status loading, detail "Close requested 6:22 PM"; battery detail "Last report 6:05 PM"
batt: holds: drift only
State cleared: phone home -> app; reminder notification cleared; door card Closed -> Closing; battery card 23 still true, report time 4:05 -> 6:05 PM; link Online still true
Icons: none
Tones: none
Code/binding: cloud binding api operation closeDoor (POST /door/close)
Evidence: L4, A2, I6

### a-closed   paths: closed   time: 6:23 PM (`+1m`)
Beat: The hub drives the opener; the limit switch confirms closed; the tilt sensor reports closed and battery; the hub publishes closed and the app's next refresh shows the new report.
Hops claimed: tilt sensor -> hub (closed, battery); hub -> door service (PUBLISH door/state closed); app -> door service (GET /door, 30 s refresh); door service -> app (door record)
Edges: sensor->hub (closed report), hub->cloud (PUBLISH door/state), app->cloud (GET /door), cloud->app (door record, ret)
Missing hops check: included sensor->hub because the door changed and I8 says the tilt sensor reports every door-state change; no ack is stated
Report?: report at 6:23 PM delivered by the refresh: door Closed and battery 23%, both from the sensor's 6:23 PM report
Focus: home
home: patch: gdoor closed; hubdev tx; signal tilt->hubdev
phoneapp: patch: door Closed, status ready, detail "Last report 6:23 PM"; battery 23, status ready, detail "Last report 6:23 PM"
batt: holds: drift only
State cleared: door open -> closed (map) and Closing -> Closed (app); car still in the driveway: still true; battery card value remains 23 but its report time advances 6:05 -> 6:23 PM
Icons: none
Tones: none
Code/binding: none located
Evidence: L1, L4, A3, I6, I8

### b-offline   paths: offline   time: 9:40 PM (`21:40`)
Beat: The hub lost its link at 9:10 PM; after three missed heartbeats the service marks it offline.
Hops claimed: none (missed heartbeats are an absence, not a message)
Edges: none (missed heartbeats are an absence, not a failed send we can see)
Missing hops check: none
Report?: no report (the app is in the background and reads nothing)
Focus: home
home: patch: hubdev icon cloud-off (door stays open: holds)
phoneapp: holds: clock follows story time; cards hold the 4:05 PM read (the app does not know yet)
batt: holds: drift only (shows 22)
State cleared: hub online -> offline (map, tone); app link card Online: still the app's last read, not yet refreshed; door card Closed: still the app's last read
Icons: hubdev -> cloud-off
Tones: hub warn (source: marked offline)
Code/binding: none located
Evidence: L5, D7 (9:10 PM illus), D4 illus rate

### b-morning   paths: offline   time: 7:10 AM, Sat, Oct 3 (`07:10`)
Beat: The resident opens the app next morning; it reads the service: Open, stale, 13 hours old.
Hops claimed: app -> door service (GET /door); door service -> app (door record)
Edges: app->cloud (GET /door), cloud->app (door record, ret)
Missing hops check: none (the service answers from its record; the hub is not asked)
Report?: report at 7:10 AM delivered by the read: door Open (6:05 PM report), battery 23% (6:05 PM), hub Offline (last heartbeat 9:10 PM)
Focus: phoneapp
home: holds: no evidence the door or the car moved; hub still offline
phoneapp: patch: phoneScreen app; door Open, status stale, detail "Last report 6:05 PM · 13 h ago"; battery status stale, same detail; link Offline, status error, icon wifi-off, detail "Last heartbeat 9:10 PM"
batt: holds: drift only (shows 21)
State cleared: phone home -> app; door card Closed -> Open (stale); battery card 23 still true as reported, now stale; link Online -> Offline; reminder notification still on the stack (never tapped)
Icons: link card -> wifi-off; cloud-off persists (no reconnect in the source)
Tones: none new (hub warn carries)
Code/binding: none
Evidence: L5, A2, A4, I6, D4 illus rate
```

### F. Coverage grid

| Path: closed | open | remind | a-close | a-closed |
|---|---|---|---|---|
| home | P | H | H | P |
| phoneapp | H | P | P | P |
| batt | H | H | H | H |

| Path: offline | open | remind | b-offline | b-morning |
|---|---|---|---|---|
| home | P | H | P | H |
| phoneapp | H | P | H | P |
| batt | H | H | H | H |

Boring panel check: `batt` is never patched because its charge drifts by
itself with story time. On the closed path only 19 minutes pass, so it reads
23% throughout. It earns its place on the offline path (23 to 22 to 21
across the night, which rules out "the sensor died"). Kept.

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
| cloud | component:default/door-service | api:default/door-service, closeDoor POST /door/close | door-service.reminder: src/reminder.ts 14-37 | open (starts the timer), remind (sends the reminder) | `GET /door` comes from I6; the binding names the close call this story turns on |
| notify | | | | | not a catalog service (vendor) |
| hub, sensor | | | | | device, not a catalog service |
| app | | | | | not in supplied catalog: recorded as gap row (D3) |
| phoneapp source `doorsvc` (`node: "cloud"`) | through `cloud`: component:default/door-service | `GET /door` (I6) | | a-close, a-closed, b-morning | door, battery and link cards read the door record; each of these steps lights `app->cloud` and `cloud->app` |

### I. Checkable expectations

1. On path offline the map door never closes, and the app's door card changes
   only at `b-morning`, to Open (stale).
2. The last step of path offline reads 7:10 AM, Sat, Oct 3.
3. `a-close` lights the request and its response.
4. Every app card change sits on a step that lights `app->cloud` and
   `cloud->app`, the delivered edges that touch `cloud`, the node of the
   cards' declared source `doorsvc`.
5. At `a-closed`, `sensor->hub` carries the close report and the refreshed app
   battery card says "Last report 6:23 PM".
6. No battery icon changes: the charge never reaches the low threshold (20).

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
        "text": ["Source: garage-door-hld.md (local file, v3), and operator answers. Clock times and the sensor's battery drain rate are illustrative."],
        "diagram": {
          "view": "step",
          "storyTime": {"start": "2026-10-02T18:04", "end": "2026-10-03T07:30", "clock": "12h", "date": "short"},
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
                "phoneScreen": "home",
                "door": {"value": "Closed", "status": "ready", "detail": "Last report 4:05 PM"},
                "battery": {"value": 23, "status": "ready", "detail": "Last report 4:05 PM"},
                "link": {"value": "Online", "status": "ready"}
              }
            },
            {
              "id": "batt", "type": "battery", "title": "Tilt sensor battery", "low": 20, "crit": 10,
              "drainPerHour": 0.15,
              "initial": {"charge": 23, "source": "cells", "trend": "draining", "note": "illustrative drain estimate"}
            }
          ],
          "steps": [
            {
              "id": "open", "time": "18:05", "edges": ["sensor->hub", "hub->cloud"],
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
                "home": {"gdoor": "open", "car": {"x": 225, "y": 165}, "signals": [{"from": "tilt", "to": "hubdev"}]}
              }
            },
            {
              "id": "remind", "time": "+15m", "edges": ["cloud->notify", "notify->app"],
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
                "phoneapp": {"notify": {"app": "Garage", "title": "Garage door open", "text": "Open for 15 minutes. Tap to close."}}
              }
            },
            {
              "id": "a-close", "time": "18:22", "edges": ["app->cloud", "cloud->app", "cloud->hub"],
              "text": "6:22 PM. The resident taps the reminder. The app reads the door record (**Open**, last report 6:05 PM), the resident taps **Close**, and the app posts the request. The door service replies 202 and publishes a close command to the hub.",
              "panels": {
                "phoneapp": {"phoneScreen": "app", "clear": true, "door": {"value": "Closing", "status": "loading", "detail": "Close requested 6:22 PM"}, "battery": {"detail": "Last report 6:05 PM"}}
              }
            },
            {
              "id": "a-closed", "time": "+1m", "edges": ["sensor->hub", "hub->cloud", "app->cloud", "cloud->app"],
              "text": "6:23 PM. The hub drives the opener relay. The opener's limit switch confirms closed; the tilt sensor reports **closed** with battery; the hub publishes **closed**. The app's next refresh reads the new report.",
              "panels": {
                "home": {"gdoor": "closed", "hubdev": "tx", "signals": [{"from": "tilt", "to": "hubdev"}]},
                "phoneapp": {"door": {"value": "Closed", "status": "ready", "detail": "Last report 6:23 PM"}, "battery": {"value": 23, "status": "ready", "detail": "Last report 6:23 PM"}}
              }
            },
            {
              "id": "b-offline", "time": "21:40", "nodes": ["cloud"], "tone": {"hub": "warn"},
              "text": "9:40 PM. The hub lost its internet link at 9:10 PM. After three missed heartbeats the door service marks the hub offline. The door is still open. The app, in the background, does not know.",
              "panels": {
                "home": {"hubdev": {"icon": "cloud-off"}}
              }
            },
            {
              "id": "b-morning", "time": "07:10", "edges": ["app->cloud", "cloud->app"],
              "text": "7:10 AM next day. The resident opens the app, which reads the door record: **Open**, stale, from the 6:05 PM report. The real door position is unknown to the service.",
              "panels": {
                "phoneapp": {"phoneScreen": "app", "door": {"value": "Open", "status": "stale", "detail": "Last report 6:05 PM · 13 h ago"}, "battery": {"status": "stale", "detail": "Last report 6:05 PM · 13 h ago"}, "link": {"value": "Offline", "status": "error", "icon": "wifi-off", "detail": "Last heartbeat 9:10 PM"}}
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
      "features": ["content.deviceapp", "content.deviceapp-navigation", "flow.alternates", "flow.drilldown", "flow.story-time", "media.shared-icons", "panel.battery", "panel.deviceapp", "panel.homemap"]
    }
  }
}
```

The self-audit walk of the stamped spec, with `--state` to print the folded
state of every panel after each step, the drain rate from A1 as `--rate`,
and section I's card expectations as `--expect` checks:

```
python3 scripts/spec_walk.py garage.stamped.spec.json --state --rate batt=-0.15:0 \
  --expect 'offline/b-offline:phoneapp.door.value=Closed' \
  --expect 'offline/b-morning:phoneapp.door.value=Open' \
  --expect 'offline/b-morning:phoneapp.date=Sat, Oct 3' \
  --expect 'closed/a-closed:phoneapp.door.value=Closed' \
  --expect 'closed/a-closed:phoneapp.battery.detail=Last report 6:23 PM'
```

prints:

```
=== Garage door left open: reminder and remote close
story time: Fri, Oct 2 6:04 PM to Sat, Oct 3 7:30 AM; panels inherit clock and date from each step
battery batt: drain 0.15 %/h (panel), charge 20 %/h (built-in placeholder)

--- path closed  (panels: home phoneapp batt)
  step           clock     edges                                        panels       icons / code
  open           6:05 PM   sensor->hub, hub->cloud                      P..          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[1]}
      * phoneapp {phoneScreen:home, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[0], clock:6:05, date:Fri, Oct 2}
        batt     {charge:23, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  remind         6:20 PM   cloud->notify, notify->app                   .P.          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:home, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[1], clock:6:20, date:Fri, Oct 2}
      * batt     {charge:22.96, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  a-close        6:22 PM   app->cloud, cloud->app, cloud->hub           .P.          
        home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:app, door:{value:Closing, status:loading, detail:Close requested 6:22 PM}, battery:{value:23, status:ready, detail:Last report 6:05 PM}, link:{value:Online, status:ready}, notifications:[0], clock:6:22, date:Fri, Oct 2}
        batt     {charge:22.96, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  a-closed       6:23 PM   sensor->hub, hub->cloud, app->cloud, cloud->app PP.
  EXPECT ok   closed/a-closed:phoneapp.door.value = "Closed"
  EXPECT ok   closed/a-closed:phoneapp.battery.detail = "Last report 6:23 PM"
      * home     {gdoor:closed, tilt:ok, hubdev:tx, car:{x:225, y:165}, signals:[1]}
      * phoneapp {phoneScreen:app, door:{value:Closed, status:ready, detail:Last report 6:23 PM}, battery:{value:23, status:ready, detail:Last report 6:23 PM}, link:{value:Online, status:ready}, notifications:[0], clock:6:23, date:Fri, Oct 2}
      * batt     {charge:22.95, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  numeric changes (compare each rate with the source's stated rate):
    remind batt: 23 -> 22.96 over 15 min = -0.16/h
    a-closed batt: 22.96 -> 22.95 over 1 min (two-decimal rounding)

--- path offline  (panels: home phoneapp batt)
  step           clock     edges                                        panels       icons / code
  open           6:05 PM   sensor->hub, hub->cloud                      P..          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[1]}
      * phoneapp {phoneScreen:home, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[0], clock:6:05, date:Fri, Oct 2}
        batt     {charge:23, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  remind         6:20 PM   cloud->notify, notify->app                   .P.          code:door-service.reminder
      * home     {gdoor:open, tilt:ok, hubdev:idle, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:home, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[1], clock:6:20, date:Fri, Oct 2}
      * batt     {charge:22.96, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  b-offline      9:40 PM   (no edge)                                    P..          home.hubdev.icon=cloud-off
  EXPECT ok   offline/b-offline:phoneapp.door.value = "Closed"
      * home     {gdoor:open, tilt:ok, hubdev:{state:idle, icon:cloud-off}, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:home, door:{value:Closed, status:ready, detail:Last report 4:05 PM}, battery:{value:23, status:ready, detail:Last report 4:05 PM}, link:{value:Online, status:ready}, notifications:[1], clock:9:40, date:Fri, Oct 2}
      * batt     {charge:22.46, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  b-morning      7:10 AM   app->cloud, cloud->app                       .P.          phoneapp.link.icon=wifi-off
  EXPECT ok   offline/b-morning:phoneapp.door.value = "Open"
  EXPECT ok   offline/b-morning:phoneapp.date = "Sat, Oct 3"
        home     {gdoor:open, tilt:ok, hubdev:{state:idle, icon:cloud-off}, car:{x:225, y:165}, signals:[0]}
      * phoneapp {phoneScreen:app, door:{value:Open, status:stale, detail:Last report 6:05 PM · 13 h ago}, battery:{value:23, status:stale, detail:Last report 6:05 PM · 13 h ago}, link:{value:Offline, status:error, detail:Last heartbeat 9:10 PM, icon:wifi-off}, notifications:[1], clock:7:10, date:Sat, Oct 3}
      * batt     {charge:21.03, source:cells, trend:draining, note:illustrative drain estimate, log:[0]}
  numeric changes (compare each rate with the source's stated rate):
    remind batt: 23 -> 22.96 over 15 min = -0.16/h
    b-offline batt: 22.96 -> 22.46 over 3h20 = -0.15/h
    b-morning batt: 22.46 -> 21.03 over 9h30 = -0.15/h

0 warning(s), 0 check(s)
```

The walk prints WARN only for what the spec and the command-line inputs prove
wrong, and CHECK for things to re-read; a CHECK is a prompt, not a defect.
There are none here. The clock column is the resolved story time, and the
`phoneapp` state shows the clock and date it inherited (`clock:7:10`,
`date:Sat, Oct 3`) although no step patches them. The battery lines show the
drift: `batt` is never patched, yet it reads 22.46 at 9:40 PM and 21.03 at
7:10 AM (the panel shows 22% and 21%), each interval at the 0.15 %/h from A1.
The 1-minute step at `a-closed` moves only the two-decimal rounding. The
header names where each rate comes from: the drain rate is the panel's own;
the charge rate is the built-in placeholder, unused because the trend never
turns `charging`, so the walk asks nothing about it.

No card change is flagged as undelivered: the door, battery and link cards
name the source `doorsvc`, whose `node` is `cloud`, and every step that
changes a card (`a-close`, `a-closed`, `b-morning`) lights `app->cloud` and
`cloud->app`. Without that declared source the walk cannot tell which edge
feeds a card and prints a CHECK ("the spec declares no route for it") at each
card change. The code reference appears on both `open` (the timer starts) and
`remind` (the reminder is sent), matching section H.

In the `--state` lines, `*` marks a panel whose folded state changed at that
step. `home` is starred at `remind` although the step does not patch it (`.`
in the panels column): the tilt-to-hub signal from `open` is step-local, so it
clears (`signals:[1]` to `signals:[0]`); `batt` is starred wherever drift
moved it. Read each starred line against section E: the door stays `open` on
path offline, and the app cards change only at steps that light `app->cloud`
and `cloud->app`. Every other line matches sections D to I. Note what the
walk does not flag: the app's battery card reads 23 while the sensor is at 22
and 21 on the offline path, because each card's detail names the 6:05 PM or
4:05 PM report it shows. On the closed path, the 6:23 PM sensor report rounds
the physical 22.95% to the app's whole-number 23%. Had a detail named no report
time, the mismatch would be a CHECK, not a WARN: this spec does not declare that
the card and `batt` show the same battery: the card's source `doorsvc` names
node `cloud`, and `batt` names no node (a source whose `node` matched a `node`
on `batt` would declare it), so the walk cannot prove it wrong.
