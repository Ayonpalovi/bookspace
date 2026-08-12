import { create } from 'zustand'
import type { Profile } from '@/types'
import * as auth from '@/data/auth'
import * as repo from '@/data/repository'

interface SessionState {
  profile: Profile | null
  status: 'loading' | 'authenticated' | 'anonymous'
  error: string | null
  restore: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: auth.SignUpInput) => Promise<void>
  signOut: () => void
  refreshProfile: () => Promise<void>
  updateProfile: (patch: Parameters<typeof repo.updateProfile>[1]) => Promise<void>
}

export const useSession = create<SessionState>((set, get) => ({
  profile: null,
  status: 'loading',
  error: null,

  restore: async () => {
    try {
      const profile = await auth.getSessionProfile()
      set({ profile, status: profile ? 'authenticated' : 'anonymous', error: null })
    } catch (error) {
      set({
        profile: null,
        status: 'anonymous',
        error: error instanceof Error ? error.message : 'Could not restore your session.',
      })
    }
  },

  signIn: async (email, password) => {
    const profile = await auth.signIn(email, password)
    set({ profile, status: 'authenticated', error: null })
  },

  signUp: async (input) => {
    const profile = await auth.signUp(input)
    set({ profile, status: 'authenticated', error: null })
  },

  signOut: () => {
    auth.signOut()
    set({ profile: null, status: 'anonymous', error: null })
  },

  refreshProfile: async () => {
    const current = get().profile
    if (!current) return
    const profile = await repo.getProfile(current.id)
    if (profile) set({ profile })
  },

  updateProfile: async (patch) => {
    const current = get().profile
    if (!current) return
    const profile = await repo.updateProfile(current.id, patch)
    set({ profile })
  },
}))

/** Convenience for components that are only rendered inside a protected route. */
export function useUserId(): string {
  const profile = useSession((s) => s.profile)
  if (!profile) throw new Error('useUserId called outside an authenticated route')
  return profile.id
}
