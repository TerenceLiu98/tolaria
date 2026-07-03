import type { SourceBlock } from './sourceBlocks'
import { stripTolariaHiddenMarkdown } from '../utils/tolariaHiddenMarkdown'

export interface PaperMarkdownBlockAnchor {
  hash: string
  id: string
  kind: string
  page: number
}

export interface PaperMarkdownSection {
  anchor: PaperMarkdownBlockAnchor
  markdown: string
}

export interface PaperMarkdownConsistencyIssue {
  blockId: string
  kind: 'anchor_missing_block' | 'block_missing_anchor' | 'metadata_mismatch'
  message: string
}

const ANCHOR_LINE_PATTERN = /^<!--\s*tolaria:block\s+(.+?)\s*-->\s*$/u
const ANCHOR_ATTRIBUTE_PATTERN = /([a-z_]+)="([^"]*)"/gu
const BLOCK_MATH_TOKEN_PATTERN = /@@TOLARIA_MATH_BLOCK:([^@]+)@@/gu
const INLINE_MATH_TOKEN_PATTERN = /@@TOLARIA_MATH_INLINE:([^@]+)@@/gu

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/"/gu, '&quot;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
}

function normalizedBlockKind(block: SourceBlock): string {
  const kind = block.kind.trim().toLowerCase()
  if (kind === 'title') return 'title'
  if (kind === 'heading' || kind === 'header') return 'heading'
  if (kind === 'figure' || kind === 'image') return 'figure'
  if (kind === 'table') return 'table'
  if (kind === 'equation' || kind === 'formula' || kind === 'interline_equation' || kind === 'inline_equation') {
    return 'equation'
  }
  if (kind === 'caption' || kind === 'image_caption' || kind === 'table_caption') return 'caption'
  return 'paragraph'
}

function blockText(block: SourceBlock): string {
  const text = typeof block.text === 'string' && block.text.trim().length > 0
    ? block.text.trim()
    : typeof block.caption === 'string' && block.caption.trim().length > 0
      ? block.caption.trim()
      : block.kind
  return text
}

function decodeMathTokenPayload(encoded: string): string {
  try {
    return decodeURIComponent(encoded)
  } catch {
    return encoded
  }
}

function isLeakedMathSentinelLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === '@@'
    || trimmed === '@@TOLARIA_MATH_BLOCK:'
    || trimmed === '@@TOLARIA_MATH_INLINE:'
    || trimmed === 'TOLARIA_MATH_BLOCK:'
    || trimmed === 'TOLARIA_MATH_INLINE:'
}

function stripMathDelimiters(text: string): string {
  const trimmed = text.trim()
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$')) {
    return trimmed.slice(2, -2).trim()
  }
  if (trimmed.startsWith('\\[') && trimmed.endsWith('\\]')) {
    return trimmed.slice(2, -2).trim()
  }
  return trimmed
}

function polishLatex(text: string): string {
  return text
    .replace(/ _ /gu, '_')
    .replace(/ \^ /gu, '^')
    .replace(/\\(text|mathrm|mathbf)\s+\{/gu, '\\$1{')
    .replace(/\{\s+/gu, '{')
    .replace(/\s+\}/gu, '}')
}

function lastNonEmptyLine(lines: readonly string[]): string | null {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]
    if (line.trim().length > 0) return line
  }
  return null
}

function normalizePaperMathText(text: string): string {
  const trimmed = text.trim()
  const blockToken = trimmed.match(/^@@TOLARIA_MATH_BLOCK:([^@]+)@@$/u)
  const inlineToken = trimmed.match(/^@@TOLARIA_MATH_INLINE:([^@]+)@@$/u)
  const tokenPayload = blockToken?.[1] ?? inlineToken?.[1]
  if (tokenPayload !== undefined) {
    return polishLatex(stripMathDelimiters(decodeMathTokenPayload(tokenPayload)))
  }

  return polishLatex(stripMathDelimiters(
    trimmed
      .split('\n')
      .filter((line) => !isLeakedMathSentinelLine(line))
      .join('\n'),
  ))
}

export function normalizeLeakedPaperMathSentinels(content: string): string {
  const expandedTokens = content
    .replace(BLOCK_MATH_TOKEN_PATTERN, (_match, encoded: string) => `$$\n${decodeMathTokenPayload(encoded)}\n$$`)
    .replace(INLINE_MATH_TOKEN_PATTERN, (_match, encoded: string) => `$${decodeMathTokenPayload(encoded)}$`)

  const normalizedLines: string[] = []
  let openedLeakedDisplayMath = false
  for (const line of expandedTokens.split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '@@') {
      const previousContentLine = lastNonEmptyLine(normalizedLines)
      if (previousContentLine?.trim() !== '$$') {
        normalizedLines.push('$$')
        openedLeakedDisplayMath = true
      }
      continue
    }
    if (
      trimmed === '@@TOLARIA_MATH_BLOCK:'
      || trimmed === 'TOLARIA_MATH_BLOCK:'
    ) {
      if (openedLeakedDisplayMath) {
        normalizedLines.push('$$')
        openedLeakedDisplayMath = false
      }
      continue
    }
    if (
      trimmed === '@@TOLARIA_MATH_INLINE:'
      || trimmed === 'TOLARIA_MATH_INLINE:'
    ) {
      continue
    }
    normalizedLines.push(line)
  }
  return normalizedLines.join('\n')
}

export function formatPaperBlockAnchor(block: SourceBlock): string {
  return `<!-- tolaria:block id="${escapeHtmlAttribute(block.id)}" page="${block.page}" kind="${escapeHtmlAttribute(block.kind)}" hash="${escapeHtmlAttribute(block.hash)}" -->`
}

function sourceBlockMarkdown(block: SourceBlock): string {
  const kind = normalizedBlockKind(block)
  const text = blockText(block)
  if (kind === 'title') return `# ${text}`
  if (kind === 'heading') return `## ${text}`
  if (kind === 'equation') return `$$\n${normalizePaperMathText(text)}\n$$`
  if (kind === 'caption') return `*${text}*`
  if (kind === 'figure') {
    const caption = typeof block.caption === 'string' ? block.caption.trim() : ''
    if (typeof block.asset_path === 'string' && block.asset_path.trim().length > 0) {
      const alt = caption || text || 'Figure'
      const image = `![${alt.replace(/\[/gu, '\\[').replace(/\]/gu, '\\]')}](${block.asset_path.trim()})`
      return caption ? `${image}\n\n*${caption}*` : image
    }
    return caption.length > 0 && caption !== text ? `${text}\n\n*${caption}*` : text
  }
  if (kind === 'table' && typeof block.caption === 'string') {
    const caption = block.caption.trim()
    return caption.length > 0 && caption !== text ? `${text}\n\n*${caption}*` : text
  }
  return text
}

export function paperMarkdownFromSourceBlocks(blocks: readonly SourceBlock[]): string {
  return blocks
    .map((block) => `${formatPaperBlockAnchor(block)}\n${sourceBlockMarkdown(block).trim()}`)
    .join('\n\n') + (blocks.length > 0 ? '\n' : '')
}

export function stripPaperBlockAnchors(content: string): string {
  return normalizeLeakedPaperMathSentinels(stripTolariaHiddenMarkdown(content))
}

function stripFrontmatter(content: string): string {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) return normalized
  const closeIndex = normalized.slice(4).search(/\n---(?:\n|$)/u)
  if (closeIndex < 0) return normalized
  const bodyStart = 4 + closeIndex + 4
  return normalized.slice(bodyStart)
}

function parseAnchor(line: string): PaperMarkdownBlockAnchor | null {
  const match = line.match(ANCHOR_LINE_PATTERN)
  if (!match) return null

  const attributes = new Map<string, string>()
  for (const attributeMatch of match[1].matchAll(ANCHOR_ATTRIBUTE_PATTERN)) {
    attributes.set(attributeMatch[1], attributeMatch[2])
  }
  const id = attributes.get('id')?.trim()
  const kind = attributes.get('kind')?.trim()
  const hash = attributes.get('hash')?.trim()
  const page = Number(attributes.get('page'))
  if (!id || !kind || !hash || !Number.isInteger(page) || page <= 0) return null

  return { hash, id, kind, page }
}

export function parsePaperMarkdownSections(content: string): PaperMarkdownSection[] {
  const sections: PaperMarkdownSection[] = []
  let currentAnchor: PaperMarkdownBlockAnchor | null = null
  let currentLines: string[] = []

  const flush = () => {
    if (!currentAnchor) return
    sections.push({
      anchor: currentAnchor,
      markdown: currentLines.join('\n').trim(),
    })
    currentLines = []
  }

  for (const line of stripFrontmatter(content).split('\n')) {
    const anchor = parseAnchor(line)
    if (anchor) {
      flush()
      currentAnchor = anchor
      continue
    }
    if (currentAnchor) currentLines.push(line)
  }
  flush()

  return sections.filter((section) => section.markdown.length > 0)
}

export function validatePaperMarkdownAnchors(
  sections: readonly PaperMarkdownSection[],
  blocks: readonly SourceBlock[],
): PaperMarkdownConsistencyIssue[] {
  const issues: PaperMarkdownConsistencyIssue[] = []
  const sectionsById = new Map(sections.map((section) => [section.anchor.id, section]))
  const blocksById = new Map(blocks.map((block) => [block.id, block]))

  for (const section of sections) {
    const block = blocksById.get(section.anchor.id)
    if (!block) {
      issues.push({
        blockId: section.anchor.id,
        kind: 'anchor_missing_block',
        message: `paper.md anchor ${section.anchor.id} does not exist in blocks.jsonl`,
      })
      continue
    }
    if (block.page !== section.anchor.page || block.kind !== section.anchor.kind || block.hash !== section.anchor.hash) {
      issues.push({
        blockId: section.anchor.id,
        kind: 'metadata_mismatch',
        message: `paper.md anchor ${section.anchor.id} metadata does not match blocks.jsonl`,
      })
    }
  }

  for (const block of blocks) {
    if (!sectionsById.has(block.id)) {
      issues.push({
        blockId: block.id,
        kind: 'block_missing_anchor',
        message: `blocks.jsonl block ${block.id} does not have a paper.md anchor`,
      })
    }
  }

  return issues
}
