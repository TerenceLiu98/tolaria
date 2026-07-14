import { ArrowSquareOut, Check, CornersIn, LinkSimple, PushPin, Resize, Trash } from '@phosphor-icons/react'
import type { CanvasNodeToolbarAction } from '../../canvasNodeSpecRegistry'
import { translate, type AppLocale } from '../../lib/i18n'
import { Button } from '../ui/button'

interface CanvasContextualToolbarProps {
  actions: readonly CanvasNodeToolbarAction[]
  locale: AppLocale
  title: string
  onAction: (action: CanvasNodeToolbarAction) => void
}

function actionLabel(action: CanvasNodeToolbarAction, locale: AppLocale, title: string): string {
  switch (action) {
    case 'open': return translate(locale, 'projectCanvas.openNode')
    case 'enter-group': return translate(locale, 'projectCanvas.enterGroup')
    case 'connect': return translate(locale, 'projectCanvas.connectTool')
    case 'resize': return translate(locale, 'projectCanvas.resizeNode', { title })
    case 'toggle-complete': return translate(locale, 'projectCanvas.taskCompleted')
    case 'pin': return translate(locale, 'projectCanvas.pinPeek')
    case 'delete': return translate(locale, 'projectCanvas.deleteNode')
  }
}

function actionIcon(action: CanvasNodeToolbarAction) {
  switch (action) {
    case 'open': return <ArrowSquareOut size={13} />
    case 'enter-group': return <CornersIn size={13} />
    case 'connect': return <LinkSimple size={13} />
    case 'resize': return <Resize size={13} />
    case 'toggle-complete': return <Check size={13} />
    case 'pin': return <PushPin size={13} />
    case 'delete': return <Trash size={13} />
  }
}

export function CanvasContextualToolbar({ actions, locale, title, onAction }: CanvasContextualToolbarProps) {
  if (actions.length === 0) return null
  return (
    <div
      className="project-canvas-contextual-toolbar__content"
      role="toolbar"
      aria-label={translate(locale, 'projectCanvas.toolbar')}
      onPointerDown={event => event.stopPropagation()}
      onClick={event => event.stopPropagation()}
    >
      {actions.map(action => (
        <Button
          key={action}
          type="button"
          size="icon-xs"
          variant="ghost"
          data-testid={`project-canvas-toolbar-action-${action}`}
          aria-label={actionLabel(action, locale, title)}
          title={actionLabel(action, locale, title)}
          onClick={() => onAction(action)}
        >
          {actionIcon(action)}
        </Button>
      ))}
    </div>
  )
}
