import {
  FlowviewEntityDiagrams,
  FlowviewCompatibility,
  mountNativeViewer,
  parseEntityDiagrams,
  SPEC_MAX_BYTES,
} from '@flowview/backstage-plugin';
import type {
  AssociatedDiagram,
  CompatibilityReport,
  DiagramLoader,
  DiagramSection,
  DiagramStep,
  EntityDiagrams,
  FlowviewRuntime,
  NativeViewer,
  NativeViewerOptions,
  NativeViewerTarget,
  SpecLoader,
  ViewerTarget,
} from '@flowview/backstage-plugin';

const step: DiagramStep = {
  id: 'save', position: 1, title: 'Saved', url: 'https://company.test/flow#s=save',
};
const section: DiagramSection = {
  reference: 'recording', title: 'Recording', url: 'https://company.test/flow',
  nodes: [{ id: 'cloud', title: 'Recording', relationship: 'service' }],
  paths: [{ id: 'happy', label: 'Saved', steps: [step] }],
};
const diagram: AssociatedDiagram = {
  id: 'consumer-recording', title: 'Recording', revision: 'revision',
  kind: 'canonical', owner: 'group:default/consumer', sections: [section],
  viewerUrl: 'https://company.test/flow', editUrl: 'https://company.test/edit',
};
const data: EntityDiagrams = {
  version: 1, entityRef: 'component:default/recording', revision: 'index',
  diagrams: [diagram],
};
export const loadDiagrams: DiagramLoader = async (entityRef, signal) => {
  signal.throwIfAborted();
  return parseEntityDiagrams(data, entityRef);
};
export const loadSpec: SpecLoader = async (requested, signal) => {
  signal.throwIfAborted();
  return { page: { title: requested.id, revision: requested.revision } };
};
export const target: ViewerTarget = {
  section: section.reference, path: 'happy', step: step.id, request: 1,
};
export function CompanyTab() {
  return <FlowviewEntityDiagrams entityRef={data.entityRef}
    loadDiagrams={loadDiagrams} loadSpec={loadSpec} refreshMs={60_000} />;
}
export function mount(host: HTMLElement, spec: unknown): NativeViewer {
  const options: NativeViewerOptions = { scrollIntoView: false };
  const nativeTarget: NativeViewerTarget = target;
  const viewer = mountNativeViewer(host, spec, options);
  viewer.navigate(nativeTarget);
  return viewer;
}
export const runtime: FlowviewRuntime = FlowviewCompatibility;
export const report: CompatibilityReport = FlowviewCompatibility.check({});
export const byteLimit: number = SPEC_MAX_BYTES;
// Downstream code can wrap and republish the complete public core contract.
export type {
  AssociatedDiagram, CompatibilityReport, DiagramLoader, DiagramSection,
  DiagramStep, EntityDiagrams, FlowviewRuntime, NativeViewer, NativeViewerOptions,
  NativeViewerTarget, SpecLoader, ViewerTarget,
};
