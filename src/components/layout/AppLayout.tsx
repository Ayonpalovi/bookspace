import { Menu as MenuIcon, Monitor, Moon, Plus, Search, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Kbd, PageLoader } from '@/components/ui/primitives'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { AddBookDialog } from '@/components/books/AddBookDialog'
import { useSession } from '@/stores/session'
import { useTabs } from '@/stores/tabs'
import { ACCENTS, useThemeStore, type AccentName, type ThemeMode } from '@/stores/theme'
import { Sidebar } from './Sidebar'
import { TabBar } from './TabBar'
import { SearchDialog } from './SearchDialog'

const SIDEBAR_KEY = 'bookspace.sidebar-collapsed'

export function AppLayout() {
  const status = useSession((s) => s.status)
  const profile = useSession((s) => s.profile)
  const hydrateTabs = useTabs((s) => s.hydrate)
  const tabsHydrated = useTabs((s) => s.hydrated)
  const navigate = useNavigate()

  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === '1',
  )
  const [searchOpen, setSearchOpen] = useState(false)
  const [navOpen, setNavOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)

  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const accent = useThemeStore((s) => s.accent)
  const setAccent = useThemeStore((s) => s.setAccent)

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? '1' : '0')
  }, [collapsed])

  useEffect(() => {
    if (profile && !tabsHydrated) void hydrateTabs(profile.id)
  }, [profile, tabsHydrated, hydrateTabs])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setSearchOpen((open) => !open)
      } else if (meta && event.shiftKey && event.key.toLowerCase() === 'n') {
        event.preventDefault()
        navigate('/notes/new')
      } else if (meta && event.key === '\\') {
        event.preventDefault()
        setCollapsed((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])

  if (status === 'loading') return <PageLoader label="Opening BookSpace" />
  if (status === 'anonymous') return <Navigate to="/sign-in" replace />
  if (profile && !profile.onboardedAt) return <Navigate to="/welcome" replace />

  return (
    <div className="flex h-dvh overflow-hidden bg-bg">
      {/* Static rail from md up. */}
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        className="hidden md:flex"
      />

      {/* Off-canvas drawer below md — the rail would otherwise eat the viewport. */}
      {navOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setNavOpen(false)}
            className="animate-in-fade absolute inset-0 bg-black/40"
          />
          <Sidebar
            collapsed={false}
            onToggle={() => setNavOpen(false)}
            onNavigate={() => setNavOpen(false)}
            className="animate-in-fade absolute inset-y-0 left-0 shadow-[var(--shadow-lg)]"
          />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Open navigation"
            className="md:hidden"
            onClick={() => setNavOpen(true)}
          >
            <MenuIcon className="size-4" />
          </Button>

          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-8 min-w-0 flex-1 max-w-sm items-center gap-2 rounded-lg border border-border bg-surface-sunken px-2.5 text-[13px] text-text-faint transition-colors hover:border-border-strong hover:text-text-muted"
          >
            <Search className="size-3.5 shrink-0" />
            <span className="truncate">Search</span>
            <span className="ml-auto hidden shrink-0 items-center gap-0.5 sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>K</Kbd>
            </span>
          </button>

          <div className="flex-1" />

          <Button size="sm" variant="primary" onClick={() => setAddOpen(true)}>
            <Plus />
            <span className="hidden sm:inline">Add book</span>
          </Button>

          <Menu>
            <MenuTrigger asChild>
              <Button size="icon" variant="ghost" aria-label="Appearance">
                {mode === 'dark' ? <Moon /> : mode === 'light' ? <Sun /> : <Monitor />}
              </Button>
            </MenuTrigger>
            <MenuContent align="end" className="w-52">
              <MenuLabel>Theme</MenuLabel>
              <MenuRadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as ThemeMode)}
              >
                <MenuRadioItem value="light">Light</MenuRadioItem>
                <MenuRadioItem value="dark">Dark</MenuRadioItem>
                <MenuRadioItem value="system">System</MenuRadioItem>
              </MenuRadioGroup>
              <MenuSeparator />
              <MenuLabel>Accent</MenuLabel>
              {(Object.keys(ACCENTS) as AccentName[]).map((name) => (
                <MenuItem
                  key={name}
                  onSelect={() => setAccent(name)}
                  className={accent === name ? 'bg-surface-hover' : undefined}
                >
                  <span
                    aria-hidden
                    className="size-3 rounded-full border border-black/10"
                    style={{ background: ACCENTS[name].light.accent }}
                  />
                  {ACCENTS[name].label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        </header>

        <TabBar />

        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
      <AddBookDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
