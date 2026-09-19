/* queue validation and pure state helpers. */
var QUEUE_STATES = ['empty', 'enqueue', 'held', 'dequeue'];
var QUEUE_CTX_FIELDS = ['from', 'to', 'reason'];
function queueContextWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object') return;
  QUEUE_CTX_FIELDS.forEach(function (f) {
    if (obj[f] != null && typeof obj[f] !== 'string')
      warnings.push(path + '.' + f + ': must be a string — ignored');
  });
}

/* Shared with the phone renderer; also accepts plain objects from another realm. */

PanelRegistry.extend('queue', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.initial && p.initial.state != null && QUEUE_STATES.indexOf(String(p.initial.state)) < 0)
      warnings.push(
        PP +
          '.initial.state: unknown queue state "' +
          p.initial.state +
          '" — using "empty" (valid: ' +
          QUEUE_STATES.join(' ') +
          ')'
      );
    queueContextWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    if (patch.state != null && QUEUE_STATES.indexOf(String(patch.state)) < 0)
      warnings.push(
        path +
          '.state: unknown queue state "' +
          patch.state +
          '" — using "empty" (valid: ' +
          QUEUE_STATES.join(' ') +
          ')'
      );
    queueContextWarnings(patch, path, warnings);
  },
});

/* queue panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function queueModel(state) {
  state = state || {};
  var s = QUEUE_STATES.indexOf(String(state.state)) >= 0 ? String(state.state) : 'empty';
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

PanelViews.register('queue', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  h += queuePanelHTML(panel, state);
  return { html: h };
});

PanelRegistry.extend('queue', {
  order: 10,
  label: 'Queue',
  since: '0.1.0',
});

PanelRegistry.extend('queue', {
  styles: [
    {
      order: 1019,
      css: String.raw`.qtrack{display:flex; align-items:center; gap:8px;}
.qslot{flex:1; min-height:34px; border:1.5px dashed; border-radius:8px; display:flex;
  align-items:center; justify-content:center; padding:4px 8px; overflow:hidden;}
.sk-aurora .qslot{border-color:#3B4A63;}
.sk-daylight .qslot{border-color:#C9C4B8;}
.s-held .qslot{border-style:solid;}
.sk-aurora .s-held .qslot{border-color:#38E1FF;}
.sk-daylight .s-held .qslot{border-color:#4956C9;}
.qempty{font:500 10px 'IBM Plex Mono',monospace; letter-spacing:.1em; text-transform:uppercase; opacity:.45;}
.sk-aurora .qempty{color:#93A7C9;}
.sk-daylight .qempty{color:#6B6F7A;}
.qmsg{font:600 10.5px 'IBM Plex Mono',monospace; padding:4px 10px; border-radius:6px;
  border:1px solid; white-space:nowrap;}
.sk-aurora .qmsg{background:#0C2230; color:#8AE8FF; border-color:#38E1FF;}
.sk-daylight .qmsg{background:#EEF0FB; color:#4956C9; border-color:#4956C9;}
.s-enqueue .qmsg{animation:qenq .6s ease-out both;}
@keyframes qenq{from{transform:translateX(-70px); opacity:0;}}
.s-held .qmsg{animation:qheld 1.6s ease-in-out infinite alternate;}
@keyframes qheld{to{opacity:.55;}}
.s-dequeue .qmsg{animation:qdeq .7s ease-in both;}
@keyframes qdeq{to{transform:translateX(70px); opacity:0;}}
.qarr{font:700 12px 'IBM Plex Mono',monospace; opacity:.25;}
.sk-aurora .qarr{color:#5E7396;}
.sk-daylight .qarr{color:#9A958A;}
.s-enqueue .qarr-in{opacity:1;}
.sk-aurora .s-enqueue .qarr-in{color:#4ADE80;}
.sk-daylight .s-enqueue .qarr-in{color:#0E9382;}
.s-dequeue .qarr-out{opacity:1;}
.sk-aurora .s-dequeue .qarr-out{color:#FFB454;}
.sk-daylight .s-dequeue .qarr-out{color:#B45309;}
.qstatecap{font:600 9px 'IBM Plex Mono',monospace; letter-spacing:.14em; text-transform:uppercase;
  margin-top:6px; opacity:.6;}
.sk-aurora .qstatecap{color:#93A7C9;}
.sk-daylight .qstatecap{color:#6B6F7A;}`,
    },
    {
      order: 1052,
      css: String.raw`.qctx{display:flex; margin-top:5px; height:14px; overflow:hidden;}
.qside{font:600 9.5px 'IBM Plex Mono',monospace; line-height:14px; min-width:0;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis;}
.qside-in{margin-right:auto;}
.qside-out{margin-left:auto;}
.sk-aurora .qside-in{color:#4ADE80;}
.sk-daylight .qside-in{color:#0E9382;}
.sk-aurora .qside-out{color:#FFB454;}
.sk-daylight .qside-out{color:#B45309;}`,
    },
    {
      order: 1061,
      css: String.raw`.qreason{font:500 10px 'IBM Plex Mono',monospace; margin-top:4px;
  height:28px; line-height:14px; overflow:hidden;
  display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;}
.sk-aurora .qreason{color:#5E7396;}
.sk-daylight .qreason{color:#8A8474;}`,
    },
    {
      order: 1208,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .qmsg{animation:none !important;}
}`,
    },
    {
      order: 1259,
      css: String.raw`@media print{
  .pt-queue .ptitle{color:#555555;}
}
@media print{
  .qmsg{animation:none !important; background:#FFFFFF; color:#111111; border-color:#555555;}
}
@media print{
  .qslot{border-color:#999999;}
}
@media print{
  .qempty, .qstatecap{color:#555555; opacity:.8;}
}
@media print{
  .qreason, .qside{color:#555555;}
}
@media print{
  .qarr{color:#777777;}
}`,
    },
    {
      order: 1451,
      css: String.raw`body.sk-editorial .sk-aurora .qslot,
body.sk-editorial .sk-daylight .qslot{border-color:var(--ed-rule-strong); border-radius:2px;}
body.sk-editorial .sk-aurora .s-held .qslot,
body.sk-editorial .sk-daylight .s-held .qslot{border-color:var(--ed-accent);}
body.sk-editorial .sk-aurora .qmsg,
body.sk-editorial .sk-daylight .qmsg{
  border-color:var(--ed-accent);
  border-radius:2px;
  color:var(--ed-accent-deep);
  background:var(--ed-accent-soft);
}
body.sk-editorial .sk-aurora .qarr,
body.sk-editorial .sk-daylight .qarr{color:var(--ed-muted);}
body.sk-editorial .sk-aurora .qside-in,
body.sk-editorial .sk-daylight .qside-in{color:var(--ed-good);}
body.sk-editorial .sk-aurora .qside-out,
body.sk-editorial .sk-daylight .qside-out{color:var(--ed-warn);}`,
    },
    {
      order: 1499,
      css: String.raw`@media print{
  body.sk-editorial .panelcol .pwidget.pt-queue{background:#FFFFFF; border-color:#B8B8B8;}
}`,
    },
    {
      order: 1657,
      css: String.raw`@media screen {

  body.sk-terminal .qslot{
    min-height:34px;
    background:var(--tm-raised);
    border:1px dashed var(--tm-line);
    border-radius:0;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .s-held .qslot{border-color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .qmsg,
  body.sk-terminal .sk-aurora .qmsg{color:var(--tm-good); background:#0B1912; border:1px solid var(--tm-good); border-radius:0;}
}
@media screen {
  body.sk-terminal .qempty,
  body.sk-terminal .qstatecap,
  body.sk-terminal .qreason,
  body.sk-terminal .qarr,
  body.sk-terminal .sk-aurora .qempty,
  body.sk-terminal .sk-aurora .qstatecap,
  body.sk-terminal .sk-aurora .qreason,
  body.sk-terminal .sk-aurora .qarr{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .qside-in,
  body.sk-terminal .sk-aurora .s-enqueue .qarr-in{color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .qside-out,
  body.sk-terminal .sk-aurora .s-dequeue .qarr-out{color:var(--tm-alert);}
}`,
    },
    {
      order: 1879,
      css: String.raw`@media screen {

  body.sk-pastel .qslot { border-color:#CAD4E1; border-radius:11px; background:#F8FAFC; }
}
@media screen {
  body.sk-pastel .sk-aurora .qslot,
  body.sk-pastel .sk-daylight .qslot { border-color:#CAD4E1; }
}
@media screen {
  body.sk-pastel .sk-aurora .s-held .qslot,
  body.sk-pastel .sk-daylight .s-held .qslot { border-color:#9BA7DE; }
}
@media screen {
  body.sk-pastel .qmsg,
  body.sk-pastel .sk-aurora .qmsg,
  body.sk-pastel .sk-daylight .qmsg {
    color:#5263B9;
    background:#EEF0FF;
    border-color:#AEB7E6;
    border-radius:999px;
    box-shadow:0 2px 7px rgba(82,99,185,.10);
  }
}
@media screen {
  body.sk-pastel .qempty,
  body.sk-pastel .qstatecap,
  body.sk-pastel .qreason,
  body.sk-pastel .qarr,
  body.sk-pastel .sk-aurora .qempty,
  body.sk-pastel .sk-daylight .qempty,
  body.sk-pastel .sk-aurora .qstatecap,
  body.sk-pastel .sk-daylight .qstatecap,
  body.sk-pastel .sk-aurora .qreason,
  body.sk-pastel .sk-daylight .qreason,
  body.sk-pastel .sk-aurora .qarr,
  body.sk-pastel .sk-daylight .qarr { color:#738095; }
}
@media screen {
  body.sk-pastel .sk-aurora .qside-in,
  body.sk-pastel .sk-daylight .qside-in { color:#287A55; }
}
@media screen {
  body.sk-pastel .sk-aurora .qside-out,
  body.sk-pastel .sk-daylight .qside-out { color:#A56B20; }
}`,
    },
    {
      order: 2117,
      css: String.raw`@media screen {

  body.sk-blueprint .qtrack{gap:6px;}
}
@media screen {
  body.sk-blueprint .docview .qslot{min-height:30px;padding:3px 6px;border-radius:0;border-color:#69A8C0;}
}
@media screen {
  body.sk-blueprint .docview .s-held .qslot{border-color:#58E7FF;}
}
@media screen {
  body.sk-blueprint .qmsg{padding:3px 8px;border-radius:0;}
}
@media screen {
  body.sk-blueprint .docview .qmsg{color:#FFFFFF;background:#0A447E;border-color:#8EEAFF;}
}
@media screen {
  body.sk-blueprint .docview .qempty,body.sk-blueprint .docview .qstatecap{color:#AECFDF;}
}
@media screen {
  body.sk-blueprint .docview .qreason{color:#9EC2D4;}
}
@media screen {
  body.sk-blueprint .docview .qside-in{color:#47F590;}
}
@media screen {
  body.sk-blueprint .docview .qside-out{color:#FFD166;}
}`,
    },
  ],
});

/* queue authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('queue', {
  authoring: {
    template: { title: 'Queue', initial: { state: 'empty' } },
    setupFields: [['initial', 'json']],
    patchFields: [
      ['state', 'enum', ['empty', 'enqueue', 'held', 'dequeue']],
      ['label', 'text'],
      ['from', 'text'],
      ['to', 'text'],
      ['reason', 'text'],
    ],
    picker: {
      order: 5,
      name: 'Message queue',
      category: 'Software & data',
      tagline: 'A message on its journey',
      description:
        'Show a message arriving, waiting, or leaving, including what it is waiting for.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = { state: 'held', label: 'order.created', reason: 'worker ready' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
