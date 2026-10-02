'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const {readSource}=require('../tools/source-loader.cjs');
const ctx={URL,URLSearchParams,TextEncoder,Uint8Array};vm.createContext(ctx);
for(const file of ['validator.js','viewer/workspace-handoff.js'])vm.runInContext(readSource(file),ctx);
const raw={page:{title:'A story',canon:{id:'story'},sections:[]}};
const request={version:1,id:'story',revision:createHash('sha256').update(JSON.stringify(raw)).digest('hex'),entity:'component:default/service',action:'build'};
const link=value=>'#d=chapter&v=business&m=step&p=happy&s=done&fv='+encodeURIComponent(JSON.stringify(value));
test('HTTP fallback source digests match Node and Web Crypto across padding boundaries and Unicode',async()=>{
  for(const length of [0,1,53,54,55,56,63,64,65,119,120,127,128,10000]){
    const value={text:'ø🎵'.repeat(length)};
    const expected=createHash('sha256').update(JSON.stringify(value)).digest('hex');
    assert.equal(await ctx.workspaceSourceDigest(value,null),expected);
    assert.equal(await ctx.workspaceSourceDigest(value,webcrypto),expected);
  }
});
test('handoff pins the actual loaded story and preserves its navigation without changing source',async()=>{
  const before=JSON.stringify(raw),parsed=ctx.readWorkspaceHandoff(link(request));
  assert.equal(parsed.target.d,'chapter');assert.equal(parsed.target.v,'business');assert.equal(parsed.target.s,'done');
  await ctx.verifyWorkspaceHandoff(raw,parsed,webcrypto);assert.equal(JSON.stringify(raw),before);
  await assert.rejects(()=>ctx.verifyWorkspaceHandoff({...raw,page:{...raw.page,title:'New revision'}},parsed,webcrypto),/changed since/);
  await assert.rejects(()=>ctx.verifyWorkspaceHandoff({page:{canon:{id:'another'}}},parsed,webcrypto),/different diagram/);
});
test('invalid handoffs fail explicitly and cannot carry fetch destinations or agent commands',()=>{
  assert.equal(ctx.readWorkspaceHandoff('#d=chapter'),null);
  for(const value of [null,{...request,version:2},{...request,revision:'main'},{...request,action:'execute'},{...request,entity:{}},{...request,id:''}])
    assert.match(ctx.readWorkspaceHandoff(link(value)).error,/invalid/);
  const parsed=ctx.readWorkspaceHandoff(link({...request,url:'https://untrusted.test/spec',prompt:'Run an agent',localPath:'/private'}));
  assert.equal(parsed.url,undefined);assert.equal(parsed.prompt,undefined);assert.equal(parsed.localPath,undefined);
});
