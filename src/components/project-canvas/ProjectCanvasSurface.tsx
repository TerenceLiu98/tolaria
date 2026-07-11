import type React from 'react'
import { ArrowCounterClockwise, ArrowClockwise, CheckSquare, Clipboard, CornersIn, CornersOut, Graph, ImageSquare, MagnifyingGlass, Minus, Plus, Square, TextT } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  PROJECT_OVERVIEW_NODE_ID,
  resolveProjectCanvasRefs,
  type ProjectCanvas,
  type ProjectCanvasEdgeKind,
  type ProjectCanvasNode,
  type ProjectCanvasNodeType,
  type ProjectCanvasResolvedRef,
} from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import type { AiSelectedTextContext } from '../../utils/ai-context'
import type { CreateProjectCanvasDraftNote } from '../../projectCanvasDrafts'
import type { PaperParserProvider } from '../../paper/parserSettings'
import { publishProjectCanvasSelection } from '../../projectCanvasSelectionStore'
import { ProjectCanvasController } from '../../projectCanvasController'
import { ProjectCanvasPersistenceAdapter } from '../../projectCanvasPersistenceAdapter'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '../ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import {
  trackProjectCanvasCreated,
  trackProjectCanvasEdgeCreated,
  trackProjectCanvasFocusModeChanged,
  trackProjectCanvasLayoutSaved,
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
  canvasBounds,
  DEFAULT_EMBEDDED_NODE_HEIGHT,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
  EDGE_KINDS,
  edgeKindKey,
  nodePresentation,
  ZOOM_STEP,
} from './projectCanvasDisplay'
import { looksLikeBlockCitation, looksLikeImageRef, nodeIsEmbedded, titleFromPath } from './projectCanvasNodeModel'
import { ProjectCanvasNodeCard } from './ProjectCanvasNodeCard'
import { ProjectCanvasNavigator } from './ProjectCanvasNavigator'
import { useProjectCanvasViewportSize } from './projectCanvasViewport'
import { useProjectCanvasAiDraft } from './useProjectCanvasAiDraft'
import './ProjectCanvasSurface.css'

const EDITOR_MIN_WIDTH = 560
const EDITOR_MIN_HEIGHT = 420

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

type AddPanelMode = 'existing' | 'text' | 'task' | 'image' | 'block' | 'group'

function resolvedMap(refs: ProjectCanvasResolvedRef[]): Map<string, ProjectCanvasResolvedRef> {
  return new Map(refs.map(item => [item.nodeId, item]))
}

function nodeCenter(node: ProjectCanvasNode) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  }
}

function candidateEntryType(entry: VaultEntry): ProjectCanvasNodeType | null {
  if (entry.isA === 'Paper') return 'paper'
  if (entry.isA === 'Note') return 'note'
  return null
}

function nextCanvasId(prefix: string, existingIds: Iterable<string>): string {
  const ids = new Set(existingIds)
  for (let index = ids.size + 1; index < ids.size + 10000; index += 1) {
    const candidate = `${prefix}_${index}`
    if (!ids.has(candidate)) return candidate
  }
  return `${prefix}_${Date.now()}`
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
    deterministicWrites: false,
    migrateOnLoad: false,
    projectPath: entry.path,
    vaultPath,
  }), [entry.path, vaultPath])
  const controller = useMemo(() => new ProjectCanvasController({ migrateLoadedScene: false, persistence }), [persistence])
  const controllerSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  )
  const canvas = controllerSnapshot.scene
  const [refs, setRefs] = useState<ProjectCanvasResolvedRef[]>([])
  const state = controllerSnapshot.status === 'idle' ? 'loading' : controllerSnapshot.status
  const error = controllerSnapshot.error
  const saving = controllerSnapshot.saving
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddPanelMode>('existing')
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
  const [editorHost, setEditorHost] = useState<HTMLElement | null>(null)
  const [focusMode, setFocusMode] = useState(false)
  const [peekNode, setPeekNode] = useState<ProjectCanvasNode | null>(null)
  const [linkFromSelected, setLinkFromSelected] = useState(true)
  const [edgeKind, setEdgeKind] = useState<ProjectCanvasEdgeKind>('related')
  const clipboardRef = useRef<ProjectCanvasNode | null>(null)
  const clipboardNodesRef = useRef<ProjectCanvasNode[]>([])
  const canvasRef = useRef<ProjectCanvas | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const resolveRequestRef = useRef(0)
  const suppressClickUntilRef = useRef(0)
  const openedTrackedRef = useRef(false)
  const zoomSaveTimerRef = useRef<number | null>(null)
  const viewportSize = useProjectCanvasViewportSize(viewportRef)

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

  const resolveCanvas = useCallback(async (nextCanvas: ProjectCanvas) => {
    if (!vaultPath) return
    const requestId = resolveRequestRef.current + 1
    resolveRequestRef.current = requestId
    try {
      const result = await resolveProjectCanvasRefs(vaultPath, entry.path, nextCanvas)
      if (resolveRequestRef.current === requestId) setRefs(result.refs)
    } catch {
      if (resolveRequestRef.current === requestId) setRefs([])
    }
  }, [entry.path, vaultPath])

  const loadCanvas = useCallback(async () => {
    try {
      const loaded = await controller.load()
      const nextCanvas = controller.getScene()
      if (!nextCanvas) throw new Error(translate(locale, 'projectCanvas.errorDescription'))
      if (loaded.created) trackProjectCanvasCreated()
      void resolveCanvas(nextCanvas)
      if (!openedTrackedRef.current) {
        openedTrackedRef.current = true
        trackProjectCanvasOpened({ state: loaded.created ? 'created' : 'ready' })
      }
    } catch (loadError) {
      // The controller owns the error snapshot; keeping the catch here makes
      // the async callback explicit without creating a second state machine.
      void loadError
    }
  }, [controller, locale, resolveCanvas])

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

  useEffect(() => () => {
    if (zoomSaveTimerRef.current !== null) window.clearTimeout(zoomSaveTimerRef.current)
  }, [])

  const persistCanvas = useCallback(async (nextCanvas: ProjectCanvas, reason: 'create' | 'layout' | 'content') => {
    await controller.persist(nextCanvas, reason === 'layout' ? 'viewport' : reason === 'content' ? 'structural' : 'structural')
    void resolveCanvas(nextCanvas)
    if (reason === 'layout') trackProjectCanvasLayoutSaved()
  }, [controller, resolveCanvas])

  const updateCanvas = useCallback((updater: (current: ProjectCanvas) => ProjectCanvas) => {
    const next = controller.updateScene(updater)
    if (next) canvasRef.current = next
  }, [controller])

  const persistLatestLayout = useCallback(() => {
    const latest = controller.getScene()
    if (!latest) return
    canvasRef.current = latest
    void persistCanvas(latest, 'layout')
  }, [controller, persistCanvas])

  const commitContentCanvas = useCallback((nextCanvas: ProjectCanvas, previousCanvas?: ProjectCanvas) => {
    void previousCanvas
    const committed = controller.replaceScene(nextCanvas, 'Canvas transaction', 'structural')
    if (committed) {
      canvasRef.current = committed
      void resolveCanvas(committed)
    }
  }, [controller, resolveCanvas])

  const restoreCanvasFromHistory = useCallback((direction: 'undo' | 'redo') => {
    const next = direction === 'undo' ? controller.undo() : controller.redo()
    if (next) {
      canvasRef.current = next
      void resolveCanvas(next)
    }
  }, [controller, resolveCanvas])

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

  const screenPointToCanvas = useCallback((clientX: number, clientY: number) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const safeClientX = Number.isFinite(clientX) ? clientX : (rect?.left ?? 0)
    const safeClientY = Number.isFinite(clientY) ? clientY : (rect?.top ?? 0)
    return controller.screenToCanvas({
      x: safeClientX - (rect?.left ?? 0),
      y: safeClientY - (rect?.top ?? 0),
    })
  }, [controller])

  const canvasCenter = useCallback((width = DEFAULT_NODE_WIDTH, height = DEFAULT_NODE_HEIGHT) => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const viewportWidth = rect?.width && Number.isFinite(rect.width) ? rect.width : 760
    const viewportHeight = rect?.height && Number.isFinite(rect.height) ? rect.height : 460
    const point = controller.screenToCanvas({ x: viewportWidth / 2, y: viewportHeight / 2 })
    return {
      x: point.x - width / 2,
      y: point.y - height / 2,
    }
  }, [controller])

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

  const withSelectedEdge = useCallback((current: ProjectCanvas, newNode: ProjectCanvasNode): ProjectCanvas => {
    if (!selectedNodeId || !linkFromSelected || selectedNodeId === newNode.id) return current
    if (!current.nodes.some(node => node.id === selectedNodeId)) return current
    const edgeExists = current.edges.some(edge => edge.from === selectedNodeId && edge.to === newNode.id)
    if (edgeExists) return current
    const edge = {
      id: nextCanvasId('edge', current.edges.map(item => item.id)),
      from: selectedNodeId,
      to: newNode.id,
      kind: edgeKind,
    }
    trackProjectCanvasEdgeCreated({ kind: edgeKind })
    return { ...current, edges: [...current.edges, edge] }
  }, [edgeKind, linkFromSelected, selectedNodeId])

  const persistAddedNode = useCallback((nextCanvas: ProjectCanvas, node: ProjectCanvasNode, linked: boolean) => {
    selectSingleNode(node.id)
    commitContentCanvas(nextCanvas)
    trackProjectCanvasNodeAdded({ linked, nodeType: node.type })
  }, [commitContentCanvas, selectSingleNode])

  const addNodeToCanvas = useCallback((node: ProjectCanvasNode) => {
    const current = canvasRef.current
    if (!current) return
    const nextWithNode = { ...current, nodes: [...current.nodes, node] }
    const nextCanvas = withSelectedEdge(nextWithNode, node)
    persistAddedNode(nextCanvas, node, nextCanvas.edges.length > current.edges.length)
  }, [persistAddedNode, withSelectedEdge])

  const handleAddEntry = useCallback((candidate: VaultEntry) => {
    const nodeType = candidateEntryType(candidate)
    if (!nodeType) return
    const current = canvasRef.current
    if (!current) return
    const ref = relativeVaultPath(candidate.path, vaultPath)
    const existing = current.nodes.find(node => node.ref === ref)
    if (existing) {
      const nextCanvas = withSelectedEdge(current, existing)
      const focusedCanvas = nextCanvas
      controller.updateScene(() => focusedCanvas)
      controller.focusNode(existing.id)
      canvasRef.current = controller.getScene()
      selectSingleNode(existing.id)
      void resolveCanvas(focusedCanvas)
      if (focusedCanvas.edges.length > current.edges.length) {
        void controller.persist(focusedCanvas, 'structural')
      } else {
        focusNode(existing, false)
      }
      return
    }
    const width = DEFAULT_NODE_WIDTH
    const height = DEFAULT_NODE_HEIGHT
    const position = canvasCenter(width, height)
    addNodeToCanvas({
      id: nextCanvasId(nodeType, current.nodes.map(item => item.id)),
      type: nodeType,
      ref,
      x: position.x,
      y: position.y,
      width,
      height,
      title: candidate.title,
      text: candidate.snippet || undefined,
    })
  }, [addNodeToCanvas, canvasCenter, controller, focusNode, resolveCanvas, selectSingleNode, vaultPath, withSelectedEdge])

  const handleAddEmbeddedNode = useCallback(() => {
    const current = canvasRef.current
    if (!current || addMode === 'existing') return
    const trimmed = newCardText.trim()
    if ((addMode === 'image' || addMode === 'block') && !trimmed) return
    const width = addMode === 'group' ? 320 : addMode === 'image' ? 300 : DEFAULT_NODE_WIDTH
    const height = addMode === 'group' ? 190 : addMode === 'image' ? 210 : DEFAULT_EMBEDDED_NODE_HEIGHT
    const position = canvasCenter(width, height)
    const nodeType: ProjectCanvasNodeType = addMode === 'block' ? 'paper_block' : addMode
    addNodeToCanvas({
      id: nextCanvasId(nodeType, current.nodes.map(item => item.id)),
      type: nodeType,
      ref: addMode === 'image' || addMode === 'block' ? trimmed : undefined,
      x: position.x,
      y: position.y,
      width,
      height,
      completed: addMode === 'task' ? false : undefined,
      text: addMode === 'image' || addMode === 'block' ? undefined : trimmed || undefined,
      title: addMode === 'group' && trimmed
        ? trimmed.split(/\n/u)[0]
        : addMode === 'image'
          ? titleFromPath(trimmed)
          : undefined,
    })
    setNewCardText('')
  }, [addMode, addNodeToCanvas, canvasCenter, newCardText])

  const handleZoom = useCallback((delta: number) => {
    controller.zoomBy(delta)
    if (zoomSaveTimerRef.current !== null) window.clearTimeout(zoomSaveTimerRef.current)
    zoomSaveTimerRef.current = window.setTimeout(persistLatestLayout, 240)
  }, [controller, persistLatestLayout])

  const handleFitToView = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect()
    controller.setViewportSize({
      width: rect?.width && Number.isFinite(rect.width) ? rect.width : 760,
      height: rect?.height && Number.isFinite(rect.height) ? rect.height : 460,
    })
    controller.fitToContent()
  }, [controller])

  const handleAutoLayout = useCallback(() => {
    const rect = viewportRef.current?.getBoundingClientRect()
    const viewportWidth = rect?.width && Number.isFinite(rect.width) ? rect.width : 760
    const viewportHeight = rect?.height && Number.isFinite(rect.height) ? rect.height : 460
    controller.setViewportSize({ width: viewportWidth, height: viewportHeight })
    controller.autoLayout()
  }, [controller])

  const addLooseNodeAtPoint = useCallback((rawValue: string, point: { x: number; y: number }) => {
    const current = canvasRef.current
    const value = rawValue.trim()
    if (!current || !value) return
    const isBlock = looksLikeBlockCitation(value)
    const isImage = looksLikeImageRef(value)
    const nodeType: ProjectCanvasNodeType = isBlock ? 'paper_block' : isImage ? 'image' : 'text'
    const width = nodeType === 'image' ? 300 : DEFAULT_NODE_WIDTH
    const height = nodeType === 'image' ? 210 : DEFAULT_EMBEDDED_NODE_HEIGHT
    const node: ProjectCanvasNode = {
      id: nextCanvasId(nodeType, current.nodes.map(item => item.id)),
      type: nodeType,
      ref: nodeType === 'image' || nodeType === 'paper_block' ? value : undefined,
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
      title: nodeType === 'image' ? titleFromPath(value) : undefined,
      text: nodeType === 'text' ? value : undefined,
    }
    const nextCanvas = { ...current, nodes: [...current.nodes, node] }
    selectSingleNode(node.id)
    commitContentCanvas(nextCanvas, current)
    trackProjectCanvasNodeAdded({ linked: false, nodeType })
  }, [commitContentCanvas, selectSingleNode])

  const addPayloadNodeAtPoint = useCallback((payload: { nodeType: ProjectCanvasNodeType; ref: string; title?: string; text?: string }, point: { x: number; y: number }) => {
    const current = canvasRef.current
    if (!current) return
    const ref = payload.ref.startsWith('/') ? relativeVaultPath(payload.ref, vaultPath) : payload.ref
    const existing = current.nodes.find(node => node.ref === ref)
    if (existing) {
      focusNode(existing, false)
      return
    }
    const width = DEFAULT_NODE_WIDTH
    const height = DEFAULT_NODE_HEIGHT
    const node: ProjectCanvasNode = {
      id: nextCanvasId(payload.nodeType, current.nodes.map(item => item.id)),
      type: payload.nodeType,
      ref,
      x: point.x - width / 2,
      y: point.y - height / 2,
      width,
      height,
      title: payload.title,
      text: payload.text,
    }
    const nextCanvas = { ...current, nodes: [...current.nodes, node] }
    selectSingleNode(node.id)
    commitContentCanvas(nextCanvas, current)
    trackProjectCanvasNodeAdded({ linked: false, nodeType: payload.nodeType })
  }, [commitContentCanvas, focusNode, selectSingleNode, vaultPath])

  const handleCanvasDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return
    const point = screenPointToCanvas(event.clientX, event.clientY)
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
  }, [addLooseNodeAtPoint, addPayloadNodeAtPoint, screenPointToCanvas])

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

  const copySelectedNode = useCallback(() => {
    const current = canvasRef.current
    if (!current || !selectedNodeId) return
    clipboardRef.current = current.nodes.find(node => node.id === selectedNodeId) ?? null
    clipboardNodesRef.current = current.nodes.filter(node => selectedNodeIds.includes(node.id))
  }, [selectedNodeId, selectedNodeIds])

  const pasteCopiedNode = useCallback(() => {
    const current = canvasRef.current
    const copiedNodes = clipboardNodesRef.current.length > 0
      ? clipboardNodesRef.current
      : clipboardRef.current ? [clipboardRef.current] : []
    if (!current || copiedNodes.length === 0) return
    const existingIds = current.nodes.map(item => item.id)
    const pasted: ProjectCanvasNode[] = []
    for (const copied of copiedNodes) {
      const id = nextCanvasId(copied.type, [...existingIds, ...pasted.map(item => item.id)])
      pasted.push({
        ...copied,
        id,
        x: copied.x + 28,
        y: copied.y + 28,
      })
    }
    const nextCanvas = { ...current, nodes: [...current.nodes, ...pasted] }
    setSelectedNodeIds(pasted.map(node => node.id))
    setSelectedEdgeId(null)
    commitContentCanvas(nextCanvas, current)
    for (const node of pasted) trackProjectCanvasNodeAdded({ linked: false, nodeType: node.type })
  }, [commitContentCanvas, setSelectedEdgeId, setSelectedNodeIds])

  const handleViewportPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canvasRef.current) return
    if (event.target !== event.currentTarget) return
    controller.beginPan({ x: event.clientX, y: event.clientY }, event.pointerId)
  }, [controller])

  const handleNodePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, node: ProjectCanvasNode) => {
    if (event.button !== 0) return
    if (controller.isHandOverrideActive() && canvasRef.current) {
      event.preventDefault()
      event.stopPropagation()
      controller.beginPan({ x: event.clientX, y: event.clientY }, event.pointerId)
      return
    }
    if ((event.target as HTMLElement).closest('button, input, textarea, select, [role="checkbox"], [contenteditable="true"]')) return
    event.stopPropagation()
    controller.beginNodeDrag(node.id, { x: event.clientX, y: event.clientY }, event.pointerId)
  }, [controller])

  const handleConnectPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>, node: ProjectCanvasNode) => {
    if (event.button !== 0) return
    event.stopPropagation()
    selectSingleNode(node.id)
    controller.beginGesture('connect', {
      point: { x: event.clientX, y: event.clientY },
      targetId: node.id,
      pointerId: event.pointerId,
    })
  }, [controller, selectSingleNode])

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, node: ProjectCanvasNode) => {
    if (event.button !== 0) return
    event.stopPropagation()
    controller.beginNodeResize(node.id, { x: event.clientX, y: event.clientY }, event.pointerId)
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

  const connectPreview = useMemo(() => {
    const gesture = controllerSnapshot.gesture
    if (gesture.kind !== 'connect' || !gesture.start || !gesture.current || !canvas) return null
    const fromNode = canvas.nodes.find(node => node.id === gesture.targetId)
    if (!fromNode) return null
    return {
      from: nodeCenter(fromNode),
      to: screenPointToCanvas(gesture.current.x, gesture.current.y),
    }
  }, [canvas, controllerSnapshot.gesture, screenPointToCanvas])

  const handleNodeClick = useCallback((node: ProjectCanvasNode) => {
    if (Date.now() < suppressClickUntilRef.current) return
    if (nodeIsEmbedded(node) || node.type === 'image') return
    const resolved = refsByNodeId.get(node.id)
    const target = resolved?.targetPath ?? resolved?.targetTitle ?? node.ref
    if (!target) return
    onNavigateWikilink(target)
  }, [onNavigateWikilink, refsByNodeId])

  const closeCanvasEditor = useCallback(() => {
    if (editingNodeId) onSave?.()
    setEditingNodeId(null)
    setEditorHost(null)
    setFocusMode(false)
  }, [editingNodeId, onSave, setEditingNodeId])

  const changeFocusMode = useCallback((enabled: boolean) => {
    const current = canvasRef.current?.nodes.find(node => node.id === editingNodeId)
      ?? (peekNode?.id === editingNodeId ? peekNode : null)
    if (!current || (current.type !== 'note' && current.type !== 'paper')) return
    setEditorHost(null)
    setFocusMode(enabled)
    trackProjectCanvasFocusModeChanged({ enabled, nodeType: current.type })
  }, [editingNodeId, peekNode])

  const editDocumentNode = useCallback((node: ProjectCanvasNode) => {
    if (node.type !== 'note' && node.type !== 'paper') {
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
    const current = canvasRef.current
    if (current && (node.width < EDITOR_MIN_WIDTH || node.height < EDITOR_MIN_HEIGHT)) {
      const nextCanvas = {
        ...current,
        nodes: current.nodes.map(candidate => candidate.id === node.id
          ? {
              ...candidate,
              width: Math.max(candidate.width, EDITOR_MIN_WIDTH),
              height: Math.max(candidate.height, EDITOR_MIN_HEIGHT),
            }
          : candidate),
      }
      commitContentCanvas(nextCanvas, current)
    }
    setEditingNodeId(node.id)
  }, [commitContentCanvas, editingNodeId, entries, handleNodeClick, onSave, refsByNodeId, selectSingleNode, setEditingNodeId, vaultPath])

  const closePeekNode = useCallback(() => {
    if (!peekNode) return
    if (editingNodeId === peekNode.id) onSave?.()
    setPeekNode(null)
    setEditorHost(null)
    setEditingNodeId(null)
    setFocusMode(false)
    selectSingleNode(null)
  }, [editingNodeId, onSave, peekNode, selectSingleNode, setEditingNodeId])

  const pinPeekNode = useCallback(() => {
    const current = canvasRef.current
    if (!current || !peekNode) return
    const nextCanvas = { ...current, nodes: [...current.nodes, peekNode] }
    setPeekNode(null)
    commitContentCanvas(nextCanvas, current)
    trackProjectCanvasPeekPinned({ nodeType: peekNode.type })
  }, [commitContentCanvas, peekNode])

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
      setPeekNode(null)
      setFocusMode(false)
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
    const nextPeek: ProjectCanvasNode = {
      id: nextCanvasId('peek', current.nodes.map(node => node.id)),
      type: nodeType,
      ref: relativeVaultPath(targetEntry.path, vaultPath),
      x: sourceNode ? sourceNode.x + sourceNode.width + 80 : canvasCenter(EDITOR_MIN_WIDTH, EDITOR_MIN_HEIGHT).x,
      y: sourceNode ? sourceNode.y : canvasCenter(EDITOR_MIN_WIDTH, EDITOR_MIN_HEIGHT).y,
      width: EDITOR_MIN_WIDTH,
      height: EDITOR_MIN_HEIGHT,
      title: targetEntry.title,
    }
    setEditorHost(null)
    setFocusMode(false)
    setPeekNode(nextPeek)
    focusNode(nextPeek, false)
    setEditingNodeId(nextPeek.id)
    trackProjectCanvasPeekOpened({ nodeType })
  }, [canvasCenter, editDocumentNode, editingNodeId, entries, focusNode, onNavigateWikilink, onSave, peekNode, refsByNodeId, selectedNodeId, setEditingNodeId, vaultPath])

  useEffect(() => {
    const navigate = (target: string) => {
      consumeProjectCanvasNavigate(entry.path)
      handleCanvasNavigate(target)
    }
    const pending = consumeProjectCanvasNavigate(entry.path)
    if (pending) handleCanvasNavigate(pending.target)

    const handleNavigate = (event: Event) => {
      const intent = (event as ProjectCanvasNavigateEvent).detail
      if (intent.projectPath === entry.path) navigate(intent.target)
    }
    window.addEventListener(PROJECT_CANVAS_NAVIGATE_EVENT, handleNavigate)
    return () => window.removeEventListener(PROJECT_CANVAS_NAVIGATE_EVENT, handleNavigate)
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
    updateCanvas(current => ({
      ...current,
      nodes: current.nodes.map(node => node.id === nodeId ? { ...node, text } : node),
    }))
  }, [updateCanvas])

  const handleNodeTextBlur = useCallback(() => {
    const latest = canvasRef.current
    if (!latest) return
    void persistCanvas(latest, 'content')
  }, [persistCanvas])

  const toggleTaskNode = useCallback((nodeId: string) => {
    const current = canvasRef.current
    if (!current) return
    const nextCanvas = {
      ...current,
      nodes: current.nodes.map(node => node.id === nodeId ? { ...node, completed: !node.completed } : node),
    }
    commitContentCanvas(nextCanvas, current)
  }, [commitContentCanvas])

  const updateSelectedNode = useCallback((patch: Partial<ProjectCanvasNode>, persist = false) => {
    const current = canvasRef.current
    if (!current || !selectedNodeId) return
    const nextCanvas = {
      ...current,
      nodes: current.nodes.map(node => node.id === selectedNodeId ? { ...node, ...patch } : node),
    }
    if (persist) controller.replaceScene(nextCanvas, 'Update node', 'structural')
    else controller.updateScene(() => nextCanvas)
    canvasRef.current = nextCanvas
    if (persist && Object.keys(patch).length === 0) void controller.persist(nextCanvas, 'structural')
  }, [controller, selectedNodeId])

  const updateSelectedEdge = useCallback((patch: Partial<ProjectCanvas['edges'][number]>, persist = false) => {
    const current = canvasRef.current
    if (!current || !selectedEdgeId) return
    const nextCanvas = {
      ...current,
      edges: current.edges.map(edge => edge.id === selectedEdgeId ? { ...edge, ...patch } : edge),
    }
    if (persist) controller.replaceScene(nextCanvas, 'Update edge', 'structural')
    else controller.updateScene(() => nextCanvas)
    canvasRef.current = nextCanvas
    if (persist && Object.keys(patch).length === 0) void controller.persist(nextCanvas, 'structural')
  }, [controller, selectedEdgeId])

  const deleteSelectedNode = useCallback(() => {
    const current = canvasRef.current
    const ids = selectedNodeIds.length > 0 ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : []
    const deletableIds = ids.filter(id => id !== PROJECT_OVERVIEW_NODE_ID)
    if (!current || deletableIds.length === 0) return
    if (editingNodeId && deletableIds.includes(editingNodeId)) {
      onSave?.()
      setEditingNodeId(null)
      setEditorHost(null)
      setFocusMode(false)
    }
    const selectedIds = new Set(deletableIds)
    const nextCanvas = {
      ...current,
      nodes: current.nodes.filter(node => !selectedIds.has(node.id)),
      edges: current.edges.filter(edge => !selectedIds.has(edge.from) && !selectedIds.has(edge.to)),
    }
    setSelectedNodeId(null)
    setSelectedNodeIds([])
    commitContentCanvas(nextCanvas, current)
  }, [commitContentCanvas, editingNodeId, onSave, selectedNodeId, selectedNodeIds, setEditingNodeId, setSelectedNodeId, setSelectedNodeIds])

  const deleteSelectedEdge = useCallback(() => {
    const current = canvasRef.current
    if (!current || !selectedEdgeId) return
    const nextCanvas = {
      ...current,
      edges: current.edges.filter(edge => edge.id !== selectedEdgeId),
    }
    setSelectedEdgeId(null)
    commitContentCanvas(nextCanvas, current)
  }, [commitContentCanvas, selectedEdgeId, setSelectedEdgeId])

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
      if (addPanelOpen) {
        setAddPanelOpen(false)
        return
      }
      if (controller.getGestureSnapshot().phase !== 'idle') {
        controller.escape()
        return
      }
      if (editingNodeId) {
        controller.escape()
        closeCanvasEditor()
        return
      }
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

  const edgeBounds = canvasBounds(canvas.nodes) ?? { minX: -400, minY: -300, maxX: 1000, maxY: 800 }
  const padding = 240
  const svgMinX = edgeBounds.minX - padding
  const svgMinY = edgeBounds.minY - padding
  const svgWidth = Math.max(1200, edgeBounds.maxX - edgeBounds.minX + padding * 2)
  const svgHeight = Math.max(900, edgeBounds.maxY - edgeBounds.minY + padding * 2)
  const editingNode = canvas.nodes.find(node => node.id === editingNodeId)
    ?? (peekNode?.id === editingNodeId ? peekNode : null)
  const editingEntry = editingNode
    ? findEntryForProjectCanvasRef(entries, editingNode.ref, refsByNodeId.get(editingNode.id)?.targetPath, vaultPath)
    : null
  const retainedNodeIds = new Set(selectedNodeIds)
  if (editingNodeId) retainedNodeIds.add(editingNodeId)
  const visibleNodes = controller.queryVisibleNodes(retainedNodeIds)
  const camera = controllerSnapshot.viewport.camera

  return (
    <section className="project-canvas-surface" data-testid="project-canvas-surface">
      <header className="project-canvas-toolbar">
        <div className="project-canvas-toolbar__meta">
          <div className="project-canvas-toolbar__title">{entry.title}</div>
          <div className="project-canvas-toolbar__status">
            {translate(locale, 'projectCanvas.status', {
              edgeCount: String(canvas.edges.length),
              nodeCount: String(canvas.nodes.length),
              savedState: saving ? translate(locale, 'projectCanvas.saving') : translate(locale, 'projectCanvas.saved'),
            })}
          </div>
        </div>
      </header>
      <div
        className="project-canvas-viewport"
        data-testid="project-canvas-viewport"
        ref={viewportRef}
        tabIndex={0}
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        onKeyDown={handleCanvasKeyDown}
        onKeyUp={handleCanvasKeyUp}
        onBlur={() => controller.setSpacePressed(false)}
        onPointerDown={handleViewportPointerDown}
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
            bounds={{ minX: svgMinX, minY: svgMinY, width: svgWidth, height: svgHeight }}
            canvas={canvas}
            connectPreview={connectPreview}
            onSelectEdge={handleSelectEdge}
            selectedEdgeId={selectedEdgeId}
          />
          <CanvasDocumentLayer nodes={visibleNodes} renderNode={(node) => {
            const nodeEntry = findEntryForProjectCanvasRef(entries, node.ref, refsByNodeId.get(node.id)?.targetPath, vaultPath)
            return (
              <ProjectCanvasNodeCard
                key={node.id}
                node={node}
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
                onConnectPointerDown={(event) => handleConnectPointerDown(event, node)}
                onResizePointerDown={(event) => handleResizePointerDown(event, node)}
                onSelect={(event) => handleSelectNode(node, event)}
                onToggleTask={() => toggleTaskNode(node.id)}
                onTextBlur={handleNodeTextBlur}
                onTextChange={(text) => handleNodeTextChange(node.id, text)}
              />
            )
          }} />
          {peekNode ? (
            <ProjectCanvasNodeCard
              node={peekNode}
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
              onConnectPointerDown={event => event.stopPropagation()}
              onResizePointerDown={event => event.stopPropagation()}
              onSelect={(event) => handleSelectNode(peekNode, event)}
              onToggleTask={() => {}}
              onTextBlur={() => {}}
              onTextChange={() => {}}
            />
          ) : null}
          {aiDraftNode ? (
            <ProjectCanvasNodeCard
              node={aiDraftNode}
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
              onConnectPointerDown={event => event.stopPropagation()}
              onResizePointerDown={event => event.stopPropagation()}
              onSelect={(event) => handleSelectNode(aiDraftNode, event)}
              onToggleTask={() => {}}
              onTextBlur={() => {}}
              onTextChange={() => {}}
            />
          ) : null}
        </div>
        <CanvasOverlayLayer selectionRect={controllerSnapshot.overlay.rect} />
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
          onClose={() => {
            setSelectedNodeId(null)
            setSelectedNodeIds([])
            setSelectedEdgeId(null)
          }}
          onDeleteEdge={deleteSelectedEdge}
          onDeleteNode={selectedNodeId === peekNode?.id ? closePeekNode : deleteSelectedNode}
          onEdgeChange={updateSelectedEdge}
          onEdgeKindDefaultChange={setEdgeKind}
          onNavigate={selectedNode && !nodeIsEmbedded(selectedNode) && selectedNode.type !== 'image'
            ? () => handleNodeClick(selectedNode)
            : undefined}
          onNodeChange={updateSelectedNode}
        />
        <div className="project-canvas-floating-toolbar" aria-label={translate(locale, 'projectCanvas.toolbar')}>
          <Button type="button" size="icon-sm" variant="secondary" aria-label={translate(locale, 'projectCanvas.selectTool')}>
            <Square size={15} />
          </Button>
          {editingNodeId && !focusMode ? (
            <Button
              type="button"
              size="icon-sm"
              variant="outline"
              aria-label={translate(locale, 'projectCanvas.enterFocusMode')}
              onClick={() => changeFocusMode(true)}
            >
              <CornersOut size={14} />
            </Button>
          ) : null}
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => restoreCanvasFromHistory('undo')}
            disabled={!controllerSnapshot.canUndo}
            aria-label={translate(locale, 'projectCanvas.undo')}
          >
            <ArrowCounterClockwise size={14} />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => restoreCanvasFromHistory('redo')}
            disabled={!controllerSnapshot.canRedo}
            aria-label={translate(locale, 'projectCanvas.redo')}
          >
            <ArrowClockwise size={14} />
          </Button>
          <Popover open={addPanelOpen} onOpenChange={setAddPanelOpen}>
            <PopoverTrigger asChild>
              <Button type="button" size="sm" variant="default">
                <Plus size={14} />
                {translate(locale, 'projectCanvas.add')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="project-canvas-add-popover" align="center" side="top" sideOffset={12}>
              <PopoverHeader>
                <PopoverTitle>{translate(locale, 'projectCanvas.addToCanvas')}</PopoverTitle>
              </PopoverHeader>
              <div className="project-canvas-add-popover__modes" role="group" aria-label={translate(locale, 'projectCanvas.addMode')}>
                {(['existing', 'text', 'task', 'image', 'block', 'group'] as const).map(mode => (
                  <Button
                    key={mode}
                    type="button"
                    size="xs"
                    variant={addMode === mode ? 'secondary' : 'ghost'}
                    onClick={() => setAddMode(mode)}
                  >
                    {mode === 'existing' ? <MagnifyingGlass size={13} /> : null}
                    {mode === 'text' ? <TextT size={13} /> : null}
                    {mode === 'task' ? <CheckSquare size={13} /> : null}
                    {mode === 'image' ? <ImageSquare size={13} /> : null}
                    {mode === 'block' ? <Clipboard size={13} /> : null}
                    {mode === 'group' ? <Square size={13} /> : null}
                    {translate(locale, `projectCanvas.addMode.${mode}`)}
                  </Button>
                ))}
              </div>
              <div className="project-canvas-add-popover__relation">
                <label className="project-canvas-add-popover__checkbox">
                  <Checkbox
                    checked={Boolean(selectedNodeId && linkFromSelected)}
                    disabled={!selectedNodeId}
                    onCheckedChange={checked => setLinkFromSelected(checked === true)}
                  />
                  <span>
                    {selectedNode
                      ? translate(locale, 'projectCanvas.linkFromSelected', { title: selectedNode.title ?? selectedNode.ref ?? selectedNode.id })
                      : translate(locale, 'projectCanvas.selectSourceHint')}
                  </span>
                </label>
                <Select value={edgeKind} onValueChange={value => setEdgeKind(value as ProjectCanvasEdgeKind)} disabled={!selectedNodeId || !linkFromSelected}>
                  <SelectTrigger size="sm" className="project-canvas-add-popover__edge-kind" aria-label={translate(locale, 'projectCanvas.edgeKind')}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="end">
                    {EDGE_KINDS.map(kind => (
                      <SelectItem key={kind} value={kind}>
                        {translate(locale, edgeKindKey(kind))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {addMode === 'existing' ? (
                <div className="project-canvas-add-popover__existing">
                  <Input
                    value={candidateQuery}
                    onChange={event => setCandidateQuery(event.target.value)}
                    placeholder={translate(locale, 'projectCanvas.searchPlaceholder')}
                  />
                  <div className="project-canvas-add-popover__results">
                    {candidateEntries.length > 0 ? candidateEntries.map(candidate => {
                      const type = candidateEntryType(candidate)
                      return (
                        <Button
                          key={candidate.path}
                          type="button"
                          variant="ghost"
                          className="project-canvas-add-popover__candidate"
                          onClick={() => handleAddEntry(candidate)}
                        >
                          <span className="project-canvas-add-popover__candidate-kind">
                            {type ? translate(locale, `projectCanvas.node.${type}`) : ''}
                          </span>
                          <span className="project-canvas-add-popover__candidate-title">{candidate.title}</span>
                        </Button>
                      )
                    }) : (
                      <div className="project-canvas-add-popover__empty">{translate(locale, 'projectCanvas.noCandidates')}</div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="project-canvas-add-popover__embedded">
                  <Textarea
                    value={newCardText}
                    onChange={event => setNewCardText(event.target.value)}
                    placeholder={translate(locale, `projectCanvas.addPlaceholder.${addMode}`)}
                  />
                  <Button type="button" size="sm" onClick={handleAddEmbeddedNode}>
                    {translate(locale, 'projectCanvas.addCard')}
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Button type="button" size="icon-sm" variant="outline" onClick={() => handleZoom(-ZOOM_STEP)} aria-label={translate(locale, 'projectCanvas.zoomOut')}>
            <Minus size={14} />
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={handleFitToView}>
            {Math.round(camera.zoom * 100)}%
          </Button>
          <Button type="button" size="icon-sm" variant="outline" onClick={() => handleZoom(ZOOM_STEP)} aria-label={translate(locale, 'projectCanvas.zoomIn')}>
            <Plus size={14} />
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleFitToView}>
            <CornersOut size={14} />
            {translate(locale, 'projectCanvas.fit')}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={handleAutoLayout}>
            <Graph size={14} />
            {translate(locale, 'projectCanvas.autoLayout')}
          </Button>
        </div>
      </div>
    </section>
  )
}
