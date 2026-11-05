'use strict';
/* #945 contract: the authoring route is conditional, schema-backed and portable.
| row | assertion | rejects |
| --- | --- | --- |
| G1 | live-status-board loads metrics.md only for metrics/traffic/Grafana/Honeycomb/Loki/proof; telemetry-only work invents no Jira | growing every board prompt or requiring tickets |
| G2 | local/direct/nested/overlay/loader-selected carriers and every node origin use explicit bindings, never name-derived queries | local-only guidance or inferred queries |
| G3 | the chapter's complete JSON passes the runtime parsers; renaming `window` to `windwo` fails this same assertion | prose fields drifting from accepted schema |
| G4 | relative links resolve and hld-to-page remains below 6000 UTF-16 units | a conditional chapter agents cannot load or an oversized entry router |
*/
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const loader=require('../tools/source-loader.cjs');
const root=path.join(__dirname,'..'),skillPath='.claude/skills/live-status-board/SKILL.md',chapterPath='.claude/skills/live-status-board/metrics.md';
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const C={URL,TextEncoder};vm.createContext(C);vm.runInContext(loader.composeSources(['canon.js','validator.js']),C);

function chapterExample(text){
  const blocks=[...text.matchAll(/```json\n([\s\S]*?)```/g)].map(match=>JSON.parse(match[1]));
  const full=blocks.find(value=>value && value.page && value.page.tracking && value.page.tracking.telemetry);
  assert.ok(full,'chapter has one complete telemetry page example');
  return full;
}
function chapterProblems(text){
  const spec=chapterExample(text),problems=[],invalid=(at,message)=>problems.push(at+': '+message);
  const templates=C.trackingTelemetry(spec.page,invalid).templates;
  for(const section of spec.page.sections||[]){
    const diagram=section.diagram||{};
    for(const node of Object.values(diagram.nodes||{}))if(Object.hasOwn(node,'telemetry'))C.carrierTelemetry(node,templates,invalid);
    for(const edge of diagram.edges||[])if(Object.hasOwn(edge,'telemetry'))C.carrierTelemetry(edge,templates,invalid);
  }
  return problems;
}
function localLinks(file){
  const text=read(file),base=path.dirname(path.join(root,file));
  return [...text.matchAll(/\]\(([^)]+)\)/g)].map(match=>match[1].split('#',1)[0]).filter(link=>link && !link.includes('://')).map(link=>path.resolve(base,link));
}

test('G1 G2 conditional metrics route covers every carrier without Jira fiction or inferred bindings',()=>{
  const skill=read(skillPath),chapter=read(chapterPath),hld=read('.claude/skills/hld-to-page/SKILL.md');
  assert.match(skill,/Only when the request mentions metrics, traffic, Grafana, Honeycomb, Loki or\nproof, read \[Metrics authoring\]\(metrics\.md\)/);
  assert.match(skill,/A\nmetrics-only request does not require Jira; never invent an Epic, tickets or\nticket status/);
  assert.match(hld,/live-status-board.*requested; its Metrics chapter is conditional/s);
  for(const phrase of ['local, direct-imported, nested-imported, consumer-overlay and', 'loader-selected detail carriers', 'Never derive a query', 'same rules to all nodes and edges regardless of origin'])assert.ok(chapter.includes(phrase),phrase);
  for(const phrase of ['Preview metrics layout', 'synthetic', 'no connector or network call', 'exact prior-24-hour window', 'never a signed result/download URL'])assert.ok(chapter.includes(phrase),phrase);
});

test('G3 documented telemetry example is accepted and the negative-control field rename is rejected',()=>{
  const chapter=read(chapterPath),problems=chapterProblems(chapter);
  assert.deepEqual(problems,[],'every field in the complete documented example is accepted');
  for(const field of ['enabled','grafana','honeycomb','window','refreshMs','templates','kind','signals','proof','links','card','use','params','unit','min','max','maxRatioOf','dashboard','query','side','offset'])
    assert.match(chapter,new RegExp('`'+field+'`|"'+field+'"'),field+' is documented');
  const negative=chapter.replace('"window": "24h"','"windwo": "24h"');
  assert.notEqual(negative,chapter,'negative control changed the authored field');
  assert.match(chapterProblems(negative).join('\n'),/\.windwo: unknown field/);
});

test('G4 conditional chapter links resolve and bounded hld entry stays below its UTF-16 cap',()=>{
  for(const file of [skillPath,chapterPath])for(const target of localLinks(file))assert.ok(fs.existsSync(target),file+' -> '+target);
  const hld=read('.claude/skills/hld-to-page/SKILL.md');
  assert.ok(Buffer.from(hld,'utf16le').length/2<6000,'hld-to-page stays below 6000 UTF-16 units');
});
