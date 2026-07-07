import { createContext, useContext } from 'react'

const EditorFloatingPortalContext = createContext<HTMLElement | null>(null)

export const EditorFloatingPortalProvider = EditorFloatingPortalContext.Provider

export function useEditorFloatingPortal() {
  return useContext(EditorFloatingPortalContext)
}
