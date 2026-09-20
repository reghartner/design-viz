"""Test-only host: production skeleton/modules plus an explicit fixture facade.

No function-body slicing and no production test globals. Other Chrome fixtures
exercise the committed workbench unchanged; this one checks owner teardown.
"""
import importlib.util
from pathlib import Path
import sys

root=Path(sys.argv[1]).resolve()
out=Path(sys.argv[2]).resolve()
spec=importlib.util.spec_from_file_location('flowview_build',root/'tools/build.py')
build=importlib.util.module_from_spec(spec)
spec.loader.exec_module(build)
entry=build.entrypoint('workbench')
assets=build.entrypoint_assets('workbench')
styles={item['key']:item['source'] for item in assets['styles']}
facade='''
window.__editorTest={
  get builder(){return workbenchBuilder;},
  remount:function(){
    workbenchBuilder=initWorkbenchBuilder({view:view,src:src,workspace:workspace,deferInitialSave:true,
      render:function(request){return go(true,request);},renderedText:workbenchPreview.renderedText,ctl:workbenchPreview.controller,
      beforeProjectLoad:function(){workbenchPreview.forgetDocument();},isActive:function(){return !document.getElementById('workbench-workspace').hidden;}});
    return workbenchBuilder;
  }
};
'''
html=build.fill(build.read('workbench.skel.html'),{
    'STYLE_PAGE':build.font_css(entry['fonts'])+'\n'+styles['workbench'].rstrip(),
    'STYLE_CORE':styles['core'].rstrip(),
    'ICONS':assets['icons'].rstrip(),
    'JS':entry['source']+'\n'+facade,
    'WORKBENCH_TEMPLATES':build.workbench_templates(),
})
out.mkdir(parents=True,exist_ok=True)
(out/'index.html').write_text(html)
print(out/'index.html')
