import type React from 'react'
import { CornersIn } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  PROJECT_OVERVIEW_NODE_ID,
  type ProjectCanvas,
  type ProjectCanvasEdgeKind,
  type ProjectCanvasNode,
  type ProjectCanvasNodeType,
} from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import type { AiSelectedTextContext } from '../../utils/ai-context'
import type { CreateProjectCanvasDraftNote } from '../../projectCanvasDrafts'
import type { PaperParserProvider } from '../../paper/parserSettings'
import { publishProjectCanvasSelection } from '../../projectCanvasSelectionStore'
import { ProjectCanvasController, type CanvasControllerSnapshot, type CanvasNodeCreationOptions } from '../../projectCanvasController'
import type { CanvasNodeToolbarAction } from '../../canvasNodeSpecRegistry'
import { ProjectCanvasPersistenceAdapter } from '../../projectCanvasPersistenceAdapter'
import { Button } from '../ui/button'
import {
  trackProjectCanvasCreated,
  trackProjectCanvasEdgeCreated,
  trackProjectCanvasFocusModeChanged,
  trackProjectCanvasNavigatorFocused,
  trackProjectCanvasNodeAdded,
  trackProjectCanvasOpened,
  trackProjectCanvasPeekOpened,
  trackProjectCanvasPeekPinned,
} from '../../lib/productAnalytics'
import { findEntryForProjectCanvasRef, relativeVaultPath } from './projectCanvasEntryPreview'
import { PROJECT_CANVAS_DRAG_MIME, readProjectCanvasDragPayload } from './projectCanvasDragData'
import { ProjectCanvasInspector } from './ProjectCanvasInspector'
import { CanvasEditorPortal } from './CanvasEditorPortal'
import { CanvasDocumentLayer } from './CanvasDocumentLayer'
import { CanvasGraphicsLayer } from './CanvasGraphicsLayer'
import { CanvasOverlayLayer } from './CanvasOverlayLayer'
import {
  consumeProjectCanvasNavigate,
  consumeProjectCanvasOpen,
  pendingProjectCanvasOpen,
  PROJECT_CANVAS_NAVIGATE_EVENT,
  PROJECT_CANVAS_OPEN_EVENT,
  type ProjectCanvasNavigateEvent,
  type ProjectCanvasOpenEvent,
} from './projectCanvasNavigation'
import {
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  nodePresentation,
} from './projectCanvasDisplay'
import { ProjectCanvasNodeCard } from './ProjectCanvasNodeCard'
import { ProjectCanvasNavigator } from './ProjectCanvasNavigator'
import { ProjectCanvasToolbar, type ProjectCanvasAddPanelMode } from './ProjectCanvasToolbar'
import { useProjectCanvasViewportSize } from './projectCanvasViewport'
import { useProjectCanvasAiDraft } from './useProjectCanvasAiDraft'
import { useProjectCanvasFocusMode } from './useProjectCanvasFocusMode'
import { useProjectCanvasPeek } from './useProjectCanvasPeek'
import './ProjectCanvasSurface.css'

interface ProjectCanvasSurfaceProps {
  editable?: boolean
  entry: VaultEntry
  entries: VaultEntry[]
  vaultPath?: string
  locale?: AppLocale
  onCopyFilePath?: (path: string) => void
  onContentChange?: (path: string, content: string) => void
  onCreateProjectDraftNote?: CreateProjectCanvasDraftNote
  onNavigateWikilink: (target: string) => void
  onOpenExternalFile?: (path: string) => void
  onParsePaper?: (paperId: string, options?: { force?: boolean }) => void | Promise<void>
  onRevealFile?: (path: string) => void
  onSave?: () => void
  onSelectedTextContextChange?: (context: AiSelectedTextContext | null) => void
  paperParserProvider?: PaperParserProvider
}

function resolvedMap(refs: CanvasControllerSnapshot['refs']): Map<string, CanvasControllerSnapshot['refs'][number]> {
  return new Map(refs.map(item => [item.nodeId, item]))
}

function candidateEntryType(entry: VaultEntry): ProjectCanvasNodeType | null {
  if (entry.isA === 'Paper') return 'paper'
  if (entry.isA === 'Note') return 'note'
  return null
}

export function ProjectCanvasSurface({
  editable = true,
  entry,
  entries,
  vaultPath = '',
  locale = 'en',
  onCopyFilePath,
  onContentChange,
  onCreateProjectDraftNote,
  onNavigateWikilink,
  onOpenExternalFile,
  onParsePaper,
  onRevealFile,
  onSave,
  onSelectedTextContextChange,
  paperParserProvider = 'none',
}: ProjectCanvasSurfaceProps) {
  const persistence = useMemo(() => new ProjectCanvasPersistenceAdapter({
    projectPath: entry.path,
    vaultPath,
  }), [entry.path, vaultPath])
  const controller = useMemo(() => new ProjectCanvasController({ persistence }), [persistence])
  const controllerSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  const canvas = controllerSnapshot.scene
  const refs = controllerSnapshot.refs
  const state = controllerSnapshot.status === 'idle' ? 'loading' : controllerSnapshot.status
  const error = controllerSnapshot.error
  const saving = controllerSnapshot.saving
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [addMode, setAddMode] = useState<ProjectCanvasAddPanelMode>('existing')
  const [candidateQuery, setCandidateQuery] = useState('')
  const [newCardText, setNewCardText] = useState('')
  const selectedNodeId = controllerSnapshot.selection.primary?.kind === 'node'
    ? controllerSnapshot.selection.primary.id
    : null
  const selectedNodeIds = useMemo(() => [...controllerSnapshot.selection.selectedNodeIds], [controllerSnapshot.selection.selectedNodeIds])
  const selectedEdgeId = controllerSnapshot.selection.primary?.kind === 'edge'
    ? controllerSnapshot.selection.primary.id
    : null
  const editingNodeId = controllerSnapshot.selection.editingNodeId
  const { closePeek, openPeek, peekNode } = useProjectCanvasPeek()
  const focusTargetNode = canvas?.nodes.find(node => node.id === editingNodeId)
    ?? (peekNode?.id === editingNodeId ? peekNode : null)
  const {
    changeFocusMode,
    editorHost,
    exitFocusMode,
    focusMode,
    setEditorHost,
  } = useProjectCanvasFocusMode({
    canFocus: node => controllerSnapshot.specs.getForNode(node).rendererAdapter.isDocument,
    node: focusTargetNode,
    onChange: (node, enabled) => trackProjectCanvasFocusModeChanged({ enabled, nodeType: node.type }),
  })
  const [linkFromSelected, setLinkFromSelected] = useState(true)
  const [edgeKind, setEdgeKind] = useState<ProjectCanvasEdgeKind>('related')
  const canvasRef = useRef<ProjectCanvas | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const suppressClickUntilRef = useRef(0)
  const openedTrackedRef = useRef(false)
  const viewportSize = useProjectCanvasViewportSize(viewportRef, state !== 'loading')

  useEffect(() => {
    controller.setViewportSize(viewportSize)
  }, [controller, viewportSize])

  const setSelectedNodeId = useCallback((nodeId: string | null) => {
    if (nodeId) controller.selectNodes([nodeId], nodeId)
    else controller.clearSelection()
  }, [controller])
  const setSelectedNodeIds = useCallback((nodeIds: string[] | ((current: string[]) => string[])) => {
    const current = [...controller.getSnapshot().selection.selectedNodeIds]
    const next = typeof nodeIds === 'function' ? nodeIds(current) : nodeIds
    controller.selectNodes(next, next.at(-1) ?? null)
  }, [controller])
  const setSelectedEdgeId = useCallback((edgeId: string | null) => {
    if (edgeId) controller.selectEdge(edgeId)
    else if (controller.getSnapshot().selection.selectedNodeIds.length === 0) controller.clearSelection()
  }, [controller])
  const setEditingNodeId = useCallback((nodeId: string | null) => {
    if (nodeId) controller.beginEditing(nodeId)
    else controller.endEditing()
  }, [controller])

  useEffect(() => {
    canvasRef.current = canvas
  }, [canvas])

  useEffect(() => () => controller.dispose(), [controller])

  const loadCanvas = useCallback(async () => {
    try {
      const loaded = await controller.load()
      if (loaded.created) trackProjectCanvasCreated()
      if (!openedTrackedRef.current) {
        openedTrackedRef.current = true
        trackProjectCanvasOpened({ state: loaded.created ? 'created' : 'ready' })
      }
    } catch (loadError) {
      // The controller owns the error snapshot; keeping the catch here makes
      // the async callback explicit without creating a second state machine.
      void loadError
    }
  }, [controller])

  useEffect(() => {
    openedTrackedRef.current = false
    void loadCanvas()
  }, [loadCanvas])

  useEffect(() => {
    const handleOpen = (event: Event) => {
      const intent = (event as ProjectCanvasOpenEvent).detail
      if (intent.projectPath === entry.path) void loadCanvas()
    }
    window.addEventListener(PROJECT_CANVAS_OPEN_EVENT, handleOpen)
    return () => window.removeEventListener(PROJECT_CANVAS_OPEN_EVENT, handleOpen)
  }, [entry.path, loadCanvas])

  const commitContentCanvas = useCallback((nextCanvas: ProjectCanvas) => {
    const committed = controller.replaceScene(nextCanvas, 'Canvas transaction', 'structural')
    if (committed) {
      canvasRef.current = committed
    }
  }, [controller])

  const restoreCanvasFromHistory = useCallback((direction: 'undo' | 'redo') => {
    const next = direction === 'undo' ? controller.undo() : controller.redo()
    if (next) {
      canvasRef.current = next
    }
  }, [controller])

  const candidateEntries = useMemo(() => {
    const query = candidateQuery.trim().toLowerCase()
    return entries
      .filter(candidate => candidate.path !== entry.path && candidateEntryType(candidate))
      .filter(candidate => {
        if (!query) return true
        return [
          candidate.title,
          candidate.filename,
          relativeVaultPath(candidate.path, vaultPath),
          candidate.snippet,
        ].some(value => value?.toLowerCase().includes(query))
      })
      .slice(0, 8)
  }, [candidateQuery, entries, entry.path, vaultPath])

  const selectedNode = useMemo(
    () => canvas?.nodes.find(node => node.id === selectedNodeId) ?? null,
    [canvas, selectedNodeId],
  )
  const selectedEdge = useMemo(
    () => canvas?.edges.find(edge => edge.id === selectedEdgeId) ?? null,
    [canvas, selectedEdgeId],
  )

  const selectSingleNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    setSelectedNodeIds(nodeId ? [nodeId] : [])
    setSelectedEdgeId(null)
    publishProjectCanvasSelection({ projectPath: entry.path, nodeId })
  }, [entry.path, setSelectedEdgeId, setSelectedNodeId, setSelectedNodeIds])

  useEffect(() => {
    const intent = pendingProjectCanvasOpen(entry.path)
    if (!intent || !canvas) return
    const node = canvas.nodes.find(candidate => candidate.id === intent.nodeId)
    if (!node) return
    consumeProjectCanvasOpen(entry.path)
    controller.focusNode(node.id)
    canvasRef.current = controller.getScene()
    selectSingleNode(node.id)
  }, [canvas, controller, entry.path, selectSingleNode])

  const toggleNodeSelection = useCallback((nodeId: string) => {
    setSelectedEdgeId(null)
    setSelectedNodeIds(current => {
      const next = current.includes(nodeId)
        ? current.filter(id => id !== nodeId)
        : [...current, nodeId]
      const primaryNodeId = next.at(-1) ?? null
      publishProjectCanvasSelection({ projectPath: entry.path, nodeId: primaryNodeId })
      return next
    })
  }, [entry.path, setSelectedEdgeId, setSelectedNodeIds])

  const canvasCenter = useCallback((width = DEFAULT_NODE_WIDTH, height = DEFAULT_NODE_HEIGHT) => {
    return controller.canvasCenter(width, height)
  }, [controller])

  const allocateNodeId = useCallback((prefix: string) => controller.allocateNodeId(prefix), [controller])

  const focusNode = useCallback((node: ProjectCanvasNode, persist = false) => {
    const current = canvasRef.current
    if (!current) return
    controller.focusNode(node.id, persist)
    const nextCanvas = controller.getScene()
    canvasRef.current = nextCanvas
    selectSingleNode(node.id)
  }, [controller, selectSingleNode])

  const {
    discard: closeAiDraft,
    error: aiDraftError,
    node: aiDraftNode,
    pin: pinAiDraft,
    saving: aiDraftSaving,
  } = useProjectCanvasAiDraft({
    allocateNodeId,
    canvas,
    canvasCenter,
    canvasRef,
    commitCanvas: commitContentCanvas,
    createNote: onCreateProjectDraftNote,
    focusNode,
    locale,
    projectPath: entry.path,
    selectedNodeId,
    selectNode: selectSingleNode,
    vaultPath,
  })

  const addNodeToCanvas = useCallback((options: CanvasNodeCreationOptions) => {
    const linked = Boolean(selectedNodeId && linkFromSelected)
    const result = controller.createNode({
      ...options,
      linkFromNodeId: linked ? selectedNodeId : null,
      linkKind: edgeKind,
    })
    if (!result) return
    canvasRef.current = result
    if (linked) trackProjectCanvasEdgeCreated({ kind: edgeKind })
    trackProjectCanvasNodeAdded({ linked, nodeType: options.type })
  }, [controller, edgeKind, linkFromSelected, selectedNodeId])

  const handleAddEntry = useCallback((candidate: VaultEntry) => {
    const nodeType = candidateEntryType(candidate)
    if (!nodeType) return
    const current = canvasRef.current
    if (!current) return
    const ref = relativeVaultPath(candidate.path, vaultPath)
    const existing = current.nodes.find(node => node.ref === ref)
    if (existing) {
      if (selectedNodeId && linkFromSelected && selectedNodeId !== existing.id) {
        controller.createConnection(selectedNodeId, existing.id, edgeKind)
        trackProjectCanvasEdgeCreated({ kind: edgeKind })
      }
      controller.focusNode(existing.id)
      canvasRef.current = controller.getScene()
      selectSingleNode(existing.id)
      return
    }
    addNodeToCanvas({
      type: nodeType,
      ref,
      center: canvasCenter(),
      title: candidate.title,
      text: candidate.snippet || undefined,
    })
  }, [addNodeToCanvas, canvasCenter, controller, edgeKind, linkFromSelected, selectedNodeId, selectSingleNode, vaultPath])

  const handleAddEmbeddedNode = useCallback(() => {
    const current = canvasRef.current
    if (!current || addMode === 'existing') return
    const trimmed = newCardText.trim()
    if ((addMode === 'image' || addMode === 'block') && !trimmed) return
    const nodeType: ProjectCanvasNodeType = addMode === 'block' ? 'paper_block' : addMode
    addNodeToCanvas({
      type: nodeType,
      ref: addMode === 'image' || addMode === 'block' ? trimmed : undefined,
      center: canvasCenter(),
      completed: addMode === 'task' ? false : undefined,
      text: addMode === 'image' || addMode === 'block' ? undefined : trimmed || undefined,
      title: addMode === 'group' && trimmed
        ? trimmed.split(/\n/u)[0]
        : undefined,
    })
    setNewCardText('')
  }, [addMode, addNodeToCanvas, canvasCenter, newCardText])

  const handleZoom = useCallback((delta: number) => {
    controller.zoomBy(delta)
  }, [controller])

  const handleFitToView = useCallback(() => {
    controller.fitToContent()
  }, [controller])

  const handleAutoLayout = useCallback(() => {
    controller.autoLayout()
  }, [controller])

  const addLooseNodeAtPoint = useCallback((rawValue: string, point: { x: number; y: number }) => {
    const current = canvasRef.current
    if (!current || !rawValue.trim()) return
    const result = controller.addDropValue(rawValue, point)
    if (!result) return
    canvasRef.current = result
    const added = result.nodes.find(node => !current.nodes.some(candidate => candidate.id === node.id))
    if (added) trackProjectCanvasNodeAdded({ linked: false, nodeType: added.type })
  }, [controller])

  const addPayloadNodeAtPoint = useCallback((payload: { nodeType: ProjectCanvasNodeType; ref: string; title?: string; text?: string }, point: { x: number; y: number }) => {
    const current = canvasRef.current
    if (!current) return
    const ref = payload.ref.startsWith('/') ? relativeVaultPath(payload.ref, vaultPath) : payload.ref
    const existing = current.nodes.find(node => node.ref === ref)
    if (existing) {
      focusNode(existing, false)
      return
    }
    const result = controller.addDropPayload({ ...payload, ref }, point)
    if (!result) return
    canvasRef.current = result
    const added = result.nodes.find(node => !current.nodes.some(candidate => candidate.id === node.id))
    if (added) trackProjectCanvasNodeAdded({ linked: false, nodeType: added.type })
  }, [controller, focusNode, vaultPath])

  const handleCanvasDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return
    const point = controller.clientToCanvas({ x: event.clientX, y: event.clientY })
    const payload = readProjectCanvasDragPayload(event.dataTransfer)
    if (payload) {
      event.preventDefault()
      addPayloadNodeAtPoint(payload, point)
      return
    }
    const uri = event.dataTransfer.getData('text/uri-list').split(/\r?\n/u).find(line => line && !line.startsWith('#'))
    const text = event.dataTransfer.getData('text/plain')
    const imageFile = Array.from(event.dataTransfer.files).find(file => file.type.startsWith('image/'))
    const value = uri || text || imageFile?.name || ''
    if (!value.trim()) return
    event.preventDefault()
    addLooseNodeAtPoint(value, point)
  }, [addLooseNodeAtPoint, addPayloadNodeAtPoint, controller])

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (
      event.dataTransfer.types.includes(PROJECT_CANVAS_DRAG_MIME)
      || event.dataTransfer.types.includes('text/plain')
      || event.dataTransfer.types.includes('text/uri-list')
      || Array.from(event.dataTransfer.files).some(file => file.type.startsWith('image/'))
    ) {
      event.preventDefault()
    }
  }, [])

  const handleViewportWheel = useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault()
    if (event.metaKey || event.ctrlKey) {
      const camera = controllerSnapshot.viewport.camera
      const nextZoom = camera.zoom * Math.pow(0.998, event.deltaY)
      controller.zoomAtScreenPoint(controller.clientToScreen({ x: event.clientX, y: event.clientY }), nextZoom)
      return
    }
    controller.panBy({ x: -event.deltaX, y: -event.deltaY })
  }, [controller, controllerSnapshot.viewport.camera])

  const copySelectedNode = useCallback(() => {
    if (!selectedNodeId) return
    controller.copySelection()
  }, [controller, selectedNodeId])

  const pasteCopiedNode = useCallback(() => {
    const pasted = controller.pasteSelection()
    if (!pasted) return
    canvasRef.current = pasted
    for (const node of controller.getSnapshot().selection.selectedNodeIds) {
      const pastedNode = pasted.nodes.find(candidate => candidate.id === node)
      if (pastedNode) trackProjectCanvasNodeAdded({ linked: false, nodeType: pastedNode.type })
    }
  }, [controller])

  const handleViewportPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canvasRef.current) return
    controller.dismissOverlayOutside(controller.clientToScreen({ x: event.clientX, y: event.clientY }))
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('[data-node-id], button, input, textarea, select, [contenteditable="true"], .project-canvas-navigator')) return
    const point = controller.clientToScreen({ x: event.clientX, y: event.clientY })
    if (controller.getSnapshot().tool === 'hand') controller.beginGesture('pan', { point, pointerId: event.pointerId, shiftKey: event.shiftKey })
    else if (controller.getSnapshot().tool === 'frame') controller.beginGesture('group', { point, pointerId: event.pointerId, shiftKey: event.shiftKey })
    else controller.beginGesture('marquee', { point, pointerId: event.pointerId, shiftKey: event.shiftKey })
  }, [controller])

  const handleNodePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, node: ProjectCanvasNode) => {
    if (event.button !== 0) return
    controller.dismissOverlayOutside(controller.clientToScreen({ x: event.clientX, y: event.clientY }))
    if (controller.isHandOverrideActive() || controller.getSnapshot().tool === 'hand') {
      event.preventDefault()
      event.stopPropagation()
      controller.beginPan(controller.clientToScreen({ x: event.clientX, y: event.clientY }), event.pointerId)
      return
    }
    if ((event.target as HTMLElement).closest('button, input, textarea, select, [role="checkbox"], [contenteditable="true"], .project-document-preview, .project-canvas-node__snippet, .project-canvas-node__footer')) return
    event.stopPropagation()
    if (controller.getSnapshot().tool === 'connect') {
      selectSingleNode(node.id)
      controller.beginConnection(node.id, controller.clientToScreen({ x: event.clientX, y: event.clientY }), event.pointerId)
      return
    }
    controller.beginNodeDrag(node.id, controller.clientToScreen({ x: event.clientX, y: event.clientY }), event.pointerId)
  }, [controller, selectSingleNode])

  const handleOverlayConnectStart = useCallback((nodeId: string, point: { x: number; y: number }) => {
    selectSingleNode(nodeId)
    controller.beginConnection(nodeId, controller.clientToScreen(point))
  }, [controller, selectSingleNode])

  const handleOverlayResizeStart = useCallback((nodeId: string, point: { x: number; y: number }) => {
    controller.beginNodeResize(nodeId, controller.clientToScreen(point))
  }, [controller])

  useEffect(() => {
    return controller.attachPointerSource(
      window,
      event => {
        const elementAtPoint = typeof document.elementFromPoint === 'function'
          ? document.elementFromPoint(event.clientX, event.clientY)
          : null
        const targetElement = elementAtPoint?.closest('[data-node-id]')
        return targetElement instanceof HTMLElement ? targetElement.dataset.nodeId ?? null : null
      },
      edgeKind,
      ({ gesture, targetNodeId }) => {
        if (gesture.kind === 'connect' && targetNodeId && targetNodeId !== gesture.targetId) {
          trackProjectCanvasEdgeCreated({ kind: edgeKind })
        }
        if (gesture.phase === 'active') suppressClickUntilRef.current = Date.now() + 250
      },
    )
  }, [controller, edgeKind])

  const refsByNodeId = useMemo(() => resolvedMap(refs), [refs])

  const handleSurfaceFocusCapture = useCallback((event: React.FocusEvent<HTMLElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (target?.closest('.canvas-editor-portal')) return
    if (target?.closest('.project-canvas-overlay-layer')) {
      controller.setOverlayFocusOwner('overlay')
      return
    }
    controller.setFocusOwner('canvas')
  }, [controller])

  const handleNodeClick = useCallback((node: ProjectCanvasNode) => {
    if (Date.now() < suppressClickUntilRef.current) return
    if (!controllerSnapshot.specs.getForNode(node).canNavigate) return
    const resolved = refsByNodeId.get(node.id)
    const target = resolved?.targetPath ?? resolved?.targetTitle ?? node.ref
    if (!target) return
    onNavigateWikilink(target)
  }, [controllerSnapshot.specs, onNavigateWikilink, refsByNodeId])

  const closeCanvasEditor = useCallback(() => {
    if (editingNodeId) onSave?.()
    setEditingNodeId(null)
    controller.dismissContextualToolbar()
    setEditorHost(null)
    exitFocusMode()
  }, [controller, editingNodeId, exitFocusMode, onSave, setEditingNodeId, setEditorHost])

  const editDocumentNode = useCallback((node: ProjectCanvasNode) => {
    if (!controllerSnapshot.specs.getForNode(node).rendererAdapter.isDocument) {
      handleNodeClick(node)
      return
    }
    const resolved = refsByNodeId.get(node.id)
    const targetEntry = findEntryForProjectCanvasRef(entries, node.ref, resolved?.targetPath, vaultPath)
    if (!targetEntry) {
      handleNodeClick(node)
      return
    }
    if (editingNodeId === node.id) return
    if (editingNodeId && editingNodeId !== node.id) onSave?.()
    setEditorHost(null)
    selectSingleNode(node.id)
    const geometry = controller.geometryForNode(node.type)
    const editorGeometry = controllerSnapshot.specs.getForNode(node).editorGeometry ?? geometry
    if (node.width < Math.max(geometry.minWidth, editorGeometry.minWidth) || node.height < Math.max(geometry.minHeight, editorGeometry.minHeight)) {
      const next = controller.updateNode(node.id, {
        width: Math.max(node.width, geometry.minWidth, editorGeometry.minWidth),
        height: Math.max(node.height, geometry.minHeight, editorGeometry.minHeight),
      }, true)
      if (next) canvasRef.current = next
    }
    setEditingNodeId(node.id)
  }, [controller, controllerSnapshot.specs, editingNodeId, entries, handleNodeClick, onSave, refsByNodeId, selectSingleNode, setEditingNodeId, setEditorHost, vaultPath])

  const closePeekNode = useCallback(() => {
    if (!peekNode) return
    if (editingNodeId === peekNode.id) onSave?.()
    closePeek()
    setEditorHost(null)
    setEditingNodeId(null)
    exitFocusMode()
    selectSingleNode(null)
  }, [closePeek, editingNodeId, exitFocusMode, onSave, peekNode, selectSingleNode, setEditingNodeId, setEditorHost])

  const pinPeekNode = useCallback(() => {
    if (!peekNode) return
    const next = controller.addNode(peekNode)
    if (!next) return
    closePeek()
    canvasRef.current = next
    trackProjectCanvasPeekPinned({ nodeType: peekNode.type })
  }, [closePeek, controller, peekNode])

  const handleCanvasNavigate = useCallback((target: string) => {
    const current = canvasRef.current
    const targetEntry = findEntryForProjectCanvasRef(entries, target, undefined, vaultPath)
    if (!current || !targetEntry) {
      onNavigateWikilink(target)
      return
    }
    const existingNode = current.nodes.find((node) => {
      const resolved = refsByNodeId.get(node.id)
      return findEntryForProjectCanvasRef(entries, node.ref, resolved?.targetPath, vaultPath)?.path === targetEntry.path
    })
    if (existingNode) {
      if (peekNode && editingNodeId === peekNode.id) onSave?.()
      closePeek()
      exitFocusMode()
      focusNode(existingNode, false)
      editDocumentNode(existingNode)
      return
    }
    if (peekNode?.ref === relativeVaultPath(targetEntry.path, vaultPath)) {
      focusNode(peekNode, false)
      editDocumentNode(peekNode)
      return
    }
    if (editingNodeId) onSave?.()
    const sourceNode = current.nodes.find(node => node.id === selectedNodeId)
      ?? current.nodes.find(node => node.id === editingNodeId)
    const nodeType = candidateEntryType(targetEntry)
    if (!nodeType) {
      onNavigateWikilink(target)
      return
    }
    const nextPeek = controller.createPeekNode(
      nodeType,
      relativeVaultPath(targetEntry.path, vaultPath),
      targetEntry.title,
      sourceNode?.id,
    )
    if (!nextPeek) {
      onNavigateWikilink(target)
      return
    }
    setEditorHost(null)
    exitFocusMode()
    openPeek(nextPeek)
    focusNode(nextPeek, false)
    setEditingNodeId(nextPeek.id)
    trackProjectCanvasPeekOpened({ nodeType })
  }, [closePeek, controller, editDocumentNode, editingNodeId, entries, exitFocusMode, focusNode, onNavigateWikilink, onSave, openPeek, peekNode, refsByNodeId, selectedNodeId, setEditingNodeId, setEditorHost, vaultPath])

  useEffect(() => {
    const navigate = (target: string) => {
      consumeProjectCanvasNavigate(entry.path)
      handleCanvasNavigate(target)
    }
    const pending = consumeProjectCanvasNavigate(entry.path)
    const pendingTimer = pending
      ? window.setTimeout(() => handleCanvasNavigate(pending.target), 0)
      : null

    const handleNavigate = (event: Event) => {
      const intent = (event as ProjectCanvasNavigateEvent).detail
      if (intent.projectPath === entry.path) navigate(intent.target)
    }
    window.addEventListener(PROJECT_CANVAS_NAVIGATE_EVENT, handleNavigate)
    return () => {
      if (pendingTimer !== null) window.clearTimeout(pendingTimer)
      window.removeEventListener(PROJECT_CANVAS_NAVIGATE_EVENT, handleNavigate)
    }
  }, [entry.path, handleCanvasNavigate])

  const handleSelectNode = useCallback((node: ProjectCanvasNode, event?: React.MouseEvent<HTMLElement>) => {
    if (event?.metaKey || event?.ctrlKey || event?.shiftKey) {
      toggleNodeSelection(node.id)
      return
    }
    selectSingleNode(node.id)
  }, [selectSingleNode, toggleNodeSelection])

  const handleSelectEdge = useCallback((edgeId: string) => {
    controller.selectEdge(edgeId)
  }, [controller])

  const handleNodeTextChange = useCallback((nodeId: string, text: string) => {
    const next = controller.updateNode(nodeId, { text })
    if (next) canvasRef.current = next
  }, [controller])

  const handleNodeTextBlur = useCallback((nodeId: string) => {
    const next = controller.commitNodeEdit(nodeId, 'Edit Canvas text')
    if (next) canvasRef.current = next
  }, [controller])

  const toggleTaskNode = useCallback((nodeId: string) => {
    const next = controller.toggleTask(nodeId)
    if (next) canvasRef.current = next
  }, [controller])

  const updateSelectedNode = useCallback((patch: Partial<ProjectCanvasNode>, persist = false) => {
    if (!selectedNodeId) return
    const next = controller.updateNode(selectedNodeId, patch, persist)
    if (next) canvasRef.current = next
  }, [controller, selectedNodeId])

  const updateSelectedEdge = useCallback((patch: Partial<ProjectCanvas['edges'][number]>, persist = false) => {
    if (!selectedEdgeId) return
    const next = controller.updateEdge(selectedEdgeId, patch, persist)
    if (next) canvasRef.current = next
  }, [controller, selectedEdgeId])

  const deleteSelectedNode = useCallback(() => {
    const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : []
    const deletableIds = ids.filter(id => id !== PROJECT_OVERVIEW_NODE_ID)
    if (deletableIds.length === 0) return
    if (editingNodeId && deletableIds.includes(editingNodeId)) {
      onSave?.()
      setEditingNodeId(null)
      setEditorHost(null)
      exitFocusMode()
    }
    setSelectedNodeId(null)
    setSelectedNodeIds([])
    const next = controller.deleteNodes(deletableIds)
    if (next) canvasRef.current = next
  }, [controller, editingNodeId, exitFocusMode, onSave, selectedNodeId, selectedNodeIds, setEditingNodeId, setEditorHost, setSelectedNodeId, setSelectedNodeIds])

  const deleteSelectedEdge = useCallback(() => {
    if (!selectedEdgeId) return
    setSelectedEdgeId(null)
    const next = controller.deleteEdge(selectedEdgeId)
    if (next) canvasRef.current = next
  }, [controller, selectedEdgeId, setSelectedEdgeId])

  const handleToolbarAction = useCallback((action: CanvasNodeToolbarAction) => {
    if (!selectedNode) return
    if (action === 'open') {
      editDocumentNode(selectedNode)
      return
    }
    if (action === 'delete') {
      deleteSelectedNode()
      return
    }
    const next = controller.executeNodeToolbarAction(action, selectedNode.id)
    if (next) canvasRef.current = next
  }, [controller, deleteSelectedNode, editDocumentNode, selectedNode])

  const handleCanvasKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && editingNodeId) {
      event.preventDefault()
      event.stopPropagation()
      changeFocusMode(!focusMode)
      return
    }
    const target = event.target as HTMLElement
    if (target.closest('input, textarea, [contenteditable="true"]')) return
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault()
      event.stopPropagation()
      setAddPanelOpen(true)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      if (controller.getGestureSnapshot().phase !== 'idle') {
        controller.escape()
        return
      }
      if (editingNodeId) {
        if (controller.escape() === 'editing') closeCanvasEditor()
        return
      }
      if (addPanelOpen) {
        setAddPanelOpen(false)
        return
      }
      const result = controller.escape()
      if (result === 'overlay' || result === 'selection') return
      selectSingleNode(null)
      setSelectedEdgeId(null)
      return
    }
    if (event.key === ' ') {
      event.preventDefault()
      controller.setSpacePressed(true)
      return
    }
    if (event.key === 'Enter' && selectedNode) {
      event.preventDefault()
      event.stopPropagation()
      editDocumentNode(selectedNode)
      return
    }
    const meta = event.metaKey || event.ctrlKey
    if (meta && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      restoreCanvasFromHistory(event.shiftKey ? 'redo' : 'undo')
      return
    }
    if (meta && event.key.toLowerCase() === 'y') {
      event.preventDefault()
      restoreCanvasFromHistory('redo')
      return
    }
    if (meta && event.key.toLowerCase() === 'c') {
      event.preventDefault()
      copySelectedNode()
      return
    }
    if (meta && event.key.toLowerCase() === 'v') {
      event.preventDefault()
      pasteCopiedNode()
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      if (selectedEdgeId) deleteSelectedEdge()
      else if (selectedNodeId === peekNode?.id) closePeekNode()
      else if (selectedNodeId === aiDraftNode?.id) closeAiDraft()
      else if (selectedNodeId) deleteSelectedNode()
    }
  }, [addPanelOpen, aiDraftNode?.id, changeFocusMode, closeAiDraft, closeCanvasEditor, closePeekNode, controller, copySelectedNode, deleteSelectedEdge, deleteSelectedNode, editDocumentNode, editingNodeId, focusMode, pasteCopiedNode, peekNode?.id, restoreCanvasFromHistory, selectSingleNode, selectedEdgeId, selectedNode, selectedNodeId, setSelectedEdgeId])

  const handleCanvasKeyUp = useCallback((event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === ' ') controller.setSpacePressed(false)
  }, [controller])

  if (state === 'loading') {
    return <div className="project-canvas-loading">{translate(locale, 'projectCanvas.loading')}</div>
  }

  if (state === 'error' || !canvas) {
    return (
      <div className="project-canvas-error">
        <div className="project-canvas-error__title">{translate(locale, 'projectCanvas.errorTitle')}</div>
        <div className="project-canvas-error__description">{error ?? translate(locale, 'projectCanvas.errorDescription')}</div>
        <Button type="button" size="sm" variant="outline" onClick={loadCanvas}>
          {translate(locale, 'projectCanvas.retry')}
        </Button>
      </div>
    )
  }

  const graphicsBounds = controller.graphicsBounds()
  const editingNode = canvas.nodes.find(node => node.id === editingNodeId)
    ?? (peekNode?.id === editingNodeId ? peekNode : null)
  const editingEntry = editingNode
    ? findEntryForProjectCanvasRef(entries, editingNode.ref, refsByNodeId.get(editingNode.id)?.targetPath, vaultPath)
    : null
  const retainedNodeIds = new Set(selectedNodeIds)
  if (editingNodeId) retainedNodeIds.add(editingNodeId)
  const visibleNodes = controller.queryVisibleNodes(retainedNodeIds)
  const graphicsCommands = controller.queryVisibleGraphics()
  const connectionHandles = controller.getConnectionHandles(visibleNodes.filter(node => !selectedNodeIds.includes(node.id)))
  const camera = controllerSnapshot.viewport.camera

  return (
    <section
      className="project-canvas-surface"
      data-testid="project-canvas-surface"
      onFocusCapture={handleSurfaceFocusCapture}
    >
      <ProjectCanvasToolbar
        addMode={addMode}
        addPanelOpen={addPanelOpen}
        candidateEntries={candidateEntries}
        candidateQuery={candidateQuery}
        canRedo={controllerSnapshot.canRedo}
        canUndo={controllerSnapshot.canUndo}
        edgeCount={canvas.edges.length}
        edgeKind={edgeKind}
        editingNodeId={editingNodeId}
        focusMode={focusMode}
        linkFromSelected={linkFromSelected}
        locale={locale}
        newCardText={newCardText}
        nodeCount={canvas.nodes.length}
        selectedNode={selectedNode}
        selectedNodeId={selectedNodeId}
        saving={saving}
        title={entry.title}
        tool={controllerSnapshot.tool}
        zoom={camera.zoom}
        onAddEmbeddedNode={handleAddEmbeddedNode}
        onAddEntry={handleAddEntry}
        onAddModeChange={setAddMode}
        onAddPanelOpenChange={setAddPanelOpen}
        onAutoLayout={handleAutoLayout}
        onCandidateQueryChange={setCandidateQuery}
        onEdgeKindChange={setEdgeKind}
        onFit={handleFitToView}
        onFocusModeChange={changeFocusMode}
        onLinkFromSelectedChange={setLinkFromSelected}
        onNewCardTextChange={setNewCardText}
        onRedo={() => restoreCanvasFromHistory('redo')}
        onToolChange={tool => controller.setTool(tool)}
        onUndo={() => restoreCanvasFromHistory('undo')}
        onZoom={handleZoom}
      />
      <div
        className="project-canvas-viewport"
      data-testid="project-canvas-viewport"
        data-canvas-scene-node-count={canvas.nodes.length}
        data-canvas-visible-node-count={visibleNodes.length}
        data-canvas-query-candidates={controller.getSceneDiagnostics()?.lastQueryCandidates ?? 0}
        data-canvas-snapshot-revision={controllerSnapshot.revision}
        ref={viewportRef}
        tabIndex={0}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        onKeyDown={handleCanvasKeyDown}
        onKeyUp={handleCanvasKeyUp}
        onBlur={() => controller.setSpacePressed(false)}
        onPointerDown={handleViewportPointerDown}
        onWheel={handleViewportWheel}
      >
        <ProjectCanvasNavigator
          locale={locale}
          nodes={canvas.nodes}
          selectedNodeId={selectedNodeId}
          onFocusNode={node => {
            focusNode(node, false)
            trackProjectCanvasNavigatorFocused({ nodeType: node.type })
          }}
        />
        <div
          className="project-canvas-world"
          style={{
            transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.zoom})`,
          }}
        >
          <CanvasGraphicsLayer
            bounds={graphicsBounds}
            commands={graphicsCommands}
            onSelectEdge={handleSelectEdge}
          />
          <CanvasDocumentLayer nodes={visibleNodes} renderNode={(node) => {
            const nodeEntry = findEntryForProjectCanvasRef(entries, node.ref, refsByNodeId.get(node.id)?.targetPath, vaultPath)
            return (
              <ProjectCanvasNodeCard
                key={node.id}
                node={node}
                spec={controllerSnapshot.specs.getForNode(node)}
                editing={editingNodeId === node.id && !focusMode}
                editorHostRef={editingNodeId === node.id && !focusMode ? setEditorHost : undefined}
                entry={nodeEntry}
                locale={locale}
                resolved={refsByNodeId.get(node.id)}
                selected={selectedNodeIds.includes(node.id)}
                presentation={nodePresentation(camera.zoom, selectedNodeIds.includes(node.id))}
                vaultPath={vaultPath}
                onClick={(event) => handleSelectNode(node, event)}
                onDoubleClick={() => editDocumentNode(node)}
                onNavigateWikilink={handleCanvasNavigate}
                onPointerDown={(event) => handleNodePointerDown(event, node)}
                onSelect={(event) => handleSelectNode(node, event)}
                onToggleTask={() => toggleTaskNode(node.id)}
                onTextBlur={() => handleNodeTextBlur(node.id)}
                onTextChange={(text) => handleNodeTextChange(node.id, text)}
              />
            )
          }} />
          {peekNode ? (
            <ProjectCanvasNodeCard
              node={peekNode}
              spec={controllerSnapshot.specs.getForNode(peekNode)}
              editing={editingNodeId === peekNode.id && !focusMode}
              editorHostRef={editingNodeId === peekNode.id && !focusMode ? setEditorHost : undefined}
              entry={findEntryForProjectCanvasRef(entries, peekNode.ref, undefined, vaultPath)}
              locale={locale}
              selected={selectedNodeId === peekNode.id}
              presentation="preview"
              temporary
              vaultPath={vaultPath}
              onClick={(event) => handleSelectNode(peekNode, event)}
              onCloseTemporary={closePeekNode}
              onDoubleClick={() => editDocumentNode(peekNode)}
              onNavigateWikilink={handleCanvasNavigate}
              onPinTemporary={pinPeekNode}
              onPointerDown={event => event.stopPropagation()}
              onSelect={(event) => handleSelectNode(peekNode, event)}
              onToggleTask={() => {}}
              onTextBlur={() => {}}
              onTextChange={() => {}}
            />
          ) : null}
          {aiDraftNode ? (
            <ProjectCanvasNodeCard
              node={aiDraftNode}
              spec={controllerSnapshot.specs.getForNode(aiDraftNode)}
              editing={false}
              entry={null}
              locale={locale}
              selected={selectedNodeId === aiDraftNode.id}
              presentation="preview"
              temporary
              temporaryError={aiDraftError}
              temporaryKind="ai_draft"
              temporarySaving={aiDraftSaving}
              vaultPath={vaultPath}
              onClick={(event) => handleSelectNode(aiDraftNode, event)}
              onCloseTemporary={closeAiDraft}
              onDoubleClick={() => {}}
              onNavigateWikilink={handleCanvasNavigate}
              onPinTemporary={() => { void pinAiDraft() }}
              onPointerDown={event => event.stopPropagation()}
              onSelect={(event) => handleSelectNode(aiDraftNode, event)}
              onToggleTask={() => {}}
              onTextBlur={() => {}}
              onTextChange={() => {}}
            />
          ) : null}
        </div>
        <CanvasOverlayLayer
          connectionHandles={connectionHandles}
          connectLabel={nodeId => {
            const node = canvas.nodes.find(candidate => candidate.id === nodeId)
            return translate(locale, 'projectCanvas.connectFrom', { title: node?.title ?? node?.ref ?? nodeId })
          }}
          handles={controllerSnapshot.overlay.handles}
          locale={locale}
          onConnectStart={handleOverlayConnectStart}
          onResizeStart={handleOverlayResizeStart}
          onToolbarAction={handleToolbarAction}
          resizeLabel={nodeId => {
            const node = canvas.nodes.find(candidate => candidate.id === nodeId)
            return translate(locale, 'projectCanvas.resizeNode', { title: node?.title ?? node?.ref ?? nodeId })
          }}
          selectionRect={controllerSnapshot.overlay.rect}
          snapGuides={controllerSnapshot.overlay.snapGuides}
          toolbarRect={controllerSnapshot.overlay.toolbarRect}
          toolbarActions={selectedNode ? controllerSnapshot.specs.getForNode(selectedNode).toolbarActions : []}
          toolbarTitle={selectedNode?.title ?? selectedNode?.ref ?? translate(locale, 'projectCanvas.untitledNode')}
          zIndices={controllerSnapshot.overlay.zIndices}
        />
        {focusMode && editingEntry ? (
          <section
            className="project-canvas-focus-mode"
            data-testid="project-canvas-focus-mode"
            onPointerDown={event => event.stopPropagation()}
          >
            <header className="project-canvas-focus-mode__header">
              <div className="project-canvas-focus-mode__title">{editingEntry.title}</div>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={translate(locale, 'projectCanvas.exitFocusMode')}
                onClick={() => changeFocusMode(false)}
              >
                <CornersIn size={15} />
              </Button>
            </header>
            <div className="project-canvas-focus-mode__editor" ref={setEditorHost} />
          </section>
        ) : null}
        {editingEntry ? (
          <CanvasEditorPortal
            key={editingEntry.path}
            editable={editable}
            entries={entries}
            entry={editingEntry}
            locale={locale}
            onClose={focusMode ? () => changeFocusMode(false) : closeCanvasEditor}
            onCopyFilePath={onCopyFilePath}
            onContentChange={onContentChange}
            onNavigateWikilink={handleCanvasNavigate}
            onOpenExternalFile={onOpenExternalFile}
            onParsePaper={onParsePaper}
            onRevealFile={onRevealFile}
            onSelectedTextContextChange={onSelectedTextContextChange}
            onFocusOwnerChange={owner => controller.setFocusOwner(owner)}
            onToggleFocus={() => changeFocusMode(!focusMode)}
            paperParserProvider={paperParserProvider}
            target={editorHost}
            vaultPath={vaultPath}
          />
        ) : null}
        <ProjectCanvasInspector
          canvas={canvas}
          edge={selectedEdge}
          locale={locale}
          node={selectedNode}
          spec={selectedNode ? controllerSnapshot.specs.getForNode(selectedNode) : null}
          onClose={() => {
            setSelectedNodeId(null)
            setSelectedNodeIds([])
            setSelectedEdgeId(null)
          }}
          onDeleteEdge={deleteSelectedEdge}
          onDeleteNode={selectedNodeId === peekNode?.id ? closePeekNode : deleteSelectedNode}
          onEdgeChange={updateSelectedEdge}
          onEdgeKindDefaultChange={setEdgeKind}
          onNavigate={selectedNode && controllerSnapshot.specs.getForNode(selectedNode).canNavigate
            ? () => handleNodeClick(selectedNode)
            : undefined}
          onNodeChange={updateSelectedNode}
        />
      </div>
    </section>
  )
}
