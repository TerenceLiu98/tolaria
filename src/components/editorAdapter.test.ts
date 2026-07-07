import { describe, expect, it, vi } from 'vitest'
import { createBlockNoteEditorAdapter } from './editorAdapter'
import type { VaultEntry } from '../types'
import type { AiSelectedTextContext } from '../utils/ai-context'

function createEditorMock() {
  const documentBlocks = [{ id: 'initial', type: 'paragraph' }]
  return {
    blocksToMarkdownLossy: vi.fn(() => 'Serialized body'),
    document: documentBlocks,
    focus: vi.fn(),
    insertInlineContent: vi.fn(),
    isEditable: true,
    replaceBlocks: vi.fn(),
    setTextCursorPosition: vi.fn(),
    tryParseMarkdownToBlocks: vi.fn(() => [{ id: 'next', type: 'paragraph' }]),
  }
}

const sourceEntry = {
  path: '/vault/paper.md',
  title: 'Paper Note',
} as VaultEntry

describe('createBlockNoteEditorAdapter', () => {
  it('reads selected text context from the configured editor container', () => {
    const container = document.createElement('div')
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Selected evidence text'
    container.append(paragraph)
    document.body.append(container)

    const selection = window.getSelection()
    selection?.removeAllRanges()
    const range = document.createRange()
    range.selectNodeContents(paragraph)
    selection?.addRange(range)

    const adapter = createBlockNoteEditorAdapter(createEditorMock() as never, {
      getSelectionContainer: () => container,
      getSourceEntry: () => sourceEntry,
    })

    expect(adapter.getSelectionContext()).toEqual({
      kind: 'text',
      entryPath: '/vault/paper.md',
      entryTitle: 'Paper Note',
      text: 'Selected evidence text',
    })

    selection?.removeAllRanges()
    container.remove()
  })

  it('reads selected attachment context from the configured attachment provider', () => {
    const selectedAttachment: AiSelectedTextContext = {
      kind: 'image',
      entryPath: '/vault/paper.md',
      entryTitle: 'Paper Note',
      path: 'attachments/figure.png',
      sourceUrl: 'asset://localhost/vault/attachments/figure.png',
    }
    const adapter = createBlockNoteEditorAdapter(createEditorMock() as never, {
      getSelectedAttachmentContext: () => selectedAttachment,
    })

    expect(adapter.getSelectedAttachmentContext()).toBe(selectedAttachment)
  })

  it('focuses a product-level block target through the editor adapter', () => {
    const editor = createEditorMock()
    const adapter = createBlockNoteEditorAdapter(editor as never)

    adapter.focusBlock('block-1')
    adapter.focusBlock('block-2', 'end')

    expect(editor.focus).toHaveBeenCalledTimes(2)
    expect(editor.setTextCursorPosition).toHaveBeenNthCalledWith(1, 'block-1', 'start')
    expect(editor.setTextCursorPosition).toHaveBeenNthCalledWith(2, 'block-2', 'end')
  })
})
