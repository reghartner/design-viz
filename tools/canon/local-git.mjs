import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import path from 'node:path';
import {devNull} from 'node:os';
import C from './core.cjs';
const exec = promisify(execFile);
const immutable = value => typeof value === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/i.test(value);

export function localGitEnvironment() {
  const env={...process.env};
  for(const key of Object.keys(env))if(key.startsWith('GIT_'))delete env[key];
  return {...env,GIT_CONFIG_NOSYSTEM:'1',GIT_CONFIG_GLOBAL:devNull,GIT_TERMINAL_PROMPT:'0'};
}

// Explicit repository URL -> checkout mapping. Reads Git objects only: no
// checkout, fetch, hooks, filters, text conversion, or watched-code execution.
export class LocalGitSources {
  constructor(repositories) {
    this.repositories = new Map(Object.entries(repositories).map(([url, directory]) => {
      if (!C.http(url) || typeof directory !== 'string' || !directory) throw new Error('Local sources require repository URLs mapped to checkout directories.');
      return [url, path.resolve(directory)];
    }));
  }
  async git(repository, args) {
    const directory = this.repositories.get(repository);
    if (!directory) throw new Error('Repository is outside the configured local sources.');
    const {stdout} = await exec('git', ['--no-pager','-C',directory,...args], {encoding:'utf8',maxBuffer:2_000_000,timeout:10000,env:localGitEnvironment()});
    return stdout;
  }
  async head(repository) {
    const revision = (await this.git(repository, ['rev-parse','--verify','HEAD^{commit}'])).trim();
    if (!immutable(revision)) throw new Error('HEAD did not resolve to an immutable commit.');
    return revision;
  }
  async file(repository, revision, filename) {
    if (!immutable(revision)) throw new Error('Source revision must be an immutable full commit SHA.');
    if (typeof filename !== 'string' || !filename || filename.startsWith('/') || filename.split('/').some(p=>!p || p==='.' || p==='..') || /[\\\x00-\x1f]/.test(filename)) throw new Error('Source path must be a repository-relative file.');
    return this.git(repository, ['cat-file','blob',revision+':'+filename]);
  }
}
