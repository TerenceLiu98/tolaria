import { beforeEach, describe, expect, it } from 'vitest'
import { MOCK_CONTENT } from '../mock-tauri/mock-content'
import { mockHandlers } from '../mock-tauri/mock-handlers'
import { loadPaperBlocks } from './blocks'
import { parsePaper } from './parser'

const vaultPath = '/Users/mock/demo-vault-v2'
const paperId = 'attention'
const paperPath = `${vaultPath}/papers/${paperId}/paper.md`
const blocksPath = `${vaultPath}/papers/${paperId}/blocks.jsonl`

function paperMarkdown(parseStatus = 'unparsed'): string {
  return [
    '---',
    'type: Paper',
    `paper_id: ${paperId}`,
    'title: Attention Is All You Need',
    `parse_status: ${parseStatus}`,
    'source_pdf: source.pdf',
    'blocks: blocks.jsonl',
    'comments: comments.jsonl',
    '---',
    '# Attention Is All You Need',
  ].join('\n')
}

describe('paper parser command helper', () => {
  beforeEach(() => {
    Reflect.deleteProperty(MOCK_CONTENT, blocksPath)
    MOCK_CONTENT[paperPath] = paperMarkdown()
    mockHandlers.save_settings({
      settings: {
        ...mockHandlers.get_settings({}),
        paper_parser_mineru_token_ref: null,
        paper_parser_provider: 'none',
      },
    })
  })

  it('writes valid fixture blocks and updates paper parse metadata', async () => {
    mockHandlers.save_settings({
      settings: {
        ...mockHandlers.get_settings({}),
        paper_parser_provider: 'dev-fixture',
      },
    })

    const result = await parsePaper(vaultPath, paperId)

    expect(result).toMatchObject({
      paperId,
      parser: 'dev-fixture',
      blocksPath,
      blocks: expect.arrayContaining([
        expect.objectContaining({ id: 'b0001', parser: 'dev-fixture' }),
      ]) as unknown,
    })
    await expect(loadPaperBlocks(vaultPath, paperId)).resolves.toEqual(expect.objectContaining({
      state: 'ready',
      blocks: expect.arrayContaining([expect.objectContaining({ id: 'b0002' })]) as unknown,
    }))
    expect(MOCK_CONTENT[paperPath]).toContain('parse_status: parsed')
    expect(MOCK_CONTENT[paperPath]).toContain('parser_provider: dev-fixture')
    expect(MOCK_CONTENT[paperPath]).toContain('<!-- tolaria:block id="b0001" page="1" kind="title" hash="sha256:fixture-title" -->')
    expect(MOCK_CONTENT[paperPath]).toContain('# Attention Is All You Need')
    expect(MOCK_CONTENT[paperPath]).not.toContain('## Summary')
  })

  it('returns structured missing-provider and missing-config errors', async () => {
    await expect(parsePaper(vaultPath, paperId)).rejects.toMatchObject({
      kind: 'missing_provider',
      paperId,
    })

    mockHandlers.save_settings({
      settings: {
        ...mockHandlers.get_settings({}),
        paper_parser_provider: 'mineru',
        paper_parser_mineru_token_ref: null,
      },
    })

    await expect(parsePaper(vaultPath, paperId)).rejects.toMatchObject({
      kind: 'missing_config',
      provider: 'mineru',
    })
  })

  it('writes mock MinerU blocks when the provider has a token reference', async () => {
    mockHandlers.save_settings({
      settings: {
        ...mockHandlers.get_settings({}),
        paper_parser_provider: 'mineru',
        paper_parser_mineru_token_ref: 'MINERU_API_KEY',
      },
    })

    const result = await parsePaper(vaultPath, paperId)

    expect(result).toMatchObject({
      paperId,
      parser: 'mineru',
      parserVersion: 'mineru-api-v4',
      provider: 'mineru',
      blocks: expect.arrayContaining([
        expect.objectContaining({
          id: 'b0001',
          parser: 'mineru',
          source_asset: 'source.pdf',
        }),
      ]) as unknown,
    })
    expect(MOCK_CONTENT[paperPath]).toContain('parse_status: parsed')
    expect(MOCK_CONTENT[paperPath]).toContain('parser_provider: mineru')
    expect(MOCK_CONTENT[paperPath]).toContain('parser_version: mineru-api-v4')
    expect(MOCK_CONTENT[paperPath]).toContain('<!-- tolaria:block id="b0001" page="1" kind="title" hash="sha256:mineru-title" -->')
  })
})
