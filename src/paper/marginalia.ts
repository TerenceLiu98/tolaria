import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import { formatBlockCitation } from './blockCitations'
import { PAPER_DIRECTORY } from './paperPaths'

export const PAPER_NOTES_DIRECTORY = 'notes'
export const PAPER_MARGINALIA_FILENAME = 'marginalia.md'

export interface MarginaliaActionResult {
  created: boolean
  path: string
}

export type MarginaliaReadState = 'missing' | 'ready'

export interface MarginaliaReadResult {
  content: string
  path: string
  state: MarginaliaReadState
}

interface MarginaliaTemplateInput {
  initialCitation?: string
  paperPath: string
  paperTitle: string
}

interface MarginaliaReadInput {
  paperPath: string
  vaultPath?: string
}

interface MarginaliaCommandInput extends MarginaliaTemplateInput {
  vaultPath?: string
}

interface BlockCitationMarginaliaInput extends MarginaliaCommandInput {
  blockId: string
  paperId: string
}

interface NoteContentRequest {
  content?: string
  path: string
  vaultPath?: string
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+/gu, '/')
}

function parentDirectory(path: string): string {
  const normalized = normalizePath(path)
  const lastSlash = normalized.lastIndexOf('/')
  return lastSlash === -1 ? '' : normalized.slice(0, lastSlash)
}

function commandArgs(request: NoteContentRequest): Record<string, unknown> {
  const args: Record<string, unknown> = { path: request.path }
  if (request.content !== undefined) args.content = request.content
  if (request.vaultPath) args.vaultPath = request.vaultPath
  return args
}

function invokeNoteCommand<T>(command: string, request: NoteContentRequest): Promise<T> {
  const args = commandArgs(request)
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

function isAlreadyExistsError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /already exists|file exists|eexist/i.test(message)
}

function isMissingNoteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /does not exist|not found|enoent|no such file/i.test(message)
}

function mockContentHasPath(path: string): boolean {
  if (isTauri() || typeof window === 'undefined') return true
  return Boolean(window.__mockContent && Object.hasOwn(window.__mockContent, path))
}

export function defaultMarginaliaPathForPaper(paperPath: string): string {
  const paperDir = parentDirectory(paperPath)
  return paperDir
    ? `${paperDir}/${PAPER_NOTES_DIRECTORY}/${PAPER_MARGINALIA_FILENAME}`
    : `${PAPER_NOTES_DIRECTORY}/${PAPER_MARGINALIA_FILENAME}`
}

export function uniqueMarginaliaPathForPaper(paperPath: string, existingPaths: ReadonlySet<string>): string {
  const defaultPath = defaultMarginaliaPathForPaper(paperPath)
  if (!existingPaths.has(defaultPath)) return defaultPath

  const notesDir = parentDirectory(defaultPath)
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${notesDir}/marginalia-${index}.md`
    if (!existingPaths.has(candidate)) return candidate
  }

  throw new Error('Unable to allocate a unique marginalia note path')
}

export function paperWikilinkForPaperPath(paperPath: string): string {
  const normalized = normalizePath(paperPath)
  const markdownTarget = normalized.endsWith('.md') ? normalized.slice(0, -3) : normalized
  const papersPrefix = `${PAPER_DIRECTORY}/`
  const papersIndex = markdownTarget.indexOf(papersPrefix)
  const target = papersIndex >= 0 ? markdownTarget.slice(papersIndex) : markdownTarget
  return `[[${target}]]`
}

export function buildMarginaliaTemplate({
  initialCitation,
  paperPath,
  paperTitle,
}: MarginaliaTemplateInput): string {
  const keyClaims = initialCitation ? `\n- ${initialCitation}\n` : '\n'
  return [
    '---',
    'type: ResearchNote',
    'paper:',
    `  - "${paperWikilinkForPaperPath(paperPath)}"`,
    '---',
    '',
    `# Marginalia: ${paperTitle}`,
    '',
    '## Key Claims',
    keyClaims.trimEnd(),
    '',
    '## Questions',
    '',
    '## Notes',
    '',
  ].join('\n')
}

export function appendBlockCitationToMarginalia(content: string, citation: string): string {
  const separator = content.endsWith('\n') ? '\n' : '\n\n'
  return `${content}${separator}- ${citation}\n`
}

export async function readPaperMarginalia(input: MarginaliaReadInput): Promise<MarginaliaReadResult> {
  const path = defaultMarginaliaPathForPaper(input.paperPath)
  try {
    const content = await invokeNoteCommand<string>('get_note_content', { path, vaultPath: input.vaultPath })
    if (content === '' && !mockContentHasPath(path)) return { content: '', path, state: 'missing' }
    return { content, path, state: 'ready' }
  } catch (error) {
    if (isMissingNoteError(error)) return { content: '', path, state: 'missing' }
    throw error
  }
}

export async function createOrOpenPaperMarginalia(input: MarginaliaCommandInput): Promise<MarginaliaActionResult> {
  const path = defaultMarginaliaPathForPaper(input.paperPath)
  const content = buildMarginaliaTemplate(input)
  try {
    await invokeNoteCommand<void>('create_note_content', { content, path, vaultPath: input.vaultPath })
    return { created: true, path }
  } catch (error) {
    if (!isAlreadyExistsError(error)) throw error
    return { created: false, path }
  }
}

export async function addBlockCitationToMarginalia(input: BlockCitationMarginaliaInput): Promise<MarginaliaActionResult> {
  const citation = formatBlockCitation({ blockId: input.blockId, paperId: input.paperId })
  const path = defaultMarginaliaPathForPaper(input.paperPath)
  const created = await createOrOpenPaperMarginalia({ ...input, initialCitation: citation })
  if (created.created) return created

  const content = await invokeNoteCommand<string>('get_note_content', { path, vaultPath: input.vaultPath })
  await invokeNoteCommand<void>('save_note_content', {
    content: appendBlockCitationToMarginalia(content, citation),
    path,
    vaultPath: input.vaultPath,
  })
  return created
}
