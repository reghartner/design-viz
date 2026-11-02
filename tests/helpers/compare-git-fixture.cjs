'use strict';
/* Temporary git repository and gh stub for the Git Compare tests (issue #849). See the history
   table in tests/compare-git.test.js. */
const fs=require('node:fs/promises'),fss=require('node:fs'),os=require('node:os'),path=require('node:path');
const {execFileSync}=require('node:child_process'),crypto=require('node:crypto');
function git(dir,args,env){return execFileSync('git',args[0]==='--no-optional-locks'?['--no-optional-locks','-C',dir,...args.slice(1)]:['-C',dir,...args],{encoding:'utf8',env:Object.assign({},cleanEnv(),env||{})}).trim();}
function cleanEnv(){const e={...process.env};for(const k of Object.keys(e))if(k.startsWith('GIT_'))delete e[k];return Object.assign(e,{GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:os.devNull});}
const spec=(id,diagram,extra)=>({page:Object.assign({title:id,canon:{version:1,id,kind:'canonical',owner:'group:default/test'},sections:[{id:'main',heading:'Main',diagram}]},extra||{})});
function provider(title){return spec('provider',{nodes:{p1:{title:'P one'},p2:{title}},rows:[['p1','p2']],edges:[{from:'p1',to:'p2'}],topologyExports:{public:{nodes:['p1','p2'],edges:['p1->p2']}}});}
function docA(nodeTitle,stepText){return spec('doc-a',{nodes:{a:{title:nodeTitle},b:{title:'B'}},rows:[['a','b']],edges:[{from:'a',to:'b'}],steps:[{id:'s1',nodes:['a'],text:stepText}],topologyImports:[{spec:'provider',export:'public',as:'child'}]});}

async function fixture(){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'compare-git-')),dir=path.join(root,'clone'),bare=path.join(root,'remote.git'),other=path.join(root,'other');
  await fs.mkdir(dir);git(dir,['init','-q','-b','main']);git(dir,['config','user.name','Fixture']);git(dir,['config','user.email','f@example.test']);
  const write=async(rel,v)=>{await fs.mkdir(path.dirname(path.join(dir,rel)),{recursive:true});await fs.writeFile(path.join(dir,rel),typeof v==='string'?v:JSON.stringify(v,null,2)+'\n');};
  const commit=(subject,who,day)=>{const d='2026-01-0'+day+'T10:00:00Z';git(dir,['add','-A']);git(dir,['commit','-q','-m',subject],{GIT_AUTHOR_NAME:who,GIT_AUTHOR_EMAIL:who.toLowerCase()+'@example.test',GIT_AUTHOR_DATE:d,GIT_COMMITTER_NAME:who,GIT_COMMITTER_EMAIL:who.toLowerCase()+'@example.test',GIT_COMMITTER_DATE:d});return git(dir,['rev-parse','HEAD']);};
  const c={};
  await write('flows/a.spec.json',docA('Alpha','Start'));await write('flows/p.spec.json',provider('P two'));await write('flows/old.spec.json',spec('old',{nodes:{o:{title:'Old'}},rows:[['o']]}));await write('README.md','readme\n');
  c.c1=commit('Add flows','Alice',1);
  await write('flows/a.spec.json',docA('Alpha renamed','Start'));c.c2=commit('Rename alpha','Bob',2);git(dir,['tag','v1']);
  git(dir,['checkout','-q','-b','feature']);await write('flows/a.spec.json',docA('Alpha renamed','Start the flow'));c.c3=commit('Reword step','Carol',3);
  git(dir,['checkout','-q','main']);await write('README.md','readme 2\n');c.c4=commit('Docs only','Alice',4);
  git(dir,['merge','-q','--no-ff','feature','-m','Merge feature'],{GIT_AUTHOR_NAME:'Bob',GIT_AUTHOR_EMAIL:'bob@example.test',GIT_AUTHOR_DATE:'2026-01-05T10:00:00Z',GIT_COMMITTER_NAME:'Bob',GIT_COMMITTER_EMAIL:'bob@example.test',GIT_COMMITTER_DATE:'2026-01-05T10:00:00Z'});c.c5=git(dir,['rev-parse','HEAD']);
  await write('flows/p.spec.json',provider('P two changed'));c.c6=commit('Provider rename','Dana',6);
  await write('flows/a.spec.json',docA('Alpha final','Start the flow'));await write('flows/new.spec.json',spec('new',{nodes:{n:{title:'New'}},rows:[['n']]}));await fs.rm(path.join(dir,'flows/old.spec.json'));
  c.c7=commit('Final pass','Alice',7);
  /* Bare remote; PR #8's head exists only at refs/pull/8/head there. */
  execFileSync('git',['clone','-q','--bare',dir,bare],{env:cleanEnv()});git(dir,['remote','add','origin',bare]);git(dir,['fetch','-q','origin']);
  execFileSync('git',['clone','-q',bare,other],{env:cleanEnv()});git(other,['config','user.name','Fork']);git(other,['config','user.email','fork@example.test']);
  await fs.writeFile(path.join(other,'flows/a.spec.json'),JSON.stringify(docA('Alpha from PR 8','Start the flow'),null,2)+'\n');git(other,['commit','-qam','PR eight']);
  c.pr8=git(other,['rev-parse','HEAD']);git(other,['push','-q','origin','HEAD:refs/pull/8/head']);
  return {root,dir,bare,other,c};
}
function ghStub(c,{fail=false}={}){
  const calls=[];
  const run=async args=>{
    calls.push(args.join(' '));
    if(fail)throw new Error('gh: not logged in');
    if(args[0]==='api' && args[1]==='user')return JSON.stringify({login:'octo'});
    if(args[0]==='auth' && args[1]==='token')return 'gho_SECRET_TOKEN_123\n';
    if(args[0]==='pr' && args[1]==='list'){
      /* The real gh needs --state all to include merged PRs and --json <fields> to print JSON. */
      const flag=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
      const fields=String(flag('--json')||'').split(',');
      if(flag('--state')!=='all')throw new Error('gh pr list without --state all omits merged pull requests');
      if(!['number','title','headRefOid','headRefName','author','updatedAt','mergeCommit'].every(f=>fields.includes(f)))throw new Error('gh pr list without --json number,title,headRefOid,headRefName,author,updatedAt,mergeCommit prints a table');
      return JSON.stringify([
      {number:7,title:'Feature step',headRefName:'feature',headRefOid:c.c3,author:{login:'carol'},updatedAt:'2026-01-03T12:00:00Z',state:'MERGED',mergeCommit:{oid:c.c5}},
      {number:8,title:'Fork change',headRefName:'fork-change',headRefOid:c.pr8,author:{login:'fork'},updatedAt:'2026-01-08T12:00:00Z',state:'OPEN',mergeCommit:null}]);
    }
    throw new Error('unexpected gh '+args.join(' '));
  };
  run.calls=calls;return run;
}
function snapshot(dir){
  const gitDir=path.join(dir,'.git');
  return {status:git(dir,['--no-optional-locks','status','--porcelain=v2','--branch']),head:git(dir,['rev-parse','HEAD']),refs:git(dir,['for-each-ref','--format=%(refname) %(objectname)']),
    index:crypto.createHash('sha256').update(fss.readFileSync(path.join(gitDir,'index'))).digest('hex'),
    fetchHead:fss.existsSync(path.join(gitDir,'FETCH_HEAD'))?fss.readFileSync(path.join(gitDir,'FETCH_HEAD'),'utf8'):null};
}
/* Refs whose value was added, removed or changed between two snapshots. */
function refChanges(before,after){
  const map=t=>new Map(t.split('\n').filter(Boolean).map(l=>{const [r,o]=l.split(' ');return [r,o];}));
  const a=map(before.refs),b=map(after.refs),out=[];
  for(const r of new Set([...a.keys(),...b.keys()]))if(a.get(r)!==b.get(r))out.push(r);
  return out.sort();
}
/* A gh executable for the command-line test: a node script answering like ghStub. */
async function ghExecutable(dir,c){
  const bin=path.join(dir,'bin');await fs.mkdir(bin,{recursive:true});
  const prs=JSON.stringify([{number:7,title:'Feature step',headRefName:'feature',headRefOid:c.c3,author:{login:'carol'},updatedAt:'2026-01-03T12:00:00Z',state:'MERGED',mergeCommit:{oid:c.c5}}]);
  const script='#!'+process.execPath+'\nconst a=process.argv.slice(2);\nif(a[0]==="api"&&a[1]==="user"){console.log(JSON.stringify({login:"octo"}));process.exit(0);}\nif(a[0]==="pr"&&a[1]==="list"){console.log('+JSON.stringify(prs)+');process.exit(0);}\nif(a[0]==="auth"&&a[1]==="token"){console.log("gho_SECRET_TOKEN_123");process.exit(0);}\nprocess.exit(1);\n';
  await fs.writeFile(path.join(bin,'gh'),script,{mode:0o755});
  return bin;
}
module.exports={git,cleanEnv,fixture,ghStub,snapshot,refChanges,ghExecutable,spec,provider,docA};
