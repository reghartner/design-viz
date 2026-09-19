/* phone validation and pure state helpers. */
function phoneBrandIsPlainObject(obj) {
  if (!obj || Object.prototype.toString.call(obj) !== '[object Object]') return false;
  var proto = Object.getPrototypeOf(obj);
  return (
    proto === null ||
    (Object.prototype.hasOwnProperty.call(proto, 'constructor') &&
      typeof proto.constructor === 'function' &&
      Function.prototype.toString.call(proto.constructor) ===
        Function.prototype.toString.call(Object))
  );
}

function phoneBrandWarnings(panel, path, warnings) {
  if (!Object.prototype.hasOwnProperty.call(panel, 'brand')) return;
  var brand = panel.brand;
  path += '.brand';
  if (!phoneBrandIsPlainObject(brand)) {
    warnings.push(path + ': must be a plain object — ignored');
    return;
  }
  ['accent', 'bg', 'fg'].forEach(function (k) {
    if (
      Object.prototype.hasOwnProperty.call(brand, k) &&
      (typeof brand[k] !== 'string' ||
        (brand[k].length !== 4 && brand[k].length !== 7) ||
        !/^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand[k]))
    )
      warnings.push(path + '.' + k + ': must be #RGB or #RRGGBB hex — ignored');
  });
  if (
    Object.prototype.hasOwnProperty.call(brand, 'logo') &&
    (typeof brand.logo !== 'string' || brand.logo.length < 1 || brand.logo.length > 4)
  )
    warnings.push(path + '.logo: must be a string of 1-4 characters — ignored');
  if (Object.prototype.hasOwnProperty.call(brand, 'app') && typeof brand.app !== 'string')
    warnings.push(path + '.app: must be a string — ignored');
}

/* Phone patches are operations, validated for both initial and steps. */
function phonePatchWarnings(obj, path, warnings) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return;
  Object.keys(obj).forEach(function (k) {
    if (['clock', 'notify', 'clear'].indexOf(k) < 0)
      warnings.push(path + '.' + k + ': not a phone field — ignored (valid: clock, notify, clear)');
  });
  if (Object.prototype.hasOwnProperty.call(obj, 'clock') && typeof obj.clock !== 'string')
    warnings.push(path + '.clock: must be a string — ignored');
  if (Object.prototype.hasOwnProperty.call(obj, 'clear') && obj.clear !== true)
    warnings.push(path + '.clear: must be true — ignored');
  if (!Object.prototype.hasOwnProperty.call(obj, 'notify')) return;
  var entries = Array.isArray(obj.notify) ? obj.notify : [obj.notify];
  entries.forEach(function (n, i) {
    var np = path + '.notify' + (Array.isArray(obj.notify) ? '[' + i + ']' : '');
    if (!n || typeof n !== 'object' || Array.isArray(n)) {
      warnings.push(np + ': expected {app, title?, text?} — notification ignored');
      return;
    }
    if (typeof n.app !== 'string' || !n.app)
      warnings.push(np + '.app: required non-empty string — notification ignored');
    ['title', 'text'].forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(n, k) && typeof n[k] !== 'string')
        warnings.push(np + '.' + k + ': must be a string — ignored');
    });
    Object.keys(n).forEach(function (k) {
      if (['app', 'title', 'text'].indexOf(k) < 0)
        warnings.push(
          np + '.' + k + ': not a notification field — ignored (valid: app, title, text)'
        );
    });
  });
}
/* Fold phone operations into absolute snapshots. The complete unread stack
   is retained newest-step-first; a single step's array keeps authored order.
   `_phoneAdded` is presentation metadata for the one-shot newest-card cue and
   is recomputed per target step, never carried. */
function foldPhoneStates(panel, steps) {
  panel = panel || {};
  steps = Array.isArray(steps) ? steps : [];
  var clock = '',
    notifications = [],
    states = [];
  function validNotification(n) {
    return n && typeof n === 'object' && !Array.isArray(n) && typeof n.app === 'string' && !!n.app;
  }
  function cleanNotification(n) {
    return {
      app: n.app,
      title: typeof n.title === 'string' ? n.title : '',
      text: typeof n.text === 'string' ? n.text : '',
    };
  }
  function apply(patch) {
    patch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {};
    if (typeof patch.clock === 'string') clock = patch.clock;
    if (patch.clear === true) notifications = [];
    if (!Object.prototype.hasOwnProperty.call(patch, 'notify')) return 0;
    var raw = Array.isArray(patch.notify) ? patch.notify : [patch.notify];
    var pushed = raw.filter(validNotification).map(cleanNotification);
    if (pushed.length) notifications = pushed.concat(notifications);
    return pushed.length;
  }
  apply(panel.initial);
  steps.forEach(function (st) {
    var all = stepPanelPatch(st) || {};
    var added = apply(all[panel.id]);
    states.push({
      clock: clock,
      notifications: notifications.map(cleanNotification),
      _phoneAdded: added,
    });
  });
  if (!steps.length)
    states.push({
      clock: clock,
      notifications: notifications.map(cleanNotification),
      _phoneAdded: 0,
    });
  return states;
}

PanelRegistry.extend('phone', {
  validateDeclaration: function (p, PP, warnings, errors, d) {
    phoneBrandWarnings(p, PP, warnings);
    phonePatchWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    phonePatchWarnings(patch, path, warnings);
  },
  fold: foldPhoneStates,
});

/* phone panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function phoneBrand(panel) {
  var brand = panel && panel.brand;
  if (!phoneBrandIsPlainObject(brand)) return null;
  var out = {};
  if (typeof brand.app === 'string') out.app = brand.app;
  if (typeof brand.logo === 'string' && brand.logo.length >= 1 && brand.logo.length <= 4)
    out.logo = brand.logo;
  /* These values enter an inline style: accept only literal hex colors. */
  ['accent', 'bg', 'fg'].forEach(function (k) {
    if (
      typeof brand[k] === 'string' &&
      (brand[k].length === 4 || brand[k].length === 7) &&
      /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(brand[k])
    )
      out[k] = brand[k];
  });
  return Object.keys(out).length ? out : null;
}

function phoneModel(panelOrState, stepsOrState, currentStep) {
  var state;
  /* Public fold form: phoneModel(panel, diagramSteps, targetIndex). This is
     useful to callers/tests that need the complete target state without
     first reaching through foldPanelStates. Omit targetIndex for the end. */
  if (Array.isArray(stepsOrState)) {
    var folded = foldPhoneStates(panelOrState || {}, stepsOrState);
    var target =
      typeof currentStep === 'number' && isFinite(currentStep)
        ? Math.round(currentStep)
        : folded.length - 1;
    state = folded[clamp(target, 0, folded.length - 1)] || {};
  } else if (stepsOrState && typeof stepsOrState === 'object' && !Array.isArray(stepsOrState)) {
    /* Conventional widget-model form: phoneModel(panel, absoluteState). */
    state = stepsOrState;
  } else {
    /* Compact renderer form: phoneModel(absoluteState). */
    state = panelOrState || {};
  }
  var notifications = (Array.isArray(state.notifications) ? state.notifications : [])
    .map(function (n) {
      if (!n || typeof n !== 'object' || Array.isArray(n) || typeof n.app !== 'string' || !n.app)
        return null;
      return {
        app: n.app,
        title: typeof n.title === 'string' ? n.title : '',
        text: typeof n.text === 'string' ? n.text : '',
      };
    })
    .filter(Boolean);
  return {
    clock: typeof state.clock === 'string' ? state.clock : '',
    notifications: notifications,
    cards: notifications.slice(0, 3),
    count: notifications.length,
    badge: notifications.length,
    overflow: Math.max(0, notifications.length - 3),
    added: typeof state._phoneAdded === 'number' ? Math.max(0, Math.round(state._phoneAdded)) : 0,
  };
}

function phonePanelHTML(panel, state, fresh) {
  panel = panel || {};
  var m = phoneModel(panel, state);
  var brand = phoneBrand(panel);
  var styles = [];
  if (brand) {
    if (brand.accent) styles.push('--phacc:' + brand.accent);
    if (brand.bg) styles.push('--phbg:' + brand.bg);
    if (brand.fg) styles.push('--phfg:' + brand.fg);
  }
  var label = m.count
    ? 'Phone with ' + m.count + ' unread notification' + (m.count === 1 ? '' : 's')
    : 'Phone with no notifications';
  if (brand && brand.app) label = brand.app + ' phone' + label.slice(5);
  var h =
    '<div class="phoneframe"' +
    (styles.length ? ' style="' + styles.join(';') + '"' : '') +
    ' role="img" aria-label="' +
    esc(label) +
    '">' +
    '<span class="phonespeaker" aria-hidden="true"></span>' +
    '<div class="phonestatus"><span class="phoneclock">' +
    esc(m.clock) +
    '</span>' +
    '<span class="phoneglyphs" aria-hidden="true"><span class="phonesignal"><i></i><i></i><i></i></span>' +
    '<span class="phonebattery"><i></i></span></span></div>';
  if (brand && (brand.app || brand.logo))
    h +=
      '<div class="phonebrand">' +
      (brand.logo
        ? '<span class="phonelogo" aria-hidden="true">' + esc(brand.logo) + '</span>'
        : '') +
      (brand.app ? '<span class="phonebrandname">' + esc(brand.app) + '</span>' : '') +
      '</div>';
  if (m.count) h += '<span class="phonebadge" aria-hidden="true">' + m.badge + '</span>';
  h += '<div class="phonecards">';
  if (!m.cards.length) {
    h += '<div class="phoneempty">no notifications</div>';
  } else {
    m.cards.forEach(function (card, i) {
      h +=
        '<div class="phonecard' +
        (fresh && i === 0 ? ' fresh' : '') +
        '">' +
        '<div class="phoneapp" title="' +
        esc(card.app) +
        '">' +
        esc(card.app) +
        '</div>' +
        (card.title
          ? '<div class="phonetitle" title="' + esc(card.title) + '">' + esc(card.title) + '</div>'
          : '') +
        (card.text
          ? '<div class="phonetext" title="' + esc(card.text) + '">' + esc(card.text) + '</div>'
          : '') +
        '</div>';
    });
  }
  h += '</div>';
  if (m.overflow) h += '<div class="phoneoverflow">+' + m.overflow + ' more</div>';
  return h + '<span class="phonehome" aria-hidden="true"></span></div>';
}

/* Camera-details UI with field-level provenance. Everything is authored data;
   even endpoint labels are inert text. Source selection is local viewer state. */

PanelViews.register('phone', function (host, panel, state, skin, states, stepIdx, animate) {
  var h = '';
  var hBaseline = null;
  var phm = phoneModel(state);
  /* Like pir/radar, entry is derived from the transition we actually
       painted, never from the target snapshot's `_phoneAdded` marker. That
       marker is also present when navigating backward onto its source step.
       Requiring an adjacent forward step and a strictly deeper stack keeps
       backward navigation, jumps/deep links, and settled export renders free
       of one-shot markup. */
  var phonePrevStack = Array.isArray(host._phoneStack) ? host._phoneStack : null;
  var phoneDeeper =
    phonePrevStack !== null &&
    phm.notifications.length > phonePrevStack.length &&
    phonePrevStack.every(function (previousCard, previousIndex) {
      var nextCard =
        phm.notifications[phm.notifications.length - phonePrevStack.length + previousIndex];
      return (
        nextCard &&
        nextCard.app === previousCard.app &&
        nextCard.title === previousCard.title &&
        nextCard.text === previousCard.text
      );
    });
  var phoneFresh =
    animate &&
    validRevealIndex(host._phoneStep) &&
    validRevealIndex(stepIdx) &&
    stepIdx === host._phoneStep + 1 &&
    phoneDeeper;
  host._phoneStep = validRevealIndex(stepIdx) ? stepIdx : null;
  host._phoneStack = phm.notifications.map(function (card) {
    return { app: card.app, title: card.title, text: card.text };
  });
  h += phonePanelHTML(panel, state, phoneFresh);
  hBaseline = phoneFresh ? phonePanelHTML(panel, state, false) : null;
  return { html: h, baseline: hBaseline };
});

PanelRegistry.extend('phone', {
  order: 20,
  label: 'Phone',
  since: '0.1.0',
  layout: {
    height: 10,
  },
});

PanelRegistry.extend('phone', {
  styles: [
    {
      order: 429,
      css: String.raw`.phoneframe{position:relative;box-sizing:border-box;width:178px;min-height:252px;margin:0 auto;padding:30px 11px 19px;
  overflow:hidden;border:2px solid;border-radius:25px;font:500 9px/1.25 'IBM Plex Mono',monospace;}
.phonespeaker{position:absolute;top:9px;left:50%;width:36px;height:4px;transform:translateX(-50%);border-radius:999px;}
.phonestatus{position:absolute;top:16px;left:13px;right:13px;display:flex;align-items:center;justify-content:space-between;
  height:11px;font-size:8px;font-weight:700;}
.phonebrand{display:flex;align-items:center;gap:5px;min-width:0;padding:3px 18px 0 0;}
.phonelogo{flex:0 0 18px;height:18px;border-radius:4px;text-align:center;font-size:6px;font-weight:800;line-height:18px;
  color:#FFFFFF;background:var(--phacc, #4956C9);}
.phonebrandname{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;font-weight:700;
  color:var(--phfg, inherit);}
.phoneclock{max-width:88px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.phoneglyphs{display:flex;align-items:flex-end;gap:5px;}
.phonesignal{display:flex;align-items:flex-end;gap:1px;height:8px;}
.phonesignal i{display:block;width:2px;border-radius:1px;}
.phonesignal i:nth-child(1){height:3px;}
.phonesignal i:nth-child(2){height:5px;}
.phonesignal i:nth-child(3){height:8px;}
.phonebattery{position:relative;display:block;box-sizing:border-box;width:14px;height:7px;border:1px solid;border-radius:2px;}
.phonebattery::after{content:"";position:absolute;right:-3px;top:2px;width:2px;height:3px;border-radius:0 1px 1px 0;background:currentColor;}
.phonebattery i{display:block;width:8px;height:3px;margin:1px;border-radius:1px;background:currentColor;}
.phonebadge{position:absolute;z-index:2;top:35px;right:8px;min-width:17px;height:17px;padding:0 4px;box-sizing:border-box;
  border-radius:999px;text-align:center;font-size:8px;font-weight:800;line-height:17px;}
.phonecards{display:flex;flex-direction:column;gap:6px;min-height:181px;padding-top:8px;}
.phonecard{box-sizing:border-box;max-height:58px;padding:6px 8px;overflow:hidden;border:1px solid;border-radius:10px;}
.phonecard.fresh{animation:phonecardin .48s cubic-bezier(.2,.8,.2,1) both;}
@keyframes phonecardin{from{opacity:0;transform:translateY(-10px) scale(.96);}to{opacity:1;transform:none;}}
.phoneapp,.phonetitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.phoneapp{font-size:7.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;}
.phonetitle{margin-top:2px;font-size:9px;font-weight:800;}
.phonetext{display:-webkit-box;margin-top:2px;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;font:500 8px/1.25 'IBM Plex Sans',sans-serif;}
.phoneoverflow{text-align:center;font-size:8px;font-weight:700;letter-spacing:.04em;}
.phoneempty{margin:auto;text-align:center;font-size:8px;letter-spacing:.05em;text-transform:uppercase;opacity:.58;}
.phonehome{position:absolute;bottom:8px;left:50%;width:42px;height:3px;transform:translateX(-50%);border-radius:999px;}
.sk-aurora .phoneframe{color:var(--phfg, #D9E4F2);background:var(--phbg, #09111E);border-color:#718099;box-shadow:inset 0 0 0 2px #16233A;}
.sk-aurora .phonespeaker,.sk-aurora .phonehome{background:#718099;}
.sk-aurora .phonesignal i{background:#C7D3E3;}
.sk-aurora .phonebattery{color:#C7D3E3;border-color:#C7D3E3;}
.sk-aurora .phonecard{color:#DCE7F5;background:rgba(43,58,79,.92);border-color:#3A4B64;box-shadow:0 4px 12px rgba(0,0,0,.2);}
.sk-aurora .phonecard.fresh{border-color:var(--phacc, #3A4B64);}
.sk-aurora .phoneapp,.sk-aurora .phoneoverflow{color:var(--phacc, #8AE8FF);}
.sk-aurora .phonetext{color:#B7C4D5;}
.sk-aurora .phonebadge{color:#07121D;background:var(--phacc, #8AE8FF);}
.sk-aurora .phonelogo{color:#07121D;background:var(--phacc, #8AE8FF);}
.sk-daylight .phoneframe{color:var(--phfg, #282B33);background:var(--phbg, #F2F0EA);border-color:#777B84;box-shadow:inset 0 0 0 2px #FFFFFF;}
.sk-daylight .phonespeaker,.sk-daylight .phonehome{background:#777B84;}
.sk-daylight .phonesignal i{background:#4E535D;}
.sk-daylight .phonebattery{color:#4E535D;border-color:#4E535D;}
.sk-daylight .phonecard{color:#272A32;background:rgba(255,255,255,.94);border-color:#D6D2C8;box-shadow:0 4px 12px rgba(45,42,35,.1);}
.sk-daylight .phonecard.fresh{border-color:var(--phacc, #D6D2C8);}
.sk-daylight .phoneapp,.sk-daylight .phoneoverflow{color:var(--phacc, #4956C9);}
.sk-daylight .phonetext{color:#5F626B;}
.sk-daylight .phonebadge{color:#FFFFFF;background:var(--phacc, #4956C9);}
.sk-daylight .phonelogo{color:#FFFFFF;background:var(--phacc, #4956C9);}`,
    },
    {
      order: 1207,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .phonecard.fresh{animation:none !important;}
}`,
    },
    {
      order: 1265,
      css: String.raw`@media print{
  .phoneframe{color:#222222 !important;background:#FFFFFF !important;border-color:#555555 !important;
    box-shadow:inset 0 0 0 2px #EEEEEE !important;break-inside:avoid;}
}
@media print{
  .phonespeaker,.phonehome,.phonesignal i{background:#555555 !important;}
}
@media print{
  .phonebattery{color:#555555 !important;border-color:#555555 !important;}
}
@media print{
  .phonecard{color:#222222 !important;background:#F4F4F4 !important;border-color:#BBBBBB !important;box-shadow:none !important;}
}
@media print{
  .phoneapp,.phoneoverflow,.phonetext{color:#555555 !important;}
}
@media print{
  .phonebadge{color:#FFFFFF !important;background:#333333 !important;}
}
@media print{
  .phonecard.fresh{animation:none !important;}
}`,
    },
    {
      order: 1457,
      css: String.raw`body.sk-editorial .sk-aurora .phoneframe,
body.sk-editorial .sk-daylight .phoneframe{
  color:var(--phfg, var(--ed-ink));background:var(--phbg, var(--ed-paper));border-color:var(--ed-ink);
  border-radius:18px;box-shadow:inset 0 0 0 2px #FFFDF8;
}
body.sk-editorial .sk-aurora .phonespeaker,
body.sk-editorial .sk-daylight .phonespeaker,
body.sk-editorial .sk-aurora .phonehome,
body.sk-editorial .sk-daylight .phonehome,
body.sk-editorial .sk-aurora .phonesignal i,
body.sk-editorial .sk-daylight .phonesignal i{background:var(--ed-muted);}
body.sk-editorial .sk-aurora .phonebattery,
body.sk-editorial .sk-daylight .phonebattery{color:var(--ed-muted);border-color:var(--ed-muted);}
body.sk-editorial .sk-aurora .phonecard,
body.sk-editorial .sk-daylight .phonecard{
  color:var(--ed-ink);background:#FFFDF8;border-color:var(--ed-rule);border-radius:2px;box-shadow:none;
}
body.sk-editorial .sk-aurora .phonecard.fresh,
body.sk-editorial .sk-daylight .phonecard.fresh{border-color:var(--phacc, var(--ed-rule));}
body.sk-editorial .sk-aurora .phoneapp,
body.sk-editorial .sk-daylight .phoneapp,
body.sk-editorial .sk-aurora .phoneoverflow,
body.sk-editorial .sk-daylight .phoneoverflow{color:var(--phacc, var(--ed-accent));}
body.sk-editorial .sk-aurora .phonetext,
body.sk-editorial .sk-daylight .phonetext{color:var(--ed-muted);}
body.sk-editorial .sk-aurora .phonebadge,
body.sk-editorial .sk-daylight .phonebadge{color:#FFFDF8;background:var(--phacc, var(--ed-accent-deep));}
body.sk-editorial .sk-aurora .phonelogo,
body.sk-editorial .sk-daylight .phonelogo{color:#FFFDF8;background:var(--phacc, var(--ed-accent-deep));}`,
    },
    {
      order: 1663,
      css: String.raw`@media screen {

  body.sk-terminal .sk-aurora .phoneframe,
  body.sk-terminal .sk-daylight .phoneframe{
    color:var(--phfg, var(--tm-ink));background:var(--phbg, var(--tm-ground));border-color:var(--tm-line);
    border-radius:0;box-shadow:inset 0 0 0 1px var(--tm-line-dim) !important;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .phonespeaker,
  body.sk-terminal .sk-daylight .phonespeaker,
  body.sk-terminal .sk-aurora .phonehome,
  body.sk-terminal .sk-daylight .phonehome,
  body.sk-terminal .sk-aurora .phonesignal i,
  body.sk-terminal .sk-daylight .phonesignal i{background:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .phonebattery,
  body.sk-terminal .sk-daylight .phonebattery{color:var(--tm-good);border-color:var(--tm-good);}
}
@media screen {
  body.sk-terminal .sk-aurora .phonecard,
  body.sk-terminal .sk-daylight .phonecard{
    color:var(--tm-ink);background:var(--tm-raised);border-color:var(--tm-line);border-radius:0;box-shadow:none;
  }
}
@media screen {
  body.sk-terminal .sk-aurora .phonecard.fresh,
  body.sk-terminal .sk-daylight .phonecard.fresh{border-color:var(--phacc, var(--tm-line));}
}
@media screen {
  body.sk-terminal .sk-aurora .phoneapp,
  body.sk-terminal .sk-daylight .phoneapp,
  body.sk-terminal .sk-aurora .phoneoverflow,
  body.sk-terminal .sk-daylight .phoneoverflow{color:var(--phacc, var(--tm-good));}
}
@media screen {
  body.sk-terminal .sk-aurora .phonetext,
  body.sk-terminal .sk-daylight .phonetext{color:var(--tm-muted);}
}
@media screen {
  body.sk-terminal .sk-aurora .phonebadge,
  body.sk-terminal .sk-daylight .phonebadge{color:var(--tm-ground);background:var(--phacc, var(--tm-alert));border-radius:0;}
}
@media screen {
  body.sk-terminal .sk-aurora .phonelogo,
  body.sk-terminal .sk-daylight .phonelogo{color:var(--tm-ground);background:var(--phacc, var(--tm-alert));}
}`,
    },
    {
      order: 1886,
      css: String.raw`@media screen {

  body.sk-pastel .sk-aurora .phoneframe,
  body.sk-pastel .sk-daylight .phoneframe{
    color:var(--phfg, #2D3B54);background:var(--phbg, #F3F5FB);border-color:#9AA6DE;
    border-radius:27px;box-shadow:inset 0 0 0 2px #FFFFFF,0 7px 18px rgba(82,99,185,.1);
  }
}
@media screen {
  body.sk-pastel .sk-aurora .phonespeaker,
  body.sk-pastel .sk-daylight .phonespeaker,
  body.sk-pastel .sk-aurora .phonehome,
  body.sk-pastel .sk-daylight .phonehome,
  body.sk-pastel .sk-aurora .phonesignal i,
  body.sk-pastel .sk-daylight .phonesignal i{background:#758095;}
}
@media screen {
  body.sk-pastel .sk-aurora .phonebattery,
  body.sk-pastel .sk-daylight .phonebattery{color:#758095;border-color:#758095;}
}
@media screen {
  body.sk-pastel .sk-aurora .phonecard,
  body.sk-pastel .sk-daylight .phonecard{
    color:#2D3B54;background:#FFFFFF;border-color:#E0E6EF;border-radius:12px;box-shadow:0 3px 9px rgba(82,99,185,.09);
  }
}
@media screen {
  body.sk-pastel .sk-aurora .phonecard.fresh,
  body.sk-pastel .sk-daylight .phonecard.fresh{border-color:var(--phacc, #E0E6EF);}
}
@media screen {
  body.sk-pastel .sk-aurora .phoneapp,
  body.sk-pastel .sk-daylight .phoneapp,
  body.sk-pastel .sk-aurora .phoneoverflow,
  body.sk-pastel .sk-daylight .phoneoverflow{color:var(--phacc, #5263B9);}
}
@media screen {
  body.sk-pastel .sk-aurora .phonetext,
  body.sk-pastel .sk-daylight .phonetext{color:#6C788C;}
}
@media screen {
  body.sk-pastel .sk-aurora .phonebadge,
  body.sk-pastel .sk-daylight .phonebadge{color:#FFFFFF;background:var(--phacc, #D36370);}
}
@media screen {
  body.sk-pastel .sk-aurora .phonelogo,
  body.sk-pastel .sk-daylight .phonelogo{color:#FFFFFF;background:var(--phacc, #D36370);}
}`,
    },
    {
      order: 2126,
      css: String.raw`@media screen {

  body.sk-blueprint .sk-aurora .phoneframe,
  body.sk-blueprint .sk-daylight .phoneframe{
    color:var(--phfg, #FFFFFF);background:var(--phbg, #031E40);border-color:#63C7DF;border-radius:0;
    box-shadow:inset 0 0 0 2px #052956;
  }
}
@media screen {
  body.sk-blueprint .sk-aurora .phonespeaker,
  body.sk-blueprint .sk-daylight .phonespeaker,
  body.sk-blueprint .sk-aurora .phonehome,
  body.sk-blueprint .sk-daylight .phonehome,
  body.sk-blueprint .sk-aurora .phonesignal i,
  body.sk-blueprint .sk-daylight .phonesignal i{background:#58E7FF;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonebattery,
  body.sk-blueprint .sk-daylight .phonebattery{color:#58E7FF;border-color:#58E7FF;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonecard,
  body.sk-blueprint .sk-daylight .phonecard{
    color:#FFFFFF;background:#052956;border-color:#347B9A;border-radius:0;box-shadow:none;
  }
}
@media screen {
  body.sk-blueprint .sk-aurora .phonecard.fresh,
  body.sk-blueprint .sk-daylight .phonecard.fresh{border-color:var(--phacc, #347B9A);}
}
@media screen {
  body.sk-blueprint .sk-aurora .phoneapp,
  body.sk-blueprint .sk-daylight .phoneapp,
  body.sk-blueprint .sk-aurora .phoneoverflow,
  body.sk-blueprint .sk-daylight .phoneoverflow{color:var(--phacc, #58E7FF);}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonetext,
  body.sk-blueprint .sk-daylight .phonetext{color:#A9CCDD;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonebadge,
  body.sk-blueprint .sk-daylight .phonebadge{color:#052956;background:var(--phacc, #FFD166);border-radius:0;}
}
@media screen {
  body.sk-blueprint .sk-aurora .phonelogo,
  body.sk-blueprint .sk-daylight .phonelogo{color:#052956;background:var(--phacc, #FFD166);}
}`,
    },
  ],
});

/* phone authoring contract; merged into this panel definition by the bundle. */
PanelRegistry.extend('phone', {
  authoring: {
    template: { title: 'Phone', initial: { clock: '9:41' } },
    setupFields: [
      [
        'brand',
        'objf',
        { cols: [{ k: 'app' }, { k: 'logo' }, { k: 'accent' }, { k: 'bg' }, { k: 'fg' }] },
      ],
      ['initial', 'json'],
    ],
    patchFields: [
      ['clock', 'text'],
      ['notify', 'jsonAny'],
      ['clear', 'bool', { trueOnly: true }],
    ],
    picker: {
      order: 24,
      name: 'Phone notifications',
      category: 'Devices & interfaces',
      tagline: 'The user-facing moment',
      description: 'Show notifications stacking on a phone as events reach the user.',
    },
    origin: function (p, key, snapshot, context) {
      var assignment = context.assignment,
        history = context.history,
        input = context.input,
        own = context.own;
      if (key === 'notifications')
        return history(['notify', 'clear'], true, 'Computed notification history');
      if (key === 'clock')
        return assignment(
          key,
          function (v) {
            return typeof v === 'string';
          },
          false
        );
      return { kind: 'engine', label: 'Engine · presentation metadata', inputs: [] };
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      state = {
        clock: '9:41',
        notifications: [
          { app: 'Home', title: 'Someone is at the door', text: 'Front door · Just now' },
        ],
      };
      panel.initial = builderClone(state);

      panel.initial.notify = panel.initial.notifications;
      delete panel.initial.notifications;
      state = foldPhoneStates(panel, [])[0];

      return { panel: panel, state: state, states: states, step: step };
    },
  },
});
