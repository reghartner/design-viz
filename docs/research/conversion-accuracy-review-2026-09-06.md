# Verified accuracy-review aggregate — 12 HLD→page conversions (2026-09-06)
Raw reviewer majors 124 → verified: CONFIRMED 87, REFUTED 35, SCOPING 2.
Blame: PLAN-fault 79 (deviation already in HLD's own visualization-plan section), PAGE-fault 8 (3 of those = engine spec-limits, not agent error).
## Confirmed deviation classes, by frequency
1. WIRE-CONTRACT CARDS NEVER PLANNED (~15 findings, 10/12 families): HLD §5 field tables have no contract card in spec; vocabulary supports it; runbook only required "where the plan says so".
2. FAILURE MODES (§6) UNPLANNED + UNDECLARED (~12 findings, 10/12 families): plans map 1:1 onto happy-path flows; only sentry-panel had scope prose (and it worked — reviewer scored it SCOPING).
3. PANEL STATE AHEAD OF/BEHIND NARRATIVE (~8): CONFIRMING before event arrives; READY one step early; FENCED while BOOTING; viewfinder live weeks later; soc trend idle while draining. No rule constrains patches on NON-computed widgets to narrative moment.
4. INVENTED NUMBERS (~7): waterfall spans fabricated when HLD gives only totals (widget REQUIRES per-span ms); "8 Mbps"; "600 Wh"; seq 5210; INC-7742; extra runtime datapoints.
5. DROPPED NAMED SERVICES (~8): Sluice, Muster, Homestead, Atrium(node), Molt, Beacon-signaling — omitted from plan node tables.
6. ENGINE LIMITS (5): second edge between same node pair unaddressable (step edge refs are "from->to" keys); screen has no playback mode.
7. PAGE-PROSE FREELANCING (4): bullets written beyond plan contradict HLD or own diagram (Stitcher/Vaultd actor swap; 11s vs 24s; retries-payer inversion).
8. UNIT/INDEX SLIPS (3): "oldest hour" vs 30-min segment; 0- vs 1-based segment id; 456 segments compressed to 24 with only capacity-string hint.
9. BUFFER SEMANTICS (3): mark painted past head; available "dropped" state never used for overwrite; declared thresholds never exercised by any step.
## Refutation lessons (35 false majors)
- Step TEXT + bullets + panel notes legitimately carry story beats; a missing arrow is usually a rendering choice, not lost narrative.
- First-edge-reuse hygiene rule forces later same-edge beats into text — correct, not omission.
- Plan-declared numbers (waterfalls) are authorized even when narrative silent — reviewers must check §7 declarations.
- Relay hops (path->sgate) are not substituted actors.
