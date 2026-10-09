import {test,expect,paste} from '../helpers/test.mjs';

const layout=steps=>({
 id:'brief',name:'Brief',steps,
 sectionLayout:{default:[{x:0,y:0,w:12,h:12},{panel:'state',x:0,y:12,w:12,h:7},{controls:'steps',x:0,y:19,w:12,h:5}]}
});

function source(shared){
 const steps=[
  {id:'happy-first',text:'Start the happy route',edge:'a->b',panels:{state:{state:'Happy started'}}},
  {id:'happy-middle',text:'Hidden middle delivery',edge:'b->c',panels:{state:{state:'Happy middle'}}},
  {id:'happy-last',text:'Finish the happy route',edge:'c->d',panels:{state:{state:'Happy finished'}}},
  {id:'alternate-first',text:'Start the alternate route',edge:'a->e',panels:{state:{state:'Alternate started'}}},
  {id:'alternate-last',text:'Finish the alternate route',edge:'e->d',panels:{state:{state:'Alternate finished'}}},
  {id:'happy-note',text:'Narrate without a delivery',nodes:['narrator']}
 ];
 if(shared)steps.unshift({id:'shared-first',text:'Start either route',edge:'a->b',panels:{state:{state:'Shared started'}}});
 const paths=shared?
  [{id:'happy',label:'Happy path',steps:['shared-first','happy-middle','happy-note','happy-last']},
   {id:'alternate',label:'Alternate path',steps:['shared-first','alternate-first','alternate-last']}]:
  [{id:'happy',label:'Happy path',steps:['happy-first','happy-middle','happy-note','happy-last']},
   {id:'alternate',label:'Alternate path',steps:['alternate-first','alternate-last']}];
 const visible=shared?['shared-first','happy-last','alternate-first','alternate-last']:
  ['happy-first','happy-last','alternate-first','alternate-last'];
 return JSON.stringify({page:{title:'Path overview editor regression',sections:[{heading:'Delivery',diagram:{
  view:'step',autoplay:false,
  nodes:{a:{title:'A'},b:{title:'B'},c:{title:'C'},d:{title:'D'},e:{title:'E'},narrator:{title:'Narrator'},orphan:{title:'Orphan'}},
  rows:[['a','b','c','d'],['e','narrator','orphan']],
  edges:[{from:'a',to:'b'},{from:'b',to:'c'},{from:'c',to:'d'},{from:'a',to:'e'},{from:'e',to:'d'}],
  panels:[{id:'state',type:'state',states:['Pending','Shared started','Happy started','Happy middle','Happy finished','Alternate started','Alternate finished'],initial:{state:'Pending'}}],
  steps,paths,layouts:[layout(visible)],defaultLayout:'brief'
 }}]}});
}

const edge=(root,index)=>root.locator('path.edge[data-dv-edge="'+index+'"]');
const node=(root,id)=>root.locator('[data-dv-node="'+id+'"]');
const pathChip=(root,id)=>root.locator('.path-chip[data-dv-path="'+id+'"]');
const stepChip=(root,id,index)=>root.locator('.schip[data-step-path="'+id+'"][data-step-source="'+index+'"]');

async function expectOverview(root,edges,nodes){
 for(let index=0;index<5;index++)await expect(edge(root,index)).toHaveClass(edges.includes(index)?/\blit\b/:/^(?!.*\blit\b)/);
 for(const id of ['a','b','c','d','e','narrator','orphan'])await expect(node(root,id)).toHaveClass(nodes.includes(id)?/\blit\b/:/^(?!.*\blit\b)/);
}

for(const shared of [false,true])test((shared?'shared timeline':'matrix')+' path chips keep the full route highlighted in the editor',async({page,server})=>{
 const input=source(shared),first=0,last=shared?3:2,alternateFirst=shared?4:3;
 await page.goto(server.origin+'/workbench.html');await paste(page,input);
 const root=page.locator('#docview .doc-sec').first();
 await expect(root.locator(shared?'.path-timeline':'.path-matrix')).toHaveCount(1);

 // Reproduce the regression from an authored step selection. The editor's
 // path-change listener used to repaint step 1 after the viewer painted the route.
 await stepChip(root,'happy',last).click();
 await expect(page.locator('#guide .gpos')).toContainText('Happy path');
 await pathChip(root,'happy').click();
 await expect(root.locator('.schip[aria-current="true"]')).toHaveAttribute('data-step-source',String(first));
 await expect(page.locator('#guide .gpos')).toContainText('Happy path');
 await expect(page.locator('#guide .gpath')).toContainText('steps['+first+']');
 await expect(root.locator('.step-text')).toHaveText(shared?'Start either route':'Start the happy route');
 await expect(root.locator('.pt-state .preadout')).toHaveText(shared?'Shared started':'Happy started');
 await expectOverview(root,[0,1,2],['a','b','c','d']);

 // Clicking the selected chip is also an overview gesture, and switching paths
 // must replace the route without leaking the happy path's hidden hop.
 await pathChip(root,'happy').click();
 await expectOverview(root,[0,1,2],['a','b','c','d']);
 await root.getByRole('button',{name:'Next step',exact:true}).click();
 await expect(root.locator('.step-text')).toHaveText('Finish the happy route');
 await expect(root.locator('.pt-state .preadout')).toHaveText('Happy finished');
 await expectOverview(root,[2],['c','d']);
 await pathChip(root,'happy').click();
 await pathChip(root,'alternate').click();
 await expect(page.locator('#guide .gpos')).toContainText('Alternate path');
 await expect(page.locator('#guide .gpath')).toContainText('steps['+(shared?0:alternateFirst)+']');
 await expect(root.locator('.step-text')).toHaveText(shared?'Start either route':'Start the alternate route');
 await expect(root.locator('.pt-state .preadout')).toHaveText(shared?'Shared started':'Alternate started');
 await expectOverview(root,shared?[0,3,4]:[3,4],shared?['a','b','d','e']:['a','d','e']);

 // An explicit numbered step returns to ordinary one-step illumination.
 await stepChip(root,'alternate',shared?5:4).click();
 await expectOverview(root,[4],['d','e']);
 await expect(page.locator('#src')).toHaveValue(input);
});
