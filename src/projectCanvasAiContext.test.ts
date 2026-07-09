import { defaultProjectCanvas, type ProjectCanvas } from './projectCanvas'
import { buildProjectCanvasAiContext } from './projectCanvasAiContext'
import { makeEntry } from './test-utils/noteListTestUtils'

const project = makeEntry({
  isA: 'Project',
  path: '/vault/projects/agents.md',
  title: 'Agent Research',
  properties: { project_id: 'agent-research' },
})

function canvasFixture(): ProjectCanvas {
  return {
    ...defaultProjectCanvas(project.path),
    nodes: [
      { id: 'claim', type: 'text', title: 'Core claim', text: 'Agents need durable evidence.', x: 0, y: 0, width: 240, height: 110 },
      { id: 'paper', type: 'paper', ref: 'papers/attention/paper.md', x: 300, y: 0, width: 240, height: 110 },
      { id: 'evidence', type: 'paper_block', ref: '@block[attention#b0023]', x: 600, y: 0, width: 240, height: 110 },
      { id: 'note', type: 'note', ref: 'notes/agents.md', x: 300, y: 180, width: 240, height: 110 },
      { id: 'unrelated', type: 'note', ref: 'notes/unrelated.md', x: 900, y: 600, width: 240, height: 110 },
      { id: 'stale', type: 'note', ref: 'notes/missing.md', x: 0, y: 400, width: 240, height: 110 },
    ],
    edges: [
      { id: 'supports', from: 'evidence', to: 'claim', kind: 'supports' },
      { id: 'related-paper', from: 'claim', to: 'paper', kind: 'related' },
      { id: 'related-note', from: 'claim', to: 'note', kind: 'related' },
    ],
  }
}

describe('buildProjectCanvasAiContext', () => {
  it('assembles selected-first compact context with exact block provenance', async () => {
    const readBlock = vi.fn(async () => ({
      id: 'b0023',
      paper_id: 'attention',
      kind: 'paragraph',
      page: 4,
      hash: 'sha256:block',
      text: 'Exact evidence about agent grounding.',
    }))
    const context = await buildProjectCanvasAiContext({
      canvas: canvasFixture(),
      entries: [
        project,
        makeEntry({
          isA: 'Paper',
          path: '/vault/papers/attention/paper.md',
          title: 'Attention Paper',
          properties: { paper_id: 'attention', authors: ['Ada'], year: 2025, venue: 'ICLR' },
        }),
        makeEntry({ isA: 'Note', path: '/vault/notes/agents.md', title: 'Agent Notes', snippet: 'A compact linked note snippet.' }),
        makeEntry({ isA: 'Note', path: '/vault/notes/unrelated.md', title: 'Unrelated', snippet: 'Should not be embedded.' }),
      ],
      projectEntry: project,
      refs: [
        { nodeId: 'paper', nodeType: 'paper', ref: 'papers/attention/paper.md', state: 'resolved', targetPath: '/vault/papers/attention/paper.md' },
        { nodeId: 'evidence', nodeType: 'paper_block', ref: '@block[attention#b0023]', state: 'resolved', targetPath: '/vault/papers/attention/paper.md' },
        { nodeId: 'note', nodeType: 'note', ref: 'notes/agents.md', state: 'resolved', targetPath: '/vault/notes/agents.md' },
        { nodeId: 'unrelated', nodeType: 'note', ref: 'notes/unrelated.md', state: 'resolved', targetPath: '/vault/notes/unrelated.md' },
        { nodeId: 'stale', nodeType: 'note', ref: 'notes/missing.md', state: 'stale' },
      ],
      selectedNodeId: 'claim',
      vaultPath: '/vault',
      readBlock,
    })

    expect(context.project).toEqual({ id: 'agent-research', path: project.path, title: 'Agent Research' })
    expect(context.selectedNode?.id).toBe('claim')
    expect(context.nearbyNodes.map(node => node.id)).toEqual(['evidence', 'paper', 'note'])
    expect(context.relationships).toEqual([
      { id: 'supports', from: 'evidence', to: 'claim', kind: 'supports' },
      { id: 'related-paper', from: 'claim', to: 'paper', kind: 'related' },
      { id: 'related-note', from: 'claim', to: 'note', kind: 'related' },
    ])
    expect(context.summary).toEqual({
      citedBlockCount: 1,
      edgeCount: 3,
      nodeCount: 6,
      referencedPaperCount: 1,
      staleReferenceCount: 1,
    })
    expect(context.papers).toEqual([expect.objectContaining({ paperId: 'attention', title: 'Attention Paper', year: 2025 })])
    expect(context.citedBlocks).toEqual([{
      blockCitation: '@block[attention#b0023]',
      blockId: 'b0023',
      nodeId: 'evidence',
      page: 4,
      paperId: 'attention',
      paperTitle: 'Attention Paper',
      text: 'Exact evidence about agent grounding.',
    }])
    expect(context.notes).toEqual([{
      nodeId: 'note',
      path: '/vault/notes/agents.md',
      snippet: 'A compact linked note snippet.',
      title: 'Agent Notes',
    }])
    expect(readBlock).toHaveBeenCalledWith('/vault', 'attention', 'b0023')
  })

  it('degrades missing evidence without failing the whole Project context', async () => {
    const context = await buildProjectCanvasAiContext({
      canvas: canvasFixture(),
      entries: [project],
      projectEntry: project,
      refs: [],
      selectedNodeId: 'evidence',
      vaultPath: '/vault',
      readBlock: vi.fn(async () => null),
    })

    expect(context.selectedNode?.id).toBe('evidence')
    expect(context.citedBlocks).toEqual([])
    expect(context.summary.citedBlockCount).toBe(1)
  })
})
