import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'

export type TolariaSelectedBlock = ReturnType<
  BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>['getTextCursorPosition']
>['block']

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isTolariaSelectedBlock(value: unknown): value is TolariaSelectedBlock {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.type === 'string'
    && isRecord(value.props)
}

export function tolariaSelectedBlocks(value: unknown): TolariaSelectedBlock[] {
  return Array.isArray(value) ? value.filter(isTolariaSelectedBlock) : []
}

export function getSelectedBlocksSafely(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
): TolariaSelectedBlock[] {
  try {
    const selectionBlocks = tolariaSelectedBlocks(editor.getSelection()?.blocks)
    if (selectionBlocks.length) return selectionBlocks
  } catch {
    // BlockNote can briefly expose an invalid selection while inline actions remount blocks.
  }

  try {
    const block = editor.getTextCursorPosition().block
    return isTolariaSelectedBlock(block) ? [block] : []
  } catch {
    return []
  }
}

export function getCursorBlockSafely(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
): TolariaSelectedBlock | null {
  try {
    const block = editor.getTextCursorPosition().block
    return isTolariaSelectedBlock(block) ? block : null
  } catch {
    return null
  }
}
