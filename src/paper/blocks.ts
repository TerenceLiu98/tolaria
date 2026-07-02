import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { PaperBlocksState, SourceBlock, SourceBlockLineError } from './sourceBlocks'

export type { PaperBlocksState, SourceBlock, SourceBlockLineError }
export {
  findSourceBlockById,
  parseSourceBlocksJsonl,
  sampleSourceBlocksJsonl,
  searchSourceBlocks,
  validateSourceBlock,
} from './sourceBlocks'

export interface PaperBlocksReadResult {
  paperId: string
  path: string
  state: PaperBlocksState
  blocks: SourceBlock[]
}

export interface PaperBlockLookupResult {
  paperId: string
  blockId: string
  path: string
  state: PaperBlocksState
  block: SourceBlock | null
}

export interface PaperBlockSearchResult {
  paperId: string
  query: string
  path: string
  state: PaperBlocksState
  blocks: SourceBlock[]
}

export interface PaperBlocksError {
  kind: string
  message: string
  paperId: string
  path: string
  lineErrors: SourceBlockLineError[]
}

function invokePaperCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

export function loadPaperBlocks(vaultPath: string, paperId: string): Promise<PaperBlocksReadResult> {
  return invokePaperCommand<PaperBlocksReadResult>('read_paper_blocks', { vaultPath, paperId })
}

export function loadPaperBlock(
  vaultPath: string,
  paperId: string,
  blockId: string,
): Promise<PaperBlockLookupResult> {
  return invokePaperCommand<PaperBlockLookupResult>('read_paper_block', { vaultPath, paperId, blockId })
}

export function searchPaperBlocks(
  vaultPath: string,
  paperId: string,
  query: string,
): Promise<PaperBlockSearchResult> {
  return invokePaperCommand<PaperBlockSearchResult>('search_paper_blocks', { vaultPath, paperId, query })
}
