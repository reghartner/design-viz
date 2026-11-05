# Search within a document

Use **Search document** (the magnifying glass in the document toolbar). With
focus in the document, **Ctrl/Cmd+Shift+F** also opens it. Workbench's
**Ctrl/Cmd+K** continues to open Find objects.

Typing highlights matches without navigating. **Highlights** and **Results**
share one query. Matching page markers, nodes and step markers have dashed
outlines; current-page selection and active-step styling remain separate. While
a query is present, the closed Contents rail shows the document's numbered
pages, including separate Views of the same section. Choose a matching page,
then a matching step, to read highlighted words.

**Results** shows location labels and snippets. Selecting a result opens its
exact tab, View and section. Step results use the original source-step index and
can switch paths, including steps outside the current path or View filter.
Prose results expand collapsed prose and reveal the matching paragraph.
In the query field, **Enter** selects the next result and **Shift+Enter** the
previous one. **Clear** removes the query; **Escape** closes and clears search.

The first version matches contiguous text, ignoring case. It indexes document,
page and View titles, section paragraphs and bullets, node titles/subtitles/text,
and step prose. Local and imported topology nodes use the same resolved runtime
content. Node results are offered only for Views whose diagram is visible in
the current host layout profile, and only for rendered nodes without an authored
hidden flag. This rule applies equally to local and imported nodes; alternate
visible Views keep their own exact destinations. Hiding a diagram does not omit
its step prose when the step controls remain available. Unicode case matching
maps back to the original characters for both snippets and highlighted words.
IDs, placement data, control labels and dynamic panel state are not
indexed. Results count matching content items, rather than every repeated word.
Detail-only sections are outside the navigable page index.

Search belongs to the rendered document instance. Workbench rerenders start a
fresh search, so results cannot retain references to an old document. CSS
Highlight ranges emphasize words without wrapping editable DOM or writing
source. Each native viewer owns and removes its own highlight registration.
This feature adds desktop authoring coverage only.
