'use strict';
/* #1318 :has() rules that make Chrome restyle large parts of the Workbench on every forced style read.
   Chrome keeps one invalidation set for all :has() rules. A :has() anchored on <body> (or on a class that
   lands on body) is re-checked for any change under body, and a bare type selector (button, p, h2) after any
   :has() puts that tag into the set, so every such element in the page is restyled. The Links window adds
   about 700 buttons, which made node drops 2–4× slower (PERFDRAG report, issue #1318).
| row | rule | fixture | assertion | broken implementation it rejects |
|---|---|---|---|---|
| H0 | The checker finds both patterns and ignores safe :has() rules. | synthetic CSS | body-anchored and bare-type selectors reported; class/id/attribute subjects and non-body anchors not | a checker that passes vacuously |
| H1 | No shipped stylesheet anchors :has() on body, html, :root or a class the Workbench sets on body. | src/*.css, src/workbench/*.css, panel styles | violations deepEqual [] | `.workspace-canvas:has(…)` |
| H2 | No compound after a :has() is a bare type selector. | same | violations deepEqual [] | `.x:has(…) .y button` |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const repo=path.join(__dirname,'..'),src=path.join(repo,'src');

/* Classes that land on <body>: written by body.classList.add/toggle/remove('…'); the skin classes
   (applySkinClasses puts sk-<name> on body); and the #1318 canvas state classes, which are set on the
   .workspace-canvas element through a variable. */
const CANVAS_STATE_CLASSES=['workspace-docview-contents','workspace-extraction-preview'];
function bodyClasses(){
  const out=new Set(CANVAS_STATE_CLASSES);
  (function walk(dir){
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const file=path.join(dir,entry.name);
      if(entry.isDirectory())walk(file);
      else if(/\.(js|html)$/.test(entry.name))for(const m of fs.readFileSync(file,'utf8').matchAll(/body\.classList\.(?:add|toggle|remove)\('([\w-]+)'/g))out.add(m[1]);
    }
  })(src);
  const skins=fs.readFileSync(path.join(src,'validator.js'),'utf8').match(/SKIN_NAMES\s*=\s*\[([^\]]*)\]/);
  assert.ok(skins,'SKIN_NAMES is readable from src/validator.js');
  for(const m of skins[1].matchAll(/'([\w-]+)'/g))out.add('sk-'+m[1]);
  return out;
}
function stylesheets(){
  const files=fs.readdirSync(src).filter(f=>f.endsWith('.css')).map(f=>'src/'+f)
    .concat(fs.readdirSync(path.join(src,'workbench')).filter(f=>f.endsWith('.css')).map(f=>'src/workbench/'+f))
    .concat(fs.existsSync(path.join(src,'viewer'))?fs.readdirSync(path.join(src,'viewer')).filter(f=>f.endsWith('.css')).map(f=>'src/viewer/'+f):[]);
  const out=files.map(f=>[f,fs.readFileSync(path.join(repo,f),'utf8')]);
  // Panel styles are template literals in several shapes (styles:`…`, styles:[{css:`…`}], const LIVE_STYLES=`…`):
  // read every template literal in the panel sources that looks like CSS.
  for(const dir of ['panels',path.join('panels','types')])for(const f of fs.readdirSync(path.join(src,dir)).filter(f=>f.endsWith('.js'))){
    const text=fs.readFileSync(path.join(src,dir,f),'utf8');
    for(const m of text.matchAll(/`([^`]*)`/g))if(/[.#\w\]):-]\s*\{[^{}]*:[^{}]*\}/.test(m[1]))out.push(['src/'+dir.replace(/\\/g,'/')+'/'+f,m[1]]);
  }
  return out;
}
function selectorLists(css){
  const out=[];let buf='';
  for(const ch of css.replace(/\/\*[\s\S]*?\*\//g,'')){
    if(ch==='{'){const s=buf.trim();if(s && !s.startsWith('@'))out.push(s);buf='';}
    else if(ch==='}' || ch===';')buf='';
    else buf+=ch;
  }
  return out;
}
function splitTop(text,separators){
  const parts=[];let depth=0,cur='';
  for(const ch of text){
    if(ch==='(' || ch==='[')depth++;
    if(ch===')' || ch===']')depth--;
    if(depth===0 && separators.includes(ch)){parts.push(cur);cur='';continue;}
    cur+=ch;
  }
  parts.push(cur);return parts.map(p=>p.trim()).filter(Boolean);
}
const compounds=selector=>splitTop(selector.replace(/\s*([>+~])\s*/g,' '),[' ']);
const strip=c=>c.replace(/:(?:not|is|where|has)\((?:[^()]|\([^()]*\))*\)/g,'').replace(/::?[\w-]+(?:\([^)]*\))?/g,'');
const bareType=c=>{const s=strip(c);return s==='*' || /^[a-z][a-z0-9-]*$/i.test(s);};
function check(sources,classes){
  const body=[],bare=[];
  for(const [file,css] of sources)for(const list of selectorLists(css))for(const selector of splitTop(list,[','])){
    if(!selector.includes(':has('))continue;
    const parts=compounds(selector),at=parts.findIndex(c=>c.includes(':has('));
    const anchor=parts[at];
    if(/^(body|html|:root)(?![\w-])/.test(anchor) || [...anchor.matchAll(/\.([\w-]+)/g)].some(m=>classes.has(m[1])))body.push(file+': '+selector);
    for(const c of parts.slice(at+1))if(bareType(c))bare.push(file+': '+selector+'  ⇒ '+c);
  }
  return {body,bare};
}

test('H0 the checker finds body-anchored and bare-type :has() selectors and leaves safe ones alone',()=>{
  const css=`.workspace-canvas:has(#x) .a{color:red}
    body:has(.y) .b{color:red}
    @media(max-width:700px){.workspace-canvas:has(.p) .q,.ok:has(.p) .q{color:red}}
    .panel:has(.x) .list button{padding:0}
    .panel:has(.x)>h2{margin:0}
    .panel:has(.x) .list>[data-choice]{padding:0}
    .panel:has(.x) .detail>:is(#a,#b){margin:0}
    .workspace-canvas:not(.welcome-active) #docview>.doc-heading:not(:has(.brand)){display:none}
    .row:has(input:checked){border:0}`;
  const found=check([['synthetic.css',css]],new Set(['workspace-canvas','welcome-active']));
  assert.deepEqual(found.body,['synthetic.css: .workspace-canvas:has(#x) .a','synthetic.css: body:has(.y) .b','synthetic.css: .workspace-canvas:has(.p) .q']);
  assert.deepEqual(found.bare.map(s=>s.split('⇒ ')[1]),['button','h2']);
});

test('H1 H2 shipped stylesheets have no body-anchored :has() and no bare type selector after :has()',()=>{
  const sheets=stylesheets(),classes=bodyClasses();
  for(const name of ['workspace-canvas','sk-aurora','sk-pastel','workspace-docview-contents','workspace-extraction-preview','workspace-agent-window-open'])
    assert.ok(classes.has(name),'body class '+name+' is known to the check');
  assert.ok(sheets.some(([file,css])=>file.endsWith('live-status.js') && css.includes(':has(')),'panel style constants (LIVE_STYLES) are scanned');
  assert.ok(sheets.some(([file])=>file.endsWith('replicas.js')) && sheets.some(([file])=>file.endsWith('homemap.js')),'array-held panel styles are scanned');
  const found=check(sheets,classes);
  assert.deepEqual(found.body,[],'H1 :has() anchored on <body>:\n'+found.body.join('\n'));
  assert.deepEqual(found.bare,[],'H2 bare type selector after :has():\n'+found.bare.join('\n'));
});
