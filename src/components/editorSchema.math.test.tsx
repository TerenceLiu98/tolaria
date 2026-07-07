import { readFileSync } from 'node:fs'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { MathBlockEditor, MathInlineEditor } from './editorSchema'
import { subscribeRichEditorExternalChange } from './editorExternalChangeEvents'

function renderMathBlockEditor(latex = '\\sqrt{x}') {
  const editor = {
    focus: vi.fn(),
    updateBlock: vi.fn(),
  }
  const block = {
    id: 'math-block',
    props: { latex },
  }

  render(<MathBlockEditor block={block} editor={editor} />)

  return { block, editor }
}

function renderMathInlineEditor(latex = 'E=mc^2') {
  const domElement = document.createElement('div')
  document.body.appendChild(domElement)
  const editor = {
    domElement,
    focus: vi.fn(),
  }
  const updateInlineContent = vi.fn()

  render(
    <MathInlineEditor
      editor={editor}
      inlineContent={{ props: { latex } }}
      updateInlineContent={updateInlineContent}
    />,
  )

  return { editor, updateInlineContent }
}

describe('MathBlockEditor', () => {
  it('renders display math without exposing Markdown delimiters as editor content', () => {
    renderMathBlockEditor()

    expect(document.querySelector('.math--block')).toHaveAttribute('data-latex', '\\sqrt{x}')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('edits the math block latex prop instead of inserting Markdown source', () => {
    const { editor } = renderMathBlockEditor()
    const onExternalChange = vi.fn()
    const unsubscribe = subscribeRichEditorExternalChange(editor, onExternalChange)

    fireEvent.doubleClick(document.querySelector('.math--block')!)
    const source = screen.getByRole('textbox')
    fireEvent.change(source, { target: { value: '\\frac{1}{2}' } })
    fireEvent.blur(source)

    expect(editor.updateBlock).toHaveBeenCalledWith('math-block', {
      props: { latex: '\\frac{1}{2}' },
    })
    expect(editor.updateBlock).not.toHaveBeenCalledWith('math-block', {
      props: { latex: '$$\\frac{1}{2}$$' },
    })
    expect(onExternalChange).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('ignores stale math block updates after the owning block disappears', () => {
    const { editor } = renderMathBlockEditor()
    const onExternalChange = vi.fn()
    const unsubscribe = subscribeRichEditorExternalChange(editor, onExternalChange)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    editor.updateBlock.mockImplementation(() => {
      throw new Error('Block with ID math-block not found')
    })

    fireEvent.doubleClick(document.querySelector('.math--block')!)
    const source = screen.getByRole('textbox')
    fireEvent.change(source, { target: { value: '\\frac{1}{2}' } })

    expect(() => fireEvent.blur(source)).not.toThrow()
    expect(editor.updateBlock).toHaveBeenCalledWith('math-block', {
      props: { latex: '\\frac{1}{2}' },
    })
    expect(onExternalChange).not.toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledWith(
      '[editor] Recovered rich-editor transform error:',
      expect.any(Error),
    )
    unsubscribe()
    warnSpy.mockRestore()
  })

  it('cancels math block editing without changing the block', () => {
    const { editor } = renderMathBlockEditor()

    fireEvent.doubleClick(document.querySelector('.math--block')!)
    const source = screen.getByRole('textbox')
    fireEvent.change(source, { target: { value: '\\frac{1}{2}' } })
    fireEvent.keyDown(source, { key: 'Escape' })
    fireEvent.blur(source)

    expect(editor.updateBlock).not.toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
  })

  it('uses editor selection colors and a single focused border while editing', () => {
    renderMathBlockEditor()

    fireEvent.doubleClick(document.querySelector('.math--block')!)
    const source = screen.getByRole('textbox')

    expect(source).toHaveClass('math-block-source')
    expect(source).toHaveClass('selection:bg-[var(--colors-selection)]')
    expect(source).toHaveClass('selection:text-[var(--colors-text)]')
    expect(source).toHaveClass('focus-visible:ring-0')
    expect(source).not.toHaveClass('selection:bg-primary')
    expect(source).not.toHaveClass('selection:text-primary-foreground')
    expect(source).not.toHaveClass('focus-visible:ring-[3px]')
  })

  it('keeps display math selection chrome scoped to the rendered formula width', () => {
    const editorThemeCss = readFileSync(`${process.cwd()}/src/components/EditorTheme.css`, 'utf8')

    expect(editorThemeCss).toContain('.editor__blocknote-container .math-block-shell {')
    expect(editorThemeCss).toContain('max-width: 100%;')
    expect(editorThemeCss).toContain('.editor__blocknote-container .math-block-shell:not(.math-block-shell--editing) {')
    expect(editorThemeCss).toContain('width: fit-content;')
    expect(editorThemeCss).toContain('margin-inline: auto;')
    expect(editorThemeCss).toContain('.editor__blocknote-container .math-block-shell--editing {')
    expect(editorThemeCss).toContain('width: 100%;')
  })

  it('does not stack divider bottom spacing with following heading top spacing', () => {
    const editorThemeCss = readFileSync(`${process.cwd()}/src/components/EditorTheme.css`, 'utf8')

    expect(editorThemeCss).toContain('.editor__blocknote-container .bn-block-outer:has(hr)')
    expect(editorThemeCss).toContain('+ .bn-block-outer:has(> .bn-block > [data-content-type="heading"])')
    expect(editorThemeCss).toContain('margin-top: var(--editor-divider-followed-by-heading-margin-top) !important;')
  })
})

describe('MathInlineEditor', () => {
  it('opens a lightweight popover and updates inline math props', async () => {
    const { editor, updateInlineContent } = renderMathInlineEditor()
    const onExternalChange = vi.fn()
    const unsubscribe = subscribeRichEditorExternalChange(editor, onExternalChange)

    fireEvent.click(screen.getByRole('button', { name: 'Math: E=mc^2' }))
    const input = await screen.findByRole('textbox', { name: 'Inline math' })
    fireEvent.change(input, { target: { value: '\\frac{1}{2}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateInlineContent).toHaveBeenCalledWith({
      props: { latex: '\\frac{1}{2}' },
    })
    expect(onExternalChange).toHaveBeenCalledTimes(1)
    expect(editor.focus).toHaveBeenCalled()
    unsubscribe()
  })

  it('normalizes over-escaped inline math before rendering and saving edits', async () => {
    const { updateInlineContent } = renderMathInlineEditor('\\\\frac\\{a\\}\\{b\\}')

    fireEvent.click(screen.getByRole('button', { name: 'Math: \\frac{a}{b}' }))
    const input = await screen.findByRole('textbox', { name: 'Inline math' })
    expect(input).toHaveValue('\\frac{a}{b}')
    fireEvent.change(input, { target: { value: '\\\\sqrt\\{x\\}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateInlineContent).toHaveBeenCalledWith({
      props: { latex: '\\sqrt{x}' },
    })
  })

  it('closes inline math editing without changing props on Escape', async () => {
    const { editor, updateInlineContent } = renderMathInlineEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Math: E=mc^2' }))
    const input = await screen.findByRole('textbox', { name: 'Inline math' })
    fireEvent.change(input, { target: { value: '\\frac{1}{2}' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    expect(updateInlineContent).not.toHaveBeenCalled()
    expect(editor.focus).toHaveBeenCalled()
  })

  it('does not save empty inline math', async () => {
    const { updateInlineContent } = renderMathInlineEditor()

    fireEvent.click(screen.getByRole('button', { name: 'Math: E=mc^2' }))
    const input = await screen.findByRole('textbox', { name: 'Inline math' })
    fireEvent.change(input, { target: { value: '   ' } })

    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(updateInlineContent).not.toHaveBeenCalled()
  })
})
