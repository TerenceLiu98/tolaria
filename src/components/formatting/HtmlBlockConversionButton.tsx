import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import { Code } from '@phosphor-icons/react'
import { useCallback } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import { trackEvent } from '../../lib/telemetry'
import { htmlCodeBlockToHtmlBlockUpdate } from '../../utils/htmlBlockMarkdown'
import { getSelectedBlocksSafely, type TolariaSelectedBlock } from './toolbarBlocks'

function selectedHtmlCodeBlock(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
): TolariaSelectedBlock | null {
  if (!editor.isEditable) return null
  const selectedBlocks = getSelectedBlocksSafely(editor)
  if (selectedBlocks.length !== 1) return null

  const block = selectedBlocks[0]
  return block && htmlCodeBlockToHtmlBlockUpdate(block) ? block : null
}

function renderSelectedHtmlCodeBlock(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
  selectedBlock: TolariaSelectedBlock,
): boolean {
  const update = htmlCodeBlockToHtmlBlockUpdate(selectedBlock)
  if (!update) return false
  editor.updateBlock(selectedBlock.id, update as never)
  return true
}

export function HtmlBlockConversionButton({
  locale = 'en',
}: {
  locale?: AppLocale
}) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const buttonState = useEditorState({
    editor,
    selector: ({ editor }) => selectedHtmlCodeBlock(editor) !== null,
  })

  const renderAsHtml = useCallback(() => {
    const selectedBlock = selectedHtmlCodeBlock(editor)
    if (!selectedBlock) return
    editor.focus()
    if (renderSelectedHtmlCodeBlock(editor, selectedBlock)) {
      trackEvent('editor_html_code_block_rendered', { source: 'formatting_toolbar' })
    }
  }, [editor])

  if (!buttonState) return null

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="render-html-block"
      icon={<Code />}
      label={translate(locale, 'editor.htmlBlock.renderAsHtml')}
      mainTooltip={translate(locale, 'editor.htmlBlock.renderAsHtmlTooltip')}
      onClick={renderAsHtml}
    />
  )
}
