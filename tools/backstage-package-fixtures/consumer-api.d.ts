export {
  FlowviewEntityDiagrams, FlowviewCompatibility, mountNativeViewer,
  parseEntityDiagrams, SPEC_MAX_BYTES,
} from '@flowview/backstage-plugin';
export type {
  AssociatedDiagram, CompatibilityReport, DiagramLoader, DiagramSection,
  DiagramStep, EntityDiagrams, FlowviewRuntime, NativeViewer, NativeViewerOptions,
  NativeViewerTarget, SpecLoader, ViewerTarget,
} from '@flowview/backstage-plugin';
export {
  buildEntityDiagramIndex, diagramsForEntity, parseCanonManifest, materializeCanonSpec,
} from '@flowview/backstage-plugin/backend';
export type {
  EntityDiagramIndex, EntityDiagramIndexOptions, CanonEntry,
} from '@flowview/backstage-plugin/backend';
