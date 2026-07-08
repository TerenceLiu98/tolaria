import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { injectDurableEditorMarkdownBlocks, preProcessDurableEditorMarkdown } from '../utils/editorDurableMarkdown'
import { HTML_BLOCK_DEFAULT_HEIGHT, HTML_BLOCK_TYPE } from '../utils/htmlBlockMarkdown'
import { schema } from './editorSchema'

describe('editor schema HTML block parsing', () => {
  it('parses explicitly rendered fenced HTML Markdown as a sandboxed HTML block', async () => {
    const editor = BlockNoteEditor.create({ schema })

    const markdown = [
      '```html render="true"',
      '<button>Click me</button>',
      '```',
    ].join('\n')
    const blocks = injectDurableEditorMarkdownBlocks(
      await editor.tryParseMarkdownToBlocks(preProcessDurableEditorMarkdown({ markdown })),
    )

    expect(blocks[0]).toMatchObject({
      type: HTML_BLOCK_TYPE,
      props: {
        height: HTML_BLOCK_DEFAULT_HEIGHT,
        html: '<button>Click me</button>\n',
      },
    })
  })

  it('keeps ordinary fenced HTML Markdown as a code block', async () => {
    const editor = BlockNoteEditor.create({ schema })

    const blocks = await editor.tryParseMarkdownToBlocks([
      '```html',
      '<button>Click me</button>',
      '```',
    ].join('\n'))

    expect(blocks[0]).toMatchObject({
      type: 'codeBlock',
      props: {
        language: 'html',
      },
    })
  })
})
