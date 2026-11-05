// Reproducible desktop fixture from the real shared mock story, not a live account.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {stepFixture} from '../tests/helpers/step-evidence.mjs';
const dir=path.resolve(process.argv[2] || '.local/step-evidence/demo');await mkdir(dir,{recursive:true});
const f=await stepFixture(),spec=path.join(dir,'step-evidence.spec.json'),out=path.join(dir,'step-evidence.html');
await writeFile(spec,JSON.stringify(f.spec,null,2)+'\n');await writeFile(path.join(dir,'evidence.json'),JSON.stringify(f,null,2)+'\n');
execFileSync('python3',['tools/inject.py',spec,'template/flowview.html',out],{stdio:'pipe'});
const data=JSON.stringify(f).replaceAll('<','\\u003c');
const boot=`<script>
// Clearly labeled host fixture replay; all trace IDs/spans come from shared mocks.
(function(){var f=${data},samples=f.samples;
window.flowviewTelemetry={source:'Shared mock story fixture',provider:async function(){return JSON.parse(JSON.stringify(samples));},canChooseExemplar:function(id,token,traceId){return !!(f.alternative && f.alternative.traceId===traceId);},chooseExemplar:async function(id,token){var e=Object.assign({},f.alternative,{selectionToken:token});samples[id].exemplars=[e];return e;},history:async function(bindings){var map={};bindings.forEach(function(b){map[b.id]={signals:{rate:{series:[['2026-10-28T00:00:00Z',0],['2026-10-30T00:00:00Z',30]]}}};});return map;}};
window.flowviewLiveStatus={source:'Fictional Jira fixture',provider:async function(){return {'TRACE-1':{state:'done',title:'Ship event handling'}};}};
window.flowviewBooted=function(ctl){ctl.liveStatus.setHistory({load:async function(){return {days:[{key:'2026-10-27',at:'2026-10-28T00:00:00Z',label:'Earlier',states:{'TRACE-1':{state:'active'}}},{key:'2026-10-29',at:'2026-10-30T00:00:00Z',label:'Today',states:{'TRACE-1':{state:'done'}}}],index:1};}});};})();
</script>`;
const html=await readFile(out,'utf8'),anchor='\n<script>\n';
if(!html.includes(anchor))throw new Error('Standalone runtime script anchor is missing.');
await writeFile(out,html.replace(anchor,'\n'+boot+anchor));console.log(JSON.stringify({output:out,provenance:f.provenance}));
