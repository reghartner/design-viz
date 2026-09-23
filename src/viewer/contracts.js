/* Message contracts share one card renderer in every host. */
function contractCardHTML(contract, sectionReference, record){
  if (!contract || typeof contract !== 'object' || Array.isArray(contract)) return '';
  var addressed = (typeof sectionReference === 'number' && sectionReference > 0) ||
                  (typeof sectionReference === 'string' && sectionReference.length > 0);
  var sectionAddress = addressed ? esc(String(sectionReference)) : '';
  if(record && record.key!=='legacy')sectionAddress+='-block-'+esc(record.reference);
  var key=record?record.key:'legacy';
  var h = '<div class="ctcard" data-dv-contract="'+esc(key)+'" data-contract-ref="'+esc(record?record.reference:'legacy')+'" style="--contract-span:'+contractColumnSpan(contract.span)+'"' + (addressed ? ' id="contract-' + sectionAddress + '"' : '') + '>';
  var src = (contract.source && typeof contract.source === 'string') ?
    ' <a class="srcchip" href="' + esc(contract.source) + '" target="_blank" rel="noopener">source &#8599;</a>' : '';
  if (contract.title || src || addressed){
    h += '<div class="cttitle"><span>' + esc(contract.title || 'On the wire') + src + '</span>';
    if (addressed) h += '<button type="button" class="copychip contractcopy" title="Copy link" aria-label="Copy link to this contract card">' + COPY_ICON + '</button>';
    h += '</div>';
  }
  var rows = Array.isArray(contract.fields) ? contract.fields : [];
  var body = '', renderedRow = 0;
  rows.forEach(function(f, fi){
    if (!f || typeof f !== 'object' || !f.k) return;
    renderedRow++;
    var link = (f.link && typeof f.link === 'string') ?
      ' <a class="ctlink" href="' + esc(f.link) + '" target="_blank" rel="noopener" aria-label="Source for ' +
      esc(f.k) + '">&#8599;</a>' : '';
    var delta = ['added','removed','changed'].indexOf(f.delta) >= 0 ? f.delta : null;
    var badge = delta ? ' <span class="ctdelta" aria-label="' + delta + ' field">' + delta + '</span>' : '';
    body += '<tr class="ctrow' + (f.hot === true ? ' hot' : '') +
            (delta ? ' delta-' + delta : '') + '"' +
            ' data-dv-crow="' + fi + '"' + /* spec index — malformed rows are skipped, so the rendered position can lag it */
            (addressed ? ' id="contract-' + sectionAddress + '-row-' + renderedRow +
             '" tabindex="-1" aria-label="Contract field ' + esc(f.k) + '"' : '') +
            fragmentAttrs(f) + '>' +
            '<td class="ctk"><span class="ctkey">' + esc(f.k) + link + '</span>' + badge + '</td>' +
            '<td class="ctv">' + (f.v != null ? esc(f.v) : '') + '</td>' +
            '<td class="ctg">' + (f.g != null ? proseMarkup(f.g) : '') + '</td></tr>';
  });
  if (body) h += '<table class="cttable">' + body + '</table>';
  if (contract.note) h += '<div class="ctnote">' + proseMarkup(contract.note) + '</div>';
  h += '</div>';
  return h;
}

function contractBlocksHTML(section,reference){
  var records=sectionContracts(section);
  if(!records.length)return '';
  return '<div class="contract-region"><div class="contract-grid">'+records.map(function(rec){
    return contractCardHTML(rec.value,reference,rec);
  }).join('')+'</div></div>';
}
