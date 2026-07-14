import type { TranslationKey } from '../../lib/i18n'
import type { ProjectCanvasEdgeKind } from '../../projectCanvas'

export const PROJECT_CANVAS_OVERVIEW_ZOOM = 0.65
export const EDGE_KINDS: ProjectCanvasEdgeKind[] = ['related', 'supports', 'contradicts', 'depends_on', 'needs_reading']

export type ProjectCanvasNodePresentation = 'overview' | 'card' | 'preview'

export function nodePresentation(zoom: number, selected: boolean): ProjectCanvasNodePresentation {
  if (zoom < PROJECT_CANVAS_OVERVIEW_ZOOM) return 'overview'
  return selected ? 'preview' : 'card'
}

export function edgeKindKey(kind: ProjectCanvasEdgeKind): TranslationKey {
  switch (kind) {
    case 'related':
      return 'projectCanvas.edge.related'
    case 'supports':
      return 'projectCanvas.edge.supports'
    case 'contradicts':
      return 'projectCanvas.edge.contradicts'
    case 'depends_on':
      return 'projectCanvas.edge.depends_on'
    case 'needs_reading':
      return 'projectCanvas.edge.needs_reading'
  }
}
