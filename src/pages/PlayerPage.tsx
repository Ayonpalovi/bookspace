import * as TabsPrimitive from '@radix-ui/react-tabs'
import { Flame, Info, Lock, Sparkles } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { BookCover } from '@/components/books/BookCover'
import { Avatar, Badge, Card, EmptyState, PageLoader, ProgressBar } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import { loadGameInput } from '@/data/game'
import {
  achievements as computeAchievements,
  activeQuest,
  computeProfile,
  computeStreak,
  dailyQuests,
  journal as computeJournal,
  nextPerk,
  rarityFor,
  unlockedPerks,
  weeklyQuest,
  PERKS,
  RARITY_LABEL,
  RARITY_MEANING,
  RARITY_TONE,
  STAT_BASIS,
  STAT_LABEL,
  type CharacterStats,
} from '@/lib/game'
import { useSession } from '@/stores/session'
import { useVersion } from '@/stores/data'
import { cn, formatDate, formatNumber } from '@/lib/utils'

const TAB_CLASS =
  'relative px-3 py-2 text-[13px] font-medium text-text-muted transition-colors hover:text-text data-[state=active]:text-text after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent'

export function PlayerPage() {
  useTab({ title: 'Player', kind: 'page', icon: 'goal' })
  const profile = useSession((s) => s.profile)!
  const libraryVersion = useVersion('library')
  const notesVersion = useVersion('notes')
  const quotesVersion = useVersion('quotes')
  const spacesVersion = useVersion('spaces')

  const { data, loading } = useAsync(
    async () => loadGameInput(profile.id),
    [profile.id, libraryVersion, notesVersion, quotesVersion, spacesVersion],
  )

  const game = useMemo(() => {
    if (!data) return null
    const player = computeProfile(data)
    return {
      player,
      streak: computeStreak(data.sessions, player.level.level),
      quest: activeQuest(data),
      daily: dailyQuests(data),
      weekly: weeklyQuest(data),
      achievements: computeAchievements(data),
      journal: computeJournal(data),
      finished: data.entries
        .filter((e) => e.userBook.status === 'finished')
        .sort((a, b) =>
          (b.userBook.dateFinished ?? '').localeCompare(a.userBook.dateFinished ?? ''),
        ),
    }
  }, [data])

  if (loading && !game) return <PageLoader label="Reading your save file" />
  if (!game || !data) return null

  const { player, streak, quest, daily, weekly, achievements, journal, finished } = game
  const earned = achievements.filter((a) => a.earned)
  const perks = unlockedPerks(player.level.level)
  const upcoming = nextPerk(player.level.level)

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* ------------------------------------------------------- player card */}
      <Card className="relative overflow-hidden p-6">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            background:
              'radial-gradient(120% 90% at 85% -20%, var(--accent-subtle), transparent 60%)',
          }}
        />
        <div className="relative flex flex-wrap items-start gap-5">
          <Avatar name={profile.displayName} src={profile.avatarUrl} size={64} />
          <div className="min-w-0 flex-1">
            <p className="font-serif text-[24px] leading-tight tracking-tight">
              {profile.displayName}
            </p>
            <p className="text-[13px] text-text-muted">
              Level {player.level.level} · {player.level.title}
            </p>

            <div className="mt-4 max-w-md">
              <ProgressBar
                value={player.level.progress}
                label={`${player.level.progress}% to level ${player.level.level + 1}`}
              />
              <p className="mt-1.5 text-[11px] tabular-nums text-text-faint">
                {formatNumber(player.level.xpIntoLevel)} /{' '}
                {formatNumber(player.level.xpForLevel)} XP to level{' '}
                {player.level.level + 1}
                {player.level.nextTitle ? ` · ${player.level.nextTitle}` : ''}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            {[
              { label: 'Knowledge', value: formatNumber(player.knowledge), icon: '🧠' },
              { label: 'Books', value: player.booksFinished, icon: '📚' },
              {
                label: 'Streak',
                value: `${streak.current}d`,
                icon: '🔥',
              },
              { label: 'XP', value: formatNumber(player.xp), icon: '⭐' },
            ].map((stat) => (
              <div key={stat.label}>
                <p className="text-[11px] font-medium uppercase tracking-wider text-text-faint">
                  {stat.icon} {stat.label}
                </p>
                <p className="font-serif text-xl leading-tight tracking-tight">
                  {stat.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        {streak.current > 0 && (
          <p className="relative mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4 text-[13px] text-text-muted">
            <Flame className="size-3.5 text-warning" />
            <span>
              <strong className="font-medium text-text">
                {streak.current}-day reading ritual.
              </strong>{' '}
              Longest {streak.longest}.
            </span>
            <Badge tone={streak.restDaysAvailable > 0 ? 'neutral' : 'outline'}>
              {streak.restDaysAvailable} rest{' '}
              {streak.restDaysAvailable === 1 ? 'day' : 'days'} left
            </Badge>
            {!streak.readToday && (
              <span className="text-text-faint">Nothing logged today yet.</span>
            )}
          </p>
        )}
      </Card>

      {/* --------------------------------------------------------- the quest */}
      {quest && (
        <Card className="mt-4 p-5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
            Current quest
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="min-w-0">
              <p className="font-serif text-lg tracking-tight">{quest.title}</p>
              <p className="text-[13px] text-text-muted">
                Page {quest.currentPage}
                {quest.totalPages ? ` of ${quest.totalPages}` : ''} · +
                {quest.xpOnFinish} XP on completion
              </p>
            </div>
            <Button asChild variant="primary" size="sm">
              <Link to={`/books/${quest.bookId}`}>▶ Continue quest</Link>
            </Button>
          </div>
          <ProgressBar value={quest.percent} className="mt-3" label={`${quest.percent}% read`} />
        </Card>
      )}

      {/* -------------------------------------------------------------- tabs */}
      <TabsPrimitive.Root defaultValue="quests" className="mt-8">
        <TabsPrimitive.List className="flex gap-1 overflow-x-auto border-b border-border">
          <TabsPrimitive.Trigger value="quests" className={TAB_CLASS}>
            Quests
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="stats" className={TAB_CLASS}>
            Stats
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="achievements" className={TAB_CLASS}>
            Achievements
            <span className="ml-1.5 text-text-faint">
              {earned.length}/{achievements.length}
            </span>
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="collection" className={TAB_CLASS}>
            Collection
            <span className="ml-1.5 text-text-faint">{finished.length}</span>
          </TabsPrimitive.Trigger>
          <TabsPrimitive.Trigger value="journal" className={TAB_CLASS}>
            Journey
          </TabsPrimitive.Trigger>
        </TabsPrimitive.List>

        {/* ------------------------------------------------------- quests */}
        <TabsPrimitive.Content value="quests" className="animate-in-fade pt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-5">
              <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                Today
              </p>
              <ul className="space-y-2.5">
                {daily.map((item) => (
                  <li key={item.id} className="flex items-center gap-3">
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border text-[10px]',
                        item.done
                          ? 'border-success bg-success text-white'
                          : 'border-border-strong text-transparent',
                      )}
                      aria-hidden
                    >
                      ✓
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          'block text-[13px]',
                          item.done ? 'text-text-faint line-through' : 'text-text',
                        )}
                      >
                        {item.title}
                      </span>
                      <span className="block text-[11px] text-text-faint">
                        {item.detail}
                      </span>
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-text-faint">
                      +{item.xp} XP
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-3 text-[11px] leading-relaxed text-text-faint">
                Optional. They tick themselves off as you read — there is nothing to claim.
              </p>
            </Card>

            <Card className="p-5">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
                This week
              </p>
              <p className="mb-3 font-serif text-lg tracking-tight">{weekly.name}</p>
              <ul className="space-y-3">
                {weekly.parts.map((part) => (
                  <li key={part.id}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-[13px] text-text">{part.title}</span>
                      <span className="text-[11px] tabular-nums text-text-faint">
                        {part.detail}
                      </span>
                    </div>
                    <ProgressBar
                      value={(part.progress / part.target) * 100}
                      size="sm"
                      className="mt-1"
                      tone={part.done ? 'success' : 'accent'}
                      label={part.title}
                    />
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-3 text-[13px] text-text-muted">
                Reward: <span className="text-text">+{weekly.xp} XP</span>
                {weekly.done && <Badge tone="success" className="ml-2">Complete</Badge>}
              </p>
            </Card>
          </div>

          <Card className="mt-4 p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              Where your XP came from
            </p>
            {player.breakdown.length === 0 ? (
              <p className="py-4 text-center text-[13px] text-text-faint">
                Log some pages and this fills in.
              </p>
            ) : (
              <ul className="space-y-2">
                {player.breakdown.map((row) => (
                  <li key={row.label} className="flex items-baseline gap-3">
                    <span className="text-[13px] text-text">{row.label}</span>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-text-faint">
                      {row.detail}
                    </span>
                    <span className="shrink-0 text-[13px] tabular-nums text-text-muted">
                      {formatNumber(row.xp)} XP
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 flex items-start gap-2 border-t border-border pt-3 text-[11px] leading-relaxed text-text-faint">
              <Info className="mt-px size-3 shrink-0" />
              XP is recalculated from your actual records every time this page
              loads — there is no separate score to game. Notes and quotes are
              capped per book, so writing more of them thoughtlessly earns nothing.
            </p>
          </Card>
        </TabsPrimitive.Content>

        {/* -------------------------------------------------------- stats */}
        <TabsPrimitive.Content value="stats" className="animate-in-fade pt-6">
          <Card className="p-5">
            <div className="grid gap-5 sm:grid-cols-2">
              {(Object.keys(player.stats) as (keyof CharacterStats)[]).map((key) => (
                <div key={key}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[13px] font-medium text-text">
                      {STAT_LABEL[key]}
                    </span>
                    <span className="text-[13px] tabular-nums text-text-muted">
                      {player.stats[key]}
                    </span>
                  </div>
                  <ProgressBar
                    value={player.stats[key]}
                    size="sm"
                    className="mt-1.5"
                    label={STAT_LABEL[key]}
                  />
                  <p className="mt-1 text-[11px] text-text-faint">{STAT_BASIS[key]}</p>
                </div>
              ))}
            </div>
            <p className="mt-5 flex items-start gap-2 border-t border-border pt-4 text-[11px] leading-relaxed text-text-faint">
              <Info className="mt-px size-3 shrink-0" />
              These are BookSpace game stats, not a measurement of you. Each one
              is a simple curve over the activity named beneath it.
            </p>
          </Card>

          <Card className="mt-4 p-5">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
              Unlocks
            </p>
            <ul className="space-y-2.5">
              {PERKS.map((perk) => {
                const has = perks.includes(perk)
                return (
                  <li key={perk.name} className="flex items-start gap-3">
                    <span
                      className={cn(
                        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded text-[10px]',
                        has ? 'bg-accent-subtle text-accent' : 'bg-surface-sunken text-text-faint',
                      )}
                    >
                      {has ? <Sparkles className="size-3" /> : <Lock className="size-3" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span
                          className={cn(
                            'text-[13px] font-medium',
                            has ? 'text-text' : 'text-text-faint',
                          )}
                        >
                          {perk.name}
                        </span>
                        <Badge tone={perk.functional ? 'accent' : 'neutral'}>
                          {perk.functional ? 'Feature' : 'Cosmetic'}
                        </Badge>
                      </span>
                      <span className="block text-[11px] text-text-faint">
                        Level {perk.level} · {perk.description}
                      </span>
                    </span>
                  </li>
                )
              })}
            </ul>
            {upcoming && (
              <p className="mt-4 border-t border-border pt-3 text-[13px] text-text-muted">
                Next unlock at level {upcoming.level}: {upcoming.name}
              </p>
            )}
            <p className="mt-3 text-[11px] leading-relaxed text-text-faint">
              Unlocks are listed honestly: the ones marked Feature are planned
              functionality that is not built yet, so reaching the level will
              show them as available rather than switching anything on today.
            </p>
          </Card>
        </TabsPrimitive.Content>

        {/* ------------------------------------------------- achievements */}
        <TabsPrimitive.Content value="achievements" className="animate-in-fade pt-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {achievements.map((achievement) => (
              <Card
                key={achievement.id}
                className={cn('p-4', !achievement.earned && 'opacity-70')}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      'flex size-9 shrink-0 items-center justify-center rounded-lg text-[17px]',
                      achievement.earned ? 'bg-accent-subtle' : 'bg-surface-sunken grayscale',
                    )}
                  >
                    {achievement.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-text">{achievement.name}</p>
                    <p className="text-[11px] leading-snug text-text-faint">
                      {achievement.description}
                    </p>
                  </div>
                </div>
                {achievement.earned ? (
                  <p className="mt-3 text-[11px] text-success">
                    Earned{achievement.earnedAt ? ` · ${formatDate(achievement.earnedAt)}` : ''}
                  </p>
                ) : (
                  <>
                    <ProgressBar
                      value={(achievement.progress / achievement.target) * 100}
                      size="sm"
                      className="mt-3"
                      label={achievement.name}
                    />
                    <p className="mt-1 text-[11px] tabular-nums text-text-faint">
                      {achievement.progress} / {achievement.target}
                    </p>
                  </>
                )}
              </Card>
            ))}
          </div>
        </TabsPrimitive.Content>

        {/* --------------------------------------------------- collection */}
        <TabsPrimitive.Content value="collection" className="animate-in-fade pt-6">
          {finished.length === 0 ? (
            <EmptyState
              title="Your collection is empty"
              description="Finish a book and it becomes a card here. How rare the card is depends on how deeply you engaged with it, not on the book."
              actions={
                <Button asChild variant="primary">
                  <Link to="/library/reading">Open what you're reading</Link>
                </Button>
              }
            />
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {finished.map((entry) => {
                  const rarity = rarityFor(entry.book.id, data)
                  return (
                    <Card key={entry.book.id} className="overflow-hidden">
                      <div
                        className="h-1"
                        style={{ background: RARITY_TONE[rarity.rarity] }}
                        aria-hidden
                      />
                      <Link to={`/books/${entry.book.id}`} className="flex gap-3 p-4">
                        <BookCover book={entry.book} className="w-14 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-text">
                            {entry.book.title}
                          </p>
                          <p className="truncate text-[11px] text-text-faint">
                            {entry.book.authors.join(', ') || 'Unknown author'}
                          </p>
                          <p
                            className="mt-1.5 text-[11px] font-medium"
                            style={{ color: RARITY_TONE[rarity.rarity] }}
                          >
                            {RARITY_LABEL[rarity.rarity]}
                          </p>
                          <p className="text-[11px] leading-snug text-text-faint">
                            {RARITY_MEANING[rarity.rarity]}
                          </p>
                          <p className="mt-1.5 text-[11px] text-text-muted">
                            {entry.userBook.dateFinished
                              ? formatDate(entry.userBook.dateFinished)
                              : ''}
                            {entry.userBook.rating ? ` · ★ ${entry.userBook.rating}` : ''}
                          </p>
                        </div>
                      </Link>
                    </Card>
                  )
                })}
              </div>
              <p className="mt-5 text-[11px] leading-relaxed text-text-faint">
                Rarity describes your relationship with a book — notes, reflection,
                connections and whether you applied it — never the book's popularity.
              </p>
            </>
          )}
        </TabsPrimitive.Content>

        {/* ------------------------------------------------------ journal */}
        <TabsPrimitive.Content value="journal" className="animate-in-fade pt-6">
          {journal.length === 0 ? (
            <EmptyState
              title="Your journey starts with the first page"
              description="Milestones show up here as you read."
            />
          ) : (
            <ol className="space-y-0">
              {journal.map((item, index) => (
                <li
                  key={`${item.date}-${index}`}
                  className="flex items-start gap-3 border-b border-border py-3 last:border-0"
                >
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-surface-sunken text-[12px]">
                    {item.icon}
                  </span>
                  <span className="min-w-0 flex-1 text-[13px] text-text">{item.text}</span>
                  <span className="shrink-0 text-[11px] text-text-faint">
                    {formatDate(item.date)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </TabsPrimitive.Content>
      </TabsPrimitive.Root>
    </div>
  )
}
