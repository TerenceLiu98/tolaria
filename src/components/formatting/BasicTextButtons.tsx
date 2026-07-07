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
import {
  Code as Code2,
  Highlighter,
  TextB as Bold,
  TextItalic as Italic,
  TextStrikethrough as Strikethrough,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { useCallback } from 'react'
import { translate, type AppLocale } from '../../lib/i18n'
import { MARKDOWN_HIGHLIGHT_STYLE } from '../../utils/markdownHighlightMarkdown'
import { getSelectedBlocksSafely } from './toolbarBlocks'

export type TolariaBasicTextStyle =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | typeof MARKDOWN_HIGHLIGHT_STYLE

const TOLARIA_BASIC_TEXT_STYLE_COPY_KEYS = {
  bold: {
    label: 'editor.formatting.bold',
    mainTooltip: 'editor.formatting.boldTooltip',
    secondaryTooltip: '**strong**',
  },
  italic: {
    label: 'editor.formatting.italic',
    mainTooltip: 'editor.formatting.italicTooltip',
    secondaryTooltip: '*emphasis*',
  },
  strike: {
    label: 'editor.formatting.strikethrough',
    mainTooltip: 'editor.formatting.strikethroughTooltip',
    secondaryTooltip: '~~strike~~',
  },
  code: {
    label: 'editor.formatting.inlineCode',
    mainTooltip: 'editor.formatting.inlineCodeTooltip',
    secondaryTooltip: '`code`',
  },
} satisfies Record<
  Exclude<TolariaBasicTextStyle, typeof MARKDOWN_HIGHLIGHT_STYLE>,
  { label: Parameters<typeof translate>[1]; mainTooltip: Parameters<typeof translate>[1]; secondaryTooltip: string }
>

const TOLARIA_BASIC_TEXT_STYLE_ICONS = {
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  code: Code2,
  [MARKDOWN_HIGHLIGHT_STYLE]: Highlighter,
} satisfies Record<TolariaBasicTextStyle, PhosphorIcon>

function editorSupportsTextStyle(
  style: TolariaBasicTextStyle,
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  const styleSchema = Reflect.get(editor.schema.styleSchema, style) as {
    type?: string
    propSchema?: unknown
  } | undefined
  return (
    style in editor.schema.styleSchema &&
    styleSchema?.type === style &&
    styleSchema.propSchema === 'boolean'
  )
}

function selectionSupportsInlineFormatting(
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  return getSelectedBlocksSafely(editor).some((block) => block.content !== undefined)
}

function getBasicTextStyleButtonState(
  basicTextStyle: TolariaBasicTextStyle,
  editor: BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>,
) {
  if (!editor.isEditable) return undefined
  if (!editorSupportsTextStyle(basicTextStyle, editor)) return undefined
  if (!selectionSupportsInlineFormatting(editor)) return undefined

  return {
    active: basicTextStyle in editor.getActiveStyles(),
  }
}

function basicTextStyleCopy(
  basicTextStyle: TolariaBasicTextStyle,
  locale: AppLocale,
) {
  if (basicTextStyle === MARKDOWN_HIGHLIGHT_STYLE) {
    return {
      label: translate(locale, 'editor.formatting.highlight'),
      mainTooltip: translate(locale, 'editor.formatting.highlightTooltip'),
      secondaryTooltip: '==highlight==',
    }
  }

  const copyKeys = Reflect.get(TOLARIA_BASIC_TEXT_STYLE_COPY_KEYS, basicTextStyle) as {
    label: Parameters<typeof translate>[1]
    mainTooltip: Parameters<typeof translate>[1]
    secondaryTooltip: string
  }
  return {
    label: translate(locale, copyKeys.label),
    mainTooltip: translate(locale, copyKeys.mainTooltip),
    secondaryTooltip: copyKeys.secondaryTooltip,
  }
}

export function BasicTextStyleButton({
  basicTextStyle,
  locale = 'en',
}: {
  basicTextStyle: TolariaBasicTextStyle
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
    selector: ({ editor }) => getBasicTextStyleButtonState(basicTextStyle, editor),
  })

  const toggleStyle = useCallback(() => {
    editor.focus()
    editor.toggleStyles({ [basicTextStyle]: true } as never)
  }, [basicTextStyle, editor])

  if (buttonState === undefined) return null

  const Icon = Reflect.get(TOLARIA_BASIC_TEXT_STYLE_ICONS, basicTextStyle) as PhosphorIcon
  const copy = basicTextStyleCopy(basicTextStyle, locale)

  return (
    <Components.FormattingToolbar.Button
      className="bn-button"
      data-test={basicTextStyle}
      onClick={toggleStyle}
      isSelected={buttonState.active}
      label={copy.label}
      mainTooltip={copy.mainTooltip}
      secondaryTooltip={copy.secondaryTooltip}
      icon={<Icon />}
    />
  )
}
