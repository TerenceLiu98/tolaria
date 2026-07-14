import {
  AlignBottom,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignLeft,
  AlignRight,
  AlignTop,
  ArrowsOutLineHorizontal,
  ArrowsOutLineVertical,
  Stack,
  StackMinus,
  StackPlus,
  type Icon,
} from '@phosphor-icons/react'
import { translate, type AppLocale, type TranslationKey } from '../../lib/i18n'
import type { CanvasAlignment, CanvasArrangement, CanvasDistribution } from '../../projectCanvasController'
import { Button } from '../ui/button'
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from '../ui/popover'

interface ProjectCanvasArrangePopoverProps {
  locale: AppLocale
  selectedNodeCount: number
  onAlign: (alignment: CanvasAlignment) => void
  onArrange: (arrangement: CanvasArrangement) => void
  onDistribute: (distribution: CanvasDistribution) => void
}

const ALIGNMENT_ACTIONS: readonly [CanvasAlignment, TranslationKey, Icon][] = [
  ['left', 'projectCanvas.alignLeft', AlignLeft],
  ['center', 'projectCanvas.alignCenter', AlignCenterHorizontal],
  ['right', 'projectCanvas.alignRight', AlignRight],
  ['top', 'projectCanvas.alignTop', AlignTop],
  ['middle', 'projectCanvas.alignMiddle', AlignCenterVertical],
  ['bottom', 'projectCanvas.alignBottom', AlignBottom],
]

export function ProjectCanvasArrangePopover({
  locale,
  selectedNodeCount,
  onAlign,
  onArrange,
  onDistribute,
}: ProjectCanvasArrangePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button type="button" size="icon-sm" variant="outline" aria-label={translate(locale, 'projectCanvas.arrangeObjects')} data-testid="project-canvas-arrange-trigger">
          <Stack size={14} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="project-canvas-arrange-popover" align="center" side="top" sideOffset={12}>
        <PopoverHeader>
          <PopoverTitle>{translate(locale, 'projectCanvas.arrangeObjects')}</PopoverTitle>
        </PopoverHeader>
        <div role="group" aria-label={translate(locale, 'projectCanvas.alignment')}>
          {ALIGNMENT_ACTIONS.map(([alignment, label, AlignmentIcon]) => (
            <Button key={alignment} type="button" size="icon-sm" variant="ghost" aria-label={translate(locale, label)} onClick={() => onAlign(alignment)}>
              <AlignmentIcon size={15} />
            </Button>
          ))}
        </div>
        <div role="group" aria-label={translate(locale, 'projectCanvas.distribution')}>
          <Button type="button" size="icon-sm" variant="ghost" disabled={selectedNodeCount < 3} aria-label={translate(locale, 'projectCanvas.distributeHorizontal')} onClick={() => onDistribute('horizontal')}>
            <ArrowsOutLineHorizontal size={15} />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" disabled={selectedNodeCount < 3} aria-label={translate(locale, 'projectCanvas.distributeVertical')} onClick={() => onDistribute('vertical')}>
            <ArrowsOutLineVertical size={15} />
          </Button>
        </div>
        <div role="group" aria-label={translate(locale, 'projectCanvas.stacking')}>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={translate(locale, 'projectCanvas.bringToFront')} onClick={() => onArrange('front')}>
            <StackPlus size={15} />
          </Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={translate(locale, 'projectCanvas.sendToBack')} onClick={() => onArrange('back')}>
            <StackMinus size={15} />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
