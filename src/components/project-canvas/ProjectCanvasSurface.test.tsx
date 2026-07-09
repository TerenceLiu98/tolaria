import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

vi.mock('../../lib/productAnalytics', () => ({
  trackProjectCanvasCreated: vi.fn(),
  trackProjectCanvasLayoutSaved: vi.fn(),
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

  it('creates a missing canvas through the command boundary', async () => {
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

    expect(await screen.findByText('No Project Canvas yet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create Canvas' }))

    await waitFor(() => expect(projectCanvas.createProjectCanvas).toHaveBeenCalledWith('/vault', '/vault/projects/alpha/project.md'))
    expect(await screen.findByTestId('project-canvas-surface')).toBeInTheDocument()
  })

  it('renders compact nodes, stale state, and opens referenced nodes', async () => {
    const canvas = sampleCanvas()
    const onNavigateWikilink = vi.fn()
    vi.mocked(projectCanvas.readProjectCanvas).mockResolvedValue(readyResult(canvas))
    vi.mocked(projectCanvas.resolveProjectCanvasRefs).mockResolvedValue(resolveResult(canvas))

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
      />,
    )

    expect(await screen.findByText('Source Note')).toBeInTheDocument()
    expect(screen.getByText('Example Paper')).toBeInTheDocument()
    expect(screen.getByText('Source evidence snippet')).toBeInTheDocument()
    expect(screen.getByText('Stale')).toBeInTheDocument()

    fireEvent.click(screen.getByText('Source Note'))

    expect(onNavigateWikilink).toHaveBeenCalledWith('notes/source.md')
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
})
