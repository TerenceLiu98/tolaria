import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CanvasHistoryManager } from './canvasHistoryManager'
import { CanvasLayerManager } from './canvasLayerManager'
import { CanvasNodeSpecRegistry } from './canvasNodeSpecRegistry'
import { CanvasOverlayCoordinator } from './canvasOverlayCoordinator'
import { CanvasSceneStore } from './canvasSceneStore'
import { CanvasSelectionManager } from './canvasSelectionManager'
import { CanvasToolManager } from './canvasToolManager'
import { CanvasViewport } from './canvasViewport'
import { buildCanvasConnectorRoute, buildCanvasGraphicsCommandBatch } from './canvasGraphicsCommands'
import { defaultProjectCanvas, type ProjectCanvas, type ProjectCanvasReadResult, type ProjectCanvasResolveResult } from './projectCanvas'
import { ProjectCanvasController } from './projectCanvasController'
import { ProjectCanvasPersistenceAdapter } from './projectCanvasPersistenceAdapter'

function canvasWithNodes(): ProjectCanvas {
  return {
    ...defaultProjectCanvas('projects/alpha/project.md'),
    nodes: [
      { id: 'z', type: 'text', x: 900, y: 900, width: 100, height: 100, text: 'z' },
      { id: 'a', type: 'note', x: 0, y: 0, width: 200, height: 100, ref: 'notes/a.md' },
    ],
    edges: [],
  }
}

function changed(canvas: ProjectCanvas, nodeId: string, x: number): ProjectCanvas {
  return { ...canvas, nodes: canvas.nodes.map(node => node.id === nodeId ? { ...node, x } : node) }
}

async function loadedController(initial: ProjectCanvas): Promise<ProjectCanvasController> {
  const persistence = new ProjectCanvasPersistenceAdapter({
    projectPath: initial.project,
    vaultPath: '/vault',
    deterministicWrites: false,
    read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready', canvas: initial }),
    create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready', canvas: initial }),
    resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
    save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready', canvas }),
    viewportDebounceMs: 0,
  })
  const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
  await controller.load()
  return controller
}

describe('CanvasViewport', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  it('round-trips coordinates and zooms around the pointer', () => {
    const viewport = new CanvasViewport({ x: 20, y: 30, zoom: 1 })
    viewport.setViewportSize({ width: 800, height: 600, left: 100, top: 50 })
    const canvasPoint = viewport.screenToCanvas({ x: 220, y: 230 })
    expect(viewport.canvasToScreen(canvasPoint)).toEqual({ x: 220, y: 230 })
    expect(viewport.clientToCanvas({ x: 320, y: 280 })).toEqual(canvasPoint)
    expect(viewport.canvasCenter(200, 100)).toEqual({ x: 280, y: 220 })

    viewport.zoomAtScreenPoint({ x: 400, y: 300 }, 2)
    viewport.flush()
    expect(viewport.canvasToScreen(viewport.screenToCanvas({ x: 400, y: 300 }))).toEqual({ x: 400, y: 300 })
  })

  it('clamps invalid camera input, fits content, and separates overscan from hit bounds', () => {
    const viewport = new CanvasViewport({ x: Number.NaN, y: Infinity, zoom: -5 }, 200)
    viewport.setViewportSize({ width: 800, height: 600 })
    expect(viewport.getCamera()).toEqual({ x: 0, y: 0, zoom: 0.35 })
    viewport.fitToBounds({ minX: 0, minY: 0, maxX: 1000, maxY: 500 })
    viewport.flush()
    const snapshot = viewport.getSnapshot()
    expect(snapshot.renderBounds.minX).toBeLessThan(snapshot.hitTestBounds.minX)
    expect(snapshot.renderBounds.maxX).toBeGreaterThan(snapshot.hitTestBounds.maxX)
    expect(snapshot.camera.zoom).toBeGreaterThan(0.35)
  })

  it('derives deterministic graphics bounds from scene bounds', () => {
    const viewport = new CanvasViewport()
    expect(viewport.graphicsBounds(null)).toEqual({ minX: -400, minY: -300, width: 1200, height: 900 })
    expect(viewport.graphicsBounds({ minX: 0, minY: 10, maxX: 1400, maxY: 1100 })).toEqual({
      minX: -240,
      minY: -230,
      width: 1880,
      height: 1570,
    })
  })
})

describe('CanvasSceneStore', () => {
  it('queries visible connectors through spatial candidates and retains selected edges', () => {
    const nodes = Array.from({ length: 1_000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: (index % 100) * 200,
      y: Math.floor(index / 100) * 200,
      width: 100,
      height: 80,
    }))
    const edges = nodes.slice(1).map((node, index) => ({
      id: `edge-${index}`,
      from: nodes[index].id,
      to: node.id,
      kind: 'related' as const,
    }))
    const store = new CanvasSceneStore({
      ...defaultProjectCanvas('Projects/demo/project.md'),
      nodes,
      edges,
    }, { normalize: false })

    const visible = store.queryEdges({ minX: 0, minY: 0, maxX: 450, maxY: 300 })
    expect(visible.map(edge => edge.id)).toEqual([
      'edge-0',
      'edge-1',
      'edge-2',
      'edge-99',
      'edge-100',
      'edge-101',
      'edge-102',
    ])
    expect(store.getDiagnostics().lastEdgeQueryCandidates).toBeLessThan(20)

    const retained = store.queryEdges(
      { minX: 0, minY: 0, maxX: 450, maxY: 300 },
      new Set(['edge-998']),
    )
    expect(retained.at(-1)?.id).toBe('edge-998')
    expect(store.incidentEdgeIds(new Set(['node-999']))).toEqual(['edge-998'])
  })

  it('updates connector spatial cells incrementally with pointer geometry', () => {
    const store = new CanvasSceneStore({
      ...defaultProjectCanvas('Projects/demo/project.md'),
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 80 },
        { id: 'b', type: 'text', x: 200, y: 0, width: 100, height: 80 },
      ],
      edges: [{ id: 'edge-1', from: 'a', to: 'b', kind: 'related' }],
    }, { normalize: false })

    expect(store.queryEdges({ minX: 0, minY: 0, maxX: 300, maxY: 100 })).toHaveLength(1)
    store.patchNodeGeometry([{ id: 'a', x: 5_000 }, { id: 'b', x: 5_200 }])
    expect(store.queryEdges({ minX: 0, minY: 0, maxX: 300, maxY: 100 })).toHaveLength(0)
    expect(store.queryEdges({ minX: 5_000, minY: 0, maxX: 5_300, maxY: 100 })).toHaveLength(1)
    expect(store.getDiagnostics().fullRebuilds).toBe(1)
  })

  it('retains a routed connector when only its bounded detour enters the viewport', () => {
    const store = new CanvasSceneStore({
      ...defaultProjectCanvas('Projects/demo/project.md'),
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 560, width: 100, height: 80 },
        { id: 'b', type: 'text', x: 800, y: 560, width: 100, height: 80 },
        { id: 'obstacle', type: 'text', x: 300, y: 520, width: 160, height: 160 },
      ],
      edges: [{ id: 'edge-1', from: 'a', to: 'b', kind: 'related', routing: 'orthogonal' }],
    }, { normalize: false })

    expect(store.queryEdges({ minX: 400, minY: 490, maxX: 450, maxY: 510 })).toEqual([
      expect.objectContaining({ id: 'edge-1' }),
    ])
    expect(store.getDiagnostics().lastEdgeQueryCandidates).toBe(1)
  })

  it('builds bounded graphics command batches without renderer-specific state', () => {
    const store = new CanvasSceneStore({
      ...defaultProjectCanvas('Projects/demo/project.md'),
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 80 },
        { id: 'b', type: 'text', x: 200, y: 100, width: 100, height: 80 },
      ],
      edges: [{
        id: 'edge-1', from: 'a', to: 'b', kind: 'related', label: 'supports',
        strokeStyle: 'dashed', strokeWidth: 4, fromMarker: 'circle', toMarker: 'arrow',
      }],
    }, { normalize: false })
    const batch = buildCanvasGraphicsCommandBatch(
      store.getSnapshot(),
      store.queryEdges({ minX: 0, minY: 0, maxX: 400, maxY: 300 }),
      new Set(['edge-1']),
    )

    expect(batch.connectors).toEqual([{
      edgeId: 'edge-1',
      from: { x: 100, y: 40 },
      fromAnchorId: 'right',
      fromMarker: 'circle',
      label: 'supports',
      labelPoint: { x: 150, y: 90 },
      route: { kind: 'straight', points: [{ x: 100, y: 40 }, { x: 200, y: 140 }] },
      selected: true,
      strokeStyle: 'dashed',
      strokeWidth: 4,
      to: { x: 200, y: 140 },
      toAnchorId: 'left',
      toMarker: 'arrow',
    }])
  })

  it('builds renderer-independent straight, orthogonal, and curved connector routes', () => {
    const from = { x: 100, y: 40 }
    const to = { x: 300, y: 240 }
    expect(buildCanvasConnectorRoute(from, to, 'straight', 'right', 'left')).toEqual({
      kind: 'straight',
      points: [from, to],
    })
    expect(buildCanvasConnectorRoute(from, to, 'orthogonal', 'right', 'left')).toEqual({
      kind: 'orthogonal',
      points: [from, { x: 200, y: 40 }, { x: 200, y: 240 }, to],
    })
    expect(buildCanvasConnectorRoute(from, to, 'curved', 'right', 'left')).toEqual({
      control1: { x: 200, y: 40 },
      control2: { x: 200, y: 240 },
      kind: 'curved',
      points: [from, to],
    })
    expect(buildCanvasConnectorRoute(from, { x: 300, y: 40 }, 'orthogonal', 'right', 'left', [{
      id: 'obstacle',
      type: 'text',
      x: 150,
      y: 20,
      width: 100,
      height: 80,
    }])).toEqual({
      kind: 'orthogonal',
      points: [
        from,
        { x: 120, y: 40 },
        { x: 120, y: 0 },
        { x: 280, y: 0 },
        { x: 280, y: 40 },
        { x: 300, y: 40 },
      ],
    })
  })
  it('keeps 1,000-node viewport queries bounded', () => {
    const nodes = Array.from({ length: 1000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: (index % 50) * 80,
      y: Math.floor(index / 50) * 80,
      width: 48,
      height: 48,
    }))
    const store = new CanvasSceneStore({ ...defaultProjectCanvas('projects/medium/project.md'), nodes, edges: [] })
    store.query({ minX: 800, minY: 800, maxX: 850, maxY: 850 })
    expect(store.getDiagnostics().lastQueryCandidates).toBeLessThan(1000)
  })

  it('queries a deterministic 5,000-node scene through spatial candidates', () => {
    const nodes = Array.from({ length: 5000 }, (_, index) => ({
      id: `node-${String(index).padStart(4, '0')}`,
      type: 'text' as const,
      x: (index % 100) * 80,
      y: Math.floor(index / 100) * 80,
      width: 48,
      height: 48,
    }))
    const store = new CanvasSceneStore({
      ...defaultProjectCanvas('projects/large/project.md'),
      nodes,
      edges: [],
    })

    const result = store.query({ minX: 1600, minY: 1600, maxX: 1650, maxY: 1650 })
    expect(result.map(node => node.id)).toEqual(['node-2020'])
    expect(store.getDiagnostics().lastQueryCandidates).toBeLessThan(500)
  })

  it('normalizes the scene, serializes deterministically, and spatially queries/hit-tests', () => {
    const store = new CanvasSceneStore(canvasWithNodes())
    expect(store.serialize().nodes.map(node => node.id)).toEqual(['a', 'project_overview', 'z'])
    expect(store.query({ minX: -10, minY: -10, maxX: 250, maxY: 120 }).map(node => node.id))
      .toContain('a')
    expect(store.query({ minX: 850, minY: 850, maxX: 1100, maxY: 1100 }).map(node => node.id))
      .toContain('z')
    expect(store.hitTest({ x: 20, y: 20 })?.id).toBe('project_overview')
  })

  it('retains active nodes outside the rendered viewport', () => {
    const store = new CanvasSceneStore(canvasWithNodes())

    expect(store.query(
      { minX: -10, minY: -10, maxX: 250, maxY: 120 },
      new Set(['z']),
    ).map(node => node.id)).toContain('z')
  })

  it('retains connected nodes through the adjacency index without scanning the scene', () => {
    const canvas = canvasWithNodes()
    canvas.edges = [{ id: 'edge', from: 'a', to: 'z', kind: 'related' }]
    const store = new CanvasSceneStore(canvas)

    expect(store.connectedNodeIds(new Set(['a']))).toEqual(['z'])
    expect(store.query({ minX: 700, minY: 700, maxX: 1100, maxY: 1100 }, new Set(['a', 'z'])).map(node => node.id))
      .toEqual(['a', 'z'])
  })

  it('updates node geometry and spatial cells without rebuilding the full scene', () => {
    const store = new CanvasSceneStore(canvasWithNodes())
    const initialRebuilds = store.getDiagnostics().fullRebuilds

    store.patchNodeGeometry([{ id: 'a', x: 700, y: 100 }])

    expect(store.query({ minX: -10, minY: -10, maxX: 250, maxY: 120 }).map(node => node.id))
      .not.toContain('a')
    expect(store.query({ minX: 650, minY: 50, maxX: 950, maxY: 250 }).map(node => node.id))
      .toContain('a')
    expect(store.getDiagnostics()).toMatchObject({
      fullRebuilds: initialRebuilds,
      geometryPatchBatches: 1,
      geometryPatchedNodes: 1,
    })
  })
})

describe('CanvasSelectionManager and CanvasToolManager', () => {
  it('distinguishes selection, editing, and active gesture modes', () => {
    const selection = new CanvasSelectionManager()
    selection.selectNodes(['a'])
    expect(selection.getSnapshot().primary).toEqual({ kind: 'node', id: 'a' })
    selection.beginEditing('a')
    expect(selection.getSnapshot().mode).toBe('editing')
    selection.endEditing()
    expect(selection.getSnapshot().editingNodeId).toBeNull()

    const tools = new CanvasToolManager()
    tools.setSpacePressed(true)
    expect(tools.effectiveTool()).toBe('hand')
    tools.begin('drag', { point: { x: 10, y: 10 }, targetId: 'a' })
    expect(tools.getSnapshot().kind).toBe('pan')
    tools.update({ x: 30, y: 20 })
    expect(tools.getSnapshot().phase).toBe('active')
    expect(tools.commit().phase).toBe('committed')
    expect(tools.getSnapshot().phase).toBe('idle')

    tools.setSpacePressed(false)
    tools.begin('reconnect', { point: { x: 10, y: 20 }, targetId: 'edge-1', endpoint: 'to' })
    expect(tools.getSnapshot()).toMatchObject({
      kind: 'reconnect',
      targetId: 'edge-1',
      endpoint: 'to',
      phase: 'pressed',
    })
  })
})

describe('CanvasHistoryManager', () => {
  it('records one transaction per gesture and keeps document history separate', () => {
    const history = new CanvasHistoryManager()
    const initial = canvasWithNodes()
    const next = changed(initial, 'a', 100)
    expect(history.record('drag nodes', initial, next)).toBe(true)
    expect(history.canUndo).toBe(true)
    expect(history.undo(next)?.nodes.find(node => node.id === 'a')?.x).toBe(0)
    history.setActiveDomain('document')
    expect(history.record('BlockNote typing', initial, next, 'document')).toBe(false)
    expect(history.undo(next)).toBeNull()
  })
})

describe('Canvas layers, node specs, and overlays', () => {
  it('keeps graphics/document/overlay layers and stable screen-space controls', () => {
    const layers = new CanvasLayerManager()
    expect(layers.layers.map(layer => layer.kind)).toEqual(['graphics', 'document', 'overlay'])
    expect(layers.get('overlay').screenSpace).toBe(true)
    expect(layers.budget).toEqual({
      maxDomNodesAtLowZoom: 72,
      maxDocumentPreviewsAtLowZoom: 40,
      maxImagesAtLowZoom: 16,
    })
    const specs = new CanvasNodeSpecRegistry()
    expect(['note', 'paper', 'paper_block', 'image', 'text', 'task', 'group'].every(type => specs.has(type as ProjectCanvas['nodes'][number]['type']))).toBe(true)
    expect(specs.getForNode({ id: 'project_overview', type: 'note', x: 0, y: 0, width: 10, height: 10 }).key).toBe('overview')
    expect(specs.get('image').clipboard({ id: 'image', type: 'image', x: 0, y: 0, width: 10, height: 10 })).not.toBeNull()
    expect(specs.get('note').rendererAdapter.key).toBe('document')
    expect(specs.get('overview').rendererAdapter.key).toBe('overview')
    expect(specs.get('note').editorGeometry).toMatchObject({ width: 560, height: 420 })
    expect(specs.get('task').toolbarActions).toContain('toggle-complete')
    expect(specs.get('task').toolbarActions).toEqual(expect.arrayContaining(['connect', 'resize', 'toggle-complete', 'delete']))
    expect(specs.get('task').connectionAnchors({ id: 'task', type: 'task', x: 10, y: 20, width: 100, height: 80 }))
      .toEqual([
        { id: 'top', side: 'top', point: { x: 60, y: 20 } },
        { id: 'right', side: 'right', point: { x: 110, y: 60 } },
        { id: 'bottom', side: 'bottom', point: { x: 60, y: 100 } },
        { id: 'left', side: 'left', point: { x: 10, y: 60 } },
      ])
    expect(specs.get('paper_block').resolveDrop('@block[attention#b001]')).toEqual({ ref: '@block[attention#b001]' })
    expect(specs.get('image').resolveDrop('figure.png')).toEqual({ ref: 'figure.png', title: 'figure.png' })
    expect(specs.get('text').resolveDrop('plain text')).toEqual({ text: 'plain text' })

    const viewport = new CanvasViewport({ x: 10, y: 20, zoom: 0.5 })
    viewport.setViewportSize({ width: 400, height: 300 })
    const overlays = new CanvasOverlayCoordinator()
    overlays.setViewportBounds({ left: 0, top: 0, width: 400, height: 300 })
    const rect = overlays.positionForNodes([{ id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 80 }], viewport)
    expect(rect).toEqual({ left: 10, top: 20, width: 50, height: 40 })
    expect(overlays.getSnapshot().handleSize).toBe(8)
    expect(overlays.getSnapshot().zOrder).toEqual(['selection', 'snap', 'resize', 'connection', 'toolbar', 'comment', 'menu'])
    expect(overlays.getSnapshot().zIndices.toolbar).toBe(overlays.zIndexFor('toolbar'))
    expect(overlays.zIndexFor('toolbar')).toBeGreaterThan(overlays.zIndexFor('selection'))
    overlays.setActive(['selection', 'toolbar', 'menu'], false)
    overlays.setFocusOwner('overlay')
    expect(overlays.getSnapshot().focusOwner).toBe('overlay')
    expect(overlays.dismissTop()).toBe('menu')
    expect(overlays.getSnapshot().handles).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'connect', nodeId: 'a', left: 60, top: 40 }),
      expect.objectContaining({ kind: 'resize', nodeId: 'a', left: 60, top: 60 }),
    ]))
    expect(overlays.edgeEndpointHandles([{
      edgeId: 'edge-1',
      from: { x: 100, y: 40 },
      fromAnchorId: 'right',
      route: { kind: 'straight', points: [{ x: 100, y: 40 }, { x: 300, y: 40 }] },
      selected: true,
      to: { x: 300, y: 40 },
      toAnchorId: 'left',
    }], viewport)).toEqual([
      { kind: 'reconnect', edgeId: 'edge-1', endpoint: 'from', left: 60, top: 40 },
      { kind: 'reconnect', edgeId: 'edge-1', endpoint: 'to', left: 160, top: 40 },
    ])
    expect(overlays.positionForNodes([{ id: 'offscreen', type: 'text', x: -100, y: 0, width: 100, height: 80 }], viewport)).toEqual({
      left: 0,
      top: 20,
      width: 10,
      height: 40,
    })
  })

  it('publishes snap guides from spatial candidates only during an active drag', async () => {
    const initial = {
      ...canvasWithNodes(),
      nodes: [
        { id: 'moving', type: 'text' as const, x: 0, y: 0, width: 100, height: 100 },
        { id: 'target', type: 'text' as const, x: 220, y: 120, width: 100, height: 100 },
      ],
      edges: [],
    }
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      migrateOnLoad: false,
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence: adapter, migrateLoadedScene: false })
    await controller.load()
    controller.setViewportSize({ width: 800, height: 600 })
    controller.selectNodes(['moving'])
    controller.beginNodeDrag('moving', { x: 50, y: 50 })
    controller.updatePointer({ x: 165, y: 165 })

    await vi.waitFor(() => {
      expect(controller.getSnapshot().overlay.snapGuides).toEqual(expect.arrayContaining([
        expect.objectContaining({ orientation: 'vertical' }),
        expect.objectContaining({ orientation: 'horizontal' }),
      ]))
    })
    expect(controller.getScene()?.nodes.find(node => node.id === 'moving')).toMatchObject({ x: 120, y: 120 })

    controller.finishGesture()
    expect(controller.getSnapshot().overlay.snapGuides).toEqual([])
    controller.dispose()
  })

  it('snaps resize edges and restores the original geometry on cancellation', async () => {
    const initial = {
      ...canvasWithNodes(),
      nodes: [
        { id: 'moving', type: 'text' as const, x: 0, y: 0, width: 100, height: 100 },
        { id: 'target', type: 'text' as const, x: 220, y: 120, width: 100, height: 100 },
      ],
      edges: [],
    }
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      migrateOnLoad: false,
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence: adapter, migrateLoadedScene: false })
    await controller.load()
    controller.setViewportSize({ width: 800, height: 600 })
    controller.beginNodeResize('moving', { x: 100, y: 100 })
    controller.updatePointer({ x: 219, y: 219 })
    await vi.waitFor(() => {
      expect(controller.getSnapshot().overlay.snapGuides.length).toBeGreaterThan(0)
    })
    expect(controller.getScene()?.nodes.find(node => node.id === 'moving')).toMatchObject({ width: 220, height: 220 })
    controller.cancelGesture()
    expect(controller.getSnapshot().overlay.snapGuides).toEqual([])
    expect(controller.getScene()?.nodes.find(node => node.id === 'moving')).toMatchObject({ width: 100, height: 100 })
    controller.dispose()
  })

  it('dismisses overlay chrome without clearing selection and routes toolbar actions through the controller', async () => {
    const initial = canvasWithNodes()
    const adapter = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      migrateOnLoad: false,
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence: adapter, migrateLoadedScene: false })
    await controller.load()
    controller.selectNodes(['a'])
    expect(controller.getSnapshot().overlay.toolbarRect).not.toBeNull()
    expect(controller.dismissOverlayOutside({ x: 700, y: 500 })).toBe(true)
    expect(controller.getSnapshot().selection.primary).toEqual({ kind: 'node', id: 'a' })
    expect(controller.getSnapshot().overlay.toolbarRect).toBeNull()
    controller.executeNodeToolbarAction('delete', 'a')
    expect(controller.getScene()?.nodes.some(node => node.id === 'a')).toBe(false)
    controller.dispose()
  })

  it('enforces low-zoom budgets while retaining active nodes', () => {
    const layers = new CanvasLayerManager()
    const nodes = Array.from({ length: 200 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: index * 10,
      y: 0,
      width: 8,
      height: 8,
    }))
    const visible = layers.filterNodes(nodes, 0.4, new Set(['node-199']))
    expect(visible).toHaveLength(73)
    expect(visible.at(-1)?.id).toBe('node-199')
  })

  it('retains active, connected, and overlay-owned nodes in a 5,000-node low-zoom scene', () => {
    const layers = new CanvasLayerManager()
    const nodes = Array.from({ length: 5000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: index * 10,
      y: 0,
      width: 8,
      height: 8,
    }))
    const retained = new Set(['node-4900', 'node-4901', 'node-4902', 'node-4903'])
    const visible = layers.filterNodes(nodes, 0.4, retained)
    expect(visible).toHaveLength(76)
    expect(visible.map(node => node.id)).toEqual(expect.arrayContaining([...retained]))
  })
})

describe('ProjectCanvasPersistenceAdapter', () => {
  it('migrates on read, writes deterministic structural state, and debounces viewport state', async () => {
    vi.useFakeTimers()
    const source = canvasWithNodes()
    const saved: ProjectCanvas[] = []
    const adapter = new ProjectCanvasPersistenceAdapter({
      vaultPath: '/vault',
      projectPath: source.project,
      read: async () => ({
        projectPath: source.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: source,
      }),
      create: async () => ({
        projectPath: source.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: source,
      }),
      resolve: async () => ({ projectPath: source.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => {
        saved.push(canvas)
        return {
          projectPath: source.project,
          canvasPath: 'projects/alpha/project.canvas.json',
          state: 'ready' as const,
          canvas,
        }
      },
      viewportDebounceMs: 100,
    })

    const loaded = await adapter.load()
    expect(loaded.result.canvas?.nodes.map(node => node.id)).toEqual(['a', 'project_overview', 'z'])

    const unsorted = { ...source, nodes: [...source.nodes].reverse(), edges: [...source.edges].reverse() }
    const viewportWrite = adapter.persist(unsorted, 'viewport')
    await vi.advanceTimersByTimeAsync(99)
    expect(saved).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1)
    await viewportWrite
    expect(saved.at(-1)?.nodes.map(node => node.id)).toEqual(['a', 'project_overview', 'z'])

    const next = { ...unsorted, viewport: { x: 42, y: 24, zoom: 0.8 } }
    const pendingViewport = adapter.persist(unsorted, 'viewport')
    const structural = await adapter.persist(next, 'structural')
    await pendingViewport
    expect(structural?.canvas?.viewport).toEqual(next.viewport)
    expect(saved).toHaveLength(2)
    vi.useRealTimers()
  })
})

describe('ProjectCanvasController', () => {
  it('reconnects either connector endpoint as one cancellable history transaction', async () => {
    const initial: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 80 },
        { id: 'b', type: 'text', x: 300, y: 0, width: 100, height: 80 },
        { id: 'c', type: 'text', x: 300, y: 200, width: 100, height: 80 },
      ],
      edges: [{ id: 'edge-1', from: 'a', to: 'b', kind: 'related' }],
    }
    const controller = await loadedController(initial)
    controller.setViewportSize({ width: 800, height: 600 })
    controller.selectEdge('edge-1')

    controller.beginEdgeReconnect('edge-1', 'to', { x: 300, y: 40 })
    controller.updatePointer({ x: 350, y: 240 })
    expect(controller.queryVisibleGraphics()).toMatchObject({
      connectors: [],
      preview: { from: { x: 100, y: 40 }, to: { x: 350, y: 240 } },
    })
    controller.finishGesture('c')
    expect(controller.getScene()?.edges).toEqual([
      { id: 'edge-1', from: 'a', to: 'c', kind: 'related' },
    ])
    expect(controller.undo()?.edges).toEqual(initial.edges)
    expect(controller.getSnapshot().canUndo).toBe(false)

    controller.beginEdgeReconnect('edge-1', 'from', { x: 100, y: 40 })
    controller.updatePointer({ x: 500, y: 500 })
    controller.cancelGesture()
    expect(controller.getScene()?.edges).toEqual(initial.edges)
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.dispose()
  })

  it('rejects self and duplicate reconnection targets without recording history', async () => {
    const initial: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 80 },
        { id: 'b', type: 'text', x: 300, y: 0, width: 100, height: 80 },
        { id: 'c', type: 'text', x: 600, y: 0, width: 100, height: 80 },
      ],
      edges: [
        { id: 'edge-1', from: 'a', to: 'b', kind: 'related' },
        { id: 'edge-2', from: 'c', to: 'b', kind: 'related' },
      ],
    }
    const controller = await loadedController(initial)
    controller.beginEdgeReconnect('edge-1', 'from', { x: 100, y: 40 })
    controller.finishGesture('b')
    controller.beginEdgeReconnect('edge-1', 'from', { x: 100, y: 40 })
    controller.finishGesture('c')

    expect(controller.getScene()?.edges).toEqual(initial.edges)
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.dispose()
  })

  it('publishes indexed visible graphics and retains an offscreen selected connector', async () => {
    const nodes = Array.from({ length: 1_000 }, (_, index) => ({
      id: `node-${index}`,
      type: 'text' as const,
      x: (index % 100) * 200,
      y: Math.floor(index / 100) * 200,
      width: 100,
      height: 80,
    }))
    const initial = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes,
      edges: nodes.slice(1).map((node, index) => ({
        id: `edge-${index}`,
        from: nodes[index].id,
        to: node.id,
        kind: 'related' as const,
        ...(index === 0 ? { routing: 'orthogonal' as const } : {}),
      })),
    }
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready', canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready', canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready', canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false, viewportOverscan: 0 })
    await controller.load()
    controller.setViewportSize({ width: 500, height: 300 })

    expect(controller.queryVisibleGraphics().connectors.length).toBeLessThan(20)
    expect(controller.getSceneDiagnostics()?.lastEdgeQueryCandidates).toBeLessThan(20)
    expect(controller.getSceneDiagnostics()?.lastQueryCandidates).toBeLessThan(20)
    controller.selectEdge('edge-998')
    expect(controller.queryVisibleGraphics().connectors.at(-1)?.edgeId).toBe('edge-998')
    controller.selectNodes(['node-999'])
    expect(controller.queryVisibleGraphics().connectors.at(-1)?.edgeId).toBe('edge-998')
    controller.beginConnection('node-0', { x: 50, y: 40 })
    controller.updatePointer({ x: 400, y: 40 })
    expect(controller.queryVisibleGraphics().preview).toEqual({
      from: { x: 100, y: 40 },
      to: { x: 400, y: 40 },
    })
    controller.cancelGesture()
    controller.dispose()
  })

  it('uses actual focus ownership for undo and preserves Canvas history across editor focus transitions', async () => {
    const initial = canvasWithNodes()
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => ({
        projectPath: initial.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: initial,
      }),
      create: async () => ({
        projectPath: initial.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas: initial,
      }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({
        projectPath: initial.project,
        canvasPath: 'projects/alpha/project.canvas.json',
        state: 'ready' as const,
        canvas,
      }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()

    controller.updateNode('a', { x: 100 }, true)
    expect(controller.getSnapshot().historyDomain).toBe('canvas')
    controller.setFocusOwner('document')
    expect(controller.getSnapshot().historyDomain).toBe('document')
    expect(controller.undo()).toBeNull()
    controller.setFocusOwner('canvas')
    expect(controller.getSnapshot().historyDomain).toBe('canvas')
    expect(controller.undo()?.nodes.find(node => node.id === 'a')?.x).toBe(0)

    controller.setFocusOwner('document')
    controller.setFocusOwner('canvas')
    expect(controller.redo()?.nodes.find(node => node.id === 'a')?.x).toBe(100)
    controller.dispose()
  })

  it('constructs add and drop nodes through the controller using NodeSpec geometry', async () => {
    const initial = canvasWithNodes()
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()

    const task = controller.createNode({ type: 'task', center: { x: 500, y: 400 }, text: 'Review' })
    expect(task?.nodes.find(node => node.type === 'task')).toMatchObject({ x: 370, y: 325, width: 260, height: 150, text: 'Review' })
    const image = controller.addDropValue('figure.png', { x: 800, y: 500 })
    expect(image?.nodes.find(node => node.type === 'image')).toMatchObject({ ref: 'figure.png', title: 'figure.png' })
    const peek = controller.createPeekNode('note', 'notes/peek.md', 'Peek', 'a')
    expect(peek).toMatchObject({ type: 'note', ref: 'notes/peek.md', width: 560, height: 420, x: 280, y: 0 })
    controller.dispose()
  })

  it('retains selected, editing, connected, and overlay-owned nodes outside the render bounds', async () => {
    const initial = {
      ...canvasWithNodes(),
      nodes: [
        { id: 'selected', type: 'text' as const, x: 0, y: 0, width: 100, height: 100 },
        { id: 'connected', type: 'text' as const, x: 5000, y: 0, width: 100, height: 100 },
        { id: 'editing', type: 'text' as const, x: 6000, y: 0, width: 100, height: 100 },
        { id: 'overlay', type: 'text' as const, x: 7000, y: 0, width: 100, height: 100 },
      ],
      edges: [{ id: 'edge-1', from: 'selected', to: 'connected', kind: 'related' as const }],
    }
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      create: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas: initial }),
      resolve: async () => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', refs: [], diagnostics: [] }),
      save: async (_vault, _project, canvas) => ({ projectPath: initial.project, canvasPath: 'projects/alpha/project.canvas.json', state: 'ready' as const, canvas }),
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()
    controller.setViewportSize({ width: 300, height: 200 })
    controller.selectNodes(['selected'])
    const selectedIds = controller.queryVisibleNodes().map(node => node.id)
    expect(selectedIds).toEqual(expect.arrayContaining(['selected', 'connected']))
    controller.beginEditing('editing')
    controller.setOverlayOwnedNodes(['overlay'])
    const activeIds = controller.queryVisibleNodes().map(node => node.id)
    expect(activeIds).toEqual(expect.arrayContaining(['editing', 'overlay']))
    controller.dispose()
  })

  it('reparents nested groups without cycles and promotes children when a group is removed', async () => {
    const initial: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        { id: 'outer', type: 'group', x: 0, y: 0, width: 600, height: 500 },
        { id: 'inner', type: 'group', parentId: 'outer', x: 40, y: 60, width: 420, height: 320 },
        { id: 'a', type: 'text', parentId: 'inner', x: 80, y: 110, width: 100, height: 80 },
        { id: 'b', type: 'task', parentId: 'inner', x: 240, y: 110, width: 100, height: 80 },
        { id: 'outside', type: 'text', x: 700, y: 100, width: 100, height: 80 },
      ],
      edges: [{ id: 'edge_ab', from: 'a', to: 'b', kind: 'related' }],
    }
    const controller = await loadedController(initial)

    controller.enterGroup('inner')
    expect(controller.getSnapshot().selection.activeGroupId).toBe('inner')
    controller.exitGroup()
    expect(controller.getSnapshot().selection.activeGroupId).toBe('outer')

    const beforeCycle = controller.getScene()
    expect(controller.reparentNodes(['outer'], 'inner')).toEqual(beforeCycle)
    expect(controller.getScene()?.nodes.find(node => node.id === 'outer')?.parentId).toBeUndefined()

    controller.reparentNodes(['outside'], 'inner')
    expect(controller.getScene()?.nodes.find(node => node.id === 'outside')?.parentId).toBe('inner')
    expect(controller.undo()?.nodes.find(node => node.id === 'outside')?.parentId).toBeUndefined()

    controller.deleteNodes(['inner'])
    expect(controller.getScene()?.nodes.filter(node => ['a', 'b'].includes(node.id)).map(node => node.parentId))
      .toEqual(['outer', 'outer'])
    controller.dispose()
  })

  it('copies and pastes a group subtree with remapped edges as one history transaction', async () => {
    const initial: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        { id: 'outer', type: 'group', x: 0, y: 0, width: 600, height: 500 },
        { id: 'inner', type: 'group', parentId: 'outer', x: 40, y: 60, width: 420, height: 320 },
        { id: 'a', type: 'text', parentId: 'inner', x: 80, y: 110, width: 100, height: 80, text: 'A' },
        { id: 'b', type: 'task', parentId: 'inner', x: 240, y: 110, width: 100, height: 80, text: 'B' },
      ],
      edges: [{ id: 'edge_ab', from: 'a', to: 'b', kind: 'supports', routing: 'curved' }],
    }
    const controller = await loadedController(initial)
    const beforePaste = controller.getScene()!
    controller.selectNodes(['inner'])
    controller.copySelection()
    const pasted = controller.pasteSelection(32)
    const originalIds = new Set(beforePaste.nodes.map(node => node.id))
    const pastedNodes = pasted?.nodes.filter(node => !originalIds.has(node.id)) ?? []

    expect(pastedNodes).toHaveLength(3)
    const pastedGroup = pastedNodes.find(node => node.type === 'group')
    expect(pastedGroup?.parentId).toBeUndefined()
    const pastedChildren = pastedNodes.filter(node => node.type !== 'group')
    expect(pastedChildren.map(node => node.parentId)).toEqual([pastedGroup?.id, pastedGroup?.id])
    const pastedEdge = pasted?.edges.find(edge => edge.id !== 'edge_ab')
    expect(pastedEdge).toMatchObject({
      kind: 'supports',
      routing: 'curved',
    })
    expect(new Set([pastedEdge?.from, pastedEdge?.to])).toEqual(new Set(pastedChildren.map(node => node.id)))

    const undone = controller.undo()
    expect(undone?.nodes).toEqual(beforePaste.nodes)
    expect(undone?.edges).toEqual(beforePaste.edges)
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.dispose()
  })

  it('aligns, distributes, and reorders selected nodes as reversible transactions', async () => {
    const initial: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 30, width: 100, height: 80, zIndex: 0 },
        { id: 'b', type: 'text', x: 240, y: 80, width: 120, height: 80, zIndex: 1 },
        { id: 'c', type: 'text', x: 520, y: 140, width: 80, height: 80, zIndex: 2 },
        { id: 'untouched', type: 'text', x: 900, y: 300, width: 100, height: 80, zIndex: 9 },
      ],
      edges: [],
    }
    const controller = await loadedController(initial)
    controller.selectNodes(['a'])
    expect(controller.alignSelection('top')).toBeNull()
    expect(controller.distributeSelection('horizontal')).toBeNull()
    controller.clearSelection()
    expect(controller.arrangeSelection('front')).toBeNull()
    expect(controller.getSnapshot().canUndo).toBe(false)
    controller.selectNodes(['a', 'b', 'c'])

    controller.alignSelection('top')
    expect(controller.getScene()?.nodes.filter(node => ['a', 'b', 'c'].includes(node.id)).map(node => node.y))
      .toEqual([30, 30, 30])
    expect(controller.undo()?.nodes.find(node => node.id === 'b')?.y).toBe(80)

    controller.distributeSelection('horizontal')
    expect(controller.getScene()?.nodes.filter(node => ['a', 'b', 'c'].includes(node.id)).map(node => node.x))
      .toEqual([0, 250, 520])
    expect(controller.undo()).not.toBeNull()

    controller.arrangeSelection('front')
    const front = controller.getScene()!
    expect(front.nodes.filter(node => ['a', 'b', 'c'].includes(node.id)).map(node => node.zIndex))
      .toEqual([10, 11, 12])
    expect(new CanvasSceneStore(front).getSnapshot().nodeOrder.slice(-3)).toEqual(['a', 'b', 'c'])
    expect(controller.undo()?.nodes.filter(node => ['a', 'b', 'c'].includes(node.id)).map(node => node.zIndex))
      .toEqual([0, 1, 2])

    controller.arrangeSelection('back')
    expect(controller.getScene()?.nodes.filter(node => ['a', 'b', 'c'].includes(node.id)).map(node => node.zIndex))
      .toEqual([-3, -2, -1])
    expect(controller.getScene()?.nodes.find(node => node.id === 'untouched')?.zIndex).toBe(9)
    controller.dispose()
  })

  it('focuses nested groups and reparents a completed drag as one transaction', async () => {
    const initial: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        { id: 'outer', type: 'group', x: 0, y: 0, width: 600, height: 440, title: 'Outer' },
        { id: 'inner', type: 'group', parentId: 'outer', x: 80, y: 80, width: 320, height: 220, title: 'Inner' },
        { id: 'loose', type: 'text', x: 700, y: 80, width: 100, height: 80, text: 'Loose' },
      ],
      edges: [],
    }
    const controller = await loadedController(initial)
    controller.setViewportSize({ width: 1_000, height: 700 })

    controller.enterGroup('outer')
    expect(controller.getSnapshot().selection.activeGroupId).toBe('outer')
    const created = controller.createNode({ type: 'text', text: 'Nested by default' })
    const createdNode = created?.nodes.find(node => node.text === 'Nested by default')
    expect(createdNode?.parentId).toBe('outer')
    controller.undo()
    controller.enterGroup('inner')
    controller.exitGroup()
    expect(controller.getSnapshot().selection.activeGroupId).toBe('outer')
    controller.enterGroup('inner')
    controller.escape()
    expect(controller.getSnapshot().selection.activeGroupId).toBe('outer')

    controller.clearSelection()
    controller.beginNodeDrag('loose', { x: 750, y: 120 })
    controller.updatePointer({ x: 220, y: 160 })
    controller.finishGesture()

    expect(controller.getScene()?.nodes.find(node => node.id === 'loose')).toMatchObject({
      parentId: 'inner',
      x: 170,
      y: 120,
    })
    expect(controller.getSnapshot().selection.activeGroupId).toBe('inner')
    expect(controller.undo()?.nodes.find(node => node.id === 'loose')).toMatchObject({ x: 700, y: 80 })
    expect(controller.getSnapshot().canUndo).toBe(false)

    controller.clearSelection()
    controller.beginNodeDrag('outer', { x: 20, y: 20 })
    controller.updatePointer({ x: 180, y: 140 })
    controller.finishGesture()
    expect(controller.getScene()?.nodes.find(node => node.id === 'outer')?.parentId).toBeUndefined()
    controller.dispose()
  })

  it('routes scene mutations through transactions, supports cancellation, and persists structural changes', async () => {
    const saved: ProjectCanvas[] = []
    const initial = canvasWithNodes()
    const readResult = (): ProjectCanvasReadResult => ({
      projectPath: initial.project,
      canvasPath: 'projects/alpha/project.canvas.json',
      state: 'ready',
      canvas: initial,
    })
    const resolveResult = (): ProjectCanvasResolveResult => ({
      projectPath: initial.project,
      canvasPath: 'projects/alpha/project.canvas.json',
      refs: [{
        nodeId: 'a',
        nodeType: 'note',
        ref: 'notes/a.md',
        state: 'resolved',
        targetPath: 'notes/a.md',
      }],
      diagnostics: [],
    })
    const resolve = vi.fn(async () => resolveResult())
    const persistence = new ProjectCanvasPersistenceAdapter({
      projectPath: initial.project,
      vaultPath: '/vault',
      deterministicWrites: false,
      read: async () => readResult(),
      create: async () => readResult(),
      resolve,
      save: async (_vault, _project, canvas) => {
        saved.push(canvas)
        return readResult()
      },
      viewportDebounceMs: 0,
    })
    const controller = new ProjectCanvasController({ persistence, migrateLoadedScene: false })
    await controller.load()
    expect(controller.getSnapshot().refs).toEqual(resolveResult().refs)
    const initialRebuilds = controller.getSceneDiagnostics()?.fullRebuilds
    controller.selectNodes(['a'])
    controller.beginNodeDrag('a', { x: 0, y: 0 })
    controller.updatePointer({ x: 100, y: 50 })
    controller.updatePointer({ x: 120, y: 50 })
    expect(controller.getSceneDiagnostics()).toMatchObject({
      fullRebuilds: initialRebuilds,
      geometryPatchBatches: 2,
    })
    controller.finishGesture()
    await vi.waitFor(() => expect(saved.length).toBeGreaterThan(0))
    await vi.waitFor(() => expect(resolve).toHaveBeenCalledTimes(2))
    expect(saved.at(-1)?.nodes.find(node => node.id === 'a')?.x).toBe(120)
    expect(controller.getSnapshot().canUndo).toBe(true)

    expect(controller.undo()?.nodes.find(node => node.id === 'a')?.x).toBe(0)
    expect(controller.getSnapshot().canUndo).toBe(false)

    controller.beginNodeDrag('a', { x: 0, y: 50 })
    controller.updatePointer({ x: 80, y: 50 })
    controller.cancelGesture()
    expect(controller.getScene()?.nodes.find(node => node.id === 'a')?.x).toBe(0)

    controller.beginPan({ x: 50, y: 50 })
    controller.updatePointer({ x: 120, y: 80 })
    controller.cancelGesture()
    expect(controller.getSnapshot().viewport.camera).toEqual(initial.viewport)
    controller.dispose()
  })
})
