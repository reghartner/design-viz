### panels — physics package

- `wavefield` — an ideal two-source interference diagram with exact source-to-probe
  paths and a shared screen-intensity graph. Declare required `wavelength`,
  `separation` and `screenDistance`, each a finite distance from 0.000001 to
  1000000, all in the same unit. Optional `screenHeight` has the same range
  and defaults to `max(2 * separation, screenDistance)`; `unit` is display text
  (default `"cm"`), with no unit conversion. For example:
  `{"id":"waves","type":"wavefield","wavelength":1,"separation":4,
  "screenDistance":10,"screenHeight":12,"unit":"cm",
  "initial":{"sources":"two","probe":0}}`.
  Starting state and sparse step patches accept `sources:"one"|"two"`
  (default `"two"`; one means S1 alone with S2 off), `probe` (finite signed
  screen coordinate within ±`screenHeight/2`, default 0), `wavelength`
  (same range as the declaration, an explicit new trial), and `note` (text;
  `""` clears it). All four support step `enterOnce`; omission inherits and
  invalid values warn and are ignored. Geometry fields other than wavelength
  belong to the declaration, not the state patch. Source coordinates are
  `(0,+d/2)` and `(0,-d/2)`, with the screen at `x=L` and positive probe y up.
  Path lengths are `r1=hypot(L,y-d/2)` and `r2=hypot(L,y+d/2)`;
  `Δr=r2-r1`, calculated as `2*y*d/(r1+r2)` for numerical stability.
  With two sources, `I/I₀=4*cos²(π*Δr/λ)`; with S1 alone, `I/I₀=1` and
  the second path and path difference are absent. The graph uses the same
  0–4 intensity scale for both cases. The model assumes equal, in-phase
  coherent point sources with constant amplitude at the screen; it omits
  diffraction envelopes and geometric spreading. Displayed wavefront rings
  may skip wavelengths, explicitly labeled, and dense fringe graphs carry a
  sampling notice while the probe readout is calculated directly. No clock
  or random sampling advances the state. Invalid required geometry shows a
  declaration prompt. `wavefieldModel(panel,state)` returns geometry, sampled
  graph points and probe readouts; `wavefieldHTML(panel,state)` returns settled
  markup. See [Waves & forces](cookbook/physics-panels.md). Desktop-only editing.
- `forcebody` — a force diagram with a puck, up to four applied vectors,
  resultant force and `a=ΣF/m`. Declare required `mass` from 0.000001 to
  1000000 kg; optional `label` (default `"Puck"`) and `trial` (default
  `"Force snapshot"`) are text. Mass is fixed for the declared trial; compare
  different masses with separately labeled panels. For example:
  `{"id":"puck","type":"forcebody","mass":2,"trial":"Trial A",
  "initial":{"forces":[{"label":"Push","x":4,"y":0}],
  "velocity":{"x":2,"y":0}}}`.
  Starting state and sparse step patches accept `forces`, `velocity`,
  `caption` and `note`; all support step `enterOnce`. `forces` is a complete
  replacement list of 0–4 `{x,y,label?}` objects, in N, with +x right and +y up.
  Each component must be finite and within ±1000000. Missing force labels
  become `"Force 1"`, `"Force 2"`, etc.; `[]` or null clears the list. An
  invalid entry or oversized list rejects the entire replacement, retaining
  the earlier forces. `velocity` is a complete `{x,y}` snapshot in m/s with
  the same component bounds; null means unspecified. It is independently
  authored, never integrated from force or time. `caption` and `note` are
  text or null; omission inherits. Unknown fields, including state `mass`,
  warn and are ignored. The resultant is the component sum and acceleration
  is that vector divided by the declared mass; invalid mass leaves
  acceleration unavailable. Force arrows share one scale per snapshot;
  the dashed velocity arrow and trail show direction schematically. With
  authored velocity, the dot product of force and velocity distinguishes
  speeding up, slowing down and turning at that instant; zero force means
  no acceleration, and zero velocity means rest in that snapshot. This is
  not a trajectory prediction. `forcebodyModel(panel,state)` exposes the
  net vector, acceleration, velocity and relation; `forcebodyHTML` renders
  the settled snapshot. See [Waves & forces](cookbook/physics-panels.md).
  Desktop-only editing.
