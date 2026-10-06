import {createHash} from 'node:crypto';
// Read decoded pixels; no resampling or mutation of the original screenshot.
export async function pixelRegionHash(page,png,width,height=150){
 const rgba=await page.evaluate(async({base64,width,height})=>{
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0)),bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
  if(bitmap.width<width||bitmap.height<height)throw Error('PNG too small for pixel comparison');
  const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  const data=ctx.getImageData(0,0,width,height).data;let text='';for(let i=0;i<data.length;i+=16384)text+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(text);
 },{base64:png.toString('base64'),width,height});
 return createHash('sha256').update(Buffer.from(rgba,'base64')).digest('hex');
}
