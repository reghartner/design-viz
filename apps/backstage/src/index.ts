/** Loader-injected React API. No Backstage or reference-proxy dependencies. */
export {FlowviewEntityDiagrams} from './FlowviewEntityDiagrams';
export type {DiagramLoader, SpecLoader, EntityDiagrams, AssociatedDiagram, DiagramSection, DiagramStep} from './api/types';
export {parseEntityDiagrams} from './api/validation';
export {SPEC_MAX_BYTES} from './api/constants';
export type {ViewerTarget} from './viewer/protocol';
export {mountNativeViewer} from './generated/nativeViewer';
export type {NativeViewer, NativeViewerOptions, NativeViewerTarget, DetailReference, DetailNavigation, DetailViewState} from './generated/nativeViewer';
export {FlowviewCompatibility} from './generated/compatibility';
export type {CompatibilityReport, FlowviewRuntime} from './generated/compatibility';
