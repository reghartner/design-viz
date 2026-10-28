import {HttpError} from './service.mjs';
// Commands and clients are injected so tests exercise production expressions
// without credentials, endpoints, SDK network behavior or an AWS account.
export function awsAdapters({db,s3,commands:C,presign,table,bucket}){
  const pk=t=>'TEAM#'+t,projectKey=(t,p)=>({pk:pk(t),sk:'PROJECT#'+p}),opKey=(t,o)=>({pk:pk(t),sk:'OP#'+o});
  async function get(Key){return (await db.send(new C.GetCommand({TableName:table,Key,ConsistentRead:true}))).Item;}
  async function query(t,prefix){let items=[],cursor;do{const r=await db.send(new C.QueryCommand({TableName:table,KeyConditionExpression:'pk = :pk AND begins_with(sk, :sk)',ExpressionAttributeValues:{':pk':pk(t),':sk':prefix},ConsistentRead:true,ExclusiveStartKey:cursor}));items.push(...(r.Items || []));cursor=r.LastEvaluatedKey;}while(cursor);return items;}
  const missing=e=>e.name==='NoSuchKey' || e.name==='NotFound' || e.$metadata?.httpStatusCode===404;
  async function read(Key,max=32*1024*1024){
    try{
      const head=await s3.send(new C.HeadObjectCommand({Bucket:bucket,Key}));
      if(head.ContentLength>max)throw new HttpError(400,'Upload exceeds the envelope limit.');
      // Version pin prevents PUT races between Head and Get on staging.
      if(!head.VersionId)throw Error('The snapshots bucket must have versioning enabled.');
      const result=await s3.send(new C.GetObjectCommand({Bucket:bucket,Key,VersionId:head.VersionId}));
      const raw=await result.Body.transformToString();if(Buffer.byteLength(raw)>max)throw new HttpError(400,'Upload too large.');
      try{return JSON.parse(raw);}catch{throw new HttpError(400,'Malformed upload.');}
    }catch(e){if(missing(e))return null;throw e;}
  }
  return {
    store:{
      member:sub=>get({pk:'IDENTITY#'+sub,sk:'MEMBERSHIP'}),project:(t,p)=>get(projectKey(t,p)),projects:t=>query(t,'PROJECT#'),
      operation:(t,o)=>get(opKey(t,o)),receipt:async(t,o)=>(await get({pk:pk(t),sk:'RECEIPT#'+o}))?.result,
      createOperation:async op=>{try{await db.send(new C.PutCommand({TableName:table,Item:{...opKey(op.teamId,op.operationId),...op},ConditionExpression:'attribute_not_exists(pk)'}));}catch(e){if(e.name!=='ConditionalCheckFailedException')throw e;}},
      revision:(t,p,r)=>get({pk:pk(t),sk:'REV#'+p+'#'+String(r).padStart(12,'0')}),
      revisions:(t,p)=>query(t,'REV#'+p+'#'),
      commit:async(op,record,result)=>{
        await db.send(new C.TransactWriteCommand({TransactItems:[
          {Put:{TableName:table,Item:{...projectKey(op.teamId,op.projectId),...record},ConditionExpression:op.baseRevision===0?'attribute_not_exists(pk)':'revision = :base',...(op.baseRevision?{ExpressionAttributeValues:{':base':op.baseRevision}}:{})}},
          {Put:{TableName:table,Item:{pk:pk(op.teamId),sk:'REV#'+op.projectId+'#'+String(record.revision).padStart(12,'0'),...record},ConditionExpression:'attribute_not_exists(pk)'}},
          {Put:{TableName:table,Item:{pk:pk(op.teamId),sk:'RECEIPT#'+op.operationId,result},ConditionExpression:'attribute_not_exists(pk)'}}
        ]}));
      }
    },
    objects:{
      readUpload:read,readImmutable:read,
      freeze:async(Key,value)=>{try{await s3.send(new C.PutObjectCommand({Bucket:bucket,Key,Body:JSON.stringify(value),ContentType:'application/json',IfNoneMatch:'*'}));}catch(e){if(e.$metadata?.httpStatusCode!==412 && e.name!=='PreconditionFailed')throw e;}},
      uploadURL:Key=>presign(s3,new C.PutObjectCommand({Bucket:bucket,Key,ContentType:'application/json'}),{expiresIn:300}),
      downloadURL:Key=>presign(s3,new C.GetObjectCommand({Bucket:bucket,Key}),{expiresIn:300})
    }
  };
}
