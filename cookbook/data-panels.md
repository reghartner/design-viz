# Authored data panels

Use `grid` when a story compares a small matrix of labelled values. Declare
`rows` and `cols` with unique ids, then set `cells` using `rowId.colId` keys.
Optional `scale` controls a sequential or diverging colour ramp; `marks` add
short annotations, and `highlight` selects a row, column or cell on a step.

Use `funnel` for 2–12 ordered stages and the count remaining at each stage.
Declare unique stage ids, an optional `unit`, and sparse `counts` patches by
stage id. The panel shows retained share and changes between known stages;
`active` calls attention to the stage being explained. Optional tones are
`neutral`, `accent`, `info`, `warning`, `success`, `danger`, `violet`, `teal`,
and `pink`.

Every count and value is authored. Label estimates and illustrative figures
in the story; neither panel infers values from data files. Use
`python3 tools/widget_doc.py grid funnel` for the full field reference.
