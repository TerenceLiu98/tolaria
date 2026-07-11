import type { CanvasBounds } from './canvasSceneStore'
import type { ProjectCanvasEdge, ProjectCanvasNode } from './projectCanvas'

export type CanvasSelectionMode = 'idle' | 'pressed' | 'editing' | 'dragging' | 'resizing' | 'connecting' | 'marquee'

export interface PrimaryCanvasSelection {
  kind: 'node' | 'edge'
  id: string
}

export interface CanvasSelectionSnapshot {
  readonly selectedNodeIds: readonly string[]
  readonly selectedEdgeIds: readonly string[]
  readonly primary: PrimaryCanvasSelection | null
  readonly editingNodeId: string | null
  readonly activeGroupId: string | null
  readonly peekNodeId: string | null
  readonly bounds: CanvasBounds | null
  readonly mode: CanvasSelectionMode
  readonly revision: number
}

function selectionBounds(nodes: readonly ProjectCanvasNode[], selectedIds: readonly string[]): CanvasBounds | null {
  const selected = nodes.filter(node => selectedIds.includes(node.id))
  if (selected.length === 0) return null
  return selected.reduce<CanvasBounds>((bounds, node) => ({
    minX: Math.min(bounds.minX, node.x),
    minY: Math.min(bounds.minY, node.y),
    maxX: Math.max(bounds.maxX, node.x + node.width),
    maxY: Math.max(bounds.maxY, node.y + node.height),
  }), {
    minX: selected[0].x,
    minY: selected[0].y,
    maxX: selected[0].x + selected[0].width,
    maxY: selected[0].y + selected[0].height,
  })
}

export class CanvasSelectionManager {
  private selectedNodeIdsValue: string[] = []
  private selectedEdgeIdsValue: string[] = []
  private primaryValue: PrimaryCanvasSelection | null = null
  private editingNodeIdValue: string | null = null
  private activeGroupIdValue: string | null = null
  private peekNodeIdValue: string | null = null
  private modeValue: CanvasSelectionMode = 'idle'
  private boundsValue: CanvasBounds | null = null
  private revision = 0
  private readonly listeners = new Set<() => void>()

  getSnapshot = (): CanvasSelectionSnapshot => ({
    selectedNodeIds: this.selectedNodeIdsValue,
    selectedEdgeIds: this.selectedEdgeIdsValue,
    primary: this.primaryValue,
    editingNodeId: this.editingNodeIdValue,
    activeGroupId: this.activeGroupIdValue,
    peekNodeId: this.peekNodeIdValue,
    bounds: this.boundsValue,
    mode: this.modeValue,
    revision: this.revision,
  })

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  selectNodes(nodeIds: readonly string[], primaryNodeId = nodeIds.at(-1) ?? null, additive = false): void {
    const nextIds = additive
      ? [...new Set([...this.selectedNodeIdsValue, ...nodeIds])]
      : [...new Set(nodeIds)]
    this.selectedNodeIdsValue = nextIds
    this.selectedEdgeIdsValue = []
    this.primaryValue = primaryNodeId ? { kind: 'node', id: primaryNodeId } : null
    this.modeValue = 'idle'
    this.publish()
  }

  toggleNode(nodeId: string): void {
    const selected = this.selectedNodeIdsValue.includes(nodeId)
    const next = selected
      ? this.selectedNodeIdsValue.filter(id => id !== nodeId)
      : [...this.selectedNodeIdsValue, nodeId]
    this.selectNodes(next, next.at(-1) ?? null)
  }

  selectEdge(edgeId: string): void {
    this.selectedNodeIdsValue = []
    this.selectedEdgeIdsValue = [edgeId]
    this.primaryValue = { kind: 'edge', id: edgeId }
    this.modeValue = 'idle'
    this.publish()
  }

  clear(): void {
    this.selectedNodeIdsValue = []
    this.selectedEdgeIdsValue = []
    this.primaryValue = null
    this.boundsValue = null
    this.modeValue = 'idle'
    this.publish()
  }

  beginEditing(nodeId: string): void {
    this.selectNodes([nodeId], nodeId)
    this.editingNodeIdValue = nodeId
    this.modeValue = 'editing'
    this.publish()
  }

  endEditing(): void {
    this.editingNodeIdValue = null
    this.modeValue = 'idle'
    this.publish()
  }

  setPeekNode(nodeId: string | null): void {
    this.peekNodeIdValue = nodeId
    this.publish()
  }

  setActiveGroup(groupId: string | null): void {
    this.activeGroupIdValue = groupId
    this.publish()
  }

  setMode(mode: CanvasSelectionMode): void {
    this.modeValue = mode
    this.publish()
  }

  updateBounds(nodes: readonly ProjectCanvasNode[], notify = true): void {
    this.boundsValue = selectionBounds(nodes, this.selectedNodeIdsValue)
    if (notify) this.publish()
  }

  contains(nodeId: string): boolean {
    return this.selectedNodeIdsValue.includes(nodeId)
  }

  primaryNode(nodes: readonly ProjectCanvasNode[]): ProjectCanvasNode | null {
    if (this.primaryValue?.kind !== 'node') return null
    return nodes.find(node => node.id === this.primaryValue?.id) ?? null
  }

  selectedEdges(edges: readonly ProjectCanvasEdge[]): ProjectCanvasEdge[] {
    return edges.filter(edge => this.selectedEdgeIdsValue.includes(edge.id))
  }

  private publish(): void {
    this.revision += 1
    for (const listener of this.listeners) listener()
  }
}
