import { createContext, useContext } from 'react'
import type { LibraryEntry, Note, Quote } from '@/types'
import type { StoredFile } from '@/types/canvas'

/**
 * Linked-entity lookup for the canvas.
 *
 * Book, note and quote cards render live data from the reading side rather than
 * a frozen copy, so editing a note updates its card. The editor loads these
 * once per page and hands them down, instead of every card firing its own read.
 */
export interface CanvasData {
  books: Map<string, LibraryEntry>
  notes: Map<string, Note>
  quotes: Map<string, Quote>
  files: Map<string, StoredFile>
  /** Object URLs for file blobs, revoked when the editor unmounts. */
  blobUrls: Map<string, string>
}

const EMPTY: CanvasData = {
  books: new Map(),
  notes: new Map(),
  quotes: new Map(),
  files: new Map(),
  blobUrls: new Map(),
}

export const CanvasDataContext = createContext<CanvasData>(EMPTY)

export function useCanvasData(): CanvasData {
  return useContext(CanvasDataContext)
}
