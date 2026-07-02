import { describe, expect, it } from 'vitest'
import {
  findSourceBlockById,
  parseSourceBlocksJsonl,
  sampleSourceBlocksJsonl,
  searchSourceBlocks,
  validateSourceBlock,
} from './sourceBlocks'

describe('SourceBlock helpers', () => {
  it('parses valid JSONL and preserves unknown fields', () => {
    const result = parseSourceBlocksJsonl(
      '{"id":"b1","paper_id":"paper-1","kind":"paragraph","page":1,"text":"Hello","hash":"sha256:1","model":"fixture"}\n',
    )

    expect(result.errors).toEqual([])
    expect(result.state).toBe('ready')
    expect(result.blocks[0]).toEqual(expect.objectContaining({
      id: 'b1',
      model: 'fixture',
    }))
  })

  it('returns structured errors for malformed JSON and missing required fields', () => {
    const malformed = parseSourceBlocksJsonl('{not json}\n')
    expect(malformed.errors[0]).toEqual(expect.objectContaining({
      line: 1,
      kind: 'malformed_json',
    }))

    const missing = validateSourceBlock({ id: 'b1', paper_id: 'paper-1', kind: 'paragraph', page: 1 })
    expect(missing.errors[0]).toEqual(expect.objectContaining({
      kind: 'missing_required_field',
      message: expect.stringContaining('hash') as string,
    }))
  })

  it('finds and searches blocks by text, caption, or section', () => {
    const parsed = parseSourceBlocksJsonl(sampleSourceBlocksJsonl('paper-1'))

    expect(findSourceBlockById(parsed.blocks, 'b0002')?.text).toContain('Transformer')
    expect(searchSourceBlocks(parsed.blocks, 'parallelization').map((block) => block.id)).toEqual(['b0002'])
    expect(searchSourceBlocks(parsed.blocks, 'introduction').map((block) => block.id)).toEqual(['b0002'])
    expect(searchSourceBlocks(parsed.blocks, '')).toEqual([])
  })

  it('reports empty JSONL as an empty sidecar state', () => {
    const result = parseSourceBlocksJsonl('\n\n')

    expect(result.state).toBe('empty')
    expect(result.blocks).toEqual([])
    expect(result.errors).toEqual([])
  })
})
