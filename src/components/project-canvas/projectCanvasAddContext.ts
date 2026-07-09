import { createContext, useContext } from 'react'
import type { ProjectCanvasAddRequest } from './projectCanvasAddRequests'

export type RequestProjectCanvasAdd = (request: ProjectCanvasAddRequest) => void

export const ProjectCanvasAddContext = createContext<RequestProjectCanvasAdd | null>(null)

export function useProjectCanvasAdd(): RequestProjectCanvasAdd | null {
  return useContext(ProjectCanvasAddContext)
}
