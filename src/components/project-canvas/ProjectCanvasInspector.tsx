import { Minus, Trash } from '@phosphor-icons/react'
import { translate, type AppLocale } from '../../lib/i18n'
import type { ProjectCanvas, ProjectCanvasEdgeKind, ProjectCanvasNode } from '../../projectCanvas'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { EDGE_KINDS, edgeKindKey, nodeKindKey } from './projectCanvasDisplay'

interface ProjectCanvasInspectorProps {
  edge: ProjectCanvas['edges'][number] | null
  locale: AppLocale
  node: ProjectCanvasNode | null
  onClose: () => void
  onDeleteEdge: () => void
  onDeleteNode: () => void
  onEdgeChange: (patch: Partial<ProjectCanvas['edges'][number]>, persist?: boolean) => void
  onEdgeKindDefaultChange: (kind: ProjectCanvasEdgeKind) => void
  onNavigate?: () => void
  onNodeChange: (patch: Partial<ProjectCanvasNode>, persist?: boolean) => void
}

export function ProjectCanvasInspector({
  edge,
  locale,
  node,
  onClose,
  onDeleteEdge,
  onDeleteNode,
  onEdgeChange,
  onEdgeKindDefaultChange,
  onNavigate,
  onNodeChange,
}: ProjectCanvasInspectorProps) {
  if (!node && !edge) return null
  return (
    <aside className="project-canvas-inspector" aria-label={translate(locale, 'projectCanvas.inspector')}>
      <div className="project-canvas-inspector__header">
        <div>
          <div className="project-canvas-inspector__eyebrow">
            {node ? translate(locale, nodeKindKey(node)) : translate(locale, 'projectCanvas.edgeLabel')}
          </div>
          <div className="project-canvas-inspector__title">
            {node ? (node.title ?? node.ref ?? node.id) : (edge?.id ?? '')}
          </div>
        </div>
        <Button type="button" size="icon-sm" variant="ghost" aria-label={translate(locale, 'projectCanvas.closeInspector')} onClick={onClose}>
          <Minus size={14} />
        </Button>
      </div>
      {node ? (
        <ProjectCanvasNodeInspector
          locale={locale}
          node={node}
          onDelete={onDeleteNode}
          onNavigate={onNavigate}
          onNodeChange={onNodeChange}
        />
      ) : null}
      {edge ? (
        <ProjectCanvasEdgeInspector
          edge={edge}
          locale={locale}
          onDelete={onDeleteEdge}
          onEdgeChange={onEdgeChange}
          onEdgeKindDefaultChange={onEdgeKindDefaultChange}
        />
      ) : null}
    </aside>
  )
}

function ProjectCanvasNodeInspector({
  locale,
  node,
  onDelete,
  onNavigate,
  onNodeChange,
}: {
  locale: AppLocale
  node: ProjectCanvasNode
  onDelete: () => void
  onNavigate?: () => void
  onNodeChange: (patch: Partial<ProjectCanvasNode>, persist?: boolean) => void
}) {
  return (
    <div className="project-canvas-inspector__body">
      <label className="project-canvas-inspector__field">
        <span>{translate(locale, 'projectCanvas.inspectorTitle')}</span>
        <Input
          value={node.title ?? ''}
          placeholder={translate(locale, 'projectCanvas.untitledNode')}
          onChange={event => onNodeChange({ title: event.target.value || undefined })}
          onBlur={() => onNodeChange({}, true)}
        />
      </label>
      {node.ref ? (
        <label className="project-canvas-inspector__field">
          <span>{translate(locale, 'projectCanvas.inspectorReference')}</span>
          <Input value={node.ref} readOnly />
        </label>
      ) : null}
      {node.type === 'text' || node.type === 'task' || node.type === 'group' ? (
        <label className="project-canvas-inspector__field">
          <span>{translate(locale, 'projectCanvas.inspectorText')}</span>
          <Textarea
            value={node.text ?? ''}
            onChange={event => onNodeChange({ text: event.target.value || undefined })}
            onBlur={() => onNodeChange({}, true)}
          />
        </label>
      ) : null}
      <div className="project-canvas-inspector__actions">
        {onNavigate ? (
          <Button type="button" size="sm" variant="outline" onClick={onNavigate}>
            {translate(locale, 'projectCanvas.openNode')}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
          <Trash size={14} />
          {translate(locale, 'projectCanvas.deleteNode')}
        </Button>
      </div>
    </div>
  )
}

function ProjectCanvasEdgeInspector({
  edge,
  locale,
  onDelete,
  onEdgeChange,
  onEdgeKindDefaultChange,
}: {
  edge: ProjectCanvas['edges'][number]
  locale: AppLocale
  onDelete: () => void
  onEdgeChange: (patch: Partial<ProjectCanvas['edges'][number]>, persist?: boolean) => void
  onEdgeKindDefaultChange: (kind: ProjectCanvasEdgeKind) => void
}) {
  return (
    <div className="project-canvas-inspector__body">
      <label className="project-canvas-inspector__field">
        <span>{translate(locale, 'projectCanvas.edgeKind')}</span>
        <Select
          value={edge.kind}
          onValueChange={value => {
            const kind = value as ProjectCanvasEdgeKind
            onEdgeKindDefaultChange(kind)
            onEdgeChange({ kind }, true)
          }}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="end">
            {EDGE_KINDS.map(kind => (
              <SelectItem key={kind} value={kind}>
                {translate(locale, edgeKindKey(kind))}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </label>
      <label className="project-canvas-inspector__field">
        <span>{translate(locale, 'projectCanvas.inspectorNote')}</span>
        <Textarea
          value={edge.note ?? ''}
          onChange={event => onEdgeChange({ note: event.target.value || undefined })}
          onBlur={() => onEdgeChange({}, true)}
          placeholder={translate(locale, 'projectCanvas.edgeNotePlaceholder')}
        />
      </label>
      <div className="project-canvas-inspector__actions">
        <Button type="button" size="sm" variant="destructive" onClick={onDelete}>
          <Trash size={14} />
          {translate(locale, 'projectCanvas.deleteEdge')}
        </Button>
      </div>
    </div>
  )
}
