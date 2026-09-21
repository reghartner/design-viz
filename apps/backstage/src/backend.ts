import {
  buildEntityDiagramIndex as buildIndex,
  diagramsForEntity as forEntity,
} from '../../../tools/canon/entity-diagrams.mjs';
import type {AssociatedDiagram, EntityDiagrams} from './api/types';

export interface EntityDiagramIndex {
  version: 1;
  revision: string;
  entities: Record<string, AssociatedDiagram[]>;
}

export interface EntityDiagramIndexOptions {
  /** Default reference-adapter base. Supply diagramUrls for other transports. */
  publicBaseUrl?: string;
  /** Link destinations only; this function never fetches specs or calls an API. */
  diagramUrls?: (diagram: {id: string; revision: string; spec: unknown}) => {
    viewerUrl: string;
    editUrl: string;
  };
}

/** Index only approved specs the requesting viewer is authorized to read.
 * The caller owns source-control access, caching and authorization. */
export function buildEntityDiagramIndex(
  specs: readonly unknown[],
  options?: EntityDiagramIndexOptions,
): EntityDiagramIndex {
  return buildIndex(specs, options) as EntityDiagramIndex;
}

/** Resolve a fully qualified kind:namespace/name against an authorized index. */
export function diagramsForEntity(
  index: EntityDiagramIndex,
  entityRef: string,
): EntityDiagrams {
  return forEntity(index, entityRef) as EntityDiagrams;
}
