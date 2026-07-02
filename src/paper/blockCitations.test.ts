import { describe, expect, it } from 'vitest'
import {
  blockCitationFromHref,
  blockCitationHref,
  createBlockCitationResolverFromBlocks,
  formatBlockCitation,
  malformedBlockCitationFromHref,
  malformedBlockCitationHref,
  parseBlockCitations,
  preprocessBlockCitations,
  validateBlockCitations,
  type BlockCitation,
  type MalformedBlockCitation,
} from './blockCitations'
import type { SourceBlock } from './sourceBlocks'

function validCitation(markdown: string): BlockCitation {
  const [citation] = parseBlockCitations(markdown)
  expect(citation?.malformed).toBe(false)
  return citation as BlockCitation
}

function malformedCitation(markdown: string): MalformedBlockCitation {
  const [citation] = parseBlockCitations(markdown)
  expect(citation?.malformed).toBe(true)
  return citation as MalformedBlockCitation
}

const sourceBlock = {
  id: 'b0023',
  paper_id: 'vaswani-2017-attention',
  kind: 'paragraph',
  page: 2,
  hash: 'sha256:block',
  text: 'The Transformer allows for significantly more parallelization.',
} satisfies SourceBlock

describe('block citation parser', () => {
  it('parses a valid block citation with raw range', () => {
    const citation = validCitation('See @block[vaswani-2017-attention#b0023].')

    expect(citation.paperId).toBe('vaswani-2017-attention')
    expect(citation.blockId).toBe('b0023')
    expect(citation.target).toEqual({
      paper_id: 'vaswani-2017-attention',
      block_id: 'b0023',
    })
    expect(citation.label).toBeNull()
    expect(citation.raw).toBe('@block[vaswani-2017-attention#b0023]')
    expect(citation.range).toEqual({ start: 4, end: 40 })
  })

  it('parses an optional display label', () => {
    const citation = validCitation('@block[vaswani-2017-attention#b0023 "Transformer parallelization claim"]')

    expect(citation.label).toBe('Transformer parallelization claim')
  })

  it('unescapes quoted labels', () => {
    const citation = validCitation('@block[p#b "A \\"quoted\\" label"]')

    expect(citation.label).toBe('A "quoted" label')
  })

  it('parses multiple and adjacent citations', () => {
    const citations = parseBlockCitations('@block[p#a]@block[p#b] and @block[p#c]')

    expect(citations).toHaveLength(3)
    expect(citations.map((citation) => citation.malformed ? null : citation.blockId)).toEqual(['a', 'b', 'c'])
  })

  it('supports unicode paper and block identifiers', () => {
    const citation = validCitation('@block[论文-一#块二 "注意力"]')

    expect(citation.paperId).toBe('论文-一')
    expect(citation.blockId).toBe('块二')
    expect(citation.label).toBe('注意力')
  })

  it('reports malformed closed citations without throwing', () => {
    expect(malformedCitation('@block[]').reason).toBe('empty_target')
    expect(malformedCitation('@block[paper-only]').reason).toBe('missing_separator')
    expect(malformedCitation('@block[paper#]').reason).toBe('empty_block_id')
    expect(malformedCitation('@block[#b1]').reason).toBe('empty_paper_id')
    expect(malformedCitation('@block[paper#b1 label]').reason).toBe('invalid_label')
  })

  it('reports an unclosed citation as a recoverable malformed token', () => {
    const citation = malformedCitation('Before @block[paper#b1')

    expect(citation.reason).toBe('missing_closing_bracket')
    expect(citation.raw).toBe('@block[paper#b1')
  })

  it('skips citations inside inline and fenced code', () => {
    const markdown = [
      'Use `@block[p#inline]` literally.',
      '',
      '```md',
      '@block[p#fenced]',
      '```',
      '',
      '@block[p#real]',
    ].join('\n')

    const citations = parseBlockCitations(markdown)

    expect(citations).toHaveLength(1)
    expect(citations[0].malformed ? null : citations[0].blockId).toBe('real')
  })

  it('formats canonical citation syntax', () => {
    expect(formatBlockCitation({ paperId: 'p', blockId: 'b' })).toBe('@block[p#b]')
    expect(formatBlockCitation({ paperId: 'p', blockId: 'b', label: 'A "quote"' }))
      .toBe('@block[p#b "A \\"quote\\""]')
  })
})

describe('block citation validation', () => {
  it('accepts citations with an existing paper and block', async () => {
    const result = await validateBlockCitations(
      '@block[vaswani-2017-attention#b0023]',
      createBlockCitationResolverFromBlocks(new Map([
        ['vaswani-2017-attention', [sourceBlock]],
      ])),
    )

    expect(result.citations).toHaveLength(1)
    expect(result.issues).toEqual([])
  })

  it('reports a missing paper', async () => {
    const result = await validateBlockCitations(
      '@block[missing-paper#b0023]',
      createBlockCitationResolverFromBlocks(new Map([
        ['vaswani-2017-attention', [sourceBlock]],
      ])),
    )

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].kind).toBe('missing_paper')
  })

  it('reports a missing block', async () => {
    const result = await validateBlockCitations(
      '@block[vaswani-2017-attention#b9999]',
      createBlockCitationResolverFromBlocks(new Map([
        ['vaswani-2017-attention', [sourceBlock]],
      ])),
    )

    expect(result.issues).toHaveLength(1)
    expect(result.issues[0].kind).toBe('missing_block')
  })

  it('reports malformed syntax alongside valid citations', async () => {
    const result = await validateBlockCitations(
      '@block[paper-only] @block[vaswani-2017-attention#b0023]',
      createBlockCitationResolverFromBlocks(new Map([
        ['vaswani-2017-attention', [sourceBlock]],
      ])),
    )

    expect(result.citations).toHaveLength(1)
    expect(result.malformed).toHaveLength(1)
    expect(result.issues.map((issue) => issue.kind)).toEqual(['malformed'])
  })
})

describe('block citation markdown rendering helpers', () => {
  it('preprocesses valid citations into durable renderer links', () => {
    const processed = preprocessBlockCitations('Claim @block[vaswani-2017-attention#b0023 "Transformer claim"].')

    expect(processed).toContain('[Transformer claim](block-citation://')
    expect(processed).not.toContain('@block[vaswani-2017-attention#b0023')
  })

  it('round-trips valid citation href payloads', () => {
    const citation = validCitation('@block[paper#block "Label"]')
    const parsed = blockCitationFromHref(blockCitationHref(citation))

    expect(parsed).toEqual({ paperId: 'paper', blockId: 'block', label: 'Label' })
  })

  it('round-trips malformed citation href payloads', () => {
    const citation = malformedCitation('@block[paper-only]')
    const parsed = malformedBlockCitationFromHref(malformedBlockCitationHref(citation))

    expect(parsed).toEqual({ raw: '@block[paper-only]', reason: 'missing_separator' })
  })
})
