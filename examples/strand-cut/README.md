# A bacterium cuts foreign DNA

Teaching example for the `strandscene` panel: a fictional bacterium, a generic
restriction enzyme and a made-up 24-letter strand. Nothing here is measured and
no real organism, enzyme, site or sequence is depicted.

- `strand-cut.spec.json` is the authored page; `strand-cut.html` is built from it
  with `python3 tools/page_build.py examples/strand-cut/strand-cut.spec.json strand-cut/strand-cut`.
- The main path (eight steps) shows arrive, enter, scan, bind, cut, separate,
  release and clear. The cut step authors one `cut` event; the fold carries its
  consequence (`cuts`) so later steps and seeks render the two products.
- The alternate path "Own DNA is protected" replaces the declared actor list in
  a step (`actors` as an array adds a bound `cap` on the same site) and overrides
  the scene `label`; the enzyme reaches `binding` and is `released` without a
  cut, so the strand stays intact.
