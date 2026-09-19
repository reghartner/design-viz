// Stable facade for consumers; transport and response validation live separately.
export type {
  DiagramStep,
  DiagramSection,
  AssociatedDiagram,
  EntityDiagrams,
  DiagramLoader,
  SpecLoader,
} from './api/types';
export {
  createDiagramLoader,
  createSpecLoader,
  SPEC_MAX_BYTES,
} from './api/client';
