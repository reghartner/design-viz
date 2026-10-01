# Compare messaging costs

Use the **Messaging cost comparison** panel to compare two delivery architectures
at the same workload. The [complete example](../src/starters/messaging-cost.json)
follows a managed event bus and a queue with a relay. Both deliver to the same
consumer. Choose a path, then advance from 1M to 10M and 100M monthly messages.
It is also a built-in **Messaging cost tradeoffs** workbench template.

Large stacked bars compare both totals from zero on the same scale. Each
engineering component has a matching color in the bar and its route below;
hatched segments are fixed infrastructure charges. The dotted gap shows the
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

Declare exactly two `routes`, baseline first. For each route, declare `items`
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
