import type { CanvasConnectorCommand, CanvasGraphicsCommandBatch } from '../../canvasGraphicsCommands'

interface CanvasGraphicsLayerProps {
  bounds: { minX: number; minY: number; width: number; height: number }
  commands: CanvasGraphicsCommandBatch
  onSelectEdge: (edgeId: string) => void
}

function connectorPath(
  connectors: readonly CanvasConnectorCommand[],
  bounds: CanvasGraphicsLayerProps['bounds'],
): string {
  return connectors
    .map(command => `M ${command.from.x - bounds.minX} ${command.from.y - bounds.minY} L ${command.to.x - bounds.minX} ${command.to.y - bounds.minY}`)
    .join(' ')
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
        <line
          key={command.edgeId}
          className="project-canvas-edge-hit-region"
          data-testid="project-canvas-edge"
          data-edge-id={command.edgeId}
          x1={command.from.x - bounds.minX}
          y1={command.from.y - bounds.minY}
          x2={command.to.x - bounds.minX}
          y2={command.to.y - bounds.minY}
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
