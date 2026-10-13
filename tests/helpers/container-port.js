'use strict';
/* The port a workbench image listens on inside its container. Upstream's nginx
   image listens on 80; a fork's unprivileged image may listen on 8080. Order:
   FLOWVIEW_IMAGE_PORT, the image's single exposed TCP port, then 80. */
const {execFileSync}=require('node:child_process');
const DEFAULT_PORT=80;

function validPort(value,source){
  const port=Number(value);
  if(!/^\d+$/.test(String(value).trim())||!Number.isInteger(port)||port<1||port>65535)
    throw new Error(source+' must be a TCP port from 1 to 65535, not '+JSON.stringify(value));
  return port;
}

function resolveContainerPort({env=process.env,exposedPorts=null}={}){
  if(env.FLOWVIEW_IMAGE_PORT!=null&&env.FLOWVIEW_IMAGE_PORT!=='')return validPort(env.FLOWVIEW_IMAGE_PORT,'FLOWVIEW_IMAGE_PORT');
  const tcp=Object.keys(exposedPorts||{}).filter(key=>/^\d+\/tcp$/.test(key)).map(key=>validPort(key.split('/')[0],'EXPOSE '+key));
  if(tcp.length===1)return tcp[0];
  if(tcp.length>1)throw new Error('The image exposes several TCP ports ('+tcp.join(', ')+'). Set FLOWVIEW_IMAGE_PORT to the workbench port.');
  return DEFAULT_PORT;
}

function imageContainerPort(image,{env=process.env,docker='docker'}={}){
  if(env.FLOWVIEW_IMAGE_PORT!=null&&env.FLOWVIEW_IMAGE_PORT!=='')return resolveContainerPort({env});
  const raw=execFileSync(docker,['image','inspect','--format','{{json .Config.ExposedPorts}}',image],{encoding:'utf8',timeout:30000}).trim();
  return resolveContainerPort({env,exposedPorts:raw&&raw!=='null'?JSON.parse(raw):null});
}

module.exports={DEFAULT_PORT,resolveContainerPort,imageContainerPort};
