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

PanelViews.register(
  'screen',
  function (host, panel, state, skin, states, stepIdx, animate) {
    var h = '';
    var mode = String(state.mode || 'off');
    if (SCREEN_MODES.indexOf(mode) < 0) mode = 'off';
    var sceneName =
      SCENE_NAMES.indexOf(panel.scene) >= 0 ? panel.scene : 'static-noise';
    var scrClass =
      'screenbox m-' +
      mode +
      (state.scenePlayback === 'waiting' &&
      ['active', 'live', 'rec', 'save'].indexOf(mode) >= 0
        ? ' scene-waiting'
        : '');
    /* overlays are built separately from the scene so a mode change between
       two scene-showing modes can swap ONLY the overlays (surgical path
       below) and keep the scene subtree's animation state (the walker) */
    var scrOvl = '';
    if (mode === 'active')
      scrOvl += '<span class="ovl activechip">ACTIVE</span>';
    if (mode === 'live') scrOvl += '<span class="ovl livechip">LIVE</span>';
    if (mode === 'rec')
      scrOvl +=
        '<span class="ovl recchip"><span class="recdot"></span>REC</span>';
    if (mode === 'save')
      scrOvl +=
        '<span class="ovl banner">' +
        esc(state.banner || 'SAVING CLIP') +
        '</span>';
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
    h += '<div class="' + scrClass + '">';
    if (mode === 'boot') h += SCENES['static-noise'];
    else if (
      mode === 'active' ||
      mode === 'live' ||
      mode === 'rec' ||
      mode === 'save'
    )
      h += SCENES[sceneName];
    h += scrOvl + '</div>';
    return {
      html: h,
      patch: function () {
        /* screen surgical path: consecutive modes that both show the SAME scene
     (active / live / rec / save) swap only the mode class and the overlay chips,
     keeping the scene subtree — the walker's animation state survives.
     Any other transition (off/boot involved, or a first render) rebuilds. */
        var surgical = false;
        var SCENE_SHOWING = { active: true, live: true, rec: true, save: true };
        if (
          host._lastHTML != null &&
          sceneName === host._scrScene &&
          SCENE_SHOWING[mode] &&
          SCENE_SHOWING[host._scrMode]
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
          }
        }
        host._scrMode = mode;
        host._scrScene = sceneName;
        host._scrOverlay = scrOvl;
        return surgical;
      },
    };
  }
);
