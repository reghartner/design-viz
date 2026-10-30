/* boot.flowview.js — boots the standalone render target. The embedded JSON
   block is the primary source; when that block still holds the built-in demo
   (marker "__demo") a ?spec=<relative.json> query fetches an adjacent spec
   file instead. http(s)-served pages only — file:// cannot fetch, which is
   why injection (tools/inject.py) stays the default distribution mode.
   A page injected with --two-file (#826) carries <meta name="dv-spec-file">
   and fetches flowspec.json beside it: that file is the board's editable
   source, so it wins over the inline block, which stays the fallback when
   the file cannot load (file://, file missing, bad status, malformed JSON);
   that fallback is announced by a persistent banner. Whichever text boots
   is kept verbatim as the controller's sourceText.
   Browser-only fragment, concatenated last by tools/build.py. */

var view = document.getElementById('docview');
var backlinkBlock = document.getElementById('flowbacklinks');
var backlinkData = parseBacklinks(backlinkBlock ? backlinkBlock.textContent : null);
var deepLinkChannel = null;
var pendingLinkBase = null;
var bootFailed = false;
var activeSkin = null; /* live host/picker selection, including before async boot */
var workspaceRequest=readWorkspaceHandoff(window.location.hash);
window.dvSkins = SKIN_NAMES.slice();
window.dvSetSkin = function(name){
  if (SKIN_NAMES.indexOf(name) < 0) return false;
  activeSkin = name;
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
  applySkinClasses(document.body, view, activeSkin || resolveSkin(readCookieText()));
  var pre = document.createElement('pre');
  pre.className = 'errbox';
  pre.textContent = 'Flowview: the spec did not render.\n\n' + msgs.map(function(m){ return '- ' + m; }).join('\n');
  view.appendChild(pre);
}

/* captured BEFORE boot: the deep-link channel canonicalizes the hash
   during wiring — it preserves the embed/sk keys only because boot
   passes them as the preserved prefix, so the request must be read
   before that first rewrite */
var embedRequest = embedRequestFromHash(window.location.hash);
var liveDemoRequest = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('live') === 'demo';
/* same trap as embed: the deep-link channel canonicalizes the hash during
   wiring and drops unknown keys, so #tour=1/0 must be read before boot.
   A hash that already targets something (a diagram, step, tab, card) means
   the reader followed a shared link — the tour must not auto-start over it. */
var tourRequest = (typeof tourHashRequest === 'function') ?
  tourHashRequest(window.location.hash) : null;
var tourDeferredByLink = (function(){
  try {
    /* parseHash only copies keys it understands, so any non-null field IS a
       deep-link target — no hand-maintained key list to drift */
    var st = parseHash(window.location.hash);
    return !!st && Object.keys(st).some(function(key){ return st[key] != null; });
  } catch (ex) { return false; }
})();

/* the embed flag is applied at load; a hash-only navigation (typing or
   pasting a fragment into an open page) never re-runs boot, so entering
   or leaving the embedded view via the address bar reloads the page */
window.addEventListener('hashchange', function(){
  var next = embedRequestFromHash(window.location.hash);
  if (JSON.stringify(next) !== JSON.stringify(embedRequest)) window.location.reload();
});

function applyEmbedMode(ctl){
  /* #embed=<section-ref>[&sk=<skin>]: strip the page down to one
     section's diagram + panels + step controls for iframe hosting.
     Read once at load; composes with the other hash fields. */
  var req = embedRequest;
  if (!req) return;
  var route=ctl.handoffs && parseHash(window.location.hash).d;
  var target = embedTargetSection(ctl,route || req.section) || embedTargetSection(ctl,req.section);
  if (!target){
    if (window.console) console.warn('flowspec: #embed section "' + req.section + '" not found');
    return;
  }
  /* A host/picker selection received before async boot is newer than the
     skin encoded in an embed URL and must not be replaced here. */
  if (!activeSkin && req.skin && SKIN_NAMES.indexOf(req.skin) >= 0) window.dvSetSkin(req.skin);
  if (target.tabBlock != null && target.tab != null){
    var tb = ctl.tabBlocks[target.tabBlock - 1];
    /* activate=false: reveal the tab without rewriting the hash */
    if (tb) tb.select(target.tab, false, false);
  }
  document.body.classList.add('dv-embed');
  target.sectionEl.classList.add('dv-embed-target');
}

/* Chuck 2026-10-30: a two-file page that could not load flowspec.json boots
   from the inline copy and says so, persistently, with a Copy error button
   whose text an editor can paste to an agent. Built here, outside the view,
   so renderPage never clears it. */
function sourceFallbackBanner(fallback, page, specFile){
  var banner = document.createElement('div');
  banner.className = 'dv-source-fallback'; banner.setAttribute('role', 'alert');
  var text = document.createElement('p');
  text.className = 'dv-source-fallback-text';
  text.textContent = "This board couldn't load its latest version. You're seeing the copy saved when the page was published; changes saved since then are not shown.";
  var button = document.createElement('button');
  button.type = 'button'; button.className = 'dv-source-fallback-copy'; button.textContent = 'Copy error';
  var field = document.createElement('textarea');
  field.className = 'dv-source-fallback-report'; field.readOnly = true; field.hidden = true;
  field.setAttribute('aria-label', 'Error details');
  function report(){
    var flowview = page && page.flowview && typeof page.flowview === 'object' ? page.flowview : {};
    var authored = typeof flowview.authoredWith === 'string' && flowview.authoredWith ? flowview.authoredWith : 'not stamped';
    var build = typeof FlowviewCompatibility !== 'undefined' && FlowviewCompatibility.version ? FlowviewCompatibility.version : 'unknown';
    return ['Flowview board: ' + specFile + ' did not load',
            'What failed: ' + fallback.detail + ' (' + fallback.reason + ')',
            'File: ' + specFile + ' beside ' + String(window.location.href).replace(/#.*$/, ''),
            'Page: ' + (page && page.title ? page.title : '(untitled)'),
            'Renderer: page.flowview.authoredWith ' + authored + '; build ' + build,
            'Time: ' + new Date().toISOString(),
            'Hint: The page booted from its inline flowspec block; check ' + specFile + ' in the artifact.'].join('\n');
  }
  button.addEventListener('click', function(){
    var diagnostics = report();
    var clipboard = navigator.clipboard;
    var write = clipboard && typeof clipboard.writeText === 'function' ?
      clipboard.writeText(diagnostics) : Promise.reject(new Error('clipboard unavailable'));
    write.then(function(){ button.textContent = 'Copied'; }, function(){
      /* no clipboard access: show the text so the editor can select it */
      field.value = diagnostics; field.hidden = false; field.focus(); field.select();
    });
  });
  banner.appendChild(text); banner.appendChild(button); banner.appendChild(field);
  return banner;
}

function boot(raw, sourceText, sourceFallback){
  var topology=document.getElementById('flowview-topology');
  if(topology){try{raw=FlowTopology.resolveSource(raw,JSON.parse(topology.textContent));}catch(ex){fail([ex.message]);return;}}
  var page = normalize(raw);
  if (raw && raw.tour && page && !page.tour && window.console)
    console.warn('flowspec: top-level "tour" is ignored — the tour config belongs inside "page" (page.tour)');
  var v = validate(page);
  var lint = v.errors.length ? [] : lintPage(page);
  v.warnings.concat(lint).forEach(function(w){ if (window.console) console.warn('flowspec: ' + w); });
  if (v.errors.length){ fail(v.errors); return; }
  /* A live host choice can arrive while ?spec is still loading. Keep it;
     the saved page skin is only the standalone fallback when no host choice
     or supported dv_skin cookie exists. */
  var embedSkin=embedRequest && SKIN_NAMES.indexOf(embedRequest.skin)>=0?embedRequest.skin:null;
  var bootSkin = activeSkin || embedSkin || resolveSkin(readCookieText(), page.skin);
  applySkinClasses(document.body, view, bootSkin);
  var layoutTarget=new URLSearchParams(window.location.search).get('layout');
  var liveOptions=window.flowviewLiveStatus;
  if(liveDemoRequest && !(liveOptions && typeof liveOptions.provider==='function'))liveOptions=createLiveStatusDemo(document);
  /* sourceText: the exact authored text this page booted from (fetched
     flowspec.json, ?spec= file, or the inline block), never re-serialized —
     the board's Edit mode splices its changes into this text (#825). */
  var ctl = renderPage(view, page, bootSkin, backlinkData, {layoutTarget:layoutTarget,liveStatus:liveOptions,handoffHost:window.flowviewHandoffHost,sourceText:sourceText,sourceFallback:sourceFallback || null});
  if (sourceFallback && view.parentNode) view.parentNode.insertBefore(sourceFallbackBanner(sourceFallback, page, specFile), view);
  if (embedRequest){
    /* compose with the step deep-link fields: m=/s= without an explicit
       d= selector must address the EMBEDDED diagram, not the page's
       default one — inject the embed ref as the selector before the
       deep-link channel reads the hash */
    var st = parseHash(window.location.hash);
    if (st.d == null && (st.m != null || st.s != null || st.v != null)){
      try {
        history.replaceState(null, '',
          '#' + window.location.hash.replace(/^#/, '') +
          '&d=' + encodeURIComponent(embedRequest.section));
      } catch (ex){ /* sandboxed iframes may deny history writes */ }
    }
  }
  var preservedHash = embedRequest ?
    'embed=' + encodeURIComponent(String(embedRequest.section)) +
    (embedRequest.skin ? '&sk=' + encodeURIComponent(embedRequest.skin) : '') : null;
  deepLinkChannel = wireDeepLinks(ctl, window, preservedHash); /* tabs, every diagram/step, contract cards + rows */
  applyEmbedMode(ctl);
  if (pendingLinkBase){
    deepLinkChannel.receiveLinkBaseMessage(pendingLinkBase);
    pendingLinkBase = null;
  }
  var artifactHost=tourArtifactHost(window.location.hostname) || !!window.claude,guideAction=null;
  if(artifactHost && typeof initWorkbenchHumanGuide==='function'){
    guideAction=document.createElement('button');guideAction.type='button';guideAction.className='mbtn explore-guide-button';guideAction.textContent='User guide';
    guideAction.setAttribute('data-open-human-guide','');guideAction.setAttribute('aria-haspopup','dialog');
  }
  initViewerExploreCanvas(ctl,view,{action:guideAction});
  wirePresenter(ctl, view, window);
  if(guideAction)initWorkbenchHumanGuide();
  /* Published as a claude.ai artifact: page-owned comment anchors so a
     comment records its Tab/View and "Go to" can switch to it. Inert when
     window.claude or the declared capability is absent. */
  if (typeof wireArtifactComments === 'function') wireArtifactComments(ctl, view, window);
  if (!(liveOptions && liveOptions.demo) && typeof wireLiveStatusClaude === 'function') wireLiveStatusClaude(ctl, page, window);
  /* First-run guided tour: a page's own page.tour replaces the built-in
     default wholesale; an unusable override falls back to the default so a
     typo never costs the tour. wireTour itself refuses embeds and #tour=0. */
  if (typeof wireTour === 'function' && !embedRequest){
    var tourConfig = tourUsableConfig(page.tour) ? page.tour :
      (typeof TOUR_DEFAULT_CONFIG !== 'undefined' ? TOUR_DEFAULT_CONFIG : null);
    wireTour(ctl, view, window, tourConfig,
             {request: tourRequest, deepLink: tourDeferredByLink,
              autostart: !artifactHost});
  }
  /* "?" opens the reader's keyboard shortcuts; the tour keeps its own button. */
  if (typeof wireReaderShortcuts === 'function') wireReaderShortcuts(ctl, view, window);
  /* Host notification, the output side of the flowviewLiveStatus /
     flowviewHandoffHost inputs: a shell or harness registered before boot
     receives the controller once the page is wired. A throwing hook is the
     host's bug, never the page's. */
  if (typeof window.flowviewBooted === 'function'){
    try { window.flowviewBooted(ctl); }
    catch (ex){ if (window.console) console.warn('flowspec: flowviewBooted hook failed: ' + ex.message); }
  }
}

var inlineText = (document.getElementById('flowspec') || {}).textContent || '';
var raw = null, parseErr = null;
try {
  raw = JSON.parse(inlineText);
} catch (ex){
  parseErr = 'JSON parse: ' + ex.message;
}
var specParam = /[?&]spec=([^&#]+)/.exec(window.location.search);
var isDemo = !!(raw && raw.page && raw.page.__demo);
/* #826: the two-file marker names a bare file beside the page (the name is
   authored by tools/inject.py, not by the URL); anything else is ignored. */
var specFileMeta = document.querySelector('meta[name="dv-spec-file"]');
var specFile = specFileMeta ? specFileMeta.getAttribute('content') : null;
if (!/^[A-Za-z0-9._-]+$/.test(specFile || '')) specFile = null;

function bootInline(fallback){
  if (parseErr){ fail([parseErr]); return; }
  if(workspaceRequest)verifyWorkspaceHandoff(raw,workspaceRequest,window.crypto).then(function(){boot(raw, inlineText, fallback);},function(ex){fail([ex.message]);});
  else boot(raw, inlineText, fallback);
}

if (specParam && (isDemo || parseErr)){
  applySkinClasses(document.body, view, resolveSkin(readCookieText()));
  var specUrl = decodeURIComponent(specParam[1]);
  fetch(specUrl).then(function(r){
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  }).then(async function(text){var spec=JSON.parse(text);await verifyWorkspaceHandoff(spec,workspaceRequest,window.crypto);boot(spec, text);}).catch(function(ex){
    fail(['?spec fetch "' + specUrl + '": ' + ex.message,
          'The ?spec= mode works only on http(s)-served pages — file:// cannot fetch.',
          'For a file that opens anywhere, inject the spec instead: tools/inject.py <spec.json> <template> <out.html>.']);
  });
} else if (specFile){
  applySkinClasses(document.body, view, resolveSkin(readCookieText()));
  /* Any load failure (HTTP status, network or file://, malformed JSON) boots
     the inline copy with a persistent warning (Chuck 2026-10-30); the reason
     travels as {reason, detail} into the banner and ctl.sourceFallback(). */
  var fetched = null, fallback = null;
  fetch(specFile).then(function(r){
    if (!r.ok){ fallback = {reason: 'http', detail: 'HTTP ' + r.status}; return; }
    return r.text().then(function(text){
      try { fetched = {spec: JSON.parse(text), text: text}; }
      catch (ex){ fallback = {reason: 'parse', detail: 'JSON parse: ' + ex.message}; }
    });
  }).catch(function(ex){
    fallback = {reason: 'network', detail: 'fetch: ' + ex.message};
  }).then(function(){
    if (!fetched){
      if (window.console) console.warn('flowspec: ' + specFile + ' did not load (' + fallback.detail + '); rendering the inline block');
      bootInline(fallback); return;
    }
    /* the handoff gate guards the fetched spec itself: a failed check never
       boots it and never falls back to the inline copy */
    return verifyWorkspaceHandoff(fetched.spec, workspaceRequest, window.crypto).then(function(){ boot(fetched.spec, fetched.text); }, function(ex){ fail([ex.message]); });
  });
} else {
  bootInline();
}
