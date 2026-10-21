'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {copyCheckout}=require('./checkout-copy.js');
const fixture=path.join(__dirname,'../fixtures/company-icons');
const beaconPath='M3 20 12 2 21 20 12 15Z';
const relayPath='M2 8 8 2 16 2 22 8 22 16 16 22 8 22 2 16Z';
function spec(){return {page:{title:'Fork custom icons',brand:{app:'Acme',icon:'acme-beacon'},sections:[{heading:'Fork equipment',diagram:{view:'step',autoplay:false,
  nodes:{beacon:{title:'Beacon',icon:'acme-beacon'},relay:{title:'Relay',icon:'acme-relay'}},rows:[['beacon','relay']],edges:[{from:'beacon',to:'relay',kind:'https'}],
  brand:{app:'Acme',icon:'acme-relay'},panels:[{id:'app',type:'deviceapp',title:'Equipment',fields:[{id:'signal',label:'Beacon status',icon:'acme-beacon'}],initial:{signal:{value:'Ready',status:'ready'}}}],
  steps:[{id:'ready',text:'Beacon ready',nodes:['beacon']},{id:'relay',text:'Relay takes over',panels:{app:{signal:{icon:'acme-relay'}}}}]
}}]}};}
function scratchFork(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-custom-icons-'));copyCheckout(root);return root;}
function supplyIcons(root){fs.cpSync(fixture,path.join(root,'company'),{recursive:true});}
function buildFork(root){
  const options={cwd:root,env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:'off'},encoding:'utf8',timeout:120000,maxBuffer:24*1024*1024};
  execFileSync('git',['init','-q'],options);
  execFileSync('python3',['tools/build.py','--no-config'],options);
  execFileSync(process.execPath,['tools/native-viewer-build.mjs',path.join(root,'native.js')],options);
}
module.exports={fixture,beaconPath,relayPath,spec,scratchFork,supplyIcons,buildFork};
