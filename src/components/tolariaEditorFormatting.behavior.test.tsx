import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const {
  blockHasTypeMock,
  editorHasBlockWithTypeMock,
  formattingToolbarStore,
  hoverGuardMock,
  positionPopoverState,
  showState,
  useBlockNoteEditorMock,
  writeClipboardTextMock,
} = vi.hoisted(() => ({
  blockHasTypeMock: vi.fn(() => true),
  editorHasBlockWithTypeMock: vi.fn(() => true),
  formattingToolbarStore: { setState: vi.fn() },
  hoverGuardMock: vi.fn(),
  positionPopoverState: { lastProps: null as null | Record<string, unknown> },
  showState: { value: true },
  useBlockNoteEditorMock: vi.fn(),
  writeClipboardTextMock: vi.fn().mockResolvedValue(undefined),
}))

function MockIcon() {
  return <svg data-testid="mock-icon" />
}

vi.mock('@blocknote/react', () => {
  function MockDefaultBoldButton() {
    const editor = useBlockNoteEditorMock()
    return (
      <button
        onClick={() => {
          editor.focus()
          editor.toggleStyles({ bold: true })
        }}
        type="button"
      >
        Bold
      </button>
    )
  }

  return {
    FormattingToolbar: ({ children }: { children?: ReactNode }) => (
      <div data-testid="mock-formatting-toolbar">{children}</div>
    ),
    getFormattingToolbarItems: () => [
      <div key="blockTypeSelect" />,
      <MockDefaultBoldButton key="boldStyleButton" />,
      <button key="italicStyleButton" type="button">Italic</button>,
      <button key="strikeStyleButton" type="button">Strikethrough</button>,
      <div key="fileDownloadButton" />,
      <div key="createLinkButton" />,
    ],
    PositionPopover: (props: Record<string, unknown> & { children?: ReactNode }) => {
      positionPopoverState.lastProps = props
      return <div data-testid="mock-position-popover">{props.children}</div>
    },
    useBlockNoteEditor: useBlockNoteEditorMock,
    useComponentsContext: () => ({
      FormattingToolbar: {
        Button: ({
          children,
          icon,
          label,
          onClick,
        }: {
          children?: ReactNode
          icon?: ReactNode
          label: string
          onClick: () => void
        }) => (
          <button onClick={onClick} type="button">
            {icon}
            {label}
            {children}
          </button>
        ),
      },
    }),
    useDictionary: () => ({
      formatting_toolbar: {
        file_download: {
          tooltip: {
            file: 'Download file',
            image: 'Download image',
          },
        },
      },
    }),
    useEditorState: ({ editor, selector }: { editor: unknown; selector: (context: { editor: unknown }) => unknown }) => selector({ editor }),
    useExtension: () => ({ store: formattingToolbarStore }),
    useExtensionState: () => showState.value,
  }
})

vi.mock('@blocknote/core', () => ({
  blockHasType: blockHasTypeMock,
  createExtension: (factory: unknown) => factory,
  defaultProps: { textAlignment: 'left' },
  editorHasBlockWithType: editorHasBlockWithTypeMock,
}))

vi.mock('@blocknote/core/extensions', () => ({
  FormattingToolbarExtension: Symbol('FormattingToolbarExtension'),
}))

vi.mock('@mantine/core', () => ({
  Button: ({ children, ...props }: { children?: ReactNode }) => <button type="button" {...props}>{children}</button>,
  CheckIcon: () => <span data-testid="mantine-check">check</span>,
  Menu: Object.assign(
    ({ children }: { children?: ReactNode }) => <div data-testid="mantine-menu">{children}</div>,
    {
      Target: ({ children }: { children?: ReactNode }) => <>{children}</>,
      Dropdown: ({ children, ...props }: { children?: ReactNode }) => <div {...props}>{children}</div>,
      Item: ({ children, ...props }: { children?: ReactNode }) => <button type="button" {...props}>{children}</button>,
    },
  ),
}))

vi.mock('@phosphor-icons/react', () => ({
  ArrowSquareOut: MockIcon,
  CaretDown: MockIcon,
  ClipboardText: MockIcon,
  Code: MockIcon,
  Function: MockIcon,
  Highlighter: MockIcon,
  Paperclip: MockIcon,
  TextB: MockIcon,
  TextItalic: MockIcon,
  TextStrikethrough: MockIcon,
}))

vi.mock('../utils/clipboardText', () => ({
  writeClipboardText: writeClipboardTextMock,
}))

vi.mock('./tolariaEditorFormattingConfig', () => ({
  filterTolariaFormattingToolbarItems: (items: ReactNode[]) => items,
  getTolariaBlockTypeSelectItems: () => [
    { name: 'Paragraph', type: 'paragraph', props: {}, icon: MockIcon },
    { name: 'Heading 1', type: 'heading', props: { level: 1 }, icon: MockIcon },
  ],
}))

vi.mock('./blockNoteFormattingToolbarHoverGuard', () => ({
  useBlockNoteFormattingToolbarHoverGuard: hoverGuardMock,
}))

vi.mock('../utils/url', () => ({
  normalizeExternalUrl: vi.fn((url: string) => url),
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
  openLocalFile: vi.fn().mockResolvedValue(undefined),
}))

import { openLocalFile } from '../utils/url'
import { EditorFloatingPortalProvider } from './editorFloatingPortal'
import {
  TolariaFormattingToolbar,
  TolariaFormattingToolbarController,
} from './tolariaEditorFormatting'

const mockOpenLocalFile = vi.mocked(openLocalFile)

function createMockEditor(blockType = 'image', props: Record<string, unknown> = {}) {
  const selectedBlock = {
    id: 'file-block',
    type: blockType,
    props: { textAlignment: 'center', level: 1, ...props },
    content: [{ type: 'text', text: 'Selected block' }],
  }
  const domElement = document.createElement('div')
  domElement.appendChild(document.createElement('div'))
  document.body.appendChild(domElement)

  return {
    isEditable: true,
    schema: {
      styleSchema: {
        bold: { type: 'bold', propSchema: 'boolean' },
        italic: { type: 'italic', propSchema: 'boolean' },
        strike: { type: 'strike', propSchema: 'boolean' },
        code: { type: 'code', propSchema: 'boolean' },
        highlight: { type: 'highlight', propSchema: 'boolean' },
      },
      inlineContentSchema: {
        mathInline: { type: 'mathInline' },
      },
    },
    prosemirrorState: { selection: { from: 1, to: 5 } },
    domElement,
    focus: vi.fn(),
    getActiveStyles: () => ({ bold: true }),
    getBlock: vi.fn((id: string) => (id === selectedBlock.id ? selectedBlock : undefined)),
    getSelection: () => ({ blocks: [selectedBlock] }),
    getTextCursorPosition: () => ({ block: selectedBlock }),
    insertInlineContent: vi.fn(),
    toggleStyles: vi.fn(),
    transact: vi.fn((callback: () => void) => callback()),
    updateBlock: vi.fn(),
  }
}

describe('tolariaEditorFormatting behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    positionPopoverState.lastProps = null
    showState.value = true
    useBlockNoteEditorMock.mockReturnValue(createMockEditor())
  })

  it('renders toolbar controls, inserts the inline code button, and updates block types', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbar />)

    fireEvent.click(screen.getByRole('button', { name: /bold/i }))
    fireEvent.click(screen.getByRole('button', { name: /inline code/i }))
    fireEvent.click(screen.getByRole('button', { name: /highlight/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Heading 1' }))

    expect(editor.focus).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Bold' })).toBeInTheDocument()
    expect(editor.toggleStyles).toHaveBeenCalledWith({ bold: true })
    expect(editor.toggleStyles).toHaveBeenCalledWith({ code: true })
    expect(editor.toggleStyles).toHaveBeenCalledWith({ highlight: true })
    expect(editor.transact).toHaveBeenCalledTimes(1)
    expect(editor.updateBlock).toHaveBeenCalledWith(
      'file-block',
      { type: 'heading', props: { level: 1 } },
    )
  })

  it('attaches the current editor text selection to AI context from the toolbar', () => {
    const editor = createMockEditor('paragraph')
    const textNode = document.createTextNode('Selected text for AI')
    editor.domElement.firstElementChild?.appendChild(textNode)
    const range = document.createRange()
    range.selectNodeContents(textNode)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    const onAttachSelectedTextContext = vi.fn()
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <TolariaFormattingToolbar
        onAttachSelectedTextContext={onAttachSelectedTextContext}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: /include selected text/i }))

    expect(onAttachSelectedTextContext).toHaveBeenCalledWith('Selected text for AI')
    expect(editor.focus).toHaveBeenCalled()
  })

  it('converts the current editor text selection to inline math from the toolbar', () => {
    const editor = createMockEditor('paragraph')
    const textNode = document.createTextNode('$E=mc^2$')
    editor.domElement.firstElementChild?.appendChild(textNode)
    const range = document.createRange()
    range.selectNodeContents(textNode)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbar />)

    fireEvent.click(screen.getByRole('button', { name: /inline math/i }))

    expect(editor.focus).toHaveBeenCalled()
    expect(editor.insertInlineContent).toHaveBeenCalledWith([
      {
        type: 'mathInline',
        props: { latex: 'E=mc^2' },
        content: undefined,
      },
    ], { updateSelection: true })
  })

  it('ignores stale block-type clicks when the selected block disappeared before the action', () => {
    const editor = createMockEditor('paragraph')
    editor.getBlock.mockImplementation(() => {
      throw new Error('Block with ID file-block not found')
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbar />)

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Heading 1' }))
    }).not.toThrow()
    expect(editor.transact).not.toHaveBeenCalled()
    expect(editor.updateBlock).not.toHaveBeenCalled()
  })

  it('opens selected file blocks through the active vault path', () => {
    const editor = createMockEditor('file', {
      url: 'asset://localhost/%2Fvault%2Fattachments%2Freport.pdf',
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbar vaultPath="/vault" />)

    fireEvent.click(screen.getByRole('button', { name: 'Download file' }))

    expect(editor.focus).toHaveBeenCalled()
    expect(mockOpenLocalFile).toHaveBeenCalledWith('/vault/attachments/report.pdf', '/vault')
  })

  it('copies selected media block paths from the formatting toolbar', () => {
    const editor = createMockEditor('image', {
      url: 'asset://localhost/%2Fvault%2Fattachments%2Fdiagram.png',
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbar vaultPath="/vault" />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy file path' }))

    expect(editor.focus).toHaveBeenCalled()
    expect(writeClipboardTextMock).toHaveBeenCalledWith('attachments/diagram.png')
  })

  it('edits selected media captions from the formatting toolbar', () => {
    const editor = createMockEditor('image', {
      caption: 'Old caption',
      url: 'asset://localhost/%2Fvault%2Fattachments%2Fdiagram.png',
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbar vaultPath="/vault" />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit media caption' }))
    const input = screen.getByRole('textbox', { name: 'Edit media caption' })
    expect(input).toHaveValue('Old caption')

    fireEvent.change(input, { target: { value: 'Architecture diagram' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save caption' }))

    expect(editor.updateBlock).toHaveBeenCalledWith('file-block', {
      props: { caption: 'Architecture diagram' },
    })
    expect(editor.focus).toHaveBeenCalled()
  })

  it('controls the floating toolbar placement, hover guard, and escape-key close behavior', () => {
    const editor = createMockEditor()
    const toolbarComponent = () => <div data-testid="custom-toolbar">Toolbar</div>
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <TolariaFormattingToolbarController
        formattingToolbar={toolbarComponent}
        floatingUIOptions={{ useFloatingOptions: { placement: 'top-start' } }}
      />,
    )

    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument()
    expect(hoverGuardMock).toHaveBeenCalledWith({
      editor,
      container: editor.domElement,
      selectedFileBlockId: 'file-block',
      isOpen: true,
    })
    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: { from: 1, to: 5 },
      useFloatingOptions: expect.objectContaining({
        open: true,
        placement: 'top-start',
      }),
    }))

    const onOpenChange = positionPopoverState.lastProps?.useFloatingOptions as {
      onOpenChange: (open: boolean, event: unknown, reason?: string) => void
    }

    onOpenChange.onOpenChange(false, undefined, 'escape-key')

    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
    expect(editor.focus).toHaveBeenCalledTimes(1)
  })

  it('renders the floating toolbar into the shared editor portal when available', () => {
    const editor = createMockEditor()
    const portalHost = document.createElement('div')
    document.body.appendChild(portalHost)
    const toolbarComponent = () => <div data-testid="custom-toolbar">Toolbar</div>
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <EditorFloatingPortalProvider value={portalHost}>
        <TolariaFormattingToolbarController formattingToolbar={toolbarComponent} />
      </EditorFloatingPortalProvider>,
    )

    expect(portalHost).toContainElement(screen.getByTestId('mock-position-popover'))
    expect(portalHost).toContainElement(screen.getByTestId('custom-toolbar'))
  })

  it('uses block alignment when deciding the floating placement', () => {
    const editor = createMockEditor()
    editor.getTextCursorPosition = () => ({
      block: {
        id: 'paragraph-block',
        type: 'paragraph',
        props: { textAlignment: 'right' },
        content: [{ type: 'text', text: 'Paragraph' }],
      },
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      useFloatingOptions: expect.objectContaining({
        placement: 'top-end',
      }),
    }))
  })

  it('adds viewport-clamping middleware and preserves caller middleware', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <TolariaFormattingToolbarController
        floatingUIOptions={{
          useFloatingOptions: {
            middleware: [{ name: 'custom-middleware' } as never],
          },
        }}
      />,
    )

    const floatingOptions = positionPopoverState.lastProps?.useFloatingOptions as {
      middleware: Array<{ name: string }>
    }

    expect(floatingOptions.middleware.map((middleware) => middleware.name)).toEqual(
      expect.arrayContaining(['custom-middleware', 'tolariaViewportClamp']),
    )
  })

  it('falls back to top-start and focuses the block type trigger on mouse down', () => {
    const editor = createMockEditor('paragraph')
    const focusSpy = vi.spyOn(HTMLButtonElement.prototype, 'focus').mockImplementation(() => {})

    blockHasTypeMock.mockReturnValue(false)
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbarController />)
    fireEvent.mouseDown(screen.getAllByRole('button', { name: 'Paragraph' })[0] as HTMLButtonElement)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      useFloatingOptions: expect.objectContaining({
        placement: 'top-start',
      }),
    }))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('keeps the toolbar open during close grace and clears the timeout on unmount', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const editor = createMockEditor('paragraph')

    useBlockNoteEditorMock.mockReturnValue(editor)

    const { rerender, unmount } = render(<TolariaFormattingToolbarController />)

    showState.value = false
    rerender(<TolariaFormattingToolbarController />)

    expect(screen.getByTestId('mock-position-popover')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(50)
    })

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
    vi.useRealTimers()
  })

  it('ignores internal pointer and focus transitions before closing on external blur', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <TolariaFormattingToolbarController
        formattingToolbar={() => <button data-testid="toolbar-action" type="button">Toolbar</button>}
      />,
    )

    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement

    fireEvent.pointerEnter(toolbarWrapper)
    fireEvent.pointerLeave(toolbarWrapper, { relatedTarget: screen.getByTestId('toolbar-action') })
    fireEvent.focus(toolbarWrapper)
    fireEvent.blur(toolbarWrapper, { relatedTarget: screen.getByTestId('toolbar-action') })

    expect(screen.getByTestId('toolbar-action')).toBeInTheDocument()

    fireEvent.pointerLeave(toolbarWrapper, { relatedTarget: document.body })
    fireEvent.blur(toolbarWrapper, { relatedTarget: document.body })

    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
  })

  it('deduplicates floating toolbar store writes during close races', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <TolariaFormattingToolbarController
        formattingToolbar={() => <button data-testid="toolbar-action" type="button">Toolbar</button>}
      />,
    )

    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement
    const floatingOptions = positionPopoverState.lastProps?.useFloatingOptions as {
      onOpenChange: (open: boolean, event: unknown, reason?: string) => void
    }

    floatingOptions.onOpenChange(true, undefined)
    floatingOptions.onOpenChange(false, undefined)
    floatingOptions.onOpenChange(false, undefined)
    fireEvent.blur(toolbarWrapper, { relatedTarget: document.body })

    expect(formattingToolbarStore.setState).toHaveBeenCalledTimes(1)
    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
  })

  it('hides the floating toolbar while the editor is composing IME text', () => {
    vi.useFakeTimers()
    try {
      const editor = createMockEditor('paragraph')
      const editorInput = editor.domElement.firstElementChild as HTMLElement

      useBlockNoteEditorMock.mockReturnValue(editor)

      render(<TolariaFormattingToolbarController />)

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: { from: 1, to: 5 },
        useFloatingOptions: expect.objectContaining({ open: true }),
      }))

      act(() => {
        fireEvent.compositionStart(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        fireEvent.compositionEnd(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(250)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: { from: 1, to: 5 },
        useFloatingOptions: expect.objectContaining({ open: true }),
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the floating toolbar hidden through rapid Zhuyin composition settle cycles', () => {
    vi.useFakeTimers()
    try {
      const editor = createMockEditor('paragraph')
      const editorInput = editor.domElement.firstElementChild as HTMLElement

      useBlockNoteEditorMock.mockReturnValue(editor)

      render(<TolariaFormattingToolbarController />)

      act(() => {
        fireEvent.compositionStart(editorInput)
        fireEvent.compositionEnd(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(120)
        fireEvent.compositionStart(editorInput)
        fireEvent.compositionEnd(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(249)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(1)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: { from: 1, to: 5 },
        useFloatingOptions: expect.objectContaining({ open: true }),
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores composition events that start outside the editor', () => {
    const editor = createMockEditor('paragraph')
    const outsideInput = document.createElement('input')
    document.body.appendChild(outsideInput)

    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbarController />)

    act(() => {
      fireEvent.compositionStart(outsideInput)
    })

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: { from: 1, to: 5 },
      useFloatingOptions: expect.objectContaining({ open: true }),
    }))
  })

  it('binds composition listeners after BlockNote provides its editor element', () => {
    const editor = createMockEditor('paragraph')
    const lateEditorElement = editor.domElement
    const editorInput = lateEditorElement.firstElementChild as HTMLElement

    editor.domElement = undefined as unknown as HTMLElement
    useBlockNoteEditorMock.mockReturnValue(editor)

    const { rerender } = render(<TolariaFormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: undefined,
      useFloatingOptions: expect.objectContaining({ open: false }),
    }))

    editor.domElement = lateEditorElement
    rerender(<TolariaFormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: { from: 1, to: 5 },
      useFloatingOptions: expect.objectContaining({ open: true }),
    }))

    act(() => {
      fireEvent.compositionStart(editorInput)
    })

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: undefined,
      useFloatingOptions: expect.objectContaining({ open: false }),
    }))
  })

  it('does not open the floating toolbar when the editor anchor element is unavailable', () => {
    const editor = createMockEditor()
    editor.domElement = document.createElement('div')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<TolariaFormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: undefined,
      useFloatingOptions: expect.objectContaining({
        open: false,
      }),
    }))
  })

  it('stays stable when BlockNote selection reads throw during inline action churn', () => {
    const editor = createMockEditor('paragraph')
    const selectionError = new RangeError('Index 0 out of range for <>')

    editor.getSelection = vi.fn(() => {
      throw selectionError
    })
    editor.getTextCursorPosition = vi.fn(() => {
      throw selectionError
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    expect(() => {
      render(
        <>
          <TolariaFormattingToolbar />
          <TolariaFormattingToolbarController />
        </>,
      )
    }).not.toThrow()
  })

  it('stays stable when BlockNote exposes malformed selection blocks during remount churn', () => {
    const editor = createMockEditor('paragraph')

    editor.getSelection = vi.fn(() => ({
      blocks: [undefined, { id: 'partial-block' }],
    }) as never)
    editor.getTextCursorPosition = vi.fn(() => ({
      block: undefined,
    }) as never)
    useBlockNoteEditorMock.mockReturnValue(editor)

    expect(() => {
      render(
        <>
          <TolariaFormattingToolbar />
          <TolariaFormattingToolbarController />
        </>,
      )
    }).not.toThrow()
  })
})
