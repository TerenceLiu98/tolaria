import type { CanvasConnectorCommand, CanvasConnectorRoute, CanvasGraphicsCommandBatch } from '../../canvasGraphicsCommands'
import type { ProjectCanvasEdgeMarker } from '../../projectCanvas'

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

interface ConnectorStyleGroup {
  readonly commands: CanvasConnectorCommand[]
  readonly fromMarker: ProjectCanvasEdgeMarker
  readonly selected: boolean
  readonly strokeStyle: CanvasConnectorCommand['strokeStyle']
  readonly strokeWidth: CanvasConnectorCommand['strokeWidth']
  readonly toMarker: ProjectCanvasEdgeMarker
}

function connectorStyleGroups(connectors: readonly CanvasConnectorCommand[]): ConnectorStyleGroup[] {
  const groups = new Map<string, ConnectorStyleGroup>()
  for (const command of connectors) {
    const key = [command.selected, command.strokeStyle, command.strokeWidth, command.fromMarker, command.toMarker].join(':')
    const group = groups.get(key)
    if (group) group.commands.push(command)
    else groups.set(key, {
      commands: [command],
      fromMarker: command.fromMarker,
      selected: command.selected,
      strokeStyle: command.strokeStyle,
      strokeWidth: command.strokeWidth,
      toMarker: command.toMarker,
    })
  }
  return [...groups.values()]
}

function markerId(marker: ProjectCanvasEdgeMarker, selected: boolean): string {
  return `project-canvas-marker-${marker}-${selected ? 'selected' : 'regular'}`
}

function markerUrl(marker: ProjectCanvasEdgeMarker, selected: boolean): string | undefined {
  return marker === 'none' ? undefined : `url(#${markerId(marker, selected)})`
}

function markerShape(marker: Exclude<ProjectCanvasEdgeMarker, 'none'>) {
  if (marker === 'arrow') return <path d="M 1 1 L 9 5 L 1 9" fill="none" />
  if (marker === 'circle') return <circle cx="5" cy="5" r="3.25" />
  if (marker === 'diamond') return <path d="M 1 5 L 5 1 L 9 5 L 5 9 Z" />
  return <path d="M 1 1 L 9 5 L 1 9 Z" />
}

function ConnectorMarkerDefinitions() {
  const markers: Exclude<ProjectCanvasEdgeMarker, 'none'>[] = ['arrow', 'circle', 'diamond', 'triangle']
  return (
    <defs>
      {[false, true].flatMap(selected => markers.map(marker => (
        <marker
          key={markerId(marker, selected)}
          id={markerId(marker, selected)}
          className={selected ? 'project-canvas-edge-marker project-canvas-edge-marker--selected' : 'project-canvas-edge-marker'}
          markerHeight="10"
          markerUnits="strokeWidth"
          markerWidth="10"
          orient="auto-start-reverse"
          refX={marker === 'circle' || marker === 'diamond' ? 5 : 9}
          refY="5"
          viewBox="0 0 10 10"
        >
          {markerShape(marker)}
        </marker>
      )))}
    </defs>
  )
}

/** Executes renderer-agnostic graphics commands; SVG remains a replaceable backend. */
export function CanvasGraphicsLayer({
  bounds,
  commands,
  onSelectEdge,
}: CanvasGraphicsLayerProps) {
  const groups = connectorStyleGroups(commands.connectors)
  return (
    <svg
      className="project-canvas-edges"
      style={{ left: bounds.minX, top: bounds.minY, width: bounds.width, height: bounds.height }}
      viewBox={`0 0 ${bounds.width} ${bounds.height}`}
      aria-hidden="true"
    >
      <ConnectorMarkerDefinitions />
      {groups.map(group => (
        <path
          key={[group.selected, group.strokeStyle, group.strokeWidth, group.fromMarker, group.toMarker].join(':')}
          className={group.selected ? 'project-canvas-edge project-canvas-edge--selected' : 'project-canvas-edge'}
          d={connectorPath(group.commands, bounds)}
          data-from-marker={group.fromMarker}
          data-stroke-style={group.strokeStyle}
          data-stroke-width={group.strokeWidth}
          data-to-marker={group.toMarker}
          markerStart={markerUrl(group.fromMarker, group.selected)}
          markerEnd={markerUrl(group.toMarker, group.selected)}
          style={{
            strokeDasharray: group.strokeStyle === 'dashed' ? '8 7' : undefined,
            strokeWidth: group.selected ? Math.max(3, group.strokeWidth) : group.strokeWidth,
          }}
        />
      ))}
      {commands.connectors.map(command => command.label ? (
        <text
          key={`${command.edgeId}:label`}
          className={command.selected ? 'project-canvas-edge-label project-canvas-edge-label--selected' : 'project-canvas-edge-label'}
          textAnchor="middle"
          x={command.labelPoint.x - bounds.minX}
          y={command.labelPoint.y - bounds.minY}
        >
          {command.label}
        </text>
      ) : null)}
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
