import type { useCreateBlockNote } from '@blocknote/react'
import type { AiSelectedTextContext } from '../utils/ai-context'
import type { VaultEntry } from '../types'
import { selectedTextContextFromSelection } from './editorSelectedContext'

export interface SapientiaEditorAdapter {
  focus: () => void
  focusBlock: (blockId: string, placement?: 'start' | 'end') => void
  getMarkdown: () => string
  getSelectedAttachmentContext: () => AiSelectedTextContext | null
  getSelectionContext: () => AiSelectedTextContext | null
  insertMarkdown: (markdown: string) => void
  insertPlainText: (text: string) => void
  insertWikilink: (target: string) => void
  loadMarkdown: (path: string | null, markdown: string) => void
  replaceDocument: (markdown: string) => void
  setEditable: (editable: boolean) => void
}

type BlockNoteEditor = ReturnType<typeof useCreateBlockNote>

export interface BlockNoteEditorAdapterOptions {
  getSelectedAttachmentContext?: () => AiSelectedTextContext | null
  getSelectionContainer?: () => HTMLElement | null
  getSourceEntry?: () => VaultEntry | null | undefined
}

function replaceBlockNoteDocument(editor: BlockNoteEditor, markdown: string): void {
  const parsedBlocks = editor.tryParseMarkdownToBlocks(markdown)
  void Promise.resolve(parsedBlocks).then((blocks) => {
    editor.replaceBlocks(editor.document, blocks)
  })
}

export function createBlockNoteEditorAdapter(
  editor: BlockNoteEditor,
  options: BlockNoteEditorAdapterOptions = {},
): SapientiaEditorAdapter {
  return {
    focus() {
      editor.focus()
    },
    focusBlock(blockId, placement = 'start') {
      editor.focus()
      editor.setTextCursorPosition?.(blockId, placement)
    },
    getMarkdown() {
      return editor.blocksToMarkdownLossy(editor.document)
    },
    getSelectedAttachmentContext() {
      return options.getSelectedAttachmentContext?.() ?? null
    },
    getSelectionContext() {
      const sourceEntry = options.getSourceEntry?.()
      if (!sourceEntry) return null

      return selectedTextContextFromSelection({
        container: options.getSelectionContainer?.() ?? null,
        selection: window.getSelection(),
        sourceEntry,
      })
    },
    insertMarkdown(markdown) {
      editor.insertInlineContent(markdown, { updateSelection: true })
    },
    insertPlainText(text) {
      editor.insertInlineContent(text, { updateSelection: true })
    },
    insertWikilink(target) {
      editor.insertInlineContent(`[[${target}]]`, { updateSelection: true })
    },
    loadMarkdown(_path, markdown) {
      replaceBlockNoteDocument(editor, markdown)
    },
    replaceDocument(markdown) {
      replaceBlockNoteDocument(editor, markdown)
    },
    setEditable(editable) {
      editor.isEditable = editable
    },
  }
}
