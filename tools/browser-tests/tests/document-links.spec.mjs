import {test,expect,paste,prepareEditorSurface} from '../helpers/test.mjs';
import {projectFiles,useProjectDownloads} from '../helpers/project-export.mjs';
import {repo} from '../helpers/prepare.mjs';
import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {publishLibrary} from '../../canon/library.mjs';
const require=createRequire(import.meta.url),{readSource}=require('../../source-loader.cjs');
const claude='https://claude.ai/public/artifacts/shared-artifact-123';
const diagram=()=>({nodes:{a:{title:'Client'},b:{title:'Service'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'send',edge:'a->b',text:'Send request'},{id:'reply',edge:'a->b',text:'Reply'}]});
const spec=()=>({page:{title:'Document destinations',sections:[{id:'overview',heading:'Overview',diagram:diagram()}]}});
async function standalone(server,name,raw){
 const input=path.join(server.root,name+'.json');await writeFile(input,JSON.stringify(raw));execFileSync('python3',[path.join(repo,'tools/inject.py'),input,path.join(repo,'template/flowview.html'),path.join(server.root,name+'.html')]);
 return server.origin+'/'+name+'.html';
}
async function clipboard(page){await page.evaluate(()=>{window.copied=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.copied.push(text);}}});});}

for(const [route,artifactId] of [['public/artifacts','shared-artifact-123'],['artifact','diagram_123'],['code/artifact','f57e291a-a2b8-48ca-a872-3f8f9c3db600']]){
const artifactURL='https://claude.ai/'+route+'/'+artifactId+'?source=shared&mode=preview#artifact';
test('desktop settings persist '+route+' identity and URL through undo, redo and JSON/HTML export',async({page,server,context},info)=>{
 await useProjectDownloads({page});await page.goto(server.origin+'/workbench.html');await paste(page,JSON.stringify(spec()));await prepareEditorSurface(page);
 await page.locator('#editor-tab-inspect').click();await page.locator('#document-settings').click();
 async function field(label,value){const input=page.locator('#guide').getByLabel(label,{exact:true});await input.fill(value);await input.press('Enter');}
 await field('Diagram ID','existing_diagram');const before=await page.locator('#src').inputValue();
 await field('Claude artifact share URL',artifactURL);
 await expect.poll(async()=>JSON.parse(await page.locator('#src').inputValue()).page.documentLinks).toEqual({id:'existing_diagram',claudeUrl:artifactURL,claudeArtifactId:artifactId});
 await page.locator('#undo-builder').click();await expect(page.locator('#src')).toHaveValue(before);await page.locator('#redo-builder').click();
 await page.locator('#document-settings').click();await expect(page.locator('#guide').getByLabel('Diagram ID',{exact:true})).toHaveValue('existing_diagram');
 await page.locator('#guide').screenshot({path:info.outputPath('document-link-settings.png')});
 const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-save').click();const files=await projectFiles(await download);
 const saved=JSON.parse(files['document-destinations.spec.json']);expect(saved.page.canon).toBeUndefined();expect(saved.page.documentLinks).toEqual({id:'existing_diagram',claudeUrl:artifactURL,claudeArtifactId:artifactId});
 await writeFile(path.join(server.root,'exported-links.html'),files['document-destinations.html']);const reader=await context.newPage();await reader.goto(server.origin+'/exported-links.html');
 await reader.getByRole('button',{name:'Open Contents',exact:true}).click();
 await expect(reader.locator('.reader-document-links').getByRole('link',{name:'Open in Claude'})).toHaveAttribute('href',artifactURL);
 await expect(reader.locator('.reader-document-links').getByRole('link',{name:'Open on internal site'})).toHaveCount(0);await reader.close();
});

}

test('standalone snapshot keeps nested source destinations and copy actions without provider context',async({page,server},info)=>{
 const base=server.origin+'/internal/flowspec.html';
 function registered(id,d){return {page:{title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},documentLinks:{siteBaseUrl:base,claudeUrl:claude,claudeArtifactId:'shared-artifact-123'},sections:[{id:'overview',heading:'Overview',diagram:d}]}};}
 const provider=registered('provider',{...diagram(),topologyExports:{shared:{nodes:['a','b'],edges:['a->b']}}});
 const middle=registered('middle',{topologyImports:[{spec:'provider',export:'shared',as:'p'}],topologyExports:{shared:{nodes:['p::a','p::b'],edges:['p::a->p::b']}}});
 const consumer=registered('consumer',{topologyImports:[{spec:'middle',export:'shared',as:'m'}]});
 const B={URL};vm.createContext(B);for(const file of ['canon.js','validator.js','workbench/io-model.js'])vm.runInContext(readSource(file),B);
 const snapshot=B.prepareExportSnapshot(JSON.stringify(consumer),()=>B.FlowTopology.materialize([provider,middle,consumer])[2]);expect(snapshot.error).toBeUndefined();expect(snapshot.text).not.toMatch(/topologyImports|topologyProvenance|"specs"|"catalog"/);
 await page.goto(await standalone(server,'source-links',JSON.parse(snapshot.text)));await clipboard(page);
 await page.getByRole('button',{name:'Open Contents',exact:true}).click();
 const menu=page.locator('.reader-document-links');await expect(menu.getByRole('link',{name:'Open on internal site'})).toHaveAttribute('href',base+'?diagram=consumer');await expect(menu.getByRole('link',{name:'Open in Claude'})).toHaveAttribute('href',claude);
 await menu.getByRole('button',{name:'Copy Claude link'}).click();expect(await page.evaluate(()=>copied.pop())).toBe(claude);
 await page.locator('[data-dv-node="m::p::a"] .nrefs-trigger').click();
 const links=page.getByRole('dialog',{name:'Links for Client'});await expect(links.getByRole('link',{name:'Open source diagram · provider · Open on internal site ↗',exact:true})).toHaveAttribute('href',base+'?diagram=provider#d=overview');
 await links.getByRole('button',{name:'Copy Open source diagram · provider · Open on internal site',exact:true}).click();expect(await page.evaluate(()=>copied.pop())).toBe(base+'?diagram=provider#d=overview');
 await page.screenshot({path:info.outputPath('reader-source-destinations.png')});
});

test('native reader shows configured destinations and supports copied links in its shadow root',async({page,server})=>{
 await writeFile(path.join(server.root,'links-native.js'),await readFile(path.join(repo,'apps/backstage/src/generated/nativeViewer.js')));
 await writeFile(path.join(server.root,'links-native.html'),'<div id="host"></div><script type="module">import {mountNativeViewer} from "./links-native.js";window.mount=mountNativeViewer;</script>');
 await page.goto(server.origin+'/links-native.html');await page.waitForFunction(()=>!!window.mount);await clipboard(page);
 const raw=spec();raw.page.documentLinks={id:'existing_diagram',claudeUrl:claude};
 await page.evaluate(({raw,base})=>{window.viewer=mount(document.querySelector('#host'),raw,{siteBaseUrl:base});},{raw,base:server.origin+'/internal/'});
 await page.locator('#host').getByRole('button',{name:'Open Contents',exact:true}).click();
 const menu=page.locator('#host .reader-document-links');await expect(menu.getByRole('link',{name:'Open on internal site'})).toHaveAttribute('href',server.origin+'/internal/?diagram=existing_diagram');
 await menu.getByRole('button',{name:'Copy internal site link'}).click();expect(await page.evaluate(()=>copied.pop())).toBe(server.origin+'/internal/?diagram=existing_diagram');
 await page.evaluate(()=>viewer.destroy());await expect(page.locator('#host')).toBeEmpty();
});

test('hosted ID handoffs and pinned detail loading use the published catalog and restore Back state',async({page,server},info)=>{
 const root=path.join(server.root,'linked-site'),workbench=path.join(root,'workbench');await mkdir(workbench,{recursive:true});await cp(path.join(server.root,'workbench.html'),path.join(workbench,'flowspec.html'));await cp(path.join(server.root,'catalog.json'),path.join(workbench,'catalog.json'));await cp(path.join(server.root,'starters.json'),path.join(workbench,'starters.json'));
 const target=spec();target.page.title='Provider detail';target.page.sections[0].diagram.nodes.a.title='Provider client';
 const parent=spec();parent.page.title='Parent story';const nodes=parent.page.sections[0].diagram.nodes;nodes.a.handoff={spec:'provider',section:'overview',step:'reply',claudeUrl:claude};nodes.b.detail={spec:'provider',section:'overview',mode:'link',step:'reply'};
 parent.page.documentLinks={siteBaseUrl:server.origin+'/linked-site/workbench/flowspec.html'};
 const sources={provider:target,parent};for(const [id,raw] of Object.entries(sources)){const dir=path.join(root,'diagrams',id);await mkdir(dir,{recursive:true});await writeFile(path.join(dir,id+'.spec.json'),JSON.stringify(raw));await writeFile(path.join(dir,id+'.html'),'<!doctype html>');}
 const registryPath=path.join(root,'canon.json'),output=path.join(workbench,'diagrams.json');await writeFile(registryPath,JSON.stringify({version:1,diagrams:['provider','parent'].map(id=>({folder:'diagrams/'+id,owner:'group:default/test'}))}));
 let index=await publishLibrary({registryPath,output});nodes.b.detail.revision=index.diagrams.find(item=>item.id==='provider').revision;nodes.a.handoff.revision=nodes.b.detail.revision;
 await writeFile(path.join(root,'diagrams/parent/parent.spec.json'),JSON.stringify(parent));index=await publishLibrary({registryPath,output});
 const url=server.origin+'/linked-site/workbench/flowspec.html';await page.goto(url+'?diagram=parent');await expect(page.locator('#canon-reader-edit')).toBeEnabled();
 const reader=page.locator('#canon-reader');const handoffURL=await reader.locator('.handoff-link').getAttribute('href');expect(handoffURL).toContain(url+'?diagram=provider#d=overview&m=step&s=reply&fv=');expect(JSON.parse(new URLSearchParams(new URL(handoffURL).hash.slice(1)).get('fv')).revision).toBe(nodes.b.detail.revision);const opened=page.context().waitForEvent('page');await reader.locator('.handoff-link').click();const linked=await opened;await expect(linked.locator('#canon-reader-edit')).toBeEnabled();await expect(linked.locator('#canon-reader')).toContainText('Provider client');await linked.close();
 await reader.getByRole('button',{name:'Step',exact:true}).click();await reader.getByRole('button',{name:'Go to step 2',exact:true}).click();const before=page.url();
 await reader.locator('[data-dv-detail="b"]').click();const child=reader.locator('[data-dv-detail-preview]');await expect(child).toContainText('Provider client');await expect(child).toContainText('Reply');
 await child.locator('.detail-breadcrumb button').first().click();await expect(child).toHaveCount(0);expect(page.url()).toBe(before);await expect(reader.locator('[data-dv-node="a"]')).toBeVisible();
 // An unavailable pinned revision leaves the parent mounted and usable.
 nodes.a.handoff.revision='0'.repeat(64);nodes.a.handoff.claudeUrl=claude;nodes.b.detail.revision='0'.repeat(64);await writeFile(path.join(root,'diagrams/parent/parent.spec.json'),JSON.stringify(parent));await publishLibrary({registryPath,output});await page.reload();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await reader.locator('[data-dv-detail="b"]').click();await expect(reader).toContainText('detail revision is no longer');await expect(reader.locator('[data-dv-node="a"]')).toBeVisible();await expect(reader.locator('[data-dv-detail-preview]')).toHaveCount(0);
 await expect(reader.locator('.handoff-link')).not.toHaveAttribute('href');await reader.locator('.handoff-link').click();await expect(reader.getByRole('dialog',{name:'Diagram destinations'}).getByRole('link',{name:'Open in Claude'})).toHaveAttribute('href',claude);
 await page.screenshot({path:info.outputPath('hosted-stale-detail.png')});
 nodes.b.detail={spec:'missing',mode:'link',url:'https://untrusted.example/spec.json'};await writeFile(path.join(root,'diagrams/parent/parent.spec.json'),JSON.stringify(parent));await publishLibrary({registryPath,output});await page.reload();await expect(page.locator('#canon-reader-edit')).toBeEnabled();await reader.locator('[data-dv-detail="b"]').click();await expect(reader).toContainText('detail diagram is not in this published library');await expect(reader.locator('[data-dv-node="a"]')).toBeVisible();
});
