import { describe, expect, it } from 'vitest'
import { mockHandlers } from '../mock-tauri/mock-handlers'
import { loadPaperBlock, loadPaperBlocks, searchPaperBlocks } from './blocks'
import { sampleSourceBlocksJsonl } from './sourceBlocks'

const vaultPath = '/Users/mock/demo-vault-v2'
const paperId = 'attention'
const blocksPath = `${vaultPath}/papers/${paperId}/blocks.jsonl`

describe('Paper block command helpers', () => {
  it('loads, looks up, and searches blocks through mock Tauri commands', async () => {
    mockHandlers.save_note_content({
      path: blocksPath,
      content: sampleSourceBlocksJsonl(paperId),
    })

    await expect(loadPaperBlocks(vaultPath, paperId)).resolves.toEqual(expect.objectContaining({
      paperId,
      state: 'ready',
      blocks: expect.arrayContaining([expect.objectContaining({ id: 'b0001' })]) as unknown,
    }))

    await expect(loadPaperBlock(vaultPath, paperId, 'b0002')).resolves.toEqual(expect.objectContaining({
      block: expect.objectContaining({ id: 'b0002' }) as unknown,
    }))

    await expect(searchPaperBlocks(vaultPath, paperId, 'transformer')).resolves.toEqual(expect.objectContaining({
      blocks: [expect.objectContaining({ id: 'b0002' })],
    }))
  })

  it('reports missing sidecars and rejects malformed sidecars', async () => {
    await expect(loadPaperBlocks(vaultPath, 'missing-paper')).resolves.toEqual(expect.objectContaining({
      state: 'missing',
      blocks: [],
    }))

    mockHandlers.save_note_content({
      path: blocksPath,
      content: '{not json}\n',
    })

    await expect(loadPaperBlocks(vaultPath, paperId)).rejects.toEqual(expect.objectContaining({
      kind: 'invalid_jsonl',
      lineErrors: [expect.objectContaining({ line: 1, kind: 'malformed_json' })],
    }))
  })
})
