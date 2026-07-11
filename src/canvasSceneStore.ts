import {
  normalizeProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasEdge,
  type ProjectCanvasNode,
  type ProjectCanvasViewport,
} from './projectCanvas'

export interface CanvasBounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasSceneSnapshot {
  readonly project: string
  readonly nodesById: Readonly<Record<string, ProjectCanvasNode>>
  readonly edgesById: Readonly<Record<string, ProjectCanvasEdge>>
  readonly nodeOrder: readonly string[]
  readonly edgeOrder: readonly string[]
  readonly groups: Readonly<Record<string, readonly string[]>>
  readonly membership: Readonly<Record<string, string | null>>
  readonly bounds: CanvasBounds | null
  readonly revision: number
}

export interface CanvasSceneMutationResult {
  readonly before: ProjectCanvas
  readonly after: ProjectCanvas
  readonly changed: boolean
}

export interface CanvasSceneStoreOptions {
  normalize?: boolean
}

export interface CanvasNodeGeometryPatch {
  readonly id: string
  readonly x?: number
  readonly y?: number
  readonly width?: number
  readonly height?: number
}

export interface CanvasSceneDiagnostics {
  readonly fullRebuilds: number
  readonly geometryPatchBatches: number
  readonly geometryPatchedNodes: number
  readonly lastQueryCandidates: number
}

function boundsForNodes(nodes: readonly ProjectCanvasNode[]): CanvasBounds | null {
  if (nodes.length === 0) return null
  return nodes.reduce<CanvasBounds>((bounds, node) => ({
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

function cloneCanvas(canvas: ProjectCanvas): ProjectCanvas {
  return {
    ...canvas,
    viewport: { ...canvas.viewport },
    nodes: canvas.nodes.map(node => ({ ...node })),
    edges: canvas.edges.map(edge => ({ ...edge })),
    sapientia: { ...canvas.sapientia },
  }
}

function sceneSnapshot(canvas: ProjectCanvas, revision: number): CanvasSceneSnapshot {
  const nodes = [...canvas.nodes].sort((left, right) => left.id.localeCompare(right.id))
  const edges = [...canvas.edges].sort((left, right) => left.id.localeCompare(right.id))
  const nodesById: Record<string, ProjectCanvasNode> = {}
  const edgesById: Record<string, ProjectCanvasEdge> = {}
  const groups: Record<string, readonly string[]> = {}
  const membership: Record<string, string | null> = {}

  for (const node of nodes) {
    nodesById[node.id] = { ...node }
    membership[node.id] = node.parentId ?? null
    if (node.type === 'group') groups[node.id] = []
  }
  for (const node of nodes) {
    if (node.parentId && groups[node.parentId]) groups[node.parentId] = [...groups[node.parentId], node.id]
  }
  for (const edge of edges) edgesById[edge.id] = { ...edge }

  return {
    project: canvas.project,
    nodesById,
    edgesById,
    nodeOrder: nodes.map(node => node.id),
    edgeOrder: edges.map(edge => edge.id),
    groups,
    membership,
    bounds: boundsForNodes(nodes),
    revision,
  }
}

function sameCanvas(left: ProjectCanvas, right: ProjectCanvas): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function intersectsBounds(node: ProjectCanvasNode, bounds: CanvasBounds): boolean {
  return node.x + node.width >= bounds.minX
    && node.y + node.height >= bounds.minY
    && node.x <= bounds.maxX
    && node.y <= bounds.maxY
}

function boundsIncludingNode(bounds: CanvasBounds | null, node: ProjectCanvasNode): CanvasBounds {
  if (!bounds) {
    return { minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height }
  }
  return {
    minX: Math.min(bounds.minX, node.x),
    minY: Math.min(bounds.minY, node.y),
    maxX: Math.max(bounds.maxX, node.x + node.width),
    maxY: Math.max(bounds.maxY, node.y + node.height),
  }
}

/**
 * Normalized, body-free Canvas layout state. Document bodies and editor
 * instances deliberately never enter this store.
 */
export class CanvasSceneStore {
  private static readonly SPATIAL_CELL_SIZE = 128
  private canvas: ProjectCanvas
  private readonly normalize: boolean
  private readonly spatialIndex = new Map<string, Set<string>>()
  private readonly nodeRanks = new Map<string, number>()
  private readonly connectedNodeIdsByNode = new Map<string, Set<string>>()
  private fullRebuilds = 0
  private geometryPatchBatches = 0
  private geometryPatchedNodes = 0
  private lastQueryCandidates = 0
  private geometryBoundsDirty = false
  private revision = 0
  private snapshotValue: CanvasSceneSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(canvas: ProjectCanvas, options: CanvasSceneStoreOptions = {}) {
    this.normalize = options.normalize !== false
    this.canvas = this.normalize
      ? normalizeProjectCanvas(cloneCanvas(canvas), canvas.project)
      : cloneCanvas(canvas)
    this.snapshotValue = sceneSnapshot(this.canvas, this.revision)
    this.rebuildSpatialIndex()
  }

  getSnapshot = (): CanvasSceneSnapshot => this.snapshotValue

  getCanvas(): ProjectCanvas {
    return cloneCanvas(this.canvas)
  }

  /**
   * Stable render view for pointer-frequency snapshots. Structural callers
   * must still mutate through the controller; this object is intentionally
   * not cloned on every animation frame.
   */
  getCanvasSnapshot(): ProjectCanvas {
    return this.canvas
  }

  getDiagnostics(): CanvasSceneDiagnostics {
    return {
      fullRebuilds: this.fullRebuilds,
      geometryPatchBatches: this.geometryPatchBatches,
      geometryPatchedNodes: this.geometryPatchedNodes,
      lastQueryCandidates: this.lastQueryCandidates,
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  replace(canvas: ProjectCanvas): CanvasSceneMutationResult {
    const before = this.getCanvas()
    const after = this.normalize
      ? normalizeProjectCanvas(cloneCanvas(canvas), before.project)
      : cloneCanvas(canvas)
    const changed = !sameCanvas(before, after)
    if (!changed) return { before, after, changed }
    this.canvas = after
    this.geometryBoundsDirty = false
    this.revision += 1
    this.snapshotValue = sceneSnapshot(this.canvas, this.revision)
    this.rebuildSpatialIndex()
    for (const listener of this.listeners) listener()
    return { before, after: this.getCanvas(), changed }
  }

  update(updater: (canvas: ProjectCanvas) => ProjectCanvas): CanvasSceneMutationResult {
    return this.replace(updater(this.getCanvas()))
  }

  setViewport(viewport: ProjectCanvasViewport): void {
    if (
      viewport.x === this.canvas.viewport.x
      && viewport.y === this.canvas.viewport.y
      && viewport.zoom === this.canvas.viewport.zoom
    ) return
    this.canvas.viewport = { ...viewport }
  }

  /** Applies pointer-frequency geometry without rebuilding the normalized scene. */
  patchNodeGeometry(patches: readonly CanvasNodeGeometryPatch[]): boolean {
    let changedNodes = 0
    let nextBounds = this.snapshotValue.bounds
    const nodesById = this.snapshotValue.nodesById as Record<string, ProjectCanvasNode>
    for (const patch of patches) {
      const rank = this.nodeRanks.get(patch.id)
      if (rank === undefined) continue
      const current = this.canvas.nodes[rank]
      if (!current) continue
      const next = {
        ...current,
        x: patch.x ?? current.x,
        y: patch.y ?? current.y,
        width: patch.width ?? current.width,
        height: patch.height ?? current.height,
      }
      if (
        next.x === current.x
        && next.y === current.y
        && next.width === current.width
        && next.height === current.height
      ) continue
      this.removeNodeFromSpatialIndex(current)
      this.canvas.nodes[rank] = next
      nodesById[next.id] = next
      this.addNodeToSpatialIndex(next)
      nextBounds = boundsIncludingNode(nextBounds, next)
      changedNodes += 1
    }
    if (changedNodes === 0) return false
    this.geometryPatchBatches += 1
    this.geometryPatchedNodes += changedNodes
    this.geometryBoundsDirty = true
    this.revision += 1
    this.snapshotValue = {
      ...this.snapshotValue,
      bounds: nextBounds,
      revision: this.revision,
    }
    for (const listener of this.listeners) listener()
    return true
  }

  finalizePatchedGeometry(): void {
    if (!this.geometryBoundsDirty) return
    this.geometryBoundsDirty = false
    this.revision += 1
    this.snapshotValue = {
      ...this.snapshotValue,
      bounds: boundsForNodes(this.canvas.nodes),
      revision: this.revision,
    }
    for (const listener of this.listeners) listener()
  }

  node(nodeId: string): ProjectCanvasNode | null {
    const node = this.snapshotValue.nodesById[nodeId]
    return node ? { ...node } : null
  }

  edge(edgeId: string): ProjectCanvasEdge | null {
    const edge = this.snapshotValue.edgesById[edgeId]
    return edge ? { ...edge } : null
  }

  nodes(): ProjectCanvasNode[] {
    return this.snapshotValue.nodeOrder.map(nodeId => ({ ...this.snapshotValue.nodesById[nodeId] }))
  }

  edges(): ProjectCanvasEdge[] {
    return this.snapshotValue.edgeOrder.map(edgeId => ({ ...this.snapshotValue.edgesById[edgeId] }))
  }

  connectedNodeIds(nodeIds: ReadonlySet<string>): string[] {
    const connected = new Set<string>()
    for (const nodeId of nodeIds) {
      for (const connectedNodeId of this.connectedNodeIdsByNode.get(nodeId) ?? []) connected.add(connectedNodeId)
    }
    return [...connected]
  }

  query(bounds: CanvasBounds, retainedNodeIds: ReadonlySet<string> = new Set()): ProjectCanvasNode[] {
    const candidateIds = new Set<string>(retainedNodeIds)
    for (const cell of this.cellsForBounds(bounds)) {
      for (const nodeId of this.spatialIndex.get(cell) ?? []) candidateIds.add(nodeId)
    }
    this.lastQueryCandidates = candidateIds.size
    return [...candidateIds]
      .map(nodeId => this.snapshotValue.nodesById[nodeId])
      .filter((node): node is ProjectCanvasNode => Boolean(
        node && (retainedNodeIds.has(node.id) || intersectsBounds(node, bounds)),
      ))
      .sort((left, right) => (this.nodeRanks.get(left.id) ?? 0) - (this.nodeRanks.get(right.id) ?? 0))
      .map(node => ({ ...node }))
  }

  hitTest(point: CanvasPoint, options: { includeGroups?: boolean } = {}): ProjectCanvasNode | null {
    const nodes = this.query({ minX: point.x, minY: point.y, maxX: point.x, maxY: point.y }).reverse()
    return nodes.find(node => (
      (options.includeGroups !== false || node.type !== 'group')
      && point.x >= node.x
      && point.x <= node.x + node.width
      && point.y >= node.y
      && point.y <= node.y + node.height
    )) ?? null
  }

  /** Stable JSON-ready ordering for Git-friendly project.canvas.json writes. */
  serialize(): ProjectCanvas {
    return {
      ...this.getCanvas(),
      nodes: this.nodes(),
      edges: this.edges(),
    }
  }

  private rebuildSpatialIndex(): void {
    this.spatialIndex.clear()
    this.nodeRanks.clear()
    this.connectedNodeIdsByNode.clear()
    this.fullRebuilds += 1
    for (const [rank, node] of this.canvas.nodes.entries()) {
      this.nodeRanks.set(node.id, rank)
      this.addNodeToSpatialIndex(node)
    }
    for (const edge of this.canvas.edges) {
      const from = this.connectedNodeIdsByNode.get(edge.from) ?? new Set<string>()
      from.add(edge.to)
      this.connectedNodeIdsByNode.set(edge.from, from)
      const to = this.connectedNodeIdsByNode.get(edge.to) ?? new Set<string>()
      to.add(edge.from)
      this.connectedNodeIdsByNode.set(edge.to, to)
    }
  }

  private addNodeToSpatialIndex(node: ProjectCanvasNode): void {
    for (const cell of this.cellsForNode(node)) {
      const ids = this.spatialIndex.get(cell) ?? new Set<string>()
      ids.add(node.id)
      this.spatialIndex.set(cell, ids)
    }
  }

  private removeNodeFromSpatialIndex(node: ProjectCanvasNode): void {
    for (const cell of this.cellsForNode(node)) {
      const ids = this.spatialIndex.get(cell)
      if (!ids) continue
      ids.delete(node.id)
      if (ids.size === 0) this.spatialIndex.delete(cell)
    }
  }

  private cellsForNode(node: ProjectCanvasNode): string[] {
    return this.cellsForBounds({
      minX: node.x,
      minY: node.y,
      maxX: node.x + node.width,
      maxY: node.y + node.height,
    })
  }

  private cellsForBounds(bounds: CanvasBounds): string[] {
    const size = CanvasSceneStore.SPATIAL_CELL_SIZE
    const minX = Math.floor(bounds.minX / size)
    const minY = Math.floor(bounds.minY / size)
    const maxX = Math.floor(bounds.maxX / size)
    const maxY = Math.floor(bounds.maxY / size)
    const cells: string[] = []
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) cells.push(`${x}:${y}`)
    }
    return cells
  }
}

export function canvasBounds(nodes: readonly ProjectCanvasNode[]): CanvasBounds | null {
  return boundsForNodes(nodes)
}
