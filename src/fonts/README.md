# Bundled viewer fonts

Latin WOFF2 subsets from Fontsource 5.3.0, under the accompanying OFL licenses.
These are the existing skin families/weights, embedded as data URLs by the
standalone and Backstage viewer builds. Pages do not contact Google Fonts.
`manifest.json` is the shared build inventory: family, weight, local file, license
and explicit distribution profiles. The `all` profile contains the existing 22
weights for portable and native viewers. The `forge` profile keeps its nine
Fontsource CSS imports (IBM Plex Sans 400/500/600, IBM Plex Mono 400/500/600/700,
Sora 600/700), emitted as local WOFF/WOFF2 files. It does not inherit every native
font. Keep font files, imports and licenses together; the shared asset collector
selects them through the named entrypoint. See
[build entrypoints](../../docs/build-entrypoints.md).

Source packages: @fontsource/ibm-plex-sans, ibm-plex-mono, sora, newsreader,
source-sans-3, plus-jakarta-sans, barlow-condensed (all 5.3.0).
