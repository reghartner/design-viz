'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http');
const {probeHttp}=require('./helpers/http-probe.js');
async function serve(t,handler){
  const server=http.createServer(handler);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}));
  return 'http://127.0.0.1:'+server.address().port;
}
test('image HTTP probe consumes the complete body and preserves status and headers',async t=>{
  const url=await serve(t,(_,res)=>{res.writeHead(200,{'Cache-Control':'no-cache'});res.write('{"version":');setTimeout(()=>res.end('1}'),15);});
  const result=await probeHttp(url,1000);
  assert.equal(result.status,200);assert.equal(result.headers['cache-control'],'no-cache');assert.deepEqual(JSON.parse(result.body),{version:1});
});
test('image HTTP probe fails a stalled body at its enforced deadline',async t=>{
  const url=await serve(t,(_,res)=>{res.writeHead(200);res.write('incomplete');});
  await assert.rejects(probeHttp(url,40),/timed out after 40ms/);
});
test('image HTTP probe rejects an interrupted body',async t=>{
  const url=await serve(t,(_,res)=>{res.writeHead(200,{'Content-Length':'100'});res.write('short');setTimeout(()=>res.destroy(),15);});
  await assert.rejects(probeHttp(url,1000),/aborted/);
});
