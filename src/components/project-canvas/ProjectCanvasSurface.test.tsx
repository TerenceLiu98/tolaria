import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as projectCanvas from '../../projectCanvas'
import {
  defaultProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasReadResult,
  type ProjectCanvasResolveResult,
} from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import { trackProjectCanvasEdgeReconnected, trackProjectCanvasEdgeRoutingChanged, trackProjectCanvasObjectsArranged } from '../../lib/productAnalytics'
import { ProjectCanvasSurface } from './ProjectCanvasSurface'
import { PROJECT_CANVAS_DRAG_MIME } from './projectCanvasDragData'
import { requestProjectCanvasDraft, requestProjectCanvasNavigate } from './projectCanvasNavigation'

vi.mock('../../lib/productAnalytics', () => ({
  trackProjectCanvasAiDraftDiscarded: vi.fn(),
  trackProjectCanvasAiDraftOpened: vi.fn(),
  trackProjectCanvasAiDraftPinned: vi.fn(),
  trackProjectCanvasCreated: vi.fn(),
  trackProjectCanvasEdgeCreated: vi.fn(),
  trackProjectCanvasEdgeReconnected: vi.fn(),
  trackProjectCanvasEdgeRoutingChanged: vi.fn(),
  trackProjectCanvasFocusModeChanged: vi.fn(),
  trackProjectCanvasGroupFocusChanged: vi.fn(),
  trackProjectCanvasPeekOpened: vi.fn(),
  trackProjectCanvasPeekPinned: vi.fn(),
  trackProjectCanvasLayoutSaved: vi.fn(),
  trackProjectCanvasNavigatorFocused: vi.fn(),
  trackProjectCanvasNodeAdded: vi.fn(),
  trackProjectCanvasOpened: vi.fn(),
  trackProjectCanvasObjectsArranged: vi.fn(),
}))

vi.mock('../../projectCanvas', async () => {
  const actual = await vi.importActual<typeof import('../../projectCanvas')>('../../projectCanvas')
  return {
    ...actual,
    readProjectCanvas: vi.fn(),
    createProjectCanvas: vi.fn(),
    saveProjectCanvas: vi.fn(),
    resolveProjectCanvasRefs: vi.fn(),
  }
})

vi.mock('./CanvasEditorPortal', () => ({
  CanvasEditorPortal: ({ entry, onNavigateWikilink, target }: {
    entry: VaultEntry
    onNavigateWikilink: (target: string) => void
    target: HTMLElement | null
  }) => (
    target ? (
      <div data-testid="canvas-editor-portal">
        <span>{entry.path}</span>
        <button type="button" onClick={() => onNavigateWikilink('Linked Note')}>Follow linked note</button>
      </div>
    ) : null
  ),
}))

function entry(overrides: Partial<VaultEntry>): VaultEntry {
  return {
    path: '/vault/projects/alpha/project.md',
    filename: 'project.md',
    title: 'Alpha Project',
    workspace: undefined,
    isA: 'Project',
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: null,
    archived: false,
    modifiedAt: null,
    createdAt: null,
    fileSize: 0,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: true,
    organized: false,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    properties: {},
    hasH1: true,
    fileKind: 'markdown',
    ...overrides,
  }
}

function readyResult(canvas: ProjectCanvas): ProjectCanvasReadResult {
  return {
    projectPath: 'projects/alpha/project.md',
    canvasPath: 'projects/alpha/project.canvas.json',
    state: 'ready',
    canvas,
  }
}

function resolveResult(canvas: ProjectCanvas): ProjectCanvasResolveResult {
  return {
    projectPath: canvas.project,
    canvasPath: 'projects/alpha/project.canvas.json',
    refs: canvas.nodes.map(node => {
      if (node.id === 'missing') {
        return {
          nodeId: node.id,
          nodeType: node.type,
          ref: node.ref,
          state: 'stale' as const,
          message: 'Missing referenced note',
        }
      }
      if (!node.ref) {
        return {
          nodeId: node.id,
          nodeType: node.type,
          state: 'embedded' as const,
        }
      }
      return {
        nodeId: node.id,
        nodeType: node.type,
        ref: node.ref,
        state: 'resolved' as const,
        targetPath: node.ref,
        targetTitle: node.title,
      }
    }),
    diagnostics: [],
  }
}

function sampleCanvas(): ProjectCanvas {
  return {
    ...defaultProjectCanvas('projects/alpha/project.md'),
    viewport: { x: 20, y: 30, zoom: 1 },
    nodes: [
      {
        id: 'note',
        type: 'note',
        ref: 'notes/source.md',
        x: 10,
        y: 20,
        width: 220,
        height: 130,
        title: 'Source Note',
      },
      {
        id: 'paper',
        type: 'paper',
        ref: 'papers/example/paper.md',
        x: 320,
        y: 20,
        width: 240,
        height: 130,
        title: 'Example Paper',
      },
      {
        id: 'block',
        type: 'paper_block',
        ref: '@block[example#b0001]',
        x: 320,
        y: 220,
        width: 260,
        height: 130,
        title: 'Evidence Block',
        text: 'Source evidence snippet',
      },
      {
        id: 'task',
        type: 'task',
        x: 10,
        y: 220,
        width: 220,
        height: 130,
        text: 'Read methods',
      },
      {
        id: 'missing',
        type: 'note',
        ref: 'notes/missing.md',
        x: 620,
        y: 20,
        width: 220,
        height: 130,
      },
    ],
    edges: [
      { id: 'edge_1', from: 'block', to: 'note', kind: 'supports' },
    ],
  }
}

describe('ProjectCanvasSurface', () => {
  beforeEach(() => {
    vi.mocked(projectCanvas.readProjectCanvas).mockReset()
    vi.mocked(projectCanvas.createProjectCanvas).mockReset()
    vi.mocked(projectCanvas.saveProjectCanvas).mockReset()
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockReset()
  })

  it('automatically creates a missing canvas through the command boundary', async () => {
    const created = defaultProjectCanvas('projects/alpha/project.md')
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue({
      projectPath: 'projects/alpha/project.md',
      canvasPath: 'projects/alpha/project.canvas.json',
      state: 'missing',
      canvas: null,
    })
    vi.mocked(projectCanvas.createProjectCanvas).mockResolvedValue(readyResult(created))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(created))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await waitFor(() => expect(projectCanvas.createProjectCanvas).toHaveBeenCalledWith('/vault', '/vault/projects/alpha/project.md'))
    expect(await screen.findByTestId('project-canvas-surface')).toBeInTheDocument()
    expect(screen.queryByText('No Project Canvas yet')).not.toBeInTheDocument()
  })

  it('migrates a readable legacy canvas before rendering it', async () => {
    const legacyCanvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(legacyCanvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockImplementation(async (_vaultPath, _projectPath, canvas) => resolveResult(canvas))

    const view = render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await waitFor(() => expect(view.container.querySelector('[data-node-id="project_overview"]')).not.toBeNull())
  })

  it('changes the active Canvas tool from the mouse toolbar', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const handTool = await screen.findByRole('button', { name: 'Hand tool' })
    fireEvent.click(handTool)

    await waitFor(() => expect(handTool).toHaveAttribute('aria-pressed', 'true'))
  })

  it('renders NodeSpec-driven contextual actions and dispatches them through the controller', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const noteCard = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    expect(noteCard).not.toBeNull()
    fireEvent.click(within(noteCard as HTMLElement).getByRole('button', { name: 'Source' }))

    expect(await screen.findByTestId('project-canvas-contextual-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('project-canvas-toolbar-action-open')).toBeInTheDocument()
    expect(screen.getByTestId('project-canvas-toolbar-action-connect')).toBeInTheDocument()
    expect(screen.getByTestId('project-canvas-toolbar-action-resize')).toBeInTheDocument()
    expect(screen.getByTestId('project-canvas-toolbar-action-delete')).toBeInTheDocument()

    fireEvent.click(screen.getByTestId('project-canvas-toolbar-action-connect'))
    await waitFor(() => expect(screen.getByTestId('project-canvas-tool-connect')).toHaveAttribute('aria-pressed', 'true'))
  })

  it('enters and exits a group through NodeSpec actions, double click, and Escape', async () => {
    const canvas: ProjectCanvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        { id: 'group', type: 'group', x: 20, y: 20, width: 420, height: 260, title: 'Methods frame' },
        { id: 'child', type: 'text', parentId: 'group', x: 70, y: 80, width: 180, height: 100, text: 'Inside' },
      ],
      edges: [],
    }
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const groupCard = (await screen.findByText('Methods frame')).closest('[data-testid="project-canvas-node"]')
    fireEvent.click(within(groupCard as HTMLElement).getByRole('button', { name: 'Source' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Enter group' }))
    expect(screen.getByTestId('project-canvas-group-focus')).toHaveTextContent('Methods frame')

    fireEvent.click(screen.getByRole('button', { name: 'Exit group' }))
    expect(screen.queryByTestId('project-canvas-group-focus')).not.toBeInTheDocument()

    fireEvent.doubleClick(groupCard as HTMLElement)
    expect(screen.getByTestId('project-canvas-group-focus')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByTestId('project-canvas-viewport'), { key: 'Escape' })
    expect(screen.queryByTestId('project-canvas-group-focus')).not.toBeInTheDocument()
  })

  it('keeps the Project Overview root node non-deletable', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    const view = render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[entry({})]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await waitFor(() => expect(view.container.querySelector('[data-node-id="project_overview"]')).not.toBeNull())
    const overview = view.container.querySelector('[data-node-id="project_overview"]')
    fireEvent.click(within(overview as HTMLElement).getByRole('button', { name: 'Source' }))

    expect(screen.queryByRole('button', { name: 'Delete node' })).not.toBeInTheDocument()
  })

  it('selects document nodes in place and keeps standalone open explicit', async () => {
    const canvas = sampleCanvas()
    const onNavigateWikilink = vi.fn()
    const onSave = vi.fn()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[
          entry({
            path: '/vault/notes/source.md',
            filename: 'source.md',
            title: 'Source Note',
            isA: 'Note',
            snippet: 'A bounded source note preview.',
          }),
          entry({
            path: '/vault/papers/example/paper.md',
            filename: 'paper.md',
            title: 'Example Paper',
            isA: 'Paper',
            properties: { authors: ['Ada Lovelace'], year: 1843, metadata_status: 'ready' },
          }),
        ]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={onNavigateWikilink}
        onSave={onSave}
      />,
    )

    expect(await screen.findByText('Source Note')).toBeInTheDocument()
    expect(screen.getByText('Example Paper')).toBeInTheDocument()
    expect(screen.getByText('Source evidence snippet')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()

    const sourceNode = document.querySelector('[data-node-id="note"]') as HTMLElement
    fireEvent.click(within(sourceNode).getByText('Source Note'))
    await waitFor(() => expect(screen.getByDisplayValue('Source Note')).toBeInTheDocument())

    expect(onNavigateWikilink).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Source Note')).toBeInTheDocument()

    fireEvent.doubleClick(within(sourceNode).getByText('Source Note'))

    expect(await screen.findByTestId('canvas-editor-portal')).toHaveTextContent('/vault/notes/source.md')
    expect(onNavigateWikilink).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await waitFor(() => expect(onNavigateWikilink).toHaveBeenCalledWith('notes/source.md'))

    expect(onNavigateWikilink).toHaveBeenCalledWith('notes/source.md')

    const paperNode = document.querySelector('[data-node-id="paper"]') as HTMLElement
    fireEvent.doubleClick(within(paperNode).getByText('Example Paper'))

    await waitFor(() => expect(screen.getAllByTestId('canvas-editor-portal')).toHaveLength(1))
    expect(screen.getByTestId('canvas-editor-portal')).toHaveTextContent('/vault/papers/example/paper.md')
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('keeps document nodes in lightweight overview state at low zoom', async () => {
    const canvas = { ...sampleCanvas(), viewport: { x: 0, y: 0, zoom: 0.4 } }
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[entry({
          path: '/vault/notes/source.md',
          filename: 'source.md',
          title: 'Source Note',
          isA: 'Note',
          snippet: 'A bounded source note preview.',
        })]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await waitFor(() => expect(document.querySelector('[data-node-id="note"]')).not.toBeNull())
    const sourceNode = document.querySelector('[data-node-id="note"]') as HTMLElement
    fireEvent.click(within(sourceNode).getByText('Source Note'))

    expect(sourceNode).toHaveAttribute('data-presentation', 'overview')
    expect(within(sourceNode).queryByTestId('project-document-preview')).not.toBeInTheDocument()
    expect(within(sourceNode).queryByText('A bounded source note preview.')).not.toBeInTheDocument()
  })

  it('focuses a Canvas node from the derived Project navigator', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    fireEvent.click(screen.getByTestId('project-canvas-navigator-node-task'))

    expect(screen.getByTestId('project-canvas-navigator-node-task')).toHaveAttribute('aria-current', 'true')
    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()
  })

  it('moves the single editor into Focus Mode and restores it to the node', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[entry({
          path: '/vault/notes/source.md',
          filename: 'source.md',
          title: 'Source Note',
          isA: 'Note',
        })]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceNode = (await screen.findByText('Source Note')).closest('[data-node-id="note"]') as HTMLElement
    fireEvent.doubleClick(within(sourceNode).getByText('Source Note'))
    expect(await screen.findByTestId('canvas-editor-portal')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('project-canvas-viewport'), { key: 'Enter', metaKey: true })

    expect(screen.getByTestId('project-canvas-focus-mode')).toBeInTheDocument()
    expect(screen.getAllByTestId('canvas-editor-portal')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Exit focus mode' }))

    expect(screen.queryByTestId('project-canvas-focus-mode')).not.toBeInTheDocument()
    expect(screen.getAllByTestId('canvas-editor-portal')).toHaveLength(1)
  })

  it('edits the selected document node when Enter is pressed on the Canvas', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[entry({
          path: '/vault/notes/source.md',
          filename: 'source.md',
          title: 'Source Note',
          isA: 'Note',
        })]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceNode = (await screen.findByText('Source Note')).closest('[data-node-id="note"]') as HTMLElement
    fireEvent.click(within(sourceNode).getByRole('button', { name: 'Source' }))
    fireEvent.keyDown(screen.getByTestId('project-canvas-viewport'), { key: 'Enter' })

    expect(await screen.findByTestId('canvas-editor-portal')).toBeInTheDocument()
    expect(screen.getAllByTestId('canvas-editor-portal')).toHaveLength(1)
  })

  it('keeps wikilink navigation inside the Canvas when the target node already exists', async () => {
    const canvas = {
      ...sampleCanvas(),
      nodes: [
        ...sampleCanvas().nodes,
        {
          id: 'linked',
          type: 'note' as const,
          ref: 'notes/linked.md',
          x: 620,
          y: 220,
          width: 220,
          height: 130,
          title: 'Linked Note',
        },
      ],
    }
    const onNavigateWikilink = vi.fn()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[
          entry({ path: '/vault/notes/source.md', filename: 'source.md', title: 'Source Note', isA: 'Note' }),
          entry({ path: '/vault/notes/linked.md', filename: 'linked.md', title: 'Linked Note', isA: 'Note' }),
        ]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={onNavigateWikilink}
      />,
    )

    const sourceNode = (await screen.findByText('Source Note')).closest('[data-node-id="note"]') as HTMLElement
    fireEvent.doubleClick(within(sourceNode).getByText('Source Note'))
    fireEvent.click(await screen.findByRole('button', { name: 'Follow linked note' }))
    await waitFor(() => expect(screen.getByTestId('canvas-editor-portal')).toHaveTextContent('/vault/notes/linked.md'))

    expect(screen.getByTestId('canvas-editor-portal')).toHaveTextContent('/vault/notes/linked.md')
    expect(onNavigateWikilink).not.toHaveBeenCalled()
  })

  it('opens an unplaced wikilink as a temporary Peek and persists it only when pinned', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[
          entry({ path: '/vault/notes/source.md', filename: 'source.md', title: 'Source Note', isA: 'Note' }),
          entry({ path: '/vault/notes/linked.md', filename: 'linked.md', title: 'Linked Note', isA: 'Note' }),
        ]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceNode = (await screen.findByText('Source Note')).closest('[data-node-id="note"]') as HTMLElement
    fireEvent.doubleClick(within(sourceNode).getByText('Source Note'))
    vi.mocked(projectCanvas.saveProjectCanvas).mockClear()
    fireEvent.click(await screen.findByRole('button', { name: 'Follow linked note' }))

    expect(await screen.findByTestId('project-canvas-peek-node')).toBeInTheDocument()
    expect(screen.getByTestId('canvas-editor-portal')).toHaveTextContent('/vault/notes/linked.md')
    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pin to Project' }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const saved = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(saved?.nodes.some(node => node.ref === 'notes/linked.md')).toBe(true)
    expect(screen.queryByTestId('project-canvas-peek-node')).not.toBeInTheDocument()
  })

  it('opens an externally requested Paper target inside the Canvas as a Peek', async () => {
    const canvas = sampleCanvas()
    const paper = entry({
      path: '/vault/papers/attention/paper.md',
      filename: 'paper.md',
      title: 'Attention Is All You Need',
      isA: 'Paper',
      properties: { paper_id: 'attention' },
    })
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[paper]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    act(() => {
      requestProjectCanvasNavigate({
        projectPath: '/vault/projects/alpha/project.md',
        target: paper.path,
      })
    })

    expect(await screen.findByText('Attention Is All You Need')).toBeInTheDocument()
    expect(screen.getByText('Peek')).toBeInTheDocument()
    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()
  })

  it('keeps an AI draft temporary until the user saves it as a Note', async () => {
    const canvas = sampleCanvas()
    const createdNote = entry({
      path: '/vault/notes/ai-research-answer.md',
      filename: 'ai-research-answer.md',
      title: 'AI research answer',
      isA: 'Note',
    })
    const onCreateProjectDraftNote = vi.fn(async () => createdNote)
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onCreateProjectDraftNote={onCreateProjectDraftNote}
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    act(() => {
      requestProjectCanvasDraft({
        projectPath: '/vault/projects/alpha/project.md',
        title: 'AI research answer',
        content: 'Draft with @block[attention#b0023]',
      })
    })

    expect(await screen.findByTestId('project-canvas-ai-draft-node')).toBeInTheDocument()
    expect(screen.getByText('Draft with')).toBeInTheDocument()
    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save as Note' }))

    await waitFor(() => expect(onCreateProjectDraftNote).toHaveBeenCalledWith({
      content: 'Draft with @block[attention#b0023]',
      title: 'AI research answer',
      vaultPath: '/vault',
    }))
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes).toContainEqual(expect.objectContaining({
      type: 'note',
      ref: 'notes/ai-research-answer.md',
      text: undefined,
    }))
    expect(screen.queryByTestId('project-canvas-ai-draft-node')).not.toBeInTheDocument()
  })

  it('discards an AI draft without creating a Note or changing Canvas membership', async () => {
    const canvas = sampleCanvas()
    const onCreateProjectDraftNote = vi.fn()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onCreateProjectDraftNote={onCreateProjectDraftNote}
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    act(() => {
      requestProjectCanvasDraft({
        projectPath: '/vault/projects/alpha/project.md',
        title: 'AI research answer',
        content: 'Unreviewed draft',
      })
    })
    expect(await screen.findByTestId('project-canvas-ai-draft-node')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Discard draft' }))

    expect(screen.queryByTestId('project-canvas-ai-draft-node')).not.toBeInTheDocument()
    expect(onCreateProjectDraftNote).not.toHaveBeenCalled()
    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()
  })

  it('persists node geometry after drag', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const node = await screen.findByText('Source Note')
    const card = node.closest('[data-testid="project-canvas-node"]')
    expect(card).not.toBeNull()

    fireEvent.pointerDown(card!, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 140 })
    fireEvent.pointerUp(window)

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    const savedNode = savedCanvas?.nodes.find(item => item.id === 'note')
    expect(savedNode?.x).toBe(60)
    expect(savedNode?.y).toBe(60)
  })

  it('pans the Canvas instead of moving a node while Space is held', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const viewport = await screen.findByTestId('project-canvas-viewport')
    const card = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    expect(card).not.toBeNull()

    fireEvent.keyDown(viewport, { key: ' ' })
    fireEvent.pointerDown(card!, { button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 150, clientY: 140 })
    fireEvent.pointerUp(window)
    fireEvent.keyUp(viewport, { key: ' ' })

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.viewport).toMatchObject({ x: 70, y: 70 })
    expect(savedCanvas?.nodes.find(node => node.id === 'note')).toMatchObject({ x: 10, y: 20 })
  })

  it('opens Add from Cmd+K and exits editing before clearing selection with Escape', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[entry({
          path: '/vault/notes/source.md',
          filename: 'source.md',
          title: 'Source Note',
          isA: 'Note',
        })]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const viewport = await screen.findByTestId('project-canvas-viewport')
    fireEvent.keyDown(viewport, { key: 'k', metaKey: true })
    expect(screen.getByPlaceholderText('Search Notes and Papers...')).toBeInTheDocument()

    fireEvent.keyDown(viewport, { key: 'Escape' })
    const sourceNode = (await screen.findByText('Source Note')).closest('[data-node-id="note"]') as HTMLElement
    fireEvent.doubleClick(within(sourceNode).getByText('Source Note'))
    await waitFor(() => expect(screen.getAllByTestId('canvas-editor-portal')).toHaveLength(1))

    fireEvent.keyDown(viewport, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('canvas-editor-portal')).not.toBeInTheDocument())
    expect(document.querySelector('[data-node-id="note"]')).toHaveClass('project-canvas-node--selected')

    fireEvent.keyDown(viewport, { key: 'Escape' })
    await waitFor(() => expect(document.querySelector('[data-node-id="note"]')).not.toHaveClass('project-canvas-node--selected'))
  })

  it('adds an existing note to the canvas and links it from the selected source node', async () => {
    const canvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        {
          id: 'source',
          type: 'note' as const,
          ref: 'notes/source.md',
          x: 10,
          y: 20,
          width: 220,
          height: 130,
          title: 'Source Note',
        },
      ],
      edges: [],
    }
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[
          entry({
            path: '/vault/notes/source.md',
            filename: 'source.md',
            title: 'Source Note',
            isA: 'Note',
          }),
          entry({
            path: '/vault/notes/linked.md',
            filename: 'linked.md',
            title: 'Linked Note',
            isA: 'Note',
            snippet: 'A related note.',
          }),
        ]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceCard = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    expect(sourceCard).not.toBeNull()
    fireEvent.click(within(sourceCard as HTMLElement).getByRole('button', { name: 'Source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: /Linked Note/u }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    const linkedNode = savedCanvas?.nodes.find(node => node.ref === 'notes/linked.md')
    expect(savedCanvas?.nodes).toHaveLength(3)
    expect(linkedNode).toMatchObject({
      ref: 'notes/linked.md',
      title: 'Linked Note',
      type: 'note',
    })
    expect(savedCanvas?.edges).toEqual([
      expect.objectContaining({ from: 'source', kind: 'related', to: linkedNode?.id }),
    ])
  })

  it('focuses an existing node instead of duplicating the same ref', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[
          entry({
            path: '/vault/notes/source.md',
            filename: 'source.md',
            title: 'Source Note',
            isA: 'Note',
          }),
        ]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    const sourceCandidates = screen.getAllByRole('button', { name: /Source Note/u })
    fireEvent.click(sourceCandidates[sourceCandidates.length - 1])

    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Selected' })).toBeInTheDocument()
  })

  it('adds a text card and creates a relationship from the selected source node', async () => {
    const canvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        {
          id: 'source',
          type: 'note' as const,
          ref: 'notes/source.md',
          x: 10,
          y: 20,
          width: 220,
          height: 130,
          title: 'Source Note',
        },
      ],
      edges: [],
    }
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceCard = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    expect(sourceCard).not.toBeNull()
    fireEvent.click(within(sourceCard as HTMLElement).getByRole('button', { name: 'Source' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Text' }))
    fireEvent.change(screen.getByPlaceholderText('Write a short project note...'), {
      target: { value: 'Draft claim from the source note' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.at(-1)).toMatchObject({
      text: 'Draft claim from the source note',
      type: 'text',
    })
    expect(savedCanvas?.edges).toEqual([
      expect.objectContaining({ from: 'source', kind: 'related', to: savedCanvas?.nodes.at(-1)?.id }),
    ])
  })

  it('adds image and block citation nodes from the add panel', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByTestId('project-canvas-surface')
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('button', { name: 'Image' }))
    fireEvent.change(screen.getByPlaceholderText('Paste an image path or URL...'), {
      target: { value: 'attachments/figure-1.png' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    let savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.ref === 'attachments/figure-1.png')).toMatchObject({
      ref: 'attachments/figure-1.png',
      title: 'figure-1.png',
      type: 'image',
    })

    fireEvent.click(screen.getByRole('button', { name: 'Block' }))
    fireEvent.change(screen.getByPlaceholderText('Paste @block[paper#block]...'), {
      target: { value: '@block[kan#b0001]' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add Card' }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(2))
    savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.ref === '@block[kan#b0001]')).toMatchObject({
      ref: '@block[kan#b0001]',
      type: 'paper_block',
    })
  })

  it('toggles task completion from the node card', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const taskCard = (await screen.findByText('Read methods')).closest('[data-testid="project-canvas-node"]')
    expect(taskCard).not.toBeNull()
    fireEvent.click(within(taskCard as HTMLElement).getByRole('checkbox'))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.id === 'task')?.completed).toBe(true)
  })

  it('drops block citations onto the canvas', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const viewport = await screen.findByTestId('project-canvas-viewport')
    fireEvent.drop(viewport, {
      clientX: 220,
      clientY: 180,
      dataTransfer: {
        files: [],
        getData: (type: string) => type === 'text/plain' ? '@block[kan#b0002]' : '',
        types: ['text/plain'],
      },
    })

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.ref === '@block[kan#b0002]')).toMatchObject({
      ref: '@block[kan#b0002]',
      type: 'paper_block',
    })
  })

  it('drops NoteList Paper payloads onto the canvas as Paper nodes', async () => {
    const canvas = defaultProjectCanvas('projects/alpha/project.md')
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const viewport = await screen.findByTestId('project-canvas-viewport')
    fireEvent.drop(viewport, {
      clientX: 240,
      clientY: 210,
      dataTransfer: {
        files: [],
        getData: (type: string) => type === PROJECT_CANVAS_DRAG_MIME
          ? JSON.stringify({
            nodeType: 'paper',
            ref: '/vault/papers/example/paper.md',
            title: 'Example Paper',
            text: 'A compact paper row.',
          })
          : '',
        types: [PROJECT_CANVAS_DRAG_MIME],
      },
    })

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.ref === 'papers/example/paper.md')).toMatchObject({
      ref: 'papers/example/paper.md',
      text: 'A compact paper row.',
      title: 'Example Paper',
      type: 'paper',
    })
  })

  it('copies, pastes, and undoes selected nodes from the keyboard', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceCard = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    expect(sourceCard).not.toBeNull()
    fireEvent.click(within(sourceCard as HTMLElement).getByRole('button', { name: 'Source' }))
    const viewport = screen.getByTestId('project-canvas-viewport')
    fireEvent.keyDown(viewport, { key: 'c', metaKey: true })
    fireEvent.keyDown(viewport, { key: 'v', metaKey: true })

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    let savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    const normalizedNodeCount = projectCanvas.normalizeProjectCanvas(canvas, canvas.project).nodes.length
    expect(savedCanvas?.nodes).toHaveLength(normalizedNodeCount + 1)

    fireEvent.keyDown(viewport, { key: 'z', metaKey: true })
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(2))
    savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes).toHaveLength(normalizedNodeCount)
  })

  it('multi-selects nodes for group copy and delete', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceCard = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    const paperCard = screen.getByText('Example Paper').closest('[data-testid="project-canvas-node"]')
    expect(sourceCard).not.toBeNull()
    expect(paperCard).not.toBeNull()
    fireEvent.click(within(sourceCard as HTMLElement).getByRole('button', { name: 'Source' }))
    fireEvent.click(within(paperCard as HTMLElement).getByRole('button', { name: 'Source' }), { metaKey: true })

    const viewport = screen.getByTestId('project-canvas-viewport')
    fireEvent.keyDown(viewport, { key: 'c', metaKey: true })
    fireEvent.keyDown(viewport, { key: 'v', metaKey: true })

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    let savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    const normalizedNodeCount = projectCanvas.normalizeProjectCanvas(canvas, canvas.project).nodes.length
    expect(savedCanvas?.nodes).toHaveLength(normalizedNodeCount + 2)

    fireEvent.keyDown(viewport, { key: 'Delete' })
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(2))
    savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes).toHaveLength(normalizedNodeCount)
  })

  it('aligns and reorders a multi-selection through the production toolbar', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))
    vi.mocked(trackProjectCanvasObjectsArranged).mockClear()

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceCard = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    const blockCard = screen.getByText('Evidence Block').closest('[data-testid="project-canvas-node"]')
    fireEvent.click(within(sourceCard as HTMLElement).getByRole('button', { name: 'Source' }))
    fireEvent.click(within(blockCard as HTMLElement).getByRole('button', { name: 'Source' }), { shiftKey: true })

    fireEvent.click(screen.getByTestId('project-canvas-arrange-trigger'))
    fireEvent.click(await screen.findByRole('button', { name: 'Align top' }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(1))
    let savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.id === 'note')?.y).toBe(20)
    expect(savedCanvas?.nodes.find(node => node.id === 'block')?.y).toBe(20)

    fireEvent.click(screen.getByRole('button', { name: 'Bring to front' }))
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(2))
    savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.id === 'block')?.zIndex).toBe(1)
    expect(savedCanvas?.nodes.find(node => node.id === 'note')?.zIndex).toBe(2)
    expect(trackProjectCanvasObjectsArranged).toHaveBeenNthCalledWith(1, { action: 'top', kind: 'align' })
    expect(trackProjectCanvasObjectsArranged).toHaveBeenNthCalledWith(2, { action: 'front', kind: 'stack' })
  })

  it('creates an edge by dragging a node connect handle onto another node', async () => {
    const canvas = {
      ...defaultProjectCanvas('projects/alpha/project.md'),
      nodes: [
        {
          id: 'source',
          type: 'note' as const,
          ref: 'notes/source.md',
          x: 10,
          y: 20,
          width: 220,
          height: 130,
          title: 'Source Note',
        },
        {
          id: 'target',
          type: 'note' as const,
          ref: 'notes/target.md',
          x: 360,
          y: 20,
          width: 220,
          height: 130,
          title: 'Target Note',
        },
      ],
      edges: [],
    }
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    fireEvent.click(screen.getByText('Source Note'))
    const targetCard = screen.getByText('Target Note').closest('[data-testid="project-canvas-node"]')
    expect(targetCard).not.toBeNull()
    const originalElementFromPoint = document.elementFromPoint
    const elementFromPoint = vi.fn(() => targetCard as Element)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: elementFromPoint,
    })

    fireEvent.pointerDown(screen.getByRole('button', { name: 'Connect from Source Note' }), {
      button: 0,
      clientX: 100,
      clientY: 100,
    })
    fireEvent.pointerMove(window, { clientX: 420, clientY: 100 })
    fireEvent.pointerUp(window, { clientX: 420, clientY: 100 })

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.edges).toEqual([
      expect.objectContaining({ from: 'source', kind: 'related', to: 'target' }),
    ])

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    })
  })

  it('edits the selected node from the inspector', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    const sourceCard = (await screen.findByText('Source Note')).closest('[data-testid="project-canvas-node"]')
    expect(sourceCard).not.toBeNull()
    fireEvent.click(within(sourceCard as HTMLElement).getByRole('button', { name: 'Source' }))

    const titleInput = screen.getByLabelText('Title')
    fireEvent.change(titleInput, { target: { value: 'Renamed Source' } })
    fireEvent.blur(titleInput)

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes.find(node => node.id === 'note')?.title).toBe('Renamed Source')
  })

  it('selects and deletes an edge from the inspector', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    fireEvent.pointerDown(screen.getByTestId('project-canvas-edge'), { button: 0 })
    expect(screen.getByText('Edge')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Delete edge' }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.edges).toEqual([])
  })

  it('persists connector routing through the controller and records only the routing mode', async () => {
    const canvas = sampleCanvas()
    vi.mocked(trackProjectCanvasEdgeRoutingChanged).mockClear()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    fireEvent.pointerDown(screen.getByTestId('project-canvas-edge'), { button: 0 })
    fireEvent.click(screen.getAllByRole('combobox')[1])
    fireEvent.click(screen.getByRole('option', { name: 'Curved' }))

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(1))
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.edges[0]).toMatchObject({ id: 'edge_1', routing: 'curved' })
    expect(trackProjectCanvasEdgeRoutingChanged).toHaveBeenCalledWith({ routing: 'curved' })
  })

  it('reconnects a selected edge endpoint with a pointer gesture and cancels with Escape', async () => {
    const canvas = sampleCanvas()
    vi.mocked(trackProjectCanvasEdgeReconnected).mockClear()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    fireEvent.pointerDown(screen.getByTestId('project-canvas-edge'), { button: 0 })
    let endpointHandles = screen.getAllByTestId('project-canvas-reconnect-handle')
    expect(endpointHandles).toHaveLength(2)

    fireEvent.pointerDown(endpointHandles[1], { button: 0, clientX: 100, clientY: 100, pointerId: 3 })
    fireEvent.pointerMove(window, { clientX: 500, clientY: 300, pointerId: 3 })
    fireEvent.keyDown(screen.getByTestId('project-canvas-viewport'), { key: 'Escape' })
    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()
    expect(trackProjectCanvasEdgeReconnected).not.toHaveBeenCalled()

    endpointHandles = screen.getAllByTestId('project-canvas-reconnect-handle')
    fireEvent.pointerDown(endpointHandles[1], { button: 0, clientX: 100, clientY: 100, pointerId: 4 })
    fireEvent.pointerMove(window, { clientX: 450, clientY: 260, pointerId: 4 })
    fireEvent.pointerCancel(window, { pointerId: 4 })
    expect(projectCanvas.saveProjectCanvas).not.toHaveBeenCalled()

    const taskCard = screen.getByText('Read methods').closest('[data-testid="project-canvas-node"]')
    expect(taskCard).not.toBeNull()
    const originalElementFromPoint = document.elementFromPoint
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: vi.fn(() => taskCard as Element),
    })
    endpointHandles = screen.getAllByTestId('project-canvas-reconnect-handle')
    fireEvent.pointerDown(endpointHandles[1], { button: 0, clientX: 100, clientY: 100, pointerId: 5 })
    fireEvent.pointerMove(window, { clientX: 500, clientY: 300, pointerId: 5 })
    fireEvent.pointerUp(window, { clientX: 500, clientY: 300, pointerId: 5 })

    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(1))
    const savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.edges).toEqual([
      { id: 'edge_1', from: 'block', to: 'task', kind: 'supports' },
    ])
    expect(trackProjectCanvasEdgeReconnected).toHaveBeenCalledWith({ endpoint: 'to' })

    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: originalElementFromPoint,
    })
  })

  it('persists fit-to-view and auto layout actions', async () => {
    const canvas = sampleCanvas()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))
    vi.mocked(projectCanvas.saveProjectCanvas).mockImplementation(async (_vaultPath, _projectPath, nextCanvas) => readyResult(nextCanvas))

    render(
      <ProjectCanvasSurface
        entry={entry({})}
        entries={[]}
        vaultPath="/vault"
        locale="en"
        onNavigateWikilink={vi.fn()}
      />,
    )

    await screen.findByText('Source Note')
    fireEvent.click(screen.getByRole('button', { name: 'Fit' }))
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalled())
    const fitCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(fitCanvas?.viewport.zoom).not.toBe(1)

    fireEvent.click(screen.getByRole('button', { name: 'Auto layout' }))
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(2))
    const layoutCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(layoutCanvas?.nodes.find(node => node.id === 'paper')?.x).toBe(0)
    expect(layoutCanvas?.nodes.find(node => node.id === 'task')?.x).toBe(1020)
  })
})
