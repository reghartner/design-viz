# One section, two Views

Open `section-views.spec.json` in desktop Workbench, or build a standalone reader:

```sh
python3 tools/build.py
python3 tools/inject.py examples/section-views/section-views.spec.json template/flowview.html /tmp/section-views.html
```

Page 1 is an independent text section. Page 2 is the shared story's Business
View, with its diagram hidden. Page 3 is that same section's Data View in full
Explore. Editing the story's prose or service content updates both Views; their
arrangements and diagram visibility remain independent. Both sections use the
local View ID `standard`, demonstrating that links identify section and View.

See [the section View contract](../../docs/tab-views.md).
