/* Company panel type: discovered from company/panels/types without list edits. */
(function () {
  function stateWarnings(state, path, panel, warnings) {
    if (state.done != null && (!CompanyTicketMath.valid(state.done) || state.done > panel.total))
      warnings.push(path + '.done: ticket board expects a whole number between zero and total');
  }
  PanelRegistry.define('ticket-board', {
    label: 'Ticket board',
    since: '1.0.0',
    render: function (host, panel, state) {
      var done = CompanyTicketMath.valid(state.done) ? state.done : 0;
      var pct = CompanyTicketMath.percent(done, panel.total);
      return {html: softwarePanelShell('<div class="ticket-board-readout">' + esc(done + ' of ' + panel.total) +
        '</div><div class="ticket-board-fill" style="width:' + pct.toFixed(1) + '%"></div>', state)};
    },
    layout: {height:6, supporting:true},
    validateDeclaration: function (panel, path, warnings, errors) {
      if (!CompanyTicketMath.valid(panel.total) || panel.total === 0)
        errors.push(path + '.total: ticket board requires a positive whole-number total');
      softwarePanelPatchWarnings(panel.initial, path + '.initial', panel, warnings, stateWarnings);
      return {total:panel.total};
    },
    validatePatch: function (patch, path, panel, warnings, context) {
      softwarePanelPatchWarnings(patch, path, {total:context.total}, warnings, stateWarnings);
    },
    fold: function (panel, steps) {
      return foldCommonPanelStates(panel, steps, {accept:{done:function (value) {
        return CompanyTicketMath.valid(value) && value <= panel.total;
      }}});
    },
    authoring: {
      template: {title:'Tickets', total:10, initial:{done:0}},
      setupFields: [['total','num'], ['initial','json']],
      patchFields: [['done','num'], ['note','text']],
      picker: {order:1100, name:'Ticket board', category:'Company panels', tagline:'Work closed so far',
        description:'Shows how many tickets a team has closed out of a fixed total.'}
    },
    styles: '.ticket-board-fill{height:8px;background:#0b7a75}'
  });
})();
