import type { NativeViewerTarget } from '../generated/nativeViewer';

/** Host request identity extends the renderer-owned navigation address. */
export interface ViewerTarget extends NativeViewerTarget {
  request?: number;
}
