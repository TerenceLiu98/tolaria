import {
  useBlockNoteEditor,
  useComponentsContext,
  useEditorState,
} from '@blocknote/react'
import type {
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import { Paperclip } from '@phosphor-icons/react'
import { useCallback } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import { selectedEditorText } from './toolbarSelection'

export function SelectedTextContextButton({
  locale = 'en',
  onAttachSelectedTextContext,
}: {
  locale?: AppLocale
  onAttachSelectedTextContext?: (text: string) => void
}) {
  const Components = useComponentsContext()!
  const editor = useBlockNoteEditor<
    BlockSchema,
    InlineContentSchema,
    StyleSchema
  >()
  const selectedText = useEditorState({
    editor,
    selector: ({ editor }) => selectedEditorText(editor),
  })
  const handleAttach = useCallback(() => {
    const text = selectedEditorText(editor)
    if (!text) return

    onAttachSelectedTextContext?.(text)
    editor.focus()
  }, [editor, onAttachSelectedTextContext])

  if (!onAttachSelectedTextContext || !selectedText) return null

  const label = translate(locale, 'ai.panel.selectedText.include')
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="attachSelectedTextContext"
      onClick={handleAttach}
      isSelected={false}
      label={label}
      mainTooltip={label}
      icon={<Paperclip />}
    />
  )
}
