export interface CompatibilityReport {
  runtimeVersion: string;
  minVersion: string | null;
  missingFeatures: string[];
  messages: string[];
  status: 'compatible' | 'unversioned' | 'partial' | 'unsupported';
}
export interface FlowviewRuntime {
  version: string;
  contract: string;
  features: Record<string, {label: string; since: string}>;
}
export declare const FlowviewCompatibility: FlowviewRuntime & {
  check(spec: unknown, runtime?: FlowviewRuntime): CompatibilityReport;
  detect(spec: unknown): string[];
  metadataWarnings(spec: unknown): string[];
  compare(a: string, b: string): number | null;
  stamp(spec: unknown): unknown;
  stampText(text: string): string;
};
