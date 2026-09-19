// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, it, expect, vi } from 'vitest';
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function boot(target: unknown) {
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
  vi.stubGlobal('blocksOf', () => [
    {
      type: 'section',
      sec: {
        diagram: {
          steps: [{ id: 'quiet' }, { id: 'persist' }, { id: 'failure' }],
        },
      },
    },
  ]);
  vi.stubGlobal('stepIndexOf', (ids: string[], id: string) => ids.indexOf(id));
  const port = { postMessage: vi.fn(), onmessage: null, close: vi.fn() };
  window.eval(readFileSync('viewer/frame.js', 'utf8'));
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: { type: 'flowview:init', spec: { skin: 'pastel' }, target },
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
