/* Transform only selectors in trusted authored CSS. Keep declaration values,
   strings, comments, class/ID names and attribute selectors byte-for-byte. */
function scopeSelector(selector){
  let out='',at=0,brackets=0;
  while(at<selector.length){
    const ch=selector[at];
    if(selector.startsWith('/*',at)){
      const end=selector.indexOf('*/',at+2);const stop=end<0?selector.length:end+2;
      out+=selector.slice(at,stop);at=stop;continue;
    }
    if(ch==='"'||ch==="'"){
      const start=at++;while(at<selector.length){if(selector[at++]==='\\')at++;else if(selector[at-1]===ch)break;}
      out+=selector.slice(start,at);continue;
    }
    if(ch==='[')brackets++;if(ch===']')brackets--;
    if(/[a-zA-Z_-]/.test(ch)){
      const start=at++;while(at<selector.length && /[\w-]/.test(selector[at]))at++;
      const token=selector.slice(start,at),previous=selector[start-1];
      if(!brackets && (token==='body'||token==='html') && !['.','#',':','\\'].includes(previous))out+='flowview-root';
      else if(!brackets && token==='root' && previous===':' && selector[start-2]!==':')out=out.slice(0,-1)+'.flowview-root';
      else out+=token;
      continue;
    }
    out+=ch;at++;
  }
  return out;
}
export function scopeNativeCss(css){
  let output='',start=0,at=0;const blocks=['rules'];
  while(at<css.length){
    const ch=css[at];
    if(css.startsWith('/*',at)){const end=css.indexOf('*/',at+2);at=end<0?css.length:end+2;continue;}
    if(ch==='"'||ch==="'"){
      at++;while(at<css.length){if(css[at++]==='\\')at++;else if(css[at-1]===ch)break;}continue;
    }
    if(ch==='{'){
      const head=css.slice(start,at),clean=head.replace(/\/\*[\s\S]*?\*\//g,'').trim();
      const rule=blocks.at(-1)==='rules',atRule=clean.startsWith('@');
      output+=(rule && !atRule?scopeSelector(head):head)+'{';
      blocks.push(/^@(media|supports|container|layer|scope)\b/.test(clean)?'rules':/keyframes\b/.test(clean)?'frames':'declarations');
      start=at+1;
    }else if(ch==='}'){
      output+=css.slice(start,at+1);start=at+1;blocks.pop();
    }else if(ch===';' && blocks.at(-1)==='rules'){
      output+=css.slice(start,at+1);start=at+1;
    }
    at++;
  }
  return output+css.slice(start);
}
