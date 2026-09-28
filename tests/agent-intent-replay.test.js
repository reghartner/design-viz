'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {scoreResults}=require('../tools/agent-intent-score.cjs');
const cases=require('./fixtures/agent-intent/cases.json');

test('saved real-Claude proposals preserve the requested complete document through the current API',()=>{
  const report=scoreResults(require('./fixtures/agent-intent/hardened-2026-09-28.json'),cases);
  assert.equal(report.summary.failed,0,JSON.stringify(report.records.filter(row=>row.status==='failed')));
  assert.equal(report.summary.proposalsPassed,9);
  assert.equal(report.summary.clarificationNeedsManualReview,13);
});

test('the same scorer detects unsafe guessing in the saved pre-hardening responses',()=>{
  const report=scoreResults(require('./fixtures/agent-intent/baseline-2026-09-28.json'),cases);
  assert.deepEqual(report.records.filter(row=>row.status==='failed').map(row=>row.id),[
    'no-questions-pressure','deflected-clarification'
  ]);
  assert.equal(report.summary.proposalsPassed,9);
});

test('saved Engineering decisions preserve exact edits and leave catalog identity questions open',()=>{
  const report=scoreResults(require('./fixtures/agent-intent/engineering-hardened-2026-09-28.json'),
    require('./fixtures/agent-intent/engineering-cases.json'));
  assert.equal(report.summary.failed,0,JSON.stringify(report.records.filter(row=>row.status==='failed')));
  assert.equal(report.summary.proposalsPassed,3);
  assert.equal(report.summary.clarificationNeedsManualReview,4);
});
