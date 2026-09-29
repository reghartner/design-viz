import {test, expect} from '@playwright/test';
import {mkdtemp, readFile, writeFile, readdir, rm, mkdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {createSession, defaultSource, validateControl, runBroker} from '../../agent-authoring-workbench.mjs';

test('authoring broker connects the real editor, sends once, applies helper output and captures exact evidence without a model', async ({page}) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'flowview-authoring-broker-'));
  const outDir = path.join(directory, 'run-01');
  let session;
  try {
    session = await createSession(page, outDir);
    const ready = JSON.parse(await readFile(path.join(outDir, 'session-path.json'), 'utf8'));
    expect(ready.status).toBe('ready');
    expect(path.dirname(ready.sessionPath)).toBe(ready.projectPath);
    expect(await page.locator('#src').inputValue()).toBe(defaultSource);
    const read = async name => JSON.parse(await readFile(path.join(session.sessionPath, name), 'utf8'));
    const helper = (...args) => JSON.parse(execFileSync('python3', [path.join(session.sessionPath, 'folder-agent.py'), ...args], {cwd: session.sessionPath, encoding: 'utf8'}));
    const control = {seq: 1, text: 'Set the page title to Customer onboarding.', technicalLevel: 'story'};
    await expect(page.locator('#folder-agent-detail-summary')).toBeVisible();
    await expect(page.locator('#folder-agent-level')).toBeHidden();
    await writeFile(path.join(outDir, 'control.json'), JSON.stringify(control));
    const sent = await session.pollControl();
    expect(sent).toMatchObject({seq: 1, status: 'sent'});
    await expect(page.locator('#folder-agent-level')).toBeHidden();
    const request = await read('request.json');
    expect(request).toMatchObject({id: sent.requestId, text: control.text, technicalLevel: 'story'});
    expect(await session.pollControl()).toBeNull();
    await expect(session.sendControl({...control, text: 'Do not send this duplicate.'})).rejects.toThrow(/seq must increase/);
    expect((await read('request.json')).id).toBe(request.id);
    // A partially written/malformed agent reply is evidence, not a reason for
    // the broker to terminate every independently running authoring session.
    await writeFile(path.join(session.sessionPath, 'reply.json'), '{broken');
    const malformed = await session.capture();
    expect(malformed.captureErrors).toEqual([expect.objectContaining({file: 'reply.json'})]);
    expect(await readFile(path.join(outDir, 'reply.json'), 'utf8')).toBe('{broken');
    const source = JSON.stringify({page: {title: 'Customer onboarding', blocks: [{id: 'story', heading: 'Story'}]}}, null, 3) + '\n';
    await writeFile(path.join(session.sessionPath, 'candidate.spec.json'), source);
    await writeFile(path.join(session.sessionPath, 'candidate.ledger.md'), '# Coverage ledger\n\nPage title follows the requested wording.\n');
    const proposal = helper('propose', '--ledger', 'candidate.ledger.md', '--request', request.id, '--revision', sent.revision, '--file', 'candidate.spec.json', '--summary', 'Set the requested page title.');
    await expect(page.locator('#agent-update-open')).toBeVisible();
    await expect(page.locator('#src')).toHaveValue(defaultSource);
    await page.locator('#agent-update-open').click();
    await page.locator('#agent-update-commit').click();
    await expect.poll(async () => {
      try { return (await read('result.json')).id; }
      catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }).toBe(proposal.id);
    expect((await read('result.json')).status).toBe('applied');
    helper('reply', '--request', request.id, '--text', 'Set the page title to Customer onboarding.');
    await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await expect(page.locator('#src')).toHaveValue(source);
    const captured = await session.capture();
    expect(captured.errors).toEqual([]);
    expect(captured.unexpectedRequests).toEqual([]);
    expect(captured.captureErrors).toEqual([]);
    const marker = JSON.parse(await readFile(path.join(outDir, 'capture.json'), 'utf8'));
    expect(marker).toMatchObject({requestId: request.id, replyId: (await read('reply.json')).id,
      sourceSha256: captured.sourceSha256, sourceMatchesState: true, sendEnabled: true});
    expect(await readFile(path.join(outDir, 'final.spec.json'), 'utf8')).toBe(source);
    expect(JSON.parse(await readFile(path.join(outDir, 'changes.json'), 'utf8')).changes).toEqual(expect.arrayContaining([expect.objectContaining({id: proposal.id, status: 'applied'})]));
    expect(JSON.parse(await readFile(path.join(outDir, 'transcript.json'), 'utf8')).messages).toEqual(expect.arrayContaining([expect.objectContaining({role: 'assistant', requestId: request.id})]));
    const archived = await readdir(path.join(outDir, 'exchange-history'));
    expect(archived.some(name => /-proposal\.json$/.test(name))).toBe(true);
    expect(archived.some(name => /-result\.json$/.test(name))).toBe(true);
    await session.close();
    expect(JSON.parse(await readFile(path.join(outDir, 'editor-final.json'), 'utf8')).connected).toBe(false);
    await expect(createSession(page, outDir)).rejects.toThrow(/EEXIST/);
  } finally {
    if (session) await session.close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('question-only first turn integrates with the author runner before any change history exists', async ({page}) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'flowview-authoring-questions-'));
  const outDir = path.join(directory, 'run-01');
  let session;
  try {
    session = await createSession(page, outDir);
    const sent = await session.sendControl({seq: 1, text: 'Ask me who this story is for before making any changes.', technicalLevel: 'story'});
    const helper = (...args) => JSON.parse(execFileSync('python3', [path.join(session.sessionPath, 'folder-agent.py'), ...args], {cwd: session.sessionPath, encoding: 'utf8'}));
    helper('progress', '--request', sent.requestId, '--text', 'I am reading the story before asking questions.');
    const question = 'Who is the audience, and should the story focus on business outcomes or engineering details?';
    const reply = helper('reply', '--request', sent.requestId, '--text', question);
    await expect(page.locator('#folder-agent-send')).toBeEnabled();
    await expect(page.locator('#folder-agent-messages')).toContainText(question);
    await session.capture();
    for (const filename of ['changes.json', 'proposal.json', 'result.json']) {
      await expect(readFile(path.join(session.sessionPath, filename), 'utf8')).rejects.toMatchObject({code: 'ENOENT'});
      await expect(readFile(path.join(outDir, filename), 'utf8')).rejects.toMatchObject({code: 'ENOENT'});
    }
    const runner = fileURLToPath(new URL('../../agent-authoring-eval.py', import.meta.url));
    const captured = JSON.parse(execFileSync('python3', ['-c', `
import importlib.util, json, pathlib, sys, time
spec = importlib.util.spec_from_file_location('author_eval', sys.argv[1])
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)
run, session = pathlib.Path(sys.argv[2]), pathlib.Path(sys.argv[3])
manifest = json.loads((session / 'session.json').read_text())
owner = {key: manifest[key] for key in ['sessionId', 'connectionId']}
captured = runner.accepted_capture(run, session, owner, sys.argv[4], time.monotonic() + 2)
print(json.dumps({'replyId': captured['reply']['id'], 'source': captured['source'].decode(),
                  'receipts': captured['receipts'], 'proposal': captured['proposal']}))
`, runner, outDir, session.sessionPath, sent.requestId], {encoding: 'utf8', timeout: 5000}));
    expect(captured).toEqual({replyId: reply.id, source: defaultSource, receipts: [], proposal: null});
    // Sending collapses Detail again. The next turn must reopen the real UI
    // and publish the newly selected level, while an already open control
    // remains usable as well.
    for (const [index, technicalLevel] of ['engineering', 'mixed'].entries()) {
      await expect(page.locator('#folder-agent-level')).toBeHidden();
      if (technicalLevel === 'mixed') {
        await page.locator('#folder-agent-detail-summary').click();
        await expect(page.locator('#folder-agent-level')).toBeVisible();
      }
      const text = 'Keep the story unchanged and discuss it at ' + technicalLevel + ' detail.';
      const next = await session.sendControl({seq: index + 2, text, technicalLevel});
      expect(JSON.parse(await readFile(path.join(session.sessionPath, 'request.json'), 'utf8')))
        .toMatchObject({id: next.requestId, text, technicalLevel});
      expect(next.requestId).not.toBe(sent.requestId);
      await expect(page.locator('#folder-agent-level')).toBeHidden();
      helper('reply', '--request', next.requestId, '--text', 'The story is unchanged.');
      await expect(page.locator('#folder-agent-send')).toBeEnabled();
      await expect(page.locator('#src')).toHaveValue(defaultSource);
    }
    expect(session.errors).toEqual([]);
    expect(session.unexpectedRequests).toEqual([]);
  } finally {
    if (session) await session.close();
    await rm(directory, {recursive: true, force: true});
  }
});

test('broker rejects malformed control instructions before touching the editor', () => {
  for (const value of [null, [], {}, {seq: 0, text: 'Hi'}, {seq: 1.5, text: 'Hi'}, {seq: 1, text: ' '},
    {seq: 1, text: 'x'.repeat(16001)}, {seq: 1, text: 'Hi', technicalLevel: 'guess'},
    {seq: 1, text: 'Hi', command: 'shell'}]) expect(() => validateControl(value)).toThrow();
  expect(validateControl({seq: 2, text: ' Keep this story. '})).toEqual({seq: 2, text: 'Keep this story.', technicalLevel: 'story'});
});

test('a broken session is recorded while its healthy peer proposes an update awaiting review', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'flowview-authoring-isolation-'));
  const output = path.join(directory, 'trial');
  const running = runBroker({output, runs: 2, maxMinutes: 0.6}).then(value => ({value}), error => ({error}));
  const read = async filename => {
    try { return JSON.parse(await readFile(filename, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  try {
    await expect.poll(async () => (await read(path.join(output, 'broker-state.json')))?.status, {timeout: 20000}).toBe('ready');
    const broken = await read(path.join(output, 'run-01/session-path.json'));
    const healthy = await read(path.join(output, 'run-02/session-path.json'));
    await mkdir(path.join(broken.sessionPath, 'reply.json'));
    await expect.poll(async () => (await read(path.join(output, 'run-01/failure.json')))?.status).toBe('failed');
    await expect.poll(async () => (await read(path.join(output, 'broker-state.json')))?.failedRuns).toBe(1);
    expect((await read(path.join(output, 'run-01/failure.json'))).message).toMatch(/EISDIR/);
    expect((await read(path.join(output, 'run-02/browser-state.json'))).status).toBe('ready');
    const control = {seq: 1, text: 'Name this story Healthy peer.', technicalLevel: 'engineering'};
    await writeFile(path.join(output, 'run-02/control.json'), JSON.stringify(control));
    await expect.poll(async () => (await read(path.join(output, 'run-02/control-result.json')))?.status).toBe('sent');
    const sent = await read(path.join(output, 'run-02/control-result.json'));
    const source = defaultSource.replace('New story', 'Healthy peer');
    await writeFile(path.join(healthy.sessionPath, 'candidate.spec.json'), source);
    const helper = (...args) => JSON.parse(execFileSync('python3', [path.join(healthy.sessionPath, 'folder-agent.py'), ...args], {cwd: healthy.sessionPath, encoding: 'utf8'}));
    await writeFile(path.join(healthy.sessionPath, 'candidate.ledger.md'), '# Coverage ledger\n\nPage title follows the requested wording.\n');
    const proposal = helper('propose', '--ledger', 'candidate.ledger.md', '--request', sent.requestId, '--revision', sent.revision, '--file', 'candidate.spec.json', '--summary', 'Name the healthy story.');
    await expect.poll(async () => (await readdir(path.join(output, 'run-02/exchange-history'))).some(name => /-proposal\.json$/.test(name))).toBe(true);
    expect((await read(path.join(healthy.sessionPath, 'proposal.json'))).id).toBe(proposal.id);
    expect(await read(path.join(healthy.sessionPath, 'result.json'))).toBeNull();
    expect(await readFile(path.join(output, 'run-02/final.spec.json'), 'utf8')).toBe(defaultSource);
    expect((await read(path.join(output, 'run-02/browser-state.json'))).errors).toEqual([]);
    await writeFile(path.join(output, 'shutdown.json'), '{}');
    const outcome = await running;
    expect(outcome.error.message).toMatch(/1 of 2 runs failed/);
    const final = await read(path.join(output, 'broker-state.json'));
    expect(final.runs.map(run => run.status)).toEqual(['failed', 'stopped']);
    expect((await read(path.join(output, 'run-02/editor-final.json'))).connected).toBe(false);
  } finally {
    await writeFile(path.join(output, 'shutdown.json'), '{}').catch(() => {});
    await running;
    await rm(directory, {recursive: true, force: true});
  }
});
