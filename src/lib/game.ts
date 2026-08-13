/**
 * The game layer.
 *
 * Everything here is *derived* from records the app already keeps — books,
 * reading sessions, notes, quotes, reviews, learnings and canvas connections.
 * There is no XP ledger and no second copy of anything: recompute from the
 * same rows and the numbers can never drift from what the user actually did.
 *
 * Two rules shape the scoring:
 *
 *  1. Reading is the engine. Pages and finished books dominate the totals, so
 *     the fastest way to level is to read, not to click around the app.
 *  2. Quality over quantity (spec §2). Capture XP is capped per book and
 *     scaled by substance, so fifty empty notes score far less than one real
 *     one.
 */

import type { Activity, LibraryEntry, Note, Quote, ReadingSession, Review } from '@/types'
import type { Connection } from '@/types/canvas'
import type { Learning } from '@/types'
import { daysBetween, startOfDay } from '@/lib/utils'

/* --------------------------------------------------------------- constants */

export const XP = {
  perTenPages: 10,
  finishBook: 500,
  note: 20,
  quote: 10,
  reflection: 40,
  review: 60,
  connection: 15,
  appliedIdea: 100,
} as const

/** Capture XP per book is capped, so volume alone cannot farm levels. */
const CAPTURE_CAP_PER_BOOK = 240

/** A note has to say something before it scores. */
const MIN_NOTE_CHARS = 120
const MIN_QUOTE_CHARS = 40

export interface LevelInfo {
  level: number
  title: string
  xpIntoLevel: number
  xpForLevel: number
  progress: number
  totalXp: number
  nextTitle: string | null
}

const TITLES = [
  'Newcomer',
  'Curious',
  'Explorer',
  'Apprentice',
  'Scholar',
  'Thinker',
  'Researcher',
  'Strategist',
  'Philosopher',
  'Mastermind',
]

/** Titles repeat with a rank suffix past level 10 so progression never runs out. */
export function titleForLevel(level: number): string {
  if (level <= TITLES.length) return TITLES[level - 1]
  const cycle = Math.floor((level - 1) / TITLES.length)
  const name = TITLES[(level - 1) % TITLES.length]
  const suffix = ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][cycle] ?? `${cycle + 1}`
  return `${name} ${suffix}`.trim()
}

/**
 * Cost of the Nth level. Grows steadily rather than exponentially: a reader
 * who keeps reading keeps progressing, but early levels still come quickly.
 */
export function xpForLevel(level: number): number {
  return Math.round(400 + (level - 1) * 220 + (level - 1) ** 1.6 * 30)
}

export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1
  let remaining = Math.max(0, totalXp)
  let cost = xpForLevel(1)
  while (remaining >= cost && level < 999) {
    remaining -= cost
    level += 1
    cost = xpForLevel(level)
  }
  return {
    level,
    title: titleForLevel(level),
    xpIntoLevel: Math.round(remaining),
    xpForLevel: cost,
    progress: Math.min(100, Math.round((remaining / cost) * 100)),
    totalXp: Math.round(totalXp),
    nextTitle:
      titleForLevel(level + 1) === titleForLevel(level) ? null : titleForLevel(level + 1),
  }
}

/* ------------------------------------------------------------- level perks */

export interface Perk {
  level: number
  name: string
  description: string
  /** Perks that actually change the app, versus profile flourishes. */
  functional: boolean
}

export const PERKS: Perk[] = [
  {
    level: 3,
    name: 'Reading queue',
    description: 'Order your Want to Read shelf by priority.',
    functional: true,
  },
  {
    level: 5,
    name: 'Book Analysis canvas',
    description: 'A ready-made template for taking a book apart on a canvas.',
    functional: true,
  },
  {
    level: 8,
    name: 'Rest days',
    description: 'Earn a rest day every 8 levels so a missed day need not break a streak.',
    functional: true,
  },
  {
    level: 10,
    name: 'Knowledge map',
    description: 'See every connection you have drawn across all Spaces in one view.',
    functional: true,
  },
  {
    level: 12,
    name: 'Profile frames',
    description: 'Accent-tinted frames for your player card.',
    functional: false,
  },
  {
    level: 15,
    name: 'Compare books',
    description: 'Put two books side by side and diff what you learned from each.',
    functional: true,
  },
  {
    level: 20,
    name: 'Custom dashboard',
    description: 'Choose which panels your home screen shows.',
    functional: true,
  },
  {
    level: 25,
    name: 'Advanced statistics',
    description: 'Per-genre pace, rating bias and session-length analysis.',
    functional: true,
  },
]

export function unlockedPerks(level: number): Perk[] {
  return PERKS.filter((perk) => perk.level <= level)
}

export function nextPerk(level: number): Perk | null {
  return PERKS.find((perk) => perk.level > level) ?? null
}

/* ------------------------------------------------------------------ inputs */

export interface GameInput {
  entries: LibraryEntry[]
  sessions: ReadingSession[]
  notes: Note[]
  quotes: Quote[]
  reviews: Review[]
  learnings: Learning[]
  connections: Connection[]
  activities: Activity[]
}

export interface XpBreakdown {
  label: string
  xp: number
  detail: string
}

export interface GameProfile {
  xp: number
  level: LevelInfo
  breakdown: XpBreakdown[]
  knowledge: number
  booksFinished: number
  pagesRead: number
  stats: CharacterStats
}

/* --------------------------------------------------------------------- xp */

function substantiveNotes(notes: Note[]): Note[] {
  return notes.filter((note) => note.body.trim().length >= MIN_NOTE_CHARS)
}

function substantiveQuotes(quotes: Quote[]): Quote[] {
  // A quote counts when it was actually transcribed, and counts for more when
  // the reader added their own thought or filed it under a tag.
  return quotes.filter((quote) => quote.text.trim().length >= MIN_QUOTE_CHARS)
}

function learningDepth(learning: Learning): number {
  const fields = [
    learning.biggestLessons,
    learning.ideasWorthRemembering,
    learning.disagreements,
    learning.changedThinking,
    learning.howToApply,
    learning.favoriteIdeas,
    learning.oneSentenceSummary,
  ]
  return fields.filter((field) => field.trim().length >= 40).length
}

/** Capture XP for one book, capped so quantity alone cannot farm levels. */
function captureXpForBook(
  bookId: string,
  input: GameInput,
): { xp: number; notes: number; quotes: number } {
  const notes = substantiveNotes(input.notes.filter((n) => n.bookId === bookId))
  const quotes = substantiveQuotes(input.quotes.filter((q) => q.bookId === bookId))
  const raw =
    notes.length * XP.note +
    quotes.reduce((sum, quote) => sum + (quote.comment?.trim() ? XP.quote * 1.5 : XP.quote), 0)
  return {
    xp: Math.min(CAPTURE_CAP_PER_BOOK, Math.round(raw)),
    notes: notes.length,
    quotes: quotes.length,
  }
}

export function computeProfile(input: GameInput): GameProfile {
  const pagesRead = input.sessions.reduce((sum, session) => sum + session.pagesRead, 0)
  const readingXp = Math.round((pagesRead / 10) * XP.perTenPages)

  const finished = input.entries.filter((entry) => entry.userBook.status === 'finished')
  const finishXp = finished.length * XP.finishBook

  let captureXp = 0
  let noteCount = 0
  let quoteCount = 0
  for (const entry of input.entries) {
    const capture = captureXpForBook(entry.book.id, input)
    captureXp += capture.xp
    noteCount += capture.notes
    quoteCount += capture.quotes
  }
  // Standalone notes and quotes still count, under the same cap.
  const looseNotes = substantiveNotes(input.notes.filter((n) => !n.bookId))
  const looseQuotes = substantiveQuotes(input.quotes.filter((q) => !q.bookId))
  captureXp += Math.min(
    CAPTURE_CAP_PER_BOOK,
    looseNotes.length * XP.note + looseQuotes.length * XP.quote,
  )
  noteCount += looseNotes.length
  quoteCount += looseQuotes.length

  const reflectionDepth = input.learnings.reduce((sum, l) => sum + learningDepth(l), 0)
  const reflectionXp = reflectionDepth * XP.reflection

  const writtenReviews = input.reviews.filter((r) => r.body.trim().length >= 160)
  const reviewXp = writtenReviews.length * XP.review

  // Only labelled relationships count — an unlabelled line is not yet a thought.
  const meaningful = input.connections.filter(
    (c) => c.relationship !== 'none' || c.label.trim().length > 0,
  )
  const connectionXp = meaningful.length * XP.connection

  const applied = input.learnings.filter((l) => l.howToApply.trim().length >= 80)
  const appliedXp = applied.length * XP.appliedIdea

  const xp =
    readingXp + finishXp + captureXp + reflectionXp + reviewXp + connectionXp + appliedXp

  const breakdown: XpBreakdown[] = [
    {
      label: 'Pages read',
      xp: readingXp,
      detail: `${pagesRead.toLocaleString()} pages logged`,
    },
    {
      label: 'Books finished',
      xp: finishXp,
      detail: `${finished.length} completed`,
    },
    {
      label: 'Notes and quotes',
      xp: captureXp,
      detail: `${noteCount} notes · ${quoteCount} quotes that say something`,
    },
    {
      label: 'Reflection',
      xp: reflectionXp,
      detail: `${reflectionDepth} “What I learned” sections filled in`,
    },
    { label: 'Reviews', xp: reviewXp, detail: `${writtenReviews.length} written` },
    {
      label: 'Connections',
      xp: connectionXp,
      detail: `${meaningful.length} labelled links between ideas`,
    },
    {
      label: 'Applied ideas',
      xp: appliedXp,
      detail: `${applied.length} books turned into an action`,
    },
  ].filter((row) => row.xp > 0)

  // Knowledge points: one per finished book, per filled reflection section and
  // per meaningful connection. It measures understanding, not activity.
  const knowledge = finished.length + reflectionDepth + meaningful.length

  return {
    xp,
    level: levelFromXp(xp),
    breakdown,
    knowledge,
    booksFinished: finished.length,
    pagesRead,
    stats: computeStats(input),
  }
}

/* ------------------------------------------------------------------- stats */

export interface CharacterStats {
  knowledge: number
  focus: number
  curiosity: number
  reflection: number
  connection: number
  consistency: number
}

export const STAT_LABEL: Record<keyof CharacterStats, string> = {
  knowledge: 'Knowledge',
  focus: 'Focus',
  curiosity: 'Curiosity',
  reflection: 'Reflection',
  connection: 'Connection',
  consistency: 'Consistency',
}

export const STAT_BASIS: Record<keyof CharacterStats, string> = {
  knowledge: 'Books finished and reflections completed',
  focus: 'Average pages per reading session',
  curiosity: 'Distinct genres and authors in your library',
  reflection: '“What I learned” depth and written reviews',
  connection: 'Labelled links you have drawn between ideas',
  consistency: 'Share of the last 30 days with reading logged',
}

/** A 0–100 curve that rises fast at first, then asymptotes. */
function curve(value: number, midpoint: number): number {
  if (value <= 0) return 0
  return Math.round(100 * (value / (value + midpoint)))
}

export function computeStats(input: GameInput): CharacterStats {
  const finished = input.entries.filter((e) => e.userBook.status === 'finished').length
  const reflectionDepth = input.learnings.reduce((sum, l) => sum + learningDepth(l), 0)

  const sessions = input.sessions
  const avgPages = sessions.length
    ? sessions.reduce((sum, s) => sum + s.pagesRead, 0) / sessions.length
    : 0

  const genres = new Set(input.entries.flatMap((e) => e.book.genres))
  const authors = new Set(input.entries.flatMap((e) => e.book.authors))

  const meaningful = input.connections.filter(
    (c) => c.relationship !== 'none' || c.label.trim().length > 0,
  ).length

  const activeDays = new Set(
    sessions
      .filter((s) => daysBetween(new Date(), s.readAt) <= 30)
      .map((s) => startOfDay(s.readAt).getTime()),
  ).size

  return {
    knowledge: curve(finished * 3 + reflectionDepth, 22),
    focus: curve(avgPages, 28),
    curiosity: curve(genres.size * 2 + authors.size, 26),
    reflection: curve(
      reflectionDepth * 2 + input.reviews.filter((r) => r.body.trim().length >= 160).length * 3,
      20,
    ),
    connection: curve(meaningful * 2, 18),
    consistency: Math.round((activeDays / 30) * 100),
  }
}

/* ------------------------------------------------------------------ streak */

export interface StreakInfo {
  current: number
  longest: number
  restDaysAvailable: number
  readToday: boolean
}

/**
 * Streaks with rest days (spec §19).
 *
 * A rest day covers a single missed day so one busy evening does not erase
 * weeks of reading. Rest days accrue with level, and the count shown is what
 * remains after the gaps already absorbed by the current run.
 */
export function computeStreak(sessions: ReadingSession[], level: number): StreakInfo {
  const days = [...new Set(sessions.map((s) => startOfDay(s.readAt).getTime()))].sort(
    (a, b) => b - a,
  )
  if (!days.length) {
    return { current: 0, longest: 0, restDaysAvailable: restDayAllowance(level), readToday: false }
  }

  const allowance = restDayAllowance(level)
  const gapFromToday = daysBetween(new Date(), days[0])
  const readToday = gapFromToday === 0

  let current = 0
  let restUsed = 0
  if (gapFromToday <= 1 + allowance) {
    restUsed = Math.max(0, gapFromToday - 1)
    current = 1
    for (let i = 1; i < days.length; i++) {
      const gap = daysBetween(days[i - 1], days[i])
      if (gap === 1) {
        current += 1
      } else if (gap - 1 + restUsed <= allowance) {
        // A rest day bridges the hole; the run continues.
        restUsed += gap - 1
        current += 1
      } else {
        break
      }
    }
  }

  let longest = 1
  let run = 1
  for (let i = 1; i < days.length; i++) {
    if (daysBetween(days[i - 1], days[i]) === 1) {
      run += 1
      longest = Math.max(longest, run)
    } else {
      run = 1
    }
  }

  return {
    current,
    longest: Math.max(longest, current),
    restDaysAvailable: Math.max(0, allowance - restUsed),
    readToday,
  }
}

export function restDayAllowance(level: number): number {
  // One rest day to start, another every 8 levels, capped so it stays a safety
  // net rather than a way to keep a streak without reading.
  return Math.min(4, 1 + Math.floor(level / 8))
}

/* ------------------------------------------------------------------ rarity */

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Common',
  uncommon: 'Uncommon',
  rare: 'Rare',
  epic: 'Epic',
  legendary: 'Legendary',
}

export const RARITY_MEANING: Record<Rarity, string> = {
  common: 'Read, but barely marked',
  uncommon: 'Read with notes',
  rare: 'Read, noted and reflected on',
  epic: 'Read and connected to other ideas',
  legendary: 'Read, understood and applied',
}

export const RARITY_TONE: Record<Rarity, string> = {
  common: 'var(--text-faint)',
  uncommon: 'var(--success)',
  rare: 'var(--accent)',
  epic: 'oklch(62% 0.16 300)',
  legendary: 'var(--warning)',
}

/**
 * Rarity describes the reader's relationship with a book, never the book's
 * popularity (spec §13). It is earned by engagement, so it cannot be bought
 * or randomised.
 */
export function rarityFor(
  bookId: string,
  input: GameInput,
): { rarity: Rarity; notes: number; quotes: number; connections: number; applied: boolean } {
  const notes = substantiveNotes(input.notes.filter((n) => n.bookId === bookId)).length
  const quotes = substantiveQuotes(input.quotes.filter((q) => q.bookId === bookId)).length
  const learning = input.learnings.find((l) => l.bookId === bookId)
  const depth = learning ? learningDepth(learning) : 0
  const applied = Boolean(learning && learning.howToApply.trim().length >= 80)

  // Connections that touch a card carrying this book.
  const connections = input.connections.filter(
    (c) => c.label.trim().length > 0 || c.relationship !== 'none',
  ).length

  let rarity: Rarity = 'common'
  if (notes + quotes > 0) rarity = 'uncommon'
  if (depth >= 3) rarity = 'rare'
  if (depth >= 3 && connections > 0) rarity = 'epic'
  if (applied && depth >= 5) rarity = 'legendary'

  return { rarity, notes, quotes, connections, applied }
}

/* ------------------------------------------------------------------ quests */

export interface Quest {
  id: string
  title: string
  detail: string
  progress: number
  target: number
  xp: number
  done: boolean
}

/** Today's optional quests, measured against what has actually happened today. */
export function dailyQuests(input: GameInput): Quest[] {
  const today = startOfDay(new Date()).getTime()
  const isToday = (iso: string) => startOfDay(iso).getTime() === today

  const pagesToday = input.sessions
    .filter((s) => isToday(s.readAt))
    .reduce((sum, s) => sum + s.pagesRead, 0)
  const notesToday = substantiveNotes(input.notes.filter((n) => isToday(n.createdAt))).length
  const quotesToday = input.quotes.filter((q) => isToday(q.createdAt)).length
  const linksToday = input.connections.filter(
    (c) => isToday(c.createdAt) && (c.relationship !== 'none' || c.label.trim().length > 0),
  ).length

  const quest = (
    id: string,
    title: string,
    detail: string,
    progress: number,
    target: number,
    xp: number,
  ): Quest => ({
    id,
    title,
    detail,
    progress: Math.min(progress, target),
    target,
    xp,
    done: progress >= target,
  })

  return [
    quest('pages', 'Read 10 pages', `${pagesToday} today`, pagesToday, 10, 20),
    quest('capture', 'Capture one idea', `${notesToday} notes today`, notesToday, 1, 15),
    quest('quote', 'Save a quote', `${quotesToday} today`, quotesToday, 1, 10),
    quest('connect', 'Connect two ideas', `${linksToday} links today`, linksToday, 1, 25),
  ]
}

export function weeklyQuest(input: GameInput): {
  name: string
  parts: Quest[]
  xp: number
  done: boolean
} {
  const weekAgo = Date.now() - 7 * 86_400_000
  const since = (iso: string) => new Date(iso).getTime() >= weekAgo

  const pages = input.sessions
    .filter((s) => since(s.readAt))
    .reduce((sum, s) => sum + s.pagesRead, 0)
  const ideas = substantiveNotes(input.notes.filter((n) => since(n.createdAt))).length
  const links = input.connections.filter(
    (c) => since(c.createdAt) && (c.relationship !== 'none' || c.label.trim().length > 0),
  ).length

  const parts: Quest[] = [
    { id: 'w-pages', title: 'Read 90 pages', detail: `${pages} of 90`, progress: Math.min(pages, 90), target: 90, xp: 0, done: pages >= 90 },
    { id: 'w-ideas', title: 'Capture 3 ideas', detail: `${ideas} of 3`, progress: Math.min(ideas, 3), target: 3, xp: 0, done: ideas >= 3 },
    { id: 'w-links', title: 'Create 2 connections', detail: `${links} of 2`, progress: Math.min(links, 2), target: 2, xp: 0, done: links >= 2 },
  ]

  return { name: 'The Thinker', parts, xp: 250, done: parts.every((p) => p.done) }
}

/* ------------------------------------------------------------ achievements */

export interface Achievement {
  id: string
  name: string
  description: string
  icon: string
  earned: boolean
  progress: number
  target: number
  earnedAt: string | null
}

export function achievements(input: GameInput): Achievement[] {
  const finished = input.entries.filter((e) => e.userBook.status === 'finished')
  const finishedDates = finished
    .map((e) => e.userBook.dateFinished)
    .filter((d): d is string => Boolean(d))
    .sort()
  const notes = substantiveNotes(input.notes)
  const quotes = substantiveQuotes(input.quotes)
  const meaningful = input.connections.filter(
    (c) => c.relationship !== 'none' || c.label.trim().length > 0,
  )
  const genres = new Set(input.entries.flatMap((e) => e.book.genres))
  const applied = input.learnings.filter((l) => l.howToApply.trim().length >= 80)
  const knowledge =
    finished.length +
    input.learnings.reduce((sum, l) => sum + learningDepth(l), 0) +
    meaningful.length

  const make = (
    id: string,
    name: string,
    description: string,
    icon: string,
    progress: number,
    target: number,
    earnedAt: string | null = null,
  ): Achievement => ({
    id,
    name,
    description,
    icon,
    progress: Math.min(progress, target),
    target,
    earned: progress >= target,
    earnedAt: progress >= target ? earnedAt : null,
  })

  return [
    make('first-quest', 'First Quest', 'Start reading a book', '🗺️',
      input.entries.filter((e) => e.userBook.dateStarted).length, 1),
    make('first-book', 'First Book Complete', 'Finish your first book', '📚',
      finished.length, 1, finishedDates[0] ?? null),
    make('ten-books', 'Ten Books', 'Finish ten books', '📖', finished.length, 10,
      finishedDates[9] ?? null),
    make('streak-7', 'Seven Day Ritual', 'Read seven days in a row', '🔥',
      computeStreak(input.sessions, 1).longest, 7),
    make('knowledge-100', 'Hundred Points of Knowledge',
      'Reach 100 knowledge points', '🧠', knowledge, 100),
    make('first-link', 'First Connection', 'Label a link between two ideas', '🔗',
      meaningful.length, 1),
    make('fifty-links', 'Web of Ideas', 'Draw fifty labelled connections', '🕸️',
      meaningful.length, 50),
    make('first-boss', 'First Reflection', 'Complete a book reflection', '⚔️',
      input.learnings.filter((l) => learningDepth(l) >= 3).length, 1),
    make('five-topics', 'Five Topics', 'Read across five different genres', '🌎',
      genres.size, 5),
    make('applied', 'Put Into Practice', 'Turn a book into a concrete action', '💡',
      applied.length, 1),
    make('notes-100', 'Hundred Notes', 'Write a hundred substantial notes', '✍️',
      notes.length, 100),
    make('quotes-50', 'Fifty Quotes', 'Save fifty quotes worth keeping', '❝',
      quotes.length, 50),
  ]
}

/* ------------------------------------------------------------------ journal */

export interface JournalEntry {
  date: string
  icon: string
  text: string
}

/** The achievement journal is the activity feed, filtered to milestones. */
export function journal(input: GameInput, limit = 25): JournalEntry[] {
  const entries: JournalEntry[] = []

  for (const entry of input.entries) {
    if (entry.userBook.status === 'finished' && entry.userBook.dateFinished) {
      entries.push({
        date: entry.userBook.dateFinished,
        icon: '📚',
        text: `Completed ${entry.book.title}`,
      })
    }
    if (entry.userBook.dateStarted) {
      entries.push({
        date: entry.userBook.dateStarted,
        icon: '🗺️',
        text: `Began ${entry.book.title}`,
      })
    }
  }

  for (const achievement of achievements(input)) {
    if (achievement.earned && achievement.earnedAt) {
      entries.push({
        date: achievement.earnedAt,
        icon: achievement.icon,
        text: `Earned ${achievement.name}`,
      })
    }
  }

  for (const activity of input.activities) {
    if (activity.kind === 'space_created' || activity.kind === 'review_written') {
      entries.push({
        date: activity.createdAt,
        icon: activity.kind === 'space_created' ? '🗺️' : '⭐',
        text: activity.summary,
      })
    }
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit)
}

/* -------------------------------------------------------------- book quest */

export interface BookQuest {
  bookId: string
  title: string
  percent: number
  currentPage: number
  totalPages: number | null
  xpOnFinish: number
  lastReadAt: string | null
}

/** The book the user is most likely to pick back up. */
export function activeQuest(input: GameInput): BookQuest | null {
  const reading = input.entries
    .filter((e) => e.userBook.status === 'reading')
    .sort((a, b) =>
      (b.userBook.lastOpenedAt ?? b.userBook.updatedAt).localeCompare(
        a.userBook.lastOpenedAt ?? a.userBook.updatedAt,
      ),
    )
  const entry = reading[0]
  if (!entry) return null
  return {
    bookId: entry.book.id,
    title: entry.book.title,
    percent: entry.percent,
    currentPage: entry.userBook.currentPage,
    totalPages: entry.book.pageCount,
    xpOnFinish: XP.finishBook,
    lastReadAt: entry.userBook.lastOpenedAt,
  }
}
