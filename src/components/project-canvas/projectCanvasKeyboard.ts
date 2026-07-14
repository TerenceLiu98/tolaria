import type React from 'react'
import type { ProjectCanvasNode } from '../../projectCanvas'
import type { ProjectCanvasController } from '../../projectCanvasController'

type HistoryDirection = 'redo' | 'undo'

interface ProjectCanvasKeyboardConfig {
  addPanelOpen: boolean
  aiDraftNodeId?: string | null
  changeFocusMode: (enabled: boolean) => void
  closeAiDraft: () => void
  closeCanvasEditor: () => void
  closePeekNode: () => void
  controller: ProjectCanvasController
  copySelectedNode: () => void
  deleteSelectedEdge: () => void
  deleteSelectedNode: () => void
  editDocumentNode: (node: ProjectCanvasNode) => void
  editingNodeId: string | null
  focusMode: boolean
  pasteCopiedNode: () => void
  peekNodeId?: string | null
  restoreCanvasFromHistory: (direction: HistoryDirection) => void
  selectSingleNode: (nodeId: string | null) => void
  selectedEdgeId: string | null
  selectedNode: ProjectCanvasNode | null
  selectedNodeId: string | null
  setAddPanelOpen: (open: boolean) => void
  setSelectedEdgeId: (edgeId: string | null) => void
}

type CanvasKeyboardEvent = React.KeyboardEvent<HTMLDivElement>

class ProjectCanvasKeyboardRouter {
  private readonly event: CanvasKeyboardEvent
  private readonly config: ProjectCanvasKeyboardConfig

  constructor(event: CanvasKeyboardEvent, config: ProjectCanvasKeyboardConfig) {
    this.event = event
    this.config = config
  }

  handle(): void {
    if (this.handleFocusModeShortcut() || this.isEditorTarget()) return
    if (this.handleAddShortcut()) return
    if (this.handleEscape()) return
    if (this.handleSpace()) return
    if (this.handleEnter()) return
    if (this.handleHistory()) return
    if (this.handleClipboard()) return
    this.handleDelete()
  }

  private consume(): void {
    this.event.preventDefault()
    this.event.stopPropagation()
  }

  private hasCommandModifier(): boolean {
    return this.event.metaKey || this.event.ctrlKey
  }

  private handleFocusModeShortcut(): boolean {
    if (!this.hasCommandModifier() || this.event.key !== 'Enter' || !this.config.editingNodeId) return false
    this.consume()
    this.config.changeFocusMode(!this.config.focusMode)
    return true
  }

  private handleAddShortcut(): boolean {
    if (!this.hasCommandModifier() || this.event.key.toLowerCase() !== 'k') return false
    this.consume()
    this.config.setAddPanelOpen(true)
    return true
  }

  private handleEscape(): boolean {
    if (this.event.key !== 'Escape') return false
    this.consume()
    if (this.config.controller.getGestureSnapshot().phase !== 'idle') {
      this.config.controller.escape()
      return true
    }
    if (this.config.editingNodeId) {
      if (this.config.controller.escape() === 'editing') this.config.closeCanvasEditor()
      return true
    }
    if (this.config.addPanelOpen) {
      this.config.setAddPanelOpen(false)
      return true
    }
    const result = this.config.controller.escape()
    if (result !== 'overlay' && result !== 'selection' && result !== 'group') {
      this.config.selectSingleNode(null)
      this.config.setSelectedEdgeId(null)
    }
    return true
  }

  private handleSpace(): boolean {
    if (this.event.key !== ' ') return false
    this.event.preventDefault()
    this.config.controller.setSpacePressed(true)
    return true
  }

  private handleEnter(): boolean {
    if (this.event.key !== 'Enter' || !this.config.selectedNode) return false
    this.consume()
    this.config.editDocumentNode(this.config.selectedNode)
    return true
  }

  private handleHistory(): boolean {
    if (!this.hasCommandModifier()) return false
    const key = this.event.key.toLowerCase()
    if (key !== 'z' && key !== 'y') return false
    this.event.preventDefault()
    this.config.restoreCanvasFromHistory(key === 'y' || this.event.shiftKey ? 'redo' : 'undo')
    return true
  }

  private handleClipboard(): boolean {
    if (!this.hasCommandModifier()) return false
    const action = this.event.key.toLowerCase() === 'c'
      ? this.config.copySelectedNode
      : this.event.key.toLowerCase() === 'v'
        ? this.config.pasteCopiedNode
        : null
    if (!action) return false
    this.event.preventDefault()
    action()
    return true
  }

  private handleDelete(): boolean {
    if (this.event.key !== 'Delete' && this.event.key !== 'Backspace') return false
    this.event.preventDefault()
    if (this.config.selectedEdgeId) this.config.deleteSelectedEdge()
    else if (this.config.selectedNodeId === this.config.peekNodeId) this.config.closePeekNode()
    else if (this.config.selectedNodeId === this.config.aiDraftNodeId) this.config.closeAiDraft()
    else if (this.config.selectedNodeId) this.config.deleteSelectedNode()
    return true
  }

  private isEditorTarget(): boolean {
    return (this.event.target as HTMLElement).closest('input, textarea, [contenteditable="true"]') !== null
  }
}

export function handleProjectCanvasKeyDown(event: CanvasKeyboardEvent, config: ProjectCanvasKeyboardConfig): void {
  new ProjectCanvasKeyboardRouter(event, config).handle()
}

export function handleProjectCanvasKeyUp(event: CanvasKeyboardEvent, controller: ProjectCanvasController): void {
  if (event.key === ' ') controller.setSpacePressed(false)
}
