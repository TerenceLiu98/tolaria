const TOLARIA_BLOCK_ANCHOR_LINE_PATTERN = /^<!--\s*tolaria:block\s+.+?\s*-->\s*$/u

export function isTolariaHiddenMarkdownLine(line: string): boolean {
  return TOLARIA_BLOCK_ANCHOR_LINE_PATTERN.test(line.trim())
}

export function stripTolariaHiddenMarkdown(content: string): string {
  return content
    .replace(/\r\n/gu, '\n')
    .split('\n')
    .filter((line) => !isTolariaHiddenMarkdownLine(line))
    .join('\n')
}
