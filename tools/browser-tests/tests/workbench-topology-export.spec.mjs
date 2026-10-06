import {test,expect,pastePage} from '../helpers/test.mjs';
import {mkdir,mkdtemp,writeFile,readFile,cp,rm} from 'node:fs/promises';
import {pathToFileURL,fileURLToPath} from 'node:url';
import path from 'node:path';
import {publishLibrary} from '../../canon/library.mjs';
import C from '../../canon/core.cjs';

const repo=fileURLToPath(new URL('../../..',import.meta.url));
const model=(title,diagram)=>({page:{title,sections:[{id:'main',diagram}]}});
const diagram=spec=>spec.page.sections[0].diagram;
function fixtures(){
  return {
    provider:model('Provider',{nodes:{api:{title:'API'},store:{title:'Store'}},rows:[['api','store']],
      edges:[{from:'api',to:'store',kind:'https'}],topologyExports:{core:{nodes:['api','store'],edges:['api->store']}}}),
    middle:model('Middle',{topologyImports:[{spec:'provider',export:'core',as:'base'}],
      topologyExports:{core:{nodes:['base::api','base::store'],edges:['base::api->base::store']}}}),
    consumer:model('Consumer',{topologyImports:[{spec:'provider',export:'core',as:'shared'}]}),
  };
}

for(const [mode,action] of [['local-provider','file'],['direct-consumer','file'],['nested-consumer','file'],['nested-consumer','html'],['direct-consumer','both']]){
  test(action+' export makes a page-only offline HTML snapshot for '+mode,async({page,context,server},info)=>{
    const root=await mkdtemp(path.join(server.root,'topology-export-'));
    try{
      const workspace=path.join(root,'workbench');await mkdir(workspace);
      for(const [from,to] of [['workbench.html','flowspec.html'],['catalog.json','catalog.json'],['starters.json','starters.json']])
        await cp(path.join(server.root,from),path.join(workspace,to));
      await mkdir(path.join(root,'template'));
      await cp(path.join(repo,'template/flowview.html'),path.join(root,'template/flowview.html'));
      const source=fixtures(),url=server.origin+'/'+path.basename(root)+'/workbench/flowspec.html';
      const local=mode==='local-provider',nested=mode==='nested-consumer';
      if(!local)diagram(source.provider).nodes.api.title='API </ScRiPt><script>window.topologyInjection=true</script><!--';
      if(nested)diagram(source.consumer).topologyImports[0].spec='middle';
      const ids=local?[]:nested?['provider','middle','consumer']:['provider','consumer'];
      for(const id of ids){
        const folder=path.join(root,'diagrams',id);await mkdir(folder,{recursive:true});
        await writeFile(path.join(folder,id+'.spec.json'),JSON.stringify(source[id]));
      }
      await writeFile(path.join(root,'canon.json'),JSON.stringify({version:1,diagrams:ids.map(id=>({folder:'diagrams/'+id,owner:'group:default/test'}))}));
      await publishLibrary({registryPath:path.join(root,'canon.json'),output:path.join(workspace,'diagrams.json')});
      // Substitute only the native picker. Real browser file handles/writable
      // streams persist both artifacts in origin-private storage.
      await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{
        window.exportPickerActive=navigator.userActivation.isActive;
        return navigator.storage.getDirectory();
      };});
      await page.goto(url+(local?'':'?diagram=consumer'));
      if(local)await pastePage(page,JSON.stringify(source.provider,null,3));
      else{await expect(page.locator('#canon-reader-edit')).toBeEnabled();await page.locator('#canon-reader-edit').click();}
      const original=await page.locator('#src').inputValue(),expected=C.compatibility.stampText(original);
      const prefix=local?'':nested?'shared::base::':'shared::';
      await expect(page.locator('g.node[data-dv-node="'+prefix+'api"]')).toBeVisible();
      if(!local){
        diagram(source.provider).nodes.api.title='Changed after opening';
        await writeFile(path.join(root,'diagrams/provider/provider.spec.json'),JSON.stringify(source.provider));
      }
      const providerRequests=[];page.on('request',request=>{if(request.url().endsWith('.spec.json'))providerRequests.push(request.url());});
      const name=local?'provider':'consumer';let files;
      if(action==='html'){
        const download=page.waitForEvent('download');await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-html').click();
        const result=await download;expect(result.suggestedFilename()).toBe(name+'.html');
        files={html:await readFile(await result.path(),'utf8')};
        expect(await page.evaluate(()=>window.exportPickerActive)).toBeUndefined();
      }else{
        if(action==='file'){await page.locator('#editor-tab-file').click();await page.locator('#file-export').click();}
        else{await page.locator('#workspace-export-trigger').click();await page.locator('#file-export-both').click();}
        await expect.poll(()=>page.evaluate(async name=>{
          try{const root=await navigator.storage.getDirectory();return (await(await root.getFileHandle(name+'.html')).getFile()).size;}catch{return 0;}
        },name)).toBeGreaterThan(0);
        expect(await page.evaluate(()=>window.exportPickerActive)).toBe(true);
        files=await page.evaluate(async name=>{
          const root=await navigator.storage.getDirectory();
          async function read(suffix){return (await(await root.getFileHandle(name+suffix)).getFile()).text();}
          return {json:await read('.spec.json'),html:await read('.html')};
        },name);
      }
      if(action!=='html')expect(files.json).toBe(expected);await expect(page.locator('#src')).toHaveValue(original);
      const snapshot=JSON.parse(files.html.match(/^<script type="application\/json" id="flowspec">\n([\s\S]*?)\n<\/script>/m)[1]);
      expect(JSON.stringify(snapshot)).not.toMatch(/"topology(?:Imports|Exports|Provenance)"/);
      expect(files.html).not.toContain('id="flowview-topology"');
      expect(diagram(snapshot).nodes[prefix+'api'].title).toBe(local?'API':'API </ScRiPt><script>window.topologyInjection=true</script><!--');
      expect(providerRequests).toEqual([]);
      const exported=path.join(root,'offline.html');await writeFile(exported,files.html);
      await rm(path.join(root,'diagrams'),{recursive:true,force:true});
      await context.setOffline(true);const reader=await context.newPage();
      await reader.goto(pathToFileURL(exported).href+'#tour=0');
      await expect(reader.locator('.errbox')).toHaveCount(0);
      for(const id of ['api','store'])await expect(reader.locator('g.node[data-dv-node="'+prefix+id+'"]')).toBeVisible();
      expect(await reader.evaluate(()=>window.topologyInjection)).toBeUndefined();
      await info.attach(mode,{body:await reader.screenshot(),contentType:'image/png'});
    }finally{await rm(root,{recursive:true,force:true});}
  });
}
