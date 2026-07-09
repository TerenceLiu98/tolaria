import { Minus, Trash } from '@phosphor-icons/react'
import { translate, type AppLocale } from '../../lib/i18n'
import type { ProjectCanvas, ProjectCanvasEdgeKind, ProjectCanvasNode } from '../../projectCanvas'
import { Button } from '../ui/button'
import { Checkbox } from '../ui/checkbox'
import { Input } from '../ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select'
import { Textarea } from '../ui/textarea'
import { EDGE_KINDS, edgeKindKey, nodeKindKey } from './projectCanvasDisplay'

interface ProjectCanvasInspectorProps {
  canvas: ProjectCanvas
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
  canvas,
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
  const counts = canvas.nodes.reduce<Record<string, number>>((result, item) => ({
    ...result,
    [item.type]: (result[item.type] ?? 0) + 1,
  }), {})
  return (
    <aside className="project-canvas-inspector" aria-label={translate(locale, 'projectCanvas.inspector')}>
      <div className="project-canvas-inspector__header">
        <div>
          <div className="project-canvas-inspector__eyebrow">
            {node
              ? translate(locale, nodeKindKey(node))
              : edge
                ? translate(locale, 'projectCanvas.edgeLabel')
                : translate(locale, 'projectCanvas.projectSummary')}
          </div>
          <div className="project-canvas-inspector__title">
            {node ? (node.title ?? node.ref ?? node.id) : edge ? edge.id : translate(locale, 'projectCanvas.workspace')}
          </div>
        </div>
        {node || edge ? (
          <Button type="button" size="icon-sm" variant="ghost" aria-label={translate(locale, 'projectCanvas.closeInspector')} onClick={onClose}>
            <Minus size={14} />
          </Button>
        ) : null}
      </div>
      {!node && !edge ? (
        <div className="project-canvas-inspector__body">
          <div className="project-canvas-inspector__stats">
            <ProjectCanvasStat label={translate(locale, 'projectCanvas.node.note')} value={counts.note ?? 0} />
            <ProjectCanvasStat label={translate(locale, 'projectCanvas.node.paper')} value={counts.paper ?? 0} />
            <ProjectCanvasStat label={translate(locale, 'projectCanvas.node.paper_block')} value={counts.paper_block ?? 0} />
            <ProjectCanvasStat label={translate(locale, 'projectCanvas.node.image')} value={counts.image ?? 0} />
            <ProjectCanvasStat label={translate(locale, 'projectCanvas.node.task')} value={counts.task ?? 0} />
            <ProjectCanvasStat label={translate(locale, 'projectCanvas.edgeLabel')} value={canvas.edges.length} />
          </div>
          <div className="project-canvas-inspector__hint">{translate(locale, 'projectCanvas.summaryHint')}</div>
        </div>
      ) : null}
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

function ProjectCanvasStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="project-canvas-inspector__stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
      {node.type === 'task' ? (
        <label className="project-canvas-inspector__checkbox">
          <Checkbox
            checked={node.completed === true}
            onCheckedChange={checked => onNodeChange({ completed: checked === true }, true)}
          />
          <span>{translate(locale, 'projectCanvas.taskCompleted')}</span>
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
      {node.type === 'image' ? (
        <label className="project-canvas-inspector__field">
          <span>{translate(locale, 'projectCanvas.imagePath')}</span>
          <Input
            value={node.ref ?? ''}
            placeholder={translate(locale, 'projectCanvas.addPlaceholder.image')}
            onChange={event => onNodeChange({ ref: event.target.value || undefined })}
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
