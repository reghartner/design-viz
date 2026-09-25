// Reproducible, fictional screenshots. No Figma account or external assets.
import {chromium} from '../../tools/browser-tests/node_modules/@playwright/test/index.mjs';
import {writeFile} from 'node:fs/promises';
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport:{width:1700,height:900},deviceScaleFactor:1});
  await page.goto(new URL('./fixtures/source-screens.html',import.meta.url).href);
  const screens=[];
  for (const [id,label] of [['home','Home'],['connecting','Connecting'],['live','Live view'],['error','Connection failed']]) {
    const buffer=await page.locator('#'+id).screenshot();
    screens.push({id,label,alt:'Illustrative Hearth app — '+label,caption:'Illustrative sample. Replace with your exported Figma screen.',width:390,height:844,src:'data:image/png;base64,'+buffer.toString('base64')});
  }
  const spec={page:{title:'Product screens meet the system story',subtitle:'Manual Figma export → reusable app screens → step-by-step playback',skin:'daylight',sections:[{id:'live-view',heading:'From Home to live video',text:'The illustrative app screens change alongside session setup. Choose Device offline to see the failure screen, then return to Connected to replay the same starting state.',diagram:{view:'step',autoplay:false,nodes:{app:{title:'Mobile app',icon:'phone'},service:{title:'Session service',icon:'cloud'},camera:{title:'Front door camera',icon:'camera'}},rows:[['app','service','camera']],edges:[{from:'app',to:'service',label:'Start live view'},{from:'service',to:'camera',label:'Wake camera'},{from:'camera',to:'app',label:'Video stream',ret:true}],panels:[{id:'product',type:'appscreens',title:'Product experience',screens,frame:'phone',transition:'crossfade',initial:{screen:'home',clock:'9:41',date:'Thu, Sep 24'}}],steps:[{id:'home',text:'The resident opens Home.',nodes:['app']},{id:'connect',text:'Tap Live view: request a secure session.',edge:'app->service',panels:{product:{screen:'connecting'}}},{id:'wake',text:'Wake the camera. Keep the Connecting screen visible.',edge:'service->camera'},{id:'live',text:'Video arrives. Show the live view.',edge:'camera->app',panels:{product:{screen:'live'}}},{id:'error',text:'The camera does not respond. Offer a retry.',edge:'service->camera',failures:{'service->camera':'dropped'},panels:{product:{screen:'error'}}}],paths:[{id:'connected',label:'Connected',steps:['home','connect','wake','live']},{id:'offline',label:'Device offline',steps:['home','connect','error']}],sectionLayout:{default:[{x:0,y:0,w:8,h:10},{panel:'product',x:8,y:0,w:4,h:16},{controls:'steps',attachTo:'diagram',x:0,y:10,w:8,h:6}]}}}]}};
  await writeFile(new URL('./app-screens.spec.json',import.meta.url),JSON.stringify(spec,null,2)+'\n');
  const datePanels=[
    {id:'screens',type:'appscreens',title:'App screens',frame:'phone',screens:[screens[0]],initial:{screen:'home',clock:'9:41',date:'Thu, Sep 24'}},
    {id:'phone',type:'phone',title:'Phone',initial:{clock:'9:41',date:'Thu, Sep 24',notify:{app:'Hearth',title:'Front door',text:'Someone is at the door.'}}},
    {id:'device',type:'deviceapp',title:'Device app',appName:'Hearth',device:'Front door camera',fields:[{id:'battery',label:'Battery',kind:'battery'}],initial:{clock:'9:41',date:'Thu, Sep 24',phoneScreen:'home',battery:{value:68,status:'ready'}}}
  ];
  const dates={page:{title:'Optional phone dates',subtitle:'One authored date field across App screens, Phone and Device app',skin:'daylight',sections:[{heading:'Follow the date through the story',text:'Dates are optional text. Advance to change the day, hide every date, then restore it. Device app opens its app on the second step.',diagram:{view:'step',autoplay:false,nodes:{app:{title:'Resident phone',icon:'phone'}},rows:[['app']],panels:datePanels,steps:[
    {id:'today',text:'Start on Thursday, September 24.',nodes:['app']},
    {id:'tomorrow',text:'A day later: change the date and open Device app.',nodes:['app'],panels:{screens:{date:'Fri, Sep 25'},phone:{date:'Fri, Sep 25'},device:{date:'Fri, Sep 25',phoneScreen:'app'}}},
    {id:'hidden',text:'An empty date hides it until another step changes it.',nodes:['app'],panels:{screens:{date:''},phone:{date:''},device:{date:''}}},
    {id:'restored',text:'Restore the date and return Device app to Home.',nodes:['app'],panels:{screens:{date:'Sat, Sep 26'},phone:{date:'Sat, Sep 26'},device:{date:'Sat, Sep 26',phoneScreen:'home'}}}
  ],sectionLayout:{default:[{panel:'screens',x:0,y:0,w:4,h:16},{panel:'phone',x:4,y:0,w:4,h:16},{panel:'device',x:8,y:0,w:4,h:16},{x:0,y:16,w:4,h:5},{controls:'steps',attachTo:'diagram',x:4,y:16,w:8,h:5}]}}}]}};
  await writeFile(new URL('./phone-dates.spec.json',import.meta.url),JSON.stringify(dates,null,2)+'\n');
  console.log('Built illustrative app screens example ('+screens.length+' embedded screenshots).');
} finally {await browser.close();}
