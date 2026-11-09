'use strict';
// #1196: a connection gets a trace time only when the step's traceMatch.nodeId is the
// node the connection ends at. The validator warns (never errors) when a step with
// edges names another node, and names the receiving node to use instead.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{spawnSync}=require('node:child_process');
const C=require('../tools/canon/core.cjs');
const board=(step)=>({nodes:{api:{title:'API'},db:{title:'DB'},cache:{title:'Cache'},log:{title:'Log'}},rows:[['api','db','cache','log']],
  edges:[{from:'api',to:'db'},{from:'api',to:'cache'}],steps:[{id:'write',...step}]});
const timing=result=>result.warnings.filter(w=>/connection times use the receiving node/.test(w));
const select=nodeId=>({serviceName:'api',operation:'POST /orders',nodeId});

test('a sending-end nodeId warns and names the receiving node; a receiving-end one does not',()=>{
  let result=C.validateSpec(board({edge:'api->db',traceMatch:select('api')}));
  assert.deepEqual(result.errors,[]);
  assert.equal(timing(result).length,1,JSON.stringify(result.warnings));
  assert.match(timing(result)[0],/steps\[0\]\.traceMatch\.nodeId: 'api' is the sending end of edge api->db; connection times use the receiving node 'db'$/);
  assert.deepEqual(timing(C.validateSpec(board({edge:'api->db',traceMatch:select('db')}))),[],'the receiving node is right');
  assert.deepEqual(timing(C.validateSpec(board({edges:['api->db','api->cache'],traceMatch:select('cache')}))),[],'the target of any of the step\'s edges is right');
  assert.deepEqual(timing(C.validateSpec(board({edge:'api->db',traceMatch:{serviceName:'api',operation:'POST /orders'}}))),[],'no nodeId, no warning');
  assert.deepEqual(timing(C.validateSpec(board({nodes:['api'],traceMatch:select('api')}))),[],'a step without edges times its node only');
});
test('alternatives are checked one by one; a nodeId on neither end also warns',()=>{
  const result=C.validateSpec(board({edges:['api->db'],traceMatch:[select('db'),select('api'),select('log')]}));
  assert.deepEqual(result.errors,[]);
  const found=timing(result);
  assert.equal(found.length,2,JSON.stringify(result.warnings));
  assert.match(found[0],/steps\[0\]\.traceMatch\[1\]\.nodeId: 'api' is the sending end of edge api->db; connection times use the receiving node 'db'$/);
  assert.match(found[1],/steps\[0\]\.traceMatch\[2\]\.nodeId: 'log' is not the receiving end of this step's edges \(api->db\); connection times use the receiving node 'db'$/);
});
test('node tools/validate.js prints the warning',t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'edge-timing-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'board.json');fs.writeFileSync(file,JSON.stringify(board({edge:'api->db',traceMatch:select('api')})));
  const run=spawnSync(process.execPath,[path.join(__dirname,'../tools/validate.js'),file],{encoding:'utf8'});
  assert.match(run.stdout,/warn .*'api' is the sending end of edge api->db; connection times use the receiving node 'db'/,run.stdout+run.stderr);
});
