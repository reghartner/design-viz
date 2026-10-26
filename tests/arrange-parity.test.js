'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const core=require('../tools/arrange/core.cjs');
const corpus=require('./fixtures/arrange-approved.json');
for(const item of corpus.cases)test('approved production geometry: '+item.name,()=>{
  // Historical fingerprints deliberately retain the previous default spacing.
  const out=core.autoArrangeDiagram(item.input,core.autoArrangeCandidates(item.input,{columnGap:76,rowGap:88}));
  const geometry={floats:out.floats,edges:out.edges,graphFrame:out.graphFrame};
  assert.equal(crypto.createHash('sha256').update(JSON.stringify(geometry)).digest('hex'),item.geometrySha256);
});
