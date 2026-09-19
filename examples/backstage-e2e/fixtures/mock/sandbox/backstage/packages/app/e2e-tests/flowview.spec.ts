import { test, expect } from '@playwright/test';
test('real Backstage service and API pages render the designer plugin and both outcomes', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('/catalog/home/component/recording-service/diagrams');
  await page.getByRole('button', { name: 'Enter', exact: true }).click();
  await expect(
    page.getByText('Associated diagrams (1)', { exact: true }),
  ).toBeVisible();
  const frame = page.frameLocator('iframe[title^="Flowview:"]');
  await expect(
    frame.getByRole('button', {
      name: 'Go to step 5 on Happy path',
      exact: true,
    }),
  ).toBeVisible();
  await frame
    .getByRole('button', { name: 'Go to step 5 on Happy path', exact: true })
    .click();
  await expect(
    frame.getByText('Doorbell recording ready', { exact: true }),
  ).toBeVisible();
  await frame
    .getByRole('button', {
      name: 'Go to step 5 on Storage timeout',
      exact: true,
    })
    .click();
  await expect(
    frame.getByText('Doorbell recording ready', { exact: true }),
  ).toHaveCount(0);
  await expect(frame.getByText(/^no notifications$/i)).toBeVisible();
  await frame.getByRole('button', { name: 'Data flow', exact: true }).click();
  await frame
    .getByRole('button', { name: 'Links for Recording service', exact: true })
    .click();
  const links = frame.getByRole('dialog', {
    name: 'Links for Recording service',
    exact: true,
  });
  await expect(
    links.getByRole('link', { name: /API definition · createRecording/ }),
  ).toHaveAttribute(
    'href',
    'http://localhost:3000/catalog/home/api/recording-service-api',
  );
  await expect(
    links.getByRole('link', { name: /Code · createRecording/ }),
  ).toHaveAttribute(
    'href',
    new RegExp('^https://github\\.com/' + '__MOCK_REPOSITORY__'.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '/blob/[a-f0-9]{40}/src/recording-service\\.js#L'),
  );
  await page.screenshot({
    path: '../../.local/real-backstage-timeout.png',
    fullPage: true,
  });
  await expect(
    page.getByRole('link', { name: 'Edit in workbench' }),
  ).toHaveAttribute(
    'href',
    /localhost:7020\/workbench\/flowspec.html\?canon=doorbell/,
  );
  await page.goto('/catalog/home/api/recording-service-api/diagrams');
  await expect(
    page.getByText('Associated diagrams (1)', { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .frameLocator('iframe[title^="Flowview:"]')
      .getByRole('button', { name: 'Go to step 5 on Happy path', exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
