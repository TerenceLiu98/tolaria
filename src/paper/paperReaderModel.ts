import type { VaultEntry } from '../types'
import type { PaperBlocksReadResult, PaperBlocksState } from './blocks'
import type { SourceBlock } from './sourceBlocks'
import type { PaperMetadata } from './types'
import { isPaperEntry, parsePaperMetadata } from './types'

export type PaperReaderBlocksState = PaperBlocksState | 'loading' | 'error' | 'unavailable'

export interface PaperReaderSummary {
  blockCount: number
  blocksState: PaperReaderBlocksState
  selectedBlockId: string | null
}

function normalizedPath(path: string): string {
  return path.replace(/\\/g, '/')
}

function dirname(path: string): string {
  const normalized = normalizedPath(path)
  const separator = normalized.lastIndexOf('/')
  return separator === -1 ? '' : normalized.slice(0, separator)
}

function basename(path: string): string {
  const normalized = normalizedPath(path)
  const separator = normalized.lastIndexOf('/')
  return separator === -1 ? normalized : normalized.slice(separator + 1)
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith('/') || /^[A-Za-z]:[\\/]/u.test(path)
}

export function shouldOpenPaperReader(entry: VaultEntry | null): boolean {
  return entry !== null && isPaperEntry(entry) && entry.fileKind !== 'binary'
}

export function paperMetadataForReader(content: string | null): PaperMetadata | null {
  return parsePaperMetadata(content)
}

export function resolvePaperSidecarPath(paperPath: string, relativePath: string): string {
  if (isAbsolutePath(relativePath)) return normalizedPath(relativePath)
  const bundleDir = dirname(paperPath)
  return bundleDir.length > 0 ? `${bundleDir}/${relativePath}` : relativePath
}

export function sourcePdfEntryForPaper(entry: VaultEntry, metadata: PaperMetadata): VaultEntry {
  const path = resolvePaperSidecarPath(entry.path, metadata.sourcePdf)
  return {
    ...entry,
    path,
    filename: basename(path),
    title: metadata.sourcePdf,
    fileKind: 'binary',
    isA: null,
  }
}

export function blockDisplayText(block: SourceBlock): string {
  return [block.text, block.caption, block.section, block.kind]
    .find((value) => typeof value === 'string' && value.trim().length > 0)
    ?? block.id
}

export function paperReaderSummary(
  blocksResult: PaperBlocksReadResult | null,
  loading: boolean,
  hasVaultPath: boolean,
  hasError: boolean,
  selectedBlockId: string | null,
): PaperReaderSummary {
  if (loading) {
    return { blockCount: 0, blocksState: 'loading', selectedBlockId }
  }
  if (hasError) {
    return { blockCount: 0, blocksState: 'error', selectedBlockId }
  }
  if (!hasVaultPath) {
    return { blockCount: 0, blocksState: 'unavailable', selectedBlockId }
  }

  return {
    blockCount: blocksResult?.blocks.length ?? 0,
    blocksState: blocksResult?.state ?? 'missing',
    selectedBlockId,
  }
}
