/* Uses Atlassian's manifest validator locally. This is not authenticated forge
   lint or a deployment check; the company integration agent runs those. */
import { validate } from '@forge/manifest';
import {verifyResource} from './resource-contract.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const app=path.dirname(fileURLToPath(import.meta.url));
const result=await validate(false,path.join(app,'manifest.yml'));
if (!result.success){ console.error(JSON.stringify(result.errors,null,2)); process.exit(1); }
const manifest=result.manifestObject.typedContent;
for(const resource of manifest.resources || [])await verifyResource(path.resolve(app,resource.path));
console.log('Atlassian manifest schema and production resources passed (offline).');
if(manifest.app.id.endsWith('/00000000-0000-0000-0000-000000000000'))
  console.log('App ID is intentionally unregistered. The company agent must register and verify it in Confluence.');
