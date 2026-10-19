# Science review: biology-teaching.spec.json

This is the stranded showcase's science and sequence-content review history.
It precedes a separate desktop visual critique that listed layout and legibility
findings. Its 0-warning validation result applies to the source runtime at
the time of that review; it does not certify the packaged export or close the
later visual findings.

Independent reviewer, 2026-10-18. I checked every heading, body text, step text, caption, note, label, table, grid and log row in all 13 sections against standard textbooks. I also checked every authored sequence by script: strandscene `lower` is the position-wise complement, mRNA matches the coding strand, codons and frames translate correctly, cut and overhang positions are right, and the read pile matches the reference and its depth counts. The review screenshots remain in the source worktree and are not part of this package.

References (the abbreviations used below):
- **Campbell**: Urry et al., *Campbell Biology*, 12th ed. (ch. 7 membranes, 8 metabolism/enzymes, 9 respiration, 10 photosynthesis, 11 cell signalling (Fig. 11.16 amplification), 12 cell cycle, 16 DNA replication, 17 gene expression, 18 lac operon, 20 biotechnology/restriction enzymes, 48 neurons).
- **Alberts**: Alberts et al., *Molecular Biology of the Cell*, 6th ed. (ch. 5 replication, 6 transcription/translation, 11 membrane transport, 12 intracellular sorting, 13 vesicular traffic, 15 signalling, 17 cell cycle).
- **Lehninger**: Nelson & Cox, *Lehninger Principles of Biochemistry*, 7th ed. (ch. 6 enzymes, kcat table 6-7; ch. 25 replication; ch. 28 lac operon).
- **OpenStax**: *OpenStax Biology 2e* (ch. 7-8 respiration and photosynthesis).
- **Purves**: Purves et al., *Neuroscience*, 6th ed. (ch. 2-4 action potential).

Verdict key: OK = matches textbook as written; FIXED = changed in the spec; LABEL = a simplification that is already labelled on the page.

## Page

| Check | Verdict | Ref |
|---|---|---|
| Description said every section has a 'what if' branch; 3 sections (transcription, secretory, pump) have none | FIXED: "most have a 'what if' branch" | n/a |

## 1. replication-fork

| Check | Verdict | Ref |
|---|---|---|
| `lower` is the complement of `sequence` (script) | OK | n/a |
| Antiparallel strands; polymerase adds only to a 3' end, so a new strand grows 5'→3' | OK | Campbell 16; Alberts 5 |
| Fork moves left, so the upper template's new strand grows toward the fork (leading) and the lower template's pieces grow away from it (lagging) | OK, geometry checked | Campbell Fig. 16.17 |
| Lagging-panel primers sit at the 5' end of each piece, and each piece grows rightward up to the previous primer | OK | Alberts 5 |
| RNA primers of about 10 nt; Okazaki pieces 100-200 nt (eukaryotes) and 1,000-2,000 nt (bacteria) | OK | Alberts 5; Campbell 16 |
| **Nick positions after primer replacement.** The step says each gap is filled by extending the 3' end of the piece behind it. That puts DNA over the old primer site, so the nicks fall at 9/10 and 16/17. The spec marked 7/8 and 14/15, which are the primer's 3' sides. | FIXED: piece and nick marks, ligate log, explanatory note | Campbell Fig. 16.16 (DNA pol I replaces primer from the adjacent 3' end); Alberts 5 |
| Ligase seals nicks; daughters are semi-conservative | OK | Campbell 16 |
| Meselson-Stahl: one intermediate band after one generation rules out the conservative model, and the second generation rules out the dispersive model | OK | Campbell Fig. 16.11 |
| Animation: the scene shows the new lower letters only where the polymerase has passed, with the parent duplex still closed ahead of the fork | OK, screenshot bio-01-lead1 | n/a |

## 2. cell-cycle-count

| Check | Verdict | Ref |
|---|---|---|
| G1: 2n = 4, one DNA molecule per chromosome; S doubles DNA to 8 but chromosomes stay 4 | OK | Campbell 12 |
| Chromosomes counted by centromeres; anaphase briefly gives 8 chromosomes and 8 DNA; daughters get 4 and 4 | OK (table checked) | Campbell 12 |
| Label "4 pairs = 4 chromosomes" was ambiguous: the text had already used "pairs" for homologous pairs | FIXED: "4 sister pairs" | n/a |
| G2/M checkpoint checks for complete replication and DNA damage | OK | Campbell 12; Alberts 17 |
| "a daughter never receives a half-copied chromosome" overstated what a checkpoint guarantees | FIXED: "normally no daughter receives..." | Alberts 17 |
| Table cell "2 (one unfinished)" | FIXED: "2 (one still partial)" | n/a |
| No spindle drawn, nucleus kept through mitosis, pills instead of X shapes | LABEL | n/a |

## 3. transcription-copy

| Check | Verdict | Ref |
|---|---|---|
| `lower` is the complement; mRNA equals the coding strand at letters 9-38 with U for T; AUG at 4-6 and UGA at 25-27 match DNA 12-14 and 33-35 (script) | OK | n/a |
| Template is read 3'→5' and RNA grows 5'→3'; RNA-DNA hybrid of about 8 nt in the bubble | OK | Alberts 6 (~8-9 bp hybrid) |
| Helper proteins (sigma factor or transcription factors) are noted as not drawn; splicing, cap and tail are omitted and labelled | LABEL | Campbell 17 |
| One gene is copied by many polymerases | OK | Campbell 17 |

## 4. translation-codons

| Check | Verdict | Ref |
|---|---|---|
| 64 codons: 61 code for amino acids and 3 are stops | OK | Campbell Fig. 17.6 |
| AUG GCC AUU GUA AUG GGC CGC UGA translates to Met-Ala-Ile-Val-Met-Gly-Arg-stop; the +1 frame gives UGG CCA UUG UAA = Trp-Pro-Leu-stop (script) | OK | Campbell Fig. 17.6 |
| Anticodon for GCC is 3'-CGG-5'; the peptide is transferred to the A-site tRNA; translocation is 3 nt; the chain grows from the N-terminus | OK | Campbell 17; Alberts 6 |
| Eukaryotic scanning to the first AUG | OK | Alberts 6 |
| Rate of 2-20 aa/s (eukaryotes to bacteria); release factor is a tRNA-shaped protein | OK | Alberts 6 |
| Note called the 24-letter mRNA "the copy made in the transcription section", but that copy has 30 letters | FIXED: now "the AUG-to-UGA stretch" of that mRNA | n/a |

## 5. secretory-pathway

| Check | Verdict | Ref |
|---|---|---|
| Route nucleus → cytosol → SRP → rough ER → Golgi → secretory vesicle → exocytosis; signal sequence cleaved; chaperones and glycosylation in the ER; SRP recycled; motor-driven vesicle transport; regulated secretion of insulin | OK | Campbell 6-7; Alberts 12-13 |
| "Proteins are never made inside the nucleus" was absolute | FIXED: "Translation happens in the cytosol, not in the nucleus" | Campbell 17 |
| "One route, used by every protein the cell exports" overstated: unconventional secretion exists | FIXED: "the standard route for proteins a cell secretes", with a note that a few proteins use other routes | Alberts 13 |

## 6. gene-switch (lac operon)

| Check | Verdict | Ref |
|---|---|---|
| `lower` is the complement; mRNA from letter 18 equals the coding strand; lacZ ATG at 20-22 (script); "ATGACCATG" is the real lacZ start | OK | n/a |
| Allolactose (not lactose) is the inducer; basal permease and β-galactosidase; tetrameric repressor; polycistronic lacZYA mRNA of about 5 kb; coupled transcription-translation; bacterial mRNA lasts minutes | OK | Campbell 18; Lehninger 28 |
| "The polymerase cannot get past the protein": textbooks describe the block either as stopping polymerase binding or as stopping initiation | FIXED: text and caption now say the repressor stops transcription starting; a note names both textbook descriptions | Campbell 18; Lehninger 28 |
| Labels "no mRNA is made" and "mRNA stays at zero" contradicted the step's own point that a rare transcript slips through | FIXED: "almost no mRNA" | Campbell 18 |
| CAP/glucose control omitted; illustrative promoter and operator sequence | LABEL | n/a |

## 7. enzyme-turnover

| Check | Verdict | Ref |
|---|---|---|
| E+S → ES → EP → E+P; the enzyme is unchanged and reused; it lowers activation energy without changing the direction of the reaction; induced fit noted as not drawn | OK | Campbell 8 |
| Temperature optimum near 37 °C for human enzymes; denaturation unfolds the protein without breaking the peptide chain and is usually irreversible | OK; grid values LABEL as illustrative | Campbell 8 |
| Turnover "about one to hundreds of thousands per second" understated the upper range | FIXED: "less than one to millions" | Lehninger table 6-7 (kcat 0.5 to 4×10⁷ s⁻¹) |
| Product release explained as "no longer fits the active site as well" was not a textbook statement | FIXED: "held only weakly ... soon drifts away" | Campbell 8 |

## 8. membrane-pump

| Check | Verdict | Ref |
|---|---|---|
| Na⁺ ~145 mM outside (about 10×) and K⁺ ~140 mM inside (about 30×) | OK | Alberts 11 table 11-1 |
| Cycle: 3 Na⁺ bind inside, phosphorylation from ATP, flip outward, low Na⁺ affinity, 2 K⁺ bind, dephosphorylation, flip inward; net one + charge out per cycle | OK | Campbell Fig. 7.15; Alberts 11 |
| Ion-count bookkeeping in the scene (14→17→20 Na⁺ out; 14→16→18 K⁺ in) matches the ledger | OK (checked) | n/a |
| K⁺ leak sets most of the resting potential and the pump adds a few mV; the pump uses about a third of a cell's ATP | OK | Alberts 11 |

## 9. nerve-impulse

| Check | Verdict | Ref |
|---|---|---|
| Rest −70, threshold −55, peak about +30, undershoot about −80; Na⁺ in, then Na⁺ inactivation and K⁺ out repolarise (not the pump); refractory period makes conduction one-way; all-or-none; frequency coding; 1-2 ms | OK | Campbell 48; Purves 2-4 |
| Weak-stimulus step showed phase "THRESHOLD" while the voltage stayed below threshold | FIXED: added and used state "BELOW THRESHOLD" | n/a |
| Caption "Na⁺ channels stay shut" contradicted "too few Na⁺ channels open" | FIXED: "most Na⁺ channels stay shut" | Purves 3 |
| "The patch behind" was ambiguous, because the phase panel calls it "this patch" | FIXED: "This patch, now behind the impulse" | n/a |
| Caption "only a tiny fraction of it crosses" was unclear | FIXED: "yet only a tiny fraction of the ions cross" | Purves 2 |

## 10. signal-cascade

| Check | Verdict | Ref |
|---|---|---|
| Amplification tiers 10⁰, 10², 10², 10⁴, 10⁴, 10⁵, 10⁶, 10⁸ | OK | Campbell Fig. 11.16 |
| Heading "a thousand answers" and text "millions of glucose units" disagreed with the page's own 10⁸ figure | FIXED: heading "One knock, a hundred million answers"; text "about a hundred million (textbook estimate)" | Campbell Fig. 11.16 |
| GPCR → G protein GDP/GTP swap → adenylyl cyclase → cAMP → PKA → phosphorylase kinase → glycogen phosphorylase → glucose-1-phosphate; switch-off by GTPase, phosphodiesterase and phosphatases | OK | Campbell 11; Alberts 15 |
| Cortisol: a steroid crosses the membrane, its receptor is cytoplasmic, the complex moves to the nucleus and changes transcription over minutes to hours | OK | Campbell 11 |
| "true only for this class of signal" was too absolute (thyroid hormone also uses an intracellular receptor) | FIXED: "something a surface signal like adrenaline never does" | Campbell 11 |
| The text said new mRNA "leaves" the nucleus, but the dots stay in it | FIXED: "is made; it will leave the nucleus" | n/a |

## 11. carbon-loop

| Check | Verdict | Ref |
|---|---|---|
| 6 CO₂ + 12 H₂O → glucose + 6 O₂ + 6 H₂O; O₂ comes from water (isotope experiments); rubisco fixes CO₂ onto RuBP; the G3P product is shown as glucose (labelled) | OK | Campbell 10; OpenStax 8 |
| Heading "A tree is built from air" left out the H from water, about 6% of dry mass | FIXED: "built mostly from air" | OpenStax 8; Campbell 10 |
| Dry mass shares: C ~45%, O ~45%, H ~6%, minerals ~4% | OK (approx., labelled) | Carbon TIME (MSU); Epstein & Bloom plant nutrition |
| Glycolysis gives net 2 ATP; 6 CO₂ from the link reaction and Krebs cycle; O₂ is the final electron acceptor; about 30-32 ATP | OK | Campbell 9 |
| "12 H₂O" at the chain is correct, but the net equation gives 6 | FIXED: ledger note explains 12 formed and 6 used, net 6 | Campbell 9 |
| At night the Calvin cycle stops, respiration continues and the leaf is a net CO₂ source | OK | Campbell 10 |

## 12. restriction-defence

| Check | Verdict | Ref |
|---|---|---|
| `lower` is the complement; GAATTC at 9-14 is a palindrome; the lower overhang (10-13) reads AATT 5'→3' (script) | OK | n/a |
| G^AATTC cut gives 4-nt 5' AATT overhangs; a 6-bp site occurs about every 4,096 bp; the enzyme is a homodimer; methylation at the second A (N6-methyladenine) blocks cutting; maintenance after replication | OK | Campbell 20; Alberts 8 |
| The lower cut position was written "after letter 13" while the text claimed "in its own direction" (which would be after 14) | FIXED: "between letters 14 and 13, just after G in its own 5'→3' direction"; caption and log now give 9/10 and 13/14 | n/a |
| "the middle A" is imprecise for GAATTC | FIXED: "the second A, counting from its 5' end" | Campbell 20 |
| "cannot grip it, so it never cuts" | FIXED: "cannot grip it tightly, so it does not cut" | n/a |
| Animation: the overhangs step draws piece A with lower TTAA and piece B with upper AATT | OK, screenshot bio-review-restriction-defence-overhangs | n/a |

## 13. sequencing-run

| Check | Verdict | Ref |
|---|---|---|
| `lower` is the complement; the called read GATTACAGGCTTACGA equals the new strand built right to left from the primer; cycle 1 G pairs with template C (script) | OK | n/a |
| Reversible-terminator chemistry (one tagged, blocked nucleotide per cycle, image, unblock); clusters; phasing raises errors late in a read | OK | Alberts 8 (DNA sequencing) |
| Read pile: every read matches the reference except G→A at 12,415 (reads 2 and 4) and C→T at 12,419 (read 2's last letter); depth is 5 and 4 at those sites (script) | OK | n/a |
| "A split ... means the two copies differ" overclaimed from 5 reads | FIXED: "is the sign that"; added that real calls use many more reads | n/a |
| ~30× coverage for real studies; "no confident call" at depth 2 | OK | n/a |

## Not changed (accepted simplifications, labelled on the page)

Flat duplexes, cartoon cells, one enzyme or polymerase standing for many, authored rather than simulated motion, illustrative sequences, and the dark strandscene/cellscene frame.

Validation in the source worktree after those edits: 0 errors and 0 warnings. Revalidate `packages/science/diagrams/biology/cell-journey/biology-teaching.spec.json` with the selected science runtime after panel integration, and generate its HTML export from that same runtime.
