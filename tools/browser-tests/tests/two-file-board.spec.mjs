/* #826: a live board published as two files (index.html + flowspec.json) boots
   from the file. Contract source: #826 "What changes" + "Test + flip", #825
   Design "Save: the board is published as two files"; Chuck 2026-10-30 ruling:
   the issue's own Test + flip plan. Python rows P1-P7 live in tests/test_inject.py.
   Observation seam: the standalone boot hands its controller to a host hook
   `window.flowviewBooted(ctl)` (same host-hook family as window.flowviewLiveStatus);
   the test stores it and reads `ctl.sourceText()`; it never calls other internals.

| row | fixture | assertion (scoped) | rejects |
|---|---|---|---|
| B1 two-file page renders from flowspec.json when it differs from the inline block | injected --two-file page, flowspec.json overwritten with a different title | `#docview .doc-title` text == the file's title, not the inline block's | boot that reads only the inline block (no fetch) |
| B2 `ctl.sourceText()` is the served flowspec.json byte for byte | file with tabs + 2-space indentation, key order sections/canon/title, trailing newline | `ctl.sourceText()` === the file text read from disk | re-serialized (JSON.stringify) text; text of the inline block |
| B3 single-file page: `ctl.sourceText()` is the inline block's text content byte for byte | injected single-file page whose block has the same distinctive formatting | `ctl.sourceText()` === `#flowspec` textContent, whose trimmed form is the block text in the HTML on disk; no request for flowspec.json; no marker in the HTML | re-serialized text; trimmed text; a boot that fetches without the marker |
| B4 fetched spec fails the workspace-handoff gate | two-file page, inline spec A, file spec B (same canon id), `#fv=` request with A's revision | `#docview .errbox` contains "changed since"; `#docview .doc-title` count 0 | skipping the gate on the fetched path (B renders); falling back to the inline A on gate failure (A renders) |
| B5 fetched spec passes the gate | same page, `#fv=` request with B's revision | `#docview .doc-title` text == B's title | a gate that compares against the inline block |
| B6 missing flowspec.json boots the inline block | two-file page with the file deleted (404 allowed) | `#docview .doc-title` == inline title; `.errbox` count 0; `ctl.sourceText()` === `#flowspec` textContent (trimmed: the block text on disk); one request for flowspec.json was made | fail() on fetch error; no fetch attempt at all |
*/
import {mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {test,expect} from '../helpers/test.mjs';
import {repo} from '../helpers/prepare.mjs';

const MARKER='<meta name="dv-spec-file" content="flowspec.json">';
// The block as written on disk. Python's text-mode write makes the HTML CRLF on
// Windows (m3); the HTML parser normalizes CRLF to LF in text content, so the
// on-disk text is normalized the same way before any comparison with the DOM.
const BLOCK=/^<script type="application\/json" id="flowspec">\r?\n([\s\S]*?)\r?\n<\/script>/m;
const blockOf=html=>{const m=BLOCK.exec(html);expect(m,'inline flowspec block present').not.toBeNull();return m[1].replace(/\r\n/g,'\n');};
const canon={version:1,id:'board',kind:'canonical',owner:'group:default/test'};
const diagram={nodes:{a:{title:'Alpha'},b:{title:'Beta'}},rows:[['a','b']],edges:[{from:'a',to:'b'}]};
const inline={page:{title:'Inline block',canon,sections:[{id:'main',heading:'Main board',diagram}]}};
// Distinctive authored text: tabs and two-space indentation mixed, keys ordered
// sections / canon / title (JSON.stringify of the parsed object orders them the
// same way but drops the whitespace), and a trailing newline.
function formatted(title){
 return '{\n\t"page": {\n\t\t"sections": [{"id": "main", "heading": "Main board", "diagram": '+JSON.stringify(diagram)+'}],\n  "canon": '+JSON.stringify(canon)+',\n\t"title": '+JSON.stringify(title)+'\n\t}\n}\n';
}
const revision=spec=>createHash('sha256').update(JSON.stringify(spec)).digest('hex');
const handoff=rev=>'#fv='+encodeURIComponent(JSON.stringify({version:1,id:'board',revision:rev,action:'view'}));
function expectDistinctive(text){
 expect(text).toContain('\n\t"page"');expect(text).toContain('\n  "canon"');expect(text.endsWith('\n')).toBe(true);
 expect(text).not.toBe(JSON.stringify(JSON.parse(text)));
 expect(text).not.toBe(JSON.stringify(JSON.parse(text),null,2));
}
async function build(server,name,specText,twoFile){
 const dir=path.join(server.root,'two-file-'+name);await rm(dir,{recursive:true,force:true});await mkdir(dir,{recursive:true});
 const spec=path.join(dir,'board.spec.json'),out=path.join(dir,'index.html');await writeFile(spec,specText);
 execFileSync('python3',[path.join(repo,'tools/inject.py'),spec,path.join(repo,'template/flowview.html'),out,...(twoFile?['--two-file']:[])]);
 await rm(spec);
 const html=await readFile(out,'utf8');expect(html.includes(MARKER)).toBe(twoFile);
 return {dir,html,url:server.origin+'/two-file-'+name+'/index.html'};
}
function captureController(page){
 return page.addInitScript(()=>{window.flowviewBooted=ctl=>{window.__board=ctl;};});
}
const sourceText=page=>page.evaluate(()=>window.__board && typeof window.__board.sourceText==='function'?window.__board.sourceText():null);
const blockText=page=>page.evaluate(()=>document.getElementById('flowspec').textContent);
function specRequests(page){
 const urls=[];page.on('request',request=>{if(request.url().endsWith('/flowspec.json'))urls.push(request.url());});return urls;
}

test('two-file page renders from flowspec.json and keeps its exact text as sourceText',async({page,server})=>{
 const {dir,html,url}=await build(server,'served',JSON.stringify(inline),true);
 const file=path.join(dir,'flowspec.json');
 expect(JSON.parse(await readFile(file,'utf8'))).toEqual(inline);
 const text=formatted('Served from the file');expectDistinctive(text);await writeFile(file,text);
 expect(blockOf(html)).toBe(JSON.stringify(inline));expect(text).not.toBe(blockOf(html));
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 // B1: the file wins over the inline block
 await expect(page.locator('#docview .doc-title')).toHaveText('Served from the file');
 await expect(page.locator('#docview .errbox')).toHaveCount(0);
 expect(requests).toHaveLength(1);
 // B2: byte for byte, never re-serialized
 expect(await sourceText(page)).toBe(await readFile(file,'utf8'));
 expect(await sourceText(page)).not.toBe(await blockText(page));
});

test('single-file page keeps the inline block text as sourceText and never fetches',async({page,server})=>{
 const text=formatted('Inline formatted');expectDistinctive(text);
 const {html,url}=await build(server,'single',text,false);
 const block=blockOf(html);expect(block).toBe(text.trim());expect(block).not.toBe(JSON.stringify(JSON.parse(block)));
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 await expect(page.locator('#docview .doc-title')).toHaveText('Inline formatted');
 // B3: the block's text content, exactly (the DOM keeps the newlines around
 // the authored text), and no fetch without the marker
 const content=await blockText(page);expect(content.trim()).toBe(block);expect(content).not.toBe(block);
 expect(await sourceText(page)).toBe(content);
 expect(requests).toEqual([]);
});

test('fetched flowspec.json passes the workspace-handoff gate before boot',async({page,server})=>{
 const {dir,url}=await build(server,'handoff',JSON.stringify(inline),true);
 const served=formatted('Served from the file');await writeFile(path.join(dir,'flowspec.json'),served);
 const inlineRevision=revision(inline),fileRevision=revision(JSON.parse(served));
 expect(inlineRevision).not.toBe(fileRevision);
 await captureController(page);
 // B4: the request pins the inline spec's revision; the fetched file is a different revision
 await page.goto(url+handoff(inlineRevision));
 await expect(page.locator('#docview .errbox')).toContainText('changed since');
 await expect(page.locator('#docview .doc-title')).toHaveCount(0);
 await expect(page.locator('#docview .node')).toHaveCount(0);
 expect(await sourceText(page)).toBeNull();
 // B5: a request matching the file renders it
 await page.goto('about:blank');await page.goto(url+handoff(fileRevision));
 await expect(page.locator('#docview .doc-title')).toHaveText('Served from the file');
 await expect(page.locator('#docview .errbox')).toHaveCount(0);
 expect(await sourceText(page)).toBe(served);
});

test('two-file page without its flowspec.json boots the inline block',async({page,server,audit})=>{
 const {dir,html,url}=await build(server,'missing',JSON.stringify(inline),true);
 await rm(path.join(dir,'flowspec.json'));
 audit.allowStatus(404,requested=>requested.endsWith('/flowspec.json'));
 await captureController(page);const requests=specRequests(page);
 await page.goto(url);
 // B6: the fetch was attempted, failed, and the inline block rendered
 await expect(page.locator('#docview .doc-title')).toHaveText('Inline block');
 await expect(page.locator('#docview .errbox')).toHaveCount(0);
 expect(requests).toHaveLength(1);
 const content=await blockText(page);expect(content.trim()).toBe(blockOf(html));
 expect(await sourceText(page)).toBe(content);
});
