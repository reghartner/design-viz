/* Offline raster assets shared by image panels, app screens and company logos. */
var EMBEDDED_IMAGE_MAX_BYTES = 512 * 1024;
/* Raster data only: images travel with the spec and never fetch remote assets. */
function embeddedImageSource(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(EMBEDDED_IMAGE_MAX_BYTES / 3) * 4 + 32)
    return null;
  var match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) return null;
  var bytes =
    (match[2].length * 3) / 4 - (match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0);
  return bytes <= EMBEDDED_IMAGE_MAX_BYTES ? value : null;
}

/* Upload-facing checks also verify the decoded file signature. Browsers may
   sniff a mislabeled blob, but authored nodes must not preserve a binary
   impostor under an image MIME type. Existing panel compatibility continues
   to use embeddedImageSource(), while new ingestion can require this stricter
   helper. */
function embeddedImageKind(value) {
  var source = embeddedImageSource(value), match = source && /^data:image\/(png|jpeg|webp);base64,(.*)$/.exec(source);
  if (!match) return null;
  var alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/', bits = 0, bitCount = 0, bytes = [];
  for (var i = 0; i < match[2].length; i++) {
    var n = alphabet.indexOf(match[2][i]);
    if (n < 0) break;
    bits = bits * 64 + n; bitCount += 6;
    if (bitCount >= 8) {
      bitCount -= 8;
      bytes.push(Math.floor(bits / Math.pow(2, bitCount)) & 255);
      bits = bits % Math.pow(2, bitCount);
    }
  }
  function be32(at){return bytes[at]*0x1000000+bytes[at+1]*0x10000+bytes[at+2]*0x100+bytes[at+3];}
  function le32(at){return bytes[at]+bytes[at+1]*0x100+bytes[at+2]*0x10000+bytes[at+3]*0x1000000;}
  function pngComplete(){
    if(bytes.length<45 || [137,80,78,71,13,10,26,10].some(function(v,j){return bytes[j]!==v;}))return false;
    var at=8,first=true,imageData=false;
    while(at+12<=bytes.length){
      var size=be32(at),type=String.fromCharCode(bytes[at+4],bytes[at+5],bytes[at+6],bytes[at+7]),end=at+12+size;
      if(size>EMBEDDED_IMAGE_MAX_BYTES || end>bytes.length || first && (type!=='IHDR' || size!==13))return false;
      first=false;
      if(type==='IDAT' && size)imageData=true;
      if(type==='IEND')return imageData && size===0 && end===bytes.length;
      at=end;
    }
    return false;
  }
  function jpegComplete(){
    if(bytes.length<8 || bytes[0]!==255 || bytes[1]!==216)return false;
    var at=2,frame=false,scan=false,entropy=false;
    while(at<bytes.length){
      if(bytes[at]!==255)return false;
      while(at<bytes.length && bytes[at]===255)at++;
      if(at>=bytes.length)return false;
      var marker=bytes[at++];
      if(marker===217)return frame && scan && entropy && at===bytes.length;
      if(marker===1)continue;
      if(marker===0 || marker===216 || marker>=208 && marker<=215)return false;
      if(at+2>bytes.length)return false;
      var size=bytes[at]*256+bytes[at+1];if(size<2 || at+size>bytes.length)return false;
      if((marker>=192 && marker<=195) || (marker>=197 && marker<=199) || (marker>=201 && marker<=203) || (marker>=205 && marker<=207))frame=true;
      at+=size;
      if(marker!==218)continue;
      scan=true;
      while(at<bytes.length){
        if(bytes[at++]!==255){entropy=true;continue;}
        while(at<bytes.length && bytes[at]===255)at++;
        if(at>=bytes.length)return false;
        var entropyMarker=bytes[at];
        if(entropyMarker===0){entropy=true;at++;continue;}
        if(entropyMarker===1 || entropyMarker>=208 && entropyMarker<=215){at++;continue;}
        at=at-1;break;
      }
    }
    return false;
  }
  function webpComplete(){
    if(bytes.length<20 || bytes[0]!==82 || bytes[1]!==73 || bytes[2]!==70 || bytes[3]!==70 ||
      bytes[8]!==87 || bytes[9]!==69 || bytes[10]!==66 || bytes[11]!==80 || le32(4)+8!==bytes.length)return false;
    function lossy(data,size){
      if(size<12)return false;
      var tag=bytes[data]+bytes[data+1]*0x100+bytes[data+2]*0x10000;
      var width=bytes[data+6]+bytes[data+7]*0x100,height=bytes[data+8]+bytes[data+9]*0x100;
      return !(tag&1) && ((tag>>>1)&7)<=3 && !!(tag&16) && (tag>>>5)>=2 && (tag>>>5)<=size-10 &&
        bytes[data+3]===157 && bytes[data+4]===1 && bytes[data+5]===42 &&
        (width&16383)>0 && (height&16383)>0;
    }
    function lossless(data,size){
      if(size<7 || bytes[data]!==47)return false;
      var packed=le32(data+1)>>>0,width=(packed&16383)+1,height=((packed>>>14)&16383)+1;
      return (packed>>>29)===0 && width>0 && width<=16384 && height>0 && height<=16384;
    }
    function extended(data,size){
      if(size!==10 || bytes[data]&195 || bytes[data+1] || bytes[data+2] || bytes[data+3])return false;
      var width=bytes[data+4]+bytes[data+5]*0x100+bytes[data+6]*0x10000+1;
      var height=bytes[data+7]+bytes[data+8]*0x100+bytes[data+9]*0x10000+1;
      return width>0 && width<=16777216 && height>0 && height<=16777216 && width*height<=0xffffffff;
    }
    function alpha(data,size,pixels){
      if(size<2)return false;
      var header=bytes[data],preprocessing=(header>>>4)&3,filter=(header>>>2)&3,compression=header&3;
      if(header&192 || preprocessing>1 || filter>3 || compression>1)return false;
      return compression===0 ? size===pixels+1 : size>=3;
    }
    var at=12,imagePayload=false,imageType=null,hasExtended=false,alphaFlag=false,hasAlpha=false,canvasPixels=0;
    while(at+8<=bytes.length){
      var chunkAt=at,type=String.fromCharCode(bytes[at],bytes[at+1],bytes[at+2],bytes[at+3]),size=le32(at+4),end=at+8+size,data=at+8;
      if(size>EMBEDDED_IMAGE_MAX_BYTES || end>bytes.length || size%2 && (end>=bytes.length || bytes[end]!==0))return false;
      if(type==='ANIM' || type==='ANMF')return false;
      if(type==='VP8X'){
        if(hasExtended || imagePayload || chunkAt!==12 || !extended(data,size))return false;
        hasExtended=true;alphaFlag=!!(bytes[data]&16);
        canvasPixels=(bytes[data+4]+bytes[data+5]*0x100+bytes[data+6]*0x10000+1)*
          (bytes[data+7]+bytes[data+8]*0x100+bytes[data+9]*0x10000+1);
      }else if(type==='ALPH'){
        if(!hasExtended || !alphaFlag || hasAlpha || imagePayload || !alpha(data,size,canvasPixels))return false;
        hasAlpha=true;
      }else if(type==='VP8 ' || type==='VP8L'){
        if(imagePayload || type==='VP8L' && hasAlpha || (type==='VP8 '? !lossy(data,size):!lossless(data,size)))return false;
        imagePayload=true;imageType=type;
      }
      at=end+(size%2);
    }
    return imagePayload && at===bytes.length && (!hasAlpha || imageType==='VP8 ') && (imageType!=='VP8 ' || !alphaFlag || hasAlpha);
  }
  var kind=pngComplete()?'png':jpegComplete()?'jpeg':webpComplete()?'webp':null;
  return kind === match[1] ? kind : null;
}
