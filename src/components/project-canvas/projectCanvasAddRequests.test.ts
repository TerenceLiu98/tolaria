import { makeEntry } from '../../test-utils/noteListTestUtils'
import {
  projectCanvasRequestForAiResponse,
  projectCanvasRequestForBlockCitation,
  projectCanvasRequestForEntry,
} from './projectCanvasAddRequests'

describe('Project Canvas add requests', () => {
  it('maps Note and Paper entries to referenced nodes', () => {
    const note = makeEntry({ isA: 'Note', path: '/vault/notes/context.md', title: 'Context' })
    const paper = makeEntry({ isA: 'Paper', path: '/vault/papers/model/paper.md', title: 'Model Paper' })

    expect(projectCanvasRequestForEntry(note)).toMatchObject({
      source: 'note_list',
      node: { type: 'note', ref: note.path, title: 'Context' },
    })
    expect(projectCanvasRequestForEntry(paper)).toMatchObject({
      source: 'paper_catalog',
      node: { type: 'paper', ref: paper.path, title: 'Model Paper' },
    })
  })

  it('rejects entries that are not Note or Paper research objects', () => {
    expect(projectCanvasRequestForEntry(makeEntry({ isA: 'Project' }))).toBeNull()
  })

  it('preserves exact block provenance in citation requests', () => {
    expect(projectCanvasRequestForBlockCitation({
      paperId: 'attention',
      blockId: 'b0023',
      label: 'Core claim',
    })).toEqual({
      source: 'block_citation',
      label: 'Core claim',
      node: {
        type: 'paper_block',
        ref: '@block[attention#b0023 "Core claim"]',
        title: 'Core claim',
      },
    })
  })

  it('keeps cited AI answers compact without removing citations', () => {
    const response = `${'Evidence '.repeat(300)}@block[attention#b0023]`
    const request = projectCanvasRequestForAiResponse(response, 'AI research answer')

    expect(request.source).toBe('ai_answer')
    expect(request.node.type).toBe('text')
    expect(request.node.title).toBe('AI research answer')
    expect(request.node.text?.length).toBeLessThanOrEqual(1400)
    expect(request.node.text).toContain('@block[attention#b0023]')
  })
})
