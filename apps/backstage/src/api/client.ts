import type { DiscoveryApi, FetchApi } from '@backstage/frontend-plugin-api';

import type { DiagramLoader, SpecLoader } from './types';
import { parseEntityDiagrams } from './validation';

export const SPEC_MAX_BYTES = 2 * 1024 * 1024;

export function createSpecLoader(
  discovery: DiscoveryApi,
  fetchApi: FetchApi,
  proxyPath = '/flowview'
): SpecLoader {
  if (!/^\/[a-z0-9/_-]+$/i.test(proxyPath))
    throw new Error('Configure flowview.proxyPath as a Backstage proxy route.');
  return async (diagram, signal) => {
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(diagram.id))
      throw new Error('Invalid diagram ID.');
    const base = await discovery.getBaseUrl('proxy');
    const response = await fetchApi.fetch(
      base +
        proxyPath.replace(/\/$/, '') +
        '/specs/' +
        encodeURIComponent(diagram.id) +
        '?revision=' +
        encodeURIComponent(diagram.revision),
      { signal }
    );
    if (response.status === 409)
      throw new Error(
        'This diagram changed. Refresh diagrams to load its current revision.'
      );
    if (!response.ok)
      throw new Error('Diagram read failed (' + response.status + ').');
    const text = await response.text();
    if (new TextEncoder().encode(text).length > SPEC_MAX_BYTES)
      throw new Error('Diagram exceeds the 2 MiB viewer limit.');
    const spec = JSON.parse(text);
    if (!spec || !spec.page || spec.page.canon?.id !== diagram.id)
      throw new Error('The server returned a different diagram.');
    return spec;
  };
}

export function createDiagramLoader(
  discovery: DiscoveryApi,
  fetchApi: FetchApi,
  proxyPath = '/flowview'
): DiagramLoader {
  if (!/^\/[a-z0-9/_-]+$/i.test(proxyPath))
    throw new Error('Configure flowview.proxyPath as a Backstage proxy route.');
  return async (entityRef, signal) => {
    // Discover on every refresh: do not capture a stale backend URL or put an
    // upstream service token in frontend configuration.
    const base = await discovery.getBaseUrl('proxy');
    const response = await fetchApi.fetch(
      base +
        proxyPath.replace(/\/$/, '') +
        '/entity-diagrams?entityRef=' +
        encodeURIComponent(entityRef),
      { signal }
    );
    if (!response.ok)
      throw new Error('Diagram lookup failed (' + response.status + ').');
    const data = await response.json();
    return parseEntityDiagrams(data, entityRef);
  };
}
