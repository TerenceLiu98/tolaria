import { createTranslator } from './lib/i18n'
import type { ProjectCanvasAiContext } from './projectCanvasAiContext'
import { projectCanvasAiActionPrompt } from './projectCanvasAiActions'

const context: ProjectCanvasAiContext = {
  project: { id: 'agent-research', path: 'projects/agents.md', title: 'Agent Research' },
  summary: {
    citedBlockCount: 2,
    edgeCount: 3,
    nodeCount: 5,
    referencedPaperCount: 2,
    staleReferenceCount: 0,
  },
  selectedNode: { id: 'claim', type: 'text', title: 'Evaluation claim' },
  nearbyNodes: [],
  relationships: [],
  papers: [],
  citedBlocks: [],
  notes: [],
}

describe('projectCanvasAiActionPrompt', () => {
  const t = createTranslator('en')

  it.each([
    ['summarize', 'Summarize Project', 'read_project_context'],
    ['recommend_paper', 'Recommend Next Paper', 'search_papers'],
    ['cited_outline', 'Generate Cited Outline', '@block'],
  ] as const)('builds the %s evidence-oriented action prompt', (action, label, expectedGuidance) => {
    const prompt = projectCanvasAiActionPrompt(action, context, t)

    expect(prompt).toContain(label)
    expect(prompt).toContain('Agent Research')
    expect(prompt).toContain('agent-research')
    expect(prompt).toContain('Evaluation claim')
    expect(prompt).toContain(expectedGuidance)
  })
})
