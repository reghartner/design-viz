- questions | -2 | candidate/questions.md | Eight questions were asked, exceeding the limit of seven.
- questions | -1 | question 4 | The design already specifies both the happy and Wi-Fi-down endings.
- level | -2 | device-shadow → Kestrel app | Engineering view omits the design’s app-read service hop.
- edges | -2 | bedtime | Caption claims the device page reads the new state, but no device-shadow → app hop is lit.
- edges | -2 | raccoon | Caption claims a scheduled 1:00 AM heartbeat report whose hops are not lit.
- edges | -2 | hb-low | Caption claims the device page receives the 20% state, but its read hop is absent.
- edges | -2 | sunrise | Caption claims a scheduled 6:30 AM heartbeat report with no corresponding lit hops.
- edges | -2 | hb-charging | Caption claims the device page receives charging state, but its read hop is absent.
- edges | -2 | courier | Caption claims the 8:00 AM heartbeat report, but that report’s complete hops are not lit.
- edges | -2 | b-courier | Caption claims the 8:00 AM heartbeat report with no corresponding successful hops.
- backstage | -1 | node ingest | Binding selects `postEvent`, but heartbeat steps call `postHeartbeat`.
- backstage | -1 | node shadow / app source | Binding selects `putState`, while the depicted app read calls `getState`.

```json
{"questions":7,"level":8,"time":20,"edges":1,"panels":15,"backstage":13,"fidelity":15,"total":79}
```