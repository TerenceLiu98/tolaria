import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import { formattingToolbarBridgeBlockIdFromBlock } from './blockTypeSelectModel'
import { getSelectedBlocksSafely } from './toolbarBlocks'

export function getFormattingToolbarBridgeBlockId(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const selectedBlock = getSelectedBlocksSafely(editor).at(0)
  return formattingToolbarBridgeBlockIdFromBlock(selectedBlock ?? null)
}
