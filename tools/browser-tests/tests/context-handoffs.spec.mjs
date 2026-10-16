import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const claude='https://claude.ai/artifact/target?shared=true#artifact';
const raw=base=>({page:{title:'Context handoffs',documentLinks:{id:'origin',siteBaseUrl:base,claudeUrl:'https://claude.ai/artifact/origin'},sections:[{id:'overview',diagram:{nodes:{next:{title:'Next',handoff:{spec:'target',siteBaseUrl:base,claudeUrl:claude,section:'delivery',step:'done'}}},rows:[['next']]}}]}});
async function standalone(server){const file=path.join(server.root,'context-links.json');await writeFile(file,JSON.stringify(raw(server.origin+'/internal/view.html')));execFileSync('python3',[path.join(repo,'tools/inject.py'),file,path.join(repo,'template/flowview.html'),path.join(server.root,'context-links.html')]);}

test('Claude-positive standalone handoff clicks the saved artifact while explicit menu links stay explicit',async({browser,server})=>{
 await standalone(server);
 // A separate, audited context fulfills only the expected Claude destination;
 // it never contacts Claude or permits an arbitrary outbound request.
 const context=await browser.newContext(),errors=[],requests=[];
 context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
 await context.route('**/*',route=>{const url=route.request().url();requests.push(url);if(url.startsWith(server.origin+'/'))return route.continue();if(url===claude.split('#')[0])return route.fulfill({contentType:'text/html',body:'<h1>Target artifact</h1>'});errors.push('Unexpected request '+url);return route.abort();});
 await context.addInitScript(()=>{try{localStorage.setItem('dv_tour_v1','done');}catch(_){}window.claude={use:()=>Promise.resolve(null)};});
 try{const page=await context.newPage();await page.goto(server.origin+'/context-links.html');
  const link=page.locator('[data-dv-node="next"] .handoff-link');await expect(link).toHaveAttribute('href',claude);
  await expect(page.locator('.reader-document-links').getByRole('link',{name:'Open on internal site'})).toHaveAttribute('href',server.origin+'/internal/view.html?diagram=origin');
  const opened=context.waitForEvent('page');await link.click();const target=await opened;await expect(target.getByRole('heading')).toHaveText('Target artifact');expect(target.url()).toBe(claude);expect(errors).toEqual([]);expect(requests.some(url=>url.includes('diagram=target'))).toBe(false);
 }finally{await context.close();}
});

test('configured-origin standalone uses site context; native overrides remain isolated and unavailable hosts offer choices',async({page,server,context})=>{
 await standalone(server);await page.goto(server.origin+'/context-links.html');
 await expect(page.locator('[data-dv-node="next"] .handoff-link')).toHaveAttribute('href',server.origin+'/internal/view.html?diagram=target#d=delivery&m=step&s=done');

 await writeFile(path.join(server.root,'context-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'context-native.html'),'<div id="claude"></div><div id="site"></div><div id="unknown"></div><script type="module">import {mountNativeViewer} from "./context-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/context-native.html');await page.waitForFunction(()=>!!window.mount);
 await page.evaluate(raw=>{window.viewers=['claude','site','unknown'].map(id=>mount(document.getElementById(id),raw,{handoffHost:id}));},raw(server.origin+'/internal/view.html'));
 await expect(page.locator('#claude [data-dv-node="next"] .handoff-link')).toHaveAttribute('href',claude);await expect(page.locator('#site [data-dv-node="next"] .handoff-link')).toHaveAttribute('href',server.origin+'/internal/view.html?diagram=target#d=delivery&m=step&s=done');
 await page.locator('#unknown [data-dv-node="next"] .handoff-link').click();const chooser=page.locator('#unknown').getByRole('dialog',{name:'Diagram destinations'});await expect(chooser.getByRole('link',{name:'Open in Claude'})).toHaveAttribute('href',claude);await expect(chooser.getByRole('link',{name:'Open on internal site'})).toBeVisible();await chooser.press('Escape');await expect(chooser).toHaveCount(0);
 await page.evaluate(()=>viewers.forEach(v=>v.destroy()));
});

test('React Backstage follows approved targets internally, restores Back, handles failures and retires requests',async({page,server,context},info)=>{
 const app=path.join(repo,'apps/backstage'),{build}=await import(pathToFileURL(path.join(app,'node_modules/esbuild/lib/main.js')));await mkdir(path.join(server.root,'context-host'));
 await build({absWorkingDir:app,stdin:{resolveDir:app,loader:'tsx',contents:await readFile(path.join(repo,'tools/browser-tests/fixtures/context-handoffs.tsx'),'utf8')},bundle:true,format:'iife',outfile:path.join(server.root,'context-host/app.js'),define:{'process.env.NODE_ENV':'"production"'}});
 await writeFile(path.join(server.root,'context-host/index.html'),'<div id="app"></div><script src="app.js"></script>');
 await page.goto(server.origin+'/context-host/index.html');const root=page.getByRole('region',{name:'Flowview: Association root'});
 await expect(root.locator('.handoff-link').first()).toBeVisible();await root.getByRole('button',{name:'Step',exact:true}).click();await root.getByRole('button',{name:'Go to step 2',exact:true}).click();
 await root.locator('[data-dv-node="known"] .handoff-link').click();const target=page.getByRole('region',{name:'Flowview: target destination'});await expect(target).toBeVisible();await expect(target.locator('.docview:visible')).toHaveCount(1);await expect(target.locator('[data-dv-node="known"]')).toBeHidden();await expect(target.getByRole('button',{name:'Open Known target diagram in Backstage'})).toHaveCount(0);await expect(target.getByText('Exact alternate target step',{exact:true}).first()).toBeVisible();
 expect(await page.evaluate(()=>handoffHost.requests.at(-1).ref)).toEqual({id:'target',revision:'r1'});expect(context.pages()).toHaveLength(1);
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:info.outputPath('backstage-internal-handoff.png')});await page.getByRole('button',{name:'Back to previous diagram'}).click();await expect(root).toBeVisible();await expect(root.locator('.docview:visible')).toHaveCount(1);await expect(root.locator('[data-dv-node="known"]')).toBeVisible();await expect(root.getByRole('button',{name:'Go to step 2',exact:true})).toHaveAttribute('aria-current','true');
 await root.locator('[data-dv-node="cross"] .handoff-link').click();await expect(page.getByRole('region',{name:'Flowview: cross destination'})).toBeVisible();expect(await page.evaluate(()=>handoffHost.requests.at(-1).ref)).toEqual({id:'cross',revision:'approved-index-revision'});
 await page.getByText('Where this service appears · jump within the diagram',{exact:true}).click();await page.getByRole('button',{name:'2. Root second step'}).click();await expect(root).toBeVisible();await expect(root.locator('.docview:visible')).toHaveCount(1);await expect(root.locator('[data-dv-node="known"]')).toBeVisible();await expect(root.getByRole('button',{name:'Go to step 2',exact:true})).toHaveAttribute('aria-current','true');
 for(const [id,message] of [['missing','pinned revision'],['stale','Stale requested revision'],['bad','section is no longer']]){
  await root.locator('[data-dv-node="'+id+'"] .handoff-link').click();const chooser=root.getByRole('dialog',{name:'Diagram destinations'});await expect(chooser).toContainText(message);await expect(chooser.getByRole('link',{name:'Open in Claude'})).toBeVisible();await expect(root).toBeVisible();await chooser.getByRole('button',{name:'Close',exact:true}).click();
 }
 await root.getByRole('button',{name:'Explore',exact:true}).click();await root.getByRole('button',{name:'Expand diagram view',exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);
 await root.locator('[data-dv-node="known"] .handoff-link').click();await expect(target).toBeVisible();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);await expect(target.locator('.docview:visible')).toHaveCount(1);
 await page.getByRole('button',{name:'Back to previous diagram'}).click();await expect(root.locator('.explore-stage')).toBeVisible();await expect(root.locator('.section-viewport')).not.toHaveClass(/viewport-expanded/);await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);await root.getByRole('button',{name:'Standard',exact:true}).click();
 await root.locator('[data-dv-node="slow"] .handoff-link').click();await expect(root.getByRole('dialog',{name:'Diagram destinations'})).toContainText('Loading');await root.locator('[data-dv-node="known"] .handoff-link').click();await expect(target).toBeVisible();expect(await page.evaluate(()=>handoffHost.requests.find(r=>r.ref.id==='slow').signal.aborted)).toBe(true);await page.evaluate(()=>handoffHost.resolveSlow());await expect(target).toBeVisible();
 await page.getByRole('button',{name:'Back to previous diagram'}).click();await root.locator('[data-dv-node="slow"] .handoff-link').click();await page.evaluate(()=>handoffHost.setEntity('component:default/replacement'));await expect(root).toBeVisible();await page.evaluate(()=>handoffHost.resolveSlow());await expect(root).toBeVisible();expect(context.pages()).toHaveLength(1);
});
