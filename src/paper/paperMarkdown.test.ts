import { describe, expect, it } from 'vitest'
import {
  paperMarkdownFromSourceBlocks,
  parsePaperMarkdownSections,
  stripPaperBlockAnchors,
  validatePaperMarkdownAnchors,
} from './paperMarkdown'
import type { SourceBlock } from './sourceBlocks'

const paperMarkdown = `---
type: Paper
paper_id: attention
---
<!-- tolaria:block id="b0001" page="1" kind="title" hash="sha256:title" -->
# Attention Is All You Need

<!-- tolaria:block id="b0002" page="2" kind="paragraph" hash="sha256:paragraph" -->
The Transformer allows for significantly more parallelization.
`

const blocks: SourceBlock[] = [
  {
    hash: 'sha256:title',
    id: 'b0001',
    kind: 'title',
    page: 1,
    paper_id: 'attention',
    text: 'Attention Is All You Need',
  },
  {
    hash: 'sha256:paragraph',
    id: 'b0002',
    kind: 'paragraph',
    page: 2,
    paper_id: 'attention',
    text: 'The Transformer allows for significantly more parallelization.',
  },
]

describe('paperMarkdown', () => {
  it('parses hidden block anchors and preserves section markdown', () => {
    const sections = parsePaperMarkdownSections(paperMarkdown)

    expect(sections).toHaveLength(2)
    expect(sections[0]).toEqual({
      anchor: {
        hash: 'sha256:title',
        id: 'b0001',
        kind: 'title',
        page: 1,
      },
      markdown: '# Attention Is All You Need',
    })
    expect(sections[1].markdown).toBe('The Transformer allows for significantly more parallelization.')
  })

  it('validates paper.md anchors against blocks.jsonl records', () => {
    const sections = parsePaperMarkdownSections(paperMarkdown)

    expect(validatePaperMarkdownAnchors(sections, blocks)).toEqual([])
    expect(validatePaperMarkdownAnchors(sections.slice(0, 1), blocks)).toEqual([{
      blockId: 'b0002',
      kind: 'block_missing_anchor',
      message: 'blocks.jsonl block b0002 does not have a paper.md anchor',
    }])
    expect(validatePaperMarkdownAnchors(sections, [{
      ...blocks[0],
      hash: 'sha256:changed',
    }])).toEqual([
      {
        blockId: 'b0001',
        kind: 'metadata_mismatch',
        message: 'paper.md anchor b0001 metadata does not match blocks.jsonl',
      },
      {
        blockId: 'b0002',
        kind: 'anchor_missing_block',
        message: 'paper.md anchor b0002 does not exist in blocks.jsonl',
      },
    ])
  })

  it('formats SourceBlocks into Markdown with durable anchors', () => {
    const markdown = paperMarkdownFromSourceBlocks(blocks)

    expect(markdown).toContain('<!-- tolaria:block id="b0001" page="1" kind="title" hash="sha256:title" -->')
    expect(markdown).toContain('# Attention Is All You Need')
    expect(markdown).toContain('<!-- tolaria:block id="b0002" page="2" kind="paragraph" hash="sha256:paragraph" -->')
    expect(parsePaperMarkdownSections(markdown)).toHaveLength(2)
  })

  it('formats equation SourceBlocks as display math without leaking internal math tokens', () => {
    const markdown = paperMarkdownFromSourceBlocks([{
      hash: 'sha256:equation',
      id: 'b0003',
      kind: 'equation',
      page: 3,
      paper_id: 'attention',
      text: '@@\nz = f _ {\\text { Encoder }} (x)\n@@TOLARIA_MATH_BLOCK:',
    }])

    expect(markdown).toContain('$$\nz = f_{\\text{Encoder}} (x)\n$$')
    expect(markdown).not.toContain('TOLARIA_MATH_BLOCK')
    expect(markdown).not.toContain('@@')
  })

  it('formats figure SourceBlocks with bundle image assets as Markdown images', () => {
    const markdown = paperMarkdownFromSourceBlocks([{
      asset_path: 'assets/figure-0001.png',
      caption: 'Figure 1. Model overview',
      hash: 'sha256:figure',
      id: 'b0004',
      kind: 'figure',
      page: 4,
      paper_id: 'attention',
    }])

    expect(markdown).toContain('![Figure 1. Model overview](assets/figure-0001.png)')
    expect(markdown).toContain('*Figure 1. Model overview*')
  })

  it('formats table SourceBlocks with bundle image assets as Markdown images', () => {
    const markdown = paperMarkdownFromSourceBlocks([{
      asset_path: 'assets/table-0001.jpg',
      caption: 'Table 1. Accuracy',
      hash: 'sha256:table',
      id: 'b0005',
      kind: 'table',
      page: 5,
      paper_id: 'attention',
      text: '| Method | Score |',
    }])

    expect(markdown).toContain('![Table 1. Accuracy](assets/table-0001.jpg)')
    expect(markdown).toContain('*Table 1. Accuracy*')
    expect(markdown).toContain('| Method | Score |')
  })

  it('normalizes tab-separated table SourceBlocks into durable Markdown tables', () => {
    const markdown = paperMarkdownFromSourceBlocks([{
      hash: 'sha256:table-tsv',
      id: 'b0008',
      kind: 'table',
      page: 8,
      paper_id: 'attention',
      text: 'Method\tScore\nKAN\t0.92',
    }])

    expect(markdown).toContain('| Method | Score |')
    expect(markdown).toContain('| --- | --- |')
    expect(markdown).toContain('| KAN | 0.92 |')
  })

  it('normalizes tab-separated table text before appending image fallback captions', () => {
    const markdown = paperMarkdownFromSourceBlocks([{
      asset_path: 'assets/table-0002.jpg',
      caption: 'Table 2. Scores',
      hash: 'sha256:table-image-tsv',
      id: 'b0009',
      kind: 'table',
      page: 9,
      paper_id: 'attention',
      text: 'Method\tScore\nMLP\t0.88',
    }])

    expect(markdown).toContain('![Table 2. Scores](assets/table-0002.jpg)')
    expect(markdown).toContain('*Table 2. Scores*')
    expect(markdown).toContain('| Method | Score |')
    expect(markdown).toContain('| MLP | 0.88 |')
  })

  it('formats image-only table SourceBlocks with a clean fallback alt label', () => {
    const markdown = paperMarkdownFromSourceBlocks([{
      asset_path: 'assets/table-only.jpg',
      hash: 'sha256:table-only',
      id: 'b0006',
      kind: 'table',
      page: 6,
      paper_id: 'attention',
    }])

    expect(markdown).toContain('![Table](assets/table-only.jpg)')
    expect(markdown).not.toContain('\n\ntable')
  })

  it('formats MinerU chart SourceBlocks with bundle image assets as Markdown images', () => {
    const markdown = paperMarkdownFromSourceBlocks([{
      asset_path: 'assets/chart-0001.jpg',
      hash: 'sha256:chart',
      id: 'b0007',
      kind: 'chart',
      page: 7,
      paper_id: 'attention',
    }])

    expect(markdown).toContain('![Figure](assets/chart-0001.jpg)')
    expect(markdown).not.toContain('\n\nchart')
  })

  it('strips hidden block anchors for the shared Note surface', () => {
    expect(stripPaperBlockAnchors(paperMarkdown)).toBe(`---
type: Paper
paper_id: attention
---
# Attention Is All You Need

The Transformer allows for significantly more parallelization.
`)
  })

  it('normalizes leaked math sentinels while projecting Paper Markdown into the Note surface', () => {
    const content = `---
type: Paper
---
<!-- tolaria:block id="b0003" page="3" kind="equation" hash="sha256:equation" -->
$$
@@
z = f _ {\\text { Encoder }} (x)
@@TOLARIA_MATH_BLOCK:
$$
`

    expect(stripPaperBlockAnchors(content)).toBe(`---
type: Paper
---
$$
z = f _ {\\text { Encoder }} (x)
$$
`)
  })

  it('wraps bare leaked math block sentinels as display math in the Note surface projection', () => {
    const content = `---
type: Paper
---
<!-- tolaria:block id="b0003" page="3" kind="equation" hash="sha256:equation" -->
@@
z = f _ {\\text { Encoder }} (x)
@@TOLARIA_MATH_BLOCK:
`

    expect(stripPaperBlockAnchors(content)).toBe(`---
type: Paper
---
$$
z = f _ {\\text { Encoder }} (x)
$$
`)
  })
})
