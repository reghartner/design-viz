// Render the real Status panel and diagram using the canonical fictional traces.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {canonTraceFixture} from '../tests/helpers/canon-trace-evidence.mjs';
const dir=path.resolve(process.argv[2] || '.local/status-trace-demo');await mkdir(dir,{recursive:true});
const f=await canonTraceFixture(),spec=path.join(dir,'status-trace.spec.json'),out=path.join(dir,'status-trace.html');
await writeFile(spec,JSON.stringify(f.spec,null,2)+'\n');
execFileSync('python3',['tools/inject.py',spec,'template/flowview.html',out],{stdio:'pipe'});
const data=JSON.stringify(f).replaceAll('<','\\u003c');
const boot=`<script>(function(){var f=${data};window.flowviewTelemetry={source:'Canonical fictional trace fixtures',provider:async function(){return f.samples;},canChooseExemplar:function(id,token,traceId){return !!f.alternatives[traceId];},chooseExemplar:async function(id,token,traceId){var e=Object.assign({},f.alternatives[traceId],{selectionToken:token});f.samples[id].exemplars=[e];return e;}};})();</script>`;
await writeFile(out,(await readFile(out,'utf8')).replace('\n<script>\n','\n'+boot+'\n<script>\n'));console.log(out);
