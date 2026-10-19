### panels — science package

- `nspstory` — purpose-built animated lessons for the Bianco et al. NSP15
  preprint. Declare `scene` as `reporter`, `dilution`, `origin`, or `evidence`.
  State accepts `phase` (integer 0–3, default 0) and `caption` (text or null).
  Sparse patches carry; `enterOnce` accepts the same fields. Invalid fields
  warn and are ignored. Four authored phases explain each lesson, with finite
  CSS motion and complete still endpoints for reduced motion and print.
  Evidence rates are specific to the paper's HCoV-OC43 comparison; source
  transfer is explicitly proposed and the incorporation mechanism unresolved.
  No sequence, experimental parameters, probability, or molecular timescale
  is modeled. See [NSP15 story](cookbook/nsp15-story.md). Desktop-only editing.

- `rnacopy` — a sequence-free conceptual RNA-copying close-up with an unlabeled
  input ribbon, polymerase glyph and emerging copy. Optional declaration
  `label` is text (default `"RNA copying"`). For example:
  `{"id":"copy","type":"rnacopy","label":"Conceptual copying",
  "initial":{"status":"copying","position":0.5,"progress":0.4,"copies":0}}`.
  Starting state and sparse step patches accept `status` (`ready`, `copying`,
  `paused`, `interrupted` or `complete`; default `ready`), `position` (finite
  authored fraction 0–1 along the input, default 0.25), `progress` (finite
  authored copy-extent fraction 0–1, default 0), `copies` (authored integer
  0–12, default 0), and `caption`/`note` (text or null). Omission inherits;
  invalid fields warn and are ignored. Null clears prose only. All six fields
  support step `enterOnce`; nested `enterOnce` is unsupported. The three
  numerical values and status are independent: complete never increments
  copies, paused never changes position, and no relationship is inferred
  between position and extent. Zero extent hides the emerging ribbon. The
  same 560×315 composition is used for baseline, paused and hypothetical
  interruption paths; status text and symbols distinguish states without
  relying on color. Accessible text identifies position, extent and count
  as authored. `rnacopyModel(panel,state)` resolves scene geometry and
  `rnacopyHTML(panel,state)` renders a static settled snapshot; seeking,
  reduced motion and playback use the same state. No sequences, kinetics,
  timescale, organism-specific mechanism or efficacy prediction is modeled.
  See [The copy gate](cookbook/viral-copy-gate.md). Desktop-only editing.

- `sequence` — sequence track: one short nucleotide or protein sequence as a
  row of monospace letters with a coordinate ruler, highlighted ranges, an
  optional cursor, a zoom window and a reveal boundary, for teaching "where is
  this feature, on which strand, at what coordinate":
  `{"id":"ref","type":"sequence","label":"Reference","alphabet":"dna",
  "sequence":"ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG","start":1,"strand":"+",
  "wrap":60,"initial":{"marks":[{"id":"start","from":1,"to":3,"tone":"good",
  "label":"Start codon"}]}}`. Declare `sequence` (string, 1–240 letters after
  whitespace removal, upper-cased; empty or non-string warns and the panel
  renders empty; more than 240 warns and renders the first 240; letters
  outside the alphabet warn and render as unknown), `alphabet` (`dna` ACGTN
  default, `rna` ACGUN or `protein` one-letter amino acids plus `X` and `*`;
  anything else warns and uses dna), `start` (1-based coordinate of the first
  letter, safe integer ≥ 1, default 1; marks, cursor and window use these
  coordinates), `strand` (`"+"` default or `"-"`, a label only — nothing is
  recomputed), optional `label` text, `wrap` (letters per row, 20–120, default
  60) and `initial`. State fields (sparse, carried, `null` clears): `marks` —
  full snapshot array of up to 24 `{id,from,to,tone?,label?}` with 1-based
  inclusive coordinates; ranges are clipped to the declared span; a range
  entirely outside it, a `from` > `to`, a non-position `from`/`to`, a missing
  or duplicate id, an unknown tone (`neutral accent insert mismatch motif
  primer cut feature good bad`, default neutral) or a non-text label warns by
  exact path (`….marks[2].from`); overlapping marks are allowed and later marks
  draw on top; labelled marks list in a legend under the letters. `cursor` —
  one coordinate within the span, drawn as a bracket under that letter with
  its number; it glides between letters of the same row (no motion under
  reduced motion); `null` hides it. `window` — `{from,to}` zoom: only those
  coordinates render, with a "… n more" cue at each end; `null` shows all.
  `reveal` — integer 0–length: letters beyond it render dimmed ("the
  sequencer has read this far"); omit or `null` reveals all. `note`. Unknown
  state fields warn and are ignored; an invalid step value is ignored and the
  carried value stays. `enterOnce` follows normal panel state. Letters are
  coloured per residue (A green, C blue, G amber, T/U red, N grey; protein
  letters by chemistry group), the ruler is numbered every ten coordinates,
  and marks draw as a coloured band under the letters. The group carries an
  `aria-label` summarising the visible span, marks, cursor and reveal.
  `sequenceModel(panel,state)` returns the clean span, window, cursor, marks,
  legend and `rows[{from,to,letters[{ch,coord,cls,tone,revealed,cursor}]}]`.
  This panel also owns the shared `.bio-b-*` letter and `.bio-tone-*` colour
  classes reused by the other Science & sequencing panels. Desktop-only
  editing.
- `frames` — reading frames: a 3–120-letter nucleotide sequence with its three
  forward frames translated to one-letter amino acids under it, for teaching
  frames, frameshifts, where a stop appears and a chosen protein motif:
  `{"id":"orf","type":"frames","label":"ORF candidate","alphabet":"dna",
  "sequence":"ATGGCCATTGTAATGGGCCGCTGAAAGGGTGCCCGATAG","start":1,
  "initial":{"frame":"all","showStops":true}}`. Declare `sequence` (string;
  whitespace is removed, letters upper-cased; fewer than 3 letters warns and
  translates nothing, more than 120 warns and renders the first 120; letters
  outside the alphabet warn, render as unknown and translate to `X`),
  `alphabet` (`dna` ACGTN default or `rna` ACGUN; anything else warns and uses
  dna), `start` (1-based coordinate of the first letter, safe integer ≥ 1,
  default 1), optional `label` text and `initial`. Translation uses the
  standard genetic code; a trailing partial codon is omitted; codons containing
  N or an unknown letter translate to `X`. State fields (sparse, carried, `null`
  clears): `frame` — `1`, `2`, `3` (numbers or numeric strings) or `"all"`
  (default): the emphasised frame; the other two dim. `marks` — full snapshot
  of up to 24 nucleotide ranges `{id,from,to,tone?,label?}` exactly as in
  `sequence` (1-based inclusive coordinates respecting `start`, clipped to the
  span; a range entirely outside it, a `from` > `to`, a missing id or an
  unknown tone warns by exact path; later marks draw on top; labelled marks
  list in the legend). `motif` — a protein pattern of 1–12 one-letter amino
  acids where `X` matches any residue except a stop and `*` matches a stop
  (e.g. `RXXR`, case-insensitive); every match in every frame, overlaps
  included, highlights its codons with tone `motif`; invalid characters or
  lengths warn and the motif is ignored. `showStops` — boolean, default true:
  stop codons show `*` on a `bad` cell; false shows a quiet dot. `note`.
  Unknown state fields warn and are ignored; an invalid step value is ignored
  and the carried value stays. `enterOnce` follows normal panel state. The
  display is a scrolling monospace grid: a ruler numbered every ten
  coordinates, the nucleotides coloured per letter, a mark band when marks
  exist, then rows F1–F3 whose amino-acid cells span three columns at their
  frame offset, plus a legend/key naming marks, the motif match count and the
  stop colour. `framesModel(panel,state)` returns `letters[{ch,coord}]`,
  `frames[{index,codons[{at,coord,codon,aa,stop,motif}],active}]` (`at` is the
  zero-based index of the codon's first letter) and
  `motifMatches[{frame,at,length}]` (`at` of the first matched codon; `length`
  in codons). Picker category Science & sequencing. Desktop-only editing.
- `reads` — a read alignment: a short authored reference with sequencing reads
  stacked under it, aligned by coordinate, with mismatches, deletion gaps,
  insertions and soft clips visible and a coverage depth bar above the
  reference. A teaching display: nothing is computed from data files. Declare
  `reference` (1–240 letters; whitespace is removed; invalid letters warn and
  render as unknown; longer text truncates with a warning), `alphabet` `"dna"`
  (default) | `"rna"`, `start` (1-based coordinate of the first reference
  letter, default 1), optional `label`, `maxReads` 1–24 (default 12) and
  `showMatches` (default false: matching letters render as `.`). Starting and
  step state accept `reads` (full snapshot of at most `maxReads`
  `{id,at,seq,label?,strand?,tone?}`; `at` is the reference coordinate of the
  first aligned letter; `seq` uses alphabet letters and `-` for a deletion gap;
  letters beyond the reference render dimmed as soft clips, at most 12 per
  side with further letters counted as "… n"; a read entirely outside the
  reference warns and is listed without cells; extra reads warn and are
  ignored), `inserts` (≤ 24 `{read,after,seq}` with 1–24 inserted letters that
  sit between reference coordinate `after` and `after+1` in that read, drawn as
  a `▲` wedge on the read cell with the letters in its tooltip and the legend;
  the reference never shifts; an insertion naming a missing read or a
  coordinate the read does not cover stays in the legend as unplaced), `focus`
  (read id to emphasise while the rest dim; `null` none), `showDepth` (default
  true), `marks` (≤ 24 `{id,from,to,tone?,label?}` reference ranges drawn as a
  band under the reference and listed in the legend; ranges partly outside
  clip, ranges entirely outside warn and are skipped) and `note`. A mismatch is
  a read letter that differs from the reference letter case-insensitively; `N`
  on either side matches. Depth counts aligned letters (match or mismatch) per
  reference position, never gaps or clips. Unknown state fields warn; a patch
  field with the wrong shape is ignored and the carried value stays. Sparse
  patches and `enterOnce` follow normal panel state. `readsModel(panel, state)`
  exposes rows with per-cell `match|mismatch|gap|clip`, insertions, depth and
  the grid. The grid scrolls horizontally when wider than the card; residue
  colours and tones reuse the sequence panel's shared classes. Editing is
  desktop-only.
- `locus` — a linear genome map: a horizontal bar with features on up to four
  stacked rows, point markers above it, arcs that connect two positions, and a
  ruler with nice ticks. Every position is a 1-based base typed in the spec;
  nothing is computed from data files. Declare `length` (required safe integer
  1–10,000,000,000; an invalid length warns and renders an empty card),
  optional `unit` `"bp"` (default) | `"kb"` | `"Mb"` for ruler and distance
  labels (positions are still authored in bp), optional `label`, and up to 48
  `features:[{id,label?,from,to,tone?,strand?,row?}]` with unique string ids
  and `from ≤ to`. A range entirely outside the length warns and is skipped; a
  range past the end warns and clips. `tone` is a shared bio tone (default
  `feature`), `strand` `"+"`/`"-"` adds a chevron, `row` is 0–3. Explicit rows
  are placed first; the rest take the first row with no overlap in authored
  order, and when all four rows overlap the feature shares the last row and
  is flagged crowded in its tooltip. Starting and step state accept `markers`
  (full snapshot ≤ 24 `{id,at,label?,tone?}` pins above the bar, default tone
  `accent`), `arcs` (≤ 12 `{id,from,to,label?,tone?}` connectors above the bar;
  `from > to` draws a dashed arc; the apex label is `label` or the distance
  `|to − from|` in the declared unit; `from === to` warns and is skipped),
  `window` (`{from,to}` zoom: only that span renders, the ruler re-labels and
  features or arcs crossing an edge clip; `null` shows the whole length; a
  window outside the length warns and is ignored, one past the end clips),
  `highlight` (feature id emphasised while the rest dim; unknown ids warn) and
  `note`. Positions beyond the length warn and are skipped; markers and arcs
  outside the window are hidden. Unknown state fields warn. A patch field with
  the wrong shape is ignored and the carried value stays. Sparse patches and
  `enterOnce` follow normal panel state. The ruler picks 5–10 ticks at 1, 2,
  2.5 or 5 × 10ⁿ (fewer for very short windows). `locusModel(panel, state)`
  exposes the pure geometry (percent positions, rows, arcs, ticks). Rendering
  is a stretched inline SVG (`viewBox 0 0 1000 H`, `preserveAspectRatio="none"`,
  non-scaling strokes) under HTML overlays for blocks and labels so text keeps
  its size, plus a legend of the visible features; the map has `role="img"`
  with a summary `aria-label`. Editing is desktop-only.
- `strandscene` — strand scene: one or two lettered (or beaded) nucleotide
  strands as an animated 560×315 cartoon with named sites and actors that
  scan, bind, cut, join, extend, pair and unwind them, one beat per step, for
  teaching "a protein recognises this site and does this to it":
  `{"id":"cut","type":"strandscene","label":"restriction cut",
  "sequence":"ACGTTGCAGAATTCTAGGCATCGA","strands":2,"sites":[{"id":"s1",
  "from":9,"to":14,"label":"cleavage site","cutAfter":{"upper":9,"lower":13}}],
  "actors":[{"id":"enz","role":"enzyme","label":"enzyme","start":{"at":{"x":470,
  "y":60},"state":"free"}}],"initial":{"caption":"Recognition site marked."}}`.
  Declare `sequence` (string, 6–60 letters after whitespace removal, upper-cased;
  missing or empty warns and the panel renders empty; fewer than 6 warns and
  still renders; more than 60 warns and renders the first 60; letters outside
  the alphabet warn and render as unknown), `alphabet` (`dna` ACGTN default or
  `rna` ACGUN; `protein` only with `beads:true`, otherwise it warns and uses
  dna), `beads` (`true` draws numbered beads instead of letters for
  protein-level cartoons), `strands` (`1` default or `2`; with 2 the lower
  strand is the reverse complement unless `lower` gives letters of the same
  length — a different length or non-string warns and uses the complement),
  `start` (1-based coordinate of letter 1, safe integer ≥ 1, default 1),
  optional `label` (title drawn inside the frame), `sites` (≤ 8
  `{id,from,to,label?,tone?,cutAfter?:{upper,lower?}}`: 1-based inclusive
  ranges within the strand; `cutAfter` names the letter after which each
  strand is cut, `lower` defaulting to `upper` for a blunt cut and both
  defaulting to the site's middle letter; a position outside
  `start`…`last−1`, a bad range, tone or label, a missing or duplicate id
  warns by exact path such as `panels[0].sites[1].cutAfter.upper`; more than
  8 warns and the rest are dropped), `actors` (array of up to 6
  `{id,role,shape?,label?,size?,start?:{at?,state?}}`: letter-led unique ids;
  `role` one of `enzyme polymerase ribosome primer cap protein particle cargo
  vesicle virus ion` (unknown warns and uses protein), `shape` one of `blob
  clamp lobes wedge cap dot pill spiky box` (default from the role), `size`
  `s|m|l` (default m), `label` ≤ 16 characters shown on the shape (default
  the role name); `[]` is valid while authoring, a missing array warns, more
  than 6 warns) and `initial`. State (sparse, carried; `null` clears):
  `actors` — an object keyed by actor id whose entries `{at?,state?,label?}`
  **merge per id** over the carried value (`at` is a strand coordinate, which
  places the actor on the upper strand at that letter and makes it follow
  that piece after a cut, or `{x,y}` in scene units 0–560 × 0–315; `state`
  one of `free scanning binding bound active released` — `bound`/`active`
  grip the strand and light the site letters, `scanning` dims letters already
  passed, `released` lifts and fades; `null` for an id resets it to its
  declared start; an unknown id warns `steps[2].panels.cut.actors.zz` and is
  ignored; an all-invalid patch keeps the carried actor). `events` — ≤ 4
  one-shot `{kind,…}` that belong only to the step that authored them:
  `{kind:"cut",site}` (appends `{site,upper,lower}` to the carried `cuts`
  once per site), `{kind:"join",site}` (removes that cut), `{kind:"extend",
  strand:"upper"|"lower",letters}` (1–12 letters appended to that strand's
  carried `extended` text, ≤ 24 per strand; `lower` needs `strands:2`),
  `{kind:"pair"}` (sets carried `paired:true`; needs two strands),
  `{kind:"unwind",from,to}` (sets carried `unwound` so the lower letters in
  that range drop away and lose their rungs) and `{kind:"flash",at}`; an
  unknown kind, site (`….events[0].site`), strand, letter count or range
  warns and that event is ignored; more than 4 warns. `paired` — boolean;
  `false` hides the second strand until a `pair` event. `camera` — `{from,
  to}` window: only those coordinates render and the strand re-centres on
  them; `null` shows all. `highlight` — a site id drawn brighter; `null`
  none; unknown ids warn against the effective sites. `labels` — full
  snapshot of ≤ 4 `{at: coordinate | {x,y}, text}` callouts drawn as tags
  (coordinate callouts follow their piece). `caption` (one line under the
  title inside the frame, ≤ 90 characters), `note`, `enterOnce`. Unknown
  state fields warn and are ignored; a step may change only state, never
  the declaration fields. The model, renderer and fold read the declaration
  from the panel on every call and cache nothing derived from it. Display: two backbone rails with rungs between paired letters
  (letters coloured by residue through the shared `.bio-b-*` classes), a
  ruler every five letters that disappears once pieces drift, dashed site
  boxes with a tag, actors drawn from the shared shape library with the role
  label inside, and legend chips such as `enzyme · bound` under the frame. A
  cut splits the strands into persistent pieces that glide apart (±28 x,
  ±22 y) keeping the single-stranded overhang visible, with a red cut mark
  and ripple that fade; `extend` appends letters that fade in with a 120 ms
  stagger as the scene re-centres; `pair` fades the second strand in with
  its rungs appearing left to right; a `bind` ripple plays when an actor
  becomes bound and its legend chip pulses. Motion is described to the
  shared lifecycle (glide, transient, pulse, settle, patch): the markup is
  always the settled end state, seek and reduced motion land instantly, the
  panel owns no timers, and an overlay-only change (caption, highlight,
  labels, note) swaps the overlay without rebuilding the scene. The host keeps
  only glide history and the last settled scene markup, recomputed from the
  current declaration on every render: a declaration change that alters the
  scene (sequence, strands, sites, actors) rebuilds it, and one that alters
  only overlay text (such as `label`) patches the overlay. The `<svg>`
  carries `role="img"` with an `aria-label` narrating the settled state
  ("Double strand 1 to 24; cleavage site 9 to 14; enzyme bound at 11; cut
  after 9 and 13; product A …"); legend chips and the note are real text.
  `strandsceneModel(panel,state)` returns the resolved geometry (`layout`,
  `pieces`, `letters`, `lowerLetters`, `rungs`, `sites`, `actors`, `labels`,
  `cuts`, `legend`, `aria`) and `strandsceneHTML(panel,state)` the settled
  markup. This panel owns the shared `.mech-*` rules reused by `cellscene`.
  Desktop-only editing.
- `cellscene` — a cell scene: nested compartments in a 560×315 (16:9) frame with
  authored items that sit in a compartment, cross a membrane, bud into and fuse
  from vesicles, signal, and a cell that divides. A teaching cartoon: every
  position, count and event is authored, nothing is simulated, and the panel
  names no real organism. Declare `label` (scene title inside the frame, ≤40
  characters, e.g. "a plant cell"), 1–8 `compartments:[{id,kind,label?,parent?,
  x?,y?,rx?,ry?}]` and 1–8 `items:[{id,role,shape?,label?,size?,start:{in,x?,y?,
  count?,state?}}]`. Ids are letter-led (letters, digits, `-`, `_`). Compartment
  `kind` is `outside` (the frame itself; its label sits bottom-right), `cell`
  (membrane outline, default centre 312,160 and radii 150×102), `nucleus` (a
  circle with a dashed envelope, default 352,158 r 42, nested in the cell unless
  `parent` says otherwise), `vesicle` (small dashed circle, r 18), `organelle`
  (small ellipse 26×15) or `region` (an unfilled labelled area, default left of
  the nucleus). `parent` nests; unknown parents and parent cycles warn and
  render flat. One cell, one nucleus and at most four vesicles/organelles
  render; later ones warn and are skipped. `x,y` are scene units (0–560 ×
  0–315) and `rx,ry` positive radii; omitted geometry follows the cell. Item
  `role` is a shared mechanism role (`enzyme polymerase ribosome primer cap
  protein particle cargo vesicle virus ion`; unknown warns and uses
  `particle`), `shape` one of `blob clamp lobes wedge cap dot pill spiky box`
  (default from the role), `label` ≤16 characters (default the id), `size`
  `s|m|l`. `start.in` names a declared compartment (unknown warns and uses the
  first), `x,y` place the item (omitted: the compartment's anchor), `count` is
  0–50 (default 1; 0 or `state:"hidden"` hides the item; 2 or more draws a
  deterministic golden-angle cluster of dots, > 12 at 3.5 px, > 30 with a
  "×N" tag) and `state` is `free|bound|active|released|hidden`. Starting and
  step state accept `items`, `events`, `zoom`, `highlight`, `labels`,
  `caption` and `note`. `items` is an object keyed by item id that merges per
  id into the carried item: `{in?,x?,y?,count?,state?,label?,daughter?:1|2|
  null}`; an id set to `null` returns that item to its declared `start`;
  unknown ids and invalid values warn and are ignored without touching the
  other keys, and an item whose `in` names an unknown compartment warns and
  falls back to its declared start compartment. `events` (≤4, run in order on
  that step only, never carried) are `{kind:"enter",item,to,via?}` (sets the
  item's `in`; while animating the item travels to the membrane of `via` or
  `to`, shrinks, a crossing ripple plays and it settles at its new `x,y`;
  author `in` directly to relocate without the crossing),
  `{kind:"bud",vesicle,from,items?}` (a dashed vesicle appears around the listed
  items, which now sit in it; it follows its contents' positions and is carried
  until it fuses), `{kind:"fuse",vesicle,with,to?}` (removes the vesicle and
  moves its contents' `in` to `to`, default `with`; a ripple plays on the
  boundary of `with`), `{kind:"divide",daughters?:[{items:[ids]},{items:[ids]}]}`
  (carried as `divided`; the cell is drawn as two daughters, 0.54 rx × 0.8 ry
  at ±(0.62 rx + 14), with a nucleus each; nested compartments and items follow
  the daughter named by the event or their `daughter` field, else the nearer
  one; a second divide on the same path warns and is skipped) and
  `{kind:"signal",at:itemId|compartmentId,rings?:1–3}` (pure transient rings).
  Events naming unknown ids, a fuse of a vesicle that has not budded on that
  path, and more than four events warn with the exact path. `zoom` frames one
  compartment with a 12 % margin and glides there (`null` = whole scene);
  `highlight` outlines one compartment; `labels` are ≤4 `{at:{x,y} | item or
  compartment id, text}` callouts (a full list each time); `caption` is one
  line under the title inside the frame. `enterOnce` applies any of these for
  one step. The model and renderer read the declaration from the panel on
  every call. Item and callout ids are resolved at render; events are
  resolved against the declaration the fold is given, so an engine-level
  per-step declaration change applies without panel code. Under that rule
  an event that validation reports as skipped never changes carried state.
  The host keeps only glide history and the last settled scene markup, which
  is recomputed from the current declaration on every render and decides
  whether an overlay-only change can patch: a change to the scene (from
  state or from the declaration, such as compartments, items or their labels)
  rebuilds it, and an overlay-only change patches with the new text. Markup is always the
  settled end state: moved items, vesicles, nuclei and daughters glide from
  their previous place; crossing ripples, signal rings, bud/fuse ripples and
  the pinching parent outline are one-shot transients emitted only while
  animating; seeking, reduced motion and `animate:false` land instantly with no
  panel timers. The legend lists `particle · cytoplasm`, `cargo ×6 · vesicle`,
  the nucleus and `cell · 1` / `1 → 2` / `2` as real text, and the frame's
  `aria-label` narrates the settled state. Alternate paths fold independently.
  `cellsceneModel(panel, state)` returns the resolved geometry `{compartments,
  geom, daughters, items:[{id,role,shape,x,y,w,h,count,state,in,inLabel,
  visible,daughter,cluster}], vesicles, zoom, highlight, labels, transients,
  legend, aria}`.
