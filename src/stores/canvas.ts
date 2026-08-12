import { create } from 'zustand'
import * as spaceRepo from '@/data/spaces'
import type {
  Rect,
  Space,
  SpaceObject,
  SpaceObjectType,
  SpacePage,
  Viewport,
} from '@/types/canvas'
import { MAX_ZOOM, MIN_ZOOM } from '@/types/canvas'
import { boundsOf, fitViewport } from '@/components/canvas/geometry'
import { clamp, debounce, nowIso, uid } from '@/lib/utils'

export type Tool =
  | 'select'
  | 'hand'
  | 'lasso'
  | 'text'
  | 'sticky'
  | 'shape'
  | 'connector'
  | 'pen'
  | 'eraser'
  | 'frame'
  | 'table'

export type SaveState = 'idle' | 'saving' | 'saved' | 'offline'

const HISTORY_LIMIT = 60

interface CanvasState {
  /** Bumped on every load; teardown ignores stale sessions. */
  sessionId: number
  space: Space | null
  pages: SpacePage[]
  pageId: string | null
  objects: SpaceObject[]
  selection: string[]
  editingId: string | null

  viewport: Viewport
  tool: Tool
  saveState: SaveState
  showGrid: boolean
  snapEnabled: boolean
  showMinimap: boolean

  past: SpaceObject[][]
  future: SpaceObject[][]
  /** Snapshot taken at the start of a drag/resize so it lands as one undo. */
  pending: SpaceObject[] | null

  /* ------------------------------------------------------------ lifecycle */
  load: (userId: string, space: Space, pages: SpacePage[], pageId: string) => Promise<void>
  switchPage: (userId: string, pageId: string) => Promise<void>
  teardown: (sessionId?: number) => void
  flush: () => Promise<void>

  /* --------------------------------------------------------------- state */
  setTool: (tool: Tool) => void
  setViewport: (viewport: Viewport) => void
  panBy: (dx: number, dy: number) => void
  zoomTo: (zoom: number, focus?: { x: number; y: number; width: number; height: number }) => void
  zoomAt: (factor: number, screenPoint: { x: number; y: number }, rect: DOMRect) => void
  fitTo: (bounds: Rect | null, width: number, height: number) => void
  toggleGrid: () => void
  toggleSnap: () => void
  toggleMinimap: () => void

  /* ----------------------------------------------------------- selection */
  select: (ids: string[], additive?: boolean) => void
  selectAll: () => void
  clearSelection: () => void
  setEditing: (id: string | null) => void

  /* ------------------------------------------------------------- objects */
  addObjects: (objects: SpaceObject[], options?: { select?: boolean }) => void
  createObject: (input: spaceRepo.NewObjectInput, options?: { select?: boolean }) => SpaceObject | null
  updateObjects: (
    patches: { id: string; changes: Partial<SpaceObject> }[],
    options?: { history?: boolean },
  ) => void
  deleteObjects: (ids: string[]) => void
  deleteSelection: () => void
  duplicateSelection: () => void

  /* --------------------------------------------------------------- order */
  reorder: (ids: string[], move: 'front' | 'forward' | 'backward' | 'back') => void
  group: () => void
  ungroup: () => void
  toggleLock: (ids: string[]) => void
  toggleHidden: (ids: string[]) => void
  align: (
    mode: 'left' | 'center-x' | 'right' | 'top' | 'center-y' | 'bottom' | 'dist-x' | 'dist-y',
  ) => void

  /* ------------------------------------------------------------- history */
  beginInteraction: () => void
  endInteraction: () => void
  commit: () => void
  undo: () => void
  redo: () => void

  nextZIndex: () => number
}

const INITIAL_VIEWPORT: Viewport = { x: -200, y: -150, zoom: 1 }

export const useCanvas = create<CanvasState>((set, get) => {
  let currentUserId: string | null = null

  const persist = debounce(() => {
    const { pageId, objects, space } = get()
    if (!pageId || !currentUserId || !space) return
    set({ saveState: 'saving' })
    spaceRepo
      .replacePageObjects(currentUserId, pageId, objects)
      .then(() => spaceRepo.touchSpace(currentUserId!, space.id))
      .then(() => set({ saveState: 'saved' }))
      .catch(() => set({ saveState: 'offline' }))
  }, 700)

  /** Records the change and schedules a write. */
  const mutate = (objects: SpaceObject[], pushHistory: boolean) => {
    if (pushHistory) {
      const past = [...get().past, get().objects].slice(-HISTORY_LIMIT)
      set({ past, future: [] })
    }
    set({ objects })
    persist()
  }

  return {
    sessionId: 0,
    space: null,
    pages: [],
    pageId: null,
    objects: [],
    selection: [],
    editingId: null,

    viewport: INITIAL_VIEWPORT,
    tool: 'select',
    saveState: 'idle',
    showGrid: true,
    snapEnabled: true,
    showMinimap: true,

    past: [],
    future: [],
    pending: null,

    load: async (userId, space, pages, pageId) => {
      currentUserId = userId
      // Claim a new session synchronously so a late teardown from React's
      // StrictMode remount cannot wipe the state this load is about to set.
      const sessionId = get().sessionId + 1
      set({ sessionId })
      const objects = await spaceRepo.listObjects(userId, pageId)
      set({
        space,
        pages,
        pageId,
        objects,
        selection: [],
        editingId: null,
        past: [],
        future: [],
        saveState: 'idle',
        viewport: INITIAL_VIEWPORT,
      })
    },

    switchPage: async (userId, pageId) => {
      await get().flush()
      const objects = await spaceRepo.listObjects(userId, pageId)
      set({
        pageId,
        objects,
        selection: [],
        editingId: null,
        past: [],
        future: [],
        viewport: INITIAL_VIEWPORT,
      })
    },

    teardown: (sessionId) => {
      if (sessionId != null && sessionId !== get().sessionId) return
      persist.cancel()
      currentUserId = null
      set({
        space: null,
        pages: [],
        pageId: null,
        objects: [],
        selection: [],
        editingId: null,
        past: [],
        future: [],
        saveState: 'idle',
      })
    },

    /** Writes immediately — used on page switch and unmount. */
    flush: async () => {
      const { pageId, objects, space } = get()
      persist.cancel()
      if (!pageId || !currentUserId || !space) return
      try {
        set({ saveState: 'saving' })
        await spaceRepo.replacePageObjects(currentUserId, pageId, objects)
        await spaceRepo.touchSpace(currentUserId, space.id)
        set({ saveState: 'saved' })
      } catch {
        set({ saveState: 'offline' })
      }
    },

    setTool: (tool) => set({ tool, editingId: null }),
    setViewport: (viewport) => set({ viewport }),

    panBy: (dx, dy) => {
      const { viewport } = get()
      set({
        viewport: {
          ...viewport,
          x: viewport.x + dx / viewport.zoom,
          y: viewport.y + dy / viewport.zoom,
        },
      })
    },

    zoomTo: (zoom, focus) => {
      const { viewport } = get()
      const next = clamp(zoom, MIN_ZOOM, MAX_ZOOM)
      if (!focus) {
        set({ viewport: { ...viewport, zoom: next } })
        return
      }
      // Keep the focus rect's centre pinned while the scale changes.
      const centreX = viewport.x + focus.width / (2 * viewport.zoom)
      const centreY = viewport.y + focus.height / (2 * viewport.zoom)
      set({
        viewport: {
          zoom: next,
          x: centreX - focus.width / (2 * next),
          y: centreY - focus.height / (2 * next),
        },
      })
    },

    zoomAt: (factor, screenPoint, rect) => {
      const { viewport } = get()
      const next = clamp(viewport.zoom * factor, MIN_ZOOM, MAX_ZOOM)
      if (next === viewport.zoom) return
      // Keep the canvas point under the cursor exactly where it is.
      const worldX = (screenPoint.x - rect.left) / viewport.zoom + viewport.x
      const worldY = (screenPoint.y - rect.top) / viewport.zoom + viewport.y
      set({
        viewport: {
          zoom: next,
          x: worldX - (screenPoint.x - rect.left) / next,
          y: worldY - (screenPoint.y - rect.top) / next,
        },
      })
    },

    fitTo: (bounds, width, height) => {
      if (!bounds || bounds.width === 0 || bounds.height === 0) {
        set({ viewport: INITIAL_VIEWPORT })
        return
      }
      set({ viewport: fitViewport(bounds, width, height) })
    },

    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
    toggleMinimap: () => set((s) => ({ showMinimap: !s.showMinimap })),

    select: (ids, additive = false) => {
      if (!additive) {
        set({ selection: ids })
        return
      }
      const current = new Set(get().selection)
      for (const id of ids) {
        if (current.has(id)) current.delete(id)
        else current.add(id)
      }
      set({ selection: [...current] })
    },

    selectAll: () =>
      set({
        selection: get()
          .objects.filter((o) => !o.locked && !o.hidden)
          .map((o) => o.id),
      }),

    clearSelection: () => set({ selection: [], editingId: null }),
    setEditing: (id) => set({ editingId: id }),

    nextZIndex: () => {
      const objects = get().objects
      return objects.length ? Math.max(...objects.map((o) => o.zIndex)) + 1 : 0
    },

    addObjects: (objects, options) => {
      if (!objects.length) return
      mutate([...get().objects, ...objects], true)
      if (options?.select !== false) set({ selection: objects.map((o) => o.id) })
    },

    createObject: (input, options) => {
      const { space, pageId } = get()
      if (!space || !pageId || !currentUserId) return null
      const object = spaceRepo.buildObject(currentUserId, space.id, pageId, {
        ...input,
        zIndex: input.zIndex ?? get().nextZIndex(),
      })
      get().addObjects([object], options)
      return object
    },

    updateObjects: (patches, options) => {
      if (!patches.length) return
      const map = new Map(patches.map((p) => [p.id, p.changes]))
      const timestamp = nowIso()
      const next = get().objects.map((object) => {
        const changes = map.get(object.id)
        if (!changes) return object
        return { ...object, ...changes, updatedAt: timestamp }
      })
      mutate(next, options?.history ?? false)
    },

    deleteObjects: (ids) => {
      if (!ids.length) return
      const doomed = new Set(ids)
      const groupIds = new Set(
        get()
          .objects.filter((o) => doomed.has(o.id) && o.groupId)
          .map((o) => o.groupId!),
      )
      // Deleting a frame releases its children rather than destroying them, and
      // a connector whose endpoint disappears goes with it.
      const next = get()
        .objects.filter((object) => {
          if (doomed.has(object.id)) return false
          if (object.type === 'connector') {
            const { fromId, toId } = object.content as {
              fromId?: string | null
              toId?: string | null
            }
            if ((fromId && doomed.has(fromId)) || (toId && doomed.has(toId))) return false
          }
          return true
        })
        .map((object) =>
          object.parentFrameId && doomed.has(object.parentFrameId)
            ? { ...object, parentFrameId: null }
            : object,
        )
        .map((object) =>
          // A group of one is not a group.
          object.groupId && groupIds.has(object.groupId) ? object : object,
        )
      mutate(next, true)
      set({ selection: [], editingId: null })
    },

    deleteSelection: () => {
      const { selection, objects } = get()
      const unlocked = selection.filter(
        (id) => !objects.find((o) => o.id === id)?.locked,
      )
      get().deleteObjects(unlocked)
    },

    duplicateSelection: () => {
      const { selection, objects, space, pageId } = get()
      if (!selection.length || !space || !pageId || !currentUserId) return
      const selected = objects.filter((o) => selection.includes(o.id))
      const idMap = new Map<string, string>()
      const groupMap = new Map<string, string>()
      const timestamp = nowIso()
      let z = get().nextZIndex()

      for (const object of selected) idMap.set(object.id, uid('obj'))

      const copies = selected.map((object) => {
        let groupId = object.groupId
        if (groupId) {
          if (!groupMap.has(groupId)) groupMap.set(groupId, uid('grp'))
          groupId = groupMap.get(groupId)!
        }
        return {
          ...object,
          id: idMap.get(object.id)!,
          x: object.x + 24,
          y: object.y + 24,
          zIndex: z++,
          groupId,
          parentFrameId: object.parentFrameId
            ? (idMap.get(object.parentFrameId) ?? object.parentFrameId)
            : null,
          content:
            object.type === 'connector'
              ? {
                  ...object.content,
                  fromId: idMap.get(object.content.fromId as string) ?? null,
                  toId: idMap.get(object.content.toId as string) ?? null,
                }
              : { ...object.content },
          createdAt: timestamp,
          updatedAt: timestamp,
        } satisfies SpaceObject
      })
      get().addObjects(copies)
    },

    reorder: (ids, move) => {
      const objects = [...get().objects].sort((a, b) => a.zIndex - b.zIndex)
      const set_ = new Set(ids)
      let ordered: SpaceObject[]
      if (move === 'front') {
        ordered = [...objects.filter((o) => !set_.has(o.id)), ...objects.filter((o) => set_.has(o.id))]
      } else if (move === 'back') {
        ordered = [...objects.filter((o) => set_.has(o.id)), ...objects.filter((o) => !set_.has(o.id))]
      } else {
        ordered = [...objects]
        const step = move === 'forward' ? 1 : -1
        const indices = ordered
          .map((o, i) => ({ o, i }))
          .filter(({ o }) => set_.has(o.id))
          .map(({ i }) => i)
        const order = step > 0 ? indices.reverse() : indices
        for (const index of order) {
          const target = index + step
          if (target < 0 || target >= ordered.length) continue
          ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
        }
      }
      get().updateObjects(
        ordered.map((object, index) => ({ id: object.id, changes: { zIndex: index } })),
        { history: true },
      )
    },

    group: () => {
      const { selection } = get()
      if (selection.length < 2) return
      const groupId = uid('grp')
      get().updateObjects(
        selection.map((id) => ({ id, changes: { groupId } })),
        { history: true },
      )
    },

    ungroup: () => {
      const { selection, objects } = get()
      const groupIds = new Set(
        objects.filter((o) => selection.includes(o.id) && o.groupId).map((o) => o.groupId!),
      )
      if (!groupIds.size) return
      const members = objects.filter((o) => o.groupId && groupIds.has(o.groupId))
      get().updateObjects(
        members.map((o) => ({ id: o.id, changes: { groupId: null } })),
        { history: true },
      )
      set({ selection: members.map((o) => o.id) })
    },

    toggleLock: (ids) => {
      const objects = get().objects
      const anyUnlocked = ids.some((id) => !objects.find((o) => o.id === id)?.locked)
      get().updateObjects(
        ids.map((id) => ({ id, changes: { locked: anyUnlocked } })),
        { history: true },
      )
    },

    toggleHidden: (ids) => {
      const objects = get().objects
      const anyVisible = ids.some((id) => !objects.find((o) => o.id === id)?.hidden)
      get().updateObjects(
        ids.map((id) => ({ id, changes: { hidden: anyVisible } })),
        { history: true },
      )
    },

    align: (mode) => {
      const { selection, objects } = get()
      const selected = objects.filter((o) => selection.includes(o.id) && !o.locked)
      if (selected.length < 2) return
      const bounds = boundsOf(selected)!
      const patches: { id: string; changes: Partial<SpaceObject> }[] = []

      if (mode === 'dist-x' || mode === 'dist-y') {
        const axis = mode === 'dist-x' ? 'x' : 'y'
        const size = mode === 'dist-x' ? 'width' : 'height'
        const sorted = [...selected].sort((a, b) => a[axis] - b[axis])
        const total = sorted.reduce((sum, o) => sum + o[size], 0)
        const span = mode === 'dist-x' ? bounds.width : bounds.height
        const gap = (span - total) / (sorted.length - 1)
        let cursor = bounds[axis]
        for (const object of sorted) {
          patches.push({ id: object.id, changes: { [axis]: cursor } as Partial<SpaceObject> })
          cursor += object[size] + gap
        }
      } else {
        for (const object of selected) {
          switch (mode) {
            case 'left':
              patches.push({ id: object.id, changes: { x: bounds.x } })
              break
            case 'right':
              patches.push({
                id: object.id,
                changes: { x: bounds.x + bounds.width - object.width },
              })
              break
            case 'center-x':
              patches.push({
                id: object.id,
                changes: { x: bounds.x + (bounds.width - object.width) / 2 },
              })
              break
            case 'top':
              patches.push({ id: object.id, changes: { y: bounds.y } })
              break
            case 'bottom':
              patches.push({
                id: object.id,
                changes: { y: bounds.y + bounds.height - object.height },
              })
              break
            case 'center-y':
              patches.push({
                id: object.id,
                changes: { y: bounds.y + (bounds.height - object.height) / 2 },
              })
              break
          }
        }
      }
      get().updateObjects(patches, { history: true })
    },

    /**
     * A drag is one undo step, not one per mouse move: snapshot on start,
     * push the snapshot on end only if something actually changed.
     */
    beginInteraction: () => set({ pending: get().objects }),

    endInteraction: () => {
      const { pending, objects } = get()
      if (!pending) return
      const changed =
        pending.length !== objects.length ||
        pending.some((object, index) => object !== objects[index])
      if (changed) {
        set({ past: [...get().past, pending].slice(-HISTORY_LIMIT), future: [] })
      }
      set({ pending: null })
    },

    commit: () => {
      set({ past: [...get().past, get().objects].slice(-HISTORY_LIMIT), future: [] })
    },

    undo: () => {
      const { past, objects, future } = get()
      if (!past.length) return
      const previous = past[past.length - 1]
      set({
        past: past.slice(0, -1),
        future: [objects, ...future].slice(0, HISTORY_LIMIT),
        objects: previous,
        selection: [],
        editingId: null,
      })
      persist()
    },

    redo: () => {
      const { future, objects, past } = get()
      if (!future.length) return
      const [next, ...rest] = future
      set({
        past: [...past, objects].slice(-HISTORY_LIMIT),
        future: rest,
        objects: next,
        selection: [],
        editingId: null,
      })
      persist()
    },
  }
})

/** Convenience selector for the currently selected objects. */
export function selectedObjects(state: CanvasState): SpaceObject[] {
  return state.objects.filter((o) => state.selection.includes(o.id))
}

export const TOOL_CREATES: Partial<Record<Tool, SpaceObjectType>> = {
  text: 'text',
  sticky: 'sticky',
  shape: 'shape',
  frame: 'frame',
  table: 'table',
}
