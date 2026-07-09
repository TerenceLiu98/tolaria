import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'

export function selectedEditorText(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null

  const range = selection.getRangeAt(0)
  const editorElement = editor.domElement
  if (!editorElement || !editorElement.contains(range.commonAncestorContainer)) return null

  const text = selection.toString().trim()
  return text.length > 0 ? text : null
}

export function selectedEditorBlockId(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
): string | null {
  const selectedBlock = editor.getSelection()?.blocks[0] ?? editor.getTextCursorPosition()?.block
  return typeof selectedBlock?.id === 'string' && selectedBlock.id.length > 0 ? selectedBlock.id : null
}
