import {
  normalizeProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasEdge,
  type ProjectCanvasNode,
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

/**
 * Normalized, body-free Canvas layout state. Document bodies and editor
 * instances deliberately never enter this store.
 */
export class CanvasSceneStore {
  private static readonly SPATIAL_CELL_SIZE = 512
  private canvas: ProjectCanvas
  private readonly normalize: boolean
  private readonly spatialIndex = new Map<string, Set<string>>()
  private readonly nodeRanks = new Map<string, number>()
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
    this.revision += 1
    this.snapshotValue = sceneSnapshot(this.canvas, this.revision)
    this.rebuildSpatialIndex()
    for (const listener of this.listeners) listener()
    return { before, after: this.getCanvas(), changed }
  }

  update(updater: (canvas: ProjectCanvas) => ProjectCanvas): CanvasSceneMutationResult {
    return this.replace(updater(this.getCanvas()))
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

  query(bounds: CanvasBounds, retainedNodeIds: ReadonlySet<string> = new Set()): ProjectCanvasNode[] {
    const candidateIds = new Set<string>(retainedNodeIds)
    for (const cell of this.cellsForBounds(bounds)) {
      for (const nodeId of this.spatialIndex.get(cell) ?? []) candidateIds.add(nodeId)
    }
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
    for (const [rank, node] of this.canvas.nodes.entries()) {
      this.nodeRanks.set(node.id, rank)
      for (const cell of this.cellsForNode(node)) {
        const ids = this.spatialIndex.get(cell) ?? new Set<string>()
        ids.add(node.id)
        this.spatialIndex.set(cell, ids)
      }
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
