# Focused guidance v1 research snapshot

This preserves the exact tested v1 source. The trial reduced mean peak context by 14.49%, with correctness +1.3125/100 and presentation +0.625/25 relative to its control. It missed the predeclared 20% context target. These files are research artifacts; the current product does not load them.

`receipt.json` pins the base commit, original frozen-kit and manifest hashes, both patch hashes, and all 11 treatment source hashes. Reconstruction was checked in a temporary checkout. Raw runs and generated artifacts remain in the local experiment archive; this is a source snapshot, not a complete benchmark distribution.

To inspect it, create a separate checkout at `711c89ba38d7fbdd5935b65676218bde1f448ee4`. Apply `01-corrected-baseline.patch` followed by `02-focused-guidance-v1.patch`, using absolute paths to these archived patches. The first reconstructs the corrected control; the second contains only the v1 treatment. Do not apply them to a current product checkout. Compare the resulting files to `focusedTargetSha256` in the receipt.

The dated parent `experiment-status.json` records decisions and comparison limits. Later v2 and composition-cue treatments are excluded.
