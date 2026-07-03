import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'

export type PaperMetadataStatus = 'missing' | 'ready' | 'needs_review' | 'failed'
export type PaperVenueType = 'journal' | 'conference' | 'workshop' | 'preprint' | 'book' | 'unknown'
export type PaperPublicationStage = 'preprint' | 'published' | 'accepted' | 'unknown'
export type PaperMetadataSidecarState = 'missing' | 'empty' | 'ready'

export interface PaperMetadataValues {
  title?: string | null
  authors: string[]
  year?: number | null
  venue?: string | null
  venueShort?: string | null
  venueType?: PaperVenueType | null
  publicationDate?: string | null
  publicationStage?: PaperPublicationStage | null
  doi?: string | null
  arxivId?: string | null
  abstract?: string | null
}

export interface PaperMetadataSource {
  provider: string
  identifier?: string | null
  confidence: number
  matchedBy: string
  metadata: PaperMetadataValues
}

export interface PaperMetadataCandidate {
  id: string
  provider: string
  confidence: number
  reason: string
  metadata: PaperMetadataValues
}

export interface PaperMetadataProviderError {
  provider: string
  kind: string
  message: string
}

export interface PaperMetadata extends PaperMetadataValues {
  paperId: string
  status: PaperMetadataStatus
  confidence: number
  updatedAt?: string | null
  sources: PaperMetadataSource[]
  candidates: PaperMetadataCandidate[]
  errors: PaperMetadataProviderError[]
}

export interface PaperMetadataReadResult {
  paperId: string
  path: string
  state: PaperMetadataSidecarState
  metadata?: PaperMetadata | null
}

export interface PaperMetadataError {
  kind: string
  message: string
  paperId: string
  path: string
}

function invokePaperMetadataCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

export function readPaperMetadata(
  vaultPath: string,
  paperId: string,
): Promise<PaperMetadataReadResult> {
  return invokePaperMetadataCommand<PaperMetadataReadResult>('read_paper_metadata', {
    vaultPath,
    paperId,
  })
}

export function extractPaperMetadata(
  vaultPath: string,
  paperId: string,
): Promise<PaperMetadata> {
  return invokePaperMetadataCommand<PaperMetadata>('extract_paper_metadata', {
    vaultPath,
    paperId,
  })
}

export function refreshPaperMetadata(
  vaultPath: string,
  paperId: string,
): Promise<PaperMetadata> {
  return invokePaperMetadataCommand<PaperMetadata>('refresh_paper_metadata', {
    vaultPath,
    paperId,
  })
}

export function applyPaperMetadataCandidate(
  vaultPath: string,
  paperId: string,
  candidateId: string,
): Promise<PaperMetadata> {
  return invokePaperMetadataCommand<PaperMetadata>('apply_paper_metadata_candidate', {
    vaultPath,
    paperId,
    candidateId,
  })
}

export function savePaperMetadata(
  vaultPath: string,
  paperId: string,
  values: PaperMetadataValues,
): Promise<PaperMetadata> {
  return invokePaperMetadataCommand<PaperMetadata>('save_paper_metadata', {
    vaultPath,
    paperId,
    values,
  })
}

export function paperMetadataStatusLabel(status: PaperMetadataStatus | null | undefined): string {
  switch (status) {
    case 'ready':
      return 'ready'
    case 'needs_review':
      return 'needs review'
    case 'failed':
      return 'failed'
    case 'missing':
    case null:
    case undefined:
      return 'missing'
  }
}

export function normalizeMetadataConfidence(confidence: number | null | undefined): number {
  if (!Number.isFinite(confidence)) return 0
  return Math.max(0, Math.min(1, Number(confidence)))
}
