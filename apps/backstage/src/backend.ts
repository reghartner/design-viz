import manifest from '../../../tools/canon/manifest.cjs';
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

/** Central canon entry resolved to repository-relative document paths. */
export interface CanonEntry {
  id: string;
  folder: string;
  owner: string;
  path: string;
  html: string;
}

/** Parse root canon.json before fetching the listed files at one approved SHA. */
export function parseCanonManifest(raw: unknown): CanonEntry[] {
  return manifest.entries(raw);
}

/** Derive viewer metadata from an enrolled entry without modifying source JSON. */
export function materializeCanonSpec(raw: unknown, entry: CanonEntry): unknown {
  return manifest.spec(raw, entry);
}
