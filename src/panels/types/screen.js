/* screen validation and pure state helpers. */
var SCENE_NAMES = [
  'person-at-door-night',
  'person-through-door',
  'doorbell-run-away',
  'doorbell-runners',
  'package-drop',
  'kitchen-fire',
  'static-noise',
];
var SCREEN_MODES = ['off', 'boot', 'active', 'live', 'rec', 'save', 'unavailable'];
var SCREEN_SPOTLIGHTS = ['off', 'on', 'flash'];
/* Preserve the legacy screen snapshot contract while sanitizing the independent
   audio/light channels before they enter carried state. */
function screenCleanState(raw, once) {
  if (!panelObject(raw)) return {};
  var out = Object.assign({}, raw);
  if (panelOwn(raw, 'audio')) {
    var audio = FlowAudio.clean(raw.audio);
    if (audio === undefined) delete out.audio;
    else out.audio = audio;
  }
  if (panelOwn(raw, 'spotlight') && SCREEN_SPOTLIGHTS.indexOf(raw.spotlight) < 0) delete out.spotlight;
  if (panelOwn(raw, 'enterOnce')) {
    if (once && panelObject(raw.enterOnce)) out.enterOnce = screenCleanState(raw.enterOnce, false);
    else delete out.enterOnce;
  }
  return out;
}
function screenPatchWarnings(state, path, warnings) {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return;
  if (state.mode != null && SCREEN_MODES.indexOf(state.mode) < 0)
    warnings.push(path + '.mode: unknown camera mode — using off');
  if (state.reason != null && typeof state.reason !== 'string')
    warnings.push(path + '.reason: expected text or null — using the default explanation');
  if (panelOwn(state, 'audio')) FlowAudio.clean(state.audio, path + '.audio', warnings);
  if (panelOwn(state, 'spotlight') && SCREEN_SPOTLIGHTS.indexOf(state.spotlight) < 0)
    warnings.push(path + '.spotlight: expected off|on|flash — ignored');
  if (
    Object.prototype.hasOwnProperty.call(state, 'scenePlayback') &&
    ['waiting', 'playing'].indexOf(state.scenePlayback) < 0
  )
    warnings.push(path + '.scenePlayback: expected waiting|playing — using playing');
  if (state.enterOnce && typeof state.enterOnce === 'object' && !Array.isArray(state.enterOnce)) {
    var once = Object.assign({}, state.enterOnce);
    delete once.enterOnce;
    screenPatchWarnings(once, path + '.enterOnce', warnings);
  }
}

PanelRegistry.extend('screen', {
  fold: function (panel, steps) { return foldSanitizedPanelStates(panel, steps, screenCleanState); },
  validateDeclaration: function (p, PP, warnings, errors, d) {
    if (p.scene && SCENE_NAMES.indexOf(p.scene) < 0)
      warnings.push(
        PP +
          '.scene: unknown scene "' +
          p.scene +
          '" — using "static-noise" (valid: ' +
          SCENE_NAMES.join(' ') +
          ')'
      );
    screenPatchWarnings(p.initial, PP + '.initial', warnings);
  },
  validatePatch: function (patch, path, panel, warnings, context) {
    screenPatchWarnings(patch, path, warnings);
  },
});

/* screen panel: presentation model and renderer. Shared lifecycle lives in ../shared.js. */
/* ---------------- stock scenes for the screen widget ---------------- */
function porchSceneBackdrop(night) {
  /* Shared fixed artwork, with actual surface colors under day/night light.
     Keep the legacy doorway and floor anchors for the existing clip tracks. */
  return (
    '<rect width="320" height="180" fill="' +
    (night ? '#192D56' : '#93D4EF') +
    '"/>' +
    (night
      ? '<circle cx="275" cy="18" r="9" fill="#FFE4AD"/><g fill="#BED8FF"><circle cx="38" cy="12" r="1"/><circle cx="230" cy="9" r="1"/><circle cx="303" cy="32" r="1"/></g>'
      : '') +
    '<path d="M0 29H320V150H0Z" fill="' +
    (night ? '#344D72' : '#EFCBB1') +
    '"/>' +
    '<path d="M0 30H320M0 51H320M0 73H320M0 95H320M0 117H320M0 139H320" stroke="' +
    (night ? '#476389' : '#C5A28E') +
    '" opacity=".5"/>' +
    '<rect y="150" width="320" height="30" fill="' +
    (night ? '#59657B' : '#BA9673') +
    '"/>' +
    '<path d="M0 164H320M53 150L38 180M273 150L289 180" stroke="' +
    (night ? '#7D8593' : '#E6CBA3') +
    '" opacity=".6"/>' +
    '<rect x="25" y="52" width="64" height="53" rx="2" fill="' +
    (night ? '#E9AB60' : '#6BB9DA') +
    '" stroke="#E9D8BC" stroke-width="3"/>' +
    '<path d="M57 52V105M25 78H89" stroke="#F2E5CF" stroke-width="3"/>' +
    '<path d="M31 58H49L31 72ZM63 84H81L63 99Z" fill="#FFF1CC" opacity=".28"/>' +
    '<rect x="114" y="25" width="92" height="129" rx="3" fill="#EAD7B9"/>' +
    '<rect x="118" y="29" width="84" height="121" rx="2" fill="' +
    (night ? '#277E87' : '#278F92') +
    '"/>' +
    '<path d="M127 39H193V83H127ZM127 104H193V140H127Z" fill="' +
    (night ? '#36959C' : '#40ACAA') +
    '" stroke="#72C6BA"/>' +
    '<circle cx="188" cy="94" r="3" fill="#FFD07B"/>' +
    '<path d="M121 157H201L208 170H114Z" fill="#65544B"/>' +
    (night
      ? '<path d="M224 61L192 150H260Z" fill="#FFD384" opacity=".12"/><ellipse cx="225" cy="152" rx="42" ry="6" fill="#FFCC80" opacity=".13"/>'
      : '') +
    '<rect x="219" y="44" width="11" height="22" rx="4" fill="#293B4C"/><rect x="221" y="48" width="7" height="13" rx="2" fill="#FFE2A3"/>' +
    '<path d="M284 137H303L299 153H288Z" fill="#CB7754"/>' +
    '<path d="M293 139V109M293 127Q274 126 280 112Q292 115 293 127M293 119Q310 119 308 104Q295 104 293 119" fill="' +
    (night ? '#498668' : '#58A762') +
    '" stroke="#8BC987" stroke-width="2"/>'
  );
}
function doorbellRunScene(pair) {
  /* Fixed artwork shared by the two stock clips. Local coordinates put each
     runner's feet at the origin, so distance scales the whole stride/shadow.
     No SVG IDs: multiple doorbells can play independently on the same page. */
  function runner(second) {
    return (
      '<g class="doorbell-runner' +
      (second ? ' doorbell-runner-second' : '') +
      '">' +
      '<ellipse cx="0" cy="1" rx="13" ry="3" fill="#152B30" opacity=".28"/>' +
      '<g class="doorbell-bounce" stroke-linecap="round" stroke-linejoin="round">' +
      '<g fill="none" stroke="#243D50" stroke-width="6">' +
      '<path class="doorbell-leg doorbell-leg-back" d="M-4-27L-10-14L-5-2"/>' +
      '<path class="doorbell-leg" d="M4-27L11-16L7-3"/>' +
      '</g><g fill="none" stroke="var(--runner-sleeve)" stroke-width="6">' +
      '<path class="doorbell-arm doorbell-arm-back" d="M-8-46L-16-34L-20-42"/>' +
      '<path class="doorbell-arm" d="M8-46L17-35L21-42"/>' +
      '</g><path d="M-8-49Q0-53 8-49L10-28Q0-24-10-28Z" fill="var(--runner-shirt)"/>' +
      '<path d="M-6-49Q0-38 6-49" fill="var(--runner-sleeve)"/>' +
      '<path d="M0-40V-30" stroke="var(--runner-sleeve)" stroke-width="1.2" opacity=".55"/>' +
      '<path d="M-7-29Q0-26 7-29" fill="none" stroke="var(--runner-sleeve)" stroke-width="2"/>' +
      '<path d="M0-54V-51" stroke="#C49070" stroke-width="6"/>' +
      '<circle cx="0" cy="-61" r="8" fill="#D7A27E"/>' +
      '<path d="M-8-60Q-10-72 0-72Q10-71 8-60L5-55H-5Z" fill="#293237"/>' +
      '</g></g>'
    );
  }
  return (
    '<svg viewBox="0 0 320 180" class="scene scene-doorbell" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#87D0ED"/>' +
    '<path d="M24 54Q72 49 112 55T226 53T306 51V85H24Z" fill="#4C936A"/>' +
    '<path d="M43 61L84 35L127 60Z" fill="#345D88"/>' +
    '<path d="M51 60H118V84H51Z" fill="#F0CDA3"/>' +
    '<path d="M62 66H76V77H62ZM91 65H106V78H91Z" fill="#63ACD3"/>' +
    '<path d="M68 66V77M98 65V78" stroke="#DDE0CF" stroke-width="1.4"/>' +
    '<path d="M206 63L244 38L281 63Z" fill="#5068A1"/>' +
    '<path d="M213 62H274V84H213Z" fill="#F0BFAA"/>' +
    '<path d="M225 68H239V79H225ZM249 68H263V79H249Z" fill="#508DBC"/>' +
    '<path d="M31 82Q160 76 290 82V98Q160 92 31 98Z" fill="#516570"/>' +
    '<path d="M40 87Q160 81 280 87" fill="none" stroke="#D2CCAD" stroke-width="1" stroke-dasharray="16 18" opacity=".65"/>' +
    '<path d="M22 99Q160 91 300 99L315 149H5Z" fill="#79AE68"/>' +
    '<path d="M23 97Q160 89 297 97L299 103Q160 94 21 103Z" fill="#D5C7AE"/>' +
    '<path d="M156 99H184L219 148H106Z" fill="#E6D3AD"/>' +
    '<path d="M145 114H195M128 134H210" fill="none" stroke="#C0AD88" stroke-width="1"/>' +
    '<path d="M0 148Q160 136 320 148V180H0Z" fill="#C39E7A"/>' +
    '<path d="M0 158Q160 146 320 158M64 145L41 180M248 145L273 180" fill="none" stroke="#F0D7B0" stroke-width="1.5" opacity=".65"/>' +
    '<path d="M101 171Q158 167 215 171L222 180H94Z" fill="#615E50"/>' +
    '<path d="M42 134L38 93M43 112L54 101" fill="none" stroke="#8C7755" stroke-width="4"/>' +
    '<g fill="#408A5A"><ellipse cx="36" cy="88" rx="20" ry="16"/><ellipse cx="52" cy="98" rx="17" ry="13"/>' +
    '<ellipse cx="279" cy="117" rx="25" ry="14"/><ellipse cx="290" cy="104" rx="20" ry="16"/></g>' +
    runner(false) +
    (pair ? runner(true) : '') +
    /* Door-frame edges and bowed porch roof suggest the wide doorbell lens. */
    '<path d="M0 0H320V13Q160-2 0 13Z" fill="#273D44"/>' +
    '<path d="M0 0H15Q24 89 14 180H0ZM320 0H305Q297 90 308 180H320Z" fill="#426F79"/>' +
    '<path d="M9 18Q17 90 9 166M312 19Q306 90 314 166" fill="none" stroke="#91B7AD" stroke-width="2" opacity=".55"/>' +
    '<path d="M0 0H45Q3 15 0 49ZM320 0H275Q317 15 320 49ZM0 180V139Q6 171 41 180ZM320 180V139Q314 171 279 180Z" fill="#11272F" opacity=".25"/>' +
    '<text x="293" y="171" text-anchor="end" fill="#F4EEDC" opacity=".85" font-family="monospace" font-size="5" letter-spacing="1">FRONT DOOR · DEMO</text>' +
    '</svg>'
  );
}
var SCENE_LABELS = {
  'person-at-door-night': 'Visitor at night',
  'person-through-door': 'Person walking through a door',
  'doorbell-run-away': 'Doorbell: person running away',
  'doorbell-runners': 'Doorbell: two people running away',
  'package-drop': 'Package delivery',
  'kitchen-fire': 'Kitchen fire',
  'static-noise': 'Static noise',
};
var SCENES = {
  'doorbell-run-away': doorbellRunScene(false),
  'doorbell-runners': doorbellRunScene(true),
  'person-at-door-night':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    porchSceneBackdrop(true) +
    '<g class="walker"><ellipse cy="152" rx="15" ry="3" fill="#1A2945" opacity=".3"/>' +
    '<path d="M-4 126L-6 147M4 126L6 147" stroke="#385A88" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M-8 148H-3M3 148H9" stroke="#1C304D" stroke-width="4" stroke-linecap="round"/>' +
    '<path d="M-8 102L-12 122M8 102L12 119" stroke="#DC9250" stroke-width="6" stroke-linecap="round"/>' +
    '<rect x="-9" y="96" width="18" height="34" rx="6" fill="#F2B65E"/>' +
    '<path d="M0 100V125M-6 115H-2M2 115H6" stroke="#CD824B" stroke-width="1.5"/>' +
    '<path d="M0 93V97" stroke="#C78966" stroke-width="6"/>' +
    '<circle cy="86" r="9" fill="#E9B38A"/><path d="M-9 85Q-9 74 1 76Q10 75 9 85L4 81L-9 83Z" fill="#3D3243"/>' +
    '</g></svg>',
  'package-drop':
    /* courier + package positions are the ANIMATION END STATES' anchors: the
       courier group is parked off-canvas by default CSS (reduced motion shows
       only the delivered package), the package is visible by default and the
       running animation hides it until the drop beat */
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    porchSceneBackdrop(false) +
    '<g class="courier"><ellipse cy="152" rx="15" ry="3" fill="#5E493E" opacity=".2"/>' +
    '<path d="M-4 126L-6 147M4 126L6 147" stroke="#263C64" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M-8 148H-3M3 148H9" stroke="#182B49" stroke-width="4" stroke-linecap="round"/>' +
    '<rect x="-9" y="94" width="18" height="34" rx="6" fill="#4C92E0"/>' +
    '<path d="M-6 102H6M-7 120H7" stroke="#ABD8EF" stroke-width="2"/>' +
    '<path d="M-8 100L-11 122M8 101L14 114" stroke="#3273BB" stroke-width="6" stroke-linecap="round"/>' +
    '<path d="M0 91V96" stroke="#AA6B48" stroke-width="6"/>' +
    '<circle cy="84" r="9" fill="#CE9367"/><path d="M-9 82Q-9 73 0 74Q10 74 9 82H14V85H-9Z" fill="#2858A0"/>' +
    '<g class="carried"><rect x="9" y="104" width="20" height="15" rx="2" fill="#DEA05E" stroke="#AF713F" stroke-width="1.5"/>' +
    '<path d="M19 105V118" stroke="#F8D39B" stroke-width="3"/></g></g>' +
    '<g class="pkg"><ellipse cx="239" cy="153" rx="27" ry="4" fill="#715443" opacity=".25"/>' +
    '<rect x="216" y="118" width="46" height="34" rx="3" fill="#DEA05E" stroke="#AF713F" stroke-width="2"/>' +
    '<path d="M239 119V151" stroke="#F8D39B" stroke-width="6"/><path d="M217 127H261" stroke="#BB7D43"/>' +
    '<rect x="244" y="134" width="12" height="9" rx="1" fill="#FFF0D3"/><path d="M247 137H253M247 140H251" stroke="#967654"/>' +
    '</g></svg>',
  'person-through-door':
    /* A single six-second entry: approach, door opens, cross the threshold,
       door closes. No IDs or external assets, so many cameras can coexist.
       CSS defaults hold a readable mid-entry pose for reduced motion. */
    '<svg viewBox="0 0 320 180" class="scene scene-entry" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#E7BEA6"/>' +
    '<path d="M0 150H320V180H0Z" fill="#BE9A77"/>' +
    '<path d="M0 160H320M0 177H320M64 150L40 180M140 150L132 180M230 150L242 180" stroke="#E4CFAB" stroke-opacity=".35"/>' +
    '<rect x="28" y="40" width="74" height="66" rx="3" fill="#77BBDD" stroke="#F4DDC0" stroke-width="3"/>' +
    '<path d="M65 40V106M28 73H102" stroke="#EEDBC0" stroke-width="3"/>' +
    '<path d="M34 47H58L34 69ZM72 80H95L72 100Z" fill="#E0F9FF" opacity=".14"/>' +
    '<rect x="168" y="22" width="88" height="132" rx="3" fill="#F3DDC0"/>' +
    '<rect x="174" y="28" width="76" height="124" fill="#D8B47F"/>' +
    '<path d="M174 28H250V48H200V152H174Z" fill="#AD8259"/>' +
    '<path d="M200 48H250V152H200Z" fill="#F3D5A4"/>' +
    '<path d="M210 56H238V107H210Z" fill="#BC9669"/><path d="M213 59H235V104H213Z" fill="#6F9DAD"/>' +
    '<path class="entry-light" d="M174 152H250L282 180H139Z" fill="#FFDB9E" opacity=".22"/>' +
    '<rect x="270" y="58" width="9" height="23" rx="4" fill="#F3E8D5"/>' +
    '<circle cx="274.5" cy="65" r="2" fill="#31A99F"/>' +
    '<ellipse cx="294" cy="152" rx="16" ry="4" fill="#10282E"/>' +
    '<path d="M286 137H303L300 153H289Z" fill="#D57D54"/>' +
    '<path d="M294 140V111M294 126Q275 127 282 114Q294 113 294 126M294 119Q306 120 310 105Q296 103 294 119" fill="#4C9B60" stroke="#77C87A" stroke-width="2"/>' +
    '<g class="entry-person"><ellipse cx="0" cy="155" rx="16" ry="4" fill="#0A1D24" opacity=".3"/>' +
    '<g class="entry-stride" fill="none" stroke-linecap="round">' +
    '<path class="entry-leg entry-leg-back" d="M2 127L-4 141L-7 153" stroke="#182E40" stroke-width="7"/>' +
    '<path class="entry-arm entry-arm-back" d="M0 106L-10 117L-13 128" stroke="#496ABA" stroke-width="6"/>' +
    '<path class="entry-leg" d="M0 126L7 140L9 153" stroke="#294D5E" stroke-width="7"/>' +
    '<path d="M0 105L0 126" stroke="#7894DF" stroke-width="17"/>' +
    '<path class="entry-arm" d="M2 106L12 116L14 126" stroke="#91ADF2" stroke-width="6"/>' +
    '<path d="M1 95V100" stroke="#D9A17E" stroke-width="6"/>' +
    '<circle cx="1" cy="87" r="9" fill="#E4B38B"/>' +
    '<path d="M-7 86Q-9 76 2 76Q12 77 10 86L6 83L-7 84Z" fill="#24313D"/>' +
    '</g></g>' +
    '<g class="entry-door"><rect x="174" y="28" width="76" height="124" fill="#208F94" stroke="#1C657B" stroke-width="2"/>' +
    '<rect x="183" y="39" width="58" height="47" rx="2" fill="#3CAFAD" stroke="#81D4BF"/>' +
    '<rect x="183" y="108" width="58" height="34" rx="2" fill="#21818B" stroke="#58B8B1"/>' +
    '<path d="M231 99H240" stroke="#F4D795" stroke-width="3" stroke-linecap="round"/></g>' +
    '<path d="M172 28V153H251" fill="none" stroke="#F5E6CA" stroke-width="3"/>' +
    '<rect x="197" y="158" width="52" height="10" rx="3" fill="#10282E" opacity=".65"/>' +
    '</svg>',
  'kitchen-fire':
    '<svg viewBox="0 0 320 180" class="scene scene-fire" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#F0D1B2"/>' +
    '<path d="M0 143H320V180H0Z" fill="#C79A78"/>' +
    '<path d="M0 162H320M57 143L42 180M139 143L133 180M235 143L247 180" stroke="#E8C5A0" stroke-opacity=".35"/>' +
    '<rect x="23" y="33" width="84" height="62" rx="2" fill="#6FBCDF" stroke="#FFF0D4" stroke-width="3"/>' +
    '<path d="M65 33V95M23 63H107" stroke="#F7E8CD" stroke-width="3"/>' +
    '<path d="M30 41H57L30 58ZM72 70H99L72 88Z" fill="#E4F9FF" opacity=".15"/>' +
    '<rect x="16" y="110" width="292" height="40" rx="2" fill="#287A91"/>' +
    '<path d="M24 116H87V144H24ZM96 116H163V144H96ZM172 117H197V144H172Z" fill="#429BB0" stroke="#78C7CE"/>' +
    '<path d="M74 122H79M150 122H155M185 122H190" stroke="#E6C27A" stroke-width="2" stroke-linecap="round"/>' +
    '<rect x="203" y="111" width="72" height="39" fill="#263C49"/>' +
    '<rect x="213" y="122" width="52" height="22" rx="2" fill="#102633" stroke="#66808D"/>' +
    '<path d="M217 127H260" stroke="#92A3A9" stroke-width="2"/>' +
    '<circle cx="221" cy="116" r="2" fill="#C0C7BE"/><circle cx="237" cy="116" r="2" fill="#C0C7BE"/><circle cx="253" cy="116" r="2" fill="#C0C7BE"/>' +
    '<rect x="12" y="104" width="300" height="8" rx="2" fill="#EEE4D0"/>' +
    '<path d="M116 104V91Q116 84 123 84Q130 84 130 91" fill="none" stroke="#B9C9C6" stroke-width="3"/>' +
    '<ellipse cx="144" cy="106" rx="24" ry="2" fill="#3A5661"/>' +
    '<g class="fire-glow"><ellipse cx="234" cy="99" rx="78" ry="74" fill="#F98036" opacity=".12"/>' +
    '<ellipse cx="234" cy="105" rx="46" ry="52" fill="#FFB45C" opacity=".13"/>' +
    '<ellipse cx="234" cy="159" rx="60" ry="11" fill="#FFAC55" opacity=".18"/></g>' +
    '<g fill="#746779"><g class="fire-smoke"><circle cx="237" cy="64" r="14" opacity=".23"/><circle cx="224" cy="55" r="18" opacity=".19"/></g>' +
    '<g class="fire-smoke fire-smoke-late"><circle cx="241" cy="65" r="18" opacity=".2"/><circle cx="224" cy="55" r="15" opacity=".16"/></g></g>' +
    '<ellipse cx="235" cy="105" rx="32" ry="3" fill="#182A34"/>' +
    '<path d="M214 96H258L253 108H220Z" fill="#253D4A" stroke="#819096" stroke-width="1.5"/>' +
    '<path d="M256 97H270" stroke="#667B84" stroke-width="3" stroke-linecap="round"/>' +
    '<path class="fire-flame fire-outer" d="M216 100C202 87 217 72 215 59C225 64 226 74 228 77C231 61 243 53 239 35C260 54 247 64 252 75C259 72 259 66 259 62C273 82 266 98 254 103Z" fill="#EE6938"/>' +
    '<path class="fire-flame fire-middle" d="M221 101C212 90 226 82 224 70C232 75 232 82 234 84C243 75 244 62 243 56C257 72 246 79 251 89C258 85 257 80 257 78C264 92 254 103 245 105Z" fill="#FFB74F"/>' +
    '<path class="fire-flame fire-core" d="M230 103C224 98 231 90 233 84C240 89 235 94 241 96C247 91 246 87 247 85C255 97 247 106 239 107Z" fill="#FFE6A0"/>' +
    '<g fill="#FFD180"><circle class="fire-ember" cx="229" cy="66" r="1.5"/>' +
    '<circle class="fire-ember fire-ember-late" cx="252" cy="72" r="1.2"/></g>' +
    '<ellipse cx="157" cy="21" rx="13" ry="5" fill="#FFF3DB"/>' +
    '<path d="M150 21H159" stroke="#627F8F" stroke-width="1.5"/>' +
    '<circle class="fire-alarm" cx="164" cy="21" r="1.8" fill="#FF8658"/>' +
    '</svg>',
  'static-noise':
    '<svg viewBox="0 0 320 180" class="scene" aria-hidden="true">' +
    '<rect width="320" height="180" fill="#182C49"/>' +
    '<g opacity=".7"><path d="M0 0H46V118H0Z" fill="#DAE4E9"/><path d="M46 0H92V118H46Z" fill="#E2BF58"/>' +
    '<path d="M92 0H138V118H92Z" fill="#51BCCB"/><path d="M138 0H184V118H138Z" fill="#66BC83"/>' +
    '<path d="M184 0H230V118H184Z" fill="#B474C9"/><path d="M230 0H276V118H230Z" fill="#D6737E"/>' +
    '<path d="M276 0H320V118H276Z" fill="#538ECE"/></g>' +
    '<path d="M0 124H80V144H0Z" fill="#27507D"/><path d="M80 124H160V144H80Z" fill="#BDD5DE"/>' +
    '<path d="M160 124H240V144H160Z" fill="#725687"/><path d="M240 124H320V144H240Z" fill="#2D3E60"/>' +
    '<g class="flick" opacity=".32"><path d="M0 12H320V16H0ZM0 90H320V92H0Z" fill="#DCF0FA"/>' +
    '<path d="M0 52H320V56H0ZM0 132H320V135H0Z" fill="#142640"/>' +
    '<path d="M0 160H109V162H0Z" fill="#5DBECC"/><path d="M176 160H320V162H176Z" fill="#CD78B4"/></g></svg>',
};

/* Shared by embedded monitoring consoles. The caller still owns its panel
   lifecycle; this factory owns camera artwork, overlays and clip-preserving patches. */
function screenDeviceOverlay(audio, spotlight) {
  var light = SCREEN_SPOTLIGHTS.indexOf(spotlight) >= 0 && spotlight !== 'off';
  var sound = FlowAudio.render(audio);
  if (!sound && !light) return '';
  return '<svg class="ovl screen-devices" viewBox="0 0 320 180" aria-hidden="true">' +
    (light ? '<g class="screen-spotlight screen-spotlight-' + spotlight + '"><path d="M263 55L101 180H320V122Z" fill="#FFE5A3" opacity=".24"/><path d="M263 55L203 180H320V126Z" fill="#FFF6D6" opacity=".14"/><ellipse cx="250" cy="170" rx="67" ry="12" fill="#FFE5A3" opacity=".2"/></g>' : '') +
    '<g class="screen-camera-device" transform="translate(260 40)"><rect x="-17" y="-12" width="34" height="25" rx="9" fill="#163046" stroke="#A3CCD6" stroke-width="1.2"/>' +
    '<circle cx="-5" cy="-1" r="6" fill="#081927" stroke="#65B8C5" stroke-width="2"/><circle cx="-6" cy="-2" r="2" fill="#92D9E2"/>' +
    '<path d="M6-5H11M6-1H11M6 3H11" stroke="#C7E4DF" stroke-width="1.6" stroke-linecap="round"/>' +
    (light ? '<rect x="-8" y="12" width="16" height="3" rx="1.5" fill="#FFE5A3"/>' : '') +
    FlowAudio.effect(audio) + '</g></svg>';
}
function screenAudioHTML(audio) {
  var strip = FlowAudio.render(audio, {label:'Camera audio'});
  if (!strip) return '';
  var speaking = FlowAudio.isEmitting(audio), hearing = FlowAudio.isCapturing(audio), model = FlowAudio.model(audio);
  var action = speaking && hearing ? 'Camera speaker and microphone active' :
    speaking ? {speech:'Camera speaking to visitor',recorded:'Camera playing recorded message',chime:'Camera sounding a chime',siren:'Camera sounding a siren'}[model.output] :
    hearing ? 'Camera hearing visitor or nearby sound' :
    model.microphone === 'muted' ? 'Camera microphone muted' :
    model.microphone === 'unavailable' ? 'Camera microphone unavailable' :
    model.playback === 'failed' ? 'Camera speaker playback failed' :
    model.microphone === 'listening' ? 'Camera microphone listening' : 'Camera audio';
  return '<div class="screen-audio-direction">' + action + '</div>' + strip;
}
function screenFramePresentation(host, panel, state) {
  var h = '';
  var mode = String(state.mode || 'off');
  if (SCREEN_MODES.indexOf(mode) < 0) mode = 'off';
  var sceneName = SCENE_NAMES.indexOf(panel.scene) >= 0 ? panel.scene : 'static-noise';
  var scrClass =
    'screenbox m-' +
    mode +
    (state.scenePlayback === 'waiting' && ['active', 'live', 'rec', 'save'].indexOf(mode) >= 0
      ? ' scene-waiting'
      : '');
  /* overlays are built separately from the scene so a mode change between
       two scene-showing modes can swap ONLY the overlays (surgical path
       below) and keep the scene subtree's animation state (the walker) */
  var scrOvl = '';
  if (mode === 'active') scrOvl += '<span class="ovl activechip">ACTIVE</span>';
  if (mode === 'live') scrOvl += '<span class="ovl livechip">LIVE</span>';
  if (mode === 'rec') scrOvl += '<span class="ovl recchip"><span class="recdot"></span>REC</span>';
  if (mode === 'save')
    scrOvl += '<span class="ovl banner">' + esc(state.banner || 'SAVING CLIP') + '</span>';
  if (mode === 'off') scrOvl += '<span class="ovl offlabel">STANDBY</span>';
  if (mode === 'unavailable')
    scrOvl +=
      '<div class="ovl screen-unavailable" role="status">' +
      '<svg viewBox="0 0 40 32" aria-hidden="true"><rect x="6" y="9" width="24" height="17" rx="4"/><path d="M12 9 L15 5 H23 L26 9 M3 3 L36 30"/><circle cx="18" cy="17" r="5"/></svg>' +
      '<strong>Camera unavailable</strong><span>' +
      esc(
        typeof state.reason === 'string' && state.reason.trim()
          ? state.reason
          : 'Video is temporarily unavailable.'
      ) +
      '</span></div>';
  scrOvl += screenDeviceOverlay(state.audio, state.spotlight);
  var audioHTML = screenAudioHTML(state.audio);
  if (SCREEN_SPOTLIGHTS.indexOf(state.spotlight) >= 0 && state.spotlight !== 'off')
    scrOvl += '<span class="ovl screen-light-label">Spotlight ' + (state.spotlight === 'flash' ? 'flashing' : 'on') + '</span>';
  h += '<div class="' + scrClass + '">';
  if (mode === 'boot') h += SCENES['static-noise'];
  else if (mode === 'active' || mode === 'live' || mode === 'rec' || mode === 'save')
    h += SCENES[sceneName];
  h += scrOvl + '</div><div class="screen-audio-slot">' + audioHTML + '</div>';
  return {
    html: h,
    patch: function () {
      /* screen surgical path: consecutive modes that both show the SAME scene
     (active / live / rec / save) swap only the mode class and the overlay chips,
     keeping the scene subtree — the walker's animation state survives.
     A stable off/boot/unavailable frame can patch audio too; entering or
     leaving one of those modes rebuilds its video content. */
      var surgical = false;
      var SCENE_SHOWING = { active: true, live: true, rec: true, save: true };
      if (
        host._lastHTML != null &&
        sceneName === host._scrScene &&
        ((SCENE_SHOWING[mode] && SCENE_SHOWING[host._scrMode]) || mode === host._scrMode)
      ) {
        var scrBox = host.querySelector('.screenbox');
        if (scrBox) {
          surgical = true;
          scrBox.className = scrClass;
          if (scrOvl !== host._scrOverlay) {
            var oldOvls = scrBox.querySelectorAll('.ovl');
            for (var ov = oldOvls.length - 1; ov >= 0; ov--)
              oldOvls[ov].parentNode.removeChild(oldOvls[ov]);
            if (scrOvl) scrBox.insertAdjacentHTML('beforeend', scrOvl);
          }
          if (audioHTML !== host._scrAudio) {
            var audioSlot = host.querySelector('.screen-audio-slot');
            if (audioSlot) audioSlot.innerHTML = audioHTML;
            else surgical = false;
          }
        }
      }
      host._scrMode = mode;
      host._scrScene = sceneName;
      host._scrOverlay = scrOvl;
      host._scrAudio = audioHTML;
      return surgical;
    },
  };
}
PanelViews.register('screen', screenFramePresentation);

PanelRegistry.extend('screen', {
  order: 4,
  label: 'Camera screen',
  since: '0.1.0',
  layout: {
    height: 8,
  },
});

PanelRegistry.extend('screen', {
  styles: [
    {
      order: 490,
      css: String.raw`.screen-devices{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;}
.screen-camera-device{color:#B9FFF0;filter:drop-shadow(0 2px 4px #09192788);}
.screen-spotlight-flash{animation:screen-spotlight-flash 2.6s ease-in-out infinite;}
.screen-audio-slot:empty{display:none;}.screen-audio-slot{margin-top:7px;min-width:0;}
.screen-audio-direction{margin:0 2px 5px;color:var(--dtext);font:500 10px/1.4 'IBM Plex Sans',sans-serif;}
.screen-light-label{position:absolute;right:8px;bottom:8px;padding:3px 6px;border:1px solid #FFE5A355;border-radius:5px;background:#183046D9;color:#FFF0CA;font:500 9px/1.4 'IBM Plex Sans',sans-serif;}
@keyframes screen-spotlight-flash{0%,34%,100%{opacity:1;}50%,82%{opacity:.16;}}
@media(prefers-reduced-motion:reduce){.screen-devices *{animation:none!important;}.screen-spotlight-flash{opacity:.8;}}
@media print{.screen-devices *{animation:none!important;}.screen-audio-slot{break-inside:avoid;}.screen-devices{print-color-adjust:exact;}}
`,
    },
    {
      order: 478,
      css: String.raw`.screenbox{position:relative; border-radius:8px; overflow:hidden; aspect-ratio:16/9; background:#05080B;}
.screenbox .scene{display:block; width:100%; height:100%;}
.screenbox.m-active .walker, .screenbox.m-live .walker, .screenbox.m-rec .walker, .screenbox.m-save .walker{animation:walkin 3.2s ease-out forwards;}
@keyframes walkin{from{transform:translateX(40px);} to{transform:translateX(160px);}}
.screenbox .walker{transform:translateX(160px);}`,
    },
    {
      order: 484,
      css: String.raw`.screenbox .courier{transform:translateX(-40px);}
.screenbox.m-active .courier, .screenbox.m-live .courier, .screenbox.m-rec .courier, .screenbox.m-save .courier{animation:courierrun 5s ease-in-out forwards;}
@keyframes courierrun{0%{transform:translateX(-30px);} 42%{transform:translateX(238px);} 58%{transform:translateX(238px);} 100%{transform:translateX(-40px);}}
.screenbox.m-active .courier .carried, .screenbox.m-live .courier .carried, .screenbox.m-rec .courier .carried, .screenbox.m-save .courier .carried{animation:carrydrop 5s step-end forwards;}
@keyframes carrydrop{0%{opacity:1;} 50%{opacity:0;} 100%{opacity:0;}}
.screenbox.m-active .pkg, .screenbox.m-live .pkg, .screenbox.m-rec .pkg, .screenbox.m-save .pkg{animation:pkgdrop 5s ease-out forwards;}
@keyframes pkgdrop{0%,49%{opacity:0; transform:translateY(-6px);} 56%{opacity:1; transform:translateY(0);} 100%{opacity:1;}}`,
    },
    {
      order: 492,
      css: String.raw`.screenbox .entry-person{transform-origin:0 155px;transform:translate(215px,-8px) scale(.83);}
.screenbox .entry-door{transform-origin:174px 28px;transform:skewY(-12deg) scaleX(.24);}
.screenbox .entry-leg{transform-origin:0 127px;}
.screenbox .entry-arm{transform-origin:0 106px;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-person{animation:entrycross 6.8s linear forwards;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-door{animation:entryopen 6.8s ease-in-out forwards;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-light{animation:entrylight 6.8s ease-in-out forwards;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-leg,
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-arm{animation:entrystride .68s ease-in-out 8 alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-leg-back,
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .entry-arm:not(.entry-arm-back){animation-direction:alternate-reverse;}
@keyframes entrycross{
  0%{transform:translate(22px,0) scale(1);opacity:1;}
  38%{transform:translate(185px,0) scale(1);opacity:1;}
  50%{transform:translate(208px,-2px) scale(.95);opacity:1;}
  69%{transform:translate(226px,-10px) scale(.76);opacity:1;}
  79%,100%{transform:translate(232px,-15px) scale(.65);opacity:0;}
}
@keyframes entryopen{
  0%,22%,100%{transform:skewY(0) scaleX(1);}
  40%,80%{transform:skewY(-12deg) scaleX(.24);}
}
@keyframes entrylight{0%,22%,100%{opacity:0;}40%,80%{opacity:.22;}}
@keyframes entrystride{from{transform:rotate(-17deg);}to{transform:rotate(17deg);}}`,
    },
    {
      order: 506,
      css: String.raw`.screenbox .doorbell-runner{--runner-shirt:#F2A14F;--runner-sleeve:#CE753B;--runner-delay:0s;transform-origin:0 0;transform:translate(143px,125px) scale(.78);}
.screenbox .doorbell-runner-second{--runner-shirt:#58B8DB;--runner-sleeve:#367FB5;--runner-delay:.42s;transform:translate(186px,135px) scale(.88);}
.screenbox .doorbell-leg{transform-origin:0 -27px;transform:rotate(-12deg) scaleY(.65);}
.screenbox .doorbell-leg-back{transform:rotate(12deg);}
.screenbox .doorbell-arm{transform-origin:8px -46px;transform:rotate(-18deg);}
.screenbox .doorbell-arm-back{transform-origin:-8px -46px;transform:rotate(18deg);}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-runner{animation:doorbellaway 7.2s linear var(--runner-delay) both;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-runner-second{animation-name:doorbellawaysecond;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-bounce{animation:doorbellbounce .32s ease-in-out var(--runner-delay) 23;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-leg{animation:doorbellstride .16s ease-in-out var(--runner-delay) 46 alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-arm{animation:doorbellarms .16s ease-in-out var(--runner-delay) 46 alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-leg-back,
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .doorbell-arm:not(.doorbell-arm-back){animation-direction:alternate-reverse;}
@keyframes doorbellaway{
  0%{transform:translate(105px,180px) scale(1.35);}
  16%{transform:translate(130px,146px) scale(.98);}
  37%{transform:translate(154px,119px) scale(.66);}
  60%{transform:translate(170px,103px) scale(.42);}
  72%{transform:translate(180px,99px) scale(.33);}
  82%{transform:translate(220px,97px) scale(.3);}
  100%{transform:translate(339px,96px) scale(.27);}
}
@keyframes doorbellawaysecond{
  0%{transform:translate(213px,178px) scale(1.25);}
  16%{transform:translate(191px,149px) scale(1);}
  37%{transform:translate(177px,122px) scale(.68);}
  60%{transform:translate(168px,104px) scale(.43);}
  72%{transform:translate(156px,99px) scale(.33);}
  82%{transform:translate(109px,97px) scale(.3);}
  100%{transform:translate(-19px,96px) scale(.27);}
}
@keyframes doorbellbounce{0%,100%{transform:translateY(0);}50%{transform:translateY(-3px);}}
@keyframes doorbellstride{from{transform:rotate(-14deg) scaleY(.48);}to{transform:rotate(14deg) scaleY(1);}}
@keyframes doorbellarms{from{transform:rotate(-26deg);}to{transform:rotate(24deg);}}`,
    },
    {
      order: 524,
      css: String.raw`.screenbox .fire-flame{transform-origin:239px 105px;}
.screenbox .fire-glow{filter:blur(10px);}
.screenbox .fire-smoke{transform-origin:233px 72px;filter:blur(3px);}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-flame{animation:firebreathe 1.1s ease-in-out infinite alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-middle{animation-duration:.83s;animation-delay:-.4s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-core{animation-duration:.67s;animation-delay:-.2s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-glow{animation:fireglow 2.2s ease-in-out infinite alternate;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-smoke{animation:firerise 3.8s ease-out infinite;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-smoke-late{animation-delay:-1.9s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-ember{animation:fireember 2.6s ease-out infinite;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-ember-late{animation-delay:-1.3s;}
.screenbox:is(.m-active,.m-live,.m-rec,.m-save) .fire-alarm{animation:fireglow 1.5s ease-in-out infinite alternate;}
@keyframes firebreathe{from{transform:scale(.96,.87) skewX(-3deg);}to{transform:scale(1.04,1.05) skewX(3deg);}}
@keyframes fireglow{from{opacity:.55;}to{opacity:1;}}
@keyframes firerise{0%{transform:translate(0,0) scale(.7);opacity:0;}20%{opacity:.9;}100%{transform:translate(-28px,-57px) scale(1.9);opacity:0;}}
@keyframes fireember{0%{transform:translate(0,0);opacity:0;}15%{opacity:.8;}100%{transform:translate(-12px,-45px);opacity:0;}}`,
    },
    {
      order: 541,
      css: String.raw`.screenbox.scene-waiting .scene *{animation:none !important;}
.screenbox.scene-waiting :is(.walker,.courier,.pkg,.entry-person,.doorbell-runner,.fire-flame,.fire-glow,.fire-smoke,.fire-ember,.fire-alarm){visibility:hidden;}
.screenbox.scene-waiting .entry-door{transform:none;}
.screenbox.scene-waiting .entry-light{opacity:0;}
@media(prefers-reduced-motion:reduce){
  .screenbox :is(.scene-entry,.scene-doorbell,.scene-fire) *{animation:none !important;}
}
@media print{
  .screenbox :is(.scene-entry,.scene-doorbell,.scene-fire) *{animation:none !important;}
}
@media print{
  .screenbox{print-color-adjust:exact;}
}
.screenbox.m-boot .flick{animation:flicker .18s steps(2) infinite;}
@keyframes flicker{50%{opacity:.3; transform:translateY(3px);}}
.ovl{position:absolute; font:700 10.5px 'IBM Plex Mono',monospace; letter-spacing:.08em;}
.offlabel{inset:0; display:flex; align-items:center; justify-content:center; color:#2E3A46;}
.activechip{top:8px;left:8px;color:#FFF;text-shadow:0 1px 3px #000,0 0 2px #000;}
.livechip{top:8px; left:8px; color:#0B1220; background:#4ADE80; padding:2px 7px; border-radius:4px;}
.recchip{top:8px; left:8px; color:#FFB0A6; background:rgba(8,20,35,.8); padding:3px 6px; border-radius:5px; display:flex; align-items:center; gap:5px;}
.recdot{width:8px; height:8px; border-radius:50%; background:#FF3B30; animation:recblink 1s steps(1) infinite;}
@keyframes recblink{50%{opacity:.15;}}
.banner{left:0; right:0; bottom:0; text-align:center; padding:5px 0; color:#0B1220; background:#FFB454;}`,
    },
    {
      order: 1201,
      css: String.raw`@media (prefers-reduced-motion: reduce){
  .screenbox .courier, .screenbox .courier .carried, .screenbox .pkg{animation:none !important;}
}
@media (prefers-reduced-motion: reduce){
  .screenbox .walker{transform:translateX(160px);}
}`,
    },
    {
      order: 1582,
      css: String.raw`@media screen {
  body.sk-terminal .livechip{color:var(--tm-ground); background:var(--tm-good); border-radius:0;}
}
@media screen {
  body.sk-terminal .recchip{color:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .recdot{background-color:var(--tm-alert);}
}
@media screen {
  body.sk-terminal .banner{color:var(--tm-ground); background:var(--tm-alert);}
}`,
    },
    {
      order: 1790,
      css: String.raw`@media screen {
  body.sk-pastel .screenbox { background:#142033; }
}
@media screen {
  body.sk-pastel .livechip { color:#1E4935; background:#8AD1AA; border-radius:999px; padding:3px 8px; }
}
@media screen {
  body.sk-pastel .recchip { color:#F29AA3; }
}
@media screen {
  body.sk-pastel .recdot { background:#E66C77; }
}
@media screen {
  body.sk-pastel .banner { color:#604716; background:#F2CE8F; }
}`,
    },
    {
      order: 2028,
      css: String.raw`@media screen {
  body.sk-blueprint .offlabel{color:#7DA9C1;}
}
@media screen {
  body.sk-blueprint .livechip{color:#04264F;background:#47F590;border-radius:0;}
}
@media screen {
  body.sk-blueprint .banner{color:#052956;background:#FFD166;}
}`,
    },
    {
      order: 2450,
      css: String.raw`.screenbox.m-unavailable{background:radial-gradient(ellipse at 50% 10%,#263C52,#101A28 85%);}
.screen-unavailable{inset:0;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:7px;padding:16px;box-sizing:border-box;overflow:auto;text-align:center;color:#E6EDF6;}
.screen-unavailable svg{flex:none;width:40px;height:32px;fill:none;stroke:#A8C3E2;stroke-width:2;stroke-linecap:round;}
.screen-unavailable strong{font:600 14px 'IBM Plex Sans',system-ui,sans-serif;}
.screen-unavailable span{font:400 12px/1.4 'IBM Plex Sans',system-ui,sans-serif;overflow-wrap:anywhere;max-width:36em;}`,
    },
    {
      order: 2459,
      css: String.raw`@media print{
  .screenbox.m-unavailable{print-color-adjust:exact;}
}`,
    },
  ],
});

PanelRegistry.extend('screen', {
  editorStyles: [
    {
      order: 503,
      css: String.raw`.screen-scene-control{flex:1;min-width:0;display:grid;gap:8px;}
.screen-scene-control>.fctl{width:100%;min-width:0;}
.screen-scene-preview{min-width:0;}
.screen-scene-footer{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:6px;}
.screen-scene-footer .bbtn{min-height:32px;}`,
    },
  ],
});

/* screen authoring contract; merged into this panel definition by the bundle. */
var SCENE_TOKENS = SCENE_NAMES;

/* A local preview never patches camera mode or advances the story. Replay
   replaces only this SVG, so it cannot reset the diagram's animation. */
function screenScenePreview(initialScene) {
  var wrap = document.createElement('div');
  wrap.className = 'screen-scene-preview';
  var box = document.createElement('div');
  box.className = 'screenbox m-live';
  box.setAttribute('role', 'img');
  wrap.appendChild(box);
  var foot = document.createElement('div');
  foot.className = 'screen-scene-footer';
  var note = document.createElement('span');
  note.className = 'fnote';
  note.textContent = 'Simulated clip preview';
  var replay = document.createElement('button');
  replay.type = 'button';
  replay.className = 'bbtn';
  replay.textContent = 'Replay clip';
  foot.appendChild(note);
  foot.appendChild(replay);
  wrap.appendChild(foot);
  var selected;
  function setScene(scene) {
    selected = SCENE_TOKENS.indexOf(scene) >= 0 ? scene : 'static-noise';
    box.innerHTML = SCENES[selected];
    box.setAttribute('aria-label', SCENE_LABELS[selected] + ' — simulated clip preview');
  }
  replay.addEventListener('click', function () {
    setScene(selected);
  });
  setScene(initialScene);
  return { element: wrap, setScene: setScene };
}

PanelRegistry.extend('screen', {
  authoring: {
    template: { title: 'Camera', scene: 'static-noise', initial: { mode: 'off' } },
    initialFields: true,
    transientFields: ['mode', 'scenePlayback', 'banner', 'reason', 'audio', 'spotlight'],
    setupFields: [
      ['scene', 'scene'],
      ['initial', 'json'],
    ],
    patchFields: [
      ['mode', 'enum', SCREEN_MODES],
      ['scenePlayback', 'enum', ['waiting', 'playing']],
      ['banner', 'text'],
      ['reason', 'text'],
      ['audio', 'objf', FlowAudio.fields],
      ['spotlight', 'enum', SCREEN_SPOTLIGHTS],
    ],
    origin: function (panel, key, snapshot, context) {
      return panelSanitizedOrigin(key, context, function (raw) { return screenCleanState(raw, false); });
    },
    picker: {
      order: 15,
      name: 'Camera view',
      category: 'Places & sensing',
      tagline: 'What the camera sees',
      description:
        'Show camera video, two-way talk, recorded warnings, sound detection and an independent spotlight.',
    },
    example: function (sample, context) {
      var panel = sample.panel,
        state = sample.state,
        states = sample.states,
        step = sample.step;
      panel.scene = 'person-through-door';
      state = { mode: 'live' };
      panel.initial = builderClone(state);

      return { panel: panel, state: state, states: states, step: step };
    },
    editor: function (context) {
      return {
        setupField: function (field, panel) {
          if (field[1] !== 'scene') return;
          var key = field[0],
            cur = panel[key];
          var scenes = document.createElement('div');
          scenes.className = 'screen-scene-control';
          var preview = screenScenePreview(cur);
          var picker = context.controls.select(
            SCENE_TOKENS,
            cur,
            function (v) {
              var ok = context.commit(key, v == null ? null : JSON.stringify(v));
              if (ok) preview.setScene(v);
              return ok;
            },
            true
          );
          picker.setAttribute('aria-label', 'Screen scene');
          scenes.appendChild(picker);
          scenes.appendChild(preview.element);
          return context.controls.block(key, scenes);
        },
        patchField: function (f, input, options) {
          if (f[0] !== 'scenePlayback') return;
          input.setAttribute('aria-label', 'Scene event');
          Array.prototype.forEach.call(input.options, function (option) {
            if (option.value === 'waiting') option.textContent = 'Before event';
            else if (option.value === 'playing') option.textContent = 'Play event';
            else if (option.value === '') option.textContent = options && options.initial ? 'Default' : 'Inherit';
          });
        },
        patchIntro: function (body) {
          var sceneNote = document.createElement('p');
          sceneNote.className = 'home-note';
          sceneNote.textContent =
            'Active means on without livestreaming or recording. Audio and spotlight carry independently of video. Camera output is heard by the visitor; microphone capturing means the camera hears the visitor. Each audio object replaces the prior audio state; null clears it. Audio is visual only. Unavailable hides video and shows its reason.';
          body.appendChild(sceneNote);
        },
        patchLabel: function (key) {
          return key === 'scenePlayback' ? 'Scene event' : key;
        },
      };
    },
  },
});
