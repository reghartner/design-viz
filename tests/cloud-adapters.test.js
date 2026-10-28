const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
async function setup(){const {awsAdapters}=await import('../deploy/aws/aws-adapters.mjs');const names=['GetCommand','QueryCommand','PutCommand','TransactWriteCommand','HeadObjectCommand','GetObjectCommand','PutObjectCommand'],commands={};for(const name of names)commands[name]=class{constructor(input){this.input=input;this.name=name;}};const calls=[];let respond=async()=>({});const send=async command=>{calls.push(command);return respond(command);};const adapter=awsAdapters({db:{send},s3:{send},commands,table:'table',bucket:'bucket',presign:async(_client,command,options)=>{calls.push({command,options});return 'signed';}});return {...adapter,calls,set:fn=>respond=fn};}
test('DynamoDB transaction guards head revision and writes immutable revision plus durable receipt atomically',async()=>{
 const f=await setup(),op={teamId:'t',projectId:'p',operationId:'o',baseRevision:9};await f.store.commit(op,{revision:10},{revision:10});const parts=f.calls[0].input.TransactItems;
 assert.equal(parts.length,3);assert.equal(parts[0].Put.ConditionExpression,'revision = :base');assert.equal(parts[0].Put.ExpressionAttributeValues[':base'],9);assert.equal(parts[1].Put.ConditionExpression,'attribute_not_exists(pk)');assert.equal(parts[2].Put.Item.sk,'RECEIPT#o');
 await f.store.commit({...op,baseRevision:0},{revision:1},{revision:1});assert.equal(f.calls[1].input.TransactItems[0].Put.ConditionExpression,'attribute_not_exists(pk)');
});
test('membership and project reads are strongly consistent; queries stay within team partition',async()=>{
 const f=await setup();await f.store.member('sub');await f.store.project('team','p');await f.store.projects('team');assert.deepEqual(f.calls[0].input.Key,{pk:'IDENTITY#sub',sk:'MEMBERSHIP'});assert.equal(f.calls[1].input.ConsistentRead,true);assert.equal(f.calls[2].input.ExpressionAttributeValues[':pk'],'TEAM#team');
});
test('S3 reads pin the exact version and reject oversize before download; freeze uses conditional put',async()=>{
 const f=await setup();f.set(async c=>c.name==='HeadObjectCommand'?{VersionId:'v2',ContentLength:10}:{Body:{transformToString:async()=>'{}'}});assert.deepEqual(await f.objects.readUpload('staging/x',100),{});assert.equal(f.calls[1].input.VersionId,'v2');
 await f.objects.freeze('revisions/x',{source:'draft'});assert.equal(f.calls[2].input.IfNoneMatch,'*');assert.equal(f.calls[2].input.Key,'revisions/x');
 f.set(async()=>({VersionId:'v3',ContentLength:1000}));await assert.rejects(f.objects.readUpload('staging/x',100),{status:400});assert.equal(f.calls.at(-1).name,'HeadObjectCommand');
 f.set(async()=>({ContentLength:10}));await assert.rejects(f.objects.readUpload('x',100),/versioning enabled/);
});
test('presigned operations bounded to five minutes, object URLs never accept a client-provided key',async()=>{
 const f=await setup();await f.objects.uploadURL('staging/t/u/o');await f.objects.downloadURL('revisions/t/p/o');assert.equal(f.calls[0].options.expiresIn,300);assert.equal(f.calls[0].command.name,'PutObjectCommand');assert.equal(f.calls[1].command.name,'GetObjectCommand');
});
test('infrastructure structurally scopes auth, private storage, immutable data and static packaging',()=>{
 const yaml=fs.readFileSync('deploy/aws/template.yaml','utf8'),handler=fs.readFileSync('deploy/aws/handler.mjs','utf8'),stage=fs.readFileSync('deploy/aws/stage.mjs','utf8');
 for(const text of ['AllowAdminCreateUserOnly: true','UserPoolTier: ESSENTIALS','EmailSendingAccount: DEVELOPER','AllowedFirstAuthFactors: [EMAIL_OTP]','GenerateSecret: false','AllowedOAuthFlows: [code]','AuthorizationScopes: [flowview/projects]','VersioningConfiguration: {Status: Enabled}','BillingMode: PAY_PER_REQUEST','OriginAccessControlId:','s3:GetObjectVersion'])assert.ok(yaml.includes(text),text);
 assert.ok(!yaml.includes('Action: s3:Delete'));assert.ok(!yaml.includes('dynamodb:*'));assert.ok(!handler.includes('mock:'));assert.ok(!handler.includes("'./memory.mjs'"));
 assert.ok(stage.includes('--no-library'));assert.ok(stage.includes('--no-catalog'));assert.ok(stage.includes('--no-config'));assert.ok(stage.includes('mock auth is forbidden'));assert.ok(!stage.includes('recursive:true});await cp(repo'));
});
