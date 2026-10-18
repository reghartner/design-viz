# Sequence-teaching panels

Six generic panels for teaching pages about sequences, sequencing runs and
molecular biology. Every letter, position and count is authored in the spec;
the panels never read data files or compute results. Use them for classroom
stories, lab-meeting explanations and onboarding pages, and label fictional
sequences and counts as illustrative.

Open **Sequencing walkthrough** in the workbench templates
(`packages/science/starters/sequencing-walkthrough.json`) for a complete page that drives
all six panels through one story with two endings.

| Panel | Shows | Typical step patch |
| --- | --- | --- |
| `sequence` | One short DNA, RNA or protein sequence as lettered cells with a coordinate ruler, highlighted ranges (`marks`), a `cursor`, a zoom `window` and a `reveal` count for "read this far" stories | `{"marks":[{"id":"site","from":2430,"to":2431,"tone":"insert","label":"insertion site"}],"cursor":2430}` |
| `frames` | A nucleotide stretch with its three forward reading frames translated to one-letter amino acids; stop codons marked; a protein `motif` pattern (for example `RXXR`) highlighted; one `frame` emphasised | `{"frame":"1","motif":"RXXR"}` |
| `reads` | A reference row with aligned reads under it: dots for matches, letters for mismatches, `-` for gaps, wedges for insertions, a depth bar, and a `focus` read | `{"reads":[…],"inserts":[{"read":"r4","after":2430,"seq":"GGCCATTGTAAT"}],"focus":"r4"}` |
| `locus` | A linear genome or plasmid map: features on stacked rows, point `markers`, `arcs` between two positions labelled with their distance, a zoom `window` and a `highlight` | `{"markers":[{"id":"dest","at":2430,"label":"insertion site"}],"arcs":[{"id":"copy","from":2403,"to":2430}]}` |
| `funnel` | Ordered pipeline stages with the count remaining at each, retained percentage and the drop between stages; the `active` stage animates | `{"counts":{"aligned":1131900},"active":"withins"}` |
| `grid` | A small labelled value matrix coloured by a sequential or diverging scale, with significance `marks` and a row, column or cell `highlight` | `{"cells":{"treated.ua":1.6},"marks":{"treated.ua":"***"},"highlight":{"row":"treated"}}` |

Field references: `python3 tools/widget_doc.py sequence frames reads locus funnel grid`.

## Conventions

- **Coordinates are 1-based and inclusive.** `start` on `sequence`, `frames`
  and `reads` sets the coordinate of the first letter, so a window that begins
  at position 2,401 keeps genome numbering in every label.
- **Tones** name the meaning of an emphasis, not a colour: `insert`,
  `mismatch`, `motif`, `primer`, `cut`, `feature`, `good`, `bad`, `accent`,
  `neutral`. The same tone looks the same in every panel and every skin.
- **Sparse state.** `marks`, `reads`, `inserts`, `markers` and `arcs` are full
  snapshots (an array replaces the previous one; `[]` clears). `counts` on
  `funnel`, and `cells` and `marks` on `grid`, merge key by key; a `null`
  value clears one key and a `null` field clears the whole map. Alternate
  paths fold independently.
- **Frames show what is declared.** `frames` translates its own `sequence`.
  To compare an in-frame and a shifted product, declare two `frames` panels
  with the two sequences, start them hidden (`"visible": false`) and show the
  right one per step with `panelVisibility`, as the walkthrough does.
- **Keep sequences short.** Up to 240 letters for `sequence` and `reads`, 120
  for `frames`. Zoom with `window` instead of declaring a longer sequence.
- **Say what is fictional.** Put "illustrative" in the page subtitle or the
  first step and in panel notes that carry numbers.

## The walkthrough story

1. Load the reference: the plasmid map highlights gene A and marks the window.
2. The sequencer reads letters: the sequence window fills (`reveal`), the
   stage counter starts.
3. Align: five reads appear with a depth bar; the aligned count lands.
4. Find: read r4 carries twelve extra letters; the site is marked in the
   sequence window and the read view.
5. Origin: the map draws an arc from where the letters came from to where
   they landed and labels the distance; the sequence window marks both.
6. Filter: counts drop to the confident set.
7. Fork. **In-frame insert** shows the twelve-letter product in frame 1,
   still ending at the gene's own stop, then the junction-letter grid.
   **Frameshift insert** shows the thirteen-letter product with no stop left
   in frame 1, then the same grid.

Author your own story by replacing the sequences, reads and counts. Each panel
has its own rule for coordinates outside its declared span (for example,
`reads` lists a read that lies outside the reference as a row without cells);
the contract bullet printed by `python3 tools/widget_doc.py <type>` states the
rule for that panel. Run `node tools/validate.js <spec>` after editing: every
boundary decision that the validator makes is reported with its source path.
