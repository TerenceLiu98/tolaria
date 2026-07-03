import { describe, expect, it } from 'vitest'
import { isTolariaHiddenMarkdownLine, stripTolariaHiddenMarkdown } from './tolariaHiddenMarkdown'

describe('tolariaHiddenMarkdown', () => {
  it('strips hidden Paper block anchors without touching ordinary comments', () => {
    const content = [
      '# Paper',
      '<!-- tolaria:block id="b0001" page="1" kind="paragraph" hash="sha256:a" -->',
      'Readable text.',
      '<!-- user-visible markdown comment -->',
    ].join('\n')

    expect(stripTolariaHiddenMarkdown(content)).toBe([
      '# Paper',
      'Readable text.',
      '<!-- user-visible markdown comment -->',
    ].join('\n'))
  })

  it('recognizes hidden anchor lines with surrounding whitespace', () => {
    expect(isTolariaHiddenMarkdownLine('  <!-- tolaria:block id="b0001" page="1" kind="heading" hash="sha256:a" -->  ')).toBe(true)
    expect(isTolariaHiddenMarkdownLine('<!-- regular comment -->')).toBe(false)
  })
})
