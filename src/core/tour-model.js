/* Pure model for the first-run guided tour: config shape, persona filtering,
   skip/renumber logic, cutout-rect math and completion-flag parsing. No DOM —
   the browser fragment (tour.flowview.js) feeds it probe results and rects.
   The config contract for retargeting agents is documented in docs/tour.md. */

var TOUR_STORAGE_KEY = 'dv_tour_v1';
var TOUR_COOKIE_NAME = 'dv_tour';
var TOUR_PERSONAS = ['ux', 'eng', 'both'];
var TOUR_STEP_KINDS = ['chooser', 'spot', 'done'];

function tourIsObject(value){
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/* Warnings only, never errors: a malformed tour must not stop a page from
   rendering — the viewer just skips the tour (boot treats [] as clean). */
function tourLintConfig(config){
  var warnings = [];
  function warn(path, message){ warnings.push('page.tour' + path + ': ' + message); }
  if (config == null) return warnings;
  if (!tourIsObject(config)){ warn('', 'must be an object'); return warnings; }
  if (config.version !== 1) warn('.version', 'unknown version — this viewer implements version 1');
  if (!Array.isArray(config.steps) || !config.steps.length){
    warn('.steps', 'must be a non-empty array of steps');
    return warnings;
  }
  var seen = {}, choosersSeen = 0;
  config.steps.forEach(function(step, i){
    if (tourIsObject(step) && step.kind === 'chooser'){
      choosersSeen++;
      if (i !== 0) warn('.steps[' + i + ']', 'a chooser must be the first step (later choosers are dropped)');
      if (choosersSeen > 1) warn('.steps[' + i + ']', 'only one chooser step is used');
    }
    var at = '.steps[' + i + ']';
    if (!tourIsObject(step)){ warn(at, 'must be an object'); return; }
    if (typeof step.id !== 'string' || !step.id) warn(at + '.id', 'required non-empty string');
    else if (seen[step.id]) warn(at + '.id', 'duplicate id "' + step.id + '"');
    else seen[step.id] = true;
    if (step.kind != null && TOUR_STEP_KINDS.indexOf(step.kind) < 0)
      warn(at + '.kind', 'unknown kind "' + step.kind + '" (chooser | spot | done)');
    if (step.personas != null){
      if (!Array.isArray(step.personas) || !step.personas.length)
        warn(at + '.personas', 'must be a non-empty array when present');
      else step.personas.forEach(function(p){
        if (TOUR_PERSONAS.indexOf(p) < 0) warn(at + '.personas', 'unknown persona "' + p + '"');
      });
    }
    var kind = step.kind || 'spot';
    if (kind === 'spot'){
      if (!tourIsObject(step.target) || typeof step.target.selector !== 'string' || !step.target.selector)
        warn(at + '.target.selector', 'spot steps need a CSS selector string');
      else if (step.target.within != null && step.target.within !== 'section' && step.target.within !== 'page')
        warn(at + '.target.within', 'must be "section" or "page"');
    }
    if (step.offset != null){
      if (!tourIsObject(step.offset)) warn(at + '.offset', 'must be an object of numbers');
      else ['dx', 'dy', 'dw', 'dh'].forEach(function(key){
        if (step.offset[key] != null && typeof step.offset[key] !== 'number')
          warn(at + '.offset.' + key, 'must be a number');
      });
    }
    if (step.copy != null && !tourIsObject(step.copy)) warn(at + '.copy', 'must be an object');
    if (tourIsObject(step.copy) && step.copy.choices != null){
      if (!Array.isArray(step.copy.choices) || !step.copy.choices.length)
        warn(at + '.copy.choices', 'must be a non-empty array of {persona, label, sub} objects');
      else step.copy.choices.forEach(function(choice, ci){
        if (!tourIsObject(choice)) warn(at + '.copy.choices[' + ci + ']', 'must be an object');
        else if (choice.persona != null && TOUR_PERSONAS.indexOf(choice.persona) < 0)
          warn(at + '.copy.choices[' + ci + '].persona', 'unknown persona "' + choice.persona + '"');
      });
    }
    if (step.demo != null){
      if (!tourIsObject(step.demo)) warn(at + '.demo', 'must be an object');
      else {
        var hasAdvance = step.demo.advance != null, hasClick = step.demo.click != null;
        if (hasAdvance === hasClick)
          warn(at + '.demo', 'declare exactly one of advance (a playback demo) or click (a demonstrated action)');
        if (hasAdvance && (typeof step.demo.advance !== 'number' || step.demo.advance < 1))
          warn(at + '.demo.advance', 'must be a positive number of steps');
        if (step.demo.intervalMs != null && !hasAdvance)
          warn(at + '.demo.intervalMs', 'only applies to an advance demo');
        if (step.demo.intervalMs != null && (typeof step.demo.intervalMs !== 'number' || step.demo.intervalMs < 400))
          warn(at + '.demo.intervalMs', 'must be a number ≥ 400');
        if (hasClick){
          if (!tourIsObject(step.demo.click) || typeof step.demo.click.selector !== 'string' || !step.demo.click.selector)
            warn(at + '.demo.click', 'needs a selector string');
          else if (step.demo.click.within != null && step.demo.click.within !== 'section' && step.demo.click.within !== 'page')
            warn(at + '.demo.click.within', 'must be "section" or "page"');
        }
      }
    }
    if (step.diagramState != null && !tourIsObject(step.diagramState))
      warn(at + '.diagramState', 'must be an object');
    if (step.secondary != null){
      var secondaries = Array.isArray(step.secondary) ? step.secondary : [step.secondary];
      if (!secondaries.length) warn(at + '.secondary', 'must not be an empty list');
      secondaries.forEach(function(item, si){
        var here = Array.isArray(step.secondary) ? at + '.secondary[' + si + ']' : at + '.secondary';
        if (!tourIsObject(item) || !tourIsObject(item.target) ||
            typeof item.target.selector !== 'string')
          warn(here, 'needs target.selector when present');
      });
    }
  });
  return warnings;
}

/* A config is usable when it lints clean enough to walk: object, version 1,
   at least one well-formed step. Boot falls back to the built-in default. */
function tourUsableConfig(config){
  if (!tourIsObject(config) || config.version !== 1) return false;
  if (!Array.isArray(config.steps)) return false;
  return config.steps.some(function(step){
    return tourIsObject(step) && typeof step.id === 'string' && !!step.id;
  });
}

/* Persona visibility: a step without personas is for everyone; the "both"
   persona sees every step; otherwise the list must name the persona. */
function tourStepVisible(step, persona){
  if (!step.personas || !step.personas.length) return true;
  if (persona === 'both') return true;
  return step.personas.indexOf(persona) >= 0;
}

function tourStepsForPersona(config, persona){
  return config.steps.filter(function(step){
    return tourIsObject(step) && typeof step.id === 'string' && !!step.id &&
           tourStepVisible(step, persona);
  });
}

/* Timeline label: chooser is a gate, not a counted stop. The count is the
   authored, persona-filtered list — a step whose target is missing at entry
   is passed through with a console warning, not renumbered away. */
function tourTimeline(steps, index){
  var counted = steps.filter(function(step){ return (step.kind || 'spot') !== 'chooser'; });
  var current = 0;
  for (var i = 0; i <= index && i < steps.length; i++)
    if ((steps[i].kind || 'spot') !== 'chooser') current++;
  return {total: counted.length, current: current};
}

/* Cutout rect: pad the target's viewport rect, apply the config's small
   nudge offsets, clamp to the viewport so rings never paint off-screen. */
function tourCutoutRect(rect, offset, pad, viewport){
  pad = pad == null ? 8 : pad;
  offset = tourIsObject(offset) ? offset : {};
  var dx = typeof offset.dx === 'number' ? offset.dx : 0;
  var dy = typeof offset.dy === 'number' ? offset.dy : 0;
  var dw = typeof offset.dw === 'number' ? offset.dw : 0;
  var dh = typeof offset.dh === 'number' ? offset.dh : 0;
  var x = rect.x - pad + dx, y = rect.y - pad + dy;
  var w = rect.w + pad * 2 + dw, h = rect.h + pad * 2 + dh;
  if (viewport){
    if (x < 0){ w += x; x = 0; }
    if (y < 0){ h += y; y = 0; }
    if (x + w > viewport.w) w = viewport.w - x;
    if (y + h > viewport.h) h = viewport.h - y;
  }
  return {x: x, y: y, w: Math.max(0, w), h: Math.max(0, h)};
}

/* Completion flag fallback for storage-denied contexts (sandboxed iframes). */
function tourDoneFromCookie(cookieText){
  if (typeof cookieText !== 'string') return false;
  return cookieText.split(';').some(function(part){
    var eq = part.indexOf('=');
    return eq >= 0 && part.slice(0, eq).trim() === TOUR_COOKIE_NAME &&
           part.slice(eq + 1).trim() === '1';
  });
}

/* #tour=1 forces the tour, #tour=0 suppresses it; parseHash ignores the key. */
function tourHashRequest(hash){
  var m = /(?:^#|[#&])tour=([01])(?:&|$)/.exec(String(hash || ''));
  return m ? (m[1] === '1' ? 'force' : 'suppress') : null;
}
