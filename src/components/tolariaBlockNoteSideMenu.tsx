import {
  CaretDown,
  CaretRight,
  DotsSixVertical as GripVertical,
  Plus,
} from '@phosphor-icons/react'
import { SideMenuExtension, SuggestionMenu } from '@blocknote/core/extensions'
import type {
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import {
  DragHandleMenu,
  SideMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtension,
  useExtensionState,
  type SideMenuProps,
} from '@blocknote/react'
import { translate, type AppLocale } from '../lib/i18n'
import {
  useCallback,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import {
  captureEditorScrollForControl,
  editorElementFromControl,
  scheduleEditorScrollRestore,
  type EditorScrollSnapshot,
} from './editorScrollPreservation'
import { usePointerBlockReorder } from './tolariaBlockReorder'
import {
  tableHeaderContent,
  tableHeaderEnabled,
  toggledTableHeaderContent,
  type TableHeaderAxis,
} from './tableHeaderModel'
import { useSideMenuTextAlignment } from './tolariaSideMenuAlignment'
import {
  blockHeadingLevel,
  isCollapsibleSectionBlockForEditor,
  toggleCollapsedHeading,
  useCollapsedHeadingIds,
  useCollapsedHeadingRendering,
  type CollapsibleBlock,
} from './tolariaCollapsedSections'
import {
  liveSideMenuBlock,
  runSideMenuAction,
  type SideMenuBlock,
} from './tolariaSideMenuBlocks'

type TolariaSideMenuProps = SideMenuProps & {
  locale?: AppLocale
}

function isInlineBlockEmpty(block: { content?: unknown }) {
  return Array.isArray(block.content) && block.content.length === 0
}

function useSideMenuBlock() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state): SideMenuBlock | undefined => state?.block
      ? {
          children: state.block.children as CollapsibleBlock[] | undefined,
          content: state.block.content,
          id: state.block.id,
          props: state.block.props as Record<string, unknown> | undefined,
          type: state.block.type,
        }
      : undefined,
  })

  return { block, editor }
}

function stopSideMenuClick(event: ReactMouseEvent<Element>) {
  event.preventDefault()
  event.stopPropagation()
}

function runSideMenuActionPreservingScroll(
  action: () => void,
  snapshot: EditorScrollSnapshot | null,
) {
  runSideMenuAction(() => {
    action()
    scheduleEditorScrollRestore(snapshot)
  })
}

function TolariaAddBlockButton() {
  const Components = useComponentsContext()!
  const dict = useDictionary()
  const suggestionMenu = useExtension(SuggestionMenu)
  const { block, editor } = useSideMenuBlock()

  const addBlock = useCallback((snapshot: EditorScrollSnapshot | null) => {
    runSideMenuActionPreservingScroll(() => {
      const liveBlock = liveSideMenuBlock(editor, block)
      if (!liveBlock) return

      if (isInlineBlockEmpty(liveBlock)) {
        editor.setTextCursorPosition(liveBlock.id)
        suggestionMenu.openSuggestionMenu('/')
        return
      }

      const insertedBlock = editor.insertBlocks([{ type: 'paragraph' }], liveBlock.id, 'after')[0]
      if (!insertedBlock) return
      editor.setTextCursorPosition(insertedBlock.id)
      suggestionMenu.openSuggestionMenu('/')
    }, snapshot)
  }, [block, editor, suggestionMenu])
  const onButtonClick = useCallback((event: ReactMouseEvent<Element>) => {
    stopSideMenuClick(event)
    addBlock(captureEditorScrollForControl(event.currentTarget))
  }, [addBlock])

  if (!block) return null

  return (
    <Components.SideMenu.Button
      className="bn-button"
      label={dict.side_menu.add_block_label}
      onClick={onButtonClick}
      icon={<Plus size={20} data-test="dragHandleAdd" />}
    />
  )
}

function headingCollapseButtonLabel(locale: AppLocale, isHeading: boolean, isCollapsed: boolean) {
  if (isHeading) return sectionCollapseButtonLabel(locale, isCollapsed)
  return itemCollapseButtonLabel(locale, isCollapsed)
}

function sectionCollapseButtonLabel(locale: AppLocale, isCollapsed: boolean) {
  return translate(locale, isCollapsed ? 'editor.sideMenu.expandSection' : 'editor.sideMenu.collapseSection')
}

function itemCollapseButtonLabel(locale: AppLocale, isCollapsed: boolean) {
  return translate(locale, isCollapsed ? 'editor.sideMenu.expandItem' : 'editor.sideMenu.collapseItem')
}

function TolariaHeadingCollapseButton({ locale }: { locale: AppLocale }) {
  const Components = useComponentsContext()!
  const { block, editor } = useSideMenuBlock()
  const collapsedHeadingIds = useCollapsedHeadingIds(editor)
  const isCollapsed = Boolean(block?.id && collapsedHeadingIds.has(block.id))
  const isHeading = blockHeadingLevel(block) !== null
  const isCollapsible = isCollapsibleSectionBlockForEditor(editor, block)
  const Icon = isCollapsed ? CaretRight : CaretDown
  const label = headingCollapseButtonLabel(locale, isHeading, isCollapsed)

  const toggleHeading = useCallback((editorElement?: HTMLElement) => {
    runSideMenuAction(() => {
      const liveBlock = liveSideMenuBlock(editor, block)
      if (!liveBlock) return
      if (!isCollapsibleSectionBlockForEditor(editor, liveBlock as CollapsibleBlock | undefined)) return
      toggleCollapsedHeading(editor, liveBlock.id, editorElement)
    })
  }, [block, editor])
  const onButtonClick = useCallback((event: ReactMouseEvent<Element>) => {
    stopSideMenuClick(event)
    toggleHeading(editorElementFromControl(event.currentTarget))
  }, [toggleHeading])

  if (!isCollapsible) return null

  return (
    <Components.SideMenu.Button
      className="bn-button"
      label={label}
      onClick={onButtonClick}
      icon={<Icon size={20} onClick={onButtonClick} data-test="headingCollapseToggle" />}
    />
  )
}

function TolariaSectionControlButton({ locale }: { locale: AppLocale }) {
  const { block, editor } = useSideMenuBlock()
  if (isCollapsibleSectionBlockForEditor(editor, block)) return <TolariaHeadingCollapseButton locale={locale} />

  return <TolariaAddBlockButton />
}

function TolariaDragHandleButton({
  children,
  dragHandleMenu,
}: SideMenuProps & { children?: ReactNode }) {
  const Components = useComponentsContext()!
  const dict = useDictionary()
  const sideMenu = useExtension(SideMenuExtension)
  const { block, editor } = useSideMenuBlock()
  const MenuComponent: ComponentType<{ children?: ReactNode }> = dragHandleMenu ?? DragHandleMenu
  const { onClickCapture, onPointerDown } = usePointerBlockReorder(editor, block)

  if (!block) return null

  return (
    <Components.Generic.Menu.Root
      onOpenChange={(open: boolean) => {
        if (open) sideMenu.freezeMenu()
        else sideMenu.unfreezeMenu()
      }}
      position="left"
    >
      <Components.Generic.Menu.Trigger>
        <span
          className="tolaria-block-drag-handle"
          onPointerDown={onPointerDown}
          onClickCapture={onClickCapture}
        >
          <Components.SideMenu.Button
            label={dict.side_menu.drag_handle_label}
            draggable={false}
            onDragStart={(event) => event.preventDefault()}
            onDragEnd={sideMenu.blockDragEnd}
            className="bn-button"
            icon={<GripVertical size={20} data-test="dragHandle" />}
          />
        </span>
      </Components.Generic.Menu.Trigger>
      <MenuComponent>{children}</MenuComponent>
    </Components.Generic.Menu.Root>
  )
}

function TolariaRemoveBlockItem({ children }: { children: ReactNode }) {
  const Components = useComponentsContext()!
  const { block, editor } = useSideMenuBlock()

  if (!block) return null

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        runSideMenuActionPreservingScroll(() => {
          const liveBlock = liveSideMenuBlock(editor, block)
          if (!liveBlock) return
          editor.removeBlocks([liveBlock.id])
        }, editor.domElement ? captureEditorScrollForControl(editor.domElement) : null)
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  )
}

function TolariaTableHeaderItem({
  children,
  header,
}: {
  children: ReactNode
  header: TableHeaderAxis
}) {
  const Components = useComponentsContext()!
  const { block, editor } = useSideMenuBlock()
  const liveBlock = liveSideMenuBlock(editor, block)
  const tableContent = tableHeaderContent(liveBlock)

  if (!tableContent || !editor.settings.tables.headers) return null

  const checked = tableHeaderEnabled(tableContent, header)

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      checked={checked}
      onClick={() => {
        runSideMenuActionPreservingScroll(() => {
          const currentBlock = liveSideMenuBlock(editor, block)
          const currentContent = tableHeaderContent(currentBlock)
          if (!currentBlock || !currentContent) return

          editor.updateBlock(currentBlock.id, {
            content: toggledTableHeaderContent(currentContent, header, checked) as never,
          })
        }, editor.domElement ? captureEditorScrollForControl(editor.domElement) : null)
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  )
}

function TolariaDragHandleMenu() {
  const dict = useDictionary()

  return (
    <DragHandleMenu>
      <TolariaRemoveBlockItem>{dict.drag_handle.delete_menuitem}</TolariaRemoveBlockItem>
      <TolariaTableHeaderItem header="row">{dict.drag_handle.header_row_menuitem}</TolariaTableHeaderItem>
      <TolariaTableHeaderItem header="column">{dict.drag_handle.header_column_menuitem}</TolariaTableHeaderItem>
    </DragHandleMenu>
  )
}

export function TolariaSideMenu({ locale = 'en', ...props }: TolariaSideMenuProps) {
  const { block, editor } = useSideMenuBlock()
  useSideMenuTextAlignment(editor, block)

  return (
    <SideMenu {...props}>
      <TolariaDragHandleButton dragHandleMenu={TolariaDragHandleMenu} />
      <TolariaSectionControlButton locale={locale} />
    </SideMenu>
  )
}

export function TolariaCollapsedHeadingsController() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  useCollapsedHeadingRendering(editor)

  return null
}
