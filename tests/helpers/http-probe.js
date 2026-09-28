'use strict';
const http=require('node:http');
// Fresh sockets and a referenced deadline keep a pending probe alive on Node 20.
// Always consume the response so a headers-only success cannot hide a body error.
function probeHttp(url,timeoutMs){
  return new Promise((resolve,reject)=>{
    let settled=false,timer;
    const finish=(error,value)=>{
      if(settled)return;settled=true;clearTimeout(timer);
      if(error)reject(error);else resolve(value);
    };
    const request=http.get(url,{agent:false},response=>{
      const chunks=[];
      response.on('data',chunk=>chunks.push(chunk));
      response.on('error',error=>finish(error));
      response.on('aborted',()=>finish(Error('HTTP response was aborted: '+url)));
      response.on('end',()=>finish(null,{status:response.statusCode,headers:response.headers,body:Buffer.concat(chunks).toString('utf8')}));
    });
    request.on('error',error=>finish(error));
    timer=setTimeout(()=>{
      const error=Error('HTTP probe timed out after '+timeoutMs+'ms: '+url);
      request.destroy(error);finish(error);
    },timeoutMs);
  });
}
module.exports={probeHttp};
