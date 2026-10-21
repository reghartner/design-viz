import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const selectedPackages=new Set((process.env.FLOWVIEW_PACKAGES||'').split(','));

const stories=[
  {name:'wave lesson',package:'physics',spec:'packages/physics/diagrams/waves-and-forces/waves-and-forces.spec.json',section:0,
    steps:[0,1,2,3,4],alternate:{path:'shutter',steps:[5]},panel:'.pwidget:has(.wavefield-panel)'},
  {name:'force lesson',package:'physics',spec:'packages/physics/diagrams/waves-and-forces/waves-and-forces.spec.json',section:1,
    heading:'02 / When a moving puck accelerates backward',steps:[0,1,2,3,4],panel:'.pwidget:has(.forcebody)'},
  {name:'RNA copy lesson',package:'science',spec:'packages/science/diagrams/biology/copy-gate/copy-gate.spec.json',section:0,
    steps:[0,1,2,3,4,5,6],alternate:{path:'interruption',steps:[7,8,9]},
    panel:'.pwidget:has(.cellscene),.pwidget:has(.rnacopy)'},
];

for(const story of stories)for(const viewport of [{width:1280,height:800},{width:1440,height:900}]){
  test(`${story.name} keeps controls in view and panels unclipped at ${viewport.width}×${viewport.height}`,async({page,server})=>{
    test.skip(!selectedPackages.has(story.package),`${story.package} package is opt-in for browser builds.`);
    await page.setViewportSize(viewport);
    const output=path.join(server.root,'science-story-controls.html');
    execFileSync('python3',[path.join(repo,'tools/inject.py'),path.join(repo,story.spec),
      path.join(repo,'template/flowview.html'),output]);
    await page.goto(server.origin+'/science-story-controls.html');
    const skip=page.getByText('Skip tour',{exact:true});
    if(await skip.isVisible())await skip.click();
    if(story.heading)await page.getByRole('button',{name:story.heading,exact:true}).first().click();
    const controls=page.locator('.termbar').nth(story.section);
    await expect(controls).toBeVisible();
    await expect(controls.locator('.step-transport')).toBeVisible();
    async function checkLayout(){
    const geometry=await page.evaluate(({section,panel})=>{
      const el=document.querySelectorAll('.termbar')[section];
      const rail=el.getBoundingClientRect();
      const buttons=[...el.querySelectorAll('button')].filter(button=>button.getClientRects().length)
        .map(button=>button.getBoundingClientRect());
      return {top:rail.top,bottom:rail.bottom,left:rail.left,right:rail.right,
        pageOverflow:document.documentElement.scrollWidth-innerWidth,
        scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,
        buttons:buttons.map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})),
        panels:[...document.querySelectorAll(panel)].map(e=>({scroll:e.scrollHeight,client:e.clientHeight}))};
    },{section:story.section,panel:story.panel});
    expect(geometry.top).toBeGreaterThanOrEqual(100);
    expect(geometry.bottom).toBeLessThanOrEqual(viewport.height);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth+1);
    for(const button of geometry.buttons){
      expect(button.left).toBeGreaterThanOrEqual(geometry.left-1);
      expect(button.right).toBeLessThanOrEqual(geometry.right+1);
      expect(button.top).toBeGreaterThanOrEqual(geometry.top-1);
      expect(button.bottom).toBeLessThanOrEqual(geometry.bottom+1);
    }
    expect(geometry.panels.length).toBeGreaterThan(0);
    for(const panel of geometry.panels)expect(panel.scroll).toBeLessThanOrEqual(panel.client+1);
    }
    for(const step of story.steps){
      await controls.locator(`[data-step-source="${step}"]`).first().click();
      await checkLayout();
    }
    if(story.alternate){
      await controls.locator(`[data-dv-path="${story.alternate.path}"]`).click();
      for(const step of story.alternate.steps){
        await controls.locator(`[data-step-source="${step}"]`).first().click();
        await checkLayout();
      }
    }
  });
}
