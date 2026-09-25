# App screens example

Four fictional Hearth app screenshots accompany a camera connection story.
They demonstrate manually imported screens; they are not an implemented product
or real Figma exports. See the [recipe](../../cookbook/app-screens.md) for importing
your own images and the [ledger](app-screens.ledger.md) for provenance.

```sh
python3 tools/inject.py examples/app-screens/app-screens.spec.json template/flowview.html /tmp/app-screens.html
```

To regenerate the illustrative images after editing `fixtures/source-screens.html`,
install the pinned browser-test dependencies and Chromium as described in
`tools/browser-tests/README.md`, then run:

```sh
node examples/app-screens/build-example.mjs
node tools/validate.js examples/app-screens/app-screens.spec.json
```

The generated JSON stores each screenshot once. Browser contracts import those
same bytes through the workbench and exercise the standalone and native viewers.
