import { describe, expect, it } from 'vitest'
import {
  TOLARIA_BLOCK_CLIPBOARD_MIME,
  blocksWithoutIds,
  parseClipboardBlocks,
  writeSelectedBlocksToClipboard,
} from './richEditorBlockSelectionClipboard'
import type { ClipboardDataLike, RichEditorBlockSelectionEditor } from './richEditorBlockSelectionTypes'

class TestClipboardData implements ClipboardDataLike {
  private readonly data = new Map<string, string>()

  clearData() {
    this.data.clear()
  }

  getData(type: string) {
    return this.data.get(type) ?? ''
  }

  setData(type: string, value: string) {
    this.data.set(type, value)
  }
}

function parserEditor(): RichEditorBlockSelectionEditor {
  return {
    tryParseHTMLToBlocks: () => [{ id: 'html', type: 'paragraph' }],
    tryParseMarkdownToBlocks: () => [{ id: 'markdown', type: 'paragraph' }],
  }
}

function markdownTextParserEditor(): RichEditorBlockSelectionEditor {
  return {
    tryParseMarkdownToBlocks: (markdown: string) => [{
      type: 'paragraph',
      content: [{ type: 'text', text: markdown, styles: {} }],
      children: [],
    }],
  }
}

function clipboardWithBlockNoteHTML(tolariaData: string): TestClipboardData {
  const clipboardData = new TestClipboardData()
  clipboardData.setData(TOLARIA_BLOCK_CLIPBOARD_MIME, tolariaData)
  clipboardData.setData('blocknote/html', '<p>HTML</p>')
  return clipboardData
}

describe('rich editor block-selection clipboard helpers', () => {
  it('writes Tolaria JSON, rich HTML, external HTML, and markdown formats', () => {
    const clipboardData = new TestClipboardData()
    const editor: RichEditorBlockSelectionEditor = {
      document: [
        { id: 'one', content: 'One', type: 'paragraph' },
        { id: 'two', content: 'Two', type: 'paragraph' },
      ],
      blocksToFullHTML: () => '<div data-content-type="paragraph">Two</div>',
      blocksToHTMLLossy: () => '<p>Two</p>',
      blocksToMarkdownLossy: () => 'Two',
    }

    expect(writeSelectedBlocksToClipboard(editor, clipboardData, ['two'])).toBe(true)
    expect(clipboardData.getData(TOLARIA_BLOCK_CLIPBOARD_MIME)).toContain('"id":"two"')
    expect(clipboardData.getData('blocknote/html')).toContain('data-content-type')
    expect(clipboardData.getData('text/html')).toBe('<p>Two</p>')
    expect(clipboardData.getData('text/plain')).toBe('Two')
  })

  it('parses Tolaria blocks before falling back to HTML or markdown', () => {
    const clipboardData = clipboardWithBlockNoteHTML(JSON.stringify([{ id: 'tolaria', type: 'paragraph' }]))

    expect(parseClipboardBlocks(parserEditor(), clipboardData)).toEqual([{ id: 'tolaria', type: 'paragraph' }])
  })

  it('falls back from invalid Tolaria data to BlockNote HTML', () => {
    const clipboardData = clipboardWithBlockNoteHTML('{')

    expect(parseClipboardBlocks(parserEditor(), clipboardData)).toEqual([{ id: 'html', type: 'paragraph' }])
  })

  it('normalizes pasted inline math Markdown into math inline content', () => {
    const clipboardData = new TestClipboardData()
    clipboardData.setData('text/markdown', String.raw`Ratio is $\frac{a}{b}$.`)

    expect(parseClipboardBlocks(markdownTextParserEditor(), clipboardData)).toEqual([{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Ratio is ', styles: {} },
        { type: 'mathInline', props: { latex: '\\frac{a}{b}' }, content: undefined },
        { type: 'text', text: '.', styles: {} },
      ],
      children: [],
    }])
  })

  it('normalizes pasted math sentinel tokens into math inline content', () => {
    const clipboardData = new TestClipboardData()
    clipboardData.setData('text/plain', 'Inline @@TOLARIA_MATH_INLINE:%5Cfrac%7Ba%7D%7Bb%7D@@ token')

    expect(parseClipboardBlocks(markdownTextParserEditor(), clipboardData)).toEqual([{
      type: 'paragraph',
      content: [
        { type: 'text', text: 'Inline ', styles: {} },
        { type: 'mathInline', props: { latex: '\\frac{a}{b}' }, content: undefined },
        { type: 'text', text: ' token', styles: {} },
      ],
      children: [],
    }])
  })

  it('strips ids from pasted blocks recursively', () => {
    expect(blocksWithoutIds([
      {
        id: 'parent',
        type: 'bulletListItem',
        children: [{ id: 'child', type: 'bulletListItem' }],
      },
    ])).toEqual([
      {
        type: 'bulletListItem',
        children: [{ type: 'bulletListItem' }],
      },
    ])
  })
})
