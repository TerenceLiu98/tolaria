import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '../mock-tauri'
import type { PaperAnnotation, PaperAnnotationLineError, PaperAnnotationsState } from './paperAnnotations'

export type {
  AnnotationsByBlockId,
  PaperAnnotation,
  PaperAnnotationColor,
  PaperAnnotationKind,
  PaperAnnotationLineError,
  PaperAnnotationParseResult,
  PaperAnnotationsState,
} from './paperAnnotations'
export {
  annotationsForBlock,
  createBlockAnnotation,
  createBlockAnnotationId,
  groupAnnotationsByBlockId,
  isPaperAnnotationColor,
  isPaperAnnotationKind,
  PAPER_ANNOTATION_COLORS,
  PAPER_ANNOTATION_KINDS,
  parsePaperAnnotationsJsonl,
  validatePaperAnnotation,
} from './paperAnnotations'

export interface PaperAnnotationsReadResult {
  paperId: string
  path: string
  state: PaperAnnotationsState
  annotations: PaperAnnotation[]
}

export interface PaperAnnotationsError {
  kind: string
  message: string
  paperId: string
  path: string
  lineErrors: PaperAnnotationLineError[]
}

function invokePaperAnnotationCommand<T>(command: string, args: Record<string, unknown>): Promise<T> {
  return isTauri()
    ? invoke<T>(command, args)
    : mockInvoke<T>(command, args)
}

export function loadPaperAnnotations(
  vaultPath: string,
  paperId: string,
): Promise<PaperAnnotationsReadResult> {
  return invokePaperAnnotationCommand<PaperAnnotationsReadResult>('read_paper_annotations', {
    vaultPath,
    paperId,
  })
}

export function savePaperAnnotation(
  vaultPath: string,
  paperId: string,
  annotation: PaperAnnotation,
): Promise<PaperAnnotationsReadResult> {
  return invokePaperAnnotationCommand<PaperAnnotationsReadResult>('save_paper_annotation', {
    vaultPath,
    paperId,
    annotation,
  })
}

export function deletePaperAnnotation(
  vaultPath: string,
  paperId: string,
  annotationId: string,
): Promise<PaperAnnotationsReadResult> {
  return invokePaperAnnotationCommand<PaperAnnotationsReadResult>('delete_paper_annotation', {
    vaultPath,
    paperId,
    annotationId,
  })
}
