import { describe, expect, it } from 'vitest'
import {
  blockTypeSelectItemMatchesBlock,
  blockTypeSelectPropSchema,
  blockTypeUpdatePatch,
  formattingToolbarBridgeBlockIdFromBlock,
  type TolariaBlockTypeSelectItem,
} from './blockTypeSelectModel'
import type { TolariaSelectedBlock } from './toolbarBlocks'

function item(overrides: Partial<TolariaBlockTypeSelectItem> = {}): TolariaBlockTypeSelectItem {
  return {
    icon: () => null,
    labelKey: 'editor.blockType.heading1',
    props: { level: 1 },
    type: 'heading',
    ...overrides,
  } as TolariaBlockTypeSelectItem
}

function block(overrides: Partial<TolariaSelectedBlock> = {}): TolariaSelectedBlock {
  return {
    id: 'block-1',
    props: { level: 1 },
    type: 'heading',
    ...overrides,
  } as TolariaSelectedBlock
}

describe('blockTypeSelectModel', () => {
  it('builds the BlockNote prop schema required for block type availability checks', () => {
    expect(blockTypeSelectPropSchema(item({
      props: {
        checked: true,
        level: 2,
        textAlignment: 'left',
      },
    }))).toEqual({
      checked: 'boolean',
      level: 'number',
      textAlignment: 'string',
    })
  })

  it('matches a selected block by type and configured props', () => {
    expect(blockTypeSelectItemMatchesBlock(item(), block())).toBe(true)
    expect(blockTypeSelectItemMatchesBlock(item({ props: { level: 2 } }), block())).toBe(false)
    expect(blockTypeSelectItemMatchesBlock(item({ type: 'paragraph' }), block())).toBe(false)
    expect(blockTypeSelectItemMatchesBlock(item({ props: undefined }), block({ type: 'heading' }))).toBe(true)
  })

  it('derives bridge ids only for selected media/file blocks', () => {
    expect(formattingToolbarBridgeBlockIdFromBlock(null)).toBeNull()
    expect(formattingToolbarBridgeBlockIdFromBlock(block({ type: 'paragraph' }))).toBeNull()
    expect(formattingToolbarBridgeBlockIdFromBlock(block({ id: 'image-1', type: 'image' }))).toBe('image-1')
  })

  it('builds the block update patch applied by the toolbar menu', () => {
    expect(blockTypeUpdatePatch(item({ props: { checked: false }, type: 'checkListItem' }))).toEqual({
      props: { checked: false },
      type: 'checkListItem',
    })
  })
})
