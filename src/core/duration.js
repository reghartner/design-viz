/* #1252: one rounding rule for shown durations (Trace view, waterfall, imported trace text): 2 decimals
   under 10 ms, 1 under 1000 ms, whole above. durationMsText keeps whole numbers as authored and shows a
   tiny positive value as "<0.01" so it never reads as zero. No dependencies: tools/trace2spec.js loads it
   beside src/trace-import.js. */
function durationMsRounded(ms){ return Number(ms.toFixed(ms < 10 ? 2 : ms < 1000 ? 1 : 0)); }
function durationMsText(ms){
  if (typeof ms !== 'number' || !isFinite(ms) || Number.isInteger(ms)) return String(ms);
  return ms > 0 && ms < 0.01 ? '<0.01' : String(durationMsRounded(ms));
}
