import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  CommentComposer,
  CommentGutter,
  CommentThreadPanel,
} from './CommentUI'

describe('CommentUI', () => {
  it('renders a gutter count and opens a thread by anchor id', () => {
    const onToggleThread = vi.fn()

    render(
      <CommentGutter
        anchorId="b0002"
        count={2}
        isOpen={false}
        title="Open comments"
        onToggleThread={onToggleThread}
      />,
    )

    expect(screen.getByTestId('comment-gutter-count-b0002')).toHaveTextContent('2')
    fireEvent.click(screen.getByRole('button', { name: 'Open comments' }))
    expect(onToggleThread).toHaveBeenCalledWith('b0002')
  })

  it('keeps an empty gutter affordance discoverable before hover', () => {
    render(
      <CommentGutter
        anchorId="b0003"
        count={0}
        isOpen={false}
        title="Add comment"
        onToggleThread={vi.fn()}
      />,
    )

    const button = screen.getByRole('button', { name: 'Add comment' })
    expect(button).toHaveClass('opacity-50')
    expect(button).not.toHaveClass('opacity-0')
  })

  it('submits non-empty composer text and clears the field', () => {
    const onSubmit = vi.fn()

    render(
      <CommentComposer
        label="Comment body"
        placeholder="Write a comment"
        submitLabel="Add comment"
        onSubmit={onSubmit}
      />,
    )

    const textarea = screen.getByLabelText('Comment body')
    fireEvent.change(textarea, { target: { value: '  Important claim  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add comment' }))

    expect(onSubmit).toHaveBeenCalledWith('Important claim')
    expect(textarea).toHaveValue('')
  })

  it('renders empty and populated thread states', () => {
    const { rerender } = render(
      <CommentThreadPanel
        comments={[]}
        emptyText="No comments"
        renderComment={(comment) => <li key={comment.id}>{comment.body}</li>}
        title="Comments"
      />,
    )

    expect(screen.getByText('No comments')).toBeInTheDocument()

    rerender(
      <CommentThreadPanel
        comments={[{ anchorId: 'b0002', body: 'Check this', id: 'c1', kind: 'comment' }]}
        emptyText="No comments"
        renderComment={(comment) => <li key={comment.id}>{comment.body}</li>}
        title="Comments"
      />,
    )

    expect(screen.getByText('Check this')).toBeInTheDocument()
  })

  it('closes a thread from the header action', () => {
    const onClose = vi.fn()

    render(
      <CommentThreadPanel
        closeLabel="Close comments"
        comments={[]}
        emptyText="No comments"
        onClose={onClose}
        renderComment={(comment) => <li key={comment.id}>{comment.body}</li>}
        title="Comments"
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Close comments' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
