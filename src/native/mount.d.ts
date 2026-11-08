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
  state: 'todo' | 'active' | 'testing' | 'done' | 'blocked' | 'missing';
  title?: string;
  url?: string;
  assignee?: string;
  /** Atlassian accountId of the assignee. With tracking.jira.site the Tickets table links the owner to <site>/wiki/people/<id>. */
  assigneeId?: string;
  prs?: {count: number; state: 'open' | 'merged' | 'declined'; links?: LiveStatusPullRequest[]};
  detail?: string;
  updatedAt?: string;
  /** Epic key this issue belongs to; entries for keys no carrier references are
   * listed as NOT ON DIAGRAM when their epic or initiative ancestor is configured
   * and the source page does not exclude them via tracking.jira.exclude. */
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
   * waits while an upstream is not done, unless it is itself active, testing or done. */
  dependsOn?: Array<{key: string; source: 'jira' | 'authored'; linkType?: string; reason?: string}>;
}
/** One bound carrier handed to the telemetry provider (#939): carrierTelemetry() of a
 * local, imported or loaded detail node or edge. id is a node id, an edge identity
 * 'from->to' or a resolved imported identity such as 'shared::api->shared::store'. */
/** CloudWatch empty-as-zero is explicit author intent, never inferred from errors or hints. */
export interface TelemetryCloudWatchQuery {
  namespace: string; metric: string; region: string; accountId: string;
  dimensions: Record<string, string>; statistic: 'Sum' | 'Maximum' | 'Minimum' | 'Average' | 'SampleCount';
  missingMeansZero?: boolean;
  /** Regular CloudWatch period in seconds; validated against age and the 1440-point limit. */
  period?: number;
}
export interface TelemetryCloudWatchLogsQuery {
  logGroups: string[]; query: string; region: string; valueField?: string;
  trend?: false | {query: string; timeField: string; valueField: string; binSeconds?: number};
  breakdown?: {query: string; labelField: string; valueField: string; title?: string; labelTitle?: string; valueTitle?: string; limit?: number; columns?: Array<{field: string; label: string}>};
}
export interface TelemetryProgress {
  note: (text: string) => void;
  /** Runtime-only lifecycle, scoped to the current request. */
  pending?: (carrierId: string, signalName: string) => void;
  settled?: (carrierId: string, signalName: string, sample: NonNullable<TelemetrySample['signals']>[string] | null) => void;
}
export interface TelemetryBinding {
  id: string;
  kind: 'call' | 'queue' | 'service' | 'log-event' | 'device';
  signals: Record<string, {source: 'grafana' | 'loki' | 'tempo' | 'sql' | 'honeycomb' | 'cloudwatch' | 'cloudwatchLogs'; query: string | TelemetryCloudWatchQuery | TelemetryCloudWatchLogsQuery | Record<string, unknown>; unit: string | null; scope?: string; label?: string; showOnCard?: boolean; /** loki and grafana only: false keeps a successful empty result unobserved. */ missingMeansZero?: boolean; links?: {query?: string}; error?: string; /** Derived configuration error: skip only the optional grouped query; never save this into the authored query. */ breakdownError?: string; trendError?: string}>;
  proof: Record<string, {min?: number; max?: number; maxRatioOf?: string}>;
  links: {dashboard?: string; query?: string};
  card: {side?: 'right' | 'left' | 'above' | 'below'; offset?: number} | null;
}
/** Runtime evidence only; never authored, saved, or numerical proof. */
export interface TelemetryExemplar {
  version: 1;
  provider: 'honeycomb' | 'tempo';
  traceId: string;
  signal: string;
  selectionToken: string;
  selectionReason: string;
  /** Retrieval receipt time; trace age comes from selected candidate/span time. */
  observedAt: string;
  range: {from: string; to: string};
  completeness: 'complete' | 'partial' | 'unknown';
  warnings: string[];
  url?: string;
  candidates: Array<{traceId: string; time?: string; durationMs?: number; status: 'passing' | 'failing' | 'unknown'; url?: string}>;
  spans: Array<{id: string; parentId: string | null; service: string; name: string; startMs: number; ms: number; error: boolean; time: string;
    attributes: Record<string, string | number | boolean>;
    events: Array<{name: string; timeMs: number; attributes: Record<string, string | number | boolean>}>;
    links: Array<{traceId: string; spanId: string; attributes: Record<string, string | number | boolean>}>}>;
}
/** One carrier's telemetry for the observation window, keyed by carrier id in the
 * provider result. Every field is optional; malformed entries are dropped. */
export interface TelemetryLogDetails {
  status: 'complete' | 'error';
  error?: string;
  /** Required for complete results; anchored start and end of paired queries. */
  range?: {from: string; to: string};
  /** Default query limit 20, maximum 100. Only selected text cells, maximum 4, are retained. */
  limit?: number;
  /** Number of actual connector rows, never matched input records or a total group count. */
  returnedRows?: number;
  textTruncated?: boolean;
  /** Labels/text are capped at 500 characters; missing labels/counts invalidate the details. */
  rows?: Array<{label: string; value: number; cells: string[]}>;
}
export interface TelemetrySample {
  /** Query bounds are independent of actual observation/receipt time. */
  window?: {from: string; to: string};
  /** At most one selected exemplar per carrier, with up to 20 returned candidates and 200 spans. */
  exemplars?: TelemetryExemplar[];
  /** Signal observedAt is measurement as-of (null means unknown); retrievedAt is
   * client receipt time. Live charts prefer the selected signal's as-of. Mixed
   * adapters assign each legacy signal its own endpoint before combining sources.
   * formatted-text provenance denotes a provider table value that may be rounded. */
  signals?: Record<string, {value?: number; series?: Array<[number | string, number]>; intervalMs?: number; window?: {from: string; to: string}; unit?: string; observedAt?: string | number | null; retrievedAt?: string | number | null; provenance?: 'formatted-text'; links?: {query?: string};
    /** Explicit measured total over [from, to], covered by signal as-of (legacy: carrier as-of). Runtime evidence only. */
    aggregate?: {kind: 'total'; from: string | number; to: string | number};
    /** Runtime grouped Logs evidence, independent of the scalar value and proof. */
    breakdown?: TelemetryLogDetails}>;
  observedAt?: string | number;
  markers?: Array<{at: string | number; kind?: string; label?: string}>;
  links?: {query?: string; dashboard?: string};
}
export interface DirectTraceRequest {
  connection: string;
  environment: string;
  profile: {
    version: 1;
    label: string;
    provider: 'honeycomb' | 'tempo';
    server: string;
    tool: string;
    readOnly: true;
    adapter: 'honeycomb-table-v1' | 'tempo-v1';
    arguments: {traceId: string; start: string; end?: string; environment?: string; context?: Record<string, string>};
    time: {encoding: 'relative' | 'iso8601' | 'unix-seconds' | 'unix-milliseconds'; type: 'string' | 'number'; defaultLookback: string};
    literals: Record<string, string | number | boolean | null>;
    environments: Record<string, {label?: string; value?: string; context?: Record<string, string | number | boolean | null>; literals?: Record<string, string | number | boolean | null>}>;
    links: Array<{origin: string; path: string; query: Record<string, string>; timeEncoding: 'relative' | 'iso8601' | 'unix-seconds' | 'unix-milliseconds'}>;
  };
}
export interface NativeViewerOptions {
  /** Host-owned telemetry transport behind the Live status panel's Metrics button,
   * which is off by default. The provider runs only while Metrics is on, every
   * max(refreshMs, 60000) ms, paused while the document is hidden.
   * false suppresses telemetry, including demo fallback. Page
   * tracking.telemetry.enabled:false also wins and preserves bindings. */
  telemetry?: false | {
    /** Explicit Load/Verify only; independent of Metrics polling. The host must
     * authorize the configured exact connection using its own read-only access.
     * No MCP or credentials are bundled in the native viewer. Both methods receive
     * the same request object and AbortSignal. Return actual runtime metadata and
     * the original supported provider result; do not fabricate an envelope.
     * Profile/schema validation and the registered decoder run in the viewer. */
    directTrace?: {
      describe: (request: DirectTraceRequest, signal: AbortSignal) => Promise<{
        name: string;
        inputSchema: Record<string, unknown>;
        annotations?: {readOnlyHint?: boolean; destructiveHint?: boolean};
      }>;
      call: (request: DirectTraceRequest, args: Record<string, string | number | boolean | null>, signal: AbortSignal) => Promise<unknown>;
    };
    /** Opt into explicit report.pending/settled lifecycle for dispatched numeric signals.
     * By default legacy providers mark their supplied numeric bindings pending for the call. */
    managesPending?: boolean;
    /** Selected-day complete samples instead of legacy endpoint-only series. */
    historyMode?: 'window';
    /** report.note(text) updates the current request note (status().note), such as one
     * failed query beside answered ones. A rejection with `state: 'approval'`
     * reports the approval state instead of an error. */
    provider?: (bindings: TelemetryBinding[], signal: AbortSignal, report: TelemetryProgress) => Promise<Record<string, TelemetrySample>>;
    /** Click-only Over time batch. Absolute RFC3339 evaluation endpoints, each
     * representing the previous 24h. Optional endpoints give the exact selected-day
     * instants (local-day boundaries can be 23h/25h apart across DST). Return
     * per-signal series; omitted days are
     * unobserved. No live headline fallback. Optional: a live-only provider works.
     * report.note keeps partial errors visible and the failed batch retryable. */
    history?: (bindings: TelemetryBinding[], range: {from: string; to: string; endpoints?: {key?: string; at: string}[]; window?: {from: string; to: string}}, signal: AbortSignal, report: TelemetryProgress) => Promise<Record<string, TelemetrySample>>;
    /** Include mutable datasource/account identity in the controller-local cache key. */
    historyKey?: string | (() => unknown);
    /** Explicit user action resolver. ctl.telemetry.chooseExemplar validates the live
     * selection token and updates only runtime evidence. Never invoke during paint. */
    chooseExemplar?: (carrierId: string, selectionToken: string, traceId: string) => Promise<TelemetryExemplar>;
    /** Synchronous, read-only capability for a current token/candidate. No queries.
     * Without this check the optional alternative UI stays hidden. */
    canChooseExemplar?: (carrierId: string, selectionToken: string, traceId: string) => boolean;
    /** Starts unavailable when false. The controller setAvailable(boolean) updates
     * capability availability without enabling Metrics; page/host disable always wins. */
    available?: boolean;
    refreshMs?: number;
    /** Connector name for Metrics text; a getter follows changing per-source availability. */
    source?: string | (() => string);
    /** A demo source mounted while Metrics is on; it feeds the controller's apply(). */
    demo?: {mount: (telemetry: {apply: (map: Record<string, TelemetrySample>) => void}) => (() => void) | void};
  };
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
