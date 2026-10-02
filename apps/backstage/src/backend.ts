import manifest from '../../../tools/canon/manifest.cjs';
import {
  buildEntityDiagramIndex as buildIndex,
  diagramsForEntity as forEntity,
  materializeCanonSpecs as materializeBatch,
  prepareCanonSnapshot as prepareSnapshot,
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

/** Central canon entry resolved to its repository-relative spec path. */
export interface CanonEntry {
  id: string;
  folder: string;
  owner: string;
  path: string;
  /** @deprecated Compatibility path for optional standalone exports. Readers use path. */
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

/** Resolve a complete approved canon snapshot in memory. This low-level helper
 * does not authorize; prefer prepareCanonSnapshot for request-scoped serving. */
export function materializeCanonSpecs(specs: readonly unknown[]): unknown[] {
  return materializeBatch(specs);
}

/** Resolve only in memory from one approved authored revision. Authorization
 * must allow the consumer AND every provider in its dependency closure. */
export function prepareCanonSnapshot(specs: readonly unknown[], options?: EntityDiagramIndexOptions & {
  authorize?: (spec: unknown) => boolean;
}): {
  specs: unknown[]; authoredSpecs: unknown[]; index: EntityDiagramIndex;
  loadSpec: (id: string) => unknown;
  loadWorkspace: (id: string) => {source: unknown; topologyContext: {version: number; id: string; specs: unknown[]}} | null;
} {
  return prepareSnapshot(specs, options) as ReturnType<typeof prepareCanonSnapshot>;
}
