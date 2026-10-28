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
/** Another registered document to open. Destination metadata never replaces its ID. */
export interface DiagramHandoffReference {
  spec: string;
  revision?: string;
  section?: string;
  view?: string;
  path?: string;
  step?: string;
  siteBaseUrl?: string;
  claudeUrl?: string;
  claudeArtifactId?: string;
}
/** Shared site router input; external details may retain an explicit URL fallback. */
export interface DiagramLinkReference extends DiagramHandoffReference {url?: string}
export interface NativeViewerTarget {
  section: string;
  /** Named view ID. Applied before path/step; omission keeps the current view. */
  view?: string;
  drilldown?: DetailNavigation;
  path?: string;
  step?: string;
}
/** One pull request shown as an icon in the Tickets table and the carrier popover (#756).
 * State, checks and review colour the icon and fill its tooltip; nothing here paints a carrier. */
export interface LiveStatusPullRequest {
  url: string;
  number?: number;
  title?: string;
  state?: 'open' | 'draft' | 'merged' | 'closed';
  checks?: 'none' | 'pending' | 'passing' | 'failing';
  review?: 'none' | 'approved' | 'changes-requested' | 'commented';
  repo?: string;
  author?: string;
  branch?: string;
  mergedAt?: string;
  source?: 'authored' | 'github-search';
}
export interface LiveStatusEntry {
  state: 'todo' | 'active' | 'done' | 'blocked' | 'missing';
  title?: string;
  url?: string;
  assignee?: string;
  /** Atlassian accountId of the assignee. With tracking.jira.site the Tickets table links the owner to <site>/wiki/people/<id>. */
  assigneeId?: string;
  prs?: {count: number; state: 'open' | 'merged' | 'declined'; links?: LiveStatusPullRequest[]};
  detail?: string;
  updatedAt?: string;
  /** Epic key this issue belongs to; entries for keys no carrier references are
   * listed as NOT ON DIAGRAM when their epic or initiative ancestor is configured. */
  epic?: string;
  /** Hierarchy container classification; omitted for ordinary work items. */
  kind?: 'initiative' | 'epic' | 'story';
  parent?: string;
  /** Configured initiative roots reaching this epic/story (deduplicated). */
  initiatives?: string[];
  /** Team lane id for an entry no carrier references (epic children). */
  lane?: string;
  /** Upstream tickets this one waits on: Jira issue links (inward types such as
   * "is blocked by") or authored page.tracking.dependencies pairs. The ticket
   * waits while an upstream is not done, unless it is itself active or done. */
  dependsOn?: Array<{key: string; source: 'jira' | 'authored'; linkType?: string; reason?: string}>;
}
export interface NativeViewerOptions {
  /** Host-owned ticket transport; refresh pauses while the document is hidden. */
  liveStatus?: {
    /** refs.epics holds configured parent roots (Epic or Initiative); legacy name retained. */
    provider: (refs: {tickets: string[]; prs: string[]; epics: string[]}, signal: AbortSignal) => Promise<Record<string, LiveStatusEntry>>;
    refreshMs?: number;
  };
  /** Runtime host for diagram handoffs only. Saved destinations do not imply a host. */
  handoffHost?: 'claude' | 'site' | 'backstage' | 'unknown';
  /** Backstage continuation owned by the host. Keep the current viewer usable
   * until loading/navigation succeeds; retire requests when signal aborts. */
  onDiagramHandoff?: (reference: DiagramHandoffReference, signal: AbortSignal) => Promise<void>;
  /** Published website base, including deployment subpath. No query or fragment. */
  siteBaseUrl?: string;
  /** Synchronous host routing only. Return an absolute, credential-free HTTP(S) URL.
   * Null, undefined, invalid URLs or thrown errors fall back to the authored URL.
   * Explicit links/details retain this fallback; handoffs follow handoffHost. */
  resolveDiagramLink?: (reference: DiagramLinkReference) => string | null | undefined;
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
  /** Pause and release this viewer's expanded/fullscreen surface before hiding
   * a retained mount. Does not exit another viewer's fullscreen or erase state. */
  deactivate(): Promise<void>;
  destroy(): void;
}
/** Mount trusted bundled renderer code around inert spec data in a dedicated host.
 * Destroy before reusing the host. Navigation failures leave the viewer usable.
 * Shadow DOM owns styles/DOM; this is not a security sandbox. */
export function mountNativeViewer(host: HTMLElement, spec: unknown, options?: NativeViewerOptions): NativeViewer;
