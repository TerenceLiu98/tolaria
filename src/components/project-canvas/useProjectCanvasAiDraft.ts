import { useCallback, useEffect, useState, type MutableRefObject } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  trackProjectCanvasAiDraftDiscarded,
  trackProjectCanvasAiDraftOpened,
  trackProjectCanvasAiDraftPinned,
} from '../../lib/productAnalytics'
import type { ProjectCanvas, ProjectCanvasNode } from '../../projectCanvas'
import type { CreateProjectCanvasDraftNote } from '../../projectCanvasDrafts'
import { relativeVaultPath } from './projectCanvasEntryPreview'
import {
  consumeProjectCanvasDraft,
  pendingProjectCanvasDraft,
  PROJECT_CANVAS_DRAFT_EVENT,
  type ProjectCanvasDraftEvent,
} from './projectCanvasNavigation'

interface ProjectCanvasAiDraftConfig {
  canvas: ProjectCanvas | null
  canvasCenter: (width?: number, height?: number) => { x: number; y: number }
  canvasRef: MutableRefObject<ProjectCanvas | null>
  commitCanvas: (next: ProjectCanvas) => void
  allocateNodeId: (prefix: string) => string
  createNote?: CreateProjectCanvasDraftNote
  focusNode: (node: ProjectCanvasNode, persist?: boolean) => void
  locale: AppLocale
  projectPath: string
  selectedNodeId: string | null
  selectNode: (nodeId: string | null) => void
  vaultPath: string
}

export function useProjectCanvasAiDraft({
  allocateNodeId,
  canvas,
  canvasCenter,
  canvasRef,
  commitCanvas,
  createNote,
  focusNode,
  locale,
  projectPath,
  selectedNodeId,
  selectNode,
  vaultPath,
}: ProjectCanvasAiDraftConfig) {
  const [node, setNode] = useState<ProjectCanvasNode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const show = useCallback((intent: { title: string; content: string }): boolean => {
    const current = canvasRef.current
    if (!current) return false
    const position = canvasCenter(560, 420)
    const draft: ProjectCanvasNode = {
      id: 'ai_draft',
      type: 'note',
      x: position.x,
      y: position.y,
      width: 560,
      height: 420,
      title: intent.title,
      text: intent.content,
    }
    setError(null)
    setNode(draft)
    focusNode(draft, false)
    trackProjectCanvasAiDraftOpened()
    return true
  }, [canvasCenter, canvasRef, focusNode])

  useEffect(() => {
    const pending = pendingProjectCanvasDraft(projectPath)
    if (pending && show(pending)) consumeProjectCanvasDraft(projectPath)

    const handleDraft = (event: Event) => {
      const intent = (event as ProjectCanvasDraftEvent).detail
      if (intent.projectPath !== projectPath || !show(intent)) return
      consumeProjectCanvasDraft(projectPath)
    }
    window.addEventListener(PROJECT_CANVAS_DRAFT_EVENT, handleDraft)
    return () => window.removeEventListener(PROJECT_CANVAS_DRAFT_EVENT, handleDraft)
  }, [canvas, projectPath, show])

  const discard = useCallback(() => {
    if (!node) return
    setNode(null)
    setError(null)
    if (selectedNodeId === node.id) selectNode(null)
    trackProjectCanvasAiDraftDiscarded()
  }, [node, selectNode, selectedNodeId])

  const pin = useCallback(async () => {
    const current = canvasRef.current
    if (!current || !node || !createNote || saving) return
    setSaving(true)
    setError(null)
    try {
      const created = await createNote({
        content: node.text ?? '',
        title: node.title ?? translate(locale, 'projectCanvas.aiDraftLabel'),
        vaultPath,
      })
      if (!created) throw new Error(translate(locale, 'projectCanvas.aiDraftCreateFailed'))
      const savedNode: ProjectCanvasNode = {
        ...node,
        id: allocateNodeId('note'),
        ref: relativeVaultPath(created.path, vaultPath),
        title: created.title,
        text: undefined,
      }
      setNode(null)
      commitCanvas({ ...current, nodes: [...current.nodes, savedNode] })
      selectNode(savedNode.id)
      trackProjectCanvasAiDraftPinned()
    } catch (pinError) {
      setError(pinError instanceof Error
        ? pinError.message
        : translate(locale, 'projectCanvas.aiDraftCreateFailed'))
    } finally {
      setSaving(false)
    }
  }, [allocateNodeId, canvasRef, commitCanvas, createNote, locale, node, saving, selectNode, vaultPath])

  return { discard, error, node, pin, saving }
}
