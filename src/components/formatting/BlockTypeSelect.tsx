import { useMemo, type ReactElement } from 'react'
import {
  useBlockNoteEditor,
  useEditorState,
} from '@blocknote/react'
import {
  editorHasBlockWithType,
  type BlockNoteEditor,
  type BlockSchema,
  type InlineContentSchema,
  type StyleSchema,
} from '@blocknote/core'
import {
  Button as MantineButton,
  CheckIcon as MantineCheckIcon,
  Menu as MantineMenu,
} from '@mantine/core'
import { CaretDown as ChevronDown } from '@phosphor-icons/react'
import { getTolariaBlockTypeSelectItems } from '../tolariaEditorFormattingConfig'
import { translate, type AppLocale } from '../../lib/i18n'
import {
  isStaleBlockReferenceError,
  reportRecoveredEditorTransformError,
} from '../richEditorTransformErrorRecoveryExtension'
import {
  blockTypeSelectItemMatchesBlock,
  blockTypeSelectPropSchema,
  blockTypeUpdatePatch,
  type TolariaBlockTypeSelectItem,
} from './blockTypeSelectModel'
import {
  getSelectedBlocksSafely,
  type TolariaSelectedBlock,
} from './toolbarBlocks'

type TolariaBlockTypeSelectOption = TolariaBlockTypeSelectItem & {
  iconElement: ReactElement
  isSelected: boolean
  label: string
}

function getBlockTypeItemIconElement(item: TolariaBlockTypeSelectItem) {
  const Icon = item.icon
  return <Icon size={16} />
}

function getTolariaBlockTypeSelectOptions(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  firstSelectedBlock: TolariaSelectedBlock,
  locale: AppLocale,
) {
  return getTolariaBlockTypeSelectItems()
    .filter((item) =>
      editorHasBlockWithType(
        editor,
        item.type,
        blockTypeSelectPropSchema(item),
      ),
    )
    .map((item) => ({
      ...item,
      iconElement: getBlockTypeItemIconElement(item),
      isSelected: blockTypeSelectItemMatchesBlock(item, firstSelectedBlock),
      label: translate(locale, item.labelKey),
    }))
}

function reportStaleFormattingToolbarBlockReference(error: unknown) {
  reportRecoveredEditorTransformError('stale_block_reference', error)
}

function liveSelectedBlock(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  block: TolariaSelectedBlock,
) {
  try {
    return editor.getBlock(block.id) as TolariaSelectedBlock | undefined
  } catch (error) {
    if (isStaleBlockReferenceError(error)) {
      reportStaleFormattingToolbarBlockReference(error)
      return undefined
    }
    throw error
  }
}

function liveSelectedBlocks(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  selectedBlocks: TolariaSelectedBlock[],
) {
  const liveBlocks: TolariaSelectedBlock[] = []

  for (const block of selectedBlocks) {
    const liveBlock = liveSelectedBlock(editor, block)
    if (!liveBlock) return []
    liveBlocks.push(liveBlock)
  }

  return liveBlocks
}

function updateSelectedBlocksToType(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  selectedBlocks: TolariaSelectedBlock[],
  item: TolariaBlockTypeSelectItem,
) {
  const blocks = liveSelectedBlocks(editor, selectedBlocks)
  if (!blocks.length) return

  try {
    editor.focus()
    editor.transact(() => {
      const patch = blockTypeUpdatePatch(item)
      for (const block of blocks) {
        editor.updateBlock(block.id, {
          type: patch.type as never,
          props: patch.props as never,
        })
      }
    })
  } catch (error) {
    if (isStaleBlockReferenceError(error)) {
      reportStaleFormattingToolbarBlockReference(error)
      return
    }
    throw error
  }
}

export function TolariaBlockTypeSelect({ locale = 'en' }: { locale?: AppLocale }) {
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedBlocks = useEditorState({
    editor,
    selector: ({ editor }): TolariaSelectedBlock[] => getSelectedBlocksSafely(editor),
  })
  const firstSelectedBlock = selectedBlocks[0] ?? null
  const selectItems = useMemo(
    () => (
      firstSelectedBlock
        ? getTolariaBlockTypeSelectOptions(editor, firstSelectedBlock, locale)
        : []
    ),
    [editor, firstSelectedBlock, locale],
  )
  const selectedItem = selectItems.find(
    (item): item is TolariaBlockTypeSelectOption => item.isSelected,
  )

  if (!selectedItem || !editor.isEditable) return null

  return (
    <MantineMenu
      withinPortal={false}
      transitionProps={{ exitDuration: 0 }}
      middlewares={{ flip: true, shift: true, inline: false, size: true }}
    >
      <MantineMenu.Target>
        <MantineButton
          onMouseDown={(event) => {
            event.preventDefault()
            event.currentTarget.focus()
          }}
          leftSection={selectedItem.iconElement}
          rightSection={<ChevronDown size={16} />}
          size="xs"
          variant="subtle"
        >
          {selectedItem.label}
        </MantineButton>
      </MantineMenu.Target>
      <MantineMenu.Dropdown className="bn-select">
        {selectItems.map((item) => (
          <MantineMenu.Item
            key={item.labelKey}
            onClick={() => {
              updateSelectedBlocksToType(editor, selectedBlocks, item)
            }}
            leftSection={item.iconElement}
            rightSection={item.isSelected
              ? <MantineCheckIcon size={10} className="bn-tick-icon" />
              : <div className="bn-tick-space" />}
          >
            {item.label}
          </MantineMenu.Item>
        ))}
      </MantineMenu.Dropdown>
    </MantineMenu>
  )
}
