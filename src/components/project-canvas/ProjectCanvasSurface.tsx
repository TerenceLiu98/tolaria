import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { translate, type AppLocale, type TranslationKey } from '../../lib/i18n'
import {
  createProjectCanvas,
  defaultProjectCanvas,
  readProjectCanvas,
  resolveProjectCanvasRefs,
  saveProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasEdgeKind,
  type ProjectCanvasNode,
  type ProjectCanvasNodeType,
  type ProjectCanvasResolvedRef,
} from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { cn } from '../../lib/utils'
import {
  trackProjectCanvasCreated,
  trackProjectCanvasEdgeCreated,
  trackProjectCanvasLayoutSaved,
  trackProjectCanvasNodeAdded,
  trackProjectCanvasOpened,
} from '../../lib/productAnalytics'
import { boundedSnippet, findEntryForProjectCanvasRef, paperSubtitle, relativeVaultPath } from './projectCanvasEntryPreview'
import './ProjectCanvasSurface.css'

const MIN_NODE_WIDTH = 180
const MIN_NODE_HEIGHT = 110
const ZOOM_MIN = 0.35
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1
const DEFAULT_NODE_WIDTH = 260
const DEFAULT_NODE_HEIGHT = 150
const DEFAULT_EMBEDDED_NODE_HEIGHT = 160
const EDGE_KINDS: ProjectCanvasEdgeKind[] = ['related', 'supports', 'contradicts', 'depends_on', 'needs_reading']

interface ProjectCanvasSurfaceProps {
  entry: VaultEntry
  entries: VaultEntry[]
  vaultPath?: string
  locale?: AppLocale
  onNavigateWikilink: (target: string) => void
}

type CanvasOperation =
  | {
      kind: 'pan'
      clientX: number
      clientY: number
      startViewport: ProjectCanvas['viewport']
      moved: boolean
    }
  | {
      kind: 'drag'
      nodeId: string
      clientX: number
      clientY: number
      startNode: ProjectCanvasNode
      zoom: number
      moved: boolean
    }
  | {
      kind: 'resize'
      nodeId: string
      clientX: number
      clientY: number
      startNode: ProjectCanvasNode
      zoom: number
      moved: boolean
    }

type AddPanelMode = 'existing' | 'text' | 'task' | 'group'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function resolvedMap(refs: ProjectCanvasResolvedRef[]): Map<string, ProjectCanvasResolvedRef> {
  return new Map(refs.map(item => [item.nodeId, item]))
}

function nodeCenter(node: ProjectCanvasNode) {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  }
}

function nodeKindKey(node: ProjectCanvasNode): TranslationKey {
  switch (node.type) {
    case 'note':
      return 'projectCanvas.node.note'
    case 'paper':
      return 'projectCanvas.node.paper'
    case 'paper_block':
      return 'projectCanvas.node.paper_block'
    case 'text':
      return 'projectCanvas.node.text'
    case 'task':
      return 'projectCanvas.node.task'
    case 'group':
      return 'projectCanvas.node.group'
  }
}

function edgeKindKey(kind: ProjectCanvasEdgeKind): TranslationKey {
  switch (kind) {
    case 'related':
      return 'projectCanvas.edge.related'
    case 'supports':
      return 'projectCanvas.edge.supports'
    case 'contradicts':
      return 'projectCanvas.edge.contradicts'
    case 'depends_on':
      return 'projectCanvas.edge.depends_on'
    case 'needs_reading':
      return 'projectCanvas.edge.needs_reading'
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

function canvasWithFocusedNode(
  current: ProjectCanvas,
  node: ProjectCanvasNode,
  viewportWidth: number,
  viewportHeight: number,
): ProjectCanvas {
  return {
    ...current,
    viewport: {
      ...current.viewport,
      x: viewportWidth / 2 - (node.x + node.width / 2) * current.viewport.zoom,
      y: viewportHeight / 2 - (node.y + node.height / 2) * current.viewport.zoom,
    },
  }
}

export function ProjectCanvasSurface({
  entry,
  entries,
  vaultPath = '',
  locale = 'en',
  onNavigateWikilink,
}: ProjectCanvasSurfaceProps) {
  const [canvas, setCanvas] = useState<ProjectCanvas | null>(null)
  const [refs, setRefs] = useState<ProjectCanvasResolvedRef[]>([])
  const [state, setState] = useState<'loading' | 'missing' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [addPanelOpen, setAddPanelOpen] = useState(false)
  const [addMode, setAddMode] = useState<AddPanelMode>('existing')
  const [candidateQuery, setCandidateQuery] = useState('')
  const [newCardText, setNewCardText] = useState('')
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [linkFromSelected, setLinkFromSelected] = useState(true)
  const [edgeKind, setEdgeKind] = useState<ProjectCanvasEdgeKind>('related')
  const operationRef = useRef<CanvasOperation | null>(null)
  const canvasRef = useRef<ProjectCanvas | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const resolveRequestRef = useRef(0)
  const suppressClickUntilRef = useRef(0)
  const openedTrackedRef = useRef(false)
  const zoomSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    canvasRef.current = canvas
  }, [canvas])

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
    if (!vaultPath) {
      setState('error')
      setError(translate(locale, 'projectCanvas.errorMissingVault'))
      return
    }
    setState('loading')
    setError(null)
    try {
      const result = await readProjectCanvas(vaultPath, entry.path)
      if (result.state === 'missing' || !result.canvas) {
        setCanvas(null)
        setRefs([])
        setState('missing')
        return
      }
      setCanvas(result.canvas)
      setState('ready')
      void resolveCanvas(result.canvas)
      if (!openedTrackedRef.current) {
        openedTrackedRef.current = true
        trackProjectCanvasOpened({ state: 'ready' })
      }
    } catch (loadError) {
      setState('error')
      setError(loadError instanceof Error ? loadError.message : String(loadError))
    }
  }, [entry.path, locale, resolveCanvas, vaultPath])

  useEffect(() => {
    openedTrackedRef.current = false
    void loadCanvas()
  }, [loadCanvas])

  useEffect(() => () => {
    if (zoomSaveTimerRef.current !== null) window.clearTimeout(zoomSaveTimerRef.current)
  }, [])

  const persistCanvas = useCallback(async (nextCanvas: ProjectCanvas, reason: 'create' | 'layout' | 'content') => {
    if (!vaultPath) return
    setSaving(true)
    try {
      const result = await saveProjectCanvas(vaultPath, entry.path, nextCanvas)
      if (result.canvas) {
        setCanvas(result.canvas)
        canvasRef.current = result.canvas
        void resolveCanvas(result.canvas)
      }
      if (reason === 'layout') trackProjectCanvasLayoutSaved()
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError))
      setState('error')
    } finally {
      setSaving(false)
    }
  }, [entry.path, resolveCanvas, vaultPath])

  const handleCreate = useCallback(async () => {
    if (!vaultPath) return
    setSaving(true)
    setError(null)
    try {
      const result = await createProjectCanvas(vaultPath, entry.path)
      const created = result.canvas ?? defaultProjectCanvas(result.projectPath)
      setCanvas(created)
      canvasRef.current = created
      setState('ready')
      void resolveCanvas(created)
      trackProjectCanvasCreated()
      trackProjectCanvasOpened({ state: 'created' })
    } catch (createError) {
      setState('error')
      setError(createError instanceof Error ? createError.message : String(createError))
    } finally {
      setSaving(false)
    }
  }, [entry.path, resolveCanvas, vaultPath])

  const updateCanvas = useCallback((updater: (current: ProjectCanvas) => ProjectCanvas) => {
    setCanvas(current => {
      if (!current) return current
      const next = updater(current)
      canvasRef.current = next
      return next
    })
  }, [])

  const persistLatestLayout = useCallback(() => {
    const latest = canvasRef.current
    if (!latest) return
    void persistCanvas(latest, 'layout')
  }, [persistCanvas])

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

  const canvasCenter = useCallback((width = DEFAULT_NODE_WIDTH, height = DEFAULT_NODE_HEIGHT) => {
    const viewport = canvasRef.current?.viewport ?? { x: 0, y: 0, zoom: 1 }
    const rect = viewportRef.current?.getBoundingClientRect()
    const viewportWidth = rect?.width && Number.isFinite(rect.width) ? rect.width : 760
    const viewportHeight = rect?.height && Number.isFinite(rect.height) ? rect.height : 460
    return {
      x: (viewportWidth / 2 - viewport.x) / viewport.zoom - width / 2,
      y: (viewportHeight / 2 - viewport.y) / viewport.zoom - height / 2,
    }
  }, [])

  const focusNode = useCallback((node: ProjectCanvasNode, persist = false) => {
    const current = canvasRef.current
    if (!current) return
    const rect = viewportRef.current?.getBoundingClientRect()
    const viewportWidth = rect?.width && Number.isFinite(rect.width) ? rect.width : 760
    const viewportHeight = rect?.height && Number.isFinite(rect.height) ? rect.height : 460
    const nextCanvas = canvasWithFocusedNode(current, node, viewportWidth, viewportHeight)
    setCanvas(nextCanvas)
    canvasRef.current = nextCanvas
    setSelectedNodeId(node.id)
    if (persist) void persistCanvas(nextCanvas, 'layout')
  }, [persistCanvas])

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
    setCanvas(nextCanvas)
    canvasRef.current = nextCanvas
    setSelectedNodeId(node.id)
    void resolveCanvas(nextCanvas)
    void persistCanvas(nextCanvas, 'content')
    trackProjectCanvasNodeAdded({ linked, nodeType: node.type })
  }, [persistCanvas, resolveCanvas])

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
      const rect = viewportRef.current?.getBoundingClientRect()
      const viewportWidth = rect?.width && Number.isFinite(rect.width) ? rect.width : 760
      const viewportHeight = rect?.height && Number.isFinite(rect.height) ? rect.height : 460
      const focusedCanvas = canvasWithFocusedNode(nextCanvas, existing, viewportWidth, viewportHeight)
      setCanvas(focusedCanvas)
      canvasRef.current = focusedCanvas
      setSelectedNodeId(existing.id)
      void resolveCanvas(focusedCanvas)
      if (focusedCanvas.edges.length > current.edges.length) {
        void persistCanvas(focusedCanvas, 'content')
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
  }, [addNodeToCanvas, canvasCenter, focusNode, persistCanvas, resolveCanvas, vaultPath, withSelectedEdge])

  const handleAddEmbeddedNode = useCallback(() => {
    const current = canvasRef.current
    if (!current || addMode === 'existing') return
    const width = addMode === 'group' ? 320 : DEFAULT_NODE_WIDTH
    const height = addMode === 'group' ? 190 : DEFAULT_EMBEDDED_NODE_HEIGHT
    const position = canvasCenter(width, height)
    const trimmed = newCardText.trim()
    addNodeToCanvas({
      id: nextCanvasId(addMode, current.nodes.map(item => item.id)),
      type: addMode,
      x: position.x,
      y: position.y,
      width,
      height,
      text: trimmed || undefined,
      title: addMode === 'group' && trimmed ? trimmed.split(/\n/u)[0] : undefined,
    })
    setNewCardText('')
  }, [addMode, addNodeToCanvas, canvasCenter, newCardText])

  const handleZoom = useCallback((delta: number) => {
    updateCanvas(current => ({
      ...current,
      viewport: {
        ...current.viewport,
        zoom: clamp(Number((current.viewport.zoom + delta).toFixed(2)), ZOOM_MIN, ZOOM_MAX),
      },
    }))
    if (zoomSaveTimerRef.current !== null) window.clearTimeout(zoomSaveTimerRef.current)
    zoomSaveTimerRef.current = window.setTimeout(persistLatestLayout, 240)
  }, [persistLatestLayout, updateCanvas])

  const handleResetView = useCallback(() => {
    updateCanvas(current => ({
      ...current,
      viewport: { x: 0, y: 0, zoom: 1 },
    }))
    window.setTimeout(persistLatestLayout, 0)
  }, [persistLatestLayout, updateCanvas])

  const handleViewportPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canvasRef.current) return
    if (event.target !== event.currentTarget) return
    operationRef.current = {
      kind: 'pan',
      clientX: event.clientX,
      clientY: event.clientY,
      startViewport: canvasRef.current.viewport,
      moved: false,
    }
  }, [])

  const handleNodePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, node: ProjectCanvasNode) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('textarea')) return
    event.stopPropagation()
    operationRef.current = {
      kind: 'drag',
      nodeId: node.id,
      clientX: event.clientX,
      clientY: event.clientY,
      startNode: node,
      zoom: canvasRef.current?.viewport.zoom ?? 1,
      moved: false,
    }
  }, [])

  const handleResizePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>, node: ProjectCanvasNode) => {
    if (event.button !== 0) return
    event.stopPropagation()
    operationRef.current = {
      kind: 'resize',
      nodeId: node.id,
      clientX: event.clientX,
      clientY: event.clientY,
      startNode: node,
      zoom: canvasRef.current?.viewport.zoom ?? 1,
      moved: false,
    }
  }, [])

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const operation = operationRef.current
      if (!operation) return
      const dx = event.clientX - operation.clientX
      const dy = event.clientY - operation.clientY
      if (Math.abs(dx) + Math.abs(dy) > 4) operation.moved = true

      if (operation.kind === 'pan') {
        updateCanvas(current => ({
          ...current,
          viewport: {
            ...current.viewport,
            x: operation.startViewport.x + dx,
            y: operation.startViewport.y + dy,
          },
        }))
        return
      }

      const scaledDx = dx / operation.zoom
      const scaledDy = dy / operation.zoom
      updateCanvas(current => ({
        ...current,
        nodes: current.nodes.map(node => {
          if (node.id !== operation.nodeId) return node
          if (operation.kind === 'drag') {
            return {
              ...node,
              x: operation.startNode.x + scaledDx,
              y: operation.startNode.y + scaledDy,
            }
          }
          return {
            ...node,
            width: Math.max(MIN_NODE_WIDTH, operation.startNode.width + scaledDx),
            height: Math.max(MIN_NODE_HEIGHT, operation.startNode.height + scaledDy),
          }
        }),
      }))
    }

    function handlePointerUp() {
      const operation = operationRef.current
      if (!operation) return
      operationRef.current = null
      if (operation.moved) {
        suppressClickUntilRef.current = Date.now() + 250
        persistLatestLayout()
      }
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [persistLatestLayout, updateCanvas])

  const refsByNodeId = useMemo(() => resolvedMap(refs), [refs])

  const handleNodeClick = useCallback((node: ProjectCanvasNode) => {
    if (Date.now() < suppressClickUntilRef.current) return
    if (node.type === 'text' || node.type === 'task' || node.type === 'group') return
    const resolved = refsByNodeId.get(node.id)
    const target = resolved?.targetPath ?? resolved?.targetTitle ?? node.ref
    if (!target) return
    onNavigateWikilink(target)
  }, [onNavigateWikilink, refsByNodeId])

  const handleSelectNode = useCallback((node: ProjectCanvasNode) => {
    setSelectedNodeId(node.id)
  }, [])

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

  if (state === 'loading') {
    return <div className="project-canvas-loading">{translate(locale, 'projectCanvas.loading')}</div>
  }

  if (state === 'missing') {
    return (
      <div className="project-canvas-empty">
        <div className="project-canvas-empty__title">{translate(locale, 'projectCanvas.missingTitle')}</div>
        <div className="project-canvas-empty__description">{translate(locale, 'projectCanvas.missingDescription')}</div>
        <Button type="button" size="sm" onClick={handleCreate} disabled={saving}>
          {translate(locale, 'projectCanvas.create')}
        </Button>
      </div>
    )
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

  const edgeBounds = canvas.nodes.reduce((bounds, node) => ({
    minX: Math.min(bounds.minX, node.x),
    minY: Math.min(bounds.minY, node.y),
    maxX: Math.max(bounds.maxX, node.x + node.width),
    maxY: Math.max(bounds.maxY, node.y + node.height),
  }), { minX: -400, minY: -300, maxX: 1000, maxY: 800 })
  const padding = 240
  const svgMinX = edgeBounds.minX - padding
  const svgMinY = edgeBounds.minY - padding
  const svgWidth = Math.max(1200, edgeBounds.maxX - edgeBounds.minX + padding * 2)
  const svgHeight = Math.max(900, edgeBounds.maxY - edgeBounds.minY + padding * 2)

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
        <div className="project-canvas-toolbar__actions">
          <Button type="button" size="xs" variant={addPanelOpen ? 'secondary' : 'outline'} onClick={() => setAddPanelOpen(current => !current)}>
            {translate(locale, 'projectCanvas.add')}
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => handleZoom(-ZOOM_STEP)} aria-label={translate(locale, 'projectCanvas.zoomOut')}>
            -
          </Button>
          <Button type="button" size="xs" variant="ghost" onClick={handleResetView}>
            {Math.round(canvas.viewport.zoom * 100)}%
          </Button>
          <Button type="button" size="xs" variant="outline" onClick={() => handleZoom(ZOOM_STEP)} aria-label={translate(locale, 'projectCanvas.zoomIn')}>
            +
          </Button>
        </div>
      </header>
      {addPanelOpen ? (
        <div className="project-canvas-add-panel">
          <div className="project-canvas-add-panel__modes" role="group" aria-label={translate(locale, 'projectCanvas.addMode')}>
            {(['existing', 'text', 'task', 'group'] as const).map(mode => (
              <Button
                key={mode}
                type="button"
                size="xs"
                variant={addMode === mode ? 'secondary' : 'ghost'}
                onClick={() => setAddMode(mode)}
              >
                {translate(locale, `projectCanvas.addMode.${mode}`)}
              </Button>
            ))}
          </div>
          <div className="project-canvas-add-panel__relation">
            <label className="project-canvas-add-panel__checkbox">
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
              <SelectTrigger size="sm" className="project-canvas-add-panel__edge-kind" aria-label={translate(locale, 'projectCanvas.edgeKind')}>
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
            <div className="project-canvas-add-panel__existing">
              <Input
                value={candidateQuery}
                onChange={event => setCandidateQuery(event.target.value)}
                placeholder={translate(locale, 'projectCanvas.searchPlaceholder')}
              />
              <div className="project-canvas-add-panel__results">
                {candidateEntries.length > 0 ? candidateEntries.map(candidate => {
                  const type = candidateEntryType(candidate)
                  return (
                    <Button
                      key={candidate.path}
                      type="button"
                      variant="ghost"
                      className="project-canvas-add-panel__candidate"
                      onClick={() => handleAddEntry(candidate)}
                    >
                      <span className="project-canvas-add-panel__candidate-kind">
                        {type ? translate(locale, `projectCanvas.node.${type}`) : ''}
                      </span>
                      <span className="project-canvas-add-panel__candidate-title">{candidate.title}</span>
                    </Button>
                  )
                }) : (
                  <div className="project-canvas-add-panel__empty">{translate(locale, 'projectCanvas.noCandidates')}</div>
                )}
              </div>
            </div>
          ) : (
            <div className="project-canvas-add-panel__embedded">
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
        </div>
      ) : null}
      <div
        className="project-canvas-viewport"
        data-testid="project-canvas-viewport"
        ref={viewportRef}
        onPointerDown={handleViewportPointerDown}
      >
        <div
          className="project-canvas-world"
          style={{
            transform: `translate(${canvas.viewport.x}px, ${canvas.viewport.y}px) scale(${canvas.viewport.zoom})`,
          }}
        >
          <svg
            className="project-canvas-edges"
            style={{ left: svgMinX, top: svgMinY, width: svgWidth, height: svgHeight }}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            aria-hidden="true"
          >
            {canvas.edges.map(edge => {
              const from = canvas.nodes.find(node => node.id === edge.from)
              const to = canvas.nodes.find(node => node.id === edge.to)
              if (!from || !to) return null
              const fromCenter = nodeCenter(from)
              const toCenter = nodeCenter(to)
              return (
                <line
                  key={edge.id}
                  className="project-canvas-edge"
                  x1={fromCenter.x - svgMinX}
                  y1={fromCenter.y - svgMinY}
                  x2={toCenter.x - svgMinX}
                  y2={toCenter.y - svgMinY}
                />
              )
            })}
          </svg>
          {canvas.nodes.map(node => (
            <ProjectCanvasNodeCard
              key={node.id}
              node={node}
              entry={findEntryForProjectCanvasRef(entries, node.ref, refsByNodeId.get(node.id)?.targetPath, vaultPath)}
              locale={locale}
              resolved={refsByNodeId.get(node.id)}
              selected={node.id === selectedNodeId}
              onClick={() => handleNodeClick(node)}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onResizePointerDown={(event) => handleResizePointerDown(event, node)}
              onSelect={() => handleSelectNode(node)}
              onTextBlur={handleNodeTextBlur}
              onTextChange={(text) => handleNodeTextChange(node.id, text)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function ProjectCanvasNodeCard({
  node,
  entry,
  locale,
  resolved,
  selected,
  onClick,
  onPointerDown,
  onResizePointerDown,
  onSelect,
  onTextChange,
  onTextBlur,
}: {
  node: ProjectCanvasNode
  entry: VaultEntry | null
  locale: AppLocale
  resolved?: ProjectCanvasResolvedRef
  selected: boolean
  onClick: () => void
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onSelect: () => void
  onTextChange: (text: string) => void
  onTextBlur: () => void
}) {
  const isEmbedded = node.type === 'text' || node.type === 'task' || node.type === 'group'
  const isStale = resolved?.state === 'stale'
  const title = node.title ?? entry?.title ?? resolved?.targetTitle ?? node.ref ?? translate(locale, 'projectCanvas.untitledNode')
  const subtitle = entry?.isA === 'Paper' ? paperSubtitle(entry) : null
  const snippet = node.type === 'paper_block'
    ? boundedSnippet(node.text ?? resolved?.message ?? null)
    : boundedSnippet(node.text ?? entry?.snippet ?? null)

  return (
    <article
      className={cn('project-canvas-node', isStale && 'project-canvas-node--stale', selected && 'project-canvas-node--selected')}
      data-testid="project-canvas-node"
      data-node-id={node.id}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <div className="project-canvas-node__body">
        <div className="project-canvas-node__header">
          <span className="project-canvas-node__kind">{translate(locale, nodeKindKey(node))}</span>
          <span className="project-canvas-node__header-actions">
            {isStale ? <span className="project-canvas-node__state">{translate(locale, 'projectCanvas.stale')}</span> : null}
            <Button
              type="button"
              size="xs"
              variant={selected ? 'secondary' : 'ghost'}
              className="project-canvas-node__select"
              onClick={(event) => {
                event.stopPropagation()
                onSelect()
              }}
            >
              {selected ? translate(locale, 'projectCanvas.selected') : translate(locale, 'projectCanvas.selectSource')}
            </Button>
          </span>
        </div>
        <div className="project-canvas-node__title">{title}</div>
        {subtitle ? <div className="project-canvas-node__subtitle">{subtitle}</div> : null}
        {node.ref ? <div className="project-canvas-node__ref">{node.ref}</div> : null}
        {isEmbedded ? (
          <Textarea
            className="project-canvas-node__textarea"
            value={node.text ?? ''}
            onChange={(event) => onTextChange(event.target.value)}
            onBlur={onTextBlur}
            placeholder={translate(locale, 'projectCanvas.textPlaceholder')}
          />
        ) : snippet ? (
          <div className="project-canvas-node__snippet">{snippet}</div>
        ) : null}
        {isStale && resolved?.message ? <div className="project-canvas-node__message">{resolved.message}</div> : null}
      </div>
      <div
        className="project-canvas-node__resize"
        role="presentation"
        onPointerDown={onResizePointerDown}
      />
    </article>
  )
}
