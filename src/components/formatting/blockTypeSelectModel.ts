import { getTolariaBlockTypeSelectItems } from '../tolariaEditorFormattingConfig'
import { FORMATTING_TOOLBAR_FILE_BLOCK_TYPES } from './mediaToolbarModel'
import type { TolariaSelectedBlock } from './toolbarBlocks'

export type TolariaBlockTypeSelectItem = ReturnType<
  typeof getTolariaBlockTypeSelectItems
>[number]

export function blockTypeSelectPropSchema(item: TolariaBlockTypeSelectItem): Record<string, 'string' | 'number' | 'boolean'> {
  return Object.fromEntries(
    Object.entries(item.props || {}).map(([propName, propValue]) => [
      propName,
      typeof propValue,
    ]),
  ) as Record<string, 'string' | 'number' | 'boolean'>
}

export function blockTypeSelectItemMatchesBlock(
  item: TolariaBlockTypeSelectItem,
  firstSelectedBlock: TolariaSelectedBlock,
) {
  if (item.type !== firstSelectedBlock.type) return false

  return Object.entries(item.props || {}).every(
    ([propName, propValue]) =>
      propValue === Reflect.get(firstSelectedBlock.props, propName),
  )
}

export function formattingToolbarBridgeBlockIdFromBlock(selectedBlock: TolariaSelectedBlock | null): string | null {
  if (!selectedBlock) return null

  return FORMATTING_TOOLBAR_FILE_BLOCK_TYPES.has(selectedBlock.type)
    ? selectedBlock.id
    : null
}

export function blockTypeUpdatePatch(item: TolariaBlockTypeSelectItem) {
  return {
    props: item.props,
    type: item.type,
  }
}
