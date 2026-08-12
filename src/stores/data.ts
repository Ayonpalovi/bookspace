import { create } from 'zustand'

/**
 * A coarse cache-invalidation signal.
 *
 * Pages include the relevant version in their `useAsync` deps; any mutation
 * bumps the matching key and every mounted page that cares refetches. It is
 * deliberately coarse — correctness first — and gives us an obvious seam to
 * replace with per-query caching later without touching call sites.
 */
export type DataKey =
  | 'library'
  | 'notes'
  | 'quotes'
  | 'activity'
  | 'shelves'
  | 'goals'
  | 'spaces'
  | 'templates'
  | 'files'

interface DataState {
  versions: Record<DataKey, number>
  bump: (...keys: DataKey[]) => void
}

export const useDataVersion = create<DataState>((set) => ({
  versions: {
    library: 0,
    notes: 0,
    quotes: 0,
    activity: 0,
    shelves: 0,
    goals: 0,
    spaces: 0,
    templates: 0,
    files: 0,
  },
  bump: (...keys) =>
    set((state) => {
      const versions = { ...state.versions }
      for (const key of keys) versions[key] += 1
      return { versions }
    }),
}))

export function useVersion(key: DataKey): number {
  return useDataVersion((s) => s.versions[key])
}

export function bump(...keys: DataKey[]): void {
  useDataVersion.getState().bump(...keys)
}
