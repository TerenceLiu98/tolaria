import type { CanvasPoint, CanvasSceneSnapshot } from './canvasSceneStore'
import type { ProjectCanvasEdge } from './projectCanvas'

export interface CanvasConnectorCommand {
  readonly edgeId: string
  readonly from: CanvasPoint
  readonly to: CanvasPoint
  readonly selected: boolean
}

export interface CanvasGraphicsCommandBatch {
  readonly connectors: readonly CanvasConnectorCommand[]
  readonly preview: { readonly from: CanvasPoint; readonly to: CanvasPoint } | null
}

export function buildCanvasGraphicsCommandBatch(
  scene: CanvasSceneSnapshot,
  edges: readonly ProjectCanvasEdge[],
  selectedEdgeIds: ReadonlySet<string>,
  preview: CanvasGraphicsCommandBatch['preview'] = null,
): CanvasGraphicsCommandBatch {
  const connectors: CanvasConnectorCommand[] = []
  for (const edge of edges) {
    const fromNode = scene.nodesById[edge.from]
    const toNode = scene.nodesById[edge.to]
    if (!fromNode || !toNode) continue
    connectors.push({
      edgeId: edge.id,
      from: { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
      selected: selectedEdgeIds.has(edge.id),
      to: { x: toNode.x + toNode.width / 2, y: toNode.y + toNode.height / 2 },
    })
  }
  return { connectors, preview }
}
