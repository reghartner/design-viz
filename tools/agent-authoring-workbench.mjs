#!/usr/bin/env node
/**
 * Keep real Workbench folder-agent clients alive for local authoring trials.
 * Only the native directory picker/handles are replaced. There is no agent
 * transport server, model invocation, or product JavaScript test hook.
 *
 * node tools/agent-authoring-workbench.mjs --output /tmp/new-trial --runs 6
 * Write run-01/control.json: {"seq":1,"text":"…","technicalLevel":"story"}.
 * Wait for control-result.json status "sent", then use the published session
 * folder and its real helper. Create output/shutdown.json to stop the broker.
 */
import {readFile, writeFile, mkdir, rename, rm, lstat, realpath, copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {createHash, randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const browserRequire = createRequire(new URL('./browser-tests/package.json', import.meta.url));
const origin = 'https://flowview-authoring-benchmark.test';
const maximumBytes = 8 * 1024 * 1024;
const exchangeFiles = new Set([
  'session.json', 'state.json', 'story.spec.json', 'request.json', 'proposal.json',
  'result.json', 'reply.json', 'progress.json', 'transcript.json', 'changes.json', 'preflight.json',
]);
export const defaultSource = JSON.stringify({page: {title: 'New story', blocks: [{id: 'story', heading: 'Story'}]}}, null, 2) + '\n';

function hash(value) { return createHash('sha256').update(value).digest('hex'); }
async function optionalRead(filename) {
  try { return await readFile(filename, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function readJson(filename) {
  const value = await optionalRead(filename);
  return value === null ? null : JSON.parse(value);
}
async function atomicWrite(filename, value) {
  const temporary = path.join(path.dirname(filename), '.broker-write-' + randomUUID());
  try {
    await writeFile(temporary, value, {flag: 'wx'});
    await rename(temporary, filename);
  } finally { await rm(temporary, {force: true}); }
}
async function writeJson(filename, value) { await atomicWrite(filename, JSON.stringify(value, null, 2) + '\n'); }
async function waitFor(check, description, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await delay(100);
  }
  throw new Error('Timed out waiting for ' + description);
}

export function validateControl(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Control must be an object.');
  if (Object.keys(value).some(key => !['seq', 'text', 'technicalLevel'].includes(key))) throw new Error('Unknown control field.');
  if (!Number.isSafeInteger(value.seq) || value.seq < 1) throw new Error('Control seq must be a positive safe integer.');
  if (typeof value.text !== 'string' || !value.text.trim() || value.text.length > 16000) throw new Error('Control text must contain 1–16000 characters.');
  const technicalLevel = value.technicalLevel ?? 'story';
  if (!['story', 'mixed', 'engineering'].includes(technicalLevel)) throw new Error('Unknown technicalLevel.');
  return {seq: value.seq, text: value.text.trim(), technicalLevel};
}

// Every path component stays under the chosen project, including pre-existing
// files supplied by a helper. Refuse symlinks rather than following them.
async function diskPath(projectPath, name) {
  if (typeof name !== 'string' || !name.startsWith('/')) throw new Error('Invalid exchange path.');
  const components = name.slice(1).split('/');
  if (components.some(part => !/^[\w.-]+$/.test(part) || part === '.' || part === '..')) throw new Error('Invalid exchange path component.');
  let target = projectPath;
  for (const part of components) {
    target = path.join(target, part);
    try {
      if ((await lstat(target)).isSymbolicLink()) throw new Error('Exchange symlinks are not supported.');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return target;
}

/** Connect a provided isolated page, using a newly created outDir. */
export async function createSession(page, outDir, options = {}) {
  outDir = path.resolve(outDir);
  await mkdir(outDir); // Never overwrite a previous trial, even when it is empty.
  const projectPath = path.join(await realpath(outDir), 'agent-project');
  await mkdir(projectPath);
  await mkdir(path.join(outDir, 'exchange-history'));
  const runId = options.runId ?? path.basename(outDir);
  const source = options.seedSource ?? defaultSource;
  if (typeof source !== 'string' || Buffer.byteLength(source) > 4 * 1024 * 1024) throw new Error('Seed must be a source string of at most 4 MiB.');
  JSON.parse(source);
  await writeFile(path.join(outDir, 'initial.spec.json'), source, {flag: 'wx'});
  const html = options.workbenchHtml ?? await readFile(path.join(root, 'workbench/flowspec.html'), 'utf8');
  const errors = options.diagnostics?.errors ?? [], unexpectedRequests = options.diagnostics?.unexpectedRequests ?? [], archiveHashes = new Map();
  let sessionPath, archiveSequence = 0, lastSequence = 0, lastControlBytes, closed = false;
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push({type: 'pageerror', message: error.message, at: Date.now()}));
  page.on('console', message => { if (message.type() === 'error') errors.push({type: 'console', message: message.text(), at: Date.now()}); });
  async function archive(name, bytes, operation) {
    if (!exchangeFiles.has(path.basename(name))) return;
    const digest = hash(bytes);
    if (archiveHashes.get(name) === digest) return;
    archiveHashes.set(name, digest);
    const sequence = ++archiveSequence;
    const filename = String(sequence).padStart(6, '0') + '-' + path.basename(name);
    await writeFile(path.join(outDir, 'exchange-history', filename), bytes, {flag: 'wx'});
    await writeJson(path.join(outDir, 'exchange-history', filename + '.meta.json'), {sequence, filename, name, operation, sha256: digest, at: Date.now()});
  }
  await page.exposeBinding('authoringDisk', async (_, operation, name, value) => {
    const target = await diskPath(projectPath, name);
    if (operation === 'directory') {
      if (value?.create) await mkdir(target, {recursive: false}).catch(error => { if (error.code !== 'EEXIST') throw error; });
      if (!(await lstat(target)).isDirectory()) throw new Error('Not a directory.');
      if (path.dirname(target) === projectPath && /^flowview-session-[\w-]+$/.test(path.basename(target))) sessionPath = target;
      return true;
    }
    if (operation === 'exists') {
      try { return (await lstat(target)).isFile(); }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
    }
    if (operation === 'read') {
      if ((await lstat(target)).size > maximumBytes) throw new Error('Exchange file exceeds 8 MiB.');
      const bytes = await readFile(target, 'utf8');
      await archive(name, bytes, 'read');
      return bytes;
    }
    if (operation === 'write') {
      if (typeof value !== 'string' || Buffer.byteLength(value) > maximumBytes) throw new Error('Invalid exchange write.');
      await atomicWrite(target, value);
      await archive(name, value, 'write');
      return;
    }
    if (operation === 'remove' && /^state-[\w-]{1,120}\.json$/.test(path.basename(target))) {
      await rm(target); return;
    }
    throw new Error('Unsupported exchange operation: ' + operation);
  });
  await page.addInitScript(() => {
    localStorage.setItem('dv_tour_v1', 'done');
    function validName(name) {
      if (typeof name !== 'string' || !/^[\w.-]+$/.test(name) || name === '.' || name === '..') throw new TypeError('Use a plain filename.');
    }
    function directory(name) {
      return {
        kind: 'directory', name: name.split('/').pop() || 'Authoring agent project',
        async queryPermission() { return 'granted'; },
        async requestPermission() { return 'granted'; },
        async getDirectoryHandle(child, options) {
          validName(child);
          await window.authoringDisk('directory', name + '/' + child, {create: options?.create === true});
          return directory(name + '/' + child);
        },
        async getFileHandle(child, options) {
          validName(child);
          const filename = name + '/' + child;
          if (!options?.create && !await window.authoringDisk('exists', filename)) throw new DOMException('Missing file', 'NotFoundError');
          return {
            kind: 'file', name: child,
            async getFile() { return new File([await window.authoringDisk('read', filename)], child); },
            async createWritable() {
              let value, aborted = false;
              return {
                async write(text) { if (aborted) throw new Error('Aborted'); value = text; },
                async close() { if (!aborted) await window.authoringDisk('write', filename, value); },
                async abort() { aborted = true; },
              };
            },
          };
        },
        async removeEntry(child) {
          validName(child);
          if (!await window.authoringDisk('exists', name + '/' + child)) throw new DOMException('Missing file', 'NotFoundError');
          await window.authoringDisk('remove', name + '/' + child);
        },
      };
    }
    window.showDirectoryPicker = async () => directory('');
  });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (route.request().method() !== 'GET' || url.origin !== origin || !['/index.html', '/catalog.json', '/starters.json'].includes(url.pathname)) {
      unexpectedRequests.push({url: url.href, method: route.request().method(), at: Date.now()});
      await route.abort(); return;
    }
    await route.fulfill({contentType: url.pathname === '/index.html' ? 'text/html' : 'application/json', body: url.pathname === '/index.html' ? html : '[]'});
  });
  await page.goto(origin + '/index.html');
  await page.locator('#welcome-paste').click();
  await page.locator('#welcome-json').fill(source);
  await page.locator('#welcome-paste-form button[type=submit]').click();
  await page.locator('#editor-tab-agent').click();
  if (!await page.locator('#folder-agent-guide').isVisible()) await page.locator('#folder-agent-open-setup').click();
  await page.locator('#folder-agent-connect').click();
  await waitFor(() => page.locator('#folder-agent-send').isEnabled(), 'connected editor');
  if (await page.locator('#folder-agent-guide').isVisible()) await page.locator('#folder-agent-close-guide').click();
  if (!sessionPath) throw new Error('Editor did not create its session folder.');
  const manifest = await readJson(path.join(sessionPath, 'session.json'));
  const identity = {runId, outDir, projectPath, sessionPath, sessionId: manifest.sessionId, connectionId: manifest.connectionId};
  await writeJson(path.join(outDir, 'session-path.json'), {...identity, status: 'ready', readyAt: Date.now()});

  async function capture(status = 'ready') {
    const exactSource = await page.locator('#src').inputValue();
    await atomicWrite(path.join(outDir, 'final.spec.json'), exactSource);
    const copied = {}, captureErrors = [];
    for (const name of ['transcript.json', 'changes.json', 'state.json', 'request.json', 'result.json', 'reply.json']) {
      const bytes = await optionalRead(path.join(sessionPath, name));
      if (bytes !== null) {
        await atomicWrite(path.join(outDir, name), bytes);
        try { copied[name] = JSON.parse(bytes); }
        catch (error) { captureErrors.push({file: name, message: error.message}); }
      }
    }
    const messages = await page.locator('#folder-agent-messages .folder-agent-message').evaluateAll(elements => elements.map(element => ({
      role: element.querySelector('b')?.textContent === 'Claude' ? 'assistant' : 'user', text: element.querySelector('div')?.textContent,
    })));
    await writeJson(path.join(outDir, 'transcript-ui.json'), messages);
    const state = {...identity, status, lastSequence, capturedAt: Date.now(), sourceSha256: hash(exactSource),
      sendEnabled: await page.locator('#folder-agent-send').isEnabled(),
      connection: await page.locator('#folder-agent-connection').textContent(),
      errors: [...errors], unexpectedRequests: [...unexpectedRequests], captureErrors};
    await writeJson(path.join(outDir, 'browser-state.json'), state);
    const request = copied['request.json'], reply = copied['reply.json'], snapshot = copied['state.json'];
    const replyObserved = reply?.requestId === request?.id && messages.some(message => message.role === 'assistant' && message.text === reply?.text);
    // Written last: consumers wait for matching replyId, sendEnabled and
    // sourceMatchesState before treating these captured files as one phase.
    await writeJson(path.join(outDir, 'capture.json'), {requestId: request?.id ?? null,
      replyId: replyObserved ? reply.id : null, revision: snapshot?.revision ?? null,
      sourceSha256: state.sourceSha256, sourceMatchesState: snapshot?.source === exactSource,
      sendEnabled: state.sendEnabled, capturedAt: state.capturedAt, captureErrors});
    return state;
  }
  async function sendControl(raw) {
    const control = validateControl(raw);
    if (control.seq <= lastSequence) throw new Error('Control seq must increase; an existing sequence is never resent.');
    // Claim before interacting: a timeout after clicking must not duplicate an
    // already-published request on a later poll.
    lastSequence = control.seq;
    await waitFor(() => page.locator('#folder-agent-send').isEnabled(), 'previous reply', 15000);
    const previous = await readJson(path.join(sessionPath, 'request.json'));
    await page.locator('#folder-agent-level').selectOption(control.technicalLevel);
    await page.locator('#folder-agent-input').fill(control.text);
    await page.locator('#folder-agent-send').click();
    const request = await waitFor(async () => {
      const current = await readJson(path.join(sessionPath, 'request.json'));
      return current?.id !== previous?.id && current?.text === control.text && current?.technicalLevel === control.technicalLevel ? current : null;
    }, 'published request');
    const receipt = {seq: control.seq, status: 'sent', requestId: request.id, revision: request.revision, at: Date.now()};
    await writeJson(path.join(outDir, 'control-result.json'), receipt);
    await writeJson(path.join(outDir, 'control-' + control.seq + '.json'), {control, receipt});
    await capture();
    return receipt;
  }
  async function pollControl() {
    const bytes = await optionalRead(path.join(outDir, 'control.json'));
    if (bytes === null || bytes === lastControlBytes) return null;
    lastControlBytes = bytes;
    let raw;
    try {
      raw = JSON.parse(bytes);
      return await sendControl(raw);
    } catch (error) {
      const receipt = {seq: raw?.seq ?? null, status: 'error', message: error.message, at: Date.now()};
      await writeJson(path.join(outDir, 'control-result.json'), receipt);
      return receipt;
    }
  }
  async function close(status = 'stopped', {captureFinal = true} = {}) {
    if (closed) return;
    closed = true;
    const failures = [];
    async function attempt(label, action) {
      try { await action(); } catch (error) { failures.push(label + ': ' + error.message); }
    }
    if (!page.isClosed()) {
      if (captureFinal) await attempt('capture', () => capture(status));
      await attempt('screenshot', () => page.screenshot({path: path.join(outDir, 'final.png'), fullPage: false}));
      // A failed capture must not prevent ending the editor lease.
      await attempt('disconnect', async () => {
        const disconnect = page.locator('#folder-agent-disconnect');
        if (!await disconnect.isVisible()) await page.locator('#folder-agent-pairing > summary').click();
        if (await disconnect.isVisible() && await disconnect.isEnabled()) {
          await disconnect.click();
          await waitFor(async () => (await readJson(path.join(sessionPath, 'editor.json')))?.connected === false, 'disconnected lease');
        }
      });
      await attempt('close page', () => page.close());
    }
    await attempt('final lease', () => copyFile(path.join(sessionPath, 'editor.json'), path.join(outDir, 'editor-final.json')));
    if (failures.length) throw new Error(failures.join('\n'));
  }
  await capture();
  return {...identity, errors, unexpectedRequests, sendControl, pollControl, capture, close};
}

export async function runBroker({output, runs = 6, seedSource = defaultSource, maxMinutes = 45, shutdown}) {
  if (!Number.isInteger(runs) || runs < 1 || runs > 6) throw new Error('runs must be an integer from 1 to 6.');
  if (!Number.isFinite(maxMinutes) || maxMinutes <= 0 || maxMinutes > 45) throw new Error('max-minutes must be greater than zero and at most 45.');
  if (!output) throw new Error('--output is required.');
  output = path.resolve(output);
  await mkdir(output, {recursive: false});
  shutdown = path.resolve(shutdown ?? path.join(output, 'shutdown.json'));
  const startedAt = Date.now(), deadline = startedAt + maxMinutes * 60000;
  const {chromium} = browserRequire('@playwright/test');
  const browser = await chromium.launch({headless: true});
  const slots = [];
  let reason = 'shutdown', fatalError;
  let interrupted = false;
  const stop = () => { interrupted = true; };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
  async function publish(status) {
    await writeJson(path.join(output, 'broker-state.json'), {status, startedAt, deadline, shutdown, reason, error: fatalError?.message,
      failedRuns: slots.filter(slot => slot.status === 'failed').length,
      runs: slots.map(({runId, outDir, status, session, failure}) => ({runId, outDir, status, sessionPath: session?.sessionPath,
        error: failure?.message, stage: failure?.stage, diagnosticError: failure?.diagnosticError}))});
  }
  async function failRun(slot, error, stage) {
    if (slot.status === 'failed') return;
    slot.status = 'failed';
    const failure = slot.failure = {runId: slot.runId, status: 'failed', stage, at: Date.now(), message: error.message,
      stack: String(error.stack ?? '').slice(0, 16000), ...slot.diagnostics, cleanupErrors: []};
    // Preserve a failure marker even when the page never finished connecting.
    await mkdir(slot.outDir, {recursive: true});
    await writeJson(path.join(slot.outDir, 'failure.json'), failure);
    try { if (slot.session) await slot.session.close('failed', {captureFinal: false}); }
    catch (cleanup) { failure.cleanupErrors.push(cleanup.message); }
    try { if (slot.context) await slot.context.close(); }
    catch (cleanup) { failure.cleanupErrors.push(cleanup.message); }
    await writeJson(path.join(slot.outDir, 'failure.json'), failure);
    await writeJson(path.join(slot.outDir, 'browser-state.json'), {...failure, sendEnabled: false});
    await writeJson(path.join(slot.outDir, 'capture.json'), {status: 'failed', sendEnabled: false,
      sourceMatchesState: false, captureErrors: [{file: 'broker', message: error.message}], capturedAt: Date.now()});
    await writeJson(path.join(slot.outDir, 'session-path.json'), {runId: slot.runId, status: 'failed',
      sessionPath: slot.session?.sessionPath, projectPath: slot.session?.projectPath, message: error.message});
  }
  async function isolate(slot, stage, action) {
    try { await action(); }
    catch (error) {
      try { await failRun(slot, error, stage); }
      catch (diagnosticError) {
        // If the run directory itself is unwritable, the root record still
        // records the failure and healthy peers remain available.
        slot.status = 'failed';
        slot.failure ??= {message: error.message};
        slot.failure.diagnosticError = diagnosticError.message;
        try { if (slot.context) await slot.context.close(); } catch {}
      }
    }
  }
  try {
    const html = await readFile(path.join(root, 'workbench/flowspec.html'), 'utf8');
    await writeJson(path.join(output, 'manifest.json'), {version: 1, runs, startedAt, maxMinutes, workbenchSha256: hash(html), seedSha256: hash(seedSource),
      transport: 'local files', nativePicker: 'benchmark adapter', modelsLaunched: false, browserVersion: browser.version()});
    for (let index = 1; index <= runs; index++) {
      const runId = 'run-' + String(index).padStart(2, '0');
      const slot = {runId, outDir: path.join(output, runId), status: 'starting', diagnostics: {errors: [], unexpectedRequests: []}};
      slots.push(slot);
      await isolate(slot, 'startup', async () => {
        slot.context = await browser.newContext({viewport: {width: 1800, height: 1200}, reducedMotion: 'reduce', locale: 'en-US', timezoneId: 'UTC', serviceWorkers: 'block'});
        const page = await slot.context.newPage();
        slot.session = await createSession(page, slot.outDir, {runId, seedSource, workbenchHtml: html, diagnostics: slot.diagnostics});
        slot.status = 'ready';
      });
      await publish('starting');
    }
    await publish('ready');
    process.stdout.write(JSON.stringify({status: 'ready', output, sessions: slots.filter(slot => slot.status === 'ready').map(slot => slot.session.sessionPath)}) + '\n');
    let capturedAt = 0;
    while (!interrupted && Date.now() < deadline && await optionalRead(shutdown) === null) {
      const active = slots.filter(slot => slot.status === 'ready');
      if (!active.length) { reason = 'all-runs-failed'; break; }
      const shouldCapture = Date.now() - capturedAt >= 1000;
      await Promise.all(active.map(slot => isolate(slot, 'poll/capture', async () => {
        await slot.session.pollControl();
        if (shouldCapture) await slot.session.capture();
        if (slot.diagnostics.errors.length || slot.diagnostics.unexpectedRequests.length) throw new Error('Browser errors or unexpected network requests were recorded.');
      })));
      if (shouldCapture) { capturedAt = Date.now(); await publish('ready'); }
      await delay(250);
    }
    if (interrupted) reason = 'signal';
    else if (Date.now() >= deadline) reason = 'deadline';
  } catch (error) { fatalError = error; reason = 'error'; }
  finally {
    await Promise.all(slots.filter(slot => slot.status === 'ready').map(slot => isolate(slot, 'shutdown', async () => {
      await slot.session.close(reason);
      await slot.context.close();
      slot.status = 'stopped';
    })));
    await browser.close();
    process.off('SIGINT', stop); process.off('SIGTERM', stop);
    const failed = slots.filter(slot => slot.status === 'failed');
    if (failed.length && !fatalError) fatalError = new Error(failed.length + ' of ' + runs + ' runs failed; see each run’s failure.json and broker-state.json.');
    await publish(fatalError ? 'failed' : 'stopped');
  }
  if (fatalError) throw fatalError;
  return {output, reason};
}

async function main(args) {
  if (args.includes('--help')) {
    process.stdout.write('Usage: node tools/agent-authoring-workbench.mjs --output NEW_DIRECTORY [--runs 1..6] [--seed source.json] [--max-minutes 1..45] [--shutdown FILE]\nNo model calls. Default stop file: OUTPUT/shutdown.json.\n');
    return;
  }
  const values = {};
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!['--output', '--runs', '--seed', '--max-minutes', '--shutdown'].includes(flag) || !args[index + 1] || values[flag] !== undefined) throw new Error('Unknown, duplicate, or incomplete option: ' + flag);
    values[flag] = args[index + 1];
  }
  await runBroker({output: values['--output'], runs: values['--runs'] === undefined ? 6 : Number(values['--runs']),
    maxMinutes: values['--max-minutes'] === undefined ? 45 : Number(values['--max-minutes']), shutdown: values['--shutdown'],
    seedSource: values['--seed'] ? await readFile(values['--seed'], 'utf8') : defaultSource});
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { process.stderr.write(error.message + '\n'); process.exitCode = 1; });
}
