// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, it, expect, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function spec() {
  return {
    skin: 'pastel',
    canon: { version: 1, id: 'recording', kind: 'canonical', owner: 'group:home/team' },
    sections: [{
      heading: 'Recording',
      diagram: {
        nodes: { cloud: { binding: { entityRef: 'component:home/recording' } } },
        rows: [['cloud']],
        steps: ['quiet', 'persist', 'failure'].map(id => ({ id, nodes: ['cloud'] })),
        paths: [{ id: 'happy', steps: ['quiet', 'persist'] }, { id: 'failed', steps: ['failure'] }],
        layouts: [{ id: 'business', name: 'Business', steps: ['persist'],
          sectionLayout: { default: [{ x: 0, y: 0, w: 12, h: 12 }] } }],
        defaultLayout: 'business',
      },
    }],
  };
}
function boot(target: unknown, page = spec()) {
  document.body.innerHTML =
    '<div id="viewer-error" hidden></div><div id="docview"><p>Valid diagram</p></div>';
  const stepper = {
    path: () => 'happy',
    paths: () => [
      { id: 'happy', indices: [0, 1] },
      { id: 'failed', indices: [2] },
    ],
    selectPath: vi.fn(() => false),
    jumpSource: vi.fn(() => true),
  };
  const controller = {
    sections: [
      {
        reference: 'recording',
        stepper,
        sectionEl: { scrollIntoView: vi.fn() },
      },
    ],
    steppers: [],
    destroy: vi.fn(),
  };
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
    }
  );
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('normalize', (v: unknown) => v);
  vi.stubGlobal('validate', () => ({ errors: [], warnings: [] }));
  vi.stubGlobal('SKIN_NAMES', ['pastel']);
  vi.stubGlobal('applySkinClasses', () => {});
  vi.stubGlobal('FlowCanon', { http: () => null });
  vi.stubGlobal('renderPage', () => controller);
  // This copied-plugin unit test supplies the core contract. The repository's
  // canon-entities suite covers real index -> core -> frame integration.
  vi.stubGlobal('sectionRecords', () => [{ reference: 'recording', section: page.sections[0] }]);
  vi.stubGlobal('resolveSourceStep', (_source: unknown, pathId: string, stepRef: string) => {
    const path = stepper.paths().find(p => p.id === pathId);
    const indices: Record<string, number> = { quiet: 0, persist: 1, failure: 2 };
    return path ? { path, sourceIndex: indices[stepRef] ?? -1 } : null;
  });
  const port = { postMessage: vi.fn(), onmessage: null, close: vi.fn() };
  window.eval(readFileSync('viewer/frame.js', 'utf8'));
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: { type: 'flowview:init', spec: page, target },
      ports: [port as unknown as MessagePort],
    })
  );
  return { port, controller, stepper };
}
it('invalid initial navigation reports a recoverable error and preserves a valid render', () => {
  const { controller, port } = boot({
    section: 'recording',
    path: 'happy',
    step: 'deleted',
  });
  expect(port.postMessage).toHaveBeenCalledWith({
    type: 'rendered',
    warnings: [],
  });
  expect(port.postMessage).toHaveBeenCalledWith({
    type: 'navigation-error',
    message: expect.stringContaining('no longer'),
  });
  expect(controller.destroy).not.toHaveBeenCalled();
  expect(document.getElementById('docview')?.textContent).toBe('Valid diagram');
  expect(document.getElementById('viewer-error')?.hidden).toBe(true);
});
it.each([
  { path: 'happy', step: 'persist', source: 1 },
  { path: 'failed', step: 'failure', source: 2 },
])(
  'previews the exact source step on $path, including an entirely hidden alternate',
  ({ path, step, source }) => {
    const { stepper, port } = boot({ section: 'recording', path, step });
    expect(stepper.jumpSource).toHaveBeenCalledWith(source, path);
    expect(stepper.selectPath).not.toHaveBeenCalled();
    expect(
      port.postMessage.mock.calls.some(
        ([message]) => message.type === 'navigation-error'
      )
    ).toBe(false);
  }
);
it('keeps the recoverable refusal for a path-only request with no visible steps', () => {
  const { stepper, port } = boot({ section: 'recording', path: 'failed' });
  expect(stepper.selectPath).toHaveBeenCalledWith('failed');
  expect(stepper.jumpSource).not.toHaveBeenCalled();
  expect(port.postMessage).toHaveBeenCalledWith({
    type: 'navigation-error',
    message: expect.stringContaining('no visible steps'),
  });
});
