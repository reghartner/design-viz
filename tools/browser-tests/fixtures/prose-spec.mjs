export const code='  {"event": "button_press", "tag": "<img src=x onerror=window.__unsafe=1>"}\n\t**literal** [link](https://example.test) `tick`\n'+ 'long_identifier_'.repeat(24)+'\n';
export const caption='Send `eventId` to the recording service.\n```json\n'+code+'```\nThen **acknowledge** the request.';
export const raw={page:{title:'Code in the story',sections:[{
  id:'code-story',heading:'A button press, explained',text:[caption,'A second paragraph with `status=202`.'],
  bullets:[{text:'Inspect `eventId`.',sub:[caption]}],
  contract:{title:'Envelope',fields:[{k:'eventId',v:'`sample-value`',g:caption}],note:caption},
  diagram:{view:'step',autoplay:false,nodes:{device:{title:'`Doorbell`'},api:{title:'Recordings API'}},rows:[['device','api']],
    edges:[{from:'device',to:'api',label:'`event`'}],steps:[{id:'send',edge:'device->api',text:caption},{id:'ack',nodes:['api'],text:'Accepted as `202`. **Recording queued.**'}]}
}]}};
export const source=JSON.stringify(raw,null,2);
