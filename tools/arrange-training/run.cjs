#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const T=require('./core.cjs');
function write(file,data){fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n');}
async function main(){
  const args=process.argv.slice(2),options={};
  while(args.length){const key=args.shift();if(!['--engine-root','--corpus','--output','--arrange','--worker'].includes(key)||!args.length)throw Error('Usage: node tools/arrange-training/run.cjs [--engine-root TRUSTED_CHECKOUT] [--corpus DIRECTORY] --output DIRECTORY [--arrange INPUT_SPEC]');options[key]=args.shift();}
  if(options['--worker']){
    const engine=T.loadEngine(options['--worker']),d=JSON.parse(fs.readFileSync(0,'utf8'));
    const viz=await require(path.join(engine.root,'src/workbench/vendor/viz-3.31.0.js')).instance();
    const cola=require(path.join(engine.root,'src/workbench/vendor/webcola-3.4.0.js'));
    const result=engine.C.autoArrangeCandidates(d,viz,cola);
    process.stdout.write(JSON.stringify(engine.C.autoArrangeDiagram(d,result)));return;
  }
  if(!options['--output'])throw Error('--output required');
  const started=performance.now(),out=path.resolve(options['--output']);fs.mkdirSync(out,{recursive:true});
  const engine=T.loadEngine(options['--engine-root']),corpus=T.loadCorpus(options['--corpus']),rows=T.evaluateCorpus(engine,corpus),model=T.fit(rows),loo=T.leaveOneOut(rows);
  const report={version:1,engine:engine.provenance,trainer:{sha256:T.hash(fs.readFileSync(__filename)),coreSha256:T.hash(fs.readFileSync(path.join(__dirname,'core.cjs')))},
    corpus:corpus.map(({diagrams,...p})=>p),model,rows:rows.map(row=>({...row,currentEngine:T.engineRank(engine,row),learned:T.rank(model,row)})),leaveOneGraphOut:loo,
    limitations:['Four labels underdetermine weights; training fit is not evidence of generalization.','Leave-one-graph-out has only four cases, with no held-out labels in fitting or scaling.','Candidate score reductions are not human preference labels.','Safety uses sampled actual viewer paths, not an exact continuous-curve proof.','The comparison uses the engine candidate comparator, not all of its later search heuristics.'],experiment:null};
  if(options['--arrange']){
    const raw=fs.readFileSync(options['--arrange']),input=JSON.parse(raw),before=T.clone(input),after=T.clone(input),results=[];
    for(let i=0;i<(input.page?.blocks || []).length;i++){
      const block=input.page.blocks[i];if(!block.diagram)continue;
      const start=performance.now();
      const child=cp.spawnSync(process.execPath,[__filename,'--worker',engine.root],{input:JSON.stringify(block.diagram),encoding:'utf8',timeout:30000,maxBuffer:8*1024*1024});
      const arrangerRuntimeMs=performance.now()-start;
      if(child.status!==0){results.push({id:block.id,status:'arranger-failed',error:String(child.error?.message||child.stderr||'worker terminated'),arrangerRuntimeMs});continue;}
      const arranged=JSON.parse(child.stdout),result=T.contract(engine,arranged,model);
      before.page.blocks[i].diagram=arranged;after.page.blocks[i].diagram=result.diagram;
      const {diagram,...metrics}=result;results.push({id:block.id,status:T.safe(result.baseline)?'evaluated':'unsafe-arranger-output',arrangerRuntimeMs,...metrics,
        learnedCostBefore:T.cost(model,result.baseline),learnedCostAfter:T.cost(model,result.metrics)});
    }
    write(path.join(out,'experiment-before.spec.json'),before);write(path.join(out,'experiment-after.spec.json'),after);
    report.experiment={source:'fresh production arranger on provided input; bounded global contraction afterward',inputSha256:T.hash(raw),arrangerTimeoutMs:30000,results};
  }
  report.runtimeMs=performance.now()-started;write(path.join(out,'training-report.json'),report);
  console.log(JSON.stringify({output:out,engineCommit:report.engine.commit,fit:report.rows.map(r=>({id:r.id,human:r.choice,engine:r.currentEngine.choice,learned:r.learned.choice,margin:r.learned.humanMargin})),loo:loo.map(r=>({id:r.id,choice:r.choice,error:r.error})),experiment:report.experiment?.results.map(r=>({id:r.id,status:r.status,accepted:r.accepted,checks:r.checks})),runtimeMs:report.runtimeMs},null,2));
}
main().catch(error=>{console.error(error.stack);process.exitCode=1;});
