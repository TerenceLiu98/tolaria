import type React from 'react'
import type { ProjectCanvas, ProjectCanvasEdge } from '../../projectCanvas'
import { cn } from '../../lib/utils'

interface CanvasGraphicsLayerProps {
  canvas: ProjectCanvas
  selectedEdgeId: string | null
  bounds: { minX: number; minY: number; width: number; height: number }
  connectPreview: { from: { x: number; y: number }; to: { x: number; y: number } } | null
  onSelectEdge: (edgeId: string) => void
}

function center(node: ProjectCanvas['nodes'][number]) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 }
}

function edgeLine(
  edge: ProjectCanvasEdge,
  nodesById: ReadonlyMap<string, ProjectCanvas['nodes'][number]>,
  bounds: CanvasGraphicsLayerProps['bounds'],
  selected: boolean,
  onSelectEdge: (edgeId: string) => void,
): React.ReactNode {
  const from = nodesById.get(edge.from)
  const to = nodesById.get(edge.to)
  if (!from || !to) return null
  const fromPoint = center(from)
  const toPoint = center(to)
  return (
    <line
      key={edge.id}
      className={cn('project-canvas-edge', selected && 'project-canvas-edge--selected')}
      data-testid="project-canvas-edge"
      x1={fromPoint.x - bounds.minX}
      y1={fromPoint.y - bounds.minY}
      x2={toPoint.x - bounds.minX}
      y2={toPoint.y - bounds.minY}
      onPointerDown={(event) => {
        event.stopPropagation()
        onSelectEdge(edge.id)
      }}
    />
  )
}

/** Graphics-only layer. It can swap SVG for Canvas2D without changing tools. */
export function CanvasGraphicsLayer({
  bounds,
  canvas,
  connectPreview,
  onSelectEdge,
  selectedEdgeId,
}: CanvasGraphicsLayerProps) {
  const nodesById = new Map(canvas.nodes.map(node => [node.id, node]))
  return (
    <svg
      className="project-canvas-edges"
      style={{ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height }}
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      aria-hidden="true"
    >
      {canvas.edges.map(edge => edgeLine(edge, nodesById, bounds, edge.id === selectedEdgeId, onSelectEdge))}
      {connectPreview ? (
        <line
          className="project-canvas-edge project-canvas-edge--preview"
          x1={connectPreview.from.x - bounds.minX}
          y1={connectPreview.from.y - bounds.minY}
          x2={connectPreview.to.x - bounds.minX}
          y2={connectPreview.to.y - bounds.minY}
        />
      ) : null}
    </svg>
  )
}
