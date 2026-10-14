'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm');
const {readSource}=require('../tools/source-loader.cjs');
const C={URL,Set,Map};vm.createContext(C);vm.runInContext(readSource('workbench/svg-export.js'),C);

test('SVG export filenames are deterministic, bounded and safe',()=>{
  assert.equal(C.svgExportFilename('Doorbell / Review','Failure: timeout?'),'doorbell-review-failure-timeout.svg');
  assert.equal(C.svgExportFilename('Same','Same'),'same.svg');
  assert.equal(C.svgExportFilename('../../\u0000',''),'diagram.svg');
  assert.equal(C.svgExportFilename('CON',''),'diagram-con.svg');
  assert.equal(C.svgExportFilename('Crème brûlée','API → DB'),'creme-brulee-api-db.svg');
  assert.ok(C.svgExportFilename('a'.repeat(200),'b'.repeat(200)).length<=133);
});

test('SVG export labels identify the document and active section as a diagram',()=>{
  assert.equal(C.svgExportLabel('Checkout','Failure path'),'Checkout — Failure path diagram');
  assert.equal(C.svgExportLabel('Checkout','Checkout'),'Checkout diagram');
  assert.equal(C.svgExportLabel('',''),'Flowview diagram');
});

test('style URL sanitizer permits same-document fragments and rejects external assets',()=>{
  const base='https://flowview.test/workbench/flowspec.html?draft=1';
  assert.equal(C.svgExportSafeStyleValue('url(#marker)','https://flowview.test/workbench/flowspec.html?draft=1'),'url(#marker)');
  assert.equal(C.svgExportSafeStyleValue('url("https://flowview.test/workbench/flowspec.html?draft=1#marker")',base),'url(#marker)');
  assert.equal(C.svgExportSafeStyleValue('url(https://attacker.test/pixel)','https://flowview.test/'),null);
  assert.equal(C.svgExportSafeStyleValue('url(data:image/svg+xml,bad)','https://flowview.test/'),null);
  assert.equal(C.svgExportSafeStyleValue('expression(alert(1))','https://flowview.test/'),null);
});

test('style staging retains only safe custom properties needed to resolve exported paint',()=>{
  const values={'--dv-aurora':'#123456',stroke:'#abcdef','--local-marker':'url(#marker)','--remote':'url(https://attacker.test/pixel)'};
  const style={0:'--dv-aurora',1:'stroke',2:'--local-marker',3:'--remote',length:4,item(index){return this[index];},getPropertyValue(name){return values[name];}};
  assert.equal(C.svgExportSafeCustomStyles(style,'https://flowview.test/workbench.html'),'--dv-aurora:#123456;--local-marker:url(#marker)');
});

test('editor-only state classes are removed without changing rendered state classes',()=>{
  assert.equal(C.svgExportClassName('node lit dv-sel dv-instep dv-connect-target tint-api'),'node lit tint-api');
  assert.equal(C.svgExportClassName('dv-rowgrab'), 'dv-rowgrab');
});
