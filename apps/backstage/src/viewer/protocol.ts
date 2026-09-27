import type { NativeViewerTarget } from '../generated/nativeViewer';

/** Host request identity extends the section/view/path/step navigation address.
 * The consumer's router owns URL serialization and history. */
export interface ViewerTarget extends NativeViewerTarget {
  request?: number;
}
