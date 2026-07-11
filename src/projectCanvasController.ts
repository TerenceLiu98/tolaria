import { autoLayoutCanvas } from './components/project-canvas/projectCanvasDisplay'
import { CanvasHistoryManager, type CanvasHistoryDomain } from './canvasHistoryManager'
import { CanvasLayerManager } from './canvasLayerManager'
import { CanvasNodeSpecRegistry } from './canvasNodeSpecRegistry'
import { CanvasOverlayCoordinator, type CanvasOverlayHandle } from './canvasOverlayCoordinator'
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
  }

  screenToCanvas(point: CanvasPoint): CanvasPoint {
    return this.viewport.screenToCanvas(point)
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
    return this.layers.filterNodes(scene.query(viewport.renderBounds, retained), viewport.camera.zoom, retained)
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

  setActiveHistoryDomain(domain: CanvasHistoryDomain): void {
    this.history.setActiveDomain(domain)
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
      if (this.tools.getSnapshot().phase !== 'idle') this.updatePointer({ x: event.clientX, y: event.clientY })
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
    this.sceneStore.patchNodeGeometry(patches)
    return gesture
  }

  finishGesture(targetNodeId: string | null = null, connectKind: ProjectCanvasEdgeKind = 'related'): ProjectCanvas | null {
    const context = this.gestureContext
    if (!context) return this.getScene()
    const gesture = this.tools.getSnapshot()
    this.gestureContext = null
    this.sceneStore?.finalizePatchedGeometry()
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
    return gesture.phase === 'pressed' && context.kind !== 'connect' ? context.before : result
  }

  cancelGesture(): ProjectCanvas | null {
    const context = this.gestureContext
    if (!context) return null
    this.gestureContext = null
    this.tools.cancel()
    this.selection.setMode('idle')
    this.viewport.scheduleCamera(context.startViewport)
    this.viewport.flush()
    this.sceneStore?.replace(context.before)
    return context.before
  }

  escape(): 'gesture' | 'editing' | 'selection' | 'idle' {
    if (this.gestureContext) {
      this.cancelGesture()
      return 'gesture'
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
    this.overlays.positionForNodes(selectedNodes, this.viewport, notify, selection.primary?.kind === 'node'
      ? selection.primary.id
      : null)
    this.overlays.setActive(ids.size > 0 ? ['selection', 'resize', 'toolbar'] : [], notify)
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
