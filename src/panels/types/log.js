/* log panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
/* Up to 8 line ids, as one string or an array, like Seatmap's highlight. */
function logHighlightIds(value) {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) && value.length <= 8 && value.every(function (id) {
    return typeof id === 'string';
  }) ? value : [];
}
function logLineCount(state) {
  return state && Array.isArray(state.log) ? state.log.length : 0;
}
PanelViews.register(
  'log',
  function (host, panel, state, skin, states, stepIdx, animate, declared) {
    var h = '';
    var tags = panel.tags || {};
    declared = declared || panel;
    /* With this path's history, lines appended at this step are new, and each
       line keeps the tag colors in effect at the step it was appended. Lines
       from `initial` use the starting tags, never step 0's patch. */
    var history = Array.isArray(states) && typeof stepIdx === 'number' && stepIdx >= 0 && stepIdx < states.length;
    var initial = declared.initial, start = panelObject(initial) && Array.isArray(initial.log) ? initial.log.length : 0;
    var before = !history ? Infinity : stepIdx ? logLineCount(states[stepIdx - 1]) : start;
    var appended = [];
    if (history) for (var j = 0; j <= stepIdx; j++) appended.push(logLineCount(states[j]));
    function tagsAt(i) {
      if (!history) return tags;
      if (i < start) return panelEffectiveDeclaration(declared, initial).tags || {};
      for (var k = 0; k < appended.length; k++)
        if (appended[k] > i) return panelEffectiveDeclaration(declared, states[k]).tags || {};
      return tags;
    }
    var highlight = logHighlightIds(state.highlight), seen = Object.create(null);
    h += '<div class="plog panel-fill-scroll">';
    (state.log || []).forEach(function (line, i) {
      var tag = line && line.tag ? String(line.tag) : '';
      var lineTags = tagsAt(i), col2 = isHex(lineTags[tag]) ? lineTags[tag] : null;
      var id = panelObject(line) && typeof line.id === 'string' && line.id && !seen[line.id] ? line.id : null;
      if (id) seen[id] = true;
      h +=
        '<div class="plogline' + (i >= before ? ' plog-new' : '') + (id && highlight.indexOf(id) >= 0 ? ' plog-hl' : '') + '">' +
        (tag
          ? '<span class="plogtag"' +
            (col2 ? ' style="color:' + col2 + '"' : '') +
            '>' +
            esc(tag) +
            '</span>'
          : '') +
        '<span>' +
        esc(line && line.text != null ? line.text : String(line)) +
        '</span></div>';
    });
    h += '</div>';
    return {
      html: h,
      mounted: function () {
        var log = host.querySelector('.plog');
        if (log && typeof log.scrollHeight === 'number') log.scrollTop = log.scrollHeight;
      },
    };
  },
  { growing: true }
);

PanelRegistry.extend('log', {
  order: 3,
  label: 'Log',
  since: '0.1.0',
  unified: true,
});

/* Line ids and highlight are the only things checked; other log content
   keeps today's permissive behaviour. Ids come from the authored panel's
   initial lines and every step's appended lines. */
function logPatchWarnings(state, path, panel, warnings, context) {
  softwarePanelPatchWarnings(state, path, panel, warnings, function (state, path) {
    if (!panelOwn(state, 'highlight') || state.highlight === null) return;
    var value = state.highlight;
    if (typeof value !== 'string' && !(Array.isArray(value) && value.length <= 8 && value.every(function (id) { return typeof id === 'string'; }))) {
      warnings.push(path + '.highlight: expected a line id, up to 8 line ids, or null — nothing highlighted');
      return;
    }
    (typeof value === 'string' ? [value] : value).forEach(function (id) {
      if (!context || !context.ids[id]) warnings.push(path + '.highlight: no log line has id "' + id + '" — ignored');
    });
  });
}
PanelRegistry.extend('log', {
  validateDeclaration: function (panel, path, warnings, errors, d) {
    var authored = ((d && d.panels) || []).filter(function (p) { return p && p.id === panel.id; })[0] || panel;
    var ids = Object.create(null);
    function scan(lines, where) {
      (Array.isArray(lines) ? lines : [lines]).forEach(function (line, i) {
        if (!panelOwn(line, 'id')) return;
        var at = where + '[' + i + '].id';
        if (typeof line.id !== 'string' || !line.id) warnings.push(path + ': ' + at + ' must be a non-empty string — line cannot be highlighted');
        else if (ids[line.id]) warnings.push(path + ': ' + at + ' repeats line id "' + line.id + '" — only the first line with it can be highlighted');
        else ids[line.id] = true;
      });
    }
    if (panelObject(authored.initial) && Array.isArray(authored.initial.log)) scan(authored.initial.log, 'initial.log');
    ((d && d.steps) || []).forEach(function (step, ti) {
      var patch = stepPanelPatch(step), own = patch && panelObject(patch[panel.id]) ? patch[panel.id] : null;
      if (own && own.log != null) scan(own.log, 'steps[' + ti + '].panels.' + panel.id + '.log');
    });
    var context = { ids: ids };
    logPatchWarnings(authored.initial, path + '.initial', panel, warnings, context);
    return context;
  },
  validatePatch: logPatchWarnings,
});

PanelRegistry.extend('log', {
  styles: [
    {
      order: 338,
      css: String.raw`.plog{font:500 10.5px/1.7 'IBM Plex Mono',monospace; height:170px; overflow-y:auto;}
.sk-aurora .plog{color:#93A7C9;}
.sk-daylight .plog{color:#6B6F7A;}
.plogline{display:flex; gap:7px;}
.plogtag{font-weight:700; min-width:32px;}
.plogline.plog-new{box-shadow:inset 2px 0 0 currentColor; background:color-mix(in srgb,currentColor 8%,transparent);}
.plogline.plog-hl{box-shadow:inset 3px 0 0 currentColor; background:color-mix(in srgb,currentColor 18%,transparent);}`,
    },
    {
      order: 1363,
      css: String.raw`body.sk-editorial .plog{
  padding:8px 0 0;
  border-top:1px solid var(--ed-rule);
  scrollbar-color:var(--ed-rule-strong) transparent;
}`,
    },
    {
      order: 1579,
      css: String.raw`@media screen {
  body.sk-terminal .plog,
  body.sk-terminal .sk-aurora .plog{color:var(--tm-text); font-size:10px; line-height:1.8;}
}
@media screen {
  body.sk-terminal .plogline{border-bottom:1px solid var(--tm-line-dim);}
}`,
    },
    {
      order: 1787,
      css: String.raw`@media screen {
  body.sk-pastel .plog,
  body.sk-pastel .sk-aurora .plog,
  body.sk-pastel .sk-daylight .plog {
    box-sizing:border-box;
    color:#5E6D82;
    background:#F6F8FC;
    border:1px solid #E3E9F1;
    border-radius:11px;
    padding:8px 10px;
    scrollbar-color:#C8D1DF transparent;
  }
}
@media screen {
  body.sk-pastel .plogline + .plogline { border-top:1px solid rgba(219,226,237,.62); }
}`,
    },
    {
      order: 2024,
      css: String.raw`@media screen {

  body.sk-blueprint .docview .plog{
    height:148px;
    padding:5px 7px;
    border:1px solid #347F9E;
    color:#C5E1EE;
    background:#031E40;
    font-size:10px;
    line-height:1.5;
  }
  body.sk-blueprint .docview .section-layout-tile .plog.panel-fill-scroll,
  body.sk-blueprint .docview .explore-window:not(.explore-window-automatic) .plog.panel-fill-scroll{height:auto;}
}
@media screen {
  body.sk-blueprint .plogline{gap:6px;}
}
@media screen {
  body.sk-blueprint .plogtag{min-width:29px;}
}`,
    },
  ],
});

/* log authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('log', {
  authoring: {
    initialFields: true,
    template: {
      title: 'Event log',
      tags: { NET: '#38E1FF' },
      initial: { log: [{ tag: 'NET', text: 'panel added' }] },
    },
    setupFields: [
      ['tags', 'map'],
      ['initial', 'json'],
    ],
    patchFields: [['log', 'jsonArr']],
    fieldMeta: {
      tags: {label:'Event tags and colors',group:'Content'},
      log: {label:'Events',initial:{help:'Events visible before the story begins.'},step:{help:'These events append to the log at this step. An empty list adds nothing; it does not clear earlier events.'}},
    },
    editor: function(context){return {patchControl:function(field,options){
      if(field[0]==='log')return createPanelLogComposer(context,options);
    }};},
    picker: {
      order: 7,
      name: 'Event log',
      category: 'Software & data',
      tagline: 'The running record',
      description: 'Build a readable, tagged event history alongside the steps of your story.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'log') return history(['log'], true, 'Accumulated log history');
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state.log = [
        { tag: 'NET', text: 'Connected to gateway' },
        { tag: 'NET', text: 'Event received · 200 OK' },
        { tag: 'NET', text: 'Acknowledgement sent' },
      ];
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
