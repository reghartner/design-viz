import { useMemo } from 'react';
import {
  useApi,
  discoveryApiRef,
  fetchApiRef,
  configApiRef,
} from '@backstage/frontend-plugin-api';
import { useEntity } from '@backstage/plugin-catalog-react';
import { stringifyEntityRef } from '@backstage/catalog-model';
import { createDiagramLoader, createSpecLoader } from './api';
import { FlowviewEntityDiagrams } from './FlowviewEntityDiagrams';

export function EntityFlowviewContent() {
  const { entity } = useEntity(),
    discovery = useApi(discoveryApiRef),
    fetchApi = useApi(fetchApiRef),
    config = useApi(configApiRef);
  const proxyPath =
    config.getOptionalString('flowview.proxyPath') || '/flowview';
  const loader = useMemo(
    () => createDiagramLoader(discovery, fetchApi, proxyPath),
    [discovery, fetchApi, proxyPath]
  );
  const specLoader = useMemo(
    () => createSpecLoader(discovery, fetchApi, proxyPath),
    [discovery, fetchApi, proxyPath]
  );
  return (
    <FlowviewEntityDiagrams
      entityRef={stringifyEntityRef(entity).toLowerCase()}
      loadDiagrams={loader}
      loadSpec={specLoader}
    />
  );
}
