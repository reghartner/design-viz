import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {build} from 'esbuild';
import {describe, expect, it} from 'vitest';
import * as api from '../src/index';

const app=fileURLToPath(new URL('../',import.meta.url));

describe('loader-injected public API',()=>{
  it('loads the core facade without a browser or a Backstage host',()=>{
    expect(typeof api.FlowviewEntityDiagrams).toBe('function');
    expect(typeof api.mountNativeViewer).toBe('function');
    expect(api.SPEC_MAX_BYTES).toBe(2*1024*1024);
    const result={version:1,entityRef:'component:default/camera',revision:'index-r1',diagrams:[]};
    expect(api.parseEntityDiagrams(result,result.entityRef)).toBe(result);
    expect(()=>api.parseEntityDiagrams(result,'component:default/another')).toThrow('Invalid entity diagram response');
    expect(api.FlowviewCompatibility.check({page:{blocks:[]}}).status).toBe('unversioned');
    expect(Object.keys(api).sort()).toEqual([
      'FlowviewCompatibility','FlowviewEntityDiagrams','SPEC_MAX_BYTES','mountNativeViewer','parseEntityDiagrams',
    ]);
  });

  it('keeps the whole core graph free of Backstage and reference transport modules',async()=>{
    const bundled=await build({absWorkingDir:app,entryPoints:['src/index.ts'],bundle:true,write:false,
      metafile:true,platform:'browser',format:'esm',packages:'external',jsx:'automatic'});
    const inputs=Object.keys(bundled.metafile!.inputs).map(file=>file.split(path.sep).join('/'));
    expect(inputs.some(file=>file.endsWith('src/generated/nativeViewer.js'))).toBe(true);
    expect(inputs.some(file=>/api\/client\.|EntityFlowviewContent|plugin\.tsx|reference-proxy/.test(file))).toBe(false);
    const external=new Set(Object.values(bundled.metafile!.outputs).flatMap(output=>output.imports.map(item=>item.path)));
    expect([...external].sort()).toEqual(['react','react/jsx-runtime']);
  });
});
