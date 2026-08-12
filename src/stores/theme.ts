import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ThemeMode = 'light' | 'dark' | 'system'
export type AccentName = 'ink' | 'indigo' | 'moss' | 'amber' | 'clay' | 'plum'

interface AccentTokens {
  accent: string
  accentHover: string
  accentFg: string
  accentSubtle: string
}

/**
 * Accent presets carry both a light and a dark variant. Dark UI needs a lighter,
 * less saturated accent to stay readable against a dark surface, so a single
 * hue value is not enough.
 */
export const ACCENTS: Record<AccentName, { label: string; light: AccentTokens; dark: AccentTokens }> = {
  ink: {
    label: 'Ink',
    light: {
      accent: 'oklch(30% 0.02 260)',
      accentHover: 'oklch(24% 0.02 260)',
      accentFg: 'oklch(99% 0 0)',
      accentSubtle: 'oklch(94% 0.008 260)',
    },
    dark: {
      accent: 'oklch(88% 0.012 260)',
      accentHover: 'oklch(94% 0.012 260)',
      accentFg: 'oklch(18% 0.01 260)',
      accentSubtle: 'oklch(30% 0.012 260)',
    },
  },
  indigo: {
    label: 'Indigo',
    light: {
      accent: 'oklch(52% 0.14 265)',
      accentHover: 'oklch(46% 0.14 265)',
      accentFg: 'oklch(99% 0 0)',
      accentSubtle: 'oklch(95% 0.03 265)',
    },
    dark: {
      accent: 'oklch(72% 0.13 265)',
      accentHover: 'oklch(78% 0.13 265)',
      accentFg: 'oklch(18% 0.02 265)',
      accentSubtle: 'oklch(30% 0.05 265)',
    },
  },
  moss: {
    label: 'Moss',
    light: {
      accent: 'oklch(48% 0.1 155)',
      accentHover: 'oklch(42% 0.1 155)',
      accentFg: 'oklch(99% 0 0)',
      accentSubtle: 'oklch(94% 0.03 155)',
    },
    dark: {
      accent: 'oklch(74% 0.12 155)',
      accentHover: 'oklch(80% 0.12 155)',
      accentFg: 'oklch(18% 0.02 155)',
      accentSubtle: 'oklch(29% 0.05 155)',
    },
  },
  amber: {
    label: 'Amber',
    light: {
      accent: 'oklch(56% 0.13 62)',
      accentHover: 'oklch(50% 0.13 62)',
      accentFg: 'oklch(99% 0 0)',
      accentSubtle: 'oklch(95% 0.04 62)',
    },
    dark: {
      accent: 'oklch(78% 0.13 62)',
      accentHover: 'oklch(84% 0.13 62)',
      accentFg: 'oklch(20% 0.03 62)',
      accentSubtle: 'oklch(31% 0.06 62)',
    },
  },
  clay: {
    label: 'Clay',
    light: {
      accent: 'oklch(52% 0.13 25)',
      accentHover: 'oklch(46% 0.13 25)',
      accentFg: 'oklch(99% 0 0)',
      accentSubtle: 'oklch(95% 0.03 25)',
    },
    dark: {
      accent: 'oklch(72% 0.13 25)',
      accentHover: 'oklch(78% 0.13 25)',
      accentFg: 'oklch(19% 0.02 25)',
      accentSubtle: 'oklch(30% 0.06 25)',
    },
  },
  plum: {
    label: 'Plum',
    light: {
      accent: 'oklch(48% 0.15 320)',
      accentHover: 'oklch(42% 0.15 320)',
      accentFg: 'oklch(99% 0 0)',
      accentSubtle: 'oklch(95% 0.035 320)',
    },
    dark: {
      accent: 'oklch(74% 0.13 320)',
      accentHover: 'oklch(80% 0.13 320)',
      accentFg: 'oklch(19% 0.02 320)',
      accentSubtle: 'oklch(30% 0.06 320)',
    },
  },
}

interface ThemeState {
  mode: ThemeMode
  accent: AccentName
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: AccentName) => void
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      mode: 'system',
      accent: 'indigo',
      setMode: (mode) => set({ mode }),
      setAccent: (accent) => set({ accent }),
    }),
    { name: 'bookspace.theme' },
  ),
)

export function resolveMode(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode
  return typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function applyTheme(mode: ThemeMode, accent: AccentName): void {
  const resolved = resolveMode(mode)
  const root = document.documentElement
  root.dataset.theme = resolved
  const tokens = ACCENTS[accent][resolved]
  root.style.setProperty('--accent', tokens.accent)
  root.style.setProperty('--accent-hover', tokens.accentHover)
  root.style.setProperty('--accent-fg', tokens.accentFg)
  root.style.setProperty('--accent-subtle', tokens.accentSubtle)
}
