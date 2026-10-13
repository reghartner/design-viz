'use strict';
/* A company test: tests/company-overlay.test.js runs it in the normal suite. */
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {readSource,moduleSource}=require('../../tools/source-loader.cjs');

test('company overlay fixture: ticket board registers through its helper and validates its example',()=>{
  const context={URL,TextEncoder};
  vm.runInNewContext(readSource('validator.js'),context);
  assert.ok(context.PANEL_TYPES.includes('ticket-board'));
  assert.equal(context.CompanyTicketMath.percent(1,4),25);
  const backend={module:{exports:{}},URL,TextEncoder};
  vm.runInNewContext(moduleSource('backend','cjs'),backend);
  const spec=require(path.join(__dirname,'../examples/ticket-board/ticket-board.spec.json'));
  assert.deepEqual(JSON.parse(JSON.stringify(backend.module.exports.validateSpec(spec))),{errors:[],warnings:[]});
});
