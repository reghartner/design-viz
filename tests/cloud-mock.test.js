const test=require('node:test');
const assert=require('node:assert/strict');
const net=require('node:net');
const {once}=require('node:events');

async function bounded(promise){
 let timer;
 try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Mock shutdown did not complete with an open preconnection')),1000);})]);}
 finally{clearTimeout(timer);}
}

test('mock shutdown closes raw preconnections without waiting for the client and is repeatable',async()=>{
 const {startMock}=await import('../deploy/aws/mock.mjs'),mock=await startMock();
 const socket=net.createConnection(new URL(mock.origin).port,'127.0.0.1');
 const disconnected=once(socket,'close');
 try{
  await once(socket,'connect');
  // No HTTP request: browser preconnections must not hold server.close open.
  await bounded(Promise.all([mock.close(),mock.close(),disconnected]));
  assert.equal(socket.destroyed,true);
  await bounded(mock.close());
 }finally{socket.destroy();await mock.close();}
});

test('closing one mock preserves another mock and its authenticated HTTP behavior',async()=>{
 const {startMock}=await import('../deploy/aws/mock.mjs'),first=await startMock(),second=await startMock();
 try{
  const headers={authorization:'Bearer mock:alice'};
  let response=await fetch(second.origin+'/api/projects',{headers});
  assert.equal(response.status,200);await response.json();
  await first.close();
  response=await fetch(second.origin+'/api/projects',{headers});
  assert.equal(response.status,200);await response.json();
  response=await fetch(second.origin+'/api/projects');
  assert.equal(response.status,401);await response.json();
  await assert.rejects(fetch(first.origin+'/api/projects',{headers}));
 }finally{await Promise.all([first.close(),second.close()]);}
});
