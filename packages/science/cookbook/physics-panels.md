# Physics teaching panels: waves and forces

Open **Two invisible sums: waves and forces** from the workbench starters, or
open the maintained [spec](../diagrams/physics/waves-and-forces/waves-and-forces.spec.json)
directly. Its two chapters are complete teaching stories; the
[ledger](../diagrams/physics/waves-and-forces/waves-and-forces.ledger.md)
records the model assumptions, example values, and source basis.

| Panel | What the learner sees | What changes in a step |
| --- | --- | --- |
| `wavefield` | Two in-phase point sources, path lines to a probe, screen intensity curve, exact path and intensity readouts | `sources` (`one` or `two`), `probe` (signed screen y), `wavelength`, `note` |
| `forcebody` | Up to four force vectors on a puck, their resultant, acceleration, and a separately authored velocity trail | Complete `forces` list, `velocity`, `caption`, `note` |

Use `python3 tools/widget_doc.py wavefield forcebody` for the field-by-field
contract. The Workbench panel picker offers a rendered example for each type.

## Wave interference

Declare positive `wavelength`, `separation`, and `screenDistance` in the same
unit. `screenHeight` sets the probe range; `unit` labels all distances. S₁ and
S₂ are coherent and equal in amplitude. The panel calculates Euclidean path
lengths and, when both sources are on, displays
`I/I₀ = 4 cos²(π Δr/λ)` with `Δr = r₂ − r₁`. One source gives the normalized
reference `I/I₀ = 1`. The drawing intentionally omits slit-width diffraction
and geometric spreading. State that limitation in any story using the panel;
do not present its curve as a measured double-slit pattern.

The complete example uses `d = 4 cm`, `L = 10 cm`, and `λ = 1 cm`. The
first dark point is `probe: 1.284446`, where the exact geometric path
difference is approximately `0.5 cm`. At the same probe, changing
`wavelength` to `2 cm` produces `I/I₀ ≈ 2`. The alternate path closes S₂
instead and restores the one-source baseline of `1`.

Step patches are sparse: omitted fields carry forward **within the chosen
path**. Keep the same probe to compare interventions, and reset a field
explicitly when starting a new trial. The panel's snapshot and graph are
deterministic when a reader jumps backward or switches paths.

## Forces and motion

Declare `mass` in kg on each `forcebody` panel; it is fixed for that panel.
Compare two masses with two panels, as the example does for Puck A (2 kg) and
Puck B (4 kg). Each `forces` patch replaces the full list with up to four
`{label, x, y}` vectors in newtons. Positive x points right; positive y points
up. Use `forces: []` to remove all applied forces. The panel derives net force
and `a = ΣF/m` in m/s².

`velocity: {x, y}` is a separate authored snapshot in m/s. It gives the
learner a direction of motion to compare with acceleration; the panel does
not integrate acceleration, predict a trajectory, or calculate a stopping
time. In the sample, A is shown later with `velocity: {x: 2, y: 0}` and
`forces: []`; then a −4 N force points left while velocity still points
right. The caption explains that A is slowing at that instant.

## Authoring and review loop

1. Write the question each beat should answer. Change one cause at a time;
   keep the probe or velocity fixed when that is the comparison control.
2. Check every numeric caption against the panel readout. Label authored
   velocities and illustrative conditions. Keep each mass in a separate
   panel and a separate trial.
3. Validate and build the source spec, then inspect the desktop viewer at
   common desktop sizes. Review step seeking, both wave paths, text contrast,
   long captions, reduced motion, and print output.

```sh
node tools/validate.js packages/science/diagrams/physics/waves-and-forces/waves-and-forces.spec.json
python3 tools/page_build.py packages/science/diagrams/physics/waves-and-forces/waves-and-forces.spec.json
```

Edit the JSON spec, then rebuild. The adjacent HTML and manifest are generated
from it; the standalone HTML is a portable viewer. Workbench and document
editing are desktop only.
