import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {chromium} from '@playwright/test';
export default async function prepareFriends(){
  const browser=await chromium.launch();
  try{console.log('Required Chromium: '+browser.version());}finally{await browser.close();}
  const root=fileURLToPath(new URL('../../..',import.meta.url));
  execFileSync('sh',['company/friends-deploy.sh','prepare'],{cwd:root,stdio:'inherit',env:{...process.env,FLOWVIEW_CF_WORKER:'friends-islanders-preview'}});
  process.env.FLOWVIEW_BROWSER_ROOT=path.join(root,'deploy/cloudflare/site');
  process.env.FLOWVIEW_FRIENDS_PREPARED='1';
}
