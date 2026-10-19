'use strict';
// Fast regression for the replacement-company path exercised by the full overlay suite.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {copyCheckout}=require('./helpers/checkout-copy.js');

test('generic theme, package and kit tests survive a replacement non-theme sports company',()=>{
  const checkout=fs.mkdtempSync(path.join(os.tmpdir(),'flowview-theme-portability-'));
  try {
    copyCheckout(checkout);
    fs.cpSync(path.join(__dirname,'fixtures/company-overlay'),path.join(checkout,'company'),{recursive:true});
    fs.writeFileSync(path.join(checkout,'company/company.json'),JSON.stringify({version:1,companyName:'Other Sports',packages:['sports']}));
    assert.equal(fs.existsSync(path.join(checkout,'company/themes/islanders')),false);
    assert.equal(fs.existsSync(path.join(checkout,'company/tests/friends-theme.test.js')),false);
    const env={...process.env,FLOWVIEW_COMPANY_IDENTITY:'',FLOWVIEW_SITE_CONFIG:'',FLOWVIEW_PACKAGE_BASE:'',FLOWVIEW_PACKAGES:''};
    delete env.NODE_TEST_CONTEXT;
    for(const [command,args] of [
      [process.execPath,['--test','tests/company-theme.test.js','tests/optional-package-deps.test.js','tests/company-overlay.test.js']],
      ['python3',['-m','unittest','tests.test_optional_package_context','tests.test_company_overlay']],
    ]) {
      const result=spawnSync(command,args,{cwd:checkout,env,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024});
      assert.equal(result.status,0,`${args.join(' ')}\n${result.error || ''}\n${result.stdout}\n${result.stderr}`);
    }
  } finally {
    fs.rmSync(checkout,{recursive:true,force:true});
  }
});
