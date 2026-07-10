import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as projectCanvas from '../../projectCanvas'
import {
  defaultProjectCanvas,
  type ProjectCanvas,
  type ProjectCanvasReadResult,
  type ProjectCanvasResolveResult,
} from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import { ProjectCanvasSurface } from './ProjectCanvasSurface'
import { PROJECT_CANVAS_DRAG_MIME } from './projectCanvasDragData'

vi.mock('../../lib/productAnalytics', () => ({
  trackProjectCanvasCreated: vi.fn(),
  trackProjectCanvasEdgeCreated: vi.fn(),
  trackProjectCanvasLayoutSaved: vi.fn(),
  trackProjectCanvasNodeAdded: vi.fn(),
  trackProjectCanvasOpened: vi.fn(),
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
  CanvasEditorPortal: ({ entry, target }: { entry: VaultEntry; target: HTMLElement | null }) => (
    target ? <div data-testid="canvas-editor-portal">{entry.path}</div> : null
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

    expect(onNavigateWikilink).not.toHaveBeenCalled()
    expect(screen.getByDisplayValue('Source Note')).toBeInTheDocument()

    fireEvent.doubleClick(within(sourceNode).getByText('Source Note'))

    expect(await screen.findByTestId('canvas-editor-portal')).toHaveTextContent('/vault/notes/source.md')
    expect(onNavigateWikilink).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))

    expect(onNavigateWikilink).toHaveBeenCalledWith('notes/source.md')

    const paperNode = document.querySelector('[data-node-id="paper"]') as HTMLElement
    fireEvent.doubleClick(within(paperNode).getByText('Example Paper'))

    expect(screen.getAllByTestId('canvas-editor-portal')).toHaveLength(1)
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
    expect(savedCanvas?.nodes).toHaveLength(2)
    expect(savedCanvas?.nodes.at(-1)).toMatchObject({
      ref: 'notes/linked.md',
      title: 'Linked Note',
      type: 'note',
    })
    expect(savedCanvas?.edges).toEqual([
      expect.objectContaining({ from: 'source', kind: 'related', to: savedCanvas?.nodes.at(-1)?.id }),
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
    expect(savedCanvas?.nodes.at(-1)).toMatchObject({
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
    expect(savedCanvas?.nodes.at(-1)).toMatchObject({
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
    expect(savedCanvas?.nodes.at(-1)).toMatchObject({
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
    expect(savedCanvas?.nodes.at(-1)).toMatchObject({
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
    expect(savedCanvas?.nodes).toHaveLength(canvas.nodes.length + 1)

    fireEvent.keyDown(viewport, { key: 'z', metaKey: true })
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(2))
    savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes).toHaveLength(canvas.nodes.length)
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
    expect(savedCanvas?.nodes).toHaveLength(canvas.nodes.length + 2)

    fireEvent.keyDown(viewport, { key: 'Delete' })
    await waitFor(() => expect(projectCanvas.saveProjectCanvas).toHaveBeenCalledTimes(2))
    savedCanvas = vi.mocked(projectCanvas.saveProjectCanvas).mock.calls.at(-1)?.[2]
    expect(savedCanvas?.nodes).toHaveLength(canvas.nodes.length)
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
