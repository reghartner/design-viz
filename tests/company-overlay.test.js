'use strict';
/* Company overlay inside the normal suite: runs company/tests/*.test.js and
   validates every company example spec against the freshly assembled runtime.
   Upstream ships no company tests or examples, so this adds nothing there. */
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const COMPANY=path.join(__dirname,'../company');

function walk(directory,out=[]){
  if(!fs.existsSync(directory))return out;
  for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
    if(entry.name==='node_modules')continue;
    const file=path.join(directory,entry.name);
    if(entry.isDirectory())walk(file,out);else if(entry.isFile())out.push(file);
  }
  return out;
}

const testsDir=path.join(COMPANY,'tests');
for(const file of fs.existsSync(testsDir)?fs.readdirSync(testsDir).filter(name=>/\.test\.c?js$/.test(name)).sort():[])
  require(path.join(testsDir,file));

const specs=walk(path.join(COMPANY,'examples')).filter(file=>file.endsWith('.spec.json'));
if(specs.length){
  test('company example specs validate without errors',()=>{
    const context={module:{exports:{}},URL,TextEncoder};
    vm.runInNewContext(require('../tools/source-loader.cjs').moduleSource('backend','cjs'),context);
    for(const file of specs){
      const result=context.module.exports.validateSpec(JSON.parse(fs.readFileSync(file,'utf8')));
      assert.deepEqual(JSON.parse(JSON.stringify(result.errors)),[],path.relative(path.join(__dirname,'..'),file));
    }
  });
}
