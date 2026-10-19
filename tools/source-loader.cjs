'use strict';
/* Build/test-time assembly only. Shipped runtimes contain the expanded source. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const sourceRoot = path.join(__dirname, '../src');
const PACKAGES_PREFIX = '@packages/';
const PACKAGE_PREFIX = '@package/';
/* Fork-owned overlay. Upstream ships only company/README.md there, so forks keep
   panels, contract fragments, examples and tests out of upstream-owned files.
   Only this checkout's own source tree is overlaid; synthetic test roots are not. */
const COMPANY_PREFIX = '@company/';
function companyDir(root = sourceRoot) {
  return path.resolve(root) === sourceRoot ? path.join(sourceRoot, '../company') : null;
}
function sourcePath(root, file) {
  if (file.startsWith(PACKAGE_PREFIX)) {
    // The first path segment is the package name; the rest is a manifest-owned file.
    const segments = file.slice(PACKAGE_PREFIX.length).split('/');
    const packageName = segments.shift();
    const relative = segments.join('/');
    const metadata = packageManifest(packageName, root);
    if (!enabledPackages(root).includes(packageName) ||
        ![...metadata.sourceFiles, ...(metadata.workbenchSourceFiles || [])].includes(relative))
      throw new Error('Package source is not enabled: ' + file);
    return path.join(packageDir(root, packageName), relative);
  }
  if (!file.startsWith(COMPANY_PREFIX)) return path.join(root, file);
  const company = companyDir(root);
  if (!company) throw new Error('Company overlay source outside the checkout: ' + file);
  return path.join(company, file.slice(COMPANY_PREFIX.length));
}
/* Company identity: company/company.json (fork-owned). Absent, or disabled with
   FLOWVIEW_COMPANY_IDENTITY=off (build.py --no-config), every value below falls
   back to the upstream default and assembled sources are byte-identical. */
const UPSTREAM_REPOSITORY = 'https://github.com/reghartner/design-viz';
const EXAMPLE_REPOSITORY = 'https://github.com/your-team/design-viz';
const BRAND_KEYS = ['companyName', 'logo', 'primaryColor', 'secondaryColor'];
const IMAGE_MAX_BYTES = 512 * 1024;
function companyError(file, message) { return new Error('Invalid company config ' + file + ': ' + message); }
function plainText(value, file, key, max = 80) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[\u0000-\u001f\u007f<>]/.test(value))
    throw companyError(file, key + ' must be 1–' + max + ' characters of plain text');
  return value.trim();
}
function repositoryUrl(value, file) {
  let url;
  try { url = new URL(value); } catch { throw companyError(file, 'repository must be a full https:// URL'); }
  const segments = url.pathname.replace(/\/+$/, '').replace(/\.git$/, '').split('/').filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || segments.length !== 2 ||
      segments.some(segment => !/^[A-Za-z0-9._-]+$/.test(segment)))
    throw companyError(file, 'repository must be an https:// repository root such as ' + EXAMPLE_REPOSITORY);
  return url.origin + '/' + segments.join('/');
}
function backstageBaseUrl(value, file) {
  const message = 'backstage.baseUrl must be an absolute http(s) URL without credentials, query, fragment, whitespace or control characters';
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\s\u0000-\u001f\u007f-\u009f\\?#]/.test(value))
    throw companyError(file, message);
  let url;
  try { url = new URL(value); } catch { throw companyError(file, message); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
    throw companyError(file, message);
  return url.origin + url.pathname.replace(/\/+$/, '');
}
function inside(directory, file) {
  const relative = path.relative(directory, file);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}
function imageDataUri(file, logo, config, company) {
  if (!inside(company, file)) throw companyError(config, 'logo ' + logo + ' must be a relative path inside company/');
  if (!fs.existsSync(file)) throw companyError(config, 'logo file not found: ' + logo);
  const bytes = fs.readFileSync(file);
  const kind = bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])) ? 'png'
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff ? 'jpeg'
    : bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP' ? 'webp' : null;
  if (!kind) throw companyError(config, 'logo ' + logo + ' must be a PNG, JPEG or WebP file');
  if (bytes.length > IMAGE_MAX_BYTES) throw companyError(config, 'logo ' + logo + ' must be at most 512 KiB');
  return 'data:image/' + kind + ';base64,' + bytes.toString('base64');
}
function readBrand(file, companyName, company) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw companyError(file, error.message); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw companyError(file, 'expected a JSON object');
  const unknown = Object.keys(raw).filter(key => !BRAND_KEYS.includes(key));
  if (unknown.length) throw companyError(file, 'unknown field ' + unknown.join(', ') + '; allowed: ' + BRAND_KEYS.join(', '));
  const brand = {};
  const name = raw.companyName ?? companyName;
  if (name != null) brand.companyName = plainText(name, file, 'companyName');
  if (raw.logo != null) {
    const logo = raw.logo;
    if (typeof logo !== 'string') throw companyError(file, 'logo must be text');
    if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)) {
      if (Buffer.from(logo.slice(logo.indexOf(',') + 1), 'base64').length > IMAGE_MAX_BYTES)
        throw companyError(file, 'logo must be at most 512 KiB');
      brand.logo = logo;
    } else if (/\.(?:png|jpe?g|webp)$/i.test(logo)) {
      brand.logo = imageDataUri(path.resolve(path.dirname(file), logo), logo, file, company);
    } else if (logo.length >= 1 && logo.length <= 4 && !/[\u0000-\u001f\u007f<>]/.test(logo)) {
      brand.logo = logo;
    } else throw companyError(file, 'logo must be a 1–4 character monogram, a PNG/JPEG/WebP data URI, or a relative .png/.jpg/.webp path');
  }
  for (const key of ['primaryColor', 'secondaryColor']) {
    if (raw[key] == null) continue;
    if (typeof raw[key] !== 'string' || !/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(raw[key]))
      throw companyError(file, key + ' must be #RGB or #RRGGBB');
    brand[key] = raw[key];
  }
  return brand;
}
function companyConfig(root = sourceRoot) {
  const company = companyDir(root);
  if (!company || process.env.FLOWVIEW_COMPANY_IDENTITY === 'off') return null;
  const file = path.join(company, 'company.json');
  if (!fs.existsSync(file)) return null;
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw companyError(file, error.message); }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw companyError(file, 'expected a JSON object');
  const allowed = ['version', 'companyName', 'repository', 'revision', 'brand', 'package', 'packages', 'backstage', 'site'];
  const unknown = Object.keys(raw).filter(key => !allowed.includes(key));
  if (unknown.length) throw companyError(file, 'unknown field ' + unknown.join(', ') + '; allowed: ' + allowed.join(', '));
  if (raw.version !== 1) throw companyError(file, 'version must be 1');
  const config = {companyName:null, repository:null, revision:null, brand:null, package:{}, packages:[]};
  if (raw.packages != null) {
    if (!Array.isArray(raw.packages) || raw.packages.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) ||
        new Set(raw.packages).size !== raw.packages.length)
      throw companyError(file, 'packages must be a list of unique lowercase package names');
    config.packages = raw.packages;
  }
  if (raw.companyName != null) config.companyName = plainText(raw.companyName, file, 'companyName', 40);
  if (raw.repository != null) config.repository = repositoryUrl(raw.repository, file);
  if (raw.revision != null) {
    if (typeof raw.revision !== 'string' || !raw.revision.trim() || /[\s?#]/.test(raw.revision) || raw.revision.length > 200)
      throw companyError(file, 'revision must be a branch, tag or commit without spaces, ? or #');
    config.revision = raw.revision;
  }
  if (Object.hasOwn(raw, 'backstage')) {
    if (!raw.backstage || typeof raw.backstage !== 'object' || Array.isArray(raw.backstage))
      throw companyError(file, 'backstage must be an object with baseUrl');
    const extra = Object.keys(raw.backstage).filter(key => key !== 'baseUrl');
    if (extra.length) throw companyError(file, 'unknown backstage field ' + extra.join(', ') + '; allowed: baseUrl');
    config.backstage = {baseUrl: backstageBaseUrl(raw.backstage.baseUrl, file)};
  }
  if (Object.hasOwn(raw, 'site')) {
    if (!raw.site || typeof raw.site !== 'object' || Array.isArray(raw.site) || Object.keys(raw.site).some(key => key !== 'baseUrl')) throw companyError(file, 'site must be an object with baseUrl');
    try { backstageBaseUrl(raw.site.baseUrl, file); config.site = {baseUrl: new URL(raw.site.baseUrl).href}; }
    catch { throw companyError(file, 'site.baseUrl must be an absolute http(s) URL without credentials, query, fragment, whitespace or control characters'); }
  }
  if (raw.brand != null) {
    if (typeof raw.brand !== 'string' || !raw.brand.trim()) throw companyError(file, 'brand must be a path relative to company.json');
    const brandFile = path.resolve(company, raw.brand);
    if (!inside(company, brandFile)) throw companyError(file, 'brand must be a relative path inside company/');
    if (!fs.existsSync(brandFile)) throw companyError(file, 'brand file not found: ' + raw.brand);
    config.brand = readBrand(brandFile, config.companyName, company);
  }
  if (raw.package != null) {
    if (!raw.package || typeof raw.package !== 'object' || Array.isArray(raw.package)) throw companyError(file, 'package must be an object');
    const extra = Object.keys(raw.package).filter(key => !['repositoryUrl', 'registry'].includes(key));
    if (extra.length) throw companyError(file, 'unknown package field ' + extra.join(', ') + '; allowed: repositoryUrl, registry');
    for (const key of ['repositoryUrl', 'registry']) {
      if (raw.package[key] == null) continue;
      if (typeof raw.package[key] !== 'string' || !raw.package[key].trim() || /\s/.test(raw.package[key]))
        throw companyError(file, 'package.' + key + ' must be a URL');
      if (key === 'registry' && !/^https?:\/\//.test(raw.package[key])) throw companyError(file, 'package.registry must be an http(s) URL');
      config.package[key] = raw.package[key];
    }
  }
  return config;
}
// Only public authoring context travels into prompts and the offline kit.
function companyAgentContext(config = companyConfig()) {
  return Object.assign({}, config && config.backstage ? {backstage: {baseUrl: config.backstage.baseUrl}} : {}, config && config.site ? {site: {baseUrl: config.site.baseUrl}} : {});
}
/* Marked literals keep today's text unless the company config replaces it:
   `/*@company:name*\/'Company service'` replaces the word Company,
   `/*@company:repository*\/'https://github.com/reghartner/design-viz/…'` the
   upstream repository prefix, `/*@company:example-repository*\/'…'` the
   your-team placeholder. The marker comment never reaches assembled output. */
const COMPANY_MARKER = /\/\*@company:([a-z-]+)\*\/'([^'\\\n]*)'/g;
function companyText(source, file, config) {
  const result = source.replace(COMPANY_MARKER, (match, key, text) => {
    let token, value;
    if (key === 'name') { token = /\bCompany\b/g; value = config && config.companyName; }
    else if (key === 'repository') { token = UPSTREAM_REPOSITORY; value = config && config.repository; }
    else if (key === 'example-repository') { token = EXAMPLE_REPOSITORY; value = config && config.repository; }
    else throw new Error('Unknown company marker ' + key + ' in ' + file);
    const found = typeof token === 'string' ? text.startsWith(token) || text.includes(token) : token.test(text);
    if (typeof token !== 'string') token.lastIndex = 0;
    if (!found) throw new Error('Company marker ' + key + ' in ' + file + ' has no placeholder to replace: ' + text);
    if (!value) return "'" + text + "'";
    let replaced = typeof token === 'string' ? text.split(token).join(value) : text.replace(token, () => value);
    // Repository file links follow the fork's configured revision.
    if (key === 'repository' && config.revision)
      replaced = replaced.replace('/blob/main/', () => '/blob/' + encodeURIComponent(config.revision) + '/');
    return JSON.stringify(replaced).replace(/</g, '\\u003c');
  });
  if (result.includes('/*@company:')) throw new Error('Company marker in ' + file + ' must precede a single-quoted literal without quotes or backslashes');
  return result;
}
function companyBrandSource(brand) {
  return '/* Company brand from company/company.json (fork-owned); generated at build time. */\n' +
    'var FLOWVIEW_COMPANY_BRAND_CONFIG = Object.freeze(' + JSON.stringify(brand).replace(/</g, '\\u003c') + ');';
}
function packageDir(root, name) {
  if (path.resolve(root) !== sourceRoot || !/^[a-z][a-z0-9-]*$/.test(name))
    throw new Error('Invalid package: ' + name);
  return path.join(sourceRoot, '../packages', name);
}
function packageManifest(name, root = sourceRoot) {
  const file = path.join(packageDir(root, name), 'package.json');
  let metadata;
  try { metadata = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error('Cannot read package ' + name + ': ' + error.message); }
  if (!metadata || metadata.name !== name || !Array.isArray(metadata.sourceFiles) || !Array.isArray(metadata.templates) ||
      (metadata.workbenchSourceFiles != null && !Array.isArray(metadata.workbenchSourceFiles)) ||
      metadata.sourceFiles.some(file => typeof file !== 'string' ||
        !/^panels\/(?:[a-z][a-z0-9-]*\.js|venues\/[a-z][a-z0-9-]*\.js|types\/[a-z][a-z0-9-]*\.js)$/.test(file)) ||
      (metadata.workbenchSourceFiles || []).some(file => typeof file !== 'string' ||
        !/^panels\/[a-z][a-z0-9-]*\.js$/.test(file)) ||
      new Set([...metadata.sourceFiles, ...(metadata.workbenchSourceFiles || [])]).size !==
        metadata.sourceFiles.length + (metadata.workbenchSourceFiles || []).length)
    throw new Error('Invalid package manifest: ' + file);
  for (const template of metadata.templates) {
    if (!template || typeof template !== 'object' || Array.isArray(template) ||
        typeof template.name !== 'string' || typeof template.desc !== 'string' ||
        typeof template.source !== 'string' || !/^starters\/[a-z][a-z0-9-]*\.json$/.test(template.source))
      throw new Error('Invalid package template in ' + file);
  }
  return metadata;
}
function sitePackageSelection(root = sourceRoot, file = path.join(root, '../workbench/site.json'), required = false) {
  if (!fs.existsSync(file)) {
    if (required) throw new Error('Site config does not exist: ' + file);
    return null;
  }
  let data;
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { throw new Error('Invalid site config ' + file + ': ' + error.message); }
  if (!data || typeof data !== 'object' || Array.isArray(data) || !Object.hasOwn(data, 'packages')) return null;
  const names = data.packages;
  if (!Array.isArray(names) || names.some(name => typeof name !== 'string' || !/^[a-z][a-z0-9-]*$/.test(name)) ||
      new Set(names).size !== names.length)
    throw new Error('Invalid site config ' + file + ': packages must be a list of unique lowercase package names');
  return names;
}
function enabledPackages(root = sourceRoot) {
  if (path.resolve(root) !== sourceRoot) return [];
  // A site build may override the company default, including with an empty
  // list. Explicit CLI preview packages remain additive to that selection.
  const configured = Object.hasOwn(process.env, 'FLOWVIEW_PACKAGE_BASE')
    ? process.env.FLOWVIEW_PACKAGE_BASE.split(',').filter(Boolean)
    : process.env.FLOWVIEW_SITE_CONFIG
      ? sitePackageSelection(root, path.resolve(process.env.FLOWVIEW_SITE_CONFIG), true) ?? companyConfig(root)?.packages ?? []
      : process.env.FLOWVIEW_COMPANY_IDENTITY === 'off' ? []
      : sitePackageSelection(root) ?? companyConfig(root)?.packages ?? [];
  const selected = process.env.FLOWVIEW_PACKAGES ? process.env.FLOWVIEW_PACKAGES.split(',').filter(Boolean) : [];
  const names = [...new Set([...configured, ...selected])].sort();
  for (const name of names) packageManifest(name, root);
  return names;
}
function manifest(root) { return JSON.parse(fs.readFileSync(path.join(root, 'source-bundles.json'), 'utf8')); }
function sourceFiles(name, root = sourceRoot) {
  const config = manifest(root), entries = Object.hasOwn(config, name) ? config[name] : [name];
  if (!Array.isArray(entries)) throw new Error('Not a logical source bundle: ' + name);
  return entries.flatMap((entry) => {
    // Fork venue entries extend the optional sports registry and must not run
    // in builds that omit that registry.
    if (entry === '@company/panels/venues/*.js' && !enabledPackages(root).includes('sports')) return [];
    if (entry.startsWith(PACKAGES_PREFIX)) {
      const directory = entry.endsWith('/*.js') ? entry.slice(PACKAGES_PREFIX.length, -5) : null;
      if (!['panels', 'panels/venues', 'panels/types', 'workbench'].includes(directory))
        throw new Error('Unknown package source slot: ' + entry);
      return enabledPackages(root).flatMap(packageName => (directory === 'workbench'
        ? packageManifest(packageName, root).workbenchSourceFiles || []
        : packageManifest(packageName, root).sourceFiles.filter(file => path.posix.dirname(file) === directory))
        .map(file => PACKAGE_PREFIX + packageName + '/' + file));
    }
    const company = entry.startsWith(COMPANY_PREFIX);
    if (!entry.endsWith('/*.js')) {
      if (company) throw new Error('Company overlay entries must be directory globs: ' + entry);
      return [entry];
    }
    const directory = entry.slice(0, -5);
    // Overlay globs are optional: an absent or empty company directory adds nothing.
    if (company && (!companyDir(root) || !fs.existsSync(sourcePath(root, directory)))) return [];
    const files = fs.readdirSync(sourcePath(root, directory), {withFileTypes:true})
      .filter(file => file.isFile() && file.name.endsWith('.js')).map(file => file.name).sort();
    if (!files.length && !company) throw new Error('Empty source glob: ' + entry);
    return files.map(file => directory + '/' + file);
  });
}
function sourceRecords(names, root = sourceRoot, substitute = true) {
  const files = names.flatMap(name => sourceFiles(name, root)), seen = new Set();
  const company = substitute ? companyConfig(root) : null;
  return files.map(file => {
    if (seen.has(file)) throw new Error('Duplicate physical source: ' + file);
    seen.add(file);
    let source = fs.readFileSync(sourcePath(root, file), 'utf8').replace(/\r\n?/g, '\n').trimEnd();
    if (substitute && file.startsWith(PACKAGE_PREFIX)) {
      const marker = /\/\* @panel-asset:([^*]+) \*\/ ''/g;
      source = source.replace(marker, (match, relative) => {
        if (!/^\.\.\/assets\/[a-z][a-z0-9-]*\.(?:png|jpe?g|webp)$/.test(relative))
          throw new Error('Invalid panel asset marker in ' + file + ': ' + relative);
        const packageName = file.slice(PACKAGE_PREFIX.length).split('/')[0];
        const packageRoot = packageDir(root, packageName);
        const asset = path.resolve(path.dirname(sourcePath(root, file)), relative);
        if (!inside(packageRoot, asset) || !fs.existsSync(asset)) throw new Error('Panel asset not found: ' + relative);
        const bytes = fs.readFileSync(asset);
        if (bytes.length > IMAGE_MAX_BYTES) throw new Error('Panel asset must be at most 512 KiB: ' + relative);
        const extension = path.extname(asset).toLowerCase();
        const kind = extension === '.png' ? 'png' : extension === '.webp' ? 'webp' : 'jpeg';
        return JSON.stringify('data:image/' + kind + ';base64,' + bytes.toString('base64'));
      });
      if (source.includes('/* @panel-asset:')) throw new Error('Invalid panel asset marker in ' + file);
    }
    if (file === 'workbench/auto-arrange.js' && substitute) {
      const files = manifest(root).assets.autoArrangeWorker;
      const worker = files.map(file => fs.readFileSync(path.join(root, file), 'utf8')).join('\n');
      source = source.replace('/* @auto-arrange-worker */ ""', () => JSON.stringify(worker).replace(/</g, '\\u003c'));
    }
    if (substitute) source = companyText(source, file, company);
    if (file === 'workbench/agent-chat.js' && substitute)
      source = source.replace('/* @company-agent-context */ {}', () => JSON.stringify(companyAgentContext(company)).replace(/</g, '\\u003c'));
    if (file === 'core/document-links.js' && substitute) source = source.replace('/* @company-site-base */ null', () => JSON.stringify(company && company.site ? company.site.baseUrl : null).replace(/</g, '\\u003c'));
    if (file === 'company-brand.config.js' && company && company.brand) source = companyBrandSource(company.brand);
    if (file === 'compatibility.js' && substitute) {
      const marker = '/* @panel-features */ {}';
      if (!source.includes(marker)) throw new Error('Missing panel feature marker: ' + file);
      const assets=panelAssets(root);
      source = source.replace(marker, JSON.stringify(assets.features));
      source = source.replace('/* @icon-ids */ []',JSON.stringify(assets.iconIds || []));
    }
    return {file, source};
  });
}
function displayPath(file) {
  if (file.startsWith(PACKAGE_PREFIX)) return 'packages/' + file.slice(PACKAGE_PREFIX.length);
  return file.startsWith(COMPANY_PREFIX) ? 'company/' + file.slice(COMPANY_PREFIX.length) : 'src/' + file;
}
function formatSources(records) {
  return records.map(record => '/* ---- ' + displayPath(record.file) + ' ---- */\n' + record.source).join('\n');
}
function readSource(name, root = sourceRoot) { return sourceRecords([name], root).map(record => record.source).join('\n'); }
function composeSources(names, root = sourceRoot) { return formatSources(sourceRecords(names, root)); }
function entrypoint(name, root = sourceRoot) {
  const config = manifest(root).entrypoints;
  if (!config || !Object.hasOwn(config, name)) throw new Error('Unknown source entrypoint: ' + name);
  const definition = config[name], records = sourceRecords(definition.sources, root);
  const body = formatSources(records), all = records.slice();
  if (definition.boot) all.push(...sourceRecords([definition.boot], root));
  if (new Set(all.map(record => record.file)).size !== all.length) throw new Error('Duplicate entrypoint source: ' + name);
  const exports = definition.exports || {}, identifiers = [...Object.values(exports), ...(definition.defaultExport ? [definition.defaultExport] : [])];
  if ([...Object.keys(exports), ...identifiers].some(value => !/^[A-Za-z_$][\w$]*$/.test(value)))
    throw new Error('Invalid export identifier: ' + name);
  if (identifiers.length) {
    // Export-bearing cores contain trusted definitions only. Verify the actual
    // bindings in an isolated build-time context; never run boot or spec data.
    const missing = vm.runInNewContext(body + '\n;[' + identifiers.map(value =>
      'typeof ' + value + "===\"undefined\"?" + JSON.stringify(value) + ':null').join(',') + '].filter(Boolean);',
      {URL, TextEncoder}, {timeout:5000});
    if (missing.length) throw new Error('Missing entrypoint export: ' + name + ': ' + missing.join(', '));
  }
  return {name, records:all, body, source:formatSources(all), exports, defaultExport:definition.defaultExport || null,
    styles:definition.styles || [], fonts:definition.fonts || null, icons:!!definition.icons};
}
function moduleSource(name, format = 'esm', root = sourceRoot) {
  const entry = entrypoint(name, root), entries = Object.entries(entry.exports);
  if (!entries.length && !entry.defaultExport) throw new Error('Entrypoint has no module exports: ' + name);
  if (format === 'esm') return entry.source + '\n' + (entry.defaultExport ? 'export default ' + entry.defaultExport + ';\n' : '') +
    'export {' + entries.map(([key,value]) => key === value ? value : value + ' as ' + key).join(',') + '};\n';
  if (format === 'cjs') return entry.source + '\nmodule.exports = Object.assign(' + (entry.defaultExport || '{}') + ',{' +
    entries.map(([key,value]) => JSON.stringify(key) + ':' + value).join(',') + '});\n';
  throw new Error('Unknown module format: ' + format);
}
function panelAssets(root = sourceRoot) {
  const context = {};
  // Only trusted repository modules execute here, never a diagram/spec. No DOM,
  // filesystem, process or network is exposed to module registration.
  vm.runInNewContext(formatSources(sourceRecords(['validator.js'], root, false)), context, { timeout: 5000 });
  const features = {},
    styles = [],
    editorStyles = [];
  for (const type of context.PanelRegistry.types()) {
    const definition = context.PanelRegistry.get(type);
    features['panel.' + type] = {
      label: (definition.label || type) + ' panel',
      since: definition.since || '0.1.0',
    };
    function collect(value, into) {
      if (!value) return;
      for (const entry of Array.isArray(value) ? value : [value]) {
        const item = typeof entry === 'string' ? { css: entry, order: 100000 } : entry;
        if (
          !item ||
          typeof item.css !== 'string' ||
          (item.order != null && !Number.isFinite(item.order))
        )
          throw new Error('Invalid panel styles: ' + type);
        into.push({ css: item.css, order: item.order == null ? 100000 : item.order });
      }
    }
    collect(definition.styles, styles);
    collect(definition.editorStyles, editorStyles);
  }
  return { features, styles, editorStyles, iconIds:context.FlowIcons ? Array.from(context.FlowIcons.ids).filter(id=>!context.FlowIcons.registry[id].legacy) : [] };
}
function readStyles(name, root = sourceRoot) {
  let source = fs.readFileSync(path.join(root, name), 'utf8');
  const inventory = manifest(root).assets || {};
  const key = Object.keys(inventory.styles || {}).find(key => inventory.styles[key] === name);
  const shared = ((inventory.sharedStyles || {})[key] || []).map(file => fs.readFileSync(path.join(root,file),'utf8')).join('\n');
  if (shared) source += '\n' + shared;
  const assets = panelAssets(root);
  const entries = name === 'style.workbench.css' ? assets.editorStyles : assets.styles;
  if (source.includes('/* @panel-style-order:')) {
    const segments = source.split(/\/\* @panel-style-order:(\d+) \*\//);
    if (segments[0].trim()) entries.push({ css: segments[0], order: 0 });
    for (let i = 1; i < segments.length; i += 2)
      entries.push({ order: Number(segments[i]), css: segments[i + 1] });
    return entries
      .sort((a, b) => a.order - b.order)
      .map((item) => item.css)
      .join('\n');
  }
  const css = entries
    .sort((a, b) => a.order - b.order)
    .map((item) => item.css)
    .join('\n');
  if (source.includes('/* @panel-styles */')) return source.replace('/* @panel-styles */', css);
  return source + '\n' + css;
}
function fontAssets(profile, root = sourceRoot) {
  const assets = manifest(root).assets;
  if (!assets || !assets.fontProfiles.includes(profile)) throw new Error('Unknown font profile: ' + profile);
  const directory = path.dirname(assets.fonts);
  const fonts = JSON.parse(fs.readFileSync(path.join(root, assets.fonts), 'utf8'))
    .filter(font => font.profiles.includes(profile)).map(font => ({...font,
      file:directory + '/' + font.file, license:directory + '/' + font.license,
      data:fs.readFileSync(path.join(root, directory, font.file)).toString('base64')}));
  if (!fonts.length) throw new Error('Empty font profile: ' + profile);
  const licenses = [...new Set(fonts.map(font => font.license))].map(file => ({file,text:fs.readFileSync(path.join(root,file),'utf8')}));
  return {fonts, licenses};
}
function fontCss(profile, root = sourceRoot) {
  const {fonts,licenses} = fontAssets(profile, root);
  const licenseText = licenses.slice().sort((a,b) => a.file < b.file ? -1 : a.file > b.file ? 1 : 0).map(item => item.text).join('\n\n');
  return ['/* Bundled font licenses\n' + licenseText.replaceAll('*/','* /') + '\n*/', ...fonts.map(font =>
    "@font-face{font-family:'" + font.family + "';font-style:normal;font-weight:" + font.weight +
    ';font-display:swap;src:url(data:font/woff2;base64,' + font.data + ") format('woff2');}")].join('\n');
}
function iconAssets(root = sourceRoot) {
  const inventory = manifest(root).assets;
  const sprite = fs.readFileSync(path.join(root,inventory.icons),'utf8');
  if (!inventory.iconLibrary) return sprite;
  const context = {};
  vm.runInNewContext(fs.readFileSync(path.join(root,inventory.iconLibrary),'utf8'),context,{timeout:5000});
  return sprite.replace('</svg>', context.FlowIcons.symbols({newOnly:true}) + '</svg>');
}
function entrypointAssets(name, root = sourceRoot) {
  const entry = entrypoint(name, root), inventory = manifest(root).assets;
  return {styles:entry.styles.map(key => {
    const file = inventory.styles[key];
    if (!file) throw new Error('Unknown style input: ' + key);
    return {key,file,source:key === 'core' || key === 'workbench' ? readStyles(file,root) : fs.readFileSync(path.join(root,file),'utf8')};
  }),icons:entry.icons ? iconAssets(root) : '',
    ...(entry.fonts ? fontAssets(entry.fonts,root) : {fonts:[],licenses:[]})};
}
module.exports = { companyDir, companyConfig, companyAgentContext, packageManifest, sitePackageSelection, enabledPackages, sourcePath, sourceFiles, sourceRecords, composeSources, readSource, entrypoint, moduleSource,
  panelAssets, readStyles, fontAssets, fontCss, entrypointAssets };
if (require.main === module) {
  const [mode, ...names] = process.argv.slice(2);
  if (mode === '--assets') process.stdout.write(JSON.stringify(panelAssets()));
  else if (mode === '--packages' && !names.length) process.stdout.write(JSON.stringify(enabledPackages()));
  else if (mode === '--company' && !names.length) process.stdout.write(JSON.stringify(companyConfig()));
  else if (mode === '--agent-context' && !names.length) process.stdout.write(JSON.stringify(companyAgentContext()));
  else if (mode === '--styles' && names.length === 1) process.stdout.write(readStyles(names[0]));
  else if (mode === '--sources' && names.length) process.stdout.write(composeSources(names));
  else if (mode === '--files' && names.length === 1) process.stdout.write(JSON.stringify(sourceFiles(names[0])));
  else if (mode === '--entrypoint' && names.length === 1) process.stdout.write(JSON.stringify(entrypoint(names[0])));
  else if (mode === '--entry-assets' && names.length === 1) process.stdout.write(JSON.stringify(entrypointAssets(names[0])));
  else if (mode === '--font-css' && names.length === 1) process.stdout.write(fontCss(names[0]));
  else if (mode === '--module' && names.length === 2) process.stdout.write(moduleSource(names[0],names[1]));
  else throw new Error('usage: source-loader.cjs --entrypoint NAME | --entry-assets NAME | --module NAME esm|cjs | --sources SOURCES... | --files SOURCE | --font-css PROFILE | --assets | --company | --packages | --agent-context | --styles STYLESHEET');
}
