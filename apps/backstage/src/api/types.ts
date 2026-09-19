export interface DiagramStep {
  id: string;
  position: number;
  title: string;
  url: string;
}
export interface DiagramSection {
  reference: string;
  title: string;
  url: string;
  nodes: Array<{ id: string; title: string; relationship: string }>;
  paths: Array<{ id: string; label: string; steps: DiagramStep[] }>;
}
export interface AssociatedDiagram {
  id: string;
  title: string;
  kind: 'canonical' | 'design';
  owner: string;
  revision: string;
  viewerUrl: string;
  editUrl: string;
  sections: DiagramSection[];
  designDocument?: { url: string; label: string };
}
export interface EntityDiagrams {
  version: 1;
  entityRef: string;
  revision: string;
  diagrams: AssociatedDiagram[];
}
export type DiagramLoader = (
  entityRef: string,
  signal: AbortSignal
) => Promise<EntityDiagrams>;
export type SpecLoader = (
  diagram: Pick<AssociatedDiagram, 'id' | 'revision'>,
  signal: AbortSignal
) => Promise<unknown>;
