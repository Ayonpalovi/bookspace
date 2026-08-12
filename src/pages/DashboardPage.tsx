import {
  BookOpen,
  BookText,
  Clock,
  Flame,
  LayoutDashboard,
  Plus,
  Quote as QuoteIcon,
  Target,
  TrendingUp,
} from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AddBookDialog } from '@/components/books/AddBookDialog'
import { BookCover } from '@/components/books/BookCover'
import { ProgressControl } from '@/components/books/ProgressControl'
import { Button } from '@/components/ui/button'
import {
  Badge,
  Card,
  EmptyState,
  PageLoader,
  ProgressBar,
  SectionHeading,
  Stat,
} from '@/components/ui/primitives'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import * as spaceRepo from '@/data/spaces'
import { useSession } from '@/stores/session'
import { useVersion } from '@/stores/data'
import { formatNumber, pluralize, relativeTime } from '@/lib/utils'

export function DashboardPage() {
  useTab({ title: 'Home', kind: 'page', icon: 'home' })
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const libraryVersion = useVersion('library')
  const notesVersion = useVersion('notes')
  const quotesVersion = useVersion('quotes')
  const goalsVersion = useVersion('goals')
  const spacesVersion = useVersion('spaces')
  const [addOpen, setAddOpen] = useState(false)

  const { data, loading, reload } = useAsync(
    async () => {
      const [entries, stats, notes, quotes, goal, spaces] = await Promise.all([
        repo.listLibrary(profile.id),
        repo.getStats(profile.id),
        repo.listNotes(profile.id),
        repo.listQuotes(profile.id),
        repo.getGoal(profile.id, 'year', 'books'),
        spaceRepo.listSpaces(profile.id),
      ])
      return { entries, stats, notes, quotes, goal, spaces }
    },
    [profile.id, libraryVersion, notesVersion, quotesVersion, goalsVersion, spacesVersion],
  )

  if (loading && !data) return <PageLoader label="Loading your dashboard" />
  if (!data) return null

  const { entries, stats, notes, quotes, goal, spaces } = data
  const reading = entries
    .filter((e) => e.userBook.status === 'reading')
    .sort((a, b) =>
      (b.userBook.lastOpenedAt ?? b.userBook.updatedAt).localeCompare(
        a.userBook.lastOpenedAt ?? a.userBook.updatedAt,
      ),
    )
  const recentlyOpened = entries
    .filter((e) => e.userBook.lastOpenedAt)
    .sort((a, b) =>
      (b.userBook.lastOpenedAt ?? '').localeCompare(a.userBook.lastOpenedAt ?? ''),
    )
    .slice(0, 6)

  const goalPercent = goal?.target
    ? Math.min(100, Math.round((stats.booksFinishedThisYear / goal.target) * 100))
    : 0
  const year = new Date().getFullYear()
  const firstName = profile.displayName.split(' ')[0]
  const hour = new Date().getHours()
  const greeting = hour < 5 ? 'Still up' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'

  if (entries.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="font-serif text-[28px] leading-tight tracking-tight">
          Welcome to BookSpace, {firstName}.
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Add your first book and the rest of this page fills itself in.
        </p>
        <div className="mt-8">
          <EmptyState
            icon={<BookOpen />}
            title="Your library is waiting."
            description="Track what you're reading, capture what you learn, and keep it all in one place."
            actions={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                <Plus /> Add a book
              </Button>
            }
          />
        </div>
        <AddBookDialog open={addOpen} onOpenChange={setAddOpen} />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] leading-tight tracking-tight">
            {greeting}, {firstName}.
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {stats.currentStreak > 0
              ? `${pluralize(stats.currentStreak, 'day')} in a row. Keep it going.`
              : 'No reading logged in the last two days.'}
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus /> Add book
        </Button>
      </div>

      {/* ------------------------------------------------- continue reading */}
      <section className="mb-10">
        <SectionHeading
          title="Continue reading"
          action={
            reading.length > 0 ? (
              <Button asChild size="sm" variant="ghost">
                <Link to="/library/reading">See all</Link>
              </Button>
            ) : undefined
          }
        />
        {reading.length === 0 ? (
          <EmptyState
            icon={<BookOpen />}
            title="Nothing in progress"
            description="Start a book from your library and track it here."
            actions={
              <Button asChild>
                <Link to="/library/want-to-read">Browse Want to Read</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {reading.slice(0, 4).map((entry) => (
              <Card key={entry.book.id} className="flex gap-4 p-4">
                <Link to={`/books/${entry.book.id}`} className="w-16 shrink-0">
                  <BookCover book={entry.book} />
                </Link>
                <div className="min-w-0 flex-1">
                  <Link
                    to={`/books/${entry.book.id}`}
                    className="block truncate text-sm font-medium text-text hover:text-accent"
                  >
                    {entry.book.title}
                  </Link>
                  <p className="mb-3 truncate text-xs text-text-faint">
                    {entry.book.authors.join(', ') || 'Unknown author'} · opened{' '}
                    {relativeTime(entry.userBook.lastOpenedAt ?? entry.userBook.updatedAt)}
                  </p>
                  <ProgressControl
                    book={entry.book}
                    userBook={entry.userBook}
                    onUpdated={reload}
                    compact
                  />
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------------- statistics */}
      <section className="mb-10 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="p-5">
          <SectionHeading
            title="Reading statistics"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link to="/statistics">
                  <TrendingUp /> Details
                </Link>
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat
              label={`Read in ${year}`}
              value={stats.booksFinishedThisYear}
              hint={`${stats.booksFinishedAllTime} all time`}
            />
            <Stat
              label="Pages this year"
              value={formatNumber(stats.pagesReadThisYear)}
              hint={`${formatNumber(stats.pagesReadAllTime)} all time`}
            />
            <Stat
              label="Streak"
              value={
                <span className="inline-flex items-center gap-1.5">
                  {stats.currentStreak}
                  {stats.currentStreak > 0 && (
                    <Flame className="size-4 text-warning" />
                  )}
                </span>
              }
              hint={`Longest ${stats.longestStreak}`}
            />
            <Stat
              label="Average rating"
              value={stats.averageRating ? stats.averageRating.toFixed(1) : '—'}
              hint="Across rated books"
            />
          </div>
          <div className="mt-5 grid grid-cols-2 gap-5 border-t border-border pt-5 sm:grid-cols-4">
            <Stat label="Reading" value={stats.currentlyReading} />
            <Stat label="Planned" value={stats.wantToRead} />
            <Stat label="Did not finish" value={stats.dnfCount} />
            <Stat
              label="Avg. length"
              value={stats.averageBookLength ? `${stats.averageBookLength}p` : '—'}
            />
          </div>
        </Card>

        <Card className="flex flex-col p-5">
          <SectionHeading
            title={`${year} reading goal`}
            action={
              <Button asChild size="sm" variant="ghost">
                <Link to="/goals">
                  <Target /> Edit
                </Link>
              </Button>
            }
          />
          {goal ? (
            <div className="flex flex-1 flex-col justify-center">
              <p className="font-serif text-[32px] leading-none tracking-tight">
                {stats.booksFinishedThisYear}
                <span className="text-text-faint"> / {goal.target}</span>
              </p>
              <p className="mt-1.5 text-[13px] text-text-muted">
                {goal.target - stats.booksFinishedThisYear > 0
                  ? `${pluralize(goal.target - stats.booksFinishedThisYear, 'book')} to go`
                  : 'Goal reached — nicely done.'}
              </p>
              <ProgressBar
                value={goalPercent}
                className="mt-4"
                tone={goalPercent >= 100 ? 'success' : 'accent'}
                label={`${goalPercent}% of your ${year} goal`}
              />
              <p className="mt-2 text-xs text-text-faint">{goalPercent}% complete</p>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-start justify-center gap-3">
              <p className="text-[13px] text-text-muted">
                No goal set for {year} yet.
              </p>
              <Button size="sm" onClick={() => navigate('/goals')}>
                <Target /> Set a goal
              </Button>
            </div>
          )}
        </Card>
      </section>

      {/* ---------------------------------------------------------- knowledge */}
      <section className="mb-10 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <SectionHeading
            title="Recent notes"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link to="/notes">All notes</Link>
              </Button>
            }
          />
          {notes.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-faint">
              Nothing written down yet.
            </p>
          ) : (
            <ul className="space-y-0">
              {notes.slice(0, 5).map((note) => (
                <li key={note.id}>
                  <Link
                    to={`/notes/${note.id}`}
                    className="-mx-2 flex items-baseline gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-hover"
                  >
                    <BookText className="size-3.5 shrink-0 translate-y-0.5 text-text-faint" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-text">
                      {note.title || 'Untitled note'}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-faint">
                      {relativeTime(note.updatedAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="p-5">
          <SectionHeading
            title="Recent quotes"
            action={
              <Button asChild size="sm" variant="ghost">
                <Link to="/quotes">All quotes</Link>
              </Button>
            }
          />
          {quotes.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-text-faint">
              No quotes saved yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {quotes.slice(0, 3).map((quote) => (
                <li key={quote.id} className="border-l-2 border-border pl-3">
                  <p className="line-clamp-2 font-serif text-[14px] leading-relaxed text-text">
                    {quote.text}
                  </p>
                  <p className="mt-1 flex items-center gap-2 text-[11px] text-text-faint">
                    <QuoteIcon className="size-3" />
                    {quote.bookId
                      ? entries.find((e) => e.book.id === quote.bookId)?.book.title ??
                        'Unknown book'
                      : 'No source'}
                    {quote.page != null && <span>· p. {quote.page}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* -------------------------------------------------------- recent spaces */}
      <section className="mb-10">
        <SectionHeading
          title="Recent Spaces"
          description="Infinite canvases for thinking things through"
          action={
            <Button asChild size="sm" variant="ghost">
              <Link to="/spaces">View all</Link>
            </Button>
          }
        />
        {spaces.length === 0 ? (
          <EmptyState
            icon={<LayoutDashboard />}
            title="No Spaces yet"
            description="Open a book and build its Knowledge Space, or start from a blank canvas."
            actions={
              <Button asChild variant="primary">
                <Link to="/spaces">Create a Space</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {spaces.slice(0, 4).map((space) => (
              <Link
                key={space.id}
                to={`/spaces/${space.id}`}
                className="group rounded-xl border border-border p-2 transition-colors hover:border-border-strong hover:bg-surface-hover"
              >
                <div
                  className="flex aspect-[16/10] items-center justify-center rounded-lg border border-border bg-bg-subtle"
                  style={{
                    backgroundImage:
                      'radial-gradient(circle, var(--border-strong) 1px, transparent 1px)',
                    backgroundSize: '12px 12px',
                  }}
                >
                  <LayoutDashboard className="size-5 text-text-faint opacity-60" />
                </div>
                <p className="mt-2 truncate text-[13px] font-medium text-text">
                  {space.name}
                </p>
                <p className="truncate text-[11px] text-text-faint">
                  Edited {relativeTime(space.updatedAt)}
                </p>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* -------------------------------------------------- continue working */}
      {recentlyOpened.length > 0 && (
        <section>
          <SectionHeading title="Continue where you left off" />
          <div className="flex flex-wrap gap-3">
            {recentlyOpened.map((entry) => (
              <Link
                key={entry.book.id}
                to={`/books/${entry.book.id}`}
                className="flex w-56 items-center gap-3 rounded-xl border border-border bg-surface p-2.5 transition-colors hover:border-border-strong hover:bg-surface-hover"
              >
                <BookCover book={entry.book} className="w-8" rounded="rounded-sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-text">
                    {entry.book.title}
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-text-faint">
                    <Clock className="size-3" />
                    {relativeTime(entry.userBook.lastOpenedAt)}
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p className="mt-4 text-xs text-text-faint">
            <Badge>Tip</Badge> Press ⌘K to search your library, notes and quotes.
          </p>
        </section>
      )}

      <AddBookDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
