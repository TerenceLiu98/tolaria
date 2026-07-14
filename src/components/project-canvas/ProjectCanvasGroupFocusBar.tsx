import { CaretLeft, StackSimple } from '@phosphor-icons/react'
import { translate, type AppLocale } from '../../lib/i18n'
import type { ProjectCanvasNode } from '../../projectCanvas'
import { Button } from '../ui/button'

interface ProjectCanvasGroupFocusBarProps {
  readonly group: ProjectCanvasNode
  readonly locale: AppLocale
  readonly onExit: () => void
}

export function ProjectCanvasGroupFocusBar({ group, locale, onExit }: ProjectCanvasGroupFocusBarProps) {
  return (
    <div className="project-canvas-group-focus" data-testid="project-canvas-group-focus">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        aria-label={translate(locale, 'projectCanvas.exitGroup')}
        onClick={onExit}
      >
        <CaretLeft size={14} />
        <StackSimple size={14} />
        <span>{group.title ?? translate(locale, 'projectCanvas.node.group')}</span>
      </Button>
    </div>
  )
}
