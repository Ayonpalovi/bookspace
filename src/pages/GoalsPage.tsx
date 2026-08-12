import { Target, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Field, Input, NativeSelect } from '@/components/ui/field'
import {
  Card,
  EmptyState,
  PageLoader,
  ProgressBar,
  SectionHeading,
  Stat,
} from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import type { GoalMetric, GoalPeriod, ReadingGoal } from '@/types'
import { formatNumber, pluralize } from '@/lib/utils'

function progressFor(
  goal: ReadingGoal,
  stats: { booksFinishedThisYear: number; pagesReadThisYear: number },
  monthly: { month: string; books: number; pages: number }[],
): number {
  if (goal.period === 'year') {
    return goal.metric === 'books' ? stats.booksFinishedThisYear : stats.pagesReadThisYear
  }
  const point = monthly.find((m) => m.month === goal.periodKey)
  if (!point) return 0
  return goal.metric === 'books' ? point.books : point.pages
}

export function GoalsPage() {
  useTab({ title: 'Reading Goals', kind: 'page', icon: 'goal' })
  const profile = useSession((s) => s.profile)!
  const goalsVersion = useVersion('goals')
  const libraryVersion = useVersion('library')

  const [period, setPeriod] = useState<GoalPeriod>('year')
  const [metric, setMetric] = useState<GoalMetric>('books')
  const [target, setTarget] = useState('24')
  const [saving, setSaving] = useState(false)

  const { data, loading, reload } = useAsync(
    async () => ({
      goals: await repo.listGoals(profile.id),
      stats: await repo.getStats(profile.id),
      monthly: await repo.getMonthlyBreakdown(profile.id),
    }),
    [profile.id, goalsVersion, libraryVersion],
  )

  const save = async () => {
    const value = Number.parseInt(target, 10)
    if (!Number.isFinite(value) || value <= 0) {
      toast.error('Enter a target above zero')
      return
    }
    setSaving(true)
    try {
      await repo.setGoal(profile.id, period, metric, value)
      bump('goals', 'activity')
      reload()
      toast.success('Goal saved')
    } finally {
      setSaving(false)
    }
  }

  if (loading && !data) return <PageLoader label="Loading goals" />
  if (!data) return null

  const { goals, stats, monthly } = data
  const currentYear = new Date().getFullYear()

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <div className="mb-7">
        <h1 className="font-serif text-[26px] leading-tight tracking-tight">
          Reading goals
        </h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Set a target for the year or the month. Progress is counted from your
          finished books and reading log.
        </p>
      </div>

      <Card className="mb-8 p-5">
        <SectionHeading title="Set a goal" />
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
          <Field label="Period">
            {(props) => (
              <NativeSelect
                {...props}
                value={period}
                onChange={(event) => setPeriod(event.target.value as GoalPeriod)}
              >
                <option value="year">This year ({currentYear})</option>
                <option value="month">This month</option>
              </NativeSelect>
            )}
          </Field>
          <Field label="Measure">
            {(props) => (
              <NativeSelect
                {...props}
                value={metric}
                onChange={(event) => setMetric(event.target.value as GoalMetric)}
              >
                <option value="books">Books</option>
                <option value="pages">Pages</option>
              </NativeSelect>
            )}
          </Field>
          <Field label="Target">
            {(props) => (
              <Input
                {...props}
                type="number"
                min={1}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
              />
            )}
          </Field>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : 'Save goal'}
          </Button>
        </div>
      </Card>

      <SectionHeading title="Your goals" />
      {goals.length === 0 ? (
        <EmptyState
          icon={<Target />}
          title="No goals set yet"
          description="A yearly target is the easiest place to start."
        />
      ) : (
        <div className="space-y-3">
          {goals
            .sort((a, b) => b.periodKey.localeCompare(a.periodKey))
            .map((goal) => {
              const current = progressFor(goal, stats, monthly)
              const percent = Math.min(
                100,
                Math.round((current / Math.max(1, goal.target)) * 100),
              )
              const label =
                goal.period === 'year'
                  ? `${goal.periodKey} · ${goal.metric}`
                  : `${new Date(`${goal.periodKey}-01`).toLocaleDateString(undefined, {
                      month: 'long',
                      year: 'numeric',
                    })} · ${goal.metric}`
              return (
                <Card key={goal.id} className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <Stat
                      label={label}
                      value={
                        <>
                          {formatNumber(current)}
                          <span className="text-text-faint"> / {formatNumber(goal.target)}</span>
                        </>
                      }
                      hint={
                        current >= goal.target
                          ? 'Goal reached.'
                          : `${pluralize(goal.target - current, goal.metric === 'books' ? 'book' : 'page')} to go`
                      }
                    />
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Delete goal"
                      onClick={async () => {
                        await repo.deleteGoal(profile.id, goal.id)
                        bump('goals')
                        reload()
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <ProgressBar
                    value={percent}
                    className="mt-4"
                    tone={percent >= 100 ? 'success' : 'accent'}
                    label={`${percent}% of ${label}`}
                  />
                  <p className="mt-2 text-xs text-text-faint">{percent}% complete</p>
                </Card>
              )
            })}
        </div>
      )}
    </div>
  )
}
