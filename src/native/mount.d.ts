export interface NativeViewerTarget {
  section: string;
  path?: string;
  step?: string;
}
export interface NativeViewerOptions {
  skin?: string;
  layoutTarget?: 'backstage' | 'confluence' | 'default';
  scrollIntoView?: boolean;
  backlinks?: Record<string, unknown>;
  onChange?: () => void;
  onResize?: (height: number) => void;
  onWarning?: (message: string) => void;
}
export interface NativeViewer {
  readonly root: ShadowRoot;
  readonly warnings: string[];
  navigate(target: NativeViewerTarget): void;
  pause(): void;
  destroy(): void;
}
/** Mount trusted bundled renderer code around inert spec data in a dedicated host.
 * Destroy before reusing the host. Navigation failures leave the viewer usable.
 * Shadow DOM owns styles/DOM; this is not a security sandbox. */
export function mountNativeViewer(host: HTMLElement, spec: unknown, options?: NativeViewerOptions): NativeViewer;
