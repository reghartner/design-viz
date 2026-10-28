// Offline package smoke test: fixed fake signing credentials, no AWS requests.
import {createRequire} from 'node:module';
import {readdir} from 'node:fs/promises';
import path from 'node:path';
const directory=path.resolve(process.argv[2] || '.');
const allowed=new Set(['handler.mjs','service.mjs','aws-adapters.mjs','package.json','package-lock.json','node_modules']);
for(const file of await readdir(directory))if(!allowed.has(file))throw Error('Unexpected Lambda package content: '+file);
const require=createRequire(path.join(directory,'package.json'));
const {S3Client,PutObjectCommand}=require('@aws-sdk/client-s3'),{getSignedUrl}=require('@aws-sdk/s3-request-presigner');
const client=new S3Client({region:'us-east-1',credentials:{accessKeyId:'LOCAL_TEST_ONLY',secretAccessKey:'LOCAL_TEST_ONLY'},requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'});
const url=new URL(await getSignedUrl(client,new PutObjectCommand({Bucket:'local-signing-test',Key:'staging/t/u/o',ContentType:'application/json'}),{expiresIn:300}));
if(url.searchParams.has('x-amz-checksum-crc32') || url.searchParams.get('X-Amz-Expires')!=='300')throw Error('Unexpected signed PUT checksum or lifetime.');
console.log('AWS Lambda package smoke passed: production allowlist and offline signed PUT; no AWS calls.');
