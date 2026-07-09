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
import { NotePencil } from '@phosphor-icons/react'
import { useCallback } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import { selectedEditorBlockId, selectedEditorText } from './toolbarSelection'

export function SelectedTextCommentButton({
  locale = 'en',
  onCommentSelectedText,
}: {
  locale?: AppLocale
  onCommentSelectedText?: (text: string, editorBlockId?: string | null) => void
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
  const handleComment = useCallback(() => {
    const text = selectedEditorText(editor)
    if (!text) return

    onCommentSelectedText?.(text, selectedEditorBlockId(editor))
    editor.focus()
  }, [editor, onCommentSelectedText])

  if (!onCommentSelectedText || !selectedText) return null

  const label = translate(locale, 'paper.reader.addComment')
  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test="commentSelectedText"
      onClick={handleComment}
      isSelected={false}
      label={label}
      mainTooltip={label}
      icon={<NotePencil />}
    />
  )
}
