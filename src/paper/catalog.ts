import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { VaultEntry, VaultPropertyValue } from '../types'
import { isPaperEntry } from './types'

export type PaperCatalogDuplicateMatch = 'doi' | 'arxiv' | 'openalex' | 'semantic_scholar' | 'source_pdf' | 'title_year' | 'title_author'
export type PaperCatalogSourcePdfState = 'missing' | 'present' | 'unknown'
export type PaperCatalogDuplicateState = 'none' | 'candidate' | 'dismissed'

export interface PaperCatalogDuplicateCandidate {
  paperId: string
  path: string
  title: string
  match: PaperCatalogDuplicateMatch
  reason: string
  decisionId: string
}

export interface PaperCatalogEntry {
  paperId: string
  path: string
  paperPath: string
  title: string
  authors: string[]
  year: number | null
  venue: string | null
  venueShort: string | null
  venueType: string | null
  publicationStage: string | null
  doi: string | null
  arxivId: string | null
  openalexId: string | null
  semanticScholarId: string | null
  parseStatus: string | null
  metadataStatus: string | null
  metadataConfidence: number | null
  sourcePdfState: PaperCatalogSourcePdfState
  duplicateState: PaperCatalogDuplicateState
  duplicateCandidates: PaperCatalogDuplicateCandidate[]
  workspaceId: string | null
  abstractText: string | null
}

export interface PaperCatalogFilters {
  query?: string
  author?: string
  year?: number | null
  venue?: string
  venueType?: string
  parseStatus?: string
  metadataStatus?: string
  needsReview?: boolean
  duplicateCandidates?: boolean
}

export type PaperCatalogSortKey = 'title' | 'authors' | 'year' | 'venue' | 'venueType' | 'metadataStatus' | 'parseStatus' | 'duplicateState'
export type PaperCatalogSortDirection = 'asc' | 'desc'

function stringValue(value: VaultPropertyValue | undefined): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed || null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return null
}

function numberValue(value: VaultPropertyValue | undefined): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string') return null
  const parsed = Number(value.trim())
  return Number.isFinite(parsed) ? parsed : null
}

function stringArrayValue(value: VaultPropertyValue | undefined): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string | number | boolean => item !== null)
      .map(String)
      .map(item => item.trim())
      .filter(Boolean)
  }
  const scalar = stringValue(value)
  if (!scalar) return []
  return scalar
    .split(/[\n;]+/u)
    .flatMap(part => part.split(/\s+and\s+/iu))
    .map(item => item.trim())
    .filter(Boolean)
}

export function normalizeDoi(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const withoutUrl = trimmed
    .replace(/^https?:\/\/(dx\.)?doi\.org\//iu, '')
    .replace(/^doi:\s*/iu, '')
    .trim()
  return withoutUrl ? withoutUrl.toLowerCase() : null
}

export function normalizeArxivId(value: string | null | undefined, options: { stripVersion?: boolean } = {}): string | null {
  const trimmed = value?.trim()
  if (!trimmed) return null
  const match = trimmed.match(/(?:arxiv:\s*|arxiv\.org\/(?:abs|pdf)\/)?([a-z-]+\/\d{7}|\d{4}\.\d{4,5})(v\d+)?/iu)
  if (!match) return null
  const id = `${match[1]}${options.stripVersion ? '' : match[2] ?? ''}`
  return id.toLowerCase()
}

export function normalizeIdentifier(value: string | null | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed.toLowerCase().replace(/\/+$/u, '') : null
}

export function titleFingerprint(value: string | null | undefined): string | null {
  const normalized = value
    ?.normalize('NFKD')
    .toLowerCase()
    .replace(/&/gu, ' and ')
    .replace(/[^a-z0-9]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ')
  return normalized && normalized.length >= 8 ? normalized : null
}

export function firstAuthorFingerprint(authors: string[]): string | null {
  const first = authors[0]?.normalize('NFKD').toLowerCase()
  if (!first) return null
  const tokens = first.replace(/[^a-z0-9]+/gu, ' ').trim().split(/\s+/u).filter(Boolean)
  return tokens.at(-1) ?? null
}

function sourcePdfState(entry: VaultEntry): PaperCatalogSourcePdfState {
  return stringValue(entry.properties.source_pdf) ? 'present' : 'unknown'
}

function entryToCatalog(entry: VaultEntry): PaperCatalogEntry | null {
  if (!isPaperEntry(entry)) return null
  const paperId = stringValue(entry.properties.paper_id) ?? entry.path.match(/\/papers\/([^/]+)\/paper\.md$/u)?.[1] ?? entry.title

  return {
    paperId,
    path: entry.path,
    paperPath: entry.path,
    title: stringValue(entry.properties.title) ?? entry.title,
    authors: stringArrayValue(entry.properties.authors),
    year: numberValue(entry.properties.year),
    venue: stringValue(entry.properties.venue),
    venueShort: stringValue(entry.properties.venue_short),
    venueType: stringValue(entry.properties.venue_type),
    publicationStage: stringValue(entry.properties.publication_stage),
    doi: stringValue(entry.properties.doi),
    arxivId: stringValue(entry.properties.arxiv_id),
    openalexId: stringValue(entry.properties.openalex_id),
    semanticScholarId: stringValue(entry.properties.semantic_scholar_id),
    parseStatus: stringValue(entry.properties.parse_status),
    metadataStatus: stringValue(entry.properties.metadata_status),
    metadataConfidence: numberValue(entry.properties.metadata_confidence),
    sourcePdfState: sourcePdfState(entry),
    duplicateState: 'none',
    duplicateCandidates: [],
    workspaceId: entry.workspace?.id ?? null,
    abstractText: stringValue(entry.properties.abstract),
  }
}

function duplicateDecisionId(left: PaperCatalogEntry, right: PaperCatalogEntry): string {
  return [left.paperId, right.paperId].sort().join('::')
}

function duplicateCandidate(left: PaperCatalogEntry, right: PaperCatalogEntry, match: PaperCatalogDuplicateMatch, reason: string): PaperCatalogDuplicateCandidate {
  return {
    paperId: right.paperId,
    path: right.path,
    title: right.title,
    match,
    reason,
    decisionId: duplicateDecisionId(left, right),
  }
}

function duplicateMatch(left: PaperCatalogEntry, right: PaperCatalogEntry): { match: PaperCatalogDuplicateMatch; reason: string } | null {
  if (normalizeDoi(left.doi) && normalizeDoi(left.doi) === normalizeDoi(right.doi)) {
    return { match: 'doi', reason: 'same DOI' }
  }
  if (normalizeArxivId(left.arxivId, { stripVersion: true }) && normalizeArxivId(left.arxivId, { stripVersion: true }) === normalizeArxivId(right.arxivId, { stripVersion: true })) {
    return { match: 'arxiv', reason: 'same arXiv ID' }
  }
  if (normalizeIdentifier(left.openalexId) && normalizeIdentifier(left.openalexId) === normalizeIdentifier(right.openalexId)) {
    return { match: 'openalex', reason: 'same OpenAlex ID' }
  }
  if (normalizeIdentifier(left.semanticScholarId) && normalizeIdentifier(left.semanticScholarId) === normalizeIdentifier(right.semanticScholarId)) {
    return { match: 'semantic_scholar', reason: 'same Semantic Scholar ID' }
  }

  const leftTitle = titleFingerprint(left.title)
  const rightTitle = titleFingerprint(right.title)
  if (!leftTitle || leftTitle !== rightTitle) return null
  if (left.year && right.year && left.year === right.year) {
    return { match: 'title_year', reason: 'same title and year' }
  }
  const leftAuthor = firstAuthorFingerprint(left.authors)
  if (leftAuthor && leftAuthor === firstAuthorFingerprint(right.authors)) {
    return { match: 'title_author', reason: 'same title and first author' }
  }
  return null
}

export function withDuplicateCandidates(entries: PaperCatalogEntry[], dismissedDecisionIds: Iterable<string> = []): PaperCatalogEntry[] {
  const dismissed = new Set(dismissedDecisionIds)
  const next: PaperCatalogEntry[] = entries.map(entry => ({
    ...entry,
    duplicateCandidates: [],
    duplicateState: 'none',
  }))

  for (let leftIndex = 0; leftIndex < next.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < next.length; rightIndex += 1) {
      const left = next[leftIndex]
      const right = next[rightIndex]
      const match = duplicateMatch(left, right)
      if (!match) continue
      const decisionId = duplicateDecisionId(left, right)
      if (dismissed.has(decisionId)) {
        left.duplicateState = left.duplicateState === 'candidate' ? 'candidate' : 'dismissed'
        right.duplicateState = right.duplicateState === 'candidate' ? 'candidate' : 'dismissed'
        continue
      }
      left.duplicateCandidates.push(duplicateCandidate(left, right, match.match, match.reason))
      right.duplicateCandidates.push(duplicateCandidate(right, left, match.match, match.reason))
      left.duplicateState = 'candidate'
      right.duplicateState = 'candidate'
    }
  }

  return next
}

export function buildPaperCatalog(entries: VaultEntry[], dismissedDecisionIds: Iterable<string> = []): PaperCatalogEntry[] {
  return withDuplicateCandidates(entries.map(entryToCatalog).filter((entry): entry is PaperCatalogEntry => Boolean(entry)), dismissedDecisionIds)
}

function searchHaystack(entry: PaperCatalogEntry): string {
  return [
    entry.title,
    entry.abstractText,
    ...entry.authors,
    entry.venue,
    entry.venueShort,
    entry.venueType,
    entry.doi,
    entry.arxivId,
    entry.openalexId,
    entry.semanticScholarId,
  ].filter(Boolean).join(' ').toLowerCase()
}

export function filterPaperCatalog(entries: PaperCatalogEntry[], filters: PaperCatalogFilters): PaperCatalogEntry[] {
  const query = filters.query?.trim().toLowerCase()
  return entries.filter(entry => {
    if (query && !searchHaystack(entry).includes(query)) return false
    if (filters.author && !entry.authors.some(author => author.toLowerCase().includes(filters.author!.toLowerCase()))) return false
    if (filters.year && entry.year !== filters.year) return false
    if (filters.venue && entry.venue !== filters.venue && entry.venueShort !== filters.venue) return false
    if (filters.venueType && entry.venueType !== filters.venueType) return false
    if (filters.parseStatus && entry.parseStatus !== filters.parseStatus) return false
    if (filters.metadataStatus && entry.metadataStatus !== filters.metadataStatus) return false
    if (filters.needsReview && entry.metadataStatus !== 'needs_review') return false
    if (filters.duplicateCandidates && entry.duplicateState !== 'candidate') return false
    return true
  })
}

function sortableValue(entry: PaperCatalogEntry, key: PaperCatalogSortKey): string | number {
  switch (key) {
    case 'authors':
      return entry.authors.join(' ')
    case 'year':
      return entry.year ?? 0
    case 'venue':
      return entry.venueShort ?? entry.venue ?? ''
    case 'venueType':
      return entry.venueType ?? ''
    case 'metadataStatus':
      return entry.metadataStatus ?? ''
    case 'parseStatus':
      return entry.parseStatus ?? ''
    case 'duplicateState':
      return entry.duplicateState
    case 'title':
      return entry.title
  }
}

export function sortPaperCatalog(entries: PaperCatalogEntry[], key: PaperCatalogSortKey, direction: PaperCatalogSortDirection = 'asc'): PaperCatalogEntry[] {
  const multiplier = direction === 'asc' ? 1 : -1
  return [...entries].sort((left, right) => {
    const leftValue = sortableValue(left, key)
    const rightValue = sortableValue(right, key)
    if (typeof leftValue === 'number' && typeof rightValue === 'number') return (leftValue - rightValue) * multiplier
    return String(leftValue).localeCompare(String(rightValue), undefined, { numeric: true, sensitivity: 'base' }) * multiplier
  })
}

function invokePaperCatalogCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

export function listPaperCatalog(vaultPath: string): Promise<PaperCatalogEntry[]> {
  return invokePaperCatalogCommand<PaperCatalogEntry[]>('list_paper_catalog', { vaultPath })
}

export function searchPaperCatalog(vaultPath: string, query: string): Promise<PaperCatalogEntry[]> {
  return invokePaperCatalogCommand<PaperCatalogEntry[]>('search_paper_catalog', { vaultPath, query })
}

export function findPaperDuplicates(vaultPath: string): Promise<PaperCatalogEntry[]> {
  return invokePaperCatalogCommand<PaperCatalogEntry[]>('find_paper_duplicates', { vaultPath })
}

export function markPaperDuplicateDecision(vaultPath: string, decisionId: string, dismissed: boolean): Promise<PaperCatalogEntry[]> {
  return invokePaperCatalogCommand<PaperCatalogEntry[]>('mark_paper_duplicate_decision', { vaultPath, decisionId, dismissed })
}
