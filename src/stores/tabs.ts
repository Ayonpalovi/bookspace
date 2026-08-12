import { create } from 'zustand'
import type { Tab } from '@/types'
import * as repo from '@/data/repository'
import { debounce, nowIso, uid } from '@/lib/utils'

export interface TabDescriptor {
  path: string
  title: string
  kind: Tab['kind']
  icon?: string | null
  entityId?: string | null
}

interface TabsState {
  userId: string | null
  tabs: Tab[]
  closed: Tab[]
  hydrated: boolean

  hydrate: (userId: string) => Promise<void>
  reset: () => void
  /** Opens a tab for the descriptor, or reuses the existing one for that path. */
  ensure: (descriptor: TabDescriptor) => void
  rename: (path: string, title: string) => void
  close: (id: string) => string | null
  closeOthers: (id: string) => void
  closeToRight: (id: string) => void
  duplicate: (id: string) => void
  togglePin: (id: string) => void
  reopenLast: () => string | null
  reorder: (fromId: string, toId: string) => void
}

const MAX_CLOSED = 12

function reindex(tabs: Tab[]): Tab[] {
  // Pinned tabs always sit at the head of the strip, like a browser.
  const pinned = tabs.filter((t) => t.isPinned)
  const rest = tabs.filter((t) => !t.isPinned)
  return [...pinned, ...rest].map((tab, index) => ({ ...tab, position: index }))
}

export const useTabs = create<TabsState>((set, get) => {
  const persist = debounce((userId: string, tabs: Tab[]) => {
    void repo.saveTabs(userId, tabs)
  }, 400)

  const commit = (tabs: Tab[]) => {
    const next = reindex(tabs)
    set({ tabs: next })
    const userId = get().userId
    if (userId) persist(userId, next)
    return next
  }

  return {
    userId: null,
    tabs: [],
    closed: [],
    hydrated: false,

    hydrate: async (userId) => {
      // Claim the user synchronously: React runs effects twice in StrictMode and
      // a second in-flight hydrate would overwrite tabs registered in between.
      if (get().userId === userId) return
      set({ userId })
      const tabs = await repo.listTabs(userId)
      set((state) => ({
        // Merge rather than replace — pages may have registered while loading.
        tabs: reindex([
          ...tabs,
          ...state.tabs.filter((t) => !tabs.some((stored) => stored.path === t.path)),
        ]),
        closed: [],
        hydrated: true,
      }))
    },

    reset: () => set({ userId: null, tabs: [], closed: [], hydrated: false }),

    ensure: ({ path, title, kind, icon, entityId }) => {
      const { tabs, userId } = get()
      if (!userId) return
      const existing = tabs.find((t) => t.path === path)
      if (existing) {
        if (existing.title !== title) {
          commit(tabs.map((t) => (t.id === existing.id ? { ...t, title } : t)))
        }
        return
      }
      commit([
        ...tabs,
        {
          id: uid('tab'),
          userId,
          kind,
          path,
          title,
          icon: icon ?? null,
          entityId: entityId ?? null,
          isPinned: false,
          position: tabs.length,
          openedAt: nowIso(),
        },
      ])
    },

    rename: (path, title) => {
      const { tabs } = get()
      const target = tabs.find((t) => t.path === path)
      if (!target || target.title === title) return
      commit(tabs.map((t) => (t.id === target.id ? { ...t, title } : t)))
    },

    /** Returns the path to navigate to if the closed tab was the active one. */
    close: (id) => {
      const { tabs, closed } = get()
      const index = tabs.findIndex((t) => t.id === id)
      if (index === -1) return null
      const removed = tabs[index]
      const remaining = tabs.filter((t) => t.id !== id)
      set({ closed: [removed, ...closed].slice(0, MAX_CLOSED) })
      commit(remaining)
      const neighbour = remaining[index] ?? remaining[index - 1] ?? null
      return neighbour?.path ?? null
    },

    closeOthers: (id) => {
      const { tabs, closed } = get()
      const keep = tabs.filter((t) => t.id === id || t.isPinned)
      const removed = tabs.filter((t) => !keep.includes(t))
      set({ closed: [...removed.reverse(), ...closed].slice(0, MAX_CLOSED) })
      commit(keep)
    },

    closeToRight: (id) => {
      const { tabs, closed } = get()
      const index = tabs.findIndex((t) => t.id === id)
      if (index === -1) return
      const removed = tabs.slice(index + 1).filter((t) => !t.isPinned)
      if (!removed.length) return
      set({ closed: [...removed.reverse(), ...closed].slice(0, MAX_CLOSED) })
      commit(tabs.filter((t) => !removed.includes(t)))
    },

    duplicate: (id) => {
      const { tabs, userId } = get()
      const source = tabs.find((t) => t.id === id)
      if (!source || !userId) return
      const index = tabs.findIndex((t) => t.id === id)
      const copy: Tab = {
        ...source,
        id: uid('tab'),
        isPinned: false,
        openedAt: nowIso(),
      }
      commit([...tabs.slice(0, index + 1), copy, ...tabs.slice(index + 1)])
    },

    togglePin: (id) => {
      const { tabs } = get()
      commit(tabs.map((t) => (t.id === id ? { ...t, isPinned: !t.isPinned } : t)))
    },

    reopenLast: () => {
      const { tabs, closed } = get()
      const [restored, ...rest] = closed
      if (!restored) return null
      set({ closed: rest })
      if (tabs.some((t) => t.path === restored.path)) return restored.path
      commit([...tabs, { ...restored, id: uid('tab'), openedAt: nowIso() }])
      return restored.path
    },

    reorder: (fromId, toId) => {
      const { tabs } = get()
      if (fromId === toId) return
      const from = tabs.findIndex((t) => t.id === fromId)
      const to = tabs.findIndex((t) => t.id === toId)
      if (from === -1 || to === -1) return
      const next = [...tabs]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      // Keep pinned/unpinned grouping intact after a cross-group drop.
      const target = tabs[to]
      if (moved.isPinned !== target.isPinned) moved.isPinned = target.isPinned
      commit(next)
    },
  }
})
