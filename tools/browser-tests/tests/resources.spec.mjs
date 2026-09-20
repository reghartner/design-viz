import {test,expect,trackResources} from '../helpers/test.mjs';
test('resource tracker preserves native duplicate/capture/once/abort, receivers and observer retirement',async({page})=>{
  await page.addInitScript(trackResources);await page.goto('about:blank');
  const result=await page.evaluate(async()=>{
    const baseline=__resourceCounts(),counts=[],calls=[];
    function callback(){calls.push(this===window);}
    window.addEventListener('probe',callback,{capture:false});window.addEventListener('probe',callback,false);
    counts.push(__resourceCounts().listeners-baseline.listeners);
    window.dispatchEvent(new Event('probe'));window.dispatchEvent(new Event('probe'));
    window.addEventListener('probe',callback,true);counts.push(__resourceCounts().listeners-baseline.listeners);
    window.removeEventListener('probe',callback,{capture:false});window.removeEventListener('probe',callback,true);
    const options={once:true},once=()=>calls.push('once');
    window.addEventListener('once-probe',once,options);options.once=false;
    window.dispatchEvent(new Event('once-probe'));window.dispatchEvent(new Event('once-probe'));
    const abort=new AbortController();document.addEventListener('aborted',callback,{signal:abort.signal});abort.abort();
    document.dispatchEvent(new Event('aborted'));document.addEventListener('never',callback,{signal:abort.signal});
    const host=document.createElement('div'),root=host.attachShadow({mode:'open'});
    root.addEventListener('shadow',callback,{once:true});counts.push(__resourceCounts().listeners-baseline.listeners);root.dispatchEvent(new Event('shadow'));
    // Ordinary detached control listeners are outside the ledger.
    document.createElement('button').addEventListener('click',callback);
    const receiver=await new Promise(resolve=>setTimeout(function(value){resolve([this===window,value]);},0,'payload'));
    const frame=await new Promise(resolve=>requestAnimationFrame(function(time){resolve([this===window,typeof time]);}));
    const timeout=setTimeout(()=>calls.push('cancelled'),10000);clearInterval(timeout);
    const interval=setInterval(()=>calls.push('cancelled'),10000);clearTimeout(interval);
    const cancelledFrame=requestAnimationFrame(()=>calls.push('cancelled'));cancelAnimationFrame(cancelledFrame);
    const a=document.createElement('div'),b=document.createElement('div');
    const ro=new ResizeObserver(()=>{});ro.observe(a);ro.observe(a);ro.observe(b);ro.unobserve(a);
    counts.push(__resourceCounts().observers-baseline.observers);ro.unobserve(b);
    const mo=new MutationObserver(()=>{});mo.observe(a,{attributes:true});mo.observe(a,{childList:true});mo.disconnect();
    const io=new IntersectionObserver(()=>{});io.observe(a);io.unobserve(a);io.disconnect();
    return {baseline,final:__resourceCounts(),counts,calls,receiver,frame,mutationUnobserve:'unobserve' in mo};
  });
  expect(result.counts).toEqual([1,2,1,1]);expect(result.calls).toEqual([true,true,'once',false]);
  expect(result.receiver).toEqual([true,'payload']);expect(result.frame).toEqual([true,'number']);
  expect(result.mutationUnobserve).toBe(false);expect(result.final).toEqual(result.baseline);
});
