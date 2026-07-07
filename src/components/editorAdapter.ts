import type { useCreateBlockNote } from '@blocknote/react'
import type { AiSelectedTextContext } from '../utils/ai-context'

export interface SapientiaEditorAdapter {
  focus: () => void
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

function replaceBlockNoteDocument(editor: BlockNoteEditor, markdown: string): void {
  const parsedBlocks = editor.tryParseMarkdownToBlocks(markdown)
  void Promise.resolve(parsedBlocks).then((blocks) => {
    editor.replaceBlocks(editor.document, blocks)
  })
}

export function createBlockNoteEditorAdapter(editor: BlockNoteEditor): SapientiaEditorAdapter {
  return {
    focus() {
      editor.focus()
    },
    getMarkdown() {
      return editor.blocksToMarkdownLossy(editor.document)
    },
    getSelectedAttachmentContext() {
      return null
    },
    getSelectionContext() {
      return null
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
