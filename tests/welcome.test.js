'use strict';
const {readSource} = require('../tools/source-loader.cjs');

const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context={URL};vm.createContext(context);
for(const name of ['validator.js','welcome.workbench.js'])vm.runInContext(readSource(name),context);
const plain=value=>JSON.parse(JSON.stringify(value));
test('agent guidance links to the selected GitHub fork and revision, including enterprise hosts',()=>{
  const r=context.welcomeRepository('https://github.company.test/platform/flowview.git/','feature/welcome');
  assert.equal(r.repository,'https://github.company.test/platform/flowview');
  assert.equal(r.skill,'https://github.company.test/platform/flowview/blob/feature%2Fwelcome/.claude/skills/hld-to-page/SKILL.md');
  for(const url of ['javascript:alert(1)','http://github.com/team/flowview','https://user:secret@github.com/team/flowview','https://github.com/team/flowview?token=secret','https://github.com/team/flowview#secret','https://github.com/team/flowview/blob/main']){
    assert.ok(context.welcomeRepository(url,'main').error,url);
  }
  for(const ref of ['', 'main?token=secret', 'main#fragment','main\nextra'])assert.ok(context.welcomeRepository('https://github.com/team/flowview',ref).error,ref);
});
test('briefs preserve user sources and audience and route each task to the authoring skill',()=>{
  const repo=context.welcomeRepository('https://github.com/team/flowview','main');
  for(const kind of ['design','code','improve']){
    const prompt=context.welcomeAgentPrompt(kind,'   Explain recording failure   ','Engineers',repo);
    assert.ok(prompt.includes(repo.skill));assert.match(prompt,/My brief: Explain recording failure/);
    assert.match(prompt,/Audience: Engineers/);assert.match(prompt,/tools\/validate\.js/);
    assert.match(prompt,/coverage ledger/);assert.match(prompt,/cannot access the skill/);
  }
  assert.match(context.welcomeAgentPrompt('code','','Engineers',repo),/cite the implementation/);
  assert.match(context.welcomeAgentPrompt('improve','','Engineers',repo),/Preserve existing supported behavior/);
});
test('blank project is empty, valid, pastel, and independently allocated for each opening',()=>{
  const first=context.welcomeBlankSpec(),second=context.welcomeBlankSpec();
  assert.equal(first.page.skin,'pastel');
  const diagram=first.page.blocks[0].diagram;
  assert.deepEqual(plain(diagram.nodes),{});assert.deepEqual(plain(diagram.rows),[[]]);
  assert.deepEqual(plain(diagram.edges),[]);assert.deepEqual(plain(diagram.steps),[]);
  assert.deepEqual(plain(context.validate(context.normalize(first)).errors),[]);
  diagram.nodes.test={title:'Changed'};
  assert.deepEqual(plain(second.page.blocks[0].diagram.nodes),{});
});
