import type React from 'react'
import { LineSegment, PushPin, X } from '@phosphor-icons/react'
import { translate, type AppLocale } from '../../lib/i18n'
import { cn } from '../../lib/utils'
import type { ProjectCanvasNode, ProjectCanvasResolvedRef } from '../../projectCanvas'
import type { VaultEntry } from '../../types'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Textarea } from '../ui/textarea'
import { boundedSnippet, paperSubtitle } from './projectCanvasEntryPreview'
import { nodeKindKey, type ProjectCanvasNodePresentation } from './projectCanvasDisplay'
import { imageSourceForNode, nodeIsEmbedded } from './projectCanvasNodeModel'
import { ProjectDocumentPreview } from './ProjectDocumentPreview'

interface ProjectCanvasNodeCardProps {
  editing: boolean
  editorHostRef?: (element: HTMLDivElement | null) => void
  entry: VaultEntry | null
  locale: AppLocale
  node: ProjectCanvasNode
  onClick: (event: React.MouseEvent<HTMLElement>) => void
  onCloseTemporary?: () => void
  onConnectPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void
  onDoubleClick: () => void
  onNavigateWikilink: (target: string) => void
  onPinTemporary?: () => void
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void
  onSelect: (event: React.MouseEvent<HTMLButtonElement>) => void
  onTextBlur: () => void
  onTextChange: (text: string) => void
  onToggleTask: () => void
  presentation: ProjectCanvasNodePresentation
  resolved?: ProjectCanvasResolvedRef
  selected: boolean
  temporary?: boolean
  vaultPath: string
}

export function ProjectCanvasNodeCard({
  editing,
  editorHostRef,
  entry,
  locale,
  node,
  onClick,
  onCloseTemporary,
  onConnectPointerDown,
  onDoubleClick,
  onNavigateWikilink,
  onPinTemporary,
  onPointerDown,
  onResizePointerDown,
  onSelect,
  onTextBlur,
  onTextChange,
  onToggleTask,
  presentation,
  resolved,
  selected,
  temporary = false,
  vaultPath,
}: ProjectCanvasNodeCardProps) {
  const isEmbedded = nodeIsEmbedded(node)
  const isStale = resolved?.state === 'stale'
  const title = node.title ?? entry?.title ?? resolved?.targetTitle ?? node.ref ?? translate(locale, 'projectCanvas.untitledNode')
  const subtitle = entry?.isA === 'Paper' ? paperSubtitle(entry) : null
  const snippet = node.type === 'paper_block'
    ? boundedSnippet(node.text ?? resolved?.message ?? null)
    : boundedSnippet(node.text ?? entry?.snippet ?? null)
  const imageSource = node.type === 'image' ? imageSourceForNode(node, vaultPath) : null

  return (
    <article
      className={cn(
        'project-canvas-node',
        `project-canvas-node--type-${node.type}`,
        isStale && 'project-canvas-node--stale',
        selected && 'project-canvas-node--selected',
        editing && 'project-canvas-node--editing',
        temporary && 'project-canvas-node--temporary',
        `project-canvas-node--${presentation}`,
      )}
      data-presentation={presentation}
      data-testid={temporary ? 'project-canvas-peek-node' : 'project-canvas-node'}
      data-node-id={node.id}
      style={{ left: node.x, top: node.y, width: node.width, height: node.height }}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
    >
      <div className="project-canvas-node__body">
        <div className="project-canvas-node__header">
          <span className="project-canvas-node__kind">{translate(locale, nodeKindKey(node))}</span>
          <span className="project-canvas-node__header-actions">
            {temporary ? <span className="project-canvas-node__state project-canvas-node__state--peek">{translate(locale, 'projectCanvas.peekLabel')}</span> : null}
            {isStale ? <span className="project-canvas-node__state">{translate(locale, 'projectCanvas.stale')}</span> : null}
            {temporary && onPinTemporary ? (
              <Button type="button" size="icon-xs" variant="ghost" aria-label={translate(locale, 'projectCanvas.pinPeek')} onClick={(event) => {
                event.stopPropagation()
                onPinTemporary()
              }}>
                <PushPin size={12} />
              </Button>
            ) : null}
            {temporary && onCloseTemporary ? (
              <Button type="button" size="icon-xs" variant="ghost" aria-label={translate(locale, 'projectCanvas.closePeek')} onClick={(event) => {
                event.stopPropagation()
                onCloseTemporary()
              }}>
                <X size={12} />
              </Button>
            ) : null}
            <Button
              type="button"
              size="xs"
              variant={selected ? 'secondary' : 'ghost'}
              className="project-canvas-node__select"
              aria-label={selected ? translate(locale, 'projectCanvas.selected') : translate(locale, 'projectCanvas.selectSource')}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(event)
              }}
            >
              {translate(locale, 'projectCanvas.selectSource')}
            </Button>
          </span>
        </div>
        <div className="project-canvas-node__title">{title}</div>
        {subtitle && presentation !== 'overview' ? <div className="project-canvas-node__subtitle">{subtitle}</div> : null}
        {editing ? (
          <div className="project-canvas-node__editor-host" ref={editorHostRef} />
        ) : entry && (node.type === 'note' || node.type === 'paper') ? (
          <ProjectDocumentPreview active={presentation === 'preview'} entry={entry} locale={locale} onNavigateWikilink={onNavigateWikilink} />
        ) : null}
        {node.type === 'task' ? (
          <label className="project-canvas-node__task">
            <Checkbox checked={node.completed === true} onCheckedChange={onToggleTask} />
            <Textarea
              className="project-canvas-node__textarea"
              value={node.text ?? ''}
              onChange={(event) => onTextChange(event.target.value)}
              onBlur={onTextBlur}
              placeholder={translate(locale, 'projectCanvas.textPlaceholder')}
            />
          </label>
        ) : node.type === 'image' ? (
          <div className="project-canvas-node__image-frame">
            {imageSource ? (
              <img src={imageSource} alt={title} className="project-canvas-node__image" />
            ) : (
              <div className="project-canvas-node__image-empty">{translate(locale, 'projectCanvas.imageMissing')}</div>
            )}
          </div>
        ) : isEmbedded ? (
          <Textarea
            className="project-canvas-node__textarea"
            value={node.text ?? ''}
            onChange={(event) => onTextChange(event.target.value)}
            onBlur={onTextBlur}
            placeholder={translate(locale, 'projectCanvas.textPlaceholder')}
          />
        ) : snippet && presentation === 'card' ? (
          <div className="project-canvas-node__snippet">{snippet}</div>
        ) : null}
        {isStale && resolved?.message ? <div className="project-canvas-node__message">{resolved.message}</div> : null}
        {!isEmbedded && node.ref && presentation !== 'overview' ? (
          <div className="project-canvas-node__footer"><span>{node.ref}</span></div>
        ) : null}
      </div>
      {!temporary ? (
        <Button
          type="button"
          size="icon-sm"
          variant="secondary"
          className="project-canvas-node__connect"
          aria-label={translate(locale, 'projectCanvas.connectFrom', { title })}
          onPointerDown={onConnectPointerDown}
          onClick={event => event.stopPropagation()}
        >
          <LineSegment size={13} />
        </Button>
      ) : null}
      {!temporary ? <div className="project-canvas-node__resize" role="presentation" onPointerDown={onResizePointerDown} /> : null}
    </article>
  )
}
