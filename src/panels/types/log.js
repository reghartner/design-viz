/* log panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
PanelViews.register(
  'log',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var tags = panel.tags || {};
    h += '<div class="plog">';
    (state.log || []).forEach(function (line) {
      var tag = line && line.tag ? String(line.tag) : '';
      var col2 = isHex(tags[tag]) ? tags[tag] : null;
      h +=
        '<div class="plogline">' +
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
});

PanelRegistry.extend('log', {
  styles: [
    {
      order: 338,
      css: String.raw`.plog{font:500 10.5px/1.7 'IBM Plex Mono',monospace; height:170px; overflow-y:auto;}
.sk-aurora .plog{color:#93A7C9;}
.sk-daylight .plog{color:#6B6F7A;}
.plogline{display:flex; gap:7px;}
.plogtag{font-weight:700; min-width:32px;}`,
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
