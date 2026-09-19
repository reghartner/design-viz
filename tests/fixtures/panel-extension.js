/* A complete extension: copying only this file into src/panels/types adds it. */
(function () {
  function validValue(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0;
  }
  function stateWarnings(state, path, panel, warnings) {
    if (state.value != null && (!validValue(state.value) || state.value > panel.max))
      warnings.push(path + '.value: extension meter expects a number between zero and max');
  }
  PanelRegistry.define('extension-meter', {
    label: 'Extension meter',
    since: '9.7.0',
    render: function (host, panel, state) {
      var value = validValue(state.value) ? state.value : 0;
      var pct = clamp(value / panel.max * 100, 0, 100);
      return {
        html: softwarePanelShell('<div class="extension-meter-readout">' + esc(String(value)) +
          '</div><div class="extension-meter-fill" style="width:' + pct.toFixed(1) + '%"></div>', state),
        level: {pct:pct, value:value, fill:'.extension-meter-fill', readout:'.extension-meter-readout', decimals:panelDecimalPlaces(value)}
      };
    },
    presentation: {growing:true, ambientInitial:true},
    layout: {focusByDefault:true, focusLabel:'Meter', large:true, height:9, supporting:false, attachControls:true},
    references: {nodes:['sources.*.node']},
    validateDeclaration: function (panel, path, warnings, errors) {
      if (!validValue(panel.max) || panel.max === 0)
        errors.push(path + '.max: extension meter requires a positive maximum');
      softwarePanelPatchWarnings(panel.initial, path + '.initial', panel, warnings, stateWarnings);
      return {max:panel.max};
    },
    validatePatch: function (patch, path, panel, warnings, context) {
      softwarePanelPatchWarnings(patch, path, {max:context.max}, warnings, stateWarnings);
    },
    fold: function (panel, steps) {
      return foldCommonPanelStates(panel, steps, {accept:{value:function (value) {
        return validValue(value) && value <= panel.max;
      }}});
    },
    authoring: {
      template: {title:'Extension meter', max:100, sources:[], initial:{value:10}},
      setupFields: [['max','num'], ['sources','rows',{cols:[{k:'node'},{k:'label'}]}], ['initial','json']],
      patchFields: [['value','num'], ['note','text']],
      picker: {order:1000, name:'Extension meter', category:'Extension fixtures', tagline:'One file, every surface',
        description:'A synthetic meter whose declaration, display, authoring, references, and styles come from one file.'},
      example: function (sample) {
        sample.state.value=65;
        sample.panel.initial={value:65};
        return sample;
      },
      editor: function (context) {
        return {setupRows:function (panel, diagram, target, rows) {
          rows.push(context.controls.action('Use a maximum of 200', function () {
            if (context.commit('max','200')) context.inspect();
          }));
        }};
      }
    },
    styles: '.extension-meter-fill{height:8px;background:#245bdb}',
    editorStyles: '.extension-meter-editor-note{font-weight:600}'
  });
})();
