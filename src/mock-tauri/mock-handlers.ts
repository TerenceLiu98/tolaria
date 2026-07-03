/**
 * Mock command handlers for Tauri invoke calls.
 * Each handler simulates a Tauri backend command.
 */

import type {
  VaultEntry,
  ModifiedFile,
  Settings,
  GitAddRemoteResult,
  GitPullResult,
  GitPushResult,
  GitRemoteStatus,
  LastCommitInfo,
  PulseCommit,
} from '../types'
import { MOCK_CONTENT } from './mock-content'
import { MOCK_ENTRIES } from './mock-entries'
import {
  findSourceBlockById,
  parseSourceBlocksJsonl,
  sampleSourceBlocksJsonl,
  searchSourceBlocks,
} from '../paper/sourceBlocks'
import { paperMarkdownFromSourceBlocks } from '../paper/paperMarkdown'
import type { PaperMetadata, PaperMetadataValues } from '../paper/metadata'
import { buildPaperCatalog, filterPaperCatalog } from '../paper/catalog'
import {
  parsePaperAnnotationsJsonl,
  validatePaperAnnotation,
  type PaperAnnotation,
} from '../paper/paperAnnotations'
import type { PaperPdfOutlineItem } from '../paper/paperReaderBlocks'

function syncWindowContent(): void {
  if (typeof window !== 'undefined') {
    window.__mockContent = MOCK_CONTENT
  }
}

function mockFileHistory(path: string) {
  const filename = path.split('/').pop()?.replace('.md', '') ?? 'unknown'
  const ts = Math.floor(Date.now() / 1000)
  return [
    { hash: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0', shortHash: 'a1b2c3d', message: `Update ${filename} with latest changes`, author: 'Luca Rossi', date: ts - 86400 * 2 },
    { hash: 'e4f5g6h7i8j9k0l1m2n3o4p5q6r7s8t9u0v1w2x3', shortHash: 'e4f5g6h', message: `Add new section to ${filename}`, author: 'Luca Rossi', date: ts - 86400 * 5 },
    { hash: 'i7j8k9l0m1n2o3p4q5r6s7t8u9v0w1x2y3z4a5b6', shortHash: 'i7j8k9l', message: `Fix formatting in ${filename}`, author: 'Luca Rossi', date: ts - 86400 * 12 },
    { hash: 'm0n1o2p3q4r5s6t7u8v9w0x1y2z3a4b5c6d7e8f9', shortHash: 'm0n1o2p', message: `Create ${filename}`, author: 'Luca Rossi', date: ts - 86400 * 30 },
  ]
}

function stripMockFrontmatter(content: string): string {
  const lineEnding = content.startsWith('---\r\n')
    ? '\r\n'
    : content.startsWith('---\n') ? '\n' : null
  if (!lineEnding) return content

  const afterOpen = content.slice(3 + lineEnding.length)
  const closeIndex = afterOpen.indexOf(`${lineEnding}---`)
  if (closeIndex === -1) return content

  return afterOpen.slice(closeIndex + lineEnding.length + 3).trimStart()
}

function mockSearchContent(content: string, excludeFrontmatter?: boolean): string {
  return excludeFrontmatter ? stripMockFrontmatter(content) : content
}

function mockModifiedFiles(): ModifiedFile[] {
  return [
    { path: '/Users/luca/Laputa/26q1-laputa-app.md', relativePath: '26q1-laputa-app.md', status: 'modified' },
    { path: '/Users/luca/Laputa/facebook-ads-strategy.md', relativePath: 'facebook-ads-strategy.md', status: 'modified' },
    { path: '/Users/luca/Laputa/ai-agents-primer.md', relativePath: 'ai-agents-primer.md', status: 'added' },
    { path: '/Users/luca/Laputa/old-draft.md', relativePath: 'old-draft.md', status: 'deleted' },
  ]
}

function mockFileDiff(path: string): string {
  const filename = path.split('/').pop() ?? 'unknown'
  if (filename === 'old-draft.md') {
    return `diff --git a/${filename} b/${filename}
deleted file mode 100644
index abc1234..0000000
--- a/${filename}
+++ /dev/null
@@ -1,7 +0,0 @@
----
-title: Old Draft
-type: Note
----
-
-# Old Draft
-
-This note was deleted.`
  }
  return `diff --git a/${filename} b/${filename}
index abc1234..def5678 100644
--- a/${filename}
+++ b/${filename}
@@ -1,8 +1,10 @@
 ---
 title: Example Note
 type: Note
+status: Active
 ---

 # Example Note

-This is the original content.
+This is the updated content.
+
+A new paragraph has been added.`
}

function mockFileDiffAtCommit(path: string, commitHash: string): string {
  const filename = path.split('/').pop() ?? 'unknown'
  const shortHash = commitHash.slice(0, 7)
  return `diff --git a/${filename} b/${filename}
index abc1234..${shortHash} 100644
--- a/${filename}
+++ b/${filename}
@@ -5,3 +5,5 @@
 ---

 # Example Note
-Old paragraph from before ${shortHash}.
+Updated paragraph at commit ${shortHash}.
+
+New content added in this commit.`
}

let mockHasChanges = true
const mockSavedSinceCommit = new Set<string>()

let mockSettings: Settings = {
  auto_pull_interval_minutes: 5,
  git_enabled: null,
  autogit_enabled: false,
  autogit_idle_threshold_seconds: 90,
  autogit_inactive_threshold_seconds: 30,
  auto_advance_inbox_after_organize: false,
  telemetry_consent: false,
  crash_reporting_enabled: null,
  analytics_enabled: null,
  anonymous_id: null,
  release_channel: null,
  automatic_update_checks_enabled: null,
  theme_mode: null,
  ui_language: null,
  date_display_format: null,
  note_width_mode: null,
  sidebar_type_pluralization_enabled: null,
  initial_h1_auto_rename_enabled: null,
  ai_features_enabled: null,
  default_ai_agent: 'claude_code',
  default_ai_target: null,
  ai_model_providers: null,
  ai_workspace_conversations: null,
  paper_parser_provider: null,
  paper_parser_mineru_token_ref: null,
  hide_gitignored_files: null,
  all_notes_show_pdfs: null,
  all_notes_show_images: null,
  all_notes_show_unsupported: null,
  multi_workspace_enabled: null,
}

const DEFAULT_MOCK_VAULT_PATH = '/Users/mock/demo-vault-v2'
const DEFAULT_MOCK_VAULT = {
  label: 'demo-vault-v2',
  path: DEFAULT_MOCK_VAULT_PATH,
}

let mockLastVaultPath: string | null = DEFAULT_MOCK_VAULT_PATH
const mockRemoteStateByVault = new Map<string, boolean>([[DEFAULT_MOCK_VAULT_PATH, true]])

let mockVaultList: { vaults: Array<{ label: string; path: string }>; active_vault: string | null } = {
  vaults: [DEFAULT_MOCK_VAULT],
  active_vault: DEFAULT_MOCK_VAULT_PATH,
}

let mockVaultAiGuidanceStatus = {
  agents_state: 'managed',
  claude_state: 'managed',
  gemini_state: 'managed',
  can_restore: false,
} as const

function normalizeMockVaultPath(path: string | null | undefined): string | null {
  const trimmed = path?.trim()
  return trimmed ? trimmed : null
}

function setMockRemoteState(path: string | null | undefined, hasRemote: boolean): void {
  const normalizedPath = normalizeMockVaultPath(path)
  if (!normalizedPath) return
  mockRemoteStateByVault.set(normalizedPath, hasRemote)
}

function getMockRemoteState(path: string | null | undefined): boolean {
  const normalizedPath = normalizeMockVaultPath(path)
  if (!normalizedPath) return true
  return mockRemoteStateByVault.get(normalizedPath) ?? true
}

type MockContentPath = { path: string }
type MockContentWrite = MockContentPath & { content: string }

function readMockContent({ path }: MockContentPath): string {
  const content = Reflect.get(MOCK_CONTENT, path)
  return typeof content === 'string' ? content : ''
}

function writeMockContent({ path, content }: MockContentWrite): void {
  Reflect.set(MOCK_CONTENT, path, content)
}

function deleteMockContent({ path }: MockContentPath): void {
  Reflect.deleteProperty(MOCK_CONTENT, path)
}

function relativePathStem({ path, vaultPath }: { path: string; vaultPath: string }) {
  const prefix = vaultPath.endsWith('/') ? vaultPath : `${vaultPath}/`
  if (path.startsWith(prefix)) return path.slice(prefix.length).replace(/\.md$/, '')
  return (path.split('/').pop() ?? path).replace(/\.md$/, '')
}

function canonicalRenameTargets({ oldTitle, oldPathStem }: { oldTitle: string; oldPathStem: string }) {
  const oldFilenameStem = oldPathStem.split('/').pop() ?? oldPathStem
  return [...new Set([oldTitle, oldPathStem, oldFilenameStem].filter(Boolean))]
}

function slugifyMockTitle({ title }: { title: string }) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function buildRenamedMockPath({ oldPath, newTitle }: { oldPath: string; newTitle: string }) {
  const parentDir = oldPath.replace(/\/[^/]+$/, '')
  return `${parentDir}/${slugifyMockTitle({ title: newTitle })}.md`
}

function mockPaperTitleFromSource(sourcePath: string): string {
  const filename = sourcePath.split(/[\\/]/u).pop() ?? 'Paper'
  const stem = filename.replace(/\.[^.]+$/u, '')
  const title = stem.split(/[^A-Za-z0-9]+/u).filter(Boolean).join(' ')
  return title || 'Paper'
}

function mockPaperSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'paper'
}

function nextMockPaperSlug(vaultPath: string, baseSlug: string): string {
  let candidate = baseSlug
  let suffix = 2
  while (Object.hasOwn(MOCK_CONTENT, `${vaultPath}/papers/${candidate}/paper.md`)) {
    candidate = `${baseSlug}-${suffix}`
    suffix += 1
  }
  return candidate
}

function handleImportPaperPdf(args: { vaultPath?: string; vault_path?: string; sourcePath?: string; source_path?: string }) {
  const vaultPath = args.vaultPath ?? args.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
  const sourcePath = args.sourcePath ?? args.source_path ?? ''
  if (!sourcePath.toLowerCase().endsWith('.pdf')) throw new Error('Only PDF files can be imported as Papers')

  const title = mockPaperTitleFromSource(sourcePath)
  const baseSlug = mockPaperSlug(title)
  const paperId = nextMockPaperSlug(vaultPath, baseSlug)
  const paperPath = `${vaultPath}/papers/${paperId}/paper.md`
  const sourcePdfPath = `${vaultPath}/papers/${paperId}/source.pdf`
  const blocksPath = `${vaultPath}/papers/${paperId}/blocks.jsonl`
  const annotationsPath = `${vaultPath}/papers/${paperId}/annotations.jsonl`
  const content = `---
type: Paper
paper_id: ${paperId}
title: ${JSON.stringify(title)}
status: imported
parse_status: unparsed
source_pdf: source.pdf
blocks: blocks.jsonl
annotations: annotations.jsonl
---
# ${title}

## Summary

## Key Claims

## Questions
`

  writeMockContent({ path: paperPath, content })
  if (!MOCK_ENTRIES.some((entry) => entry.path === paperPath)) {
    const now = Math.floor(Date.now() / 1000)
    MOCK_ENTRIES.push({
      path: paperPath,
      filename: 'paper.md',
      title,
      isA: 'Paper',
      aliases: [],
      belongsTo: [],
      relatedTo: [],
      status: 'imported',
      archived: false,
      modifiedAt: now,
      createdAt: now,
      fileSize: content.length,
      snippet: '',
      wordCount: 0,
      relationships: {},
      icon: null,
      color: null,
      order: null,
      sidebarLabel: null,
      template: null,
      sort: null,
      view: null,
      visible: null,
      properties: {
        paper_id: paperId,
        parse_status: 'unparsed',
        source_pdf: 'source.pdf',
        blocks: 'blocks.jsonl',
        annotations: 'annotations.jsonl',
      },
      organized: false,
      favorite: false,
      favoriteIndex: null,
      listPropertiesDisplay: [],
      outgoingLinks: [],
      hasH1: true,
      fileKind: 'markdown',
    })
  }
  syncWindowContent()
  return {
    paperId,
    title,
    paperPath,
    sourcePdfPath,
    blocksPath,
    annotationsPath,
    createdFiles: [`papers/${paperId}/source.pdf`, `papers/${paperId}/paper.md`],
    deduplicated: paperId !== baseSlug,
  }
}

function mockPaperBlocksPath(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const vaultPath = args.vaultPath ?? args.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
  const paperId = args.paperId ?? args.paper_id ?? ''
  return {
    paperId,
    path: `${vaultPath}/papers/${paperId}/blocks.jsonl`,
  }
}

function mockPaperAnnotationsPath(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const vaultPath = args.vaultPath ?? args.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
  const paperId = args.paperId ?? args.paper_id ?? ''
  return {
    paperId,
    path: `${vaultPath}/papers/${paperId}/annotations.jsonl`,
  }
}

function mockPaperMetadataPath(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const vaultPath = args.vaultPath ?? args.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
  const paperId = args.paperId ?? args.paper_id ?? ''
  return {
    paperId,
    path: `${vaultPath}/papers/${paperId}/metadata.json`,
  }
}

function mockPaperPdfOutlinePath(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const vaultPath = args.vaultPath ?? args.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
  const paperId = args.paperId ?? args.paper_id ?? ''
  return {
    paperId,
    path: `${vaultPath}/papers/${paperId}/source.pdf`,
    fixturePath: `${vaultPath}/papers/${paperId}/source.pdf.outline.json`,
  }
}

function structuredMockBlocksError({
  lineErrors,
  paperId,
  path,
}: {
  lineErrors: ReturnType<typeof parseSourceBlocksJsonl>['errors']
  paperId: string
  path: string
}) {
  return {
    kind: 'invalid_jsonl',
    message: 'blocks.jsonl contains malformed SourceBlock lines',
    paperId,
    path,
    lineErrors,
  }
}

function structuredMockAnnotationsError({
  lineErrors,
  paperId,
  path,
}: {
  lineErrors: ReturnType<typeof parsePaperAnnotationsJsonl>['errors']
  paperId: string
  path: string
}) {
  return {
    kind: 'invalid_jsonl',
    message: 'annotations.jsonl contains malformed PaperAnnotation lines',
    paperId,
    path,
    lineErrors,
  }
}

function handleReadPaperBlocks(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const { paperId, path } = mockPaperBlocksPath(args)
  const content = Reflect.get(MOCK_CONTENT, path)
  if (typeof content !== 'string') {
    return { paperId, path, state: 'missing', blocks: [] }
  }

  const parsed = parseSourceBlocksJsonl(content)
  if (parsed.errors.length > 0) throw structuredMockBlocksError({ lineErrors: parsed.errors, paperId, path })
  return { paperId, path, state: parsed.state, blocks: parsed.blocks }
}

function handleReadPaperBlock(args: {
  vaultPath?: string
  vault_path?: string
  paperId?: string
  paper_id?: string
  blockId?: string
  block_id?: string
}) {
  const blockId = args.blockId ?? args.block_id ?? ''
  const result = handleReadPaperBlocks(args)
  return {
    paperId: result.paperId,
    blockId,
    path: result.path,
    state: result.state,
    block: findSourceBlockById(result.blocks, blockId),
  }
}

function handleSearchPaperBlocks(args: {
  vaultPath?: string
  vault_path?: string
  paperId?: string
  paper_id?: string
  query?: string
}) {
  const query = args.query ?? ''
  const result = handleReadPaperBlocks(args)
  return {
    paperId: result.paperId,
    query,
    path: result.path,
    state: result.state,
    blocks: searchSourceBlocks(result.blocks, query),
  }
}

function mockPaperNotePath(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const vaultPath = args.vaultPath ?? args.vault_path ?? '/Users/mock/demo-vault-v2'
  const paperId = args.paperId ?? args.paper_id ?? 'paper'
  return { paperId, path: `${vaultPath}/papers/${paperId}/paper.md` }
}

function blocksJsonlWithParser(paperId: string, parser: string): string {
  const parsed = parseSourceBlocksJsonl(sampleSourceBlocksJsonl(paperId))
  return parsed.blocks
    .map((block) => JSON.stringify({
      ...block,
      hash: parser === 'mineru' ? block.hash.replace('fixture', 'mineru') : block.hash,
      parser,
      ...(parser === 'mineru' ? { confidence: 0.99, source_asset: 'source.pdf' } : {}),
    }))
    .join('\n') + '\n'
}

function updateMockPaperParseMetadata(path: string, provider: string, parsedAt: string, parserVersion: string): void {
  const content = Reflect.get(MOCK_CONTENT, path)
  if (typeof content !== 'string') return
  let nextContent = content.includes('parse_status:')
    ? content.replace(/^parse_status:.*$/mu, 'parse_status: parsed')
    : content.replace(/^---$/mu, `---\nparse_status: parsed`)
  nextContent = nextContent.includes('parser_provider:')
    ? nextContent.replace(/^parser_provider:.*$/mu, `parser_provider: ${provider}`)
    : nextContent.replace(/^---$/mu, `---\nparser_provider: ${provider}`)
  nextContent = nextContent.includes('parser_version:')
    ? nextContent.replace(/^parser_version:.*$/mu, `parser_version: ${parserVersion}`)
    : nextContent.replace(/^---$/mu, `---\nparser_version: ${parserVersion}`)
  nextContent = nextContent.includes('parsed_at:')
    ? nextContent.replace(/^parsed_at:.*$/mu, `parsed_at: ${parsedAt}`)
    : nextContent.replace(/^---$/mu, `---\nparsed_at: ${parsedAt}`)
  writeMockContent({ path, content: nextContent })
}

function updateMockPaperMarkdownBody(path: string, markdownBody: string): void {
  const content = Reflect.get(MOCK_CONTENT, path)
  if (typeof content !== 'string') return
  const normalized = content.replace(/\r\n/g, '\n')
  const bodyStart = normalized.startsWith('---\n')
    ? (() => {
        const closeIndex = normalized.slice(4).search(/\n---(?:\n|$)/u)
        return closeIndex < 0 ? -1 : 4 + closeIndex + 4
      })()
    : -1
  const nextContent = bodyStart >= 0
    ? `${normalized.slice(0, bodyStart)}${markdownBody.endsWith('\n') ? markdownBody : `${markdownBody}\n`}`
    : markdownBody
  writeMockContent({ path, content: nextContent })
}

function mockParseError({
  kind,
  message,
  paperId,
  provider,
}: {
  kind: string
  message: string
  paperId: string
  provider: string
}) {
  return {
    kind,
    message,
    paperId,
    path: '',
    provider,
  }
}

function handleParsePaper(args: {
  force?: boolean
  paperId?: string
  paper_id?: string
  settings?: { mineruTokenRef?: string | null; provider?: string | null }
  vaultPath?: string
  vault_path?: string
}) {
  const provider = args.settings?.provider ?? 'none'
  const { paperId, path: paperPath } = mockPaperNotePath(args)
  if (provider === 'none') {
    throw mockParseError({
      kind: 'missing_provider',
      message: 'Choose a paper parser provider before parsing.',
      paperId,
      provider,
    })
  }
  if (provider === 'mineru') {
    if (!args.settings?.mineruTokenRef) {
      throw mockParseError({
        kind: 'missing_config',
        message: 'MinerU parsing requires an API token or token environment variable.',
        paperId,
        provider,
      })
    }
  }
  if (provider !== 'dev-fixture' && provider !== 'mineru') {
    throw mockParseError({
      kind: 'unsupported_provider',
      message: `Unsupported paper parser provider: ${provider}`,
      paperId,
      provider,
    })
  }
  const paperContent = Reflect.get(MOCK_CONTENT, paperPath)
  if (!args.force && typeof paperContent === 'string' && frontmatterScalar(paperContent, 'parse_status') === 'parsed') {
    throw mockParseError({
      kind: 'already_parsed',
      message: 'Paper has already been parsed.',
      paperId,
      provider,
    })
  }

  const { path: blocksPath } = mockPaperBlocksPath(args)
  const parsedAt = new Date().toISOString()
  const content = blocksJsonlWithParser(paperId, provider)
  writeMockContent({ path: blocksPath, content })
  mockSavedSinceCommit.add(blocksPath)
  const parserVersion = provider === 'mineru' ? 'mineru-api-v4' : 'fixture-v1'
  const parsed = parseSourceBlocksJsonl(content)
  updateMockPaperMarkdownBody(paperPath, paperMarkdownFromSourceBlocks(parsed.blocks))
  updateMockPaperParseMetadata(paperPath, provider, parsedAt, parserVersion)
  mockSavedSinceCommit.add(paperPath)
  syncWindowContent()
  return {
    assets: [],
    blocks: parsed.blocks,
    blocksPath,
    paperId,
    paperPath,
    parsedAt,
    parser: provider,
    parserVersion,
    provider,
    warnings: [],
  }
}

function readMockPaperAnnotations(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const { paperId, path } = mockPaperAnnotationsPath(args)
  const content = Reflect.get(MOCK_CONTENT, path)
  if (typeof content !== 'string') {
    return { paperId, path, state: 'missing' as const, annotations: [] }
  }

  const parsed = parsePaperAnnotationsJsonl(content, paperId)
  if (parsed.errors.length > 0) throw structuredMockAnnotationsError({ lineErrors: parsed.errors, paperId, path })
  return { paperId, path, state: parsed.state, annotations: parsed.annotations }
}

function handleReadPaperPdfOutline(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const { fixturePath, paperId, path } = mockPaperPdfOutlinePath(args)
  const fixture = MOCK_CONTENT[fixturePath]
  if (typeof fixture !== 'string') {
    return {
      items: [],
      message: 'PDF outline extraction is not available in the browser mock.',
      paperId,
      path,
      state: 'unavailable' as const,
    }
  }

  const parsed = JSON.parse(fixture) as PaperPdfOutlineItem[]
  return {
    items: parsed,
    message: null,
    paperId,
    path,
    state: parsed.length > 0 ? 'ready' as const : 'empty' as const,
  }
}

function extractMockDoi(content: string): string | null {
  return content.match(/\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b/iu)?.[0].replace(/[.,;]$/u, '').toLowerCase() ?? null
}

function extractMockArxivId(content: string): string | null {
  return content.match(/\barxiv[:\s]*([0-9]{4}\.[0-9]{4,5})(?:v[0-9]+)?\b/iu)?.[1] ?? null
}

function mockFrontmatterBlock(content: string): string | null {
  const lineEnding = content.startsWith('---\r\n')
    ? '\r\n'
    : content.startsWith('---\n') ? '\n' : null
  if (!lineEnding) return null

  const afterOpen = content.slice(3 + lineEnding.length)
  const closeIndex = afterOpen.indexOf(`${lineEnding}---`)
  if (closeIndex === -1) return null

  return afterOpen.slice(0, closeIndex)
}

function mockFrontmatterScalar(content: string, key: string): string | null {
  const block = mockFrontmatterBlock(content)
  const value = block?.match(new RegExp(`^${key}:\\s*(.*)$`, 'imu'))?.[1]?.trim()
  if (!value) return null
  return value.replace(/^["']|["']$/gu, '').trim() || null
}

function mockFrontmatterList(content: string, key: string): string[] {
  const block = mockFrontmatterBlock(content)
  if (!block) return []
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
  const match = block.match(new RegExp(`^${escapedKey}:\\s*\\n((?:\\s+-\\s+.*\\n?)*)`, 'imu'))
  if (!match) {
    const scalar = mockFrontmatterScalar(content, key)
    return scalar ? scalar.split(/,|;|\sand\s/u).map(item => item.trim()).filter(Boolean) : []
  }
  return match[1].split(/\r?\n/u)
    .map(line => line.replace(/^\s+-\s*/u, '').replace(/^["']|["']$/gu, '').trim())
    .filter(Boolean)
}

function mergeMockMetadataValues(base: PaperMetadataValues, next: PaperMetadataValues): PaperMetadataValues {
  return {
    title: next.title ?? base.title,
    authors: next.authors.length > 0 ? next.authors : base.authors,
    year: next.year ?? base.year,
    venue: next.venue ?? base.venue,
    venueShort: next.venueShort ?? base.venueShort,
    venueType: next.venueType ?? base.venueType,
    publicationDate: next.publicationDate ?? base.publicationDate,
    publicationStage: next.publicationStage ?? base.publicationStage,
    doi: next.doi ?? base.doi,
    arxivId: next.arxivId ?? base.arxivId,
    abstract: next.abstract ?? base.abstract,
  }
}

function mockPaperFrontmatterMetadataValues(content: string): PaperMetadataValues {
  const arxivValue = mockFrontmatterScalar(content, 'arxiv_id') ?? mockFrontmatterScalar(content, 'arxiv')
  return {
    title: mockFrontmatterScalar(content, 'title'),
    authors: mockFrontmatterList(content, 'authors'),
    year: Number(mockFrontmatterScalar(content, 'year') ?? '') || null,
    venue: mockFrontmatterScalar(content, 'venue'),
    venueShort: mockFrontmatterScalar(content, 'venue_short'),
    venueType: mockFrontmatterScalar(content, 'venue_type') as PaperMetadataValues['venueType'],
    publicationDate: mockFrontmatterScalar(content, 'publication_date'),
    publicationStage: mockFrontmatterScalar(content, 'publication_stage') as PaperMetadataValues['publicationStage'],
    doi: mockFrontmatterScalar(content, 'doi')?.replace(/^https?:\/\/doi\.org\//iu, '').toLowerCase() ?? null,
    arxivId: arxivValue ? extractMockArxivId(arxivValue) ?? arxivValue.replace(/^arxiv:/iu, '').trim() : null,
    abstract: mockFrontmatterScalar(content, 'abstract'),
  }
}

function mockPaperMetadataValues(content: string, fallbackTitle: string): PaperMetadataValues {
  const body = stripMockFrontmatter(content).replace(/<!--\s*tolaria:block.*?-->/gsu, '')
  const lines = body.split(/\r?\n/u)
    .map(line => line.trim().replace(/^#+\s*/u, ''))
    .filter(Boolean)
  const title = lines.find(line => line.length > 4 && !line.includes('@')) ?? fallbackTitle
  const abstractIndex = lines.findIndex(line => line.toLowerCase() === 'abstract')
  const authorLines = abstractIndex > 0
    ? lines.slice(1, abstractIndex).filter(line => !line.includes('@') && !/\d/u.test(line))
    : []
  const authors = authorLines
    .flatMap(line => line.split(/,|;|\sand\s/u))
    .map(author => author.trim())
    .filter(author => author.split(/\s+/u).length >= 2)
  const bodyValues: PaperMetadataValues = {
    title,
    authors,
    year: Number(body.match(/\b(19[7-9]\d|20\d{2})\b/u)?.[1] ?? '') || null,
    venue: null,
    venueShort: null,
    venueType: null,
    publicationDate: null,
    publicationStage: null,
    doi: extractMockDoi(body),
    arxivId: extractMockArxivId(body),
    abstract: abstractIndex >= 0 ? lines.slice(abstractIndex + 1, abstractIndex + 4).join(' ') : null,
  }
  return mergeMockMetadataValues(bodyValues, mockPaperFrontmatterMetadataValues(content))
}

function mockPaperEntryTitle(paperId: string): string {
  return MOCK_ENTRIES.find(entry => entry.properties?.paper_id === paperId)?.title ?? paperId
}

function writeMockPaperMetadataFrontmatter(path: string, metadata: PaperMetadata): void {
  const content = Reflect.get(MOCK_CONTENT, path)
  if (typeof content !== 'string') return
  const fields: Record<string, string | number | string[] | null | undefined> = {
    title: metadata.title,
    authors: metadata.authors.length > 0 ? metadata.authors : undefined,
    year: metadata.year,
    venue: metadata.venue,
    venue_short: metadata.venueShort,
    venue_type: metadata.venueType,
    publication_date: metadata.publicationDate,
    publication_stage: metadata.publicationStage,
    doi: metadata.doi,
    arxiv_id: metadata.arxivId,
    metadata_status: metadata.status,
    metadata_confidence: Math.round(metadata.confidence * 100) / 100,
  }
  let nextContent = content
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue
    const serialized = Array.isArray(value)
      ? `${key}:\n${value.map(item => `  - ${JSON.stringify(item)}`).join('\n')}`
      : `${key}: ${typeof value === 'string' ? JSON.stringify(value) : value}`
    nextContent = nextContent.match(new RegExp(`^${key}:.*(?:\\n  -.*)*$`, 'mu'))
      ? nextContent.replace(new RegExp(`^${key}:.*(?:\\n  -.*)*$`, 'mu'), serialized)
      : nextContent.replace(/^---$/mu, `---\n${serialized}`)
  }
  writeMockContent({ path, content: nextContent })
  mockSavedSinceCommit.add(path)
}

function buildMockPaperMetadata(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }): PaperMetadata {
  const { paperId, path: paperPath } = mockPaperNotePath(args)
  const content = Reflect.get(MOCK_CONTENT, paperPath)
  const values = mockPaperMetadataValues(typeof content === 'string' ? content : '', mockPaperEntryTitle(paperId))
  const confidence = values.doi || values.arxivId ? 0.9 : values.title ? 0.68 : 0
  return {
    ...values,
    paperId,
    status: confidence >= 0.78 ? 'ready' : confidence > 0 ? 'needs_review' : 'missing',
    confidence,
    updatedAt: new Date().toISOString(),
    sources: [{
      provider: 'parsed_markdown',
      identifier: null,
      confidence,
      matchedBy: 'paper_md_heuristic',
      metadata: values,
    }],
    candidates: confidence > 0 && confidence < 0.78 ? [{
      id: 'parsed_markdown-1',
      provider: 'parsed_markdown',
      confidence,
      reason: 'Local title/author heuristic needs review',
      metadata: values,
    }] : [],
    errors: [],
  }
}

function handleReadPaperMetadata(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const { paperId, path } = mockPaperMetadataPath(args)
  const content = Reflect.get(MOCK_CONTENT, path)
  if (typeof content !== 'string') return { paperId, path, state: 'missing' as const, metadata: null }
  if (content.trim().length === 0) return { paperId, path, state: 'empty' as const, metadata: null }
  return { paperId, path, state: 'ready' as const, metadata: JSON.parse(content) as PaperMetadata }
}

function handleExtractPaperMetadata(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const { path } = mockPaperMetadataPath(args)
  const { path: paperPath } = mockPaperNotePath(args)
  const metadata = buildMockPaperMetadata(args)
  writeMockContent({ path, content: `${JSON.stringify(metadata, null, 2)}\n` })
  writeMockPaperMetadataFrontmatter(paperPath, metadata)
  mockSavedSinceCommit.add(path)
  syncWindowContent()
  return metadata
}

function handleApplyPaperMetadataCandidate(args: {
  candidateId?: string
  candidate_id?: string
  vaultPath?: string
  vault_path?: string
  paperId?: string
  paper_id?: string
}) {
  const candidateId = args.candidateId ?? args.candidate_id ?? ''
  const { path: paperPath } = mockPaperNotePath(args)
  const { path } = mockPaperMetadataPath(args)
  const result = handleReadPaperMetadata(args)
  if (!result.metadata) throw new Error('metadata.json has no candidates to apply')
  const candidate = result.metadata.candidates.find(candidate => candidate.id === candidateId)
  if (!candidate) throw new Error(`Metadata candidate \`${candidateId}\` was not found`)
  const metadata: PaperMetadata = {
    ...result.metadata,
    ...candidate.metadata,
    status: 'ready',
    confidence: candidate.confidence,
    updatedAt: new Date().toISOString(),
    candidates: result.metadata.candidates.filter(candidate => candidate.id !== candidateId),
  }
  writeMockContent({ path, content: `${JSON.stringify(metadata, null, 2)}\n` })
  writeMockPaperMetadataFrontmatter(paperPath, metadata)
  syncWindowContent()
  return metadata
}

function handleSavePaperMetadata(args: {
  values?: PaperMetadataValues
  vaultPath?: string
  vault_path?: string
  paperId?: string
  paper_id?: string
}) {
  const { paperId } = mockPaperNotePath(args)
  const { path: paperPath } = mockPaperNotePath(args)
  const { path } = mockPaperMetadataPath(args)
  const existing = handleReadPaperMetadata(args).metadata
  const values = args.values ?? existing ?? mockPaperMetadataValues('', mockPaperEntryTitle(paperId))
  const metadata: PaperMetadata = {
    ...(existing ?? {
      paperId,
      sources: [],
      errors: [],
    }),
    ...values,
    paperId,
    status: 'ready',
    confidence: 1,
    updatedAt: new Date().toISOString(),
    candidates: [],
    sources: [
      ...(existing?.sources ?? []),
      {
        provider: 'manual',
        identifier: null,
        confidence: 1,
        matchedBy: 'user_edit',
        metadata: values,
      },
    ],
    errors: existing?.errors ?? [],
  }
  writeMockContent({ path, content: `${JSON.stringify(metadata, null, 2)}\n` })
  writeMockPaperMetadataFrontmatter(paperPath, metadata)
  syncWindowContent()
  return metadata
}

function writeMockPaperAnnotations({
  annotations,
  path,
}: {
  annotations: readonly PaperAnnotation[]
  path: string
}) {
  const content = annotations.map((annotation) => JSON.stringify(annotation)).join('\n')
  writeMockContent({ path, content: content ? `${content}\n` : '' })
  mockSavedSinceCommit.add(path)
  syncWindowContent()
}

function handleReadPaperAnnotations(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  return readMockPaperAnnotations(args)
}

function handleSavePaperAnnotation(args: {
  annotation?: PaperAnnotation
  vaultPath?: string
  vault_path?: string
  paperId?: string
  paper_id?: string
}) {
  const { paperId, path } = mockPaperAnnotationsPath(args)
  const annotation = args.annotation
  const validation = validatePaperAnnotation(annotation, 1, paperId)
  if (!validation.annotation) {
    throw structuredMockAnnotationsError({ lineErrors: validation.errors, paperId, path })
  }

  const existing = readMockPaperAnnotations(args).annotations
  const nextAnnotations = existing.some((candidate) => candidate.id === validation.annotation?.id)
    ? existing.map((candidate) => candidate.id === validation.annotation?.id ? validation.annotation : candidate)
    : [...existing, validation.annotation]
  writeMockPaperAnnotations({ annotations: nextAnnotations, path })
  return readMockPaperAnnotations(args)
}

function handleDeletePaperAnnotation(args: {
  annotationId?: string
  annotation_id?: string
  vaultPath?: string
  vault_path?: string
  paperId?: string
  paper_id?: string
}) {
  const { path } = mockPaperAnnotationsPath(args)
  const annotationId = args.annotationId ?? args.annotation_id ?? ''
  const existing = readMockPaperAnnotations(args).annotations
  writeMockPaperAnnotations({
    annotations: existing.filter((annotation) => annotation.id !== annotationId),
    path,
  })
  return readMockPaperAnnotations(args)
}

function handleResetPaperAnnotations(args: { vaultPath?: string; vault_path?: string; paperId?: string; paper_id?: string }) {
  const { path } = mockPaperAnnotationsPath(args)
  writeMockPaperAnnotations({ annotations: [], path })
  return readMockPaperAnnotations(args)
}

function replaceMockTitleFrontmatter({ content, newTitle }: { content: string; newTitle: string }) {
  return /^title:\s*/m.test(content)
    ? content.replace(/^title:\s*.*$/m, `title: ${newTitle}`)
    : content
}

function replaceRenamedWikilinks({ content, oldTargets, newPathStem }: {
  content: string
  oldTargets: string[]
  newPathStem: string
}) {
  if (oldTargets.length === 0) return content
  const targets = new Set(oldTargets)
  let rewritten = ''
  let cursor = 0

  while (cursor < content.length) {
    const start = content.indexOf('[[', cursor)
    if (start === -1) break

    const end = content.indexOf(']]', start + 2)
    if (end === -1) break

    rewritten += content.slice(cursor, start)
    rewritten += renamedWikilinkToken({
      newPathStem,
      targets,
      token: content.slice(start, end + 2),
    })
    cursor = end + 2
  }

  return rewritten + content.slice(cursor)
}

function renamedWikilinkToken({ newPathStem, targets, token }: {
  newPathStem: string
  targets: Set<string>
  token: string
}) {
  const body = token.slice(2, -2)
  const pipeIndex = body.indexOf('|')
  const target = pipeIndex === -1 ? body : body.slice(0, pipeIndex)
  if (!targets.has(target)) return token

  const pipe = pipeIndex === -1 ? '' : body.slice(pipeIndex)
  return `[[${newPathStem}${pipe}]]`
}

function updateMockRenameReferences({ newPath, newPathStem, oldTargets }: {
  newPath: string
  newPathStem: string
  oldTargets: string[]
}) {
  let updatedFiles = 0
  for (const [path, content] of Object.entries(MOCK_CONTENT)) {
    if (path === newPath) continue
    const replaced = replaceRenamedWikilinks({ content, oldTargets, newPathStem })
    if (replaced === content) continue
    writeMockContent({ path, content: replaced })
    updatedFiles += 1
  }
  return updatedFiles
}

function handleRenameNote(args: { vault_path: string; old_path: string; new_title: string; old_title?: string | null }) {
  const oldEntry = MOCK_ENTRIES.find(e => e.path === args.old_path)
  const oldTitle = args.old_title ?? oldEntry?.title ?? ''
  const oldContent = readMockContent({ path: args.old_path })
  const newPath = buildRenamedMockPath({ oldPath: args.old_path, newTitle: args.new_title })
  const oldPathStem = relativePathStem({ path: args.old_path, vaultPath: args.vault_path })
  const newPathStem = relativePathStem({ path: newPath, vaultPath: args.vault_path })

  if (oldTitle === args.new_title && newPath === args.old_path) {
    return { new_path: args.old_path, updated_files: 0, failed_updates: 0 }
  }

  const newContent = replaceMockTitleFrontmatter({ content: oldContent, newTitle: args.new_title })
  deleteMockContent({ path: args.old_path })
  writeMockContent({ path: newPath, content: newContent })
  const oldTargets = canonicalRenameTargets({ oldTitle, oldPathStem })
  const updatedFiles = updateMockRenameReferences({ newPath, newPathStem, oldTargets })

  syncWindowContent()
  return { new_path: newPath, updated_files: updatedFiles, failed_updates: 0 }
}

function handleRenameNoteFilename(args: {
  vault_path: string
  old_path: string
  new_filename_stem: string
}) {
  const oldEntry = MOCK_ENTRIES.find(e => e.path === args.old_path)
  const oldContent = readMockContent({ path: args.old_path })
  const oldTitle = oldEntry?.title ?? ''
  const normalizedStem = args.new_filename_stem.trim().replace(/\.md$/, '')
  const oldFilename = args.old_path.split('/').pop() ?? ''
  const newFilename = `${normalizedStem}.md`

  if (!normalizedStem) {
    throw new Error('Invalid filename')
  }
  if (oldFilename === newFilename) {
    return { new_path: args.old_path, updated_files: 0, failed_updates: 0 }
  }

  const parentDir = args.old_path.replace(/\/[^/]+$/, '')
  const newPath = `${parentDir}/${newFilename}`
  if (newPath !== args.old_path && Object.hasOwn(MOCK_CONTENT, newPath)) {
    throw new Error('A note with that name already exists')
  }

  deleteMockContent({ path: args.old_path })
  writeMockContent({ path: newPath, content: oldContent })

  const oldPathStem = relativePathStem({ path: args.old_path, vaultPath: args.vault_path })
  const newPathStem = relativePathStem({ path: newPath, vaultPath: args.vault_path })
  const oldTargets = canonicalRenameTargets({ oldTitle, oldPathStem })
  const updatedFiles = updateMockRenameReferences({ newPath, newPathStem, oldTargets })

  syncWindowContent()
  return { new_path: newPath, updated_files: updatedFiles, failed_updates: 0 }
}

function handleMoveNoteToFolder(args: {
  vault_path: string
  old_path: string
  folder_path: string
}) {
  const oldEntry = MOCK_ENTRIES.find(e => e.path === args.old_path)
  const oldContent = readMockContent({ path: args.old_path })
  const oldTitle = oldEntry?.title ?? ''
  const oldFilename = args.old_path.split('/').pop() ?? ''
  const normalizedFolderPath = args.folder_path.trim().replace(/^\/+|\/+$/g, '')

  if (!normalizedFolderPath) {
    throw new Error('Folder path cannot be empty')
  }

  const vaultRoot = args.vault_path.replace(/\/+$/, '')
  const newPath = `${vaultRoot}/${normalizedFolderPath}/${oldFilename}`
  if (newPath === args.old_path) {
    return { new_path: args.old_path, updated_files: 0, failed_updates: 0 }
  }
  if (Object.hasOwn(MOCK_CONTENT, newPath)) {
    throw new Error('A note with that name already exists')
  }

  deleteMockContent({ path: args.old_path })
  writeMockContent({ path: newPath, content: oldContent })

  const oldPathStem = relativePathStem({ path: args.old_path, vaultPath: args.vault_path })
  const newPathStem = relativePathStem({ path: newPath, vaultPath: args.vault_path })
  const oldTargets = canonicalRenameTargets({ oldTitle, oldPathStem })
  const updatedFiles = updateMockRenameReferences({ newPath, newPathStem, oldTargets })

  syncWindowContent()
  return { new_path: newPath, updated_files: updatedFiles, failed_updates: 0 }
}

function handleMoveNoteToWorkspace(args: {
  source_vault_path: string
  destination_vault_path: string
  old_path: string
  replacement_target?: string | null
}) {
  const oldEntry = MOCK_ENTRIES.find(e => e.path === args.old_path)
  const oldContent = readMockContent({ path: args.old_path })
  const oldTitle = oldEntry?.title ?? ''
  const oldFilename = args.old_path.split('/').pop() ?? ''
  const sourceRoot = args.source_vault_path.replace(/\/+$/, '')
  const destinationRoot = args.destination_vault_path.replace(/\/+$/, '')
  const relativePath = args.old_path.startsWith(`${sourceRoot}/`)
    ? args.old_path.slice(sourceRoot.length + 1)
    : oldFilename
  const newPath = `${destinationRoot}/${relativePath}`

  if (newPath === args.old_path) {
    return { new_path: args.old_path, updated_files: 0, failed_updates: 0 }
  }
  if (Object.hasOwn(MOCK_CONTENT, newPath)) {
    throw new Error('A note with that name already exists')
  }

  deleteMockContent({ path: args.old_path })
  writeMockContent({ path: newPath, content: oldContent })

  const oldPathStem = relativePathStem({ path: args.old_path, vaultPath: args.source_vault_path })
  const newPathStem = args.replacement_target
    ?? relativePathStem({ path: newPath, vaultPath: args.destination_vault_path })
  const oldTargets = canonicalRenameTargets({ oldTitle, oldPathStem })
  const updatedFiles = updateMockRenameReferences({ newPath, newPathStem, oldTargets })

  syncWindowContent()
  return { new_path: newPath, updated_files: updatedFiles, failed_updates: 0 }
}

function frontmatterScalar(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^${key}:\\s*['"]?([^'"\\n]+)['"]?\\s*$`, 'mu'))
  return match?.[1]?.trim() ?? null
}

function titleFromMockContent(path: string, content: string): string {
  const heading = content.match(/^#\s+(.+)$/mu)?.[1]?.trim()
  if (heading) return heading
  const filename = path.split('/').pop() ?? 'unknown.md'
  return filename.replace(/\.md$/iu, '')
}

function addMockEntryForCreatedContent(path: string, content: string): void {
  if (MOCK_ENTRIES.some((entry) => entry.path === path)) return

  const now = Math.floor(Date.now() / 1000)
  const filename = path.split('/').pop() ?? 'unknown.md'
  const typeName = frontmatterScalar(content, 'type') ?? 'Note'
  MOCK_ENTRIES.push({
    path,
    filename,
    title: titleFromMockContent(path, content),
    isA: typeName,
    aliases: [],
    belongsTo: [],
    relatedTo: [],
    status: frontmatterScalar(content, 'status'),
    archived: false,
    modifiedAt: now,
    createdAt: now,
    fileSize: content.length,
    snippet: '',
    wordCount: 0,
    relationships: {},
    icon: null,
    color: null,
    order: null,
    sidebarLabel: null,
    template: null,
    sort: null,
    view: null,
    visible: true,
    properties: { type: typeName },
    organized: false,
    favorite: false,
    favoriteIndex: null,
    listPropertiesDisplay: [],
    outgoingLinks: [],
    hasH1: /^#\s+/mu.test(content),
    fileKind: 'markdown',
  })
}

const mockDismissedPaperDuplicateDecisions = new Set<string>()

function handleListPaperCatalog() {
  return buildPaperCatalog(MOCK_ENTRIES, mockDismissedPaperDuplicateDecisions)
}

function handleSearchPaperCatalog(args: { query?: string }) {
  return filterPaperCatalog(handleListPaperCatalog(), { query: args.query ?? '' })
}

function handleFindPaperDuplicates() {
  return handleListPaperCatalog().filter(entry => entry.duplicateState === 'candidate')
}

function handleMarkPaperDuplicateDecision(args: { decisionId?: string; decision_id?: string; dismissed?: boolean }) {
  const decisionId = args.decisionId ?? args.decision_id
  if (decisionId && args.dismissed !== false) {
    mockDismissedPaperDuplicateDecisions.add(decisionId)
  } else if (decisionId) {
    mockDismissedPaperDuplicateDecisions.delete(decisionId)
  }
  return handleListPaperCatalog()
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock handler map accepts heterogeneous arg types
export const mockHandlers: Record<string, (args: any) => any> = {
  list_vault: () => MOCK_ENTRIES,
  list_vault_folders: () => [],
  list_views: () => [],
  save_view_cmd: () => {},
  delete_view_cmd: () => {},
  reload_vault: () => MOCK_ENTRIES,
  reload_vault_entry: (args: { path: string }) => MOCK_ENTRIES.find(e => e.path === args.path) ?? { path: args.path, title: 'Unknown', filename: 'unknown.md', aliases: [], belongsTo: [], relatedTo: [], archived: false, snippet: '', wordCount: 0, fileSize: 0, relationships: {}, outgoingLinks: [], properties: {} },
  sync_note_title: () => false,
  import_paper_pdf: handleImportPaperPdf,
  parse_paper: handleParsePaper,
  read_paper_blocks: handleReadPaperBlocks,
  read_paper_block: handleReadPaperBlock,
  search_paper_blocks: handleSearchPaperBlocks,
  read_paper_pdf_outline: handleReadPaperPdfOutline,
  read_paper_metadata: handleReadPaperMetadata,
  extract_paper_metadata: handleExtractPaperMetadata,
  refresh_paper_metadata: handleExtractPaperMetadata,
  apply_paper_metadata_candidate: handleApplyPaperMetadataCandidate,
  save_paper_metadata: handleSavePaperMetadata,
  read_paper_annotations: handleReadPaperAnnotations,
  save_paper_annotation: handleSavePaperAnnotation,
  delete_paper_annotation: handleDeletePaperAnnotation,
  reset_paper_annotations: handleResetPaperAnnotations,
  list_paper_catalog: handleListPaperCatalog,
  search_paper_catalog: handleSearchPaperCatalog,
  find_paper_duplicates: handleFindPaperDuplicates,
  refresh_paper_catalog: handleListPaperCatalog,
  mark_paper_duplicate_decision: handleMarkPaperDuplicateDecision,
  get_note_content: (args: { path: string }) => MOCK_CONTENT[args.path] ?? '',
  validate_note_content: (args: { path: string; content: string }) => (MOCK_CONTENT[args.path] ?? '') === args.content,
  create_note_content: (args: { path: string; content: string }) => {
    if (Object.hasOwn(MOCK_CONTENT, args.path)) throw new Error('A note with that name already exists')
    MOCK_CONTENT[args.path] = args.content
    addMockEntryForCreatedContent(args.path, args.content)
    mockSavedSinceCommit.add(args.path)
    syncWindowContent()
    return null
  },
  get_all_content: () => MOCK_CONTENT,
  get_file_history: (args: { path: string }) => mockFileHistory(args.path),
  get_modified_files: () => {
    const base = mockHasChanges ? mockModifiedFiles() : []
    const basePaths = new Set(base.map(f => f.path))
    const extra: ModifiedFile[] = [...mockSavedSinceCommit]
      .filter(p => !basePaths.has(p))
      .map(p => ({ path: p, relativePath: p.replace(/^.*?\/Laputa\//, ''), status: 'modified' as const }))
    return [...base, ...extra]
  },
  get_file_diff: (args: { path: string }) => mockFileDiff(args.path),
  get_file_diff_at_commit: (args: { path: string; commitHash: string }) => mockFileDiffAtCommit(args.path, args.commitHash),
  git_discard_file: () => {},
  git_commit: (args: { message: string }) => {
    const count = (mockHasChanges ? mockModifiedFiles().length : 0) + mockSavedSinceCommit.size
    mockHasChanges = false
    mockSavedSinceCommit.clear()
    return `[main abc1234] ${args.message}\n ${count} files changed`
  },
  git_author_identity: () => ({
    name: 'Demo User',
    email: 'demo@example.com',
    source: 'global',
    warning: null,
  }),
  get_build_number: () => 'bDEV',
  should_use_external_media_preview: () => false,
  get_last_commit_info: (): LastCommitInfo => ({ shortHash: 'a1b2c3d', commitUrl: 'https://github.com/lucaong/laputa-vault/commit/a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0' }),
  is_git_repo: () => true,
  init_git_repo: () => null,
  git_pull: (): GitPullResult => ({ status: 'up_to_date', message: 'Already up to date', updatedFiles: [], conflictFiles: [] }),
  git_push: (): GitPushResult => ({ status: 'ok', message: 'Pushed to remote' }),
  git_remote_status: (args?: { vaultPath?: string; vault_path?: string }): GitRemoteStatus => {
    const vaultPath = args?.vaultPath ?? args?.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
    return { branch: 'main', ahead: 0, behind: 0, hasRemote: getMockRemoteState(vaultPath) }
  },
  git_file_url: (args?: { vaultPath?: string; vault_path?: string; path?: string }): string | null => {
    const vaultPath = args?.vaultPath ?? args?.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
    if (!getMockRemoteState(vaultPath)) return null
    const path = args?.path?.replace(/^.*?\/Laputa\//, '') ?? 'note.md'
    return `https://github.com/lucaong/laputa-vault/blob/main/${encodeURI(path)}`
  },
  git_add_remote: (args?: {
    request?: { vaultPath?: string; vault_path?: string; remoteUrl?: string }
    vaultPath?: string
    vault_path?: string
    remoteUrl?: string
  }): GitAddRemoteResult => {
    const request = args?.request ?? args ?? {}
    const vaultPath = request.vaultPath ?? request.vault_path ?? mockLastVaultPath ?? DEFAULT_MOCK_VAULT_PATH
    setMockRemoteState(vaultPath, true)
    return {
      status: 'connected',
      message: 'Remote connected. This vault now tracks origin/main.',
    }
  },
  get_vault_pulse: (args: { limit?: number }): PulseCommit[] => {
    const limit = args.limit ?? 30
    const ts = Math.floor(Date.now() / 1000)
    const commits: PulseCommit[] = [
      { hash: 'a1b2c3d4e5f6', shortHash: 'a1b2c3d', message: 'Update project notes and add new experiment', date: ts - 3600, githubUrl: 'https://github.com/lucaong/laputa-vault/commit/a1b2c3d4e5f6', files: [{ path: '26q1-laputa-app.md', status: 'modified', title: '26q1 laputa app' }, { path: 'ai-search.md', status: 'added', title: 'ai search' }], added: 1, modified: 1, deleted: 0 },
      { hash: 'b2c3d4e5f6g7', shortHash: 'b2c3d4e', message: 'Reorganize people notes', date: ts - 86400, githubUrl: 'https://github.com/lucaong/laputa-vault/commit/b2c3d4e5f6g7', files: [{ path: 'alice-johnson.md', status: 'modified', title: 'alice johnson' }, { path: 'bob-smith.md', status: 'modified', title: 'bob smith' }, { path: 'old-contact.md', status: 'deleted', title: 'old contact' }], added: 0, modified: 2, deleted: 1 },
      { hash: 'c3d4e5f6g7h8', shortHash: 'c3d4e5f', message: 'Add daily journal entry', date: ts - 172800, githubUrl: null, files: [{ path: '2026-03-03.md', status: 'added', title: '2026 03 03' }], added: 1, modified: 0, deleted: 0 },
    ]
    return commits.slice(0, limit)
  },
  get_conflict_files: (): string[] => [],
  get_conflict_mode: () => 'none',
  check_claude_cli: () => ({ installed: false, version: null }),
  get_ai_agents_status: () => ({
    claude_code: { installed: false, version: null },
    codex: { installed: false, version: null },
    opencode: { installed: false, version: null },
    pi: { installed: false, version: null },
    antigravity: { installed: false, version: null },
    kiro: { installed: false, version: null },
  }),
  get_agent_docs_path: () => '/mock/Tolaria/resources/agent-docs',
  get_vault_ai_guidance_status: () => ({ ...mockVaultAiGuidanceStatus }),
  restore_vault_ai_guidance: () => {
    mockVaultAiGuidanceStatus = {
      agents_state: 'managed',
      claude_state: 'managed',
      gemini_state: 'managed',
      can_restore: false,
    }
    return { ...mockVaultAiGuidanceStatus }
  },
  stream_claude_chat: () => 'mock-session',
  stream_ai_agent: () => null,
  abort_ai_agent_stream: () => false,
  save_note_content: (args: { path: string; content: string }) => {
    MOCK_CONTENT[args.path] = args.content
    mockSavedSinceCommit.add(args.path)
    syncWindowContent()
    return null
  },
  save_image: (args: { vault_path?: string; filename: string; data: string }) => {
    const vault = args.vault_path ?? '/Users/luca/Laputa'
    return `${vault}/attachments/${Date.now()}-${args.filename}`
  },
  copy_image_to_vault: (args: { vault_path?: string; source_path: string }) => {
    const vault = args.vault_path ?? '/Users/luca/Laputa'
    const filename = args.source_path.split('/').pop() ?? 'image.png'
    return `${vault}/attachments/${Date.now()}-${filename}`
  },
  get_settings: () => ({ ...mockSettings }),
  save_settings: (args: { settings: Settings }) => {
    const s = args.settings
    mockSettings = {
      auto_pull_interval_minutes: s.auto_pull_interval_minutes ?? 5,
      git_enabled: s.git_enabled ?? null,
      autogit_enabled: s.autogit_enabled ?? false,
      autogit_idle_threshold_seconds: s.autogit_idle_threshold_seconds ?? 90,
      autogit_inactive_threshold_seconds: s.autogit_inactive_threshold_seconds ?? 30,
      auto_advance_inbox_after_organize: s.auto_advance_inbox_after_organize ?? false,
      telemetry_consent: s.telemetry_consent,
      crash_reporting_enabled: s.crash_reporting_enabled,
      analytics_enabled: s.analytics_enabled,
      anonymous_id: s.anonymous_id,
      release_channel: s.release_channel,
      automatic_update_checks_enabled: s.automatic_update_checks_enabled ?? null,
      theme_mode: s.theme_mode ?? null,
      ui_language: s.ui_language ?? null,
      date_display_format: s.date_display_format ?? null,
      note_width_mode: s.note_width_mode ?? null,
      sidebar_type_pluralization_enabled: s.sidebar_type_pluralization_enabled ?? null,
      initial_h1_auto_rename_enabled: s.initial_h1_auto_rename_enabled ?? null,
      ai_features_enabled: s.ai_features_enabled ?? null,
      default_ai_agent: s.default_ai_agent ?? null,
      default_ai_target: s.default_ai_target ?? null,
      ai_model_providers: s.ai_model_providers ?? null,
      ai_workspace_conversations: s.ai_workspace_conversations ?? null,
      paper_parser_provider: s.paper_parser_provider ?? null,
      paper_parser_mineru_token_ref: s.paper_parser_mineru_token_ref ?? null,
      hide_gitignored_files: s.hide_gitignored_files ?? null,
      all_notes_show_pdfs: s.all_notes_show_pdfs ?? null,
      all_notes_show_images: s.all_notes_show_images ?? null,
      all_notes_show_unsupported: s.all_notes_show_unsupported ?? null,
      multi_workspace_enabled: s.multi_workspace_enabled ?? null,
    }
    return null
  },
  load_vault_list: () => ({ ...mockVaultList, vaults: [...mockVaultList.vaults] }),
  save_vault_list: (args: { list: typeof mockVaultList }) => { mockVaultList = { ...args.list }; return null },
  rename_note: handleRenameNote,
  rename_note_filename: handleRenameNoteFilename,
  move_note_to_folder: handleMoveNoteToFolder,
  move_note_to_workspace: handleMoveNoteToWorkspace,
  clone_repo: (args: { url: string; localPath?: string; local_path?: string }) => {
    const localPath = args.localPath ?? args.local_path ?? ''
    setMockRemoteState(localPath, true)
    return `Cloned to ${localPath}`
  },
  clone_git_repo: (args: { url: string; localPath?: string; local_path?: string }) => {
    const localPath = args.localPath ?? args.local_path ?? ''
    setMockRemoteState(localPath, true)
    return `Cloned to ${localPath}`
  },
  purge_trash: () => [],
  delete_note: (args: { path: string }) => args.path,
  batch_delete_notes: (args: { paths: string[] }) => args.paths,
  empty_trash: () => [],
  migrate_is_a_to_type: () => 0,
  batch_archive_notes: (args: { paths: string[] }) => args.paths.length,
  batch_trash_notes: (args: { paths: string[] }) => args.paths.length,
  search_vault: (args: { query: string; mode: string; excludeFrontmatter?: boolean }) => {
    const q = (args.query ?? '').toLowerCase()
    if (!q) return { results: [], elapsed_ms: 0, query: q, mode: args.mode }
    const matches = MOCK_ENTRIES
      .filter(e => {
        const content = mockSearchContent(MOCK_CONTENT[e.path] ?? '', args.excludeFrontmatter)
        return e.title.toLowerCase().includes(q) || content.toLowerCase().includes(q)
      })
      .slice(0, 20)
      .map((e, i) => ({
        title: e.title,
        path: e.path,
        snippet: e.snippet || '',
        score: 1.0 - i * 0.05,
        note_type: e.isA,
      }))
    return { results: matches, elapsed_ms: 42, query: q, mode: args.mode }
  },
  get_last_vault_path: () => mockLastVaultPath,
  set_last_vault_path: (args: { path: string }) => { mockLastVaultPath = args.path; return null },
  get_default_vault_path: () => '/Users/mock/Documents/Getting Started',
  check_vault_exists: (args: { path: string }) => {
    // In mock mode, the demo-vault-v2 path always "exists"
    return args.path.includes('demo-vault-v2')
  },
  create_empty_vault: (args: { targetPath?: string; target_path?: string }) => {
    const targetPath = args.targetPath || args.target_path || '/Users/mock/Documents/My Vault'
    setMockRemoteState(targetPath, false)
    return targetPath
  },
  create_getting_started_vault: (args: { targetPath?: string | null }) => {
    const targetPath = args.targetPath || '/Users/mock/Documents/Getting Started'
    setMockRemoteState(targetPath, false)
    return targetPath
  },
  register_mcp_tools: () => 'registered',
  check_mcp_status: () => 'installed',
  get_mcp_config_snippet: () => JSON.stringify({
    mcpServers: {
      tolaria: {
        type: 'stdio',
        command: 'node',
        args: ['/mock/Tolaria/mcp-server/index.js'],
        env: {
          WS_UI_PORT: '9711',
        },
      },
    },
  }, null, 2),
  get_opencode_mcp_config_snippet: () => JSON.stringify({
    $schema: 'https://opencode.ai/config.json',
    mcp: {
      tolaria: {
        type: 'local',
        command: ['node', '/mock/Tolaria/mcp-server/index.js'],
        enabled: true,
        environment: {
          WS_UI_PORT: '9711',
        },
      },
    },
  }, null, 2),
  copy_text_to_clipboard: () => null,
  read_text_from_clipboard: () => '',
  sync_mcp_bridge_vault: (args: { vaultPath?: string | null }) => args.vaultPath ? 'started' : 'stopped',
  repair_vault: (): string => {
    mockVaultAiGuidanceStatus = {
      agents_state: 'managed',
      claude_state: 'managed',
      gemini_state: 'managed',
      can_restore: false,
    }
    return 'Vault repaired'
  },
  reinit_telemetry: (): null => null,
}

export function addMockEntry(_entry: VaultEntry, content: string): void {
  writeMockContent({ path: _entry.path, content })
  syncWindowContent()
}

export function updateMockContent(path: string, content: string): void {
  writeMockContent({ path, content })
  syncWindowContent()
}

export function trackMockChange(path: string): void {
  mockSavedSinceCommit.add(path)
}
