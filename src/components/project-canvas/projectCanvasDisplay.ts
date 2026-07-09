import type { TranslationKey } from '../../lib/i18n'
import type {
  ProjectCanvas,
  ProjectCanvasEdgeKind,
  ProjectCanvasNode,
  ProjectCanvasNodeType,
} from '../../projectCanvas'

export const DEFAULT_NODE_WIDTH = 260
export const DEFAULT_NODE_HEIGHT = 150
export const DEFAULT_EMBEDDED_NODE_HEIGHT = 160
export const ZOOM_MIN = 0.35
export const ZOOM_MAX = 2
export const ZOOM_STEP = 0.1
export const EDGE_KINDS: ProjectCanvasEdgeKind[] = ['related', 'supports', 'contradicts', 'depends_on', 'needs_reading']

export function nodeKindKey(node: ProjectCanvasNode): TranslationKey {
  switch (node.type) {
    case 'note':
      return 'projectCanvas.node.note'
    case 'paper':
      return 'projectCanvas.node.paper'
    case 'paper_block':
      return 'projectCanvas.node.paper_block'
    case 'text':
      return 'projectCanvas.node.text'
    case 'task':
      return 'projectCanvas.node.task'
    case 'group':
      return 'projectCanvas.node.group'
  }
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

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function canvasBounds(nodes: ProjectCanvasNode[]) {
  if (nodes.length === 0) return null
  return nodes.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.x),
    minY: Math.min(bounds.minY, node.y),
    maxX: Math.max(bounds.maxX, node.x + node.width),
    maxY: Math.max(bounds.maxY, node.y + node.height),
  }), {
    minX: nodes[0].x,
    minY: nodes[0].y,
    maxX: nodes[0].x + nodes[0].width,
    maxY: nodes[0].y + nodes[0].height,
  })
}

export function canvasWithFitToView(
  current: ProjectCanvas,
  viewportWidth: number,
  viewportHeight: number,
): ProjectCanvas {
  const bounds = canvasBounds(current.nodes)
  if (!bounds) return { ...current, viewport: { x: 0, y: 0, zoom: 1 } }
  const padding = 96
  const width = Math.max(1, bounds.maxX - bounds.minX)
  const height = Math.max(1, bounds.maxY - bounds.minY)
  const zoom = clamp(Math.min(
    (viewportWidth - padding * 2) / width,
    (viewportHeight - padding * 2) / height,
  ), ZOOM_MIN, 1.35)
  return {
    ...current,
    viewport: {
      zoom,
      x: viewportWidth / 2 - ((bounds.minX + width / 2) * zoom),
      y: viewportHeight / 2 - ((bounds.minY + height / 2) * zoom),
    },
  }
}

export function autoLayoutCanvas(current: ProjectCanvas): ProjectCanvas {
  const columns: Record<ProjectCanvasNodeType, number> = {
    paper: 0,
    paper_block: 1,
    note: 2,
    text: 2,
    task: 3,
    group: 0,
  }
  const rowByColumn = new Map<number, number>()
  const orderedNodes = [...current.nodes].sort((left, right) => {
    const leftColumn = columns[left.type]
    const rightColumn = columns[right.type]
    if (leftColumn !== rightColumn) return leftColumn - rightColumn
    return left.id.localeCompare(right.id)
  })
  const nodesById = new Map<string, ProjectCanvasNode>()
  for (const node of orderedNodes) {
    const column = columns[node.type]
    const row = rowByColumn.get(column) ?? 0
    rowByColumn.set(column, row + 1)
    nodesById.set(node.id, {
      ...node,
      x: column * 340,
      y: row * 210,
      width: node.type === 'group' ? Math.max(node.width, 320) : Math.max(node.width, DEFAULT_NODE_WIDTH),
      height: node.type === 'group' ? Math.max(node.height, 180) : Math.max(node.height, DEFAULT_NODE_HEIGHT),
    })
  }
  return {
    ...current,
    nodes: current.nodes.map(node => nodesById.get(node.id) ?? node),
  }
}
