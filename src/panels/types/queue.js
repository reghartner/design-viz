/* queue panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function queueModel(state) {
  state = state || {};
  var s =
    QUEUE_STATES.indexOf(String(state.state)) >= 0
      ? String(state.state)
      : 'empty';
  function str(v) {
    return typeof v === 'string' ? v : '';
  }
  return {
    state: s,
    label: state.label != null ? String(state.label) : '',
    from: str(state.from),
    to: str(state.to),
    reason: str(state.reason),
  };
}

function queuePanelHTML(panel, state) {
  var qm = queueModel(state);
  var h = '<div class="qbox s-' + qm.state + '">';
  h += '<div class="qtrack">';
  h += '<span class="qarr qarr-in" aria-hidden="true">&#8594;</span>';
  h += '<div class="qslot">';
  if (qm.state === 'empty') h += '<span class="qempty">empty</span>';
  else h += '<span class="qmsg">' + esc(qm.label || 'message') + '</span>';
  h += '</div>';
  h += '<span class="qarr qarr-out" aria-hidden="true">&#8594;</span>';
  h += '</div>';
  /* directional context row: arrival label on the in-side during enqueue,
     departure label on the out-side during dequeue. Both spans are ALWAYS
     emitted (populated only in the relevant state) so the row reserves a
     fixed height and the panel never changes size between steps — otherwise
     the panel column and the step bar below it reflow. Static text, so it is
     reduced-motion safe. */
  var ctxIn = qm.state === 'enqueue' ? esc(qm.from) : '';
  var ctxOut = qm.state === 'dequeue' ? esc(qm.to) : '';
  h +=
    '<div class="qctx"><span class="qside qside-in">' +
    ctxIn +
    '</span>' +
    '<span class="qside qside-out">' +
    ctxOut +
    '</span></div>';
  h += '<div class="qstatecap">' + qm.state + '</div>';
  /* waiting-on line, shown while held; container always emitted (empty
     otherwise) and clamped to a fixed height so its length cannot reflow. */
  var reason = qm.state === 'held' ? esc(qm.reason) : '';
  h += '<div class="qreason">' + reason + '</div>';
  h += '</div>';
  return h;
}

/* inline markup: a small, safe subset for prose. The whole string is ESCAPED
   FIRST, then a fixed set of substitutions is applied, so labels/URLs are
   always HTML-safe and only http/https links are ever emitted (never
   javascript:/data:). Supported:
     [label](https://url)  ->  underlined anchor
     **bold**              ->  <strong>
     *italic*              ->  <em>   (single star; snake_case is untouched
                                       because italics use * not _)
     `code`                ->  <code>
   Plain prose with none of these is simply escaped, so this is a drop-in
   replacement for esc() in prose contexts. */

PanelViews.register(
  'queue',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    h += queuePanelHTML(panel, state);
    return { html: h };
  }
);
