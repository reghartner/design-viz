export interface DetailViewState {
  view?: string;
  path?: string;
  step?: string;
  mode?: string;
  size?: string;
  focus?: string;
  layout?: string;
  /** @deprecated Diagram visibility is authored per chapter. Ignored on restore. */
  diagramVisible?: boolean;
}
export interface DetailNavigation {
  section: string;
  rootState?: DetailViewState;
  frames: Array<{
    node: string | null;
    /** @deprecated Inline expansion was removed. Ignored on restore; emitted empty. */
    expanded: string[];
    state: DetailViewState;
  }>;
}
export interface DetailReference {spec: string; revision?: string; section?: string}
/** Another document to open. A spec or URL is required; revision/section accompany a spec. */
export interface DiagramHandoffReference {
  spec?: string;
  revision?: string;
  section?: string;
  url?: string;
}
export interface NativeViewerTarget {
  section: string;
  /** Named view ID. Applied before path/step; omission keeps the current view. */
  view?: string;
  drilldown?: DetailNavigation;
  path?: string;
  step?: string;
}
export interface NativeViewerOptions {
  /** Synchronous host routing only. Return an absolute, credential-free HTTP(S) URL.
   * Null, undefined, invalid URLs or thrown errors fall back to the authored URL.
   * Handoffs open as links and never use loadDetail or fetch a diagram. */
  resolveDiagramLink?: (reference: DiagramHandoffReference) => string | null | undefined;
  /** Consumer-owned approved-spec transport. Renderer never fetches remote URLs. */
  loadDetail?: (reference: DetailReference, signal: AbortSignal) => Promise<unknown>;
  /** Host may store this state in its own router; Flowview does not change host history. */
  onDetailNavigate?: (state: DetailNavigation | null) => void;
  skin?: string;
  layoutTarget?: 'backstage' | 'confluence' | 'default';
  scrollIntoView?: boolean;
  backlinks?: Record<string, unknown>;
  /** Current section/view and active step, or null for page-only changes.
   * The host owns URL serialization and browser history. */
  onChange?: (target: NativeViewerTarget | null) => void;
  onResize?: (height: number) => void;
  onWarning?: (message: string) => void;
}
export interface NativeViewer {
  readonly root: ShadowRoot;
  readonly warnings: string[];
  navigate(target: NativeViewerTarget): void;
  /** Current section/view/path/step. Does not change host routing. */
  snapshot(): NativeViewerTarget | null;
  /** Transient diagram canvas. The host must supply a full-window surface and exit control. */
  setCanvas(active: boolean): void;
  pause(): void;
  destroy(): void;
}
/** Mount trusted bundled renderer code around inert spec data in a dedicated host.
 * Destroy before reusing the host. Navigation failures leave the viewer usable.
 * Shadow DOM owns styles/DOM; this is not a security sandbox. */
export function mountNativeViewer(host: HTMLElement, spec: unknown, options?: NativeViewerOptions): NativeViewer;
