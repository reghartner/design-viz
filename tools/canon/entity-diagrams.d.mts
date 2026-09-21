/** Internal JavaScript boundary. The published package supplies its wire types. */
export function normalizeEntityRef(value: string): string;
export function buildEntityDiagramIndex(specs: readonly unknown[], options?: {
  publicBaseUrl?: string;
  diagramUrls?: (diagram: {id: string; revision: string; spec: unknown}) => {
    viewerUrl: string;
    editUrl: string;
  };
}): unknown;
export function diagramsForEntity(index: unknown, entityRef: string): unknown;
