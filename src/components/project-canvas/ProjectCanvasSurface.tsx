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
  type ProjectCanvasNode,
  type ProjectCanvasResolvedRef,
} from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { cn } from '../../lib/utils'
import { trackProjectCanvasCreated, trackProjectCanvasLayoutSaved, trackProjectCanvasOpened } from '../../lib/productAnalytics'
import { boundedSnippet, findEntryForProjectCanvasRef, paperSubtitle } from './projectCanvasEntryPreview'
import './ProjectCanvasSurface.css'

const MIN_NODE_WIDTH = 180
const MIN_NODE_HEIGHT = 110
const ZOOM_MIN = 0.35
const ZOOM_MAX = 2
const ZOOM_STEP = 0.1

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
  const operationRef = useRef<CanvasOperation | null>(null)
  const canvasRef = useRef<ProjectCanvas | null>(null)
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
      <div
        className="project-canvas-viewport"
        data-testid="project-canvas-viewport"
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
              onClick={() => handleNodeClick(node)}
              onPointerDown={(event) => handleNodePointerDown(event, node)}
              onResizePointerDown={(event) => handleResizePointerDown(event, node)}
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
  onClick,
  onPointerDown,
  onResizePointerDown,
  onTextChange,
  onTextBlur,
}: {
  node: ProjectCanvasNode
  entry: VaultEntry | null
  locale: AppLocale
  resolved?: ProjectCanvasResolvedRef
  onClick: () => void
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
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
      className={cn('project-canvas-node', isStale && 'project-canvas-node--stale')}
      data-testid="project-canvas-node"
      data-node-id={node.id}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onClick={onClick}
      onPointerDown={onPointerDown}
    >
      <div className="project-canvas-node__body">
        <div className="project-canvas-node__header">
          <span className="project-canvas-node__kind">{translate(locale, nodeKindKey(node))}</span>
          {isStale ? <span className="project-canvas-node__state">{translate(locale, 'projectCanvas.stale')}</span> : null}
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
