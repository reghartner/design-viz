/* Shared offline branding. Authored logos are raster data, never executable SVG
   or remote fetches. Existing Phone monograms retain their original meaning. */
var FlowBrand = (function () {
  function object(v) {
    if(!v || Object.prototype.toString.call(v)!=='[object Object]')return false;
    var proto=Object.getPrototypeOf(v);
    return proto===null || (Object.prototype.hasOwnProperty.call(proto,'constructor') && typeof proto.constructor==='function' && Function.prototype.toString.call(proto.constructor)===Function.prototype.toString.call(Object));
  }
  function clean(raw) {
    if (!object(raw)) return {};
    var out = {};
    if (typeof raw.app === 'string') out.app = raw.app;
    if (typeof raw.logo === 'string' && raw.logo.length >= 1 && raw.logo.length <= 4) out.logo = raw.logo;
    if (embeddedImageSource(raw.logoImage)) out.logoImage = raw.logoImage;
    if (FlowIcons.has(raw.icon)) out.icon = raw.icon;
    ['accent','bg','fg'].forEach(function (key) {
      if (typeof raw[key] === 'string' && (raw[key].length===4 || raw[key].length===7) && /^#(?:[a-f\d]{3}|[a-f\d]{6})$/i.test(raw[key])) out[key] = raw[key];
    });
    return out;
  }
  function resolve(shared, local) {
    if (local === false) return null;
    var own = clean(local), value = Object.assign({}, clean(shared), own);
    // A local mark explicitly replaces the shared mark, in any supported form.
    if (['logoImage','icon','logo'].some(function(k){return own[k];})) {
      ['logoImage','icon','logo'].forEach(function(k){delete value[k];});
      ['logoImage','icon','logo'].forEach(function(k){if(own[k])value[k]=own[k];});
    }
    return Object.keys(value).length ? value : null;
  }
  function warnings(raw, path, out) {
    if (raw == null || raw === false) return;
    if (!object(raw)) { out.push(path + ': expected a brand object or false — ignored'); return; }
    if (raw.app != null && typeof raw.app !== 'string') out.push(path + '.app: expected text — ignored');
    if (raw.logo != null && !(typeof raw.logo === 'string' && raw.logo.length >= 1 && raw.logo.length <= 4)) out.push(path + '.logo: use a 1–4 character monogram — ignored');
    if (raw.logoImage != null && !embeddedImageSource(raw.logoImage)) out.push(path + '.logoImage: use an embedded PNG, JPEG or WebP up to 512 KiB — ignored');
    if (raw.icon != null && !FlowIcons.has(raw.icon)) out.push(path + '.icon: choose an icon from the shared library — ignored');
    ['accent','bg','fg'].forEach(function(k){if(raw[k]!=null && !clean(raw)[k])out.push(path+'.'+k+': use #RGB or #RRGGBB — ignored');});
  }
  function render(raw, options) {
    var b = clean(raw), o = options || {}, mark = '', name = b.app || 'Company';
    if (b.logoImage) mark = '<img class="fv-brand-mark" src="' + esc(b.logoImage) + '" alt="' + esc(name + ' logo') + '">';
    else if (b.icon) mark = FlowIcons.render(b.icon, {className:'fv-brand-mark', label:o.compact ? name : undefined});
    else if (b.logo) mark = '<span class="fv-brand-mark fv-brand-monogram" aria-label="' + esc(name + ' logo') + '">' + esc(b.logo) + '</span>';
    if (!mark && (!b.app || o.compact)) return '';
    var styles = [];
    if (b.accent) styles.push('--fv-brand-accent:' + b.accent);
    if (b.bg) styles.push('--fv-brand-bg:' + b.bg);
    if (b.fg) styles.push('--fv-brand-fg:' + b.fg);
    return '<span class="fv-brand' + (o.className ? ' ' + esc(o.className) : '') + '"' + (styles.length ? ' style="' + styles.join(';') + '"' : '') + '>' + mark +
      (!o.compact && b.app ? '<span class="fv-brand-name">' + esc(b.app) + '</span>' : '') + '</span>';
  }
  return Object.freeze({isObject:object,clean:clean, resolve:resolve, warnings:warnings, render:render});
})();
