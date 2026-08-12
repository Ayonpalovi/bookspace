import { useMemo, useState } from 'react'
import { ActivityStrip, ColumnChart, RankedBars } from '@/components/charts/Charts'
import { Card, PageLoader, SectionHeading, Stat } from '@/components/ui/primitives'
import { Segmented } from '@/components/ui/primitives'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { useVersion } from '@/stores/data'
import { formatNumber, startOfDay } from '@/lib/utils'

const DAY_MS = 86_400_000
const STRIP_DAYS = 84

export function StatisticsPage() {
  useTab({ title: 'Statistics', kind: 'page', icon: 'stats' })
  const profile = useSession((s) => s.profile)!
  const libraryVersion = useVersion('library')
  const [metric, setMetric] = useState<'books' | 'pages'>('books')

  const year = new Date().getFullYear()

  const { data, loading } = useAsync(
    async () => {
      const [stats, monthly, authors, genres, sessions] = await Promise.all([
        repo.getStats(profile.id),
        repo.getMonthlyBreakdown(profile.id, year),
        repo.getTopAuthors(profile.id, 6),
        repo.getTopGenres(profile.id, 6),
        repo.listSessions(profile.id),
      ])
      return { stats, monthly, authors, genres, sessions }
    },
    [profile.id, year, libraryVersion],
  )

  const strip = useMemo(() => {
    const byDay = new Map<number, number>()
    for (const session of data?.sessions ?? []) {
      const key = startOfDay(session.readAt).getTime()
      byDay.set(key, (byDay.get(key) ?? 0) + session.pagesRead)
    }
    const today = startOfDay(new Date()).getTime()
    return Array.from({ length: STRIP_DAYS }, (_, i) => {
      const time = today - (STRIP_DAYS - 1 - i) * DAY_MS
      return { date: new Date(time).toISOString(), value: byDay.get(time) ?? 0 }
    })
  }, [data])

  if (loading && !data) return <PageLoader label="Crunching your numbers" />
  if (!data) return null

  const { stats, monthly, authors, genres } = data
  const percent = (value: number | null) =>
    value == null ? '—' : `${Math.round(value * 100)}%`

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-7">
        <h1 className="font-serif text-[26px] leading-tight tracking-tight">
          Statistics
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Everything below is derived from your reading log.
        </p>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <Stat
            label="Books read"
            value={stats.booksFinishedAllTime}
            hint={`${stats.booksFinishedThisYear} in ${year}`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Pages read"
            value={formatNumber(stats.pagesReadAllTime)}
            hint={`${formatNumber(stats.pagesReadThisYear)} in ${year}`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Current streak"
            value={`${stats.currentStreak}d`}
            hint={`Longest ${stats.longestStreak} days`}
          />
        </Card>
        <Card className="p-5">
          <Stat
            label="Average rating"
            value={stats.averageRating ? stats.averageRating.toFixed(1) : '—'}
            hint="Across rated books"
          />
        </Card>
      </div>

      <Card className="mb-8 p-5">
        <SectionHeading
          title={`${year} by month`}
          description={
            metric === 'books' ? 'Books finished each month' : 'Pages logged each month'
          }
          action={
            <Segmented
              label="Metric"
              value={metric}
              onChange={setMetric}
              options={[
                { value: 'books', label: 'Books' },
                { value: 'pages', label: 'Pages' },
              ]}
            />
          }
        />
        <ColumnChart
          valueLabel={metric}
          data={monthly.map((point) => ({
            label: point.label,
            title: `${point.label} ${year}`,
            value: metric === 'books' ? point.books : point.pages,
          }))}
        />
      </Card>

      <Card className="mb-8 p-5">
        <SectionHeading
          title="Reading consistency"
          description="Pages logged per day over the last 12 weeks"
        />
        <ActivityStrip days={strip} />
        <p className="mt-3 text-xs text-text-faint">
          Each square is one day. Darker means more pages.
        </p>
      </Card>

      <div className="mb-8 grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <SectionHeading title="Most-read authors" description="Finished books only" />
          <RankedBars
            valueLabel="books"
            data={authors.map((a) => ({ label: a.name, value: a.count }))}
            emptyMessage="Finish a book to see your most-read authors."
          />
        </Card>
        <Card className="p-5">
          <SectionHeading title="Genres in your library" />
          <RankedBars
            valueLabel="books"
            data={genres.map((g) => ({ label: g.name, value: g.count }))}
            emptyMessage="Add genres to your books to see this."
          />
        </Card>
      </div>

      <Card className="p-5">
        <SectionHeading
          title="Reading habits"
          description="How your library breaks down"
        />
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
          <Stat label="Currently reading" value={stats.currentlyReading} />
          <Stat label="Want to read" value={stats.wantToRead} />
          <Stat label="Did not finish" value={stats.dnfCount} />
          <Stat
            label="Completion rate"
            value={percent(stats.completionRate)}
            hint="Of books started"
          />
          <Stat label="DNF rate" value={percent(stats.dnfRate)} hint="Of books started" />
        </div>
        <div className="mt-6 border-t border-border pt-5">
          <Stat
            label="Average book length"
            value={
              stats.averageBookLength ? `${stats.averageBookLength} pages` : '—'
            }
            hint="Across finished books with a page count"
          />
        </div>
      </Card>
    </div>
  )
}
