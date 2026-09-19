import type { DiagramStep, EntityDiagrams } from './types';

/** The proxy response is untrusted until its shape and entity identity agree. */
export function parseEntityDiagrams(
  input: unknown,
  expectedRef: string
): EntityDiagrams {
  const data = input as Partial<EntityDiagrams> | null;
  if (
    data?.version !== 1 ||
    data.entityRef !== expectedRef ||
    typeof data.revision !== 'string' ||
    !Array.isArray(data.diagrams)
  )
    throw new Error('Invalid entity diagram response.');
  for (const diagram of data.diagrams) {
    if (
      !diagram ||
      typeof diagram.id !== 'string' ||
      typeof diagram.revision !== 'string' ||
      !diagram.revision ||
      typeof diagram.title !== 'string' ||
      !['canonical', 'design'].includes(diagram.kind) ||
      typeof diagram.owner !== 'string' ||
      typeof diagram.viewerUrl !== 'string' ||
      typeof diagram.editUrl !== 'string' ||
      !Array.isArray(diagram.sections)
    )
      throw new Error('Invalid diagram entry.');
    for (const section of diagram.sections) {
      if (
        !section ||
        typeof section.reference !== 'string' ||
        typeof section.title !== 'string' ||
        typeof section.url !== 'string' ||
        !Array.isArray(section.nodes) ||
        !Array.isArray(section.paths)
      )
        throw new Error('Invalid diagram section.');
      if (
        section.nodes.some(
          (node: { id?: unknown; title?: unknown } | null) =>
            !node ||
            typeof node.id !== 'string' ||
            typeof node.title !== 'string'
        )
      )
        throw new Error('Invalid diagram node.');
      for (const path of section.paths) {
        if (
          !path ||
          typeof path.id !== 'string' ||
          typeof path.label !== 'string' ||
          !Array.isArray(path.steps) ||
          path.steps.some(
            (step: Partial<DiagramStep> | null) =>
              !step ||
              typeof step.id !== 'string' ||
              typeof step.title !== 'string' ||
              typeof step.url !== 'string' ||
              !Number.isInteger(step.position)
          )
        )
          throw new Error('Invalid diagram path.');
      }
    }
    if (
      diagram.designDocument &&
      (typeof diagram.designDocument.url !== 'string' ||
        typeof diagram.designDocument.label !== 'string')
    )
      throw new Error('Invalid design document.');
  }
  return data as EntityDiagrams;
}
