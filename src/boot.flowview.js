/* boot.flowview.js — boots the standalone render target. The embedded JSON
   block is the primary source; when that block still holds the built-in demo
   (marker "__demo") a ?spec=<relative.json> query fetches an adjacent spec
   file instead. http(s)-served pages only — file:// cannot fetch, which is
   why injection (tools/inject.py) stays the default distribution mode.
   Browser-only fragment, concatenated last by tools/build.py. */

var view = document.getElementById('docview');
var backlinkBlock = document.getElementById('flowbacklinks');
var backlinkData = parseBacklinks(backlinkBlock ? backlinkBlock.textContent : null);
var deepLinkChannel = null;
var pendingLinkBase = null;
var bootFailed = false;
window.dvSkins = SKIN_NAMES.slice();
window.dvSetSkin = function(name){
  return applySkinClasses(document.body, view, name);
};
/* Host skin channel: an embedding shell (iframe parent) may post
   {type:'dv_skin', skin:<name>} when its theme picker changes. No origin
   restriction on purpose — pages are static files served from arbitrary
   hosts, so the legitimate origin is unknowable at build time; the payload
   is whitelist-validated and the only effect is cosmetic (a skin class
   swap). Routed through window.dvSetSkin so a host that wraps it still
   sees these calls. */
window.addEventListener('message', function(e){
  if (e.data && e.data.type === 'dv_skin' &&
      typeof window.dvSetSkin === 'function' &&
      SKIN_NAMES.indexOf(e.data.skin) >= 0){
    window.dvSetSkin(e.data.skin);
  }
  if (e.data && e.data.type === 'dv_linkbase'){
    if (deepLinkChannel) deepLinkChannel.receiveLinkBaseMessage(e);
    /* async ?spec= boot: the shell's iframe-load handler can post before
       the page has rendered — keep the newest message and replay it when
       the channel exists (validation and parent-pinning happen there).
       After a terminal boot failure there is nothing to replay into, so
       stop retaining message events. */
    else if (!bootFailed) pendingLinkBase = e;
  }
});
function readCookieText(){
  try { return document.cookie || ''; }
  catch (ex) { return ''; } /* sandboxed pages may deny cookie reads */
}
function fail(msgs){
  bootFailed = true;
  pendingLinkBase = null;
  applySkinClasses(document.body, view, 'aurora');
  var pre = document.createElement('pre');
  pre.className = 'errbox';
  pre.textContent = 'Flowview: the spec did not render.\n\n' + msgs.map(function(m){ return '- ' + m; }).join('\n');
  view.appendChild(pre);
}

function boot(raw){
  var page = normalize(raw);
  var v = validate(page);
  var lint = v.errors.length ? [] : lintPage(page);
  v.warnings.concat(lint).forEach(function(w){ if (window.console) console.warn('flowspec: ' + w); });
  if (v.errors.length){ fail(v.errors); return; }
  var bootSkin = resolveSkin(readCookieText(), page.skin);
  applySkinClasses(document.body, view, bootSkin);
  var ctl = renderPage(view, page, bootSkin, backlinkData);
  deepLinkChannel = wireDeepLinks(ctl, window); /* tabs, every diagram/step, contract cards + rows */
  if (pendingLinkBase){
    deepLinkChannel.receiveLinkBaseMessage(pendingLinkBase);
    pendingLinkBase = null;
  }
  wirePresenter(ctl, view, window);
}

var raw = null, parseErr = null;
try {
  raw = JSON.parse(document.getElementById('flowspec').textContent);
} catch (ex){
  parseErr = 'JSON parse: ' + ex.message;
}
var specParam = /[?&]spec=([^&#]+)/.exec(window.location.search);
var isDemo = !!(raw && raw.page && raw.page.__demo);

if (specParam && (isDemo || parseErr)){
  applySkinClasses(document.body, view, resolveSkin(readCookieText()));
  var specUrl = decodeURIComponent(specParam[1]);
  fetch(specUrl).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }).then(boot).catch(function(ex){
    fail(['?spec fetch "' + specUrl + '": ' + ex.message,
          'The ?spec= mode works only on http(s)-served pages — file:// cannot fetch.',
          'For a file that opens anywhere, inject the spec instead: tools/inject.py <spec.json> <template> <out.html>.']);
  });
} else if (parseErr){
  fail([parseErr]);
} else {
  boot(raw);
}
