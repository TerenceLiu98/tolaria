import type { CanvasConnectorCommand, CanvasConnectorRoute, CanvasGraphicsCommandBatch } from '../../canvasGraphicsCommands'

interface CanvasGraphicsLayerProps {
  bounds: { minX: number; minY: number; width: number; height: number }
  commands: CanvasGraphicsCommandBatch
  onSelectEdge: (edgeId: string) => void
}

function relativePoint(point: { x: number; y: number }, bounds: CanvasGraphicsLayerProps['bounds']): string {
  return `${point.x - bounds.minX} ${point.y - bounds.minY}`
}

function connectorRoutePath(route: CanvasConnectorRoute, bounds: CanvasGraphicsLayerProps['bounds']): string {
  const [from, to] = route.points
  if (route.kind === 'curved') {
    return `M ${relativePoint(from, bounds)} C ${relativePoint(route.control1, bounds)} ${relativePoint(route.control2, bounds)} ${relativePoint(to, bounds)}`
  }
  return route.points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${relativePoint(point, bounds)}`)
    .join(' ')
}

function connectorPath(connectors: readonly CanvasConnectorCommand[], bounds: CanvasGraphicsLayerProps['bounds']): string {
  return connectors.map(command => connectorRoutePath(command.route, bounds)).join(' ')
}

/** Executes renderer-agnostic graphics commands; SVG remains a replaceable backend. */
export function CanvasGraphicsLayer({
  bounds,
  commands,
  onSelectEdge,
}: CanvasGraphicsLayerProps) {
  const regular = commands.connectors.filter(command => !command.selected)
  const selected = commands.connectors.filter(command => command.selected)
  return (
    <svg
      className="project-canvas-edges"
      style={{ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height }}
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      aria-hidden="true"
    >
      {regular.length > 0 ? <path className="project-canvas-edge" d={connectorPath(regular, bounds)} /> : null}
      {selected.length > 0 ? <path className="project-canvas-edge project-canvas-edge--selected" d={connectorPath(selected, bounds)} /> : null}
      {commands.connectors.map(command => (
        <path
          key={command.edgeId}
          className="project-canvas-edge-hit-region"
          data-testid="project-canvas-edge"
          data-edge-id={command.edgeId}
          d={connectorRoutePath(command.route, bounds)}
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelectEdge(command.edgeId)
          }}
        />
      ))}
      {commands.preview ? (
        <line
          className="project-canvas-edge project-canvas-edge--preview"
          x1={commands.preview.from.x - bounds.minX}
          y1={commands.preview.from.y - bounds.minY}
          x2={commands.preview.to.x - bounds.minX}
          y2={commands.preview.to.y - bounds.minY}
        />
      ) : null}
    </svg>
  )
}
