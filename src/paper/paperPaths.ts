export const PAPER_DIRECTORY = 'papers'
export const PAPER_NOTE_FILENAME = 'paper.md'
export const PAPER_SOURCE_PDF_FILENAME = 'source.pdf'
export const PAPER_BLOCKS_FILENAME = 'blocks.jsonl'
export const PAPER_ANNOTATIONS_FILENAME = 'annotations.jsonl'

export interface PaperRelativePaths {
  paperDir: string
  paperNote: string
  sourcePdf: string
  blocks: string
  annotations: string
}

export function normalizePaperSlug(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return slug.length > 0 ? slug : 'paper'
}

export function buildPaperRelativePaths(slug: string): PaperRelativePaths {
  const paperSlug = normalizePaperSlug(slug)
  const paperDir = `${PAPER_DIRECTORY}/${paperSlug}`
  return {
    paperDir,
    paperNote: `${paperDir}/${PAPER_NOTE_FILENAME}`,
    sourcePdf: `${paperDir}/${PAPER_SOURCE_PDF_FILENAME}`,
    blocks: `${paperDir}/${PAPER_BLOCKS_FILENAME}`,
    annotations: `${paperDir}/${PAPER_ANNOTATIONS_FILENAME}`,
  }
}

export function isPaperNotePath(path: string): boolean {
  return /(^|[/\\])papers[/\\][^/\\]+[/\\]paper\.md$/u.test(path)
}
