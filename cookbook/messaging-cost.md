# Break down an operation or compare costs

Use the **Cost breakdown / comparison** panel (`type:"cost"`) for 1–6 entries.
The picker starts with one operation and visible component amounts and percentage
shares. Exactly two entries retain baseline/alternative differences, percentages,
break-even volume and the chart gap. Three to six entries show independent totals
and component breakdowns on a shared scale.

## One operation

The [runnable operation example](../src/starters/operation-cost.json) allocates
USD 0.06 to compute, USD 0.01 to storage and USD 0.03 to an external API. Its total
is USD 0.10, with visible shares of 60%, 10% and 30%, including in Compact view.
Use `initial:{messages:1}`, `unit:"operation"`, `period:"per operation"`, one
`routes` entry and one `items` line per component. Set each `perMillion:0` and
`fixed` to its actual amount for that operation. Fixed means per authored period;
it is added once and does not multiply with volume. A zero or unpriced total
has no percentage shares. Rates and exclusions remain in the disclosure.

`unit` is an optional display label, defaulting to `messages`. The stored volume
field remains `messages`, and rates remain per million of the authored units.
Changing the label never converts a rate. For volume-dependent operation costs,
enter the appropriate per-million rate and set `fixed:0` or omit it.

```sh
python3 tools/build.py
node tools/validate.js src/starters/operation-cost.json
python3 tools/inject.py src/starters/operation-cost.json template/flowview.html /tmp/operation-cost.html
```

## Messaging comparison

Use two entries to compare delivery architectures
at the same workload. The [complete example](../src/starters/messaging-cost.json)
follows a managed event bus and a queue with a relay. Both deliver to the same
consumer. Choose a path, then advance from 1M to 10M and 100M monthly messages.
It is also a built-in **Messaging cost tradeoffs** workbench template.
Switch between **Architecture & cost** for a wide chart and **Compact comparison**
for a narrow cost sidebar beside the same diagram and timeline. The starter uses
Auto density, so resizing the panel changes the chart orientation automatically.

Large stacked bars compare both totals from zero on the same scale. Each
engineering component has a matching color in the bar and its route below;
hatched segments are fixed charges. The dotted gap shows the
cost difference. Panels up to 520 px wide automatically use compact horizontal
bars, retaining the shared scale, component colors and cost difference in about
300 px of height. **Display density** in the panel inspector offers **Auto**,
**Compact** and **Expanded**; set `density:"compact"` to use the small layout at
any width, or `density:"expanded"` to keep the tall chart. This setting is saved
in the declaration and supports Undo/Redo. Expand
**Rates, assumptions & tradeoffs** for individual rates and exclusions.

The rates are fictional, explicitly labeled, and deliberately show a crossover:
at 1M, the bus costs USD 3.20 and the queue route USD 13.40. At 10M they cost
USD 32 and USD 26. The queue's USD 12 fixed relay charge remains even at zero
traffic. The linear estimates meet at approximately 6,666,667 messages/month.
The queue route has an extra engineering node and operational responsibilities;
the displayed savings exclude engineering labor.

Declare 1–6 unique `routes` and 1–24 total `items` (at least one per entry).
For two routes, put the baseline first. Remove an entry’s items when removing
the entry. For each route, declare `items`
in delivery order with its `route` id, `label`, optional engineering `node`,
explicit `perMillion` rate and optional `fixed` charge (default zero).
An explicit zero includes a shared or uncharged component without inventing a
cost. Multiple charge lines may reference one node; the node count is unique.
Node rename, deletion and cross-diagram paste use normal reference handling;
removing a link does not remove the cost line.

The calculation for each line is:

```
line total = messages / 1,000,000 × perMillion + fixed
route total = sum of its line totals
difference = alternative total − baseline total
```

`perMillion` is an aggregate rate per million **delivered messages**, not a raw
provider request price. Account for send, receive, delete, retries, fan-out,
batching and payload billing units before entering it. Give both routes one
currency and comparison period. State region, rate date, payload, delivery
semantics and exclusions in `assumptions`. The renderer does not fetch prices,
convert currencies, infer billing rules or establish delivery equivalence.
Use separate scenarios for tiered pricing; the crossover assumes constant rates.

Starting `messages` defaults to 1,000,000; zero keeps fixed charges. Set
`messages` on a step to compare a new volume, `activeRoute` to highlight the
route being explained, and `note` to explain the result. A shared opening step
should set `activeRoute:null`. Highlighting is authored in step patches,
independent of path names, and never changes either estimate. Sparse state,
alternate resets and `enterOnce` use normal panel behavior.

Malformed, duplicate or over-limit declarations suppress all totals.
Missing/invalid rates show **Unpriced** and suppress a savings claim. A zero
baseline shows the absolute difference without a percentage. Negative prices,
credits, tiered tariffs and currency conversion are outside this linear model.

Build and view:

```
python3 tools/build.py
node tools/validate.js src/starters/messaging-cost.json
python3 tools/inject.py src/starters/messaging-cost.json template/flowview.html /tmp/messaging-cost.html
```

Focused checks: `node --test tests/cost-panel.test.js`.
