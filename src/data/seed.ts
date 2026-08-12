/**
 * Demo data.
 *
 * Seeded once per account, on request from onboarding or Settings. It writes
 * through the same repository functions the UI uses, so nothing here is a
 * special case the real app doesn't exercise.
 */

import { get, put } from './db'
import * as repo from './repository'
import type { ReadingSession, UserBook } from '@/types'
import { uid } from '@/lib/utils'

interface SeedBook {
  title: string
  subtitle?: string
  authors: string[]
  pageCount: number
  publisher: string
  publishedDate: string
  genres: string[]
  description: string
  isbn: string
}

const BOOKS: SeedBook[] = [
  {
    title: 'Atomic Habits',
    subtitle: 'An Easy & Proven Way to Build Good Habits & Break Bad Ones',
    authors: ['James Clear'],
    pageCount: 320,
    publisher: 'Avery',
    publishedDate: '2018-10-16',
    genres: ['Productivity', 'Psychology', 'Self-Improvement'],
    isbn: '9780735211292',
    description:
      'A framework for improving every day, built on the idea that small changes compound into remarkable results over time.',
  },
  {
    title: 'Deep Work',
    subtitle: 'Rules for Focused Success in a Distracted World',
    authors: ['Cal Newport'],
    pageCount: 304,
    publisher: 'Grand Central Publishing',
    publishedDate: '2016-01-05',
    genres: ['Productivity', 'Business'],
    isbn: '9781455586691',
    description:
      'An argument that the ability to concentrate without distraction is becoming both rarer and more valuable.',
  },
  {
    title: 'The Psychology of Money',
    subtitle: 'Timeless Lessons on Wealth, Greed, and Happiness',
    authors: ['Morgan Housel'],
    pageCount: 256,
    publisher: 'Harriman House',
    publishedDate: '2020-09-08',
    genres: ['Finance', 'Psychology', 'Economics'],
    isbn: '9780857197689',
    description:
      'Short stories exploring the strange ways people think about money, and how behaviour matters more than intelligence.',
  },
  {
    title: 'Thinking, Fast and Slow',
    authors: ['Daniel Kahneman'],
    pageCount: 499,
    publisher: 'Farrar, Straus and Giroux',
    publishedDate: '2011-10-25',
    genres: ['Psychology', 'Economics', 'Science'],
    isbn: '9780374275631',
    description:
      'A tour of the two systems that drive the way we think — fast and intuitive, slow and deliberate.',
  },
  {
    title: 'The Almanack of Naval Ravikant',
    subtitle: 'A Guide to Wealth and Happiness',
    authors: ['Eric Jorgenson'],
    pageCount: 242,
    publisher: 'Magrathea Publishing',
    publishedDate: '2020-09-19',
    genres: ['Business', 'Philosophy', 'Self-Improvement'],
    isbn: '9781544514215',
    description:
      'A curated collection of one investor’s thinking on building wealth and living well, drawn from years of public writing.',
  },
]

const SHELVES = ['Business', 'Psychology', 'Productivity', 'Favorites']

function daysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString()
}

export async function hasSeeded(userId: string): Promise<boolean> {
  const flag = await get<{ key: string; value: boolean }>('meta', `seeded:${userId}`)
  return Boolean(flag?.value)
}

async function markSeeded(userId: string): Promise<void> {
  await put('meta', { key: `seeded:${userId}`, value: true })
}

/** Writes a session row directly so demo streaks land on realistic dates. */
async function backdatedSession(
  userId: string,
  bookId: string,
  fromPage: number,
  toPage: number,
  readAt: string,
): Promise<void> {
  await put<ReadingSession>('reading_sessions', {
    id: uid('rds'),
    userId,
    bookId,
    fromPage,
    toPage,
    pagesRead: Math.max(0, toPage - fromPage),
    note: null,
    readAt,
    createdAt: readAt,
  })
}

async function backdateUserBook(
  userId: string,
  bookId: string,
  patch: Partial<UserBook>,
): Promise<void> {
  const userBook = await repo.getUserBook(userId, bookId)
  if (!userBook) return
  await put<UserBook>('user_books', { ...userBook, ...patch })
}

export async function seedDemoData(userId: string): Promise<void> {
  if (await hasSeeded(userId)) return

  const shelves = await Promise.all(SHELVES.map((name) => repo.createShelf(userId, name)))
  const shelfByName = new Map(shelves.map((s) => [s.name, s.id]))

  const [atomic, deepWork, money, thinking, almanack] = await Promise.all(
    BOOKS.map((b) =>
      repo.addBook(userId, {
        title: b.title,
        subtitle: b.subtitle ?? null,
        authors: b.authors,
        pageCount: b.pageCount,
        publisher: b.publisher,
        publishedDate: b.publishedDate,
        genres: b.genres,
        description: b.description,
        isbn: b.isbn,
        language: 'English',
      }),
    ),
  )

  await repo.setBookShelves(userId, atomic.book.id, [
    shelfByName.get('Productivity')!,
    shelfByName.get('Psychology')!,
    shelfByName.get('Favorites')!,
  ])
  await repo.setBookShelves(userId, deepWork.book.id, [shelfByName.get('Productivity')!])
  await repo.setBookShelves(userId, money.book.id, [
    shelfByName.get('Business')!,
    shelfByName.get('Psychology')!,
  ])
  await repo.setBookShelves(userId, thinking.book.id, [shelfByName.get('Psychology')!])
  await repo.setBookShelves(userId, almanack.book.id, [shelfByName.get('Business')!])

  // Atomic Habits — finished, rated, reviewed, with notes and quotes.
  await backdateUserBook(userId, atomic.book.id, {
    status: 'finished',
    currentPage: 320,
    rating: 5,
    isFavorite: true,
    dateAdded: daysAgo(64),
    dateStarted: daysAgo(48),
    dateFinished: daysAgo(21),
    lastOpenedAt: daysAgo(2),
  })
  await backdatedSession(userId, atomic.book.id, 0, 120, daysAgo(46))
  await backdatedSession(userId, atomic.book.id, 120, 240, daysAgo(33))
  await backdatedSession(userId, atomic.book.id, 240, 320, daysAgo(21))

  // Deep Work — in progress, with a live streak over the last few days.
  await backdateUserBook(userId, deepWork.book.id, {
    status: 'reading',
    currentPage: 186,
    dateAdded: daysAgo(30),
    dateStarted: daysAgo(12),
    lastOpenedAt: daysAgo(0),
  })
  await backdatedSession(userId, deepWork.book.id, 0, 54, daysAgo(4))
  await backdatedSession(userId, deepWork.book.id, 54, 98, daysAgo(3))
  await backdatedSession(userId, deepWork.book.id, 98, 141, daysAgo(2))
  await backdatedSession(userId, deepWork.book.id, 141, 165, daysAgo(1))
  await backdatedSession(userId, deepWork.book.id, 165, 186, daysAgo(0))

  // Psychology of Money — in progress, earlier in the book.
  await backdateUserBook(userId, money.book.id, {
    status: 'reading',
    currentPage: 74,
    dateAdded: daysAgo(18),
    dateStarted: daysAgo(9),
    lastOpenedAt: daysAgo(3),
  })
  await backdatedSession(userId, money.book.id, 0, 40, daysAgo(9))
  await backdatedSession(userId, money.book.id, 40, 74, daysAgo(3))

  // Thinking, Fast and Slow — set aside partway through.
  await backdateUserBook(userId, thinking.book.id, {
    status: 'dnf',
    currentPage: 212,
    rating: 3,
    dateAdded: daysAgo(150),
    dateStarted: daysAgo(140),
    dateFinished: daysAgo(96),
  })
  await backdatedSession(userId, thinking.book.id, 0, 212, daysAgo(110))

  // Almanack — queued up.
  await backdateUserBook(userId, almanack.book.id, { dateAdded: daysAgo(6) })

  await repo.upsertReview(userId, atomic.book.id, {
    rating: 5,
    title: 'The system beats the goal',
    body: 'The core claim — that you fall to the level of your systems rather than rise to the level of your goals — reframed how I plan. The four laws are simple enough to actually use, and the habit-stacking chapter alone earned the book its place on the shelf. It repeats itself in the back third, but the ideas hold up.',
    containsSpoilers: false,
    pros: ['Immediately actionable', 'Clear structure', 'Excellent examples'],
    cons: ['Repetitive in the final third'],
    favoriteQuote: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    recommended: true,
    visibility: 'private',
  })

  await repo.upsertLearning(userId, atomic.book.id, {
    biggestLessons:
      'Habits are the compound interest of self-improvement. A 1% daily change is invisible day to day and enormous over a year.',
    ideasWorthRemembering:
      'Make it obvious, make it attractive, make it easy, make it satisfying. Environment design beats willpower.',
    disagreements:
      'The book under-weights how much circumstance and constraint shape behaviour. Not everyone can redesign their environment.',
    changedThinking:
      'I stopped setting outcome goals and started designing the smallest repeatable version of the behaviour instead.',
    howToApply:
      'Stack a 10-minute reading block onto my existing morning coffee routine, and keep the current book physically on the desk.',
    favoriteIdeas: 'Identity-based habits: decide who you want to be, then let each action cast a vote for that identity.',
    oneSentenceSummary:
      'Small habits, repeated consistently and supported by a well-designed environment, compound into a different person.',
    scoreUsefulness: 5,
    scoreWriting: 4,
    scoreOriginality: 3,
    scoreApplicability: 5,
  })

  await repo.createNote(userId, {
    bookId: atomic.book.id,
    kind: 'lesson',
    title: 'The four laws of behaviour change',
    chapter: 'Chapter 3',
    tags: ['habits', 'actionable'],
    body: `To build a good habit:

1. Make it obvious — cue design
2. Make it attractive — temptation bundling
3. Make it easy — reduce friction
4. Make it satisfying — immediate reward

Invert each one to break a bad habit. The asymmetry is the interesting part: breaking a habit is mostly about adding friction, not adding willpower.`,
  })

  await repo.createNote(userId, {
    bookId: deepWork.book.id,
    kind: 'chapter',
    title: 'Attention residue',
    chapter: 'Chapter 2',
    tags: ['focus', 'research'],
    body: `Switching tasks leaves a residue of attention on the previous task, so the next block starts degraded.

Implication for me: batching shallow work into one afternoon window is not a preference, it is the whole mechanism. Check email twice a day, not continuously.`,
  })

  await repo.createNote(userId, {
    kind: 'research',
    title: 'Reading system for this year',
    tags: ['meta', 'planning'],
    body: `What I want out of reading in 2026:

- Two books a month, one of which is outside my field
- A written summary within a week of finishing, or it did not count
- Quotes captured as I read, not reconstructed afterwards

The failure mode last year was finishing books and never revisiting them.`,
  })

  await repo.createQuote(userId, {
    bookId: atomic.book.id,
    text: 'You do not rise to the level of your goals. You fall to the level of your systems.',
    page: 27,
    chapter: 'Chapter 1',
    comment: 'The sentence the whole book hangs on.',
    tags: ['habits', 'important'],
  })
  await repo.createQuote(userId, {
    bookId: atomic.book.id,
    text: 'Every action you take is a vote for the type of person you wish to become.',
    page: 38,
    chapter: 'Chapter 2',
    tags: ['identity'],
  })
  await repo.createQuote(userId, {
    bookId: deepWork.book.id,
    text: 'Clarity about what matters provides clarity about what does not.',
    page: 63,
    tags: ['focus', 'actionable'],
  })
  await repo.createQuote(userId, {
    bookId: money.book.id,
    text: 'Doing well with money has a little to do with how smart you are and a lot to do with how you behave.',
    page: 12,
    comment: 'Same shape of argument as the habits literature — behaviour over intelligence.',
    tags: ['finance', 'psychology'],
  })

  await repo.setGoal(userId, 'year', 'books', 40)

  await markSeeded(userId)
}

export async function seedFirstShelves(userId: string): Promise<void> {
  const existing = await repo.listShelves(userId)
  if (existing.length) return
  await repo.createShelf(userId, 'Favorites')
}
