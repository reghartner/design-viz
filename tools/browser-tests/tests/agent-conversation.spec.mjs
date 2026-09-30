import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../..');
const read=name=>readFile(path.join(root,'src',name),'utf8');
// UI contract fixture: production DOM, styles and conversation modules; a fake
// protocol peer isolates layout/recovery intent. Folder protocol tests separately
// exercise real disk, helper, ownership and cancellation races.
async function mount(page,{stored,denied=false}={}){
  await page.route('https://conversation.test/**',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html><body></body></html>'}));
  await page.goto('https://conversation.test/');
  if(stored)await page.evaluate(value=>localStorage.setItem('dv-folder-agent-recovery-v1',JSON.stringify(value)),stored);
  await page.evaluate(skeleton=>{
    const parsed=new DOMParser().parseFromString(skeleton,'text/html');
    for(const id of ['editor-agent','folder-agent-guide','editor-tab-agent','folder-agent-selection','agent-update-banner','agent-update-dialog'])document.body.appendChild(parsed.getElementById(id));
    const panel=document.createElement('section');panel.className='workspace-window';panel.id='test-window';panel.style.cssText='left:20px;top:60px;width:min(420px,calc(100vw - 40px));height:calc(100dvh - 80px)';
    panel.appendChild(document.getElementById('editor-agent'));document.body.appendChild(panel);document.getElementById('editor-agent').hidden=false;
    const kit=document.createElement('script');kit.id='flowview-folder-kit';kit.type='application/json';kit.textContent=JSON.stringify({watcher:'# harmless test fixture',gzip:'',sha256:''});document.body.appendChild(kit);
    window.testSource='{"title":"My story"}';window.testProject=1;window.testSelection=[{id:'customer',label:'Customer',kind:'node'}];window.testViews=[];window.permissionCalls=0;window.pickerCalls=0;window.filePickerCalls=0;window.diskWrites=[];window.starts=[];window.restoreCalls=[];window.inspectCalls=0;
    window.savedIdentity={sessionId:'s1',connectionId:'c0'};window.savedRevision='old-1';window.savedTranscript=[];window.hasSavedSession=false;
    window.testDirectory={name:'flowview-session-test',requestPermission:async()=>{window.permissionCalls++;return window.denyPermission?'denied':'granted';},getDirectoryHandle:async()=>window.testDirectory};
    window.showDirectoryPicker=async()=>{window.pickerCalls++;return window.testDirectory;};
    window.showOpenFilePicker=async()=>{window.filePickerCalls++;throw Error('Resume must choose a folder, not a source file.');};
    window.createFolderAgentFiles=()=>({write:async(name,value)=>window.diskWrites.push({name,value})});
    window.openFolderAgentProject=async()=>({source:window.savedSource ?? null,hasSession:window.hasSavedSession,initialize:async()=>{if(window.inspectFailure)throw Error(window.inspectFailure);return {source:window.savedSource ?? null,ledger:'',files:{...createFolderAgentFiles(),read:async()=>window.hasSavedSession?window.savedIdentity:null,readText:async()=>window.savedSource ?? null}};}});
    window.inspectFolderAgentSession=async()=>{window.inspectCalls++;if(window.inspectFailure)throw Error(window.inspectFailure);return structuredClone({identity:window.savedIdentity,savedSource:window.savedSource || window.testSource,savedRevision:window.savedRevision,sourceMatches:!window.savedSource || window.savedSource===window.testSource,transcript:window.savedTranscript,changes:[],lease:{active:!!window.activeOwner}});};
    window.createFolderAgentClient=options=>{
      window.publish=update=>{if('review' in update)window.testReview=update.review;options.changed(update);};window.pendingId=null;const manifest={sessionId:'s1',connectionId:'c1'};
      return {manifest:()=>manifest,start:async(resume,choice)=>{window.starts.push({resume,choice});if(window.startFailure)throw Error(window.startFailure);options.changed({connected:true,transcript:resume?window.savedTranscript:[],changes:[]});return manifest;},poll:async()=>{},send:async text=>{window.lastSent=text;window.pendingId='r1';window.lastSentRequest=structuredClone({...options.snapshot(),technicalLevel:options.level()});options.changed({pending:'r1',activityPhase:'waiting',transcript:[{role:'user',text,requestId:'r1',context:lastSentRequest}]});},cancel:async()=>{window.pendingId=null;options.changed({pending:null});return true;},disconnect:async()=>options.changed({connected:false,pending:null,listening:false}),destroy(){},setReviewMode:value=>{window.reviewEnabled=value;},reviewSnapshot:()=>window.testReview?{review:window.testReview,source:null,current:window.testSource}:null,acceptReview:async()=>{window.reviewAccepted=true;window.publish({review:null});},rejectReview:async()=>{window.reviewRejected=true;window.publish({review:null});},readLedger:async()=>null};
    };
  },await read('workbench.skel.html'));
  for(const file of ['style.core.css','style.workbench.css','workbench/agent-conversation.css'])await page.addStyleTag({content:await read(file)});
  for(const file of ['workbench/lifetime.js','workbench/targets.js','workbench/agent-message.js','workbench/agent-recovery.js','workbench/agent-review.js','workbench/agent-chat.js'])await page.addScriptTag({content:await read(file)});
  await page.evaluate(denied=>{
    window.denyPermission=denied;
    if(denied){const original=createWorkbenchAgentRecovery;window.createWorkbenchAgentRecovery=options=>{const store=original(options);return {...store,handle:async()=>({handle:window.testDirectory,sessionId:'s1'})};};}
    window.agentUI=initWorkbenchAgentChat({document,snapshot:()=>({open:true,project:window.testProject,source:window.testSource,selection:window.testSelection,views:window.testViews}),busy:()=>false,apply:()=>({ok:true}),show(){},openEmptyFolder:()=>({ok:true,project:window.testProject}),restoreSavedStory:(source,expected)=>{window.restoreCalls.push({source,expected});if(window.restoreFailure)return {ok:false,error:window.restoreFailure};window.preservedSource=window.testSource;window.testSource=source;window.testProject++;return {ok:true,project:window.testProject};},showChanges:receipt=>{window.shownChange=receipt.id;},undoChange:()=>({ok:false,error:'Later manual edits are preserved.'})});
  },denied);
  if(stored)await page.evaluate(()=>window.hasSavedSession=true);

}
async function connect(page){await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-setup-mode-embedded').click();await expect(page.locator('#folder-agent-setup-mode-embedded')).toHaveAttribute('aria-pressed','true');await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();await page.evaluate(()=>publish({listening:true}));}
async function composerVisible(page){
  for(const id of ['folder-agent-input','folder-agent-send','folder-agent-focus-summary']){
    const box=await page.locator('#'+id).boundingBox();const size=page.viewportSize();expect(box).not.toBeNull();expect(box.y).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(size.height);
  }
}
async function stageVisible(page){
  const stage=await page.locator('#folder-agent-stage').boundingBox(),header=await page.locator('.folder-agent-header').boundingBox();
  expect(stage.y).toBeGreaterThanOrEqual(header.y);expect(stage.y+stage.height).toBeLessThanOrEqual(header.y+header.height);
}
test('twenty exchanges keep composer reachable and do not force an older-message reader to the bottom',async({page})=>{
  await page.setViewportSize({width:1280,height:720});await mount(page);await connect(page);
  await page.evaluate(()=>{window.turns=Array.from({length:40},(_,i)=>({role:i%2?'assistant':'user',text:'Message '+i+' · '+('Long story context. '.repeat(i%4*20+1)),requestId:'r'+Math.floor(i/2)}));publish({connected:true,listening:true,transcript:turns});});
  await composerVisible(page);await page.locator('#folder-agent-input').fill('My next question');
  // A queued scroll event must not let incoming output override the reader's
  // actual position. Publish in the same turn, before that event can fire.
  await page.evaluate(()=>{document.getElementById('folder-agent-history').scrollTop=0;publish({transcript:[...turns,{role:'assistant',requestId:'last',text:'Latest question?'}]});});
  await expect(page.locator('#folder-agent-latest')).toBeVisible();expect(await page.locator('#folder-agent-history').evaluate(n=>n.scrollTop)).toBeLessThan(60);
  await page.locator('#folder-agent-latest').click();await expect(page.locator('#folder-agent-latest')).toBeHidden();
  await page.setViewportSize({width:640,height:360});await composerVisible(page);
  await page.locator('#folder-agent-input').focus();await page.keyboard.press('Control+Enter');await expect.poll(()=>page.evaluate(()=>lastSent)).toBe('My next question');
  await expect(page.locator('#folder-agent-cancel')).toBeVisible();await page.locator('#folder-agent-cancel').click();await expect(page.locator('#folder-agent-send')).toBeEnabled();
  await expect(page.locator('#folder-agent-panel-status')).toContainText('interrupt it in its session');
});
test('reload keeps draft/detail and a visible disconnected recovery without accessing the folder',async({page})=>{
  const draft='Keep this long unsent request. '.repeat(1000);
  await mount(page);await connect(page);await page.locator('#folder-agent-detail-summary').click();await page.locator('#folder-agent-level').selectOption('engineering');await page.locator('#folder-agent-input').fill(draft);
  await page.evaluate(()=>publish({transcript:[{role:'assistant',text:'A saved answer',requestId:'r1'}]}));
  await mount(page);await expect(page.locator('#folder-agent-input')).toHaveValue(draft);await expect(page.locator('#folder-agent-level')).toHaveValue('engineering');
  await expect(page.locator('#folder-agent-messages')).toBeHidden();await expect(page.locator('#folder-agent-input')).toBeHidden();await expect(page.locator('#folder-agent-recovery')).toContainText('Interrupted requests will not replay');
  expect(await page.evaluate(()=>({pickerCalls,permissionCalls,starts:starts.length}))).toEqual({pickerCalls:0,permissionCalls:0,starts:0});
});
test('denied remembered permission is explicit and preserves draft with a picker fallback',async({page})=>{
  await mount(page,{denied:true,stored:{sessionId:'s1',folderName:'flowview-session-test',title:'My story',draft:'Preserve me',sourceKey:'unknown'}});
  expect(await page.evaluate(()=>permissionCalls)).toBe(0);await page.locator('#folder-agent-continue').click();
  await expect(page.locator('#folder-agent-status')).toContainText('Folder access was not granted');expect(await page.evaluate(()=>permissionCalls)).toBe(1);expect(await page.evaluate(()=>diskWrites.length)).toBe(0);
  await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();expect(await page.evaluate(()=>pickerCalls)).toBe(1);
});
test('setup separates conversation mode from adopt, resume and new-folder intent',async({page})=>{
  await mount(page);await page.locator('#folder-agent-open-setup').click();
  await expect(page.locator('.folder-agent-guide-steps')).toHaveCount(0);await expect(page.getByText('Connect later',{exact:true})).toHaveCount(0);
  await expect(page.locator('#folder-agent-setup-mode-external')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#folder-agent-start-adopt')).toHaveAttribute('aria-pressed','true');await expect(page.locator('#folder-agent-start-title')).toHaveText('Select Diagram Folder');
  await page.locator('#folder-agent-start-resume').click();await expect(page.locator('#folder-agent-start-title')).toHaveText('Select Existing Diagram Folder');await expect(page.locator('#folder-agent-start-note')).toContainText('.flowview-agent');
  await page.locator('#folder-agent-start-new').click();await expect(page.locator('#folder-agent-connect')).toHaveText('Select Empty Folder');
  await page.locator('#folder-agent-setup-mode-external').click();await expect(page.locator('#folder-agent-workflow-note')).toContainText('does not have to be the agent’s working directory');
});
test('multiple specs are chosen from a generated picker without filename entry',async({page})=>{
  await mount(page);await page.evaluate(()=>{
    window.selectedSpecs=[];
    window.openFolderAgentProject=async(directory,name)=>{
      window.selectedSpecs.push(name || null);
      if(!name)return {selectionRequired:true,specs:['checkout.spec.json','payments.spec.json'],existing:true,hasSession:false};
      return {source:window.testSource,hasSession:false,initialize:async()=>({source:window.testSource,ledger:'',files:{...createFolderAgentFiles(),read:async()=>null,readText:async()=>window.testSource}})};
    };
  });
  await page.locator('#folder-agent-open-setup').click();await expect(page.locator('#folder-agent-filename')).toHaveCount(0);await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-file-choice')).toBeVisible();await page.locator('#folder-agent-file-picker').selectOption('payments.spec.json');await page.locator('#folder-agent-file-confirm').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();expect(await page.evaluate(()=>selectedSpecs)).toEqual([null,'payments.spec.json']);
});
test('prominent Resume opens the saved folder story and conversation while preserving the different local draft',async({page})=>{
  await mount(page);await page.evaluate(()=>{window.hasSavedSession=true;window.savedSource=' {"title":"Saved folder story"}\n';window.savedTranscript=[{role:'assistant',text:'The saved conversation is here.',requestId:'previous'}];});
  const original=await page.evaluate(()=>testSource);
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-setup-mode-embedded').click();
  await page.locator('#folder-agent-start-resume').click();await expect(page.locator('#folder-agent-connect')).toBeVisible();
  expect(await page.locator('#folder-agent-connect').evaluate(n=>n.closest('details')===null)).toBe(true);
  await expect(page.locator('#folder-agent-guide')).toContainText('coverage ledger');
  await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();
  await expect(page.locator('#folder-agent-recovery-choice')).toBeHidden();
  expect(await page.evaluate(()=>({source:testSource,preserved:preservedSource,pickers:pickerCalls,filePickers:filePickerCalls,restores:restoreCalls.length,starts}))).toMatchObject({source:' {"title":"Saved folder story"}\n',preserved:original,pickers:1,filePickers:0,restores:1,starts:[{resume:true,choice:{resumeSource:'saved',expectedSavedSource:' {"title":"Saved folder story"}\n',expectedSavedRevision:'old-1',expectedSessionId:'s1',expectedConnectionId:'c0'}}]});
  expect(await page.locator('#folder-agent-instructions').inputValue()).toContain('connectionId "c1"');
  await page.locator('#folder-agent-close-guide').click();await expect(page.locator('#folder-agent-messages')).toContainText('The saved conversation is here.');
});

test('explicit Resume adopts a fresh project even when the saved source is byte-identical',async({page})=>{
  await mount(page);const original=await page.evaluate(()=>{window.hasSavedSession=true;window.savedSource=window.testSource;return window.testSource;});
  await page.evaluate(()=>{document.getElementById('folder-agent-input').value='This old unsent draft must not follow the folder';});
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-resume').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();
  expect(await page.evaluate(()=>({source:testSource,project:testProject,restores:restoreCalls.length,expected:restoreCalls[0]?.expected,starts:starts.length}))).toMatchObject({source:original,project:2,restores:1,expected:{source:original,project:1},starts:1});
  await expect(page.locator('#folder-agent-input')).toHaveValue('');
});

test('adopting a folder clears stale composer, conversation and previous folder even if startup fails',async({page})=>{
  await mount(page);await page.evaluate(()=>window.testDirectory.name='flowview-session-previous');await connect(page);
  await page.evaluate(()=>publish({transcript:[{role:'assistant',text:'This answer belongs to the previous folder',requestId:'old-r'}],changes:[{id:'old-change',requestId:'old-r',status:'applied',summary:'Previous story change'}]}));
  await page.locator('#folder-agent-input').fill('Unsent question for the previous folder');
  await page.locator('#folder-agent-pairing>summary').click();await page.locator('#folder-agent-disconnect').click();
  await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
  await page.evaluate(()=>{window.testDirectory.name='flowview-session-new';window.savedSource='{"title":"Adopted story"}';window.startFailure='Injected startup failure after adoption';window.diskWrites=[];});
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-status')).toContainText('Injected startup failure after adoption');
  await expect(page.locator('#folder-agent-input')).toHaveValue('');await expect(page.locator('#folder-agent-messages')).toBeEmpty();
  await expect(page.locator('[data-change-id]')).toHaveCount(0);await expect(page.locator('#folder-agent-recovery')).toBeHidden();
  expect(await page.evaluate(()=>({source:testSource,project:testProject,restores:restoreCalls.length,writes:diskWrites,folder:agentUI.recoveryInfo().folderName || null}))).toEqual({source:'{"title":"Adopted story"}',project:2,restores:1,writes:[],folder:null});
  expect(await page.locator('#folder-agent-folder').textContent()).not.toContain('flowview-session-previous');
});

async function expectResumeUntouched(page,source){
  await expect(page.locator('#folder-agent-connect')).toBeEnabled();
  await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
  await expect(page.locator('#folder-agent-copy')).toBeDisabled();
  expect(await page.evaluate(()=>({source:testSource,writes:diskWrites,starts}))).toEqual({source,writes:[],starts:[]});
}
test('cancelled or wrong-folder Resume preserves the draft and performs no session writes',async({page})=>{
  for(const kind of ['cancelled','wrong folder']){
    await mount(page);const original=await page.evaluate(()=>testSource);
    await page.evaluate(kind=>{
      if(kind==='cancelled')window.showDirectoryPicker=async()=>{window.pickerCalls++;throw new DOMException('Cancelled','AbortError');};
      else{window.hasSavedSession=true;window.inspectFailure='Choose an existing Flowview session folder.';}
    },kind);
    await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-resume').click();await page.locator('#folder-agent-connect').click();
    await expect(page.locator('#folder-agent-status')).toContainText(kind==='cancelled'?'Folder selection cancelled.':'Choose an existing Flowview session folder.');
    await expectResumeUntouched(page,original);expect(await page.evaluate(()=>restoreCalls)).toEqual([]);
  }
});
test('Resume refuses an active owner before preserving or replacing the local draft',async({page})=>{
  await mount(page);const original=await page.evaluate(()=>testSource);
  await page.evaluate(()=>{window.hasSavedSession=true;window.savedSource='{"title":"Other saved story"}';window.activeOwner=true;});
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-resume').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-status')).toContainText('still connected to another editor');
  await expectResumeUntouched(page,original);expect(await page.evaluate(()=>restoreCalls)).toEqual([]);
});
test('Resume refuses to replace the draft if preserving it fails',async({page})=>{
  await mount(page);const original=await page.evaluate(()=>testSource);
  await page.evaluate(()=>{window.hasSavedSession=true;window.savedSource='{"title":"Other saved story"}';window.restoreFailure='Your earlier draft could not be saved.';});
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-resume').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-status')).toContainText('earlier draft could not be saved');
  await expectResumeUntouched(page,original);expect(await page.evaluate(()=>restoreCalls.length)).toBe(1);
});
test('a local draft edit while the Resume picker is open is never replaced',async({page})=>{
  await mount(page);await page.evaluate(()=>{
    window.hasSavedSession=true;window.savedSource='{"title":"Other saved story"}';
    window.showDirectoryPicker=async()=>{window.pickerCalls++;window.pickerWaiting=true;return new Promise(resolve=>window.finishPicker=()=>resolve(window.testDirectory));};
  });
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-resume').click();await page.locator('#folder-agent-connect').click();
  await expect.poll(()=>page.evaluate(()=>!!window.pickerWaiting)).toBe(true);
  const edited='{"title":"Typed while the folder picker was open"}';await page.evaluate(text=>{window.testSource=text;window.finishPicker();},edited);
  await expect(page.locator('#folder-agent-status')).toContainText('draft changed');
  await expectResumeUntouched(page,edited);expect(await page.evaluate(()=>({inspections:inspectCalls,restores:restoreCalls}))).toEqual({inspections:0,restores:[]});
});
test('saved identity, revision, source or active-owner changes during Resume inspection cannot replace the draft or session',async({page})=>{
  for(const change of ['identity','revision','source','active owner']){
    await mount(page);const original=await page.evaluate(()=>testSource);
    await page.evaluate(()=>{
      window.hasSavedSession=true;window.savedSource='{"title":"Original saved story"}';
      const inspect=window.inspectFolderAgentSession;let calls=0;
      window.inspectFolderAgentSession=async(...args)=>{
        if(++calls===2){window.inspectionWaiting=true;await new Promise(resolve=>window.finishInspection=resolve);}
        return inspect(...args);
      };
    });
    await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-start-resume').click();await page.locator('#folder-agent-connect').click();
    await expect.poll(()=>page.evaluate(()=>!!window.inspectionWaiting)).toBe(true);
    await page.evaluate(change=>{
      if(change==='identity')window.savedIdentity.connectionId='other-owner';
      if(change==='revision')window.savedRevision='changed-revision';
      if(change==='source')window.savedSource='{"title":"Saved story changed during reads"}';
      if(change==='active owner')window.activeOwner=true;
      window.finishInspection();
    },change);
    await expect(page.locator('#folder-agent-status')).toContainText(change==='active owner'?'still connected to another editor':'saved story changed');
    await expectResumeUntouched(page,original);expect(await page.evaluate(()=>restoreCalls)).toEqual([]);
  }
});
test('receipts remain inert, reviewable and honest when undo is no longer safe',async({page})=>{
  await mount(page);await connect(page);await page.evaluate(()=>publish({transcript:[{role:'user',text:'Add a path',requestId:'r1'}],changes:[{id:'p1',requestId:'r1',status:'applied',summary:'<img src=x onerror=alert(1)> Added fallback',revision:'r2'}]}));
  await expect(page.locator('[data-change-id="p1"]')).toContainText('structure validated');await expect(page.locator('[data-change-id="p1"] img')).toHaveCount(0);
  await page.locator('[data-receipt-action="show"]').click();expect(await page.evaluate(()=>shownChange)).toBe('p1');await page.locator('[data-receipt-action="undo"]').click();await expect(page.locator('#folder-agent-panel-status')).toContainText('Later manual edits are preserved');
  await page.evaluate(()=>agentUI.destroy());await page.locator('[data-receipt-action="show"]').click();
});

test('proposal feedback stays inert and refreshes when proposal version changes',async({page})=>{
  await mount(page);await connect(page);
  await page.evaluate(()=>publish({review:{id:'p1',requestId:'r1',version:1,ok:false,summary:'Needs a revision',baseRevision:'c1-1',revision:'c1-2',conflicts:[{path:'/title',reason:'<script>unsafe()</script>'}]}}));
  await page.locator('#folder-agent-review-accept').click();
  await expect(page.locator('#agent-update-feedback')).toHaveValue(/<script>unsafe/);await expect(page.locator('#agent-update-dialog script')).toHaveCount(0);
  await page.evaluate(()=>publish({review:{id:'p1',requestId:'r1',version:2,ok:false,summary:'Changed while reviewing',conflicts:[{path:'/title',reason:'The latest conflict'}]}}));
  await expect(page.locator('#agent-update-summary')).toHaveText('Changed while reviewing');await expect(page.locator('#agent-update-feedback')).toHaveValue(/latest conflict/);
  await page.locator('#agent-update-return').click();expect(await page.evaluate(()=>window.reviewRejected)).toBe(true);expect(await page.evaluate(()=>window.reviewAccepted)).toBeUndefined();
});

test('context stays concise and expandable; setup and next-message detail preserve the sent context',async({page})=>{
  await page.setViewportSize({width:390,height:844});await mount(page);
  await page.evaluate(()=>{
    window.testSelection=Array.from({length:30},(_,i)=>({id:'n'+i,label:'Customer journey '+i+' '+('full selection label '.repeat(12)),kind:'node',section:0,sectionLabel:'Customer story'}));
    window.testViews=[{section:0,view:'explore',viewLabel:'Full canvas',path:'normal',pathLabel:'Normal route',mode:'step',sourceStep:3}];
  });
  await expect(page.locator('#folder-agent-focus-summary')).toHaveText('Focus: 30 items selected');
  await expect(page.locator('#folder-agent-context')).toBeHidden();await expect(page.locator('#folder-agent-level')).toBeHidden();
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-setup-mode-embedded').click();await expect(page.locator('#folder-agent-setup-level')).toBeVisible();
  await page.locator('#folder-agent-setup-level').selectOption('engineering');await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();await page.evaluate(()=>publish({listening:true}));
  await expect(page.locator('#folder-agent-detail-summary')).toHaveText('Detail: Engineering');
  await page.locator('#folder-agent-focus-summary').click();
  expect(await page.locator('#folder-agent-context').textContent()).toBe(await page.evaluate(()=>folderAgentContextLines({selection:testSelection,views:testViews,technicalLevel:'engineering'}).join('\n')));
  await page.locator('#folder-agent-focus-summary').click();await composerVisible(page);
  await page.locator('#folder-agent-input').fill('Explain this selection');await page.locator('#folder-agent-send').click();
  const sent=await page.evaluate(()=>lastSentRequest);expect(sent.selection).toHaveLength(30);expect(sent.technicalLevel).toBe('engineering');expect(sent.views[0].sourceStep).toBe(3);
  await page.locator('#folder-agent-detail-summary').click();await page.locator('#folder-agent-level').selectOption('story');
  await page.evaluate(()=>{testSelection=[{id:'replacement',label:'Different next target',kind:'node'}];});
  await expect(page.locator('#folder-agent-focus-summary')).toHaveText('Focus: Different next target');
  expect(await page.evaluate(()=>lastSentRequest)).toEqual(sent);
  await page.locator('.folder-agent-sent-context summary').click();await expect(page.locator('.folder-agent-sent-context')).toContainText('Detail: engineering');await expect(page.locator('.folder-agent-sent-context')).toContainText('Customer journey 29');
  await page.evaluate(()=>publish({pending:null}));await page.locator('#folder-agent-input').fill('Now use the new focus');await page.locator('#folder-agent-send').click();
  expect(await page.evaluate(()=>({level:lastSentRequest.technicalLevel,ids:lastSentRequest.selection.map(x=>x.id)}))).toEqual({level:'story',ids:['replacement']});
  await expect(page.locator('#folder-agent-level')).toBeHidden();await composerVisible(page);
});

for(const viewport of [{width:1280,height:720},{width:390,height:844},{width:640,height:360}])test(`streamed output follows until the reader scrolls up at ${viewport.width}×${viewport.height}`,async({page},info)=>{
  await page.setViewportSize(viewport);await mount(page);await connect(page);
  await stageVisible(page);
  await page.evaluate(()=>publish({listening:true,pending:'live',activityPhase:'waiting'}));
  await expect(page.locator('#folder-agent-stage')).toHaveText('Waiting for Claude');
  await page.evaluate(()=>{
    window.updates=Array.from({length:100},(_,i)=>({id:'a'+i,at:Date.now()+i,text:'Update '+i+' · '+('Checking a story detail. '.repeat(5))}));
    publish({activity:updates,activityPhase:'responding',agentResponded:true});
  });
  await expect(page.locator('#folder-agent-stage')).toHaveText('Claude is working');
  expect(await page.locator('#folder-agent-stage svg').getAttribute('aria-hidden')).toBe('true');
  expect(await page.locator('#folder-agent-stage svg').evaluate(n=>getComputedStyle(n).animationName)).toBe('none');
  await expect.poll(()=>page.locator('#folder-agent-history').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight)).toBeLessThan(3);
  // The actual protocol keeps a rolling 100-event window: a changed window
  // is new output even though its length is unchanged.
  await page.evaluate(()=>{updates.shift();updates.push({id:'event-101',at:Date.now(),text:'New detailed update. '.repeat(80)});publish({activity:updates,activityPhase:'responding'});});
  await expect(page.locator('#folder-agent-activity-log li')).toHaveCount(100);
  await expect.poll(()=>page.locator('#folder-agent-history').evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight)).toBeLessThan(3);
  await expect(page.locator('#folder-agent-activity-log')).toHaveCSS('overflow-y','visible');
  const history=page.locator('#folder-agent-history');await history.hover();await page.mouse.wheel(0,-800);
  await expect.poll(()=>history.evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight)).toBeGreaterThan(200);
  const before=await history.evaluate(n=>n.scrollTop);
  await page.evaluate(()=>{updates.shift();updates.push({id:'event-102',at:Date.now(),text:'A new update arrived while you read.'});publish({activity:updates,activityPhase:'responding'});});
  await expect(page.locator('#folder-agent-latest')).toBeVisible();expect(Math.abs(await history.evaluate(n=>n.scrollTop)-before)).toBeLessThan(3);
  await composerVisible(page);await page.screenshot({path:info.outputPath('chat-new-output.png')});
  await page.locator('#folder-agent-latest').click();await expect(page.locator('#folder-agent-latest')).toBeHidden();
  await expect.poll(()=>history.evaluate(n=>n.scrollHeight-n.scrollTop-n.clientHeight)).toBeLessThan(3);
  await page.evaluate(()=>publish({activityPhase:'permission-needed'}));await expect(page.locator('#folder-agent-stage')).toHaveText('Permission needed in Claude');
  await page.evaluate(()=>publish({activityPhase:'quiet',quietSeconds:35}));await expect(page.locator('#folder-agent-stage')).toHaveText('No recent update');
  await page.evaluate(()=>publish({review:{id:'proposal',version:1,summary:'Review the clarified path'}}));await expect(page.locator('#folder-agent-stage')).toHaveText('Ready for your review');
  await page.evaluate(()=>publish({review:null,pending:null,activityPhase:'complete',transcript:[{role:'assistant',text:'Please check the new path.',requestId:'live'}]}));await expect(page.locator('#folder-agent-stage')).toHaveText('Reply received');
  await composerVisible(page);await stageVisible(page);await page.screenshot({path:info.outputPath('chat-reply.png')});
  await page.evaluate(()=>publish({pending:null,activityPhase:'idle',activity:[],transcript:[{role:'user',text:'Cancelled request',requestId:'cancelled',cancelled:true}]}));
  await expect(page.locator('#folder-agent-stage')).toHaveText('Stopped accepting this turn');
  // Expanded controls share a bounded settings area, not the message editor.
  await page.locator('#folder-agent-detail-summary').focus();await page.keyboard.press('Enter');
  await page.locator('#folder-agent-focus-summary').focus();await page.keyboard.press('Enter');
  await composerVisible(page);await stageVisible(page);
  await page.locator('#folder-agent-level').selectOption('engineering');
  await page.locator('#folder-agent-input').fill('The composer is still reachable');
  await composerVisible(page);await stageVisible(page);await page.screenshot({path:info.outputPath('chat-expanded-controls.png')});
});

// Deferred peers model I/O already in flight. The project opener is a fixture
// boundary for the builder's project import; no conversation internals are called.
async function deferredPeers(page,plans){
  await page.evaluate(plans=>{
    const factory=window.createFolderAgentClient;window.peers=[];window.peerGates={};
    for(const name of new Set(plans.flatMap(plan=>Object.values(plan)))){
      let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});window.peerGates[name]={promise,resolve,reject};
    }
    window.showDirectoryPicker=async()=>{window.pickerCalls++;const dir={...window.testDirectory,name:'flowview-session-project-'+window.testProject};dir.getDirectoryHandle=async()=>dir;return dir;};
    window.createFolderAgentClient=options=>{
      const base=factory(options),index=window.peers.length,plan=plans[index] || {},peer={publish:options.changed,startCalls:0,pollCalls:0,disconnectCalls:0,destroyCalls:0};window.peers.push(peer);
      return {...base,
        start:async(...args)=>{peer.startCalls++;if(plan.start)await window.peerGates[plan.start].promise;return base.start(...args);},
        poll:async()=>{peer.pollCalls++;if(plan.poll)await window.peerGates[plan.poll].promise;return base.poll();},
        disconnect:async()=>{peer.disconnectCalls++;if(plan.disconnect)await window.peerGates[plan.disconnect].promise;return base.disconnect();},
        destroy:()=>{peer.destroyCalls++;base.destroy();}};
    };
    const opener=document.createElement('button');opener.id='fixture-open-project';opener.textContent='Open another story';opener.style.cssText='position:absolute;right:10px;top:10px';
    opener.onclick=()=>{window.testProject++;window.testSource='{"title":"Another project"}';};document.body.appendChild(opener);
  },plans);
}
async function expectCleanNewProject(page){
  await expect(page.locator('#folder-agent-connection')).toHaveText('Not connected');
  await expect(page.locator('#folder-agent-messages')).toBeEmpty();await expect(page.locator('[data-change-id]')).toHaveCount(0);
  await expect(page.locator('#folder-agent-input')).toHaveValue('');await expect(page.locator('#folder-agent-review')).toBeHidden();
}
async function publishNewProject(page){
  await page.evaluate(()=>peers[1].publish({connected:true,listening:true,status:'New project is ready.',transcript:[{role:'assistant',text:'New project answer',requestId:'new-r1'}],changes:[{id:'new-p1',requestId:'new-r1',status:'applied',summary:'New project change'}]}));
  await page.locator('#folder-agent-input').fill('New project question');
}
async function expectNewProjectIntact(page){
  await expect(page.locator('#folder-agent-connection')).toHaveText('Claude listener active');await expect(page.locator('#folder-agent-send')).toBeEnabled();
  await expect(page.locator('#folder-agent-input')).toHaveValue('New project question');
  await expect(page.locator('#folder-agent-messages')).toContainText('New project answer');await expect(page.locator('#folder-agent-messages')).not.toContainText('Old project');
  await expect(page.locator('[data-change-id="new-p1"]')).toHaveCount(1);await expect(page.locator('[data-change-id="old-p1"]')).toHaveCount(0);
  expect(await page.evaluate(()=>peers[1].disconnectCalls)).toBe(0);
  expect(await page.evaluate(()=>{
    const record=JSON.parse(localStorage.getItem('dv-folder-agent-recovery-v1'));
    return {sourceMatches:record.sourceKey===folderAgentSourceKey(testSource),draft:record.draft,transcript:record.transcript.map(m=>m.text),receipts:record.changes.map(c=>c.id)};
  })).toEqual({sourceMatches:true,draft:'New project question',transcript:['New project answer'],receipts:['new-p1']});
}
test('project switch clears the old conversation while disconnect is delayed; late callbacks cannot replace the new session',async({page})=>{
  await mount(page);await deferredPeers(page,[{disconnect:'old-close'},{}]);await connect(page);
  await page.evaluate(()=>peers[0].publish({pending:'old-r1',transcript:[{role:'user',text:'Old project private conversation',requestId:'old-r1'}],changes:[{id:'old-p1',requestId:'old-r1',status:'applied',summary:'Old project change'}],review:{id:'old-review',version:1,summary:'Old project proposal'}}));
  await page.locator('#folder-agent-input').fill('Old project unsent question');await page.locator('#fixture-open-project').click();await expectCleanNewProject(page);
  await expect.poll(()=>page.evaluate(()=>peers[0]?.disconnectCalls)).toBe(1);
  await connect(page);await publishNewProject(page);
  await page.evaluate(()=>{peers[0].publish({connected:true,status:'Old project must not return',transcript:[{role:'assistant',text:'Old project late answer'}],changes:[{id:'old-p1',status:'applied'}]});peerGates['old-close'].resolve();});
  await expect.poll(()=>page.evaluate(()=>peers[0].destroyCalls)).toBeGreaterThan(0);await expectNewProjectIntact(page);await expect(page.locator('#folder-agent-panel-status')).toHaveText('New project is ready.');
});
test('an old polling failure after project switch cannot mark the new folder inaccessible',async({page})=>{
  await mount(page);await deferredPeers(page,[{poll:'old-poll'},{}]);await connect(page);await expect.poll(()=>page.evaluate(()=>peers[0].pollCalls)).toBe(1);
  await page.locator('#folder-agent-input').fill('Old project draft');await page.locator('#fixture-open-project').click();await expectCleanNewProject(page);
  await connect(page);await publishNewProject(page);
  await page.evaluate(()=>peerGates['old-poll'].reject(new DOMException('Old project access revoked','NotAllowedError')));
  await expectNewProjectIntact(page);await expect(page.locator('#folder-agent-panel-status')).toHaveText('New project is ready.');
});
for(const outcome of ['resolve','reject'])test(`an old start can ${outcome} while the next project connects without retiring its client or enabling duplicate pairing`,async({page})=>{
  await mount(page);await deferredPeers(page,[{start:'old-start'},{start:'new-start'}]);
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-setup-mode-embedded').click();await page.locator('#folder-agent-connect').click();await expect.poll(()=>page.evaluate(()=>peers[0]?.startCalls)).toBe(1);
  await page.locator('#folder-agent-close-guide').click();await page.locator('#fixture-open-project').click();await expectCleanNewProject(page);
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-setup-mode-embedded').click();await page.locator('#folder-agent-connect').click();await expect.poll(()=>page.evaluate(()=>peers[1]?.startCalls)).toBe(1);
  await page.evaluate(()=>peers[1].publish({status:'Connecting the new project.'}));
  await page.evaluate(outcome=>{if(outcome==='reject')peerGates['old-start'].reject(Error('Old project start failed'));else peerGates['old-start'].resolve();},outcome);
  // Both the retired peer's callbacks and its catch/finally have now run.
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await expect(page.locator('#folder-agent-connect')).toBeDisabled();await expect(page.locator('#folder-agent-connect')).toBeDisabled();await expect(page.locator('#folder-agent-copy')).toBeDisabled();
  await expect(page.locator('#folder-agent-status')).toHaveText('Connecting the new project.');expect(await page.evaluate(()=>peers[1].disconnectCalls)).toBe(0);expect(await page.evaluate(()=>diskWrites.length)).toBe(0);
  await page.evaluate(()=>peerGates['new-start'].resolve());await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();await publishNewProject(page);await expectNewProjectIntact(page);
});

for(const method of ['external','embedded'])test('Agent panel follows the '+method+' connection without tabs',async({page},info)=>{
  await mount(page,{stored:{sessionId:'s1',folderName:'flowview-session-test',title:'My story',draft:'Preserve my draft',sourceKey:'unknown'}});
  await expect(page.locator('#editor-agent [role="tab"]')).toHaveCount(0);
  await expect(page.locator('#folder-agent-recovery')).toContainText('Continue My story');
  await expect(page.locator('#folder-agent-continue')).toBeVisible();
  await expect(page.getByRole('button',{name:'New Connection',exact:true})).toBeVisible();
  for(const id of ['input','send','selection','pairing','folder'])await expect(page.locator('#folder-agent-'+id)).toBeHidden();
  await page.screenshot({path:info.outputPath('agent-disconnected.png')});
  await page.getByRole('button',{name:'New Connection',exact:true}).click();
  await expect(page.locator('#folder-agent-guide')).toBeVisible();
  await page.locator('#folder-agent-setup-mode-'+method).click();
  await page.locator('#folder-agent-start-resume').click();await page.locator('#folder-agent-connect').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();
  await expect(page.locator('#folder-agent-recovery')).toBeHidden();
  await expect(page.locator('#folder-agent-folder')).toBeVisible();
  await expect(page.locator('#folder-agent-folder')).toContainText('flowview-session-test');
  await expect(page.locator('#folder-agent-connection')).toBeVisible();
  await expect(page.locator('#folder-agent-send')).toHaveText(method==='external'?'Copy request':'Send to Claude');
  await page.locator('#folder-agent-input').fill('My next request');
  if(method==='embedded'){
    await expect(page.locator('#folder-agent-send')).toBeDisabled();await page.evaluate(()=>publish({listening:true}));
  }
  await expect(page.locator('#folder-agent-send')).toBeEnabled();
  await expect(page.locator('#folder-agent-selection')).toBeVisible();
  await page.locator('#folder-agent-pairing summary').click();await page.locator('#folder-agent-disconnect').click();
  for(const id of ['input','send','selection','pairing','folder'])await expect(page.locator('#folder-agent-'+id)).toBeHidden();
  await expect(page.locator('#folder-agent-continue')).toBeVisible();
  await expect(page.getByRole('button',{name:'New Connection',exact:true})).toBeVisible();
  await page.locator('#folder-agent-continue').click();
  await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();
  await expect(page.locator('#editor-agent')).toHaveAttribute('data-workflow',method);
  await expect(page.locator('#folder-agent-folder')).toBeVisible();
  await page.screenshot({path:info.outputPath('agent-connected-'+method+'.png')});
});

for(const method of ['external','embedded'])test('held '+method+' disconnect immediately hides actions until cleanup completes',async({page})=>{
  await mount(page);await deferredPeers(page,[{disconnect:'close'}]);
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-setup-mode-'+method).click();
  await page.locator('#folder-agent-connect').click();await expect(page.locator('#folder-agent-copy')).toBeEnabled();await page.locator('#folder-agent-close-guide').click();
  await page.locator('#folder-agent-pairing summary').click();await page.locator('#folder-agent-disconnect').click();
  await expect.poll(()=>page.evaluate(()=>peers[0]?.disconnectCalls)).toBe(1);
  for(const id of ['input','send','selection','pairing','folder'])await expect(page.locator('#folder-agent-'+id)).toBeHidden();
  await expect(page.locator('#folder-agent-open-setup')).toBeDisabled();await expect(page.locator('#folder-agent-continue')).toBeDisabled();
  await page.evaluate(()=>peerGates.close.resolve());
  await expect(page.locator('#folder-agent-open-setup')).toBeEnabled();await expect(page.locator('#folder-agent-continue')).toBeEnabled();
});
test('failed setup immediately hides connected actions while disconnect cleanup is held',async({page})=>{
  await mount(page);await deferredPeers(page,[{disconnect:'close'}]);
  await page.evaluate(()=>{window.createFolderAgentFiles=()=>({write:async()=>{throw Error('Injected setup write failure');}});});
  await page.locator('#folder-agent-open-setup').click();await page.locator('#folder-agent-connect').click();
  await expect.poll(()=>page.evaluate(()=>peers[0]?.disconnectCalls)).toBe(1);
  await expect(page.locator('#editor-agent')).toHaveAttribute('data-connected','false');
  for(const id of ['input','send','selection','pairing','folder'])await expect(page.locator('#folder-agent-'+id)).toBeHidden();
  await expect(page.locator('#folder-agent-copy')).toBeDisabled();await expect(page.locator('#folder-agent-connect')).toBeDisabled();
  await page.evaluate(()=>peerGates.close.resolve());
  await expect(page.locator('#folder-agent-status')).toContainText('Injected setup write failure');
  await expect(page.locator('#folder-agent-connect')).toBeEnabled();
});
