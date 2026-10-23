'use strict';
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const {copyCheckout}=require('./checkout-copy.js');
function scratch(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-panel-contract-'));
 try{copyCheckout(root);fs.cpSync(path.join(__dirname,'../fixtures/company-panel-contracts'),path.join(root,'company'),{recursive:true});return root;}
 catch(error){fs.rmSync(root,{recursive:true,force:true});throw error;}
}
function build(root){execFileSync('git',['init','-q'],{cwd:root});execFileSync('python3',['tools/build.py','--no-config'],{cwd:root,encoding:'utf8',timeout:120000,maxBuffer:24*1024*1024});}
module.exports={scratch,build};
