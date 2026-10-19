'use strict';
// Company tests explicitly select their own overlay without changing the runner's environment.
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'../..');
function cli(args,packages='sports') {
  return execFileSync(process.execPath,[path.join(root,'tools/source-loader.cjs'),...args],{encoding:'utf8',maxBuffer:32*1024*1024,
    env:{...process.env,FLOWVIEW_COMPANY_IDENTITY:'',FLOWVIEW_SITE_CONFIG:'',FLOWVIEW_PACKAGE_BASE:packages,FLOWVIEW_PACKAGES:''}});
}
module.exports={cli};
