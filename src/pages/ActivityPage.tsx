import {
  Activity as ActivityIcon,
  BookMarked,
  BookOpen,
  BookText,
  CircleSlash,
  Library,
  PenLine,
  Quote as QuoteIcon,
  Sparkles,
  Target,
  TrendingUp,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, PageLoader } from '@/components/ui/primitives'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { useVersion } from '@/stores/data'
import type { ActivityKind } from '@/types'
import { relativeTime, startOfDay } from '@/lib/utils'

const ICONS: Record<ActivityKind, ComponentType<{ className?: string }>> = {
  book_added: BookMarked,
  book_started: BookOpen,
  book_finished: Sparkles,
  book_dnf: CircleSlash,
  progress_updated: TrendingUp,
  note_created: BookText,
  quote_saved: QuoteIcon,
  review_written: PenLine,
  shelf_created: Library,
  goal_set: Target,
}

function dayLabel(iso: string): string {
  const date = startOfDay(iso)
  const today = startOfDay(new Date())
  const diff = Math.round((today.getTime() - date.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  if (diff < 7) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric',
  })
}

export function ActivityPage() {
  useTab({ title: 'Activity', kind: 'page', icon: 'home' })
  const profile = useSession((s) => s.profile)!
  const activityVersion = useVersion('activity')
  const libraryVersion = useVersion('library')

  const { data, loading } = useAsync(
    async () => ({
      activity: await repo.listActivity(profile.id, 200),
      entries: await repo.listLibrary(profile.id),
    }),
    [profile.id, activityVersion, libraryVersion],
  )

  if (loading && !data) return <PageLoader label="Loading activity" />
  if (!data) return null

  const bookById = new Map(data.entries.map((e) => [e.book.id, e.book]))
  const groups = new Map<string, typeof data.activity>()
  for (const item of data.activity) {
    const key = dayLabel(item.createdAt)
    const list = groups.get(key) ?? []
    list.push(item)
    groups.set(key, list)
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-7">
        <h1 className="font-serif text-[26px] leading-tight tracking-tight">Activity</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Everything you've done in BookSpace, newest first.
        </p>
      </div>

      {data.activity.length === 0 ? (
        <EmptyState
          icon={<ActivityIcon />}
          title="Nothing has happened yet"
          description="Add a book, log some pages or write a note and it will show up here."
        />
      ) : (
        <div className="space-y-8">
          {[...groups.entries()].map(([label, items]) => (
            <section key={label}>
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-text-faint">
                {label}
              </h2>
              <ol className="space-y-0">
                {items.map((item) => {
                  const Icon = ICONS[item.kind]
                  const book = item.bookId ? bookById.get(item.bookId) : null
                  return (
                    <li
                      key={item.id}
                      className="flex items-start gap-3 border-b border-border py-3 last:border-0"
                    >
                      <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-text-faint">
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug text-text">{item.summary}</p>
                        {book && (
                          <Link
                            to={`/books/${book.id}`}
                            className="text-xs text-text-faint hover:text-accent hover:underline"
                          >
                            {book.title}
                          </Link>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-text-faint">
                        {relativeTime(item.createdAt)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
