import {readFile,writeFile,cp,mkdir,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
// Exercise the real external-config CLI. Restore the default test build afterward.
export async function prepareLanding(repo,output){
  const inputs=path.join(output,'company');await mkdir(inputs);
  const sample=JSON.parse((await readFile(path.join(repo,'src/starters/onboarding.json'),'utf8'))
    .replaceAll('event-detail','company-processing').replaceAll('visitor','company-overview').replaceAll('cloud','company-service'));
  sample.page.presentation='explore';sample.page.title='Company architecture';sample.page.skin='blueprint';
  sample.page.sections.unshift({heading:'Introduction',prose:'Company introduction before the featured diagram.'});
  sample.page.sections[1].diagram.defaultLayout='explore';
  sample.page.sections[1].diagram.nodes['company-service'].title='Company ingestion';
  await writeFile(path.join(inputs,'story.json'),JSON.stringify(sample));
  await writeFile(path.join(inputs,'site.json'),JSON.stringify({version:1,landing:{spec:'story.json',title:'Company <architecture>',label:'Internal </script> example',footer:'Company story & details'}}));
  const target=path.join(repo,'workbench/flowspec.html'),original=await readFile(target);
  try{
    execFileSync('python3',[path.join(repo,'tools/build.py'),'--config',path.join(inputs,'site.json')],{cwd:inputs,stdio:'inherit'});
    await cp(target,path.join(output,'company.html'));
  }finally{await writeFile(target,original);await rm(inputs,{recursive:true,force:true});}
}
