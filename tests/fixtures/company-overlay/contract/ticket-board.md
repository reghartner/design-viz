### panels — company additions

- `ticket-board` — closed tickets out of a fixed total. Declaration:
  `{"id":"tickets","type":"ticket-board","title":"Tickets","total":10,"initial":{"done":0}}`.
  `total` is a positive whole number. Step patches set `done` (a whole number
  from 0 to `total`) and may add a `note`. See the
  [ticket board example](../examples/ticket-board/ticket-board.spec.json).
