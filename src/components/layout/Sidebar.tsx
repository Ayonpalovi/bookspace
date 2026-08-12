import {
  Activity,
  BookMarked,
  BookOpen,
  BookText,
  ChevronsLeft,
  CircleSlash,
  Home,
  LayoutDashboard,
  LayoutTemplate,
  Library,
  LogOut,
  Paperclip,
  Quote as QuoteIcon,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  User,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Avatar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { useSession } from '@/stores/session'
import { useTabs } from '@/stores/tabs'
import { cn } from '@/lib/utils'

interface NavItem {
  to: string
  label: string
  icon: ComponentType<{ className?: string }>
  end?: boolean
}

const LIBRARY_ITEMS: NavItem[] = [
  { to: '/library', label: 'My Library', icon: Library, end: true },
  { to: '/library/reading', label: 'Currently Reading', icon: BookOpen },
  { to: '/library/want-to-read', label: 'Want to Read', icon: BookMarked },
  { to: '/library/finished', label: 'Finished', icon: Sparkles },
  { to: '/library/dnf', label: 'Did Not Finish', icon: CircleSlash },
]

const KNOWLEDGE_ITEMS: NavItem[] = [
  { to: '/notes', label: 'Notes', icon: BookText },
  { to: '/quotes', label: 'Quotes', icon: QuoteIcon },
]

const WORKSPACE_ITEMS: NavItem[] = [
  { to: '/spaces', label: 'Spaces', icon: LayoutDashboard, end: true },
  { to: '/templates', label: 'Templates', icon: LayoutTemplate },
  { to: '/files', label: 'Files', icon: Paperclip },
]

const INSIGHT_ITEMS: NavItem[] = [
  { to: '/goals', label: 'Reading Goals', icon: Target },
  { to: '/statistics', label: 'Statistics', icon: TrendingUp },
  { to: '/activity', label: 'Activity', icon: Activity },
]

function NavRow({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.end}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] font-medium transition-colors duration-150',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-surface text-text shadow-[var(--shadow-sm)]'
            : 'text-text-muted hover:bg-surface-hover hover:text-text',
        )
      }
    >
      <Icon className="size-4 shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  )
}

function Group({
  label,
  items,
  collapsed,
}: {
  label: string
  items: NavItem[]
  collapsed: boolean
}) {
  return (
    <div className="space-y-0.5">
      {!collapsed && (
        <p className="px-2.5 pb-1 pt-4 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-faint">
          {label}
        </p>
      )}
      {collapsed && <div className="my-2 h-px bg-border" />}
      {items.map((item) => (
        <NavRow key={item.to} item={item} collapsed={collapsed} />
      ))}
    </div>
  )
}

export function Sidebar({
  collapsed,
  onToggle,
  onNavigate,
  className,
}: {
  collapsed: boolean
  onToggle: () => void
  /** Called after any nav click — used to close the mobile drawer. */
  onNavigate?: () => void
  className?: string
}) {
  const profile = useSession((s) => s.profile)
  const signOut = useSession((s) => s.signOut)
  const resetTabs = useTabs((s) => s.reset)
  const navigate = useNavigate()

  if (!profile) return null

  return (
    <aside
      className={cn(
        'flex h-full shrink-0 flex-col border-r border-border bg-bg-subtle transition-[width] duration-200 ease-[var(--ease-out-soft)]',
        collapsed ? 'w-[60px]' : 'w-[232px]',
        className,
      )}
      onClick={(event) => {
        if ((event.target as HTMLElement).closest('a')) onNavigate?.()
      }}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 px-3',
          collapsed && 'justify-center px-0',
        )}
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-fg">
          <BookOpen className="size-4" />
        </span>
        {!collapsed && (
          <span className="font-serif text-[17px] font-medium tracking-tight text-text">
            BookSpace
          </span>
        )}
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 pb-4">
        <NavRow
          item={{ to: '/dashboard', label: 'Home', icon: Home }}
          collapsed={collapsed}
        />
        <Group label="Library" items={LIBRARY_ITEMS} collapsed={collapsed} />
        <Group label="Knowledge" items={KNOWLEDGE_ITEMS} collapsed={collapsed} />
        <Group label="Workspace" items={WORKSPACE_ITEMS} collapsed={collapsed} />
        <Group label="Insights" items={INSIGHT_ITEMS} collapsed={collapsed} />
      </nav>

      <div className="border-t border-border p-2">
        <Menu>
          <MenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-hover',
                collapsed && 'justify-center px-0',
              )}
            >
              <Avatar name={profile.displayName} src={profile.avatarUrl} size={26} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">
                    {profile.displayName}
                  </span>
                  <span className="block truncate text-[11px] text-text-faint">
                    @{profile.username}
                  </span>
                </span>
              )}
            </button>
          </MenuTrigger>
          <MenuContent side="top" align="start" className="w-56">
            <MenuItem onSelect={() => navigate(`/profile/${profile.username}`)}>
              <User /> Profile
            </MenuItem>
            <MenuItem onSelect={() => navigate('/settings')}>
              <Settings /> Settings
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={() => {
                resetTabs()
                signOut()
                navigate('/sign-in', { replace: true })
              }}
            >
              <LogOut /> Sign out
            </MenuItem>
          </MenuContent>
        </Menu>

        <Button
          variant="ghost"
          size={collapsed ? 'icon' : 'sm'}
          onClick={onToggle}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn('mt-1 w-full', !collapsed && 'justify-start')}
        >
          <ChevronsLeft
            className={cn('transition-transform duration-200', collapsed && 'rotate-180')}
          />
          {!collapsed && 'Collapse'}
        </Button>
      </div>
    </aside>
  )
}
