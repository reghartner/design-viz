# Self-audit: re-read the built spec against the worksheet

A clean build means valid JSON. This audit checks that the spec tells the
story the worksheet planned. Do it after every build that changes steps,
panels or paths. Record the result as a short `## Self-audit` section at the
end of the ledger: the date, what you checked, what you fixed.

## 1. Walk the spec

```sh
python3 <VIZ>/.claude/skills/hld-to-page/scripts/spec_walk.py <stamped.spec.json> \
  --catalog <catalog.json> --rate batt=-1:4 --rate app.battery=-1:4 --state
```

`--catalog` is the supplied catalog snapshot. Give one `--rate
<panel>[.<field>]=<min>:<max>` (change per hour, from the source) for each
battery panel, thermo panel and numeric device-app card. `--state` prints the
full visible state of every panel after each step (`*` marks panels that
changed).

(The script is in this skill's `scripts/` folder; use its actual location if
the skill is installed elsewhere.) For every path it prints one line per step:

```
  step           clock     edges                                        panels       icons / code
  remind         6:20 PM   cloud->notify, notify->app                   .P.          code:door-service.reminder
```

`panels` has one letter per declared panel, in declaration order: `P` =
patched at this step, `.` = holds. After each path it lists every numeric change with its elapsed time and rate
per hour. The script needs Node: it folds each path with the engine's own
code (`scripts/fold_states.cjs`), so `--state` shows what the viewer shows.
Pass `--viz <VIZ>` if the skill is installed outside VIZ.

Output lines have three levels:
- `WARN` (provable error): a clock or step time that goes backward, or a
  step time the engine rejects; a number outside a `--rate` range you gave
  (a battery step's own extra `drain` is left out of the rate), or a battery that never changes while such a rate
  excludes zero; a codeRef on steps but not on its node, or without a full
  immutable commit SHA (40 to 64 hex characters) or distinct anchors; a
  binding with no `entityRef`; with `--catalog`, an `entityRef` or API
  operation that the catalog does not list; a failed `--expect`; a validator
  error.
- `CHECK` (re-read; the spec alone cannot decide it): with `storyTime`, a
  panel clock or date that differs from the story time (an explicit value
  pins it: drop it) and a battery drifting on a built-in placeholder rate
  (label it illustrative); without `storyTime`, one clock-bearing panel
  that stays put while another advances; a number that changes while the
  displayed minute stays the same; freshness text that may no longer be true
  ("just now" unchanged for 15 minutes or more, "3 h ago" unchanged for two
  hours or more); a value that changes while its detail text stays the same;
  a device-app battery card that differs from a battery panel; a device that
  sends through a declared router or bridge and also directly past it in the
  same step; a step codeRef whose owning node that step does not touch;
  `static-noise` used as a live or recording scene; at a screen change to or
  from `unavailable`/`boot`, or a card turning `stale`/`error`, a card whose
  state text ("Online", "Paused", "Shutdown") is carried unchanged; a caption with a clear
  send verb ("sends", "posts", "uploads") on a step with no lit edge; no clock
  on any clock-bearing panel (without `storyTime`); battery charge that rises while the trend is not
  charging; a battery unchanged for two hours or more; a device-app value or
  "just now" detail that changes on a step that delivers no edge (correct for
  an unshown scheduled report the source says succeeds: label it illustrative
  and name its time); a response edge labeled like an acknowledgement ("200",
  "202", "ack"): keep it only if the source or code shows that response.
- `NOTE` (information): codeRefs on a node but on no step (correct when that
  code never runs in the story); catalog services not bound; more than one
  diagram on the page.

`--expect '<path|*>/<step>:<panel>.<key>[.<sub>]=<value>'` checks one folded
value, for example an operator anchor: `--expect '*/lowbatt:batt.charge=20'`.
Fix every `WARN`, or correct a wrong `--rate`/`--expect` you passed: a `WARN`
is a provable error. A `CHECK` is a prompt to re-read the worksheet; fix it
or write the reason it is correct.

The script cannot check anchors or cadence. By hand: every operator-given
time is an absolute step `time` and every given value a `charge` (or card)
patch at its step; every report step sits on the source's cadence; every
battery rate matches section D's header and its source or `illus` label.

## 2. Transition check

In the `--state` output, find every step where a state changed (paused,
shut down, offline, booting, back online, low, charging, cleared). For each,
read every panel line and ask: does anything still show the old state? Look
at banners and their `visible` flag, screen `mode` and `reason`, card
`value`/`status`/`detail`, icons, and Home device states. Also check the
caption's hops: for each message the caption describes, is its edge in this
step's edge list, starting from the device that sent it?

## 3. Compare with the worksheet, section by section

Go path by path, step by step. For each mismatch, fix the spec or the
worksheet, and write down which.

| Worksheet | Check in the spec |
|---|---|
| C. Paths | Same path IDs, same step order, same endings. |
| D. Time table | `storyTime` and battery rates match the header; the walk's clock column matches the Story time column, never backward; no panel `clock`/`date` patches; `detail` freshness text matches the elapsed time and the report cadence; battery `trend`, extra `drain` and `charge` anchors sit at their steps, every rate in the walk's numeric list is within the source's rate, and each reported battery card shows the value the walk printed for the report time; temperatures match; the camera scene / `timeOfDay` match day or night. |
| E. Edges line | `step.edges` contains exactly the listed hops, including every evidenced response (`ret` edge; none without evidence) and every fan-out and relay hop. Failures match. |
| E. Panel lines | `P` in the walk output exactly where the matrix says `patch:`; `.` exactly where it says `holds:`. Open the patch and confirm the values. |
| E. Tones | `step.tone` matches, and carried tones are cleared where the source says recovery. |
| F. Coverage grid | Same P/H pattern as the walk output. |
| G. Icon plan | Every "set at" step has the icon patch; every "clears at" step has its exact Restore value (`icon: null` only for the declared default, otherwise the earlier icon); no icon depends on a value to change. |
| H. Bindings and code | Every row with an entityRef is a `binding` with fields copied from the catalog; codeRefs on the listed nodes and steps, full immutable commit SHA (40 to 64 hex characters), anchors unique in the file (check with `grep -cF`). Unbound services appear in the ledger. |
| I. Expectations | Each statement is true in the folded state at that step, on every path it applies to. |

## 4. Reverse audit

Walk the spec, not the source. For every edge kind, node tone, notification,
device-app value, Home signal and subject position, icon, number, link,
binding and codeRef, find its ledger row or its `illus` label. Anything without
one is either a missing ledger row or an unsupported claim; fix it.

## 5. Look at the page

Open the built HTML in a browser (desktop width, and the host width if known).
For each actual authored view, compare the rendered result with its visual
brief at the focal step/state, then step through every path from the first
step and switch from one ending to another. Check:
- the intended audience can find the focal source-backed evidence in the
  planned reading order without required evidence being hidden or crowded out;
- the panel you named as Focus actually changes visibly at that step;
- clocks, dates and freshness texts read correctly on screen;
- icons changed and changed back where planned;
- nothing contradicts the caption (a carried red tone, "no notifications",
  "Updated just now" hours later, a subject in the wrong room);
- labels are readable and not clipped, and panels or controls do not obscure
  the graph or the focal evidence;
- illustrative staging does not imply an unsupported UI action, system
  mechanism or meaningful physical relationship.

If browser tools are not available, say which of these checks were not done.
Never claim a visual check from reading JSON.

## 6. Fix, rebuild, re-walk

After fixes, re-stamp the spec, rebuild from the stamped output (zero
errors, zero warnings), and re-run the walk for the affected paths.
