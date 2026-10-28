import {createService,HttpError} from './service.mjs';
import {awsAdapters} from './aws-adapters.mjs';
export function authenticatedSubject(event,{issuer,clientId,scope}){
  const claims=event.requestContext?.authorizer?.jwt?.claims;
  if(!claims || claims.iss!==issuer || claims.token_use!=='access' || claims.client_id!==clientId || typeof claims.sub!=='string' || !(claims.scope || '').split(' ').includes(scope))throw new HttpError(401,'Valid Cognito access token required.');
  return claims.sub;
}
export function createHandler(service,auth){return async event=>{
  try{
    const sub=authenticatedSubject(event,auth),raw=event.body || '{}';
    if(event.isBase64Encoded || Buffer.byteLength(raw)>8192)throw new HttpError(400,'API body too large or encoded. Upload snapshots directly.');
    let body;try{body=JSON.parse(raw);}catch{throw new HttpError(400,'Malformed JSON.');}
    const result=await service.request(sub,event.requestContext.http.method,event.rawPath,body);
    return {statusCode:200,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify(result)};
  }catch(e){return {statusCode:e.status || 500,headers:{'content-type':'application/json','cache-control':'no-store'},body:JSON.stringify({error:e.status?e.message:'Online storage failed. Retry your save.',...(e.details || {})})};}
};}
let handler;
export async function main(event){
  if(!handler){
    const [D,S,L,P]=await Promise.all([import('@aws-sdk/client-dynamodb'),import('@aws-sdk/client-s3'),import('@aws-sdk/lib-dynamodb'),import('@aws-sdk/s3-request-presigner')]);
    const adapters=awsAdapters({db:L.DynamoDBDocumentClient.from(new D.DynamoDBClient({})),s3:new S.S3Client({requestChecksumCalculation:'WHEN_REQUIRED',responseChecksumValidation:'WHEN_REQUIRED'}),commands:{...S,...L},presign:P.getSignedUrl,table:process.env.TABLE,bucket:process.env.BUCKET});
    handler=createHandler(createService(adapters),{issuer:process.env.ISSUER,clientId:process.env.CLIENT_ID,scope:process.env.ACCESS_SCOPE});
  }
  return handler(event);
}
