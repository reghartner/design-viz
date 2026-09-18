'use strict';
// Static dependency: production backend bundlers must include the shared code.
// Regenerate from src/ with python3 tools/build.py; no source files or VM are
// needed at runtime, including when viewerRouting() is first called.
module.exports=require('./generated-runtime.cjs');
