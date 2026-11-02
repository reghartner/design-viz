/* Git Compare revision reader (issue #849). Reads one local clone through git and pull
   requests through the gh CLI, both as child processes. Read-only except fetch(), which
   updates remote-tracking refs, and pull request heads, whose objects are fetched without
   creating any ref. The gh token is never requested or returned. */
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {statSync} from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {localGitEnvironment} from '../canon/local-git.mjs';

const exec = promisify(execFile);
const require = createRequire(import.meta.url);
export const PAGE_SIZE = 100;
const TABS = ['document', 'all', 'branches', 'tags', 'prs'];
const NOT_SIGNED_IN = 'Not signed in to GitHub. Run: gh auth login';

function badInput(message){ return Object.assign(new Error(message), {code:'BAD_INPUT'}); }
const immutable = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(value);
/* A repository-relative file path: no absolute paths, empty, '.' or '..' segments, or control characters. */
export function relativePath(file){
  if (typeof file !== 'string' || !file || file.startsWith('/') || file.split('/').some(p => !p || p === '.' || p === '..') || /[\\\x00-\x1f]/.test(file))
    throw badInput('Document path must be a repository-relative file.');
  return file;
}
const isoDate = value => { const d = new Date(value); return isNaN(d) ? null : d.toISOString().replace('.000Z', 'Z'); };

async function defaultGh(args, directory){
  const {stdout} = await exec('gh', args, {cwd:directory, encoding:'utf8', maxBuffer:16_000_000, timeout:30000});
  return stdout;
}
let engineContext = null;
/* The shared compare engine (validator.js + canon.js logical bundles), as the compare tests load it. */
function engine(){
  if (engineContext) return engineContext;
  const {readSource} = require('../source-loader.cjs');
  const C = {URL, console}; vm.createContext(C);
  vm.runInContext(readSource('validator.js'), C); vm.runInContext(readSource('canon.js'), C);
  return engineContext = C;
}

export class GitRevisions {
  constructor({directory, gh, remote = 'origin'}){
    if (typeof directory !== 'string' || !directory) throw new Error('GitRevisions needs the clone directory.');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) throw new Error('Remote name must be a plain name.');
    this.directory = path.resolve(directory);
    this.ghRun = gh ? args => gh(args) : args => defaultGh(args, this.directory);
    this.remote = remote;
  }
  async git(args, options){
    /* core.quotePath=false: paths with non-ASCII characters are printed as-is, not quoted. */
    const {stdout} = await exec('git', ['--no-pager', '-c', 'core.quotePath=false', '-C', this.directory, ...args],
      Object.assign({encoding:'utf8', maxBuffer:64_000_000, timeout:60000, env:localGitEnvironment()}, options || {}));
    return stdout;
  }
  async gitOk(args){ try{ await this.git(args); return true; }catch(ex){ return false; } }

  /* ---------- status ---------- */
  async status(){
    let lastFetch = null;
    try{
      const file = path.resolve(this.directory, (await this.git(['rev-parse', '--git-path', 'FETCH_HEAD'])).trim());
      lastFetch = new Date(statSync(file).mtimeMs).toISOString();
    }catch(ex){ lastFetch = null; }
    let gh;
    try{
      const user = JSON.parse(await this.ghRun(['api', 'user']));
      gh = {signedIn:true, login:String(user.login)};
    }catch(ex){ gh = {signedIn:false, login:null, command:'gh auth login'}; }
    return {path:this.directory, lastFetch, gh};
  }

  /* ---------- names ---------- */
  async pullRequests(){
    const out = await this.ghRun(['pr', 'list', '--state', 'all', '--limit', '200', '--json', 'number,title,headRefName,headRefOid,author,updatedAt,state,mergeCommit']);
    const list = JSON.parse(out);
    if (!Array.isArray(list)) throw new Error('gh pr list returned no list.');
    return list.filter(p => p && Number.isInteger(p.number) && immutable(String(p.headRefOid || '')));
  }
  async hasCommit(sha){ return this.gitOk(['cat-file', '-e', sha + '^{commit}']); }
  /* A branch, tag, (short) SHA or pr:<number> to a full commit SHA. A pull request head that is not
     in the clone has its objects fetched without creating a ref or writing FETCH_HEAD. */
  async resolve(name){
    if (typeof name !== 'string' || !name) throw badInput('Unknown revision: (empty)');
    const pr = /^pr:(\d+)$/.exec(name);
    if (pr){
      let list;
      try{ list = await this.pullRequests(); }catch(ex){ throw badInput(NOT_SIGNED_IN); }
      const hit = list.find(p => p.number === Number(pr[1]));
      if (!hit) throw badInput('Unknown revision: ' + name);
      const sha = hit.headRefOid;
      if (!(await this.hasCommit(sha))){
        /* No destination and an empty --refmap: objects only, no ref is created or updated. */
        await this.git(['fetch', '--quiet', '--no-write-fetch-head', '--no-tags', '--refmap=', this.remote, 'refs/pull/' + Number(pr[1]) + '/head']).catch(() => null);
        if (!(await this.hasCommit(sha))) throw badInput('Pull request #' + pr[1] + ' is not available locally.');
      }
      return sha;
    }
    if (!/^[A-Za-z0-9][A-Za-z0-9._\/-]*$/.test(name) || name.includes('..') || name.endsWith('.lock')) throw badInput('Unknown revision: ' + name);
    let sha = '';
    try{ sha = (await this.git(['rev-parse', '--verify', '--quiet', name + '^{commit}'])).trim(); }catch(ex){ sha = ''; }
    if (!immutable(sha)) throw badInput('Unknown revision: ' + name);
    return sha;
  }

  /* ---------- commit listing ---------- */
  async decorations(){
    const out = await this.git(['for-each-ref', '--format=%(objectname)%00%(*objectname)%00%(refname)', 'refs/heads', 'refs/remotes', 'refs/tags']);
    const branches = new Map(), tags = new Map();
    const add = (map, sha, name) => { if (!map.has(sha)) map.set(sha, []); map.get(sha).push(name); };
    out.split('\n').filter(Boolean).forEach(line => {
      const [obj, peeled, ref] = line.split('\0'), sha = peeled || obj;
      if (ref.startsWith('refs/heads/')) add(branches, sha, ref.slice(11));
      else if (ref.startsWith('refs/remotes/')){ if (!ref.endsWith('/HEAD')) add(branches, sha, ref.slice(13)); }
      else if (ref.startsWith('refs/tags/')) add(tags, sha, ref.slice(10));
    });
    for (const map of [branches, tags]) for (const list of map.values()) list.sort();
    return {branches, tags};
  }
  /* Every commit (or those in a range) with author date, author, subject, first parent and the files
     its first-parent diff changes. */
  async commits(range){
    const args = ['log', '--date-order', '--diff-merges=first-parent', '--name-only', '--no-renames',
      '--format=%x1e%H%x1f%P%x1f%aI%x1f%an%x1f%s%x1f'];
    if (range) args.push(range, '--'); else args.push('--all', '--');
    const out = await this.git(args);
    return out.split('\x1e').filter(Boolean).map(block => {
      const [sha, parents, date, author, subject, files] = block.split('\x1f');
      return {sha, parent:(parents || '').split(' ').filter(Boolean)[0] || null, date:isoDate(date), author, subject,
        files:new Set((files || '').split('\n').map(s => s.trim()).filter(Boolean))};
    });
  }
  /* Files one commit's first-parent diff changes (all files for a root commit). */
  async changedFiles(sha){
    const out = await this.git(['diff-tree', '--root', '--no-commit-id', '-r', '--name-only', '--no-renames', '-z', '-m', '--first-parent', sha]);
    return new Set(out.split('\0').filter(Boolean));
  }
  async prBadges(){
    const badges = new Map();
    let list = [];
    try{ list = await this.pullRequests(); }catch(ex){ list = []; }
    const add = (sha, n) => { if (!sha) return; if (!badges.has(sha)) badges.set(sha, []); if (!badges.get(sha).includes(n)) badges.get(sha).push(n); };
    list.forEach(p => { add(p.headRefOid, p.number); add(p.mergeCommit && p.mergeCommit.oid, p.number); });
    for (const v of badges.values()) v.sort((a, b) => a - b);
    return badges;
  }
  async revisions({doc, tab = 'document', q = '', page = 1} = {}){
    relativePath(doc);
    if (!TABS.includes(tab)) throw badInput('Unknown tab: ' + tab);
    page = Math.max(1, Number.parseInt(page, 10) || 1);
    let rows, error;
    if (tab === 'prs'){
      let list = null;
      try{ list = await this.pullRequests(); }catch(ex){ error = NOT_SIGNED_IN; }
      rows = [];
      if (list){
        list.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)) || b.number - a.number);
        const [commits, deco] = await Promise.all([this.commits(), this.decorations()]), known = new Map(commits.map(c => [c.sha, c]));
        for (const p of list){
          const sha = p.headRefOid, local = known.get(sha), available = await this.hasCommit(sha);
          /* A head present only as objects (a fetched pull request) is not on any ref: diff it directly. */
          const touches = local ? local.files.has(doc) : available ? (await this.changedFiles(sha)).has(doc) : false;
          rows.push({sha, short:sha.slice(0, 7), date:isoDate(p.updatedAt), author:String(p.author && p.author.login || ''), subject:String(p.title || ''),
            branches:deco.branches.get(sha) || [], tags:deco.tags.get(sha) || [], prs:[p.number], touches, available});
        }
      }
    } else {
      const [commits, deco, prs] = await Promise.all([this.commits(), this.decorations(), this.prBadges()]);
      const row = c => ({sha:c.sha, short:c.sha.slice(0, 7), date:c.date, author:c.author, subject:c.subject,
        branches:deco.branches.get(c.sha) || [], tags:deco.tags.get(c.sha) || [], prs:prs.get(c.sha) || [], touches:c.files.has(doc), available:true});
      if (tab === 'all') rows = commits.map(row);
      else if (tab === 'document') rows = commits.filter(c => c.files.has(doc)).map(row);
      else {
        const map = tab === 'branches' ? deco.branches : deco.tags, byName = new Map(commits.map(c => [c.sha, c]));
        rows = [...map.keys()].filter(sha => byName.has(sha)).map(sha => row(byName.get(sha))).sort((a, b) => (tab === 'branches' ? a.branches[0] : a.tags[0]).localeCompare(tab === 'branches' ? b.branches[0] : b.tags[0]));
      }
    }
    const needle = String(q || '').trim().toLowerCase();
    if (needle) rows = rows.filter(r => [r.subject, r.author, r.sha, ...r.branches, ...r.tags, ...r.prs.map(n => '#' + n)].some(v => String(v).toLowerCase().includes(needle)));
    const total = rows.length, pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const out = {rows:rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), page, pages, total};
    if (error) out.error = error;
    return out;
  }
  /* Commits after From up to To whose first-parent diff changes the document, newest first. */
  async between({from, to, doc}){
    relativePath(doc);
    const a = await this.resolve(from), b = await this.resolve(to);
    const [commits, prs] = await Promise.all([this.commits(a + '..' + b), this.prBadges()]);
    return commits.filter(c => c.files.has(doc)).map(c => ({sha:c.sha, short:c.sha.slice(0, 7), parent:c.parent, date:c.date, author:c.author, subject:c.subject, prs:prs.get(c.sha) || []}));
  }

  /* ---------- documents ---------- */
  async documents(rev){
    const sha = immutable(rev) ? rev : await this.resolve(rev);
    const out = await this.git(['ls-tree', '-r', '--name-only', '-z', sha]);
    return out.split('\0').filter(f => f && f.endsWith('.spec.json')).sort();
  }
  async changedDocuments(from, to){
    const a = immutable(from) ? from : await this.resolve(from), b = immutable(to) ? to : await this.resolve(to);
    const out = await this.git(['diff', '--name-status', '--no-renames', '-z', a, b, '--', '*.spec.json']);
    const parts = out.split('\0').filter(Boolean), list = [];
    for (let i = 0; i + 1 < parts.length; i += 2){
      const status = {A:'added', D:'removed'}[parts[i][0]] || 'modified';
      list.push({path:parts[i + 1], status});
    }
    return list.sort((x, y) => x.path.localeCompare(y.path));
  }
  async blob(sha, file){
    if (!(await this.gitOk(['cat-file', '-e', sha + ':' + file]))) return null;
    return this.git(['cat-file', 'blob', sha + ':' + file]);
  }
  /* One side of a comparison: the document at that commit and every spec of the same commit (the
     import resolution context), or null when the document does not exist there. */
  async side(rev, doc){
    if (!immutable(rev)) throw badInput('Revision must be an immutable full commit SHA.');
    relativePath(doc);
    const text = await this.blob(rev, doc);
    if (text == null) return null;
    let raw;
    try{ raw = JSON.parse(text); }catch(ex){ throw badInput('Document is not valid JSON at ' + rev.slice(0, 7) + ': ' + doc); }
    const specs = [];
    for (const file of await this.documents(rev)){
      try{ specs.push(file === doc ? raw : JSON.parse(await this.blob(rev, file))); }catch(ex){ /* a spec that is not JSON cannot be a provider */ }
    }
    const id = raw && raw.page && raw.page.canon && raw.page.canon.id || doc;
    return {raw, context:{version:1, id, specs}};
  }
  /* The shared engine's change list for one document between two revisions. */
  async compareRevisions(from, to, doc){
    const a = immutable(from) ? from : await this.resolve(from), b = immutable(to) ? to : await this.resolve(to);
    const [sa, sb] = await Promise.all([this.side(a, doc), this.side(b, doc)]);
    const C = engine(), copy = v => JSON.parse(JSON.stringify(v));
    const build = s => s ? {authored:C.normalize(copy(s.raw)), resolved:C.normalize(C.FlowTopology.resolveSource(copy(s.raw), copy(s.context))), ledger:null} : null;
    return JSON.parse(JSON.stringify(C.compareDocuments(build(sa), build(sb))));
  }

  /* ---------- the one write ---------- */
  async fetch(){
    /* An explicit refspec into refs/remotes/<remote>/ and an empty --refmap, so a repository-configured
       fetch refspec cannot write anywhere else. */
    await this.git(['fetch', '--quiet', '--prune', '--no-tags', '--refmap=', this.remote, '+refs/heads/*:refs/remotes/' + this.remote + '/*']);
    return this.status();
  }
}
