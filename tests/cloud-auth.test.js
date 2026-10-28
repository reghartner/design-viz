const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');const {webcrypto}=require('node:crypto');
function setup({url='https://editor.example/?cloud=p&view=read',config,stored={}}={}){
 const location=new URL(url),items=new Map(Object.entries(stored)),requests=[],navigation=[],history=[];
 location.assign=value=>navigation.push(value);
 const ctx=vm.createContext({URL,URLSearchParams,Uint8Array,TextEncoder,crypto:webcrypto,Date,btoa:v=>Buffer.from(v,'binary').toString('base64'),location,
 sessionStorage:{getItem:k=>items.get(k)||null,setItem:(k,v)=>items.set(k,v),removeItem:k=>items.delete(k)},history:{state:{view:'old'},replaceState:(_s,_t,url)=>history.push(String(url))},fetch:async(url,init)=>{requests.push({url,init});return {ok:true,json:async()=>({access_token:'access',expires_in:3600})};}});
 vm.runInContext(fs.readFileSync('src/workbench/cloud-auth.js','utf8'),ctx);const defaults={api:'https://api.example',domain:'https://login.example',clientId:'public',scope:'flowview/projects',redirectUri:'https://editor.example/'};
 return {auth:ctx.createFlowviewCloudAuth(config || defaults),items,requests,navigation,history,ctx,config:defaults};
}
test('PKCE S256 authorize request has no secret, preserves share return URL and exchanges verified state',async()=>{
 const f=setup();await f.auth.signIn();const authorize=new URL(f.navigation[0]),pending=JSON.parse(f.items.get('flowview-cloud-auth:public:pkce'));
 assert.equal(authorize.pathname,'/oauth2/authorize');assert.equal(authorize.searchParams.get('response_type'),'code');assert.equal(authorize.searchParams.get('code_challenge_method'),'S256');assert.ok(!authorize.searchParams.has('client_secret'));assert.equal(authorize.searchParams.get('state'),pending.state);assert.equal(pending.returnTo,'/?cloud=p&view=read');
 const expected=Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(pending.verifier))).toString('base64url');assert.equal(authorize.searchParams.get('code_challenge'),expected);
 const g=setup({url:'https://editor.example/?code=code&state='+pending.state,stored:Object.fromEntries(f.items)});await g.auth.init();assert.equal(g.requests.length,1);assert.equal(g.requests[0].init.body.get('code_verifier'),pending.verifier);assert.equal(g.auth.access(),'access');assert.equal(g.history.at(-1),'/?cloud=p&view=read');assert.ok(!g.items.has('flowview-cloud-auth:public:pkce'));
 g.auth.signOut();assert.equal(g.auth.access(),null);assert.ok(!g.items.has('flowview-cloud-auth:public'));assert.equal(new URL(g.navigation.at(-1)).pathname,'/logout');
});
test('mismatched/expired/missing OAuth state never exchanges; expired access token is unavailable',async()=>{
 for(const pending of [null,{state:'different',at:Date.now(),verifier:'x'},{state:'ok',at:Date.now()-700000,verifier:'x'}]){
  const f=setup({url:'https://editor.example/?code=c&state=ok',stored:pending?{'flowview-cloud-auth:public:pkce':JSON.stringify(pending)}:{}});await assert.rejects(f.auth.init(),/state expired/);assert.equal(f.requests.length,0);
 }
 const f=setup({stored:{'flowview-cloud-auth:public':JSON.stringify({access:'expired',expires:Date.now()-1})}});await f.auth.init();assert.equal(f.auth.access(),null);
});
test('mock authentication accepts only same loopback API and never production origin',()=>{
 assert.throws(()=>setup({config:{mock:true,api:'https://api.example',clientId:'mock'}}),/loopback/);
 assert.throws(()=>setup({url:'http://127.0.0.1:8787',config:{mock:true,api:'http://127.0.0.1:9000',clientId:'mock'}}),/loopback/);
 assert.doesNotThrow(()=>setup({url:'http://127.0.0.1:8787',config:{mock:true,api:'/api',clientId:'mock'}}));
});
