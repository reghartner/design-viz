// @vitest-environment jsdom
import { afterEach, it, expect, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { InlineFlowview } from '../src/InlineFlowview';
import { FlowviewEntityDiagrams } from '../src/FlowviewEntityDiagrams';
import type { EntityDiagrams } from '../src/api';
vi.mock('../src/InlineFlowview', () => ({
  InlineFlowview: vi.fn(() => <div />),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
it('retains a service jump within its revision and discards it on a new publication', async () => {
  const data: EntityDiagrams = {
    version: 1,
    entityRef: 'component:home/recording',
    revision: 'index1',
    diagrams: [
      {
        id: 'doorbell',
        revision: 'r1',
        title: 'Doorbell',
        kind: 'canonical',
        owner: 'home',
        viewerUrl: 'https://test/view',
        editUrl: 'https://test/edit',
        sections: [
          {
            reference: 'recording',
            title: 'Recording',
            url: 'https://test/view',
            nodes: [],
            paths: [
              {
                id: 'failed',
                label: 'Failure',
                steps: [
                  {
                    id: 'drop',
                    position: 3,
                    title: 'Dropped',
                    url: 'https://test/view',
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
  const loader = vi.fn().mockResolvedValue(data),
    loadSpec = vi.fn();
  render(
    <FlowviewEntityDiagrams
      entityRef={data.entityRef}
      loadDiagrams={loader}
      loadSpec={loadSpec}
    />
  );
  fireEvent.click(await screen.findByRole('button', { name: '3. Dropped' }));
  const target = () => vi.mocked(InlineFlowview).mock.calls.at(-1)![0].target;
  expect(target()).toMatchObject({
    section: 'recording',
    path: 'failed',
    step: 'drop',
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh diagrams' }));
  await waitFor(() => expect(loader).toHaveBeenCalledTimes(2));
  await waitFor(() =>
    expect(
      screen.getByRole<HTMLButtonElement>('button', {
        name: 'Refresh diagrams',
      }).disabled
    ).toBe(false)
  );
  expect(target()?.step).toBe('drop');
  loader.mockResolvedValue({
    ...data,
    revision: 'index2',
    diagrams: [{ ...data.diagrams[0], revision: 'r2', sections: [] }],
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh diagrams' }));
  await waitFor(() =>
    expect(
      vi.mocked(InlineFlowview).mock.calls.at(-1)![0].diagram.revision
    ).toBe('r2')
  );
  expect(target()).toBeUndefined();
});
