import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

// Read with Python's independent ZIP parser, which checks CRCs on extraction.
export async function projectFiles(download){
  return JSON.parse(execFileSync('python3',['-c',
    'import zipfile,json,sys; z=zipfile.ZipFile(sys.argv[1]); print(json.dumps({n:z.read(n).decode("utf-8") for n in z.namelist()}))',
    await download.path()],{encoding:'utf8',maxBuffer:24*1024*1024}));
}
export async function projectSource(download){
  const files=await projectFiles(download),name=Object.keys(files).find(name=>name.endsWith('.spec.json'));
  if(!name)throw Error('Missing editable source in project export');
  return files[name];
}
export async function useProjectDownloads({page}){
  await page.addInitScript(()=>{window.showDirectoryPicker=undefined;});
  const template=await readFile(new URL('../../../template/flowview.html',import.meta.url),'utf8');
  await page.route('**/template/flowview.html',route=>route.fulfill({contentType:'text/html',body:template}));
}
