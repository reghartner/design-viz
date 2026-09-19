/* phone panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
function phoneBrand(panel) {
  var brand = panel && panel.brand;
  if (!phoneBrandIsPlainObject(brand)) return null;
  var out = {};
  if (typeof brand.app === 'string') out.app = brand.app;
  if (
    typeof brand.logo === 'string' &&
    brand.logo.length >= 1 &&
    brand.logo.length <= 4
  )
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
  } else if (
    stepsOrState &&
    typeof stepsOrState === 'object' &&
    !Array.isArray(stepsOrState)
  ) {
    /* Conventional widget-model form: phoneModel(panel, absoluteState). */
    state = stepsOrState;
  } else {
    /* Compact renderer form: phoneModel(absoluteState). */
    state = panelOrState || {};
  }
  var notifications = (
    Array.isArray(state.notifications) ? state.notifications : []
  )
    .map(function (n) {
      if (
        !n ||
        typeof n !== 'object' ||
        Array.isArray(n) ||
        typeof n.app !== 'string' ||
        !n.app
      )
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
    added:
      typeof state._phoneAdded === 'number'
        ? Math.max(0, Math.round(state._phoneAdded))
        : 0,
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
    ? 'Phone with ' +
      m.count +
      ' unread notification' +
      (m.count === 1 ? '' : 's')
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
        ? '<span class="phonelogo" aria-hidden="true">' +
          esc(brand.logo) +
          '</span>'
        : '') +
      (brand.app
        ? '<span class="phonebrandname">' + esc(brand.app) + '</span>'
        : '') +
      '</div>';
  if (m.count)
    h += '<span class="phonebadge" aria-hidden="true">' + m.badge + '</span>';
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
          ? '<div class="phonetitle" title="' +
            esc(card.title) +
            '">' +
            esc(card.title) +
            '</div>'
          : '') +
        (card.text
          ? '<div class="phonetext" title="' +
            esc(card.text) +
            '">' +
            esc(card.text) +
            '</div>'
          : '') +
        '</div>';
    });
  }
  h += '</div>';
  if (m.overflow)
    h += '<div class="phoneoverflow">+' + m.overflow + ' more</div>';
  return h + '<span class="phonehome" aria-hidden="true"></span></div>';
}

/* Camera-details UI with field-level provenance. Everything is authored data;
   even endpoint labels are inert text. Source selection is local viewer state. */

PanelViews.register(
  'phone',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var hBaseline = null;
    var phm = phoneModel(state);
    /* Like pir/radar, entry is derived from the transition we actually
       painted, never from the target snapshot's `_phoneAdded` marker. That
       marker is also present when navigating backward onto its source step.
       Requiring an adjacent forward step and a strictly deeper stack keeps
       backward navigation, jumps/deep links, and settled export renders free
       of one-shot markup. */
    var phonePrevStack = Array.isArray(host._phoneStack)
      ? host._phoneStack
      : null;
    var phoneDeeper =
      phonePrevStack !== null &&
      phm.notifications.length > phonePrevStack.length &&
      phonePrevStack.every(function (previousCard, previousIndex) {
        var nextCard =
          phm.notifications[
            phm.notifications.length - phonePrevStack.length + previousIndex
          ];
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
  }
);
