import {chromium} from '@playwright/test';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export default async function(){
  const browser=await chromium.launch();await browser.close();
  execFileSync('python3',[fileURLToPath(new URL('../../../tools/build.py',import.meta.url)),'--no-config','--no-library','--no-catalog'],{stdio:'inherit'});
}
