/* These bytes are embedded in the workbench, never fetched at runtime. */
function clamp(value,min,max){return Math.max(min,Math.min(max,value));}
self.onmessage=async function(event){
  try{self.postMessage({result:autoArrangeCandidates(event.data)});}
  catch(error){self.postMessage({error:error.message || 'Auto arrange failed.'});}
};
