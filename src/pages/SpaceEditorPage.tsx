import {
  ArrowLeft,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Expand,
  FileText,
  Grid3x3,
  Layers,
  Magnet,
  Map as MapIcon,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  Presentation,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CanvasStage } from '@/components/canvas/CanvasStage'
import { CanvasToolbar } from '@/components/canvas/CanvasToolbar'
import { Minimap } from '@/components/canvas/Minimap'
import { PropertiesPanel } from '@/components/canvas/PropertiesPanel'
import { CanvasDataContext, type CanvasData } from '@/components/canvas/CanvasData'
import { boundsOf, objectRect } from '@/components/canvas/geometry'
import { UPLOAD_ACCEPT, useCanvasFiles } from '@/components/canvas/useCanvasFiles'
import { AddFromLibraryDialog } from '@/components/canvas/AddFromLibraryDialog'
import { PdfViewer } from '@/components/canvas/PdfViewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { EmptyState, PageLoader } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as spaceRepo from '@/data/spaces'
import * as repo from '@/data/repository'
import { useCanvas } from '@/stores/canvas'
import { useSession } from '@/stores/session'
import { useTabs } from '@/stores/tabs'
import { bump } from '@/stores/data'
import type { SpaceObject, StoredFile } from '@/types/canvas'
import { cn } from '@/lib/utils'

export function SpaceEditorPage() {
  const { spaceId = '' } = useParams()
  const [search, setSearch] = useSearchParams()
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const renameTab = useTabs((s) => s.rename)

  const stageWrapRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const [stageSize, setStageSize] = useState({ width: 1200, height: 800 })
  const [focusMode, setFocusMode] = useState(false)
  const [presenting, setPresenting] = useState(false)
  const [presentIndex, setPresentIndex] = useState(0)
  const [findOpen, setFindOpen] = useState(false)
  const [findQuery, setFindQuery] = useState('')
  const [addFromLibrary, setAddFromLibrary] = useState(false)
  const [openFileId, setOpenFileId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [nameDraft, setNameDraft] = useState('')

  const load = useCanvas((s) => s.load)
  const switchPage = useCanvas((s) => s.switchPage)
  const teardown = useCanvas((s) => s.teardown)
  const flush = useCanvas((s) => s.flush)
  const space = useCanvas((s) => s.space)
  const pages = useCanvas((s) => s.pages)
  const pageId = useCanvas((s) => s.pageId)
  const objects = useCanvas((s) => s.objects)
  const selection = useCanvas((s) => s.selection)
  const viewport = useCanvas((s) => s.viewport)
  const saveState = useCanvas((s) => s.saveState)
  const showMinimap = useCanvas((s) => s.showMinimap)
  const showGrid = useCanvas((s) => s.showGrid)
  const snapEnabled = useCanvas((s) => s.snapEnabled)
  const store = useCanvas

  /* ------------------------------------------------------------- linked data */

  const [canvasData, setCanvasData] = useState<CanvasData>(() => ({
    books: new Map(),
    notes: new Map(),
    quotes: new Map(),
    files: new Map(),
    blobUrls: new Map(),
  }))

  const refreshLinkedData = useCallback(async () => {
    const [entries, notes, quotes, files] = await Promise.all([
      repo.listLibrary(profile.id),
      repo.listNotes(profile.id),
      repo.listQuotes(profile.id),
      spaceRepo.listFiles(profile.id),
    ])
    setCanvasData((previous) => {
      const blobUrls = new Map(previous.blobUrls)
      for (const file of files) {
        if (file.mimeType.startsWith('image/') && !blobUrls.has(file.id)) {
          blobUrls.set(file.id, URL.createObjectURL(file.blob))
        }
      }
      return {
        books: new Map(entries.map((e) => [e.book.id, e])),
        notes: new Map(notes.map((n) => [n.id, n])),
        quotes: new Map(quotes.map((q) => [q.id, q])),
        files: new Map(files.map((f) => [f.id, f])),
        blobUrls,
      }
    })
  }, [profile.id])

  /* ------------------------------------------------------------------- load */

  const { data, loading, error } = useAsync(async () => {
    const found = await spaceRepo.getSpace(profile.id, spaceId)
    if (!found) return null
    const spacePages = await spaceRepo.listPages(profile.id, found.id)
    if (!spacePages.length) return null
    const requested = search.get('page')
    const initial =
      spacePages.find((p) => p.id === requested)?.id ?? spacePages[0].id
    await load(profile.id, found, spacePages, initial)
    await refreshLinkedData()
    return { space: found, pages: spacePages }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.id, spaceId])

  useTab({
    title: data?.space.name ?? null,
    kind: 'page',
    icon: 'space',
    entityId: spaceId,
  })

  useEffect(() => {
    if (space?.name) renameTab(`/spaces/${spaceId}`, space.name)
  }, [space?.name, spaceId, renameTab])

  // Flush pending canvas writes and release blob URLs on the way out.
  useEffect(() => {
    return () => {
      const session = useCanvas.getState().sessionId
      void flush().then(() => teardown(session))
      setCanvasData((current) => {
        for (const url of current.blobUrls.values()) URL.revokeObjectURL(url)
        return current
      })
    }
  }, [flush, teardown])

  useEffect(() => {
    const element = stageWrapRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setStageSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  /* ------------------------------------------------------------------ files */

  const { addFiles } = useCanvasFiles({
    userId: profile.id,
    onFileStored: (file: StoredFile, objectUrl) => {
      setCanvasData((previous) => {
        const files = new Map(previous.files)
        files.set(file.id, file)
        const blobUrls = new Map(previous.blobUrls)
        if (objectUrl) blobUrls.set(file.id, objectUrl)
        return { ...previous, files, blobUrls }
      })
    },
  })

  const dropPoint = useCallback(
    (event: { clientX: number; clientY: number }) => {
      const rect = stageWrapRef.current!.getBoundingClientRect()
      const state = store.getState()
      return {
        x: (event.clientX - rect.left) / state.viewport.zoom + state.viewport.x,
        y: (event.clientY - rect.top) / state.viewport.zoom + state.viewport.y,
      }
    },
    [store],
  )

  const centrePoint = useCallback(() => {
    const state = store.getState()
    return {
      x: state.viewport.x + stageSize.width / (2 * state.viewport.zoom) - 120,
      y: state.viewport.y + stageSize.height / (2 * state.viewport.zoom) - 90,
    }
  }, [store, stageSize])

  /* -------------------------------------------------------------- shortcuts */

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      const typing =
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      const state = store.getState()
      const meta = event.metaKey || event.ctrlKey

      if (presenting) {
        if (event.key === 'Escape') setPresenting(false)
        if (event.key === 'ArrowRight' || event.key === ' ') {
          event.preventDefault()
          setPresentIndex((i) => i + 1)
        }
        if (event.key === 'ArrowLeft') setPresentIndex((i) => Math.max(0, i - 1))
        return
      }

      if (meta && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setFindOpen(true)
        return
      }
      if (typing) return

      if (meta && event.key.toLowerCase() === 'z') {
        event.preventDefault()
        if (event.shiftKey) state.redo()
        else state.undo()
        return
      }
      if (meta && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        state.selectAll()
        return
      }
      if (meta && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        state.duplicateSelection()
        return
      }
      if (meta && event.key.toLowerCase() === 'g') {
        event.preventDefault()
        if (event.shiftKey) state.ungroup()
        else state.group()
        return
      }
      if (meta && event.key === '0') {
        event.preventDefault()
        state.zoomTo(1, { x: 0, y: 0, ...stageSize })
        return
      }
      if (meta && (event.key === '=' || event.key === '+')) {
        event.preventDefault()
        state.zoomTo(state.viewport.zoom * 1.2, { x: 0, y: 0, ...stageSize })
        return
      }
      if (meta && event.key === '-') {
        event.preventDefault()
        state.zoomTo(state.viewport.zoom / 1.2, { x: 0, y: 0, ...stageSize })
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (state.selection.length) {
          event.preventDefault()
          state.deleteSelection()
        }
        return
      }
      if (event.key === 'Escape') {
        state.setTool('select')
        state.clearSelection()
        setContextMenu(null)
        return
      }

      // Nudge with arrows; Shift moves further.
      if (event.key.startsWith('Arrow') && state.selection.length) {
        event.preventDefault()
        const step = event.shiftKey ? 10 : 1
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
        const selected = state.objects.filter(
          (o) => state.selection.includes(o.id) && !o.locked,
        )
        state.updateObjects(
          selected.map((o) => ({ id: o.id, changes: { x: o.x + dx, y: o.y + dy } })),
          { history: true },
        )
        return
      }

      const toolKeys: Record<string, Parameters<typeof state.setTool>[0]> = {
        v: 'select',
        h: 'hand',
        q: 'lasso',
        t: 'text',
        n: 'sticky',
        r: 'shape',
        c: 'connector',
        p: 'pen',
        e: 'eraser',
        f: 'frame',
        b: 'table',
      }
      const tool = toolKeys[event.key.toLowerCase()]
      if (tool && !meta) {
        event.preventDefault()
        state.setTool(tool)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [store, stageSize, presenting])

  /* ------------------------------------------------------------ clipboard */

  useEffect(() => {
    const onPaste = async (event: ClipboardEvent) => {
      const target = event.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }
      const state = store.getState()
      if (!state.space || !state.pageId) return

      const files = Array.from(event.clipboardData?.files ?? [])
      if (files.length) {
        event.preventDefault()
        await addFiles(files, centrePoint())
        return
      }

      const text = event.clipboardData?.getData('text/plain')?.trim()
      if (!text) return
      event.preventDefault()
      const point = centrePoint()

      if (/^https?:\/\/\S+$/i.test(text)) {
        // No metadata fetch: cross-origin scraping is blocked in the browser,
        // so the card shows the URL itself rather than a faked title.
        state.createObject({
          type: 'link',
          x: point.x,
          y: point.y,
          content: { url: text, title: '' },
        })
        toast.success('Link card added')
      } else {
        state.createObject({
          type: 'sticky',
          x: point.x,
          y: point.y,
          content: { text },
          style: { fill: '#FDE9A9', color: '#4A3B12', fontSize: 15 },
        })
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [store, addFiles, centrePoint])

  /* --------------------------------------------------------------- actions */

  const fitToContent = () => {
    const bounds = boundsOf(objects.filter((o) => o.type !== 'connector'))
    store.getState().fitTo(bounds, stageSize.width, stageSize.height)
  }

  const fitToSelection = () => {
    const selected = objects.filter((o) => selection.includes(o.id))
    if (!selected.length) return
    store.getState().fitTo(boundsOf(selected), stageSize.width, stageSize.height)
  }

  const addPage = async () => {
    const page = await spaceRepo.createPage(profile.id, spaceId, `Page ${pages.length + 1}`)
    const next = await spaceRepo.listPages(profile.id, spaceId)
    useCanvas.setState({ pages: next })
    await switchPage(profile.id, page.id)
    setSearch({ page: page.id }, { replace: true })
    bump('spaces')
  }

  const removePage = async (id: string) => {
    try {
      await spaceRepo.deletePage(profile.id, id)
      const next = await spaceRepo.listPages(profile.id, spaceId)
      useCanvas.setState({ pages: next })
      if (pageId === id) await switchPage(profile.id, next[0].id)
      bump('spaces')
    } catch (caught) {
      toast.error(
        'Could not delete the page',
        caught instanceof Error ? caught.message : undefined,
      )
    }
  }

  const saveSelectionAsTemplate = async () => {
    const selected = objects.filter((o) => selection.includes(o.id))
    if (!selected.length) {
      toast.error('Select some objects first')
      return
    }
    const name = window.prompt('Template name', `${space?.name} layout`)
    if (!name) return
    await spaceRepo.saveTemplate(profile.id, {
      name,
      category: 'Custom',
      objects: selected,
    })
    bump('templates')
    toast.success('Saved to your templates')
  }

  const exportJson = () => {
    const payload = {
      space: { name: space?.name, kind: space?.kind },
      page: pages.find((p) => p.id === pageId)?.name,
      objects,
      exportedAt: new Date().toISOString(),
    }
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = `${space?.name ?? 'space'}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  /* --------------------------------------------------------------- finding */

  const findHits = useMemo(() => {
    const query = findQuery.trim().toLowerCase()
    if (!query) return []
    return objects.filter((object) => {
      const text = [
        object.content.text,
        object.content.title,
        object.content.url,
        canvasData.files.get(object.content.fileId as string)?.name,
        canvasData.notes.get(object.content.noteId as string)?.title,
        canvasData.quotes.get(object.content.quoteId as string)?.text,
        canvasData.books.get(object.content.bookId as string)?.book.title,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return text.includes(query)
    })
  }, [findQuery, objects, canvasData])

  const goToObject = (object: SpaceObject) => {
    store.getState().fitTo(objectRect(object), stageSize.width, stageSize.height)
    store.getState().select([object.id])
  }

  /* ------------------------------------------------------------ presenting */

  const frames = useMemo(
    () => objects.filter((o) => o.type === 'frame').sort((a, b) => a.x - b.x || a.y - b.y),
    [objects],
  )

  useEffect(() => {
    if (!presenting || !frames.length) return
    const frame = frames[Math.min(presentIndex, frames.length - 1)]
    store.getState().fitTo(objectRect(frame), stageSize.width, stageSize.height)
  }, [presenting, presentIndex, frames, stageSize, store])

  /* ----------------------------------------------------------------- render */

  if (loading && !data) return <PageLoader label="Opening Space" />
  if (error || !data) {
    return (
      <div className="p-8">
        <EmptyState
          title="Space not found"
          description="It may have been deleted, or the link is out of date."
          actions={
            <Button asChild variant="primary">
              <Link to="/spaces">Back to Spaces</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const zoomPercent = Math.round(viewport.zoom * 100)

  return (
    <CanvasDataContext.Provider value={canvasData}>
      <div
        className={cn(
          'relative flex h-full min-h-0 flex-col',
          focusMode && 'fixed inset-0 z-50 bg-bg',
        )}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const files = Array.from(event.dataTransfer.files)
          if (files.length) void addFiles(files, dropPoint(event))
        }}
      >
        {/* ------------------------------------------------------------ header */}
        {!presenting && (
          <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border px-3">
            <Button size="icon-sm" variant="ghost" asChild aria-label="Back to Spaces">
              <Link to="/spaces">
                <ArrowLeft />
              </Link>
            </Button>

            {renaming ? (
              <Input
                autoFocus
                value={nameDraft}
                onChange={(event) => setNameDraft(event.target.value)}
                onBlur={async () => {
                  setRenaming(false)
                  if (nameDraft.trim() && nameDraft !== space?.name) {
                    const next = await spaceRepo.updateSpace(profile.id, spaceId, {
                      name: nameDraft.trim(),
                    })
                    useCanvas.setState({ space: next })
                    bump('spaces')
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur()
                  if (event.key === 'Escape') setRenaming(false)
                }}
                className="h-7 w-64 text-[13px]"
                aria-label="Space name"
              />
            ) : (
              <button
                type="button"
                onDoubleClick={() => {
                  setNameDraft(space?.name ?? '')
                  setRenaming(true)
                }}
                className="max-w-72 truncate rounded px-1 text-[13px] font-medium text-text hover:bg-surface-hover"
                title="Double-click to rename"
              >
                {space?.name}
              </button>
            )}

            <span
              className={cn(
                'text-[11px]',
                saveState === 'offline' ? 'text-danger' : 'text-text-faint',
              )}
            >
              {saveState === 'saving'
                ? 'Saving…'
                : saveState === 'saved'
                  ? 'Saved'
                  : saveState === 'offline'
                    ? 'Changes not synced'
                    : ''}
            </span>

            <div className="flex-1" />

            {space?.bookId && (
              <Button size="sm" variant="ghost" asChild>
                <Link to={`/books/${space.bookId}`}>
                  <BookOpen /> Open book
                </Link>
              </Button>
            )}

            <Button size="sm" variant="secondary" onClick={() => setAddFromLibrary(true)}>
              <Plus /> Add from library
            </Button>

            <Button
              size="sm"
              variant="secondary"
              disabled={!frames.length}
              title={frames.length ? 'Present frames in order' : 'Add a frame to present'}
              onClick={() => {
                setPresentIndex(0)
                setPresenting(true)
              }}
            >
              <Presentation /> Present
            </Button>

            <Menu>
              <MenuTrigger asChild>
                <Button size="icon-sm" variant="ghost" aria-label="Space menu">
                  <MoreHorizontal />
                </Button>
              </MenuTrigger>
              <MenuContent align="end" className="w-60">
                <MenuItem onSelect={() => setFocusMode((v) => !v)}>
                  <Maximize2 /> {focusMode ? 'Exit focus mode' : 'Focus mode'}
                </MenuItem>
                <MenuItem onSelect={() => setFindOpen(true)}>
                  <Search /> Find on canvas
                </MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={() => store.getState().toggleGrid()}>
                  <Grid3x3 /> {showGrid ? 'Hide grid' : 'Show grid'}
                </MenuItem>
                <MenuItem onSelect={() => store.getState().toggleSnap()}>
                  <Magnet /> {snapEnabled ? 'Disable snapping' : 'Enable snapping'}
                </MenuItem>
                <MenuItem onSelect={() => store.getState().toggleMinimap()}>
                  <MapIcon /> {showMinimap ? 'Hide minimap' : 'Show minimap'}
                </MenuItem>
                <MenuSeparator />
                <MenuItem onSelect={saveSelectionAsTemplate}>
                  <Layers /> Save selection as template
                </MenuItem>
                <MenuItem onSelect={exportJson}>
                  <Download /> Export page as JSON
                </MenuItem>
                <MenuSeparator />
                <MenuItem
                  onSelect={async () => {
                    const copy = await spaceRepo.duplicateSpace(profile.id, spaceId)
                    bump('spaces')
                    navigate(`/spaces/${copy.id}`)
                  }}
                >
                  <Copy /> Duplicate Space
                </MenuItem>
                <MenuItem
                  destructive
                  onSelect={async () => {
                    await spaceRepo.deleteSpace(profile.id, spaceId)
                    bump('spaces')
                    toast.success('Space deleted')
                    navigate('/spaces')
                  }}
                >
                  <Trash2 /> Delete Space
                </MenuItem>
              </MenuContent>
            </Menu>
          </header>
        )}

        {/* ------------------------------------------------------- pages strip */}
        {!presenting && (
          <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-bg-subtle px-3">
            {pages.map((page) => (
              <div key={page.id} className="group flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => {
                    void switchPage(profile.id, page.id)
                    setSearch({ page: page.id }, { replace: true })
                  }}
                  onDoubleClick={async () => {
                    const name = window.prompt('Page name', page.name)
                    if (!name) return
                    await spaceRepo.renamePage(profile.id, page.id, name)
                    useCanvas.setState({
                      pages: await spaceRepo.listPages(profile.id, spaceId),
                    })
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-[12px] transition-colors',
                    page.id === pageId
                      ? 'bg-surface text-text shadow-[var(--shadow-sm)]'
                      : 'text-text-muted hover:bg-surface-hover hover:text-text',
                  )}
                >
                  {page.name}
                </button>
                {pages.length > 1 && (
                  <button
                    type="button"
                    aria-label={`Delete ${page.name}`}
                    onClick={() => removePage(page.id)}
                    className="ml-0.5 rounded p-0.5 text-text-faint opacity-0 transition-opacity hover:text-danger group-hover:opacity-100"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addPage}
              aria-label="Add page"
              className="flex size-6 shrink-0 items-center justify-center rounded-md text-text-faint hover:bg-surface-hover hover:text-text"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------ canvas */}
        <div ref={stageWrapRef} className="relative min-h-0 flex-1">
          <CanvasStage
            onOpenFile={setOpenFileId}
            onContextMenu={({ x, y }) => setContextMenu({ x, y })}
          />

          {/* Toolbar */}
          {!presenting && (
            <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
              <CanvasToolbar
                onUpload={() => fileInputRef.current?.click()}
                onInsertImage={() => imageInputRef.current?.click()}
              />
            </div>
          )}

          {/* Properties */}
          {!presenting && selection.length > 0 && (
            <div className="pointer-events-none absolute right-3 top-3">
              <PropertiesPanel />
            </div>
          )}

          {/* Zoom */}
          {!presenting && (
            <div className="pointer-events-auto absolute bottom-4 left-3 flex items-center gap-1 rounded-lg border border-border bg-surface p-1 shadow-[var(--shadow-md)]">
              <button
                type="button"
                aria-label="Zoom out"
                onClick={() =>
                  store.getState().zoomTo(viewport.zoom / 1.2, { x: 0, y: 0, ...stageSize })
                }
                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text"
              >
                <Minus className="size-3.5" />
              </button>
              <Menu>
                <MenuTrigger asChild>
                  <button
                    type="button"
                    className="min-w-12 rounded-md px-1 text-[12px] tabular-nums text-text-muted hover:bg-surface-hover hover:text-text"
                  >
                    {zoomPercent}%
                  </button>
                </MenuTrigger>
                <MenuContent side="top" align="start" className="w-52">
                  <MenuItem onSelect={fitToContent}>
                    <Expand /> Fit to content
                  </MenuItem>
                  <MenuItem onSelect={fitToSelection} disabled={!selection.length}>
                    <Expand /> Fit to selection
                  </MenuItem>
                  <MenuSeparator />
                  <MenuLabel>Zoom</MenuLabel>
                  {[0.25, 0.5, 1, 1.5, 2].map((level) => (
                    <MenuItem
                      key={level}
                      onSelect={() =>
                        store.getState().zoomTo(level, { x: 0, y: 0, ...stageSize })
                      }
                    >
                      {level * 100}%
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <button
                type="button"
                aria-label="Zoom in"
                onClick={() =>
                  store.getState().zoomTo(viewport.zoom * 1.2, { x: 0, y: 0, ...stageSize })
                }
                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text"
              >
                <Plus className="size-3.5" />
              </button>
              <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
              <button
                type="button"
                aria-label="Fit to content"
                title="Fit to content"
                onClick={fitToContent}
                className="flex size-7 items-center justify-center rounded-md text-text-muted hover:bg-surface-hover hover:text-text"
              >
                <Expand className="size-3.5" />
              </button>
            </div>
          )}

          {/* Minimap */}
          {!presenting && showMinimap && (
            <div className="absolute bottom-4 right-3">
              <Minimap stageSize={stageSize} />
            </div>
          )}

          {/* Find */}
          {findOpen && !presenting && (
            <div className="absolute left-1/2 top-3 w-80 -translate-x-1/2 rounded-xl border border-border bg-surface p-2 shadow-[var(--shadow-lg)]">
              <div className="flex items-center gap-2">
                <Search className="size-3.5 shrink-0 text-text-faint" />
                <input
                  autoFocus
                  value={findQuery}
                  onChange={(event) => setFindQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setFindOpen(false)
                    if (event.key === 'Enter' && findHits[0]) goToObject(findHits[0])
                  }}
                  placeholder="Find on this page"
                  aria-label="Find on canvas"
                  className="h-7 flex-1 bg-transparent text-[13px] text-text placeholder:text-text-faint focus:outline-none"
                />
                <button
                  type="button"
                  aria-label="Close find"
                  onClick={() => setFindOpen(false)}
                  className="rounded p-0.5 text-text-faint hover:text-text"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {findQuery && (
                <div className="mt-1 max-h-56 overflow-y-auto border-t border-border pt-1">
                  {findHits.length === 0 ? (
                    <p className="px-2 py-3 text-center text-[12px] text-text-faint">
                      Nothing on this page matches.
                    </p>
                  ) : (
                    findHits.slice(0, 12).map((object) => (
                      <button
                        key={object.id}
                        type="button"
                        onClick={() => goToObject(object)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px] hover:bg-surface-hover"
                      >
                        <FileText className="size-3 shrink-0 text-text-faint" />
                        <span className="truncate">
                          {String(
                            object.content.text ||
                              object.content.title ||
                              object.content.url ||
                              canvasData.files.get(object.content.fileId as string)?.name ||
                              object.type,
                          )}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Presentation controls */}
          {presenting && (
            <div className="absolute inset-x-0 bottom-6 flex items-center justify-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-2 shadow-[var(--shadow-lg)]">
                <button
                  type="button"
                  aria-label="Previous frame"
                  onClick={() => setPresentIndex((i) => Math.max(0, i - 1))}
                  disabled={presentIndex === 0}
                  className="rounded-full p-1 text-text-muted hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronLeft className="size-4" />
                </button>
                <span className="min-w-16 text-center text-[12px] tabular-nums text-text-muted">
                  {Math.min(presentIndex + 1, frames.length)} / {frames.length}
                </span>
                <button
                  type="button"
                  aria-label="Next frame"
                  onClick={() =>
                    setPresentIndex((i) => Math.min(frames.length - 1, i + 1))
                  }
                  disabled={presentIndex >= frames.length - 1}
                  className="rounded-full p-1 text-text-muted hover:bg-surface-hover disabled:opacity-40"
                >
                  <ChevronRight className="size-4" />
                </button>
                <span className="mx-1 h-4 w-px bg-border" aria-hidden />
                <button
                  type="button"
                  onClick={() => setPresenting(false)}
                  className="text-[12px] font-medium text-text-muted hover:text-text"
                >
                  Exit
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <CanvasContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            onClose={() => setContextMenu(null)}
            onSaveTemplate={saveSelectionAsTemplate}
          />
        )}

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={UPLOAD_ACCEPT}
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length) void addFiles(files, centrePoint())
            event.target.value = ''
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          multiple
          accept="image/*"
          className="hidden"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            if (files.length) void addFiles(files, centrePoint())
            event.target.value = ''
          }}
        />

        <AddFromLibraryDialog
          open={addFromLibrary}
          onOpenChange={setAddFromLibrary}
          at={centrePoint}
          onAdded={refreshLinkedData}
        />

        {openFileId && (
          <PdfViewer
            file={canvasData.files.get(openFileId) ?? null}
            onClose={() => setOpenFileId(null)}
          />
        )}
      </div>
    </CanvasDataContext.Provider>
  )
}

/* ---------------------------------------------------------- context menu */

function CanvasContextMenu({
  x,
  y,
  onClose,
  onSaveTemplate,
}: {
  x: number
  y: number
  onClose: () => void
  onSaveTemplate: () => void
}) {
  const selection = useCanvas((s) => s.selection)
  const objects = useCanvas((s) => s.objects)
  const store = useCanvas
  const selected = objects.filter((o) => selection.includes(o.id))

  useEffect(() => {
    const close = () => onClose()
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [onClose])

  const run = (action: () => void) => () => {
    action()
    onClose()
  }

  const items: { label: string; action: () => void; danger?: boolean }[] = selected.length
    ? [
        { label: 'Duplicate', action: () => store.getState().duplicateSelection() },
        { label: 'Bring to front', action: () => store.getState().reorder(selection, 'front') },
        { label: 'Bring forward', action: () => store.getState().reorder(selection, 'forward') },
        { label: 'Send backward', action: () => store.getState().reorder(selection, 'backward') },
        { label: 'Send to back', action: () => store.getState().reorder(selection, 'back') },
        ...(selected.length > 1
          ? [{ label: 'Group', action: () => store.getState().group() }]
          : []),
        ...(selected.some((o) => o.groupId)
          ? [{ label: 'Ungroup', action: () => store.getState().ungroup() }]
          : []),
        {
          label: selected.some((o) => o.locked) ? 'Unlock' : 'Lock',
          action: () => store.getState().toggleLock(selection),
        },
        { label: 'Save as template', action: onSaveTemplate },
        {
          label: 'Delete',
          action: () => store.getState().deleteSelection(),
          danger: true,
        },
      ]
    : [
        { label: 'Select all', action: () => store.getState().selectAll() },
        { label: 'Toggle grid', action: () => store.getState().toggleGrid() },
        { label: 'Toggle snapping', action: () => store.getState().toggleSnap() },
      ]

  return (
    <div
      role="menu"
      className="fixed z-50 min-w-44 overflow-hidden rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-lg)]"
      style={{ left: x, top: y }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role="menuitem"
          onClick={run(item.action)}
          className={cn(
            'flex w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors',
            item.danger
              ? 'text-danger hover:bg-danger-subtle'
              : 'text-text hover:bg-surface-hover',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}
