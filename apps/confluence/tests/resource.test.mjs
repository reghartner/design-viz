import test from 'node:test';
import assert from 'node:assert/strict';
import {cp,mkdtemp,readFile,realpath,rm,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyResource} from '../resource-contract.mjs';
import sourceLoader from '../../../tools/source-loader.cjs';

test('copied production resources retain every local font/style/script and verify with upstream reads denied',async t=>{
  const temp=await realpath(await mkdtemp(path.join(tmpdir(),'flowview-forge-resource-')));t.after(()=>rm(temp,{recursive:true,force:true}));
  const output=path.join(temp,'viewer'),checker=path.join(temp,'resource-contract.mjs');
  await cp(fileURLToPath(new URL('../static/viewer/',import.meta.url)),output,{recursive:true});
  await cp(fileURLToPath(new URL('../resource-contract.mjs',import.meta.url)),checker);
  const result=execFileSync(process.execPath,['--permission','--allow-fs-read='+temp,checker,output],{cwd:temp,encoding:'utf8'});
  assert.match(result,/Verified copied Custom UI resource/);
  const files=await verifyResource(output),fonts=sourceLoader.entrypointAssets('forge');
  assert.equal(files.filter(file=>file.endsWith('.woff2')).length,9);assert.equal(files.filter(file=>file.endsWith('.woff')).length,9);
  for(const license of fonts.licenses)assert.equal(await readFile(path.join(output,path.basename(license.file)),'utf8'),license.text);
  const font=files.find(file=>file.endsWith('.woff2'));await rm(path.join(output,font));
  await assert.rejects(verifyResource(output),/ENOENT/);
});
test('artifact verification rejects remote and escaping asset references',async t=>{
  const temp=await mkdtemp(path.join(tmpdir(),'flowview-forge-reference-'));t.after(()=>rm(temp,{recursive:true,force:true}));
  for(const reference of ['https://example.com/app.js','./../app.js']){
    await writeFile(path.join(temp,'index.html'),'<script src="'+reference+'"></script>');
    await assert.rejects(verifyResource(temp),/local relative|escapes/);
  }
});
