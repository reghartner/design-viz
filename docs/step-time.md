# Story time, step clocks and battery drain

Time is a property of the **step**, not of each panel. A diagram declares
when its story starts; each step may move the story clock forward. Every
time-bearing panel (phone, device app and app screens clock and date) shows
the step's time automatically. Battery panels drain or charge from the elapsed
time.

## Spec shape

```json
{
  "diagram": {
    "storyTime": {
      "start": "2026-09-24T22:30",
      "end": "2026-09-25T07:30",
      "clock": "12h",
      "date": "short"
    },
    "deviceDefaults": {"battery": {"drainPerHour": 0.5, "chargePerHour": 12}},
    "panels": [
      {"id": "phone", "type": "phone", "title": "Resident phone"},
      {"id": "batt", "type": "battery", "title": "Camera battery", "low": 20, "crit": 10,
       "drainPerHour": 0.8, "initial": {"charge": 64, "trend": "idle"}}
    ],
    "steps": [
      {"id": "armed", "text": "Camera armed for the night"},
      {"id": "motion", "time": "+3h19m", "text": "Motion at the back door",
       "panels": {"batt": {"drain": 1}}},
      {"id": "sunrise", "time": "2026-09-25T06:50", "text": "Sunrise; solar charging starts",
       "panels": {"batt": {"trend": "charging", "source": "solar"}}}
    ]
  }
}
```

### `diagram.storyTime`

| Key | Meaning |
| --- | --- |
| `start` | **Required.** Absolute local date-time `YYYY-MM-DDTHH:MM` (optional `:SS`), years 100–9999. The story clock before the first step. |
| `end` | Optional absolute date-time. The expected end of the story; steps later than it warn. |
| `span` | Optional duration longer than zero, such as `"9h"` or `"1d2h"`; an alternative to `end` (`end` wins when both are set). |
| `clock` | `"12h"` (default, `10:30`) or `"24h"` (`22:30`). Status bars never show AM/PM. |
| `date` | `"short"` (default, `Thu, Sep 24`), `"long"` (`Thursday, September 24`), `"iso"` (`2026-09-24`) or `"none"` (no date line). |

**Ask about the span first.** The first time question for an author or agent
is the story's span: when it starts, and when it ends or how long it lasts.
Then ask for each battery device's drain and charge rates.

`storyTime` is the switch for every automatic time behavior. A diagram without
it renders exactly as before (see [Backward compatibility](#backward-compatibility)).

Times are *floating local wall-clock times*: no time zones and no daylight
saving. The engine does calendar arithmetic in UTC internally, so `+1d` is
always 24 hours.

### `step.time`

A step may set its story time in one of three forms:

| Form | Example | Meaning |
| --- | --- | --- |
| Relative | `"+3h19m"`, `"+45m"`, `"+1d2h"`, `"+90s"` | Advance from the previous step's time on this path. Units `d h m s`, in that order, at least one. |
| Absolute | `"2026-09-25T06:50"` | Set the exact date-time. |
| Time of day | `"06:50"` | The next time the clock reads 06:50 at or after the previous step's time (rolls over midnight). |

A step without `time` keeps the previous step's time: **time never moves
unless a step moves it**. The first step without a time shows `start`.

Paths fold separately. A step shared by two paths resolves against the previous
step *on each path*, so a relative time can resolve to different clock times on
different paths. Use an absolute time when a shared step must show one time.

### Validation (all warnings)

- `storyTime` not an object, missing or unparsable `start`, bad `end`/`span`
  (or `end` not after `start`), unknown `clock`/`date` → story time is off or
  that option uses its default.
- `step.time` unparsable, or resolving outside years 100–9999 (for example an
  enormous relative duration) → ignored; the step keeps the previous time.
  Hostile values never throw.
- `span` of zero, unparsable, or ending past year 9999 → ignored.
- `step.time` without `storyTime` → ignored.
- A step whose time is earlier than the previous step on the same path →
  "time goes backward on path …". It still renders as authored; battery drift
  never runs backward (negative intervals count as zero).
- A step later than `end` (or `start + span`) → warning, once per step and path.
- An invalid `deviceDefaults.battery` rate → that default is ignored; each
  battery panel uses its own rate or the built-in placeholder.

## Time-bearing panels: inheritance and override order

With `storyTime` declared, `phone`, `deviceapp` and `appscreens` show the
step's time as `clock` and `date`, formatted with `storyTime.clock` and
`storyTime.date`. For each step, per panel and per field:

1. If the story time moved at this step (compared with the previous step on the
   path, or with `start` for the first step), any earlier explicit value is
   released.
2. An explicit `clock`/`date` in this step's patch pins that field. It stays
   pinned while story time stands still and is released when a later step moves
   the story time. `initial.clock`/`initial.date` pin the same way from the
   start. An `enterOnce` value (app screens) applies at that step only.
3. Otherwise the field shows the formatted story time. With `"date": "none"`
   no date is shown.

So an explicit panel value always wins at the step where it is authored, and
new specs need no per-panel timestamps at all. The workbench leaves
`initial.clock` out of new phone panels once a diagram has a story time.

Other panels are not time-bearing: `timeline` measures elapsed time within its
own `span`, and `dispatch.timeOfDay` is scene lighting that the author chooses.

## Device constants

Battery constants resolve in this order:

1. The panel: `drainPerHour`, `chargePerHour` on the battery declaration.
2. The diagram: `deviceDefaults.battery.drainPerHour` / `.chargePerHour`.
3. Built-in: **`drainPerHour: 1`**, **`chargePerHour: 20`** (percent per hour).

**The built-in values are placeholders, not device facts.** They keep a sketch
moving; they do not describe any real device. Take rates from the source
document or the device owner. When a diagram relies on the built-in values, or
on any estimate, label it: record it in the ledger and say it on the page (the
section text or the battery `note`, for example "illustrative drain
estimate"). The workbench shows built-in rates as *placeholder* text and the
Effective state labels drift that uses one as *built-in default rate*.

Values must be finite numbers ≥ 0; others warn and fall through to the next
level. Use `0` to switch a direction off, for example `"drainPerHour": 0` for
a wired or PoE device. The workbench copies the diagram's own
`deviceDefaults.battery` rates into every new battery panel so the author sees
and can edit them. It does not copy the built-in placeholders: those stay
visible as placeholder text until someone enters a real rate. A spec author may
omit the rates to inherit.

## Automatic battery drain

For each battery panel and each step on a path, with `h` = hours elapsed since
the previous step on that path (never negative):

```
rate    = previousTrend == "charging" ? +chargePerHour : -drainPerHour
charge  = clamp(charge + h × rate, 0, 100)          # time drift
if patch.charge is a number: charge = patch.charge  # anchor
else if patch.drain is a number: charge = clamp(charge − patch.drain, 0, 100)
```

- `previousTrend` is the trend in effect **before** this step: the interval
  since the last step was spent in that state. A step that switches to
  `"trend": "charging"` starts charging from its own time onward.
- `drain` is the step's **additional** drain in percent (for example
  `"drain": 1` for a recorded clip). It is a one-step operation: it is never
  carried and never appears in the folded state. It must be a finite number
  ≥ 0; `drain` together with `charge` in one patch warns and the anchor wins.
- `charge` is an **anchor**: the authored value is shown exactly, and drift
  continues from it (clamped to 0–100 for further arithmetic).
- A panel without a charge (`NO DATA`) stays without one until an anchor.

**Rounding.** The engine keeps the fractional value between steps and stores
it rounded to two decimals in the folded state. The readout shows a whole
percent (`Math.round`); the fill and the sparkline use the stored value. Zones
compare the stored value, so `20.4` with `low: 20` still reads NOMINAL while
showing `20%`.

Only battery charge is automatic. Temperature and other values remain authored.

## Device-app battery cards

A `deviceapp` field with `"kind": "battery"` shows what the app *reports*, not
the physical battery: reports arrive late, are cached, or go stale. They do
not follow a battery panel. Patch them explicitly at the steps where the app
receives a report, typically with the rounded value the battery panel shows at
that step, and mark the report time (next section).

## Device-app report times and freshness

Device-app cards often say how old their value is: "Updated just now",
"Updated 3 h ago". With story time the engine knows the time at every step, so
**record when the value was reported and let the card compute the text**. Never
hand-write freshness in `detail`: it goes stale as soon as the story moves on.

```json
{"id": "app", "type": "deviceapp",
 "fields": [{"id": "battery", "label": "Battery", "kind": "battery"},
            {"id": "clip", "label": "Last recording", "freshness": "absolute"}],
 "initial": {"battery": {"value": 38, "status": "ready", "reportedAt": "now"}}}
```

```json
{"id": "status", "time": "08:21",
 "panels": {"app": {"battery": {"value": 41, "status": "ready", "reportedAt": "now"}}}}
```

### `reportedAt`

A field patch (initial or step) may set `reportedAt`. It carries forward like
the field's other values.

| Form | Example | Meaning |
| --- | --- | --- |
| Now | `"now"` | This step's story time (`initial`: the story start). The usual form: put it on the step that delivers the report. |
| Before this step | `"-15m"`, `"-2h"`, `"-1d"` | This step's time minus the duration. |
| After the previous step | `"+5m"` | The previous step's time on this path plus the duration, exactly like `step.time`. |
| Time of day | `"06:05"` | The latest 06:05 at or before this step's time (rolls back over midnight). |
| Absolute | `"2026-09-25T06:05"` | The exact date-time. |
| Clear | `null` | No report time; the card shows its authored `detail`. |

A `null` field patch (`{"battery": null}`) resets the field, including its
report time. The folded state shows the resolved report time as
`reportedAt: "2026-09-25T06:05"` (with `:SS` when seconds are set).

### Freshness text

On every step, a field with a report time shows freshness in its detail line,
computed from *this step's story time − report time*, rounded down:

| Elapsed | Text (default `"freshness": "relative"`) |
| --- | --- |
| under 1 minute | `Updated just now` |
| under 1 hour | `Updated 5 min ago` |
| under 24 hours | `Updated 3 h ago` |
| 24 hours or more | `Last report Thu, Sep 24, 6:05 PM` |

A field declared with `"freshness": "absolute"` always shows the report time:
`Last report 6:05 PM`, adding the short date (`Thu, Sep 24, 6:05 PM`) when the
report is from another calendar day. The time follows `storyTime.clock`
(`12h`: `6:05 PM`, `24h`: `18:05`). `"freshness": "off"` records the report
time but never writes text.

- **Explicit `detail` wins.** A non-empty `detail` in a patch (or `initial`)
  replaces the computed text from its step until a later step delivers a newer
  report without `detail`. Put `detail` in the same patch as `reportedAt` to
  keep your own text for that report; `detail: null` or `""` restores the
  computed text.
- **A new report is an update.** A step whose report time is new marks the card
  *Updated* even when the value did not change.
- **Status stays explicit.** Freshness never changes `status`; set `stale`
  yourself when the app shows a cached value.
- **Paths fold separately.** A relative or time-of-day report time on a shared
  step resolves against each path's times.
- A report later than the step's own time (a report from the future) warns and
  reads as just reported.

### Validation (report times, all warnings)

- `reportedAt` that is not one of the forms above, or lands outside years
  100–9999 → ignored.
- `reportedAt` without `diagram.storyTime` → ignored; the card shows its
  authored detail exactly as before.
- A report time later than its step's story time → "is later than the step's
  story time", once per step, field and path.
- An unknown field `freshness` → `relative`.

## Backward compatibility

- **No `storyTime`**: panel clocks, dates, battery charges and device-app
  cards fold exactly as before. `step.time` and `reportedAt` warn and are
  ignored. The only active new behavior is an
  explicit `drain` patch, a new key that earlier specs never used.
- **With `storyTime`**: existing per-panel `clock`/`date` patches still win at
  their steps (see the override order) and `charge` patches still set the value
  exactly. Automatic drift runs only between steps whose story time differs,
  so a diagram whose steps never move the clock also keeps its authored values.
  Device-app fields without `reportedAt` keep their authored `detail`.
- The compatibility feature `flow.story-time` is detected whenever a diagram
  declares `storyTime` or a battery step uses `drain`, so older renderers show
  an upgrade notice rather than silently frozen clocks. A device app that uses
  `reportedAt` or a field `freshness` declares `content.deviceapp-freshness`,
  so an older renderer asks for an upgrade instead of showing cards without
  their freshness text.

## Workbench

- **Section inspector → Story time**: Start, End, Clock (12-hour or 24-hour)
  and Date format. **Battery defaults**: drain and charge percent per hour for
  the whole diagram; empty fields read "Built-in default · 1 %/h
  (placeholder)".
- **Step inspector → Story time**: the step's `time` (relative, absolute or
  time of day) and the resolved date and time on the selected path.
- **Battery panel**: `drainPerHour` and `chargePerHour` setup fields, whose
  placeholders say whether the diagram default or the built-in placeholder
  applies;
  the step patch has **Extra drain %** (`drain`).
- **Effective state** labels derived values as *Story time* or *Story time ·
  battery drift* (plus *· built-in default rate* when a placeholder rate is in
  use).
- New battery panels start with the diagram's authored rates; new phone and
  device app panels omit the starting clock when a story time exists.
- **Device app field → Report time**: each card in *Starting state* and in a
  step's *Panel changes* has a **Report time** box (`now`, `-15m`, `06:05` or a
  date-time), a **Reported at this step** button (*Reported at story start* in
  Starting state) that sets `"now"`, and **Clear report time**. The panel's
  *fields* table has a **freshness** column (relative, absolute, off).
- **Effective state** labels a computed detail as *Story time · derived
  freshness "Updated 5 min ago"*, with the field history and the step time as
  inputs.
