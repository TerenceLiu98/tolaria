import { translate } from '../../lib/i18n'
import { Checkbox } from '../ui/checkbox'
import { Textarea } from '../ui/textarea'
import { boundedSnippet } from './projectCanvasEntryPreview'
import { imageSourceForNode } from './projectCanvasNodeModel'
import type { ProjectCanvasNodeRendererProps } from './ProjectCanvasNodeRenderer'
import { ProjectDocumentPreview } from './ProjectDocumentPreview'

export function ProjectCanvasDocumentNodeRenderer({
  editing,
  editorHostRef,
  entry,
  locale,
  onNavigateWikilink,
  presentation,
}: ProjectCanvasNodeRendererProps) {
  if (editing) return <div className="project-canvas-node__editor-host" ref={editorHostRef} />
  if (!entry) return null
  const snippet = boundedSnippet(entry.snippet)
  if (presentation === 'card') {
    return snippet ? <div className="project-canvas-node__snippet">{snippet}</div> : null
  }
  return (
    <ProjectDocumentPreview
      active={presentation === 'preview'}
      entry={entry}
      locale={locale}
      onNavigateWikilink={onNavigateWikilink}
    />
  )
}

export function ProjectCanvasPaperBlockNodeRenderer({
  node,
  presentation,
  resolved,
  spec,
}: ProjectCanvasNodeRendererProps) {
  const preview = spec.preview(node, presentation)
  const snippet = boundedSnippet(preview.text ?? resolved?.message ?? null)
  return snippet && presentation === 'card'
    ? <div className="project-canvas-node__snippet">{snippet}</div>
    : null
}

export function ProjectCanvasImageNodeRenderer({
  locale,
  node,
  title,
  vaultPath,
}: ProjectCanvasNodeRendererProps) {
  const source = imageSourceForNode(node, vaultPath)
  return (
    <div className="project-canvas-node__image-frame">
      {source ? (
        <img src={source} alt={title} className="project-canvas-node__image" loading="lazy" decoding="async" />
      ) : (
        <div className="project-canvas-node__image-empty">{translate(locale, 'projectCanvas.imageMissing')}</div>
      )}
    </div>
  )
}

export function ProjectCanvasTextNodeRenderer({
  locale,
  node,
  onTextBlur,
  onTextChange,
}: ProjectCanvasNodeRendererProps) {
  return (
    <Textarea
      className="project-canvas-node__textarea"
      value={node.text ?? ''}
      onChange={event => onTextChange(event.target.value)}
      onBlur={onTextBlur}
      placeholder={translate(locale, 'projectCanvas.textPlaceholder')}
    />
  )
}

export function ProjectCanvasTaskNodeRenderer(props: ProjectCanvasNodeRendererProps) {
  return (
    <label className="project-canvas-node__task">
      <Checkbox checked={props.node.completed === true} onCheckedChange={props.onToggleTask} />
      <ProjectCanvasTextNodeRenderer {...props} />
    </label>
  )
}
