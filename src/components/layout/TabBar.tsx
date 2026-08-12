import {
  BookOpen,
  BookText,
  Copy,
  Home,
  Library,
  Pin,
  PinOff,
  Plus,
  Quote as QuoteIcon,
  RotateCcw,
  Settings,
  Target,
  TrendingUp,
  X,
} from 'lucide-react'
import { useState, type ComponentType, type DragEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { useTabs } from '@/stores/tabs'
import { cn } from '@/lib/utils'
import type { Tab } from '@/types'

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  book: BookOpen,
  note: BookText,
  quote: QuoteIcon,
  library: Library,
  home: Home,
  stats: TrendingUp,
  goal: Target,
  settings: Settings,
}

function TabIcon({ name, className }: { name: string | null; className?: string }) {
  const Icon = ICONS[name ?? ''] ?? BookOpen
  return <Icon className={className} />
}

function TabChip({
  tab,
  active,
  onActivate,
  onClose,
}: {
  tab: Tab
  active: boolean
  onActivate: () => void
  onClose: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const { closeOthers, closeToRight, duplicate, togglePin, reorder, reopenLast } =
    useTabs()
  const navigate = useNavigate()

  const handleDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragOver(false)
    const fromId = event.dataTransfer.getData('text/bookspace-tab')
    if (fromId) reorder(fromId, tab.id)
  }

  return (
    <Menu open={menuOpen} onOpenChange={setMenuOpen}>
      <MenuTrigger asChild>
        <div
          role="tab"
          tabIndex={0}
          aria-selected={active}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/bookspace-tab', tab.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            event.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={onActivate}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              onActivate()
            }
          }}
          onAuxClick={(event) => {
            // Middle-click closes, same as a browser.
            if (event.button === 1) {
              event.preventDefault()
              onClose()
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault()
            setMenuOpen(true)
          }}
          className={cn(
            'group relative flex h-8 max-w-52 shrink-0 cursor-default select-none items-center gap-1.5 rounded-lg border px-2.5 text-[13px] transition-colors duration-150',
            active
              ? 'border-border bg-surface text-text shadow-[var(--shadow-sm)]'
              : 'border-transparent text-text-muted hover:bg-surface-hover hover:text-text',
            dragOver && 'ring-2 ring-[var(--accent)]',
            tab.isPinned && 'max-w-36',
          )}
        >
          <TabIcon
            name={tab.icon}
            className={cn('size-3.5 shrink-0', active ? 'text-accent' : 'text-text-faint')}
          />
          <span className="truncate">{tab.title}</span>
          {tab.isPinned ? (
            <Pin className="size-3 shrink-0 text-text-faint" />
          ) : (
            <button
              type="button"
              aria-label={`Close ${tab.title}`}
              onClick={(event) => {
                event.stopPropagation()
                onClose()
              }}
              className="-mr-1 shrink-0 rounded p-0.5 text-text-faint opacity-0 transition-opacity hover:bg-surface-sunken hover:text-text focus-visible:opacity-100 group-hover:opacity-100"
            >
              <X className="size-3" />
            </button>
          )}
        </div>
      </MenuTrigger>

      <MenuContent align="start" className="w-52">
        <MenuItem onSelect={onClose}>
          <X /> Close
        </MenuItem>
        <MenuItem onSelect={() => closeOthers(tab.id)}>Close others</MenuItem>
        <MenuItem onSelect={() => closeToRight(tab.id)}>Close tabs to the right</MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => duplicate(tab.id)}>
          <Copy /> Duplicate
        </MenuItem>
        <MenuItem onSelect={() => togglePin(tab.id)}>
          {tab.isPinned ? <PinOff /> : <Pin />}
          {tab.isPinned ? 'Unpin' : 'Pin'}
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={() => {
            const path = reopenLast()
            if (path) navigate(path)
          }}
        >
          <RotateCcw /> Reopen closed tab
        </MenuItem>
      </MenuContent>
    </Menu>
  )
}

export function TabBar() {
  const tabs = useTabs((s) => s.tabs)
  const close = useTabs((s) => s.close)
  const reopenLast = useTabs((s) => s.reopenLast)
  const closedCount = useTabs((s) => s.closed.length)
  const navigate = useNavigate()
  const location = useLocation()

  const activePath = location.pathname

  return (
    <div
      role="tablist"
      aria-label="Open tabs"
      className="flex h-12 items-center gap-1 overflow-x-auto border-b border-border bg-bg-subtle px-2"
    >
      {tabs.map((tab) => (
        <TabChip
          key={tab.id}
          tab={tab}
          active={tab.path === activePath}
          onActivate={() => navigate(tab.path)}
          onClose={() => {
            const wasActive = tab.path === activePath
            const next = close(tab.id)
            if (wasActive) navigate(next ?? '/dashboard')
          }}
        />
      ))}

      <Menu>
        <MenuTrigger asChild>
          <button
            type="button"
            aria-label="New tab"
            className="flex size-7 shrink-0 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <Plus className="size-4" />
          </button>
        </MenuTrigger>
        <MenuContent align="start" className="w-52">
          <MenuItem onSelect={() => navigate('/dashboard')}>
            <Home /> Home
          </MenuItem>
          <MenuItem onSelect={() => navigate('/library')}>
            <Library /> Library
          </MenuItem>
          <MenuItem onSelect={() => navigate('/notes')}>
            <BookText /> Notes
          </MenuItem>
          <MenuItem onSelect={() => navigate('/quotes')}>
            <QuoteIcon /> Quotes
          </MenuItem>
          <MenuItem onSelect={() => navigate('/statistics')}>
            <TrendingUp /> Statistics
          </MenuItem>
          {closedCount > 0 && (
            <>
              <MenuSeparator />
              <MenuItem
                onSelect={() => {
                  const path = reopenLast()
                  if (path) navigate(path)
                }}
              >
                <RotateCcw /> Reopen closed tab
              </MenuItem>
            </>
          )}
        </MenuContent>
      </Menu>
    </div>
  )
}
