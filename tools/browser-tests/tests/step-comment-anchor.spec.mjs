import {writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

/* claude.ai artifact comments anchor to the element marked
   data-comment-target and hide a comment while that element's text differs
   from when it was placed. The shared step caption line is that element, so
   its text must name the step it shows, and the transition copy must not be
   a second target. */
const raw={page:{title:'Step comment anchors',sections:[{id:'paths',heading:'Delivery',diagram:{view:'step',autoplay:false,
 nodes:{sender:{title:'Sender'},receiver:{title:'Receiver'}},rows:[['sender','receiver']],edges:[{from:'sender',to:'receiver',kind:'int'}],
 steps:[{id:'start',text:'Ready to send',nodes:['sender']},{id:'delivered',text:'Delivery succeeded',edge:'sender->receiver'},
  {id:'failed',text:'Delivery failed',nodes:['receiver']},{id:'recover',text:'Recovered on alternate path',nodes:['receiver']}],
 paths:[{id:'happy',label:'Happy path',steps:['start','delivered']},{id:'alternate',label:'Alternate path',steps:['start','failed','recover']}]}}]}};

// The caption transition copy exists only when motion is allowed.
test.use({reducedMotion:'no-preference'});
test('step caption line is one comment target whose text names the shown step',async({page,server})=>{
 const input=path.join(server.root,'step-comment-anchor.json'),output=path.join(server.root,'step-comment-anchor.html');
 await writeFile(input,JSON.stringify(raw));
 execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),output]);
 await page.goto(server.origin+'/step-comment-anchor.html');
 const sec=page.locator('#section-paths'),line=sec.locator('.stepline:not(.dv-caption-old)');
 const chip=source=>sec.locator('.schip[data-step-source="'+source+'"]');
 await expect(line).toHaveAttribute('data-comment-target','');
 await expect(line).not.toHaveAttribute('id',/./);
 await expect(line).toContainText(/STEP 1\/2\s*Ready to send/);
 await page.evaluate(()=>{
  window.ghosts=[];
  new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{
   if(n.classList && n.classList.contains('dv-caption-old'))window.ghosts.push({target:n.hasAttribute('data-comment-target'),uncommentable:n.hasAttribute('data-uncommentable')});
  }))).observe(document.body,{childList:true,subtree:true});
 });
 for(const [source,label] of [[1,/STEP 2\/2\s*Delivery succeeded/],[2,/STEP 2\/3\s*Delivery failed/],[3,/STEP 3\/3\s*Recovered on alternate path/],[0,/STEP 1\/3\s*Ready to send/]]){
  await chip(source).click();
  await expect(line).toContainText(label);
  await expect(sec.locator('[data-comment-target]')).toHaveCount(1);
 }
 const ghosts=await page.evaluate(()=>window.ghosts);
 expect(ghosts.length).toBeGreaterThan(0);
 for(const ghost of ghosts)expect(ghost).toEqual({target:false,uncommentable:true});
});
