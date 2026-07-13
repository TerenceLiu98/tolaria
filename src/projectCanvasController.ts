import { autoLayoutCanvas } from './components/project-canvas/projectCanvasDisplay'
import { CanvasHistoryManager, type CanvasHistoryDomain } from './canvasHistoryManager'
import { CanvasLayerManager } from './canvasLayerManager'
import { buildCanvasGraphicsCommandBatch, type CanvasGraphicsCommandBatch } from './canvasGraphicsCommands'
import { CanvasNodeSpecRegistry, type CanvasNodeToolbarAction } from './canvasNodeSpecRegistry'
import { CanvasOverlayCoordinator, type CanvasOverlayGuide, type CanvasOverlayHandle } from './canvasOverlayCoordinator'
import { CanvasSceneStore, type CanvasNodeGeometryPatch, type CanvasPoint, type CanvasSceneDiagnostics, type CanvasSceneSnapshot } from './canvasSceneStore'
import { CanvasSelectionManager, type CanvasSelectionSnapshot } from './canvasSelectionManager'
import { CanvasToolManager, type CanvasGestureKind, type CanvasGestureSnapshot, type CanvasPointerInput, type CanvasTool } from './canvasToolManager'
import { CanvasViewport, type CanvasViewportSize, type CanvasViewportSnapshot } from './canvasViewport'
import { ProjectCanvasPersistenceAdapter, type ProjectCanvasPersistenceReason } from './projectCanvasPersistenceAdapter'
import {
  normalizeProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasEdgeKind,
  type ProjectCanvasNode,
  type ProjectCanvasRefDiagnostic,
  type ProjectCanvasResolvedRef,
} from './projectCanvas'

export type CanvasControllerStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface CanvasControllerSnapshot {
  readonly status: CanvasControllerStatus
  readonly scene: ProjectCanvas | null
  readonly sceneSnapshot: CanvasSceneSnapshot | null
  readonly viewport: CanvasViewportSnapshot
  readonly selection: CanvasSelectionSnapshot
  readonly gesture: CanvasGestureSnapshot
  readonly tool: CanvasTool
  readonly layers: CanvasLayerManager
  readonly specs: CanvasNodeSpecRegistry
  readonly overlay: ReturnType<CanvasOverlayCoordinator['getSnapshot']>
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly historyDomain: CanvasHistoryDomain
  readonly saving: boolean
  readonly error: string | null
  readonly refs: readonly ProjectCanvasResolvedRef[]
  readonly refDiagnostics: readonly ProjectCanvasRefDiagnostic[]
  readonly revision: number
}

export interface CanvasControllerOptions {
  persistence: ProjectCanvasPersistenceAdapter
  viewportOverscan?: number
  historySize?: number
  migrateLoadedScene?: boolean
}

export interface CanvasPointerEventSource {
  addEventListener(type: 'pointermove' | 'pointerup', listener: (event: PointerEvent) => void): void
  removeEventListener(type: 'pointermove' | 'pointerup', listener: (event: PointerEvent) => void): void
}

interface GestureContext {
  before: ProjectCanvas
  kind: CanvasGestureKind
  startScreen: CanvasPoint
  startViewport: ProjectCanvas['viewport']
  startNodes: Readonly<Record<string, ProjectCanvasNode>>
  nodeId: string | null
  additive: boolean
}

export interface CanvasAddNodeOptions {
  readonly label?: string
  readonly linkFromNodeId?: string | null
  readonly linkKind?: ProjectCanvasEdgeKind
  readonly select?: boolean
}

export interface CanvasNodeCreationOptions extends CanvasAddNodeOptions {
  readonly type: ProjectCanvasNode['type']
  readonly center?: CanvasPoint
  readonly ref?: string
  readonly title?: string
  readonly text?: string
  readonly completed?: boolean
}

export interface CanvasDropPayload {
  readonly nodeType?: ProjectCanvasNode['type']
  readonly ref: string
  readonly title?: string
  readonly text?: string
}

const SNAP_DISTANCE_PX = 8

type AlignmentFeature = { value: number; edge: 'start' | 'center' | 'end' }

function alignmentFeatures(start: number, size: number): AlignmentFeature[] {
  return [
    { value: start, edge: 'start' },
    { value: start + size / 2, edge: 'center' },
    { value: start + size, edge: 'end' },
  ]
}

function nextId(prefix: string, ids: Iterable<string>): string {
  const existing = new Set(ids)
  for (let index = 1; index < 100000; index += 1) {
    const candidate = `${prefix}_${index}`
    if (!existing.has(candidate)) return candidate
  }
  return `${prefix}_${Date.now()}`
}

/**
 * Sapientia's single public mutation boundary for Canvas state. The class is
 * deliberately headless: React subscribes to snapshots and dispatches these
 * commands, while pointer-frequency state stays in the engine.
 */
export class ProjectCanvasController {
  private readonly viewport: CanvasViewport
  private readonly selection: CanvasSelectionManager
  private readonly tools: CanvasToolManager
  private readonly history: CanvasHistoryManager
  private readonly layers: CanvasLayerManager
  private readonly overlays: CanvasOverlayCoordinator
  private readonly specs: CanvasNodeSpecRegistry
  private readonly persistence: ProjectCanvasPersistenceAdapter

  private sceneStore: CanvasSceneStore | null = null
  private statusValue: CanvasControllerStatus = 'idle'
  private savingValue = false
  private errorValue: string | null = null
  private revision = 0
  private snapshotValue: CanvasControllerSnapshot
  private gestureContext: GestureContext | null = null
  private clipboard: ProjectCanvasNode[] = []
  private readonly transientNodeEdits = new Map<string, ProjectCanvas>()
  private readonly transientEdgeEdits = new Map<string, ProjectCanvas>()
  private refsValue: ProjectCanvasResolvedRef[] = []
  private refDiagnosticsValue: ProjectCanvasRefDiagnostic[] = []
  private referenceRequest = 0
  private lastCommittedCamera: ProjectCanvas['viewport'] = { x: 0, y: 0, zoom: 1 }
  private disposedValue = false
  private notifyFrame: number | null = null
  private readonly listeners = new Set<() => void>()
  private readonly migrateLoadedScene: boolean
  private focusOwnerValue: CanvasHistoryDomain = 'canvas'

  constructor(options: CanvasControllerOptions) {
    this.persistence = options.persistence
    this.migrateLoadedScene = options.migrateLoadedScene !== false
    this.viewport = new CanvasViewport({}, options.viewportOverscan)
    this.selection = new CanvasSelectionManager()
    this.tools = new CanvasToolManager()
    this.history = new CanvasHistoryManager(options.historySize)
    this.layers = new CanvasLayerManager()
    this.overlays = new CanvasOverlayCoordinator()
    this.specs = new CanvasNodeSpecRegistry()
    this.snapshotValue = this.makeSnapshot()

    this.viewport.subscribe(() => {
      if (this.disposedValue) return
      const camera = this.viewport.getCamera()
      const cameraChanged = camera.x !== this.lastCommittedCamera.x
        || camera.y !== this.lastCommittedCamera.y
        || camera.zoom !== this.lastCommittedCamera.zoom
      this.sceneStore?.setViewport(camera)
      this.lastCommittedCamera = camera
      if (cameraChanged && this.statusValue === 'ready') void this.persist(this.getScene(), 'viewport')
      this.updateSelectionOverlay(false)
      this.publish()
    })
    this.selection.subscribe(() => {
      this.updateSelectionOverlay()
      this.publishImmediate()
    })
    this.tools.subscribe(() => this.publish())
    this.history.subscribe(() => this.publishImmediate())
    this.overlays.subscribe(() => this.publishImmediate())
    this.sceneStore = null
  }

  getSnapshot = (): CanvasControllerSnapshot => this.snapshotValue

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async load(): Promise<{ created: boolean }> {
    if (!this.persistence.vaultPath) {
      this.statusValue = 'error'
      this.errorValue = 'Project Canvas needs an active vault.'
      this.publish()
      throw new Error(this.errorValue)
    }
    this.statusValue = 'loading'
    this.errorValue = null
    this.publish()
    try {
      const loaded = await this.persistence.load()
      const loadedCanvas = this.migrateLoadedScene
        ? normalizeProjectCanvas(loaded.result.canvas!, loaded.result.projectPath || this.persistence.projectPath)
        : loaded.result.canvas!
      this.sceneStore = new CanvasSceneStore(loadedCanvas, { normalize: this.migrateLoadedScene })
      this.refsValue = loaded.resolve?.refs.map(ref => ({ ...ref })) ?? []
      this.refDiagnosticsValue = loaded.resolve?.diagnostics.map(diagnostic => ({ ...diagnostic })) ?? []
      this.sceneStore.subscribe(() => {
        const selectedNodes = this.selectedNodes()
        this.selection.updateBounds(selectedNodes, false)
        this.updateSelectionOverlay(false)
        this.publish()
      })
      this.viewport.scheduleCamera(loadedCanvas.viewport)
      this.viewport.flush()
      this.lastCommittedCamera = this.viewport.getCamera()
      this.selection.clear()
      this.history.clear()
      this.statusValue = 'ready'
      this.publish()
      return { created: loaded.created }
    } catch (error) {
      this.statusValue = 'error'
      this.errorValue = error instanceof Error ? error.message : String(error)
      this.publish()
      throw error
    }
  }

  dispose(): void {
    this.disposedValue = true
    this.viewport.dispose()
    if (this.notifyFrame !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.notifyFrame)
      else clearTimeout(this.notifyFrame)
      this.notifyFrame = null
    }
    void this.persistence.flush()
    this.listeners.clear()
  }

  getScene(): ProjectCanvas | null {
    return this.sceneStore?.getCanvas() ?? null
  }

  getSceneDiagnostics(): CanvasSceneDiagnostics | null {
    return this.sceneStore?.getDiagnostics() ?? null
  }

  setViewportSize(size: CanvasViewportSize): void {
    this.viewport.setViewportSize(size)
    this.overlays.setViewportBounds(size.width > 0 && size.height > 0
      ? { left: 0, top: 0, width: size.width, height: size.height }
      : null, false)
    this.updateSelectionOverlay(false)
  }

  screenToCanvas(point: CanvasPoint): CanvasPoint {
    return this.viewport.screenToCanvas(point)
  }

  clientToScreen(point: CanvasPoint): CanvasPoint {
    return this.viewport.clientToScreen(point)
  }

  clientToCanvas(point: CanvasPoint): CanvasPoint {
    return this.viewport.clientToCanvas(point)
  }

  canvasCenter(width: number, height: number): CanvasPoint {
    return this.viewport.canvasCenter(width, height)
  }

  graphicsBounds(): { minX: number; minY: number; width: number; height: number } {
    return this.viewport.graphicsBounds(this.sceneStore?.getSnapshot().bounds ?? null)
  }

  isHandOverrideActive(): boolean {
    return this.tools.isHandOverrideActive()
  }

  getGestureSnapshot(): CanvasGestureSnapshot {
    return this.tools.getSnapshot()
  }

  getConnectionHandles(nodes: readonly ProjectCanvasNode[]): CanvasOverlayHandle[] {
    return this.overlays.connectionHandlesForNodes(nodes, this.viewport)
  }

  queryVisibleNodes(retainedNodeIds: ReadonlySet<string> = new Set()): ProjectCanvasNode[] {
    const scene = this.sceneStore
    if (!scene) return []
    const viewport = this.viewport.getSnapshot()
    if (viewport.size.width <= 0 || viewport.size.height <= 0) return scene.nodes()
    const retained = new Set(retainedNodeIds)
    const selection = this.selection.getSnapshot()
    for (const nodeId of selection.selectedNodeIds) retained.add(nodeId)
    if (selection.editingNodeId) retained.add(selection.editingNodeId)
    for (const edgeId of selection.selectedEdgeIds) {
      const edge = scene.edge(edgeId)
      if (edge) {
        retained.add(edge.from)
        retained.add(edge.to)
      }
    }
    for (const nodeId of scene.connectedNodeIds(new Set(selection.selectedNodeIds))) retained.add(nodeId)
    const gestureTarget = this.tools.getSnapshot().targetId
    if (gestureTarget) retained.add(gestureTarget)
    for (const nodeId of selection.overlayOwnedNodeIds) retained.add(nodeId)
    for (const nodeId of scene.connectedNodeIds(retained)) retained.add(nodeId)
    return this.layers.filterNodes(scene.query(viewport.renderBounds, retained), viewport.camera.zoom, retained)
  }

  queryVisibleGraphics(): CanvasGraphicsCommandBatch {
    const scene = this.sceneStore
    if (!scene) return { connectors: [], preview: null }
    const viewport = this.viewport.getSnapshot()
    const selection = this.selection.getSnapshot()
    const selectedEdgeIds = new Set(selection.selectedEdgeIds)
    const retainedNodeIds = new Set(selection.selectedNodeIds)
    if (selection.editingNodeId) retainedNodeIds.add(selection.editingNodeId)
    for (const nodeId of selection.overlayOwnedNodeIds) retainedNodeIds.add(nodeId)
    const gesture = this.tools.getSnapshot()
    if (gesture.targetId) retainedNodeIds.add(gesture.targetId)
    const retainedEdgeIds = new Set([
      ...selectedEdgeIds,
      ...scene.incidentEdgeIds(retainedNodeIds),
    ])
    const edges = viewport.size.width <= 0 || viewport.size.height <= 0
      ? scene.edges()
      : scene.queryEdges(viewport.renderBounds, retainedEdgeIds)
    const fromNode = gesture.kind === 'connect' && gesture.targetId
      ? scene.getSnapshot().nodesById[gesture.targetId]
      : null
    const preview = fromNode && gesture.current
      ? {
          from: { x: fromNode.x + fromNode.width / 2, y: fromNode.y + fromNode.height / 2 },
          to: this.viewport.screenToCanvas(gesture.current),
        }
      : null
    return buildCanvasGraphicsCommandBatch(scene.getSnapshot(), edges, selectedEdgeIds, preview)
  }

  setTool(tool: CanvasTool): void {
    if (this.tools.getSnapshot().phase !== 'idle') this.cancelGesture()
    this.tools.setTool(tool)
  }

  setSpacePressed(pressed: boolean): void {
    this.tools.setSpacePressed(pressed)
  }

  selectNodes(nodeIds: readonly string[], primaryNodeId = nodeIds.at(-1) ?? null, additive = false): void {
    this.selection.selectNodes(nodeIds, primaryNodeId, additive)
    this.selection.updateBounds(this.sceneStore?.nodes() ?? [])
  }

  toggleNodeSelection(nodeId: string): void {
    this.selection.toggleNode(nodeId)
    this.selection.updateBounds(this.sceneStore?.nodes() ?? [])
  }

  selectEdge(edgeId: string): void {
    this.selection.selectEdge(edgeId)
  }

  clearSelection(): void {
    this.selection.clear()
  }

  beginEditing(nodeId: string): void {
    this.selection.beginEditing(nodeId)
  }

  endEditing(): void {
    this.selection.endEditing()
  }

  setPeekNode(nodeId: string | null): void {
    this.selection.setPeekNode(nodeId)
  }

  setOverlayOwnedNodes(nodeIds: readonly string[]): void {
    this.selection.setOverlayOwnedNodes(nodeIds)
  }

  dismissOverlayOutside(point: CanvasPoint): boolean {
    return this.overlays.dismissOutside(point) !== null
  }

  dismissContextualToolbar(): void {
    this.overlays.dismissKind('toolbar')
  }

  executeNodeToolbarAction(action: CanvasNodeToolbarAction, nodeId: string): ProjectCanvas | null {
    const node = this.sceneStore?.node(nodeId)
    if (!node) return this.getScene()
    switch (action) {
      case 'connect':
        this.selectNodes([nodeId], nodeId)
        this.setTool('connect')
        return this.getScene()
      case 'resize':
        this.selectNodes([nodeId], nodeId)
        return this.getScene()
      case 'toggle-complete':
        return this.toggleTask(nodeId)
      case 'delete':
        return this.deleteNodes([nodeId])
      case 'open':
      case 'pin':
        return this.getScene()
      default:
        return this.getScene()
    }
  }

  setFocusOwner(owner: CanvasHistoryDomain): void {
    if (this.focusOwnerValue === owner && this.history.activeDomain === owner) return
    this.focusOwnerValue = owner
    this.history.setActiveDomain(owner)
    this.overlays.setFocusOwner(owner === 'document' ? 'editor' : 'canvas')
  }

  setOverlayFocusOwner(owner: 'canvas' | 'overlay' | 'editor'): void {
    this.overlays.setFocusOwner(owner)
  }

  updateScene(updater: (canvas: ProjectCanvas) => ProjectCanvas): ProjectCanvas | null {
    return this.mutateScene(updater, { history: false, persistence: null, label: 'transient' })
  }

  commitScene(
    label: string,
    updater: (canvas: ProjectCanvas) => ProjectCanvas,
    persistence: ProjectCanvasPersistenceReason = 'structural',
  ): ProjectCanvas | null {
    const before = this.getScene()
    const after = this.mutateScene(updater, { history: false, persistence: null, label })
    if (!before || !after) return after
    this.history.record(label, before, after)
    this.persist(after, persistence)
    return after
  }

  replaceScene(nextCanvas: ProjectCanvas, label = 'Canvas change', persistence: ProjectCanvasPersistenceReason = 'structural'): ProjectCanvas | null {
    const before = this.getScene()
    const result = this.sceneStore?.replace(nextCanvas)
    if (!result) return null
    if (result.changed) {
      if (before) this.history.record(label, before, result.after)
      this.persist(result.after, persistence)
    }
    return result.after
  }

  updateNode(nodeId: string, patch: Partial<ProjectCanvasNode>, commit = false): ProjectCanvas | null {
    if (!commit && !this.transientNodeEdits.has(nodeId)) {
      const before = this.getScene()
      if (before) this.transientNodeEdits.set(nodeId, before)
    }
    const update = (canvas: ProjectCanvas) => ({
      ...canvas,
      nodes: canvas.nodes.map(node => node.id === nodeId ? { ...node, ...patch } : node),
    })
    const transientBefore = commit ? this.transientNodeEdits.get(nodeId) : undefined
    if (commit && transientBefore) {
      const result = this.updateScene(update)
      this.transientNodeEdits.delete(nodeId)
      if (result && JSON.stringify(transientBefore) !== JSON.stringify(result)) {
        this.history.record('Update node', transientBefore, result)
        void this.persist(result, 'structural')
      }
      return result
    }
    const result = commit ? this.commitScene('Update node', update) : this.updateScene(update)
    if (commit) this.transientNodeEdits.delete(nodeId)
    return result
  }

  commitNodeEdit(nodeId: string, label = 'Update node'): ProjectCanvas | null {
    const before = this.transientNodeEdits.get(nodeId)
    const after = this.getScene()
    this.transientNodeEdits.delete(nodeId)
    if (!before || !after) return after
    if (JSON.stringify(before) === JSON.stringify(after)) return after
    this.history.record(label, before, after)
    void this.persist(after, 'structural')
    return after
  }

  updateEdge(edgeId: string, patch: Partial<ProjectCanvas['edges'][number]>, commit = false): ProjectCanvas | null {
    if (!commit && !this.transientEdgeEdits.has(edgeId)) {
      const before = this.getScene()
      if (before) this.transientEdgeEdits.set(edgeId, before)
    }
    const update = (canvas: ProjectCanvas) => ({
      ...canvas,
      edges: canvas.edges.map(edge => edge.id === edgeId ? { ...edge, ...patch } : edge),
    })
    const transientBefore = commit ? this.transientEdgeEdits.get(edgeId) : undefined
    if (commit && transientBefore) {
      const result = this.updateScene(update)
      this.transientEdgeEdits.delete(edgeId)
      if (result && JSON.stringify(transientBefore) !== JSON.stringify(result)) {
        this.history.record('Update edge', transientBefore, result)
        void this.persist(result, 'structural')
      }
      return result
    }
    if (commit) this.transientEdgeEdits.delete(edgeId)
    return commit ? this.commitScene('Update edge', update) : this.updateScene(update)
  }

  toggleTask(nodeId: string): ProjectCanvas | null {
    const node = this.sceneStore?.node(nodeId)
    if (!node || node.type !== 'task') return this.getScene()
    return this.commitScene('Toggle task', canvas => ({
      ...canvas,
      nodes: canvas.nodes.map(candidate => candidate.id === nodeId
        ? { ...candidate, completed: !candidate.completed }
        : candidate),
    }))
  }

  addNode(node: ProjectCanvasNode, options: CanvasAddNodeOptions = {}): ProjectCanvas | null {
    const current = this.getScene()
    if (!current || current.nodes.some(candidate => candidate.id === node.id)) return current
    const linkFromNodeId = options.linkFromNodeId
    const linkKind = options.linkKind ?? 'related'
    const edge = linkFromNodeId && linkFromNodeId !== node.id && current.nodes.some(candidate => candidate.id === linkFromNodeId)
      ? { id: nextId('edge', current.edges.map(candidate => candidate.id)), from: linkFromNodeId, to: node.id, kind: linkKind }
      : null
    const result = this.commitScene(options.label ?? 'Add Canvas membership', canvas => ({
      ...canvas,
      nodes: [...canvas.nodes, node],
      edges: edge ? [...canvas.edges, edge] : canvas.edges,
    }))
    if (result && options.select !== false) this.selectNodes([node.id], node.id)
    return result
  }

  createNode(options: CanvasNodeCreationOptions): ProjectCanvas | null {
    return this.addNode(this.buildNode(options), options)
  }

  createPeekNode(type: ProjectCanvasNode['type'], ref: string, title?: string, sourceNodeId?: string): ProjectCanvasNode | null {
    const spec = this.specs.get(type)
    const geometry = spec.editorGeometry ?? spec.geometry
    const source = sourceNodeId ? this.sceneStore?.node(sourceNodeId) : null
    const center = source
      ? { x: source.x + source.width + 80 + geometry.width / 2, y: source.y + geometry.height / 2 }
      : this.canvasCenter(geometry.width, geometry.height)
    return this.buildNode({ type, ref, title, center }, geometry, 'peek')
  }

  addDropValue(value: string, point: CanvasPoint, options: CanvasAddNodeOptions = {}): ProjectCanvas | null {
    const block = this.specs.get('paper_block').resolveDrop(value)
    const image = this.specs.get('image').resolveDrop(value)
    const type: ProjectCanvasNode['type'] = block ? 'paper_block' : image ? 'image' : 'text'
    const resolved = block ?? image ?? this.specs.get('text').resolveDrop(value)
    if (!resolved) return this.getScene()
    return this.createNode({
      ...options,
      type,
      center: point,
      ref: resolved.ref,
      title: resolved.title,
      text: resolved.text,
    })
  }

  addDropPayload(payload: CanvasDropPayload, point: CanvasPoint, options: CanvasAddNodeOptions = {}): ProjectCanvas | null {
    const current = this.getScene()
    const ref = payload.ref.trim()
    if (!current || !ref) return current
    const existing = current.nodes.find(node => node.ref === ref)
    if (existing) {
      this.focusNode(existing.id)
      return current
    }
    const type = payload.nodeType ?? 'text'
    const resolved = this.specs.get(type).resolveDrop(ref) ?? { ref }
    return this.createNode({
      ...options,
      type,
      center: point,
      ref: resolved.ref ?? ref,
      title: payload.title ?? resolved.title,
      text: payload.text ?? resolved.text,
    })
  }

  allocateNodeId(prefix: string): string {
    return nextId(prefix, this.sceneStore?.getSnapshot().nodeOrder ?? [])
  }

  geometryForNode(nodeType: ProjectCanvasNode['type']): { width: number; height: number; minWidth: number; minHeight: number } {
    return { ...this.specs.get(nodeType).geometry }
  }

  deleteNodes(nodeIds: readonly string[]): ProjectCanvas | null {
    const deletable = new Set(nodeIds.filter(nodeId => nodeId !== 'project_overview'))
    if (deletable.size === 0) return this.getScene()
    return this.commitScene('Delete Canvas membership', canvas => ({
      ...canvas,
      nodes: canvas.nodes.filter(node => !deletable.has(node.id)),
      edges: canvas.edges.filter(edge => !deletable.has(edge.from) && !deletable.has(edge.to)),
    }))
  }

  deleteEdge(edgeId: string): ProjectCanvas | null {
    return this.commitScene('Delete edge', canvas => ({
      ...canvas,
      edges: canvas.edges.filter(edge => edge.id !== edgeId),
    }))
  }

  createConnection(fromNodeId: string, toNodeId: string, kind: ProjectCanvasEdgeKind): ProjectCanvas | null {
    if (fromNodeId === toNodeId) return this.getScene()
    const current = this.getScene()
    if (!current || current.edges.some(edge => edge.from === fromNodeId && edge.to === toNodeId)) return current
    const edgeId = nextId('edge', current.edges.map(edge => edge.id))
    const result = this.commitScene('Connect nodes', canvas => ({
      ...canvas,
      edges: [...canvas.edges, { id: edgeId, from: fromNodeId, to: toNodeId, kind }],
    }))
    this.selectEdge(edgeId)
    return result
  }

  reconnectEdge(edgeId: string, toNodeId: string): ProjectCanvas | null {
    const current = this.getScene()
    const edge = current?.edges.find(item => item.id === edgeId)
    if (!current || !edge || edge.to === toNodeId || !current.nodes.some(node => node.id === toNodeId)) return current
    return this.commitScene('Reconnect edge', canvas => ({
      ...canvas,
      edges: canvas.edges.map(item => item.id === edgeId ? { ...item, to: toNodeId } : item),
    }))
  }

  groupSelection(title = 'Group'): ProjectCanvas | null {
    const current = this.getScene()
    const selectedIds = new Set(this.selection.getSnapshot().selectedNodeIds)
    const selected = current?.nodes.filter(node => selectedIds.has(node.id) && node.type !== 'group') ?? []
    if (!current || selected.length === 0) return current
    const minX = Math.min(...selected.map(node => node.x)) - 24
    const minY = Math.min(...selected.map(node => node.y)) - 36
    const maxX = Math.max(...selected.map(node => node.x + node.width)) + 24
    const maxY = Math.max(...selected.map(node => node.y + node.height)) + 24
    const groupId = nextId('group', current.nodes.map(node => node.id))
    const group: ProjectCanvasNode = {
      id: groupId,
      type: 'group',
      title,
      x: minX,
      y: minY,
      width: Math.max(240, maxX - minX),
      height: Math.max(140, maxY - minY),
    }
    const result = this.commitScene('Group nodes', canvas => ({
      ...canvas,
      nodes: [group, ...canvas.nodes.map(node => selectedIds.has(node.id) ? { ...node, parentId: groupId } : node)],
    }))
    this.selection.setActiveGroup(groupId)
    this.selectNodes([groupId], groupId)
    return result
  }

  copySelection(): void {
    const scene = this.sceneStore
    if (!scene) return
    const ids = new Set(this.selection.getSnapshot().selectedNodeIds)
    this.clipboard = scene.nodes().filter(node => ids.has(node.id)).map(node => ({ ...node }))
  }

  pasteSelection(offset = 28): ProjectCanvas | null {
    if (!this.sceneStore || this.clipboard.length === 0) return this.getScene()
    const pasted = this.clipboard.map((node, index) => ({
      ...node,
      id: nextId(node.type, [...this.sceneStore!.getSnapshot().nodeOrder, ...this.clipboard.map(item => `${item.id}_${index}`)]),
      x: node.x + offset,
      y: node.y + offset,
    }))
    const result = this.commitScene('Paste nodes', canvas => ({ ...canvas, nodes: [...canvas.nodes, ...pasted] }))
    this.selectNodes(pasted.map(node => node.id), pasted.at(-1)?.id ?? null)
    return result
  }

  beginGesture(kind: CanvasGestureKind, input: CanvasPointerInput): CanvasGestureSnapshot {
    const scene = this.getScene()
    if (!scene) return this.tools.getSnapshot()
    const effectiveKind = input.spaceOverride || this.tools.isHandOverrideActive() ? 'pan' : kind
    const startNodes: Record<string, ProjectCanvasNode> = {}
    const gestureNodeIds = effectiveKind === 'drag'
      ? this.selection.getSnapshot().selectedNodeIds
      : effectiveKind === 'resize' && input.targetId ? [input.targetId] : []
    for (const nodeId of gestureNodeIds) {
      const node = this.sceneStore?.node(nodeId)
      if (node) startNodes[node.id] = node
    }
    this.gestureContext = {
      before: scene,
      kind: effectiveKind,
      startScreen: { ...input.point },
      startViewport: { ...scene.viewport },
      startNodes,
      nodeId: input.targetId ?? null,
      additive: input.shiftKey === true,
    }
    this.overlays.setSnapGuides([], false)
    if (effectiveKind === 'drag') this.selection.setMode('dragging')
    if (effectiveKind === 'resize') this.selection.setMode('resizing')
    if (effectiveKind === 'connect') this.selection.setMode('connecting')
    if (effectiveKind === 'marquee' || effectiveKind === 'group') this.selection.setMode('marquee')
    if (effectiveKind === 'pan') this.selection.setMode('dragging')
    return this.tools.begin(kind, input)
  }

  beginNodeDrag(nodeId: string, point: CanvasPoint, pointerId?: number): CanvasGestureSnapshot {
    if (!this.selection.contains(nodeId)) this.selectNodes([nodeId], nodeId)
    return this.beginGesture('drag', { point, pointerId, targetId: nodeId })
  }

  beginNodeResize(nodeId: string, point: CanvasPoint, pointerId?: number): CanvasGestureSnapshot {
    if (!this.selection.contains(nodeId)) this.selectNodes([nodeId], nodeId)
    return this.beginGesture('resize', { point, pointerId, targetId: nodeId })
  }

  beginPan(point: CanvasPoint, pointerId?: number): CanvasGestureSnapshot {
    return this.beginGesture('pan', { point, pointerId, spaceOverride: true })
  }

  beginMarquee(point: CanvasPoint, pointerId?: number): CanvasGestureSnapshot {
    return this.beginGesture('marquee', { point, pointerId })
  }

  beginGroup(point: CanvasPoint, pointerId?: number): CanvasGestureSnapshot {
    return this.beginGesture('group', { point, pointerId })
  }

  beginConnection(fromNodeId: string, point: CanvasPoint, pointerId?: number): CanvasGestureSnapshot {
    return this.beginGesture('connect', { point, pointerId, targetId: fromNodeId })
  }

  attachPointerSource(
    source: CanvasPointerEventSource,
    resolveTarget: (event: PointerEvent) => string | null,
    connectKind: ProjectCanvasEdgeKind,
    onFinish?: (details: { gesture: CanvasGestureSnapshot; targetNodeId: string | null }) => void,
  ): () => void {
    const handlePointerMove = (event: PointerEvent) => {
      if (this.tools.getSnapshot().phase !== 'idle') {
        this.updatePointer(this.viewport.clientToScreen({ x: event.clientX, y: event.clientY }))
      }
    }
    const handlePointerUp = (event: PointerEvent) => {
      const gesture = this.tools.getSnapshot()
      if (gesture.phase === 'idle') return
      const targetNodeId = resolveTarget(event)
      this.finishGesture(targetNodeId, connectKind)
      onFinish?.({ gesture, targetNodeId })
    }
    source.addEventListener('pointermove', handlePointerMove)
    source.addEventListener('pointerup', handlePointerUp)
    return () => {
      source.removeEventListener('pointermove', handlePointerMove)
      source.removeEventListener('pointerup', handlePointerUp)
    }
  }

  updatePointer(point: CanvasPoint): CanvasGestureSnapshot {
    const gesture = this.tools.update(point)
    const context = this.gestureContext
    if (!context || !this.sceneStore || !gesture.start) return gesture
    const dx = point.x - context.startScreen.x
    const dy = point.y - context.startScreen.y
    if (context.kind === 'pan') {
      this.viewport.scheduleCamera({ x: context.startViewport.x + dx, y: context.startViewport.y + dy })
      return gesture
    }
    const zoom = context.startViewport.zoom
    const patches: CanvasNodeGeometryPatch[] = []
    for (const startNode of Object.values(context.startNodes)) {
      if (context.kind === 'resize' && startNode.id === context.nodeId) {
        const geometry = this.specs.getForNode(startNode).geometry
        patches.push({
          id: startNode.id,
          width: Math.max(geometry.minWidth, startNode.width + dx / zoom),
          height: Math.max(geometry.minHeight, startNode.height + dy / zoom),
        })
        continue
      }
      if (context.kind === 'drag') {
        patches.push({ id: startNode.id, x: startNode.x + dx / zoom, y: startNode.y + dy / zoom })
      }
    }
    const snapped = this.snapGeometry(context, patches, zoom)
    this.sceneStore.patchNodeGeometry(snapped.patches)
    if (gesture.phase === 'active') {
      this.overlays.setSnapGuides(snapped.guides, false)
    } else {
      this.overlays.setSnapGuides([], false)
    }
    this.updateSelectionOverlay(false)
    this.overlays.setActive(this.activeOverlayKinds(), false)
    this.overlays.setFocusOwner('canvas', false)
    this.publishImmediate()
    return gesture
  }

  finishGesture(targetNodeId: string | null = null, connectKind: ProjectCanvasEdgeKind = 'related'): ProjectCanvas | null {
    const context = this.gestureContext
    if (!context) return this.getScene()
    const gesture = this.tools.getSnapshot()
    this.gestureContext = null
    this.sceneStore?.finalizePatchedGeometry()
    this.overlays.setSnapGuides([], false)
    let result = this.getScene()
    if (context.kind === 'pan') {
      this.viewport.flush()
      result = this.getScene()
    }
    if (context.kind === 'connect' && targetNodeId && context.nodeId) {
      result = this.createConnection(context.nodeId, targetNodeId, connectKind)
    } else if ((context.kind === 'marquee' || context.kind === 'group') && gesture.phase === 'pressed') {
      if (context.kind === 'marquee') this.clearSelection()
    } else if ((context.kind === 'marquee' || context.kind === 'group') && gesture.start && gesture.current) {
      const start = this.viewport.screenToCanvas(gesture.start)
      const end = this.viewport.screenToCanvas(gesture.current)
      const bounds = {
        minX: Math.min(start.x, end.x),
        minY: Math.min(start.y, end.y),
        maxX: Math.max(start.x, end.x),
        maxY: Math.max(start.y, end.y),
      }
      const ids = this.sceneStore?.query(bounds)
        .filter(node => node.x >= bounds.minX && node.y >= bounds.minY && node.x + node.width <= bounds.maxX && node.y + node.height <= bounds.maxY)
        .map(node => node.id) ?? []
      this.selectNodes(ids, ids.at(-1) ?? null, context.additive)
      if (context.kind === 'group') result = this.groupSelection()
    } else if (context.kind === 'drag') {
      result = this.commitGesture('Drag nodes', context.before)
    } else if (context.kind === 'resize') {
      result = this.commitGesture('Resize node', context.before)
    }
    this.tools.commit()
    this.selection.setMode('idle')
    this.updateSelectionOverlay(false)
    this.overlays.setActive(this.activeOverlayKinds(), false)
    this.publishImmediate()
    return gesture.phase === 'pressed' && context.kind !== 'connect' ? context.before : result
  }

  cancelGesture(): ProjectCanvas | null {
    const context = this.gestureContext
    if (!context) return null
    this.gestureContext = null
    this.tools.cancel()
    this.overlays.setSnapGuides([], false)
    this.selection.setMode('idle')
    this.viewport.scheduleCamera(context.startViewport)
    this.viewport.flush()
    this.sceneStore?.replace(context.before)
    this.updateSelectionOverlay(false)
    this.overlays.setActive(this.activeOverlayKinds(), false)
    this.publishImmediate()
    return context.before
  }

  escape(): 'gesture' | 'overlay' | 'editing' | 'selection' | 'idle' {
    if (this.gestureContext) {
      this.cancelGesture()
      return 'gesture'
    }
    const activeOverlay = this.overlays.getSnapshot().active
    if (activeOverlay.some(kind => kind === 'menu' || kind === 'comment' || kind === 'toolbar')) {
      this.overlays.dismissTop()
      return 'overlay'
    }
    if (this.selection.getSnapshot().editingNodeId) {
      this.endEditing()
      return 'editing'
    }
    if (this.selection.getSnapshot().primary) {
      this.clearSelection()
      return 'selection'
    }
    return 'idle'
  }

  undo(): ProjectCanvas | null {
    const current = this.getScene()
    if (!current) return null
    const previous = this.history.undo(current)
    if (!previous) return null
    this.sceneStore?.replace(previous)
    this.persist(previous, 'structural')
    return previous
  }

  redo(): ProjectCanvas | null {
    const current = this.getScene()
    if (!current) return null
    const next = this.history.redo(current)
    if (!next) return null
    this.sceneStore?.replace(next)
    this.persist(next, 'structural')
    return next
  }

  zoomAtScreenPoint(point: CanvasPoint, zoom: number): void {
    this.viewport.zoomAtScreenPoint(point, zoom)
  }

  zoomBy(delta: number): void {
    const camera = this.viewport.getCamera()
    this.viewport.scheduleCamera({ zoom: camera.zoom + delta })
  }

  panBy(screenDelta: CanvasPoint): void {
    const camera = this.viewport.getCamera()
    this.viewport.scheduleCamera({ x: camera.x + screenDelta.x, y: camera.y + screenDelta.y })
  }

  fitToContent(): void {
    this.viewport.fitToBounds(this.sceneStore?.getSnapshot().bounds ?? null)
    this.viewport.flush()
  }

  fitToSelection(): void {
    this.viewport.fitToSelection(this.selection.getSnapshot().bounds)
    this.viewport.flush()
  }

  focusNode(nodeId: string, persist = false): void {
    const node = this.sceneStore?.node(nodeId)
    if (!node) return
    this.selectNodes([nodeId], nodeId)
    this.viewport.focusOnBounds({ minX: node.x, minY: node.y, maxX: node.x + node.width, maxY: node.y + node.height })
    if (persist) this.viewport.flush()
  }

  autoLayout(): ProjectCanvas | null {
    const result = this.commitScene('Auto-layout', autoLayoutCanvas)
    this.viewport.fitToBounds(result ? { minX: Math.min(...result.nodes.map(node => node.x)), minY: Math.min(...result.nodes.map(node => node.y)), maxX: Math.max(...result.nodes.map(node => node.x + node.width)), maxY: Math.max(...result.nodes.map(node => node.y + node.height)) } : null)
    this.viewport.flush()
    return result
  }

  async persist(canvas: ProjectCanvas | null, reason: ProjectCanvasPersistenceReason): Promise<void> {
    if (!canvas) return
    this.savingValue = true
    this.publish()
    try {
      await this.persistence.persist(canvas, reason)
      if (reason !== 'viewport') await this.refreshReferences(canvas)
      this.errorValue = null
    } catch (error) {
      this.errorValue = error instanceof Error ? error.message : String(error)
      this.statusValue = 'error'
    } finally {
      this.savingValue = false
      this.publish()
    }
  }

  private async refreshReferences(canvas: ProjectCanvas): Promise<void> {
    const request = this.referenceRequest + 1
    this.referenceRequest = request
    try {
      const result = await this.persistence.resolveReferences(canvas)
      if (request !== this.referenceRequest) return
      this.refsValue = result.refs.map(ref => ({ ...ref }))
      this.refDiagnosticsValue = result.diagnostics.map(diagnostic => ({ ...diagnostic }))
      this.publishImmediate()
    } catch {
      // Reference failures are recoverable; retain the last known resolution.
    }
  }

  private commitGesture(label: string, before: ProjectCanvas): ProjectCanvas | null {
    const after = this.getScene()
    if (!after) return null
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      this.history.record(label, before, after)
      void this.persist(after, 'structural')
    }
    return after
  }

  private buildNode(
    options: CanvasNodeCreationOptions,
    geometry = this.specs.get(options.type).geometry,
    idPrefix: string = options.type,
  ): ProjectCanvasNode {
    const spec = this.specs.get(options.type)
    const resolved = options.ref ? spec.resolveDrop(options.ref) : null
    const center = options.center ?? this.canvasCenter(geometry.width, geometry.height)
    return {
      id: this.allocateNodeId(idPrefix),
      type: options.type,
      ref: options.ref ?? resolved?.ref,
      title: options.title ?? resolved?.title,
      text: options.text ?? resolved?.text,
      completed: options.completed,
      x: center.x - geometry.width / 2,
      y: center.y - geometry.height / 2,
      width: geometry.width,
      height: geometry.height,
    }
  }

  private mutateScene(
    updater: (canvas: ProjectCanvas) => ProjectCanvas,
    options: { history: boolean; persistence: ProjectCanvasPersistenceReason | null; label: string },
  ): ProjectCanvas | null {
    if (!this.sceneStore) return null
    const result = this.sceneStore.update(updater)
    if (!result.changed) return result.after
    if (options.history) this.history.record(options.label, result.before, result.after)
    if (options.persistence) void this.persist(result.after, options.persistence)
    this.publish()
    return result.after
  }

  private updateSelectionOverlay(notify = true): void {
    const scene = this.sceneStore
    if (!scene) return
    const selection = this.selection.getSnapshot()
    const ids = new Set(this.selection.getSnapshot().selectedNodeIds)
    const selectedNodes = [...ids].flatMap(nodeId => {
      const node = scene.node(nodeId)
      return node ? [node] : []
    })
    const primary = selection.primary?.kind === 'node' ? scene.node(selection.primary.id) : null
    const toolbarWidth = primary && selection.mode === 'idle'
      ? Math.max(128, Math.min(280, this.specs.getForNode(primary).toolbarActions.length * 32 + 12))
      : 0
    this.overlays.positionForNodes(selectedNodes, this.viewport, notify, selection.primary?.kind === 'node'
        ? selection.primary.id
        : null, node => this.specs.getForNode(node).canResize, toolbarWidth)
    this.overlays.setActive(this.activeOverlayKinds(), notify)
  }

  private activeOverlayKinds(): ('selection' | 'resize' | 'connection' | 'toolbar' | 'menu' | 'comment' | 'snap')[] {
    const selection = this.selection.getSnapshot()
    const gesture = this.tools.getSnapshot()
    const kinds: ('selection' | 'resize' | 'connection' | 'toolbar' | 'menu' | 'comment' | 'snap')[] = []
    if (selection.selectedNodeIds.length > 0 || selection.selectedEdgeIds.length > 0) kinds.push('selection')
    if (gesture.phase === 'idle' && selection.mode === 'idle' && selection.selectedNodeIds.length > 0) {
      kinds.push('resize', 'toolbar')
    }
    if (gesture.kind === 'connect' && gesture.phase !== 'idle') kinds.push('connection')
    if (this.overlays.getSnapshot().snapGuides.length > 0 && gesture.phase === 'active') kinds.push('snap')
    return kinds
  }

  private snapGeometry(
    context: GestureContext,
    patches: readonly CanvasNodeGeometryPatch[],
    zoom: number,
  ): { patches: CanvasNodeGeometryPatch[]; guides: CanvasOverlayGuide[] } {
    if (!this.sceneStore || (context.kind !== 'drag' && context.kind !== 'resize')) return { patches: [...patches], guides: [] }
    const movedIds = new Set(Object.keys(context.startNodes))
    const anchorId = context.nodeId ?? Object.keys(context.startNodes)[0]
    const anchor = patches.find(patch => patch.id === anchorId)
    const startAnchor = anchorId ? context.startNodes[anchorId] : undefined
    if (!anchor || !startAnchor) return { patches: [...patches], guides: [] }
    const proposed = {
      x: anchor.x ?? startAnchor.x,
      y: anchor.y ?? startAnchor.y,
      width: anchor.width ?? startAnchor.width,
      height: anchor.height ?? startAnchor.height,
    }
    const tolerance = SNAP_DISTANCE_PX / Math.max(zoom, 0.01)
    const candidateBounds = {
      minX: proposed.x - tolerance,
      minY: proposed.y - tolerance,
      maxX: proposed.x + proposed.width + tolerance,
      maxY: proposed.y + proposed.height + tolerance,
    }
    const candidates = this.sceneStore.query(candidateBounds).filter(candidate => !movedIds.has(candidate.id))
    const xFeatures = context.kind === 'resize'
      ? [{ value: proposed.x + proposed.width, edge: 'end' as const }]
      : alignmentFeatures(proposed.x, proposed.width)
    const yFeatures = context.kind === 'resize'
      ? [{ value: proposed.y + proposed.height, edge: 'end' as const }]
      : alignmentFeatures(proposed.y, proposed.height)
    const candidateX = candidates.flatMap(candidate => alignmentFeatures(candidate.x, candidate.width).map(feature => ({ ...feature, node: candidate })))
    const candidateY = candidates.flatMap(candidate => alignmentFeatures(candidate.y, candidate.height).map(feature => ({ ...feature, node: candidate })))
    const closest = (moving: AlignmentFeature[], targets: Array<AlignmentFeature & { node: ProjectCanvasNode }>) => {
      let best: { delta: number; position: number } | null = null
      for (const source of moving) {
        for (const target of targets) {
          const delta = target.value - source.value
          if (Math.abs(delta) <= tolerance && (!best || Math.abs(delta) < Math.abs(best.delta))) best = { delta, position: target.value }
        }
      }
      return best
    }
    const x = closest(xFeatures, candidateX)
    const y = closest(yFeatures, candidateY)
    const dx = x?.delta ?? 0
    const dy = y?.delta ?? 0
    const nextPatches = patches.map(patch => ({
      ...patch,
      ...(context.kind === 'drag' ? { x: (patch.x ?? context.startNodes[patch.id]?.x ?? 0) + dx, y: (patch.y ?? context.startNodes[patch.id]?.y ?? 0) + dy } : {}),
      ...(context.kind === 'resize' ? { width: (patch.width ?? startAnchor.width) + dx, height: (patch.height ?? startAnchor.height) + dy } : {}),
    }))
    const guides: CanvasOverlayGuide[] = []
    if (x) guides.push({ orientation: 'vertical', position: this.viewport.canvasToScreen({ x: x.position, y: 0 }).x })
    if (y) guides.push({ orientation: 'horizontal', position: this.viewport.canvasToScreen({ x: 0, y: y.position }).y })
    return { patches: nextPatches, guides }
  }

  private selectedNodes(): ProjectCanvasNode[] {
    const scene = this.sceneStore
    if (!scene) return []
    return this.selection.getSnapshot().selectedNodeIds.flatMap(nodeId => {
      const node = scene.node(nodeId)
      return node ? [node] : []
    })
  }

  private makeSnapshot(): CanvasControllerSnapshot {
    return {
      status: this.statusValue,
      scene: this.sceneStore?.getCanvasSnapshot() ?? null,
      sceneSnapshot: this.sceneStore?.getSnapshot() ?? null,
      viewport: this.viewport.getSnapshot(),
      selection: this.selection.getSnapshot(),
      gesture: this.tools.getSnapshot(),
      tool: this.tools.effectiveTool(),
      layers: this.layers,
      specs: this.specs,
      overlay: this.overlays.getSnapshot(),
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      historyDomain: this.history.activeDomain,
      saving: this.savingValue,
      error: this.errorValue,
      refs: this.refsValue,
      refDiagnostics: this.refDiagnosticsValue,
      revision: this.revision,
    }
  }

  private publish(): void {
    if (this.notifyFrame !== null) return
    const callback = () => {
      this.notifyFrame = null
      this.revision += 1
      this.snapshotValue = this.makeSnapshot()
      for (const listener of this.listeners) listener()
    }
    if (typeof requestAnimationFrame === 'function') this.notifyFrame = requestAnimationFrame(callback)
    else this.notifyFrame = setTimeout(callback, 0)
  }

  private publishImmediate(): void {
    if (this.notifyFrame !== null) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.notifyFrame)
      else clearTimeout(this.notifyFrame)
      this.notifyFrame = null
    }
    this.revision += 1
    this.snapshotValue = this.makeSnapshot()
    for (const listener of this.listeners) listener()
  }
}
