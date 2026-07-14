import type { ComponentProps } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProjectCanvasToolbar } from './ProjectCanvasToolbar'
import { projectCanvasSavedState } from './projectCanvasSaveState'

function toolbarProps(): ComponentProps<typeof ProjectCanvasToolbar> {
  const noOp = vi.fn()
  return {
    addMode: 'existing',
    addPanelOpen: false,
    candidateEntries: [],
    candidateQuery: '',
    canRedo: false,
    canUndo: false,
    edgeCount: 0,
    edgeKind: 'related',
    editingNodeId: null,
    focusMode: false,
    linkFromSelected: false,
    locale: 'en',
    newCardText: '',
    nodeCount: 0,
    onAddEmbeddedNode: noOp,
    onAddEntry: noOp,
    onAddModeChange: noOp,
    onAddPanelOpenChange: noOp,
    onAlign: noOp,
    onArrange: noOp,
    onAutoLayout: noOp,
    onCandidateQueryChange: noOp,
    onDistribute: noOp,
    onEdgeKindChange: noOp,
    onFit: noOp,
    onFocusModeChange: noOp,
    onLinkFromSelectedChange: noOp,
    onNewCardTextChange: noOp,
    onRedo: noOp,
    onToolChange: noOp,
    onUndo: noOp,
    onZoom: noOp,
    saveError: 'disk full',
    saving: false,
    selectedNode: null,
    selectedNodeCount: 0,
    selectedNodeId: null,
    title: 'Alpha',
    tool: 'select',
    zoom: 1,
  }
}

describe('projectCanvasSavedState', () => {
  it('never labels a failed Canvas write as saved', () => {
    expect(projectCanvasSavedState('en', false, 'disk full')).toBe('Save failed: disk full')
    expect(projectCanvasSavedState('en', true, 'disk full')).toBe('saving')
    expect(projectCanvasSavedState('en', false, null)).toBe('saved')
  })

  it('renders the failed state in the production toolbar status', () => {
    render(<ProjectCanvasToolbar {...toolbarProps()} />)

    expect(screen.getByText('0 nodes / 0 edges / Save failed: disk full')).toBeInTheDocument()
    expect(screen.queryByText(/\/ saved$/u)).not.toBeInTheDocument()
  })
})
