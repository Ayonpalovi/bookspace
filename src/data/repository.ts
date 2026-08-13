/**
 * The repository is the single boundary between the UI and storage.
 *
 * Every function takes an explicit `userId` and filters by it, which is the
 * same contract the Postgres RLS policies enforce server-side. When the
 * Supabase adapter lands, only this file's implementation changes — no page or
 * component imports IndexedDB directly.
 */

import {
  clearAll,
  get,
  getAll,
  getAllByIndex,
  getByIndex,
  put,
  putMany,
  remove,
  removeWhere,
} from './db'
import type {
  Activity,
  ActivityKind,
  Book,
  GoalMetric,
  GoalPeriod,
  Learning,
  LibraryEntry,
  Note,
  NoteKind,
  Profile,
  Quote,
  ReadingGoal,
  ReadingSession,
  ReadingStats,
  ReadingStatus,
  Review,
  Shelf,
  ShelfBook,
  Tab,
  UserBook,
} from '@/types'
import { daysBetween, nowIso, progressPercent, slugify, startOfDay, uid } from '@/lib/utils'

/* ------------------------------------------------------------------ profile */

export async function getProfile(userId: string): Promise<Profile | null> {
  return (await get<Profile>('profiles', userId)) ?? null
}

export async function updateProfile(
  userId: string,
  patch: Partial<Omit<Profile, 'id' | 'email' | 'createdAt'>>,
): Promise<Profile> {
  const profile = await get<Profile>('profiles', userId)
  if (!profile) throw new Error('Profile not found')
  const next = { ...profile, ...patch, id: profile.id }
  await put<Profile>('profiles', next)
  return next
}

/* -------------------------------------------------------------------- books */

/** Books this user can see: their own records, plus shared catalogue rows. */
async function visibleBooks(userId: string): Promise<Book[]> {
  const all = await getAll<Book>('books')
  return all.filter((b) => b.ownerId === userId || b.ownerId === null)
}

export async function getBook(userId: string, bookId: string): Promise<Book | null> {
  const book = await get<Book>('books', bookId)
  if (!book) return null
  if (book.ownerId !== null && book.ownerId !== userId) return null
  return book
}

export async function getUserBook(
  userId: string,
  bookId: string,
): Promise<UserBook | null> {
  return (
    (await getByIndex<UserBook>('user_books', 'by_user_book', [userId, bookId])) ?? null
  )
}

export async function getLibraryEntry(
  userId: string,
  bookId: string,
): Promise<LibraryEntry | null> {
  const [book, userBook] = await Promise.all([
    getBook(userId, bookId),
    getUserBook(userId, bookId),
  ])
  if (!book || !userBook) return null
  const shelfLinks = await getAllByIndex<ShelfBook>('shelf_books', 'by_book', bookId)
  return {
    book,
    userBook,
    percent: progressPercent(userBook.currentPage, book.pageCount),
    shelfIds: shelfLinks.filter((l) => l.userId === userId).map((l) => l.shelfId),
  }
}

export async function listLibrary(userId: string): Promise<LibraryEntry[]> {
  const [userBooks, books, shelfLinks] = await Promise.all([
    getAllByIndex<UserBook>('user_books', 'by_user', userId),
    visibleBooks(userId),
    getAllByIndex<ShelfBook>('shelf_books', 'by_user', userId),
  ])
  const bookById = new Map(books.map((b) => [b.id, b]))
  const shelvesByBook = new Map<string, string[]>()
  for (const link of shelfLinks) {
    const list = shelvesByBook.get(link.bookId) ?? []
    list.push(link.shelfId)
    shelvesByBook.set(link.bookId, list)
  }
  return userBooks
    .map((userBook) => {
      const book = bookById.get(userBook.bookId)
      if (!book) return null
      return {
        userBook,
        book,
        percent: progressPercent(userBook.currentPage, book.pageCount),
        shelfIds: shelvesByBook.get(book.id) ?? [],
      } satisfies LibraryEntry
    })
    .filter((entry): entry is LibraryEntry => entry !== null)
}

export interface BookDraft {
  title: string
  subtitle?: string | null
  authors: string[]
  coverUrl?: string | null
  description?: string | null
  isbn?: string | null
  publisher?: string | null
  publishedDate?: string | null
  pageCount?: number | null
  language?: string | null
  genres?: string[]
  /** Set when the book came from an external catalogue search (e.g. Open Library). */
  externalSource?: string | null
  externalId?: string | null
}

/**
 * Looks for a book this user already owns from the same catalogue entry, so
 * adding a search result twice updates the existing row instead of creating a
 * duplicate.
 */
export async function findBookByExternalId(
  userId: string,
  externalSource: string,
  externalId: string,
): Promise<Book | null> {
  const books = await visibleBooks(userId)
  return (
    books.find(
      (b) => b.externalSource === externalSource && b.externalId === externalId,
    ) ?? null
  )
}

export async function addBook(
  userId: string,
  draft: BookDraft,
  options: { status?: ReadingStatus; shelfIds?: string[] } = {},
): Promise<LibraryEntry> {
  const timestamp = nowIso()
  const book: Book = {
    id: uid('bok'),
    ownerId: userId,
    title: draft.title.trim(),
    subtitle: draft.subtitle?.trim() || null,
    authors: draft.authors.map((a) => a.trim()).filter(Boolean),
    coverUrl: draft.coverUrl?.trim() || null,
    description: draft.description?.trim() || null,
    isbn: draft.isbn?.trim() || null,
    publisher: draft.publisher?.trim() || null,
    publishedDate: draft.publishedDate || null,
    pageCount: draft.pageCount ?? null,
    language: draft.language?.trim() || null,
    genres: draft.genres ?? [],
    averageRating: null,
    externalSource: draft.externalSource ?? null,
    externalId: draft.externalId ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  const status = options.status ?? 'want_to_read'
  const userBook: UserBook = {
    id: uid('ubk'),
    userId,
    bookId: book.id,
    status,
    rating: null,
    currentPage: 0,
    isFavorite: false,
    tags: [],
    dateAdded: timestamp,
    dateStarted: status === 'reading' || status === 'finished' ? timestamp : null,
    dateFinished: status === 'finished' ? timestamp : null,
    lastOpenedAt: null,
    updatedAt: timestamp,
  }

  await put<Book>('books', book)
  await put<UserBook>('user_books', userBook)
  if (options.shelfIds?.length) {
    await putMany<ShelfBook>(
      'shelf_books',
      options.shelfIds.map((shelfId) => ({
        shelfId,
        bookId: book.id,
        userId,
        addedAt: timestamp,
      })),
    )
  }
  await logActivity(userId, 'book_added', `Added ${book.title}`, { bookId: book.id })

  return {
    book,
    userBook,
    percent: 0,
    shelfIds: options.shelfIds ?? [],
  }
}

export async function updateBook(
  userId: string,
  bookId: string,
  patch: Partial<BookDraft>,
): Promise<Book> {
  const book = await getBook(userId, bookId)
  if (!book) throw new Error('Book not found')
  if (book.ownerId !== userId) throw new Error('You can only edit books you added.')
  const next: Book = { ...book, ...patch, updatedAt: nowIso() } as Book
  await put<Book>('books', next)
  return next
}

/** Removes the book from this user's library along with everything attached. */
export async function removeBookFromLibrary(
  userId: string,
  bookId: string,
): Promise<void> {
  const userBook = await getUserBook(userId, bookId)
  if (userBook) await remove('user_books', userBook.id)

  await removeWhere<ShelfBook>(
    'shelf_books',
    (l) => l.userId === userId && l.bookId === bookId,
    (l) => [l.shelfId, l.bookId],
  )
  const scoped = <T extends { userId: string; bookId: string | null; id: string }>(
    r: T,
  ) => r.userId === userId && r.bookId === bookId
  await removeWhere<Note>('notes', scoped, (r) => r.id)
  await removeWhere<Quote>('quotes', scoped, (r) => r.id)
  await removeWhere<Review>('reviews', (r) => r.userId === userId && r.bookId === bookId, (r) => r.id)
  await removeWhere<Learning>('learnings', (r) => r.userId === userId && r.bookId === bookId, (r) => r.id)
  await removeWhere<ReadingSession>(
    'reading_sessions',
    (r) => r.userId === userId && r.bookId === bookId,
    (r) => r.id,
  )
  await removeWhere<Activity>(
    'activities',
    (a) => a.userId === userId && a.bookId === bookId,
    (a) => a.id,
  )

  const book = await get<Book>('books', bookId)
  if (book?.ownerId === userId) await remove('books', bookId)
}

/* ------------------------------------------------------- status & progress */

export async function setStatus(
  userId: string,
  bookId: string,
  status: ReadingStatus,
): Promise<UserBook> {
  const userBook = await getUserBook(userId, bookId)
  if (!userBook) throw new Error('Book is not in your library')
  const book = await getBook(userId, bookId)
  const timestamp = nowIso()

  const next: UserBook = { ...userBook, status, updatedAt: timestamp }
  if (status === 'reading' && !next.dateStarted) next.dateStarted = timestamp
  if (status === 'finished') {
    next.dateFinished = timestamp
    if (!next.dateStarted) next.dateStarted = timestamp
    if (book?.pageCount) next.currentPage = book.pageCount
  }
  if (status === 'want_to_read') {
    next.dateStarted = null
    next.dateFinished = null
    next.currentPage = 0
  }
  if (status === 'dnf') next.dateFinished = timestamp

  await put<UserBook>('user_books', next)

  const title = book?.title ?? 'a book'
  const kind: ActivityKind =
    status === 'reading'
      ? 'book_started'
      : status === 'finished'
        ? 'book_finished'
        : status === 'dnf'
          ? 'book_dnf'
          : 'book_added'
  const summary =
    status === 'reading'
      ? `Started reading ${title}`
      : status === 'finished'
        ? `Finished ${title}`
        : status === 'dnf'
          ? `Marked ${title} as did not finish`
          : `Moved ${title} to Want to Read`
  await logActivity(userId, kind, summary, { bookId })

  return next
}

/**
 * Records a progress update. The delta is written to reading_sessions, which is
 * what streaks and pages-read statistics are derived from.
 */
export async function updateProgress(
  userId: string,
  bookId: string,
  toPage: number,
  note?: string,
): Promise<UserBook> {
  const [userBook, book] = await Promise.all([
    getUserBook(userId, bookId),
    getBook(userId, bookId),
  ])
  if (!userBook || !book) throw new Error('Book is not in your library')

  const max = book.pageCount ?? Number.MAX_SAFE_INTEGER
  const target = Math.max(0, Math.min(Math.round(toPage), max))
  const fromPage = userBook.currentPage
  const timestamp = nowIso()

  const next: UserBook = {
    ...userBook,
    currentPage: target,
    updatedAt: timestamp,
    lastOpenedAt: timestamp,
  }
  if (target > 0 && next.status === 'want_to_read') {
    next.status = 'reading'
    next.dateStarted = next.dateStarted ?? timestamp
  }
  if (book.pageCount && target >= book.pageCount && next.status === 'reading') {
    next.status = 'finished'
    next.dateFinished = timestamp
  }

  await put<UserBook>('user_books', next)

  if (target !== fromPage) {
    await put<ReadingSession>('reading_sessions', {
      id: uid('rds'),
      userId,
      bookId,
      fromPage,
      toPage: target,
      pagesRead: Math.max(0, target - fromPage),
      note: note?.trim() || null,
      readAt: timestamp,
      createdAt: timestamp,
    })
  }

  if (next.status === 'finished' && userBook.status !== 'finished') {
    await logActivity(userId, 'book_finished', `Finished ${book.title}`, { bookId })
  } else if (target > fromPage) {
    await logActivity(
      userId,
      'progress_updated',
      `Read to page ${target} of ${book.title}`,
      { bookId },
    )
  }

  return next
}

export async function setRating(
  userId: string,
  bookId: string,
  rating: number | null,
): Promise<UserBook> {
  const userBook = await getUserBook(userId, bookId)
  if (!userBook) throw new Error('Book is not in your library')
  const next = { ...userBook, rating, updatedAt: nowIso() }
  await put<UserBook>('user_books', next)
  return next
}

export async function toggleFavorite(userId: string, bookId: string): Promise<UserBook> {
  const userBook = await getUserBook(userId, bookId)
  if (!userBook) throw new Error('Book is not in your library')
  const next = { ...userBook, isFavorite: !userBook.isFavorite, updatedAt: nowIso() }
  await put<UserBook>('user_books', next)
  return next
}

export async function touchBook(userId: string, bookId: string): Promise<void> {
  const userBook = await getUserBook(userId, bookId)
  if (!userBook) return
  await put<UserBook>('user_books', { ...userBook, lastOpenedAt: nowIso() })
}

export async function listSessions(
  userId: string,
  bookId?: string,
): Promise<ReadingSession[]> {
  const all = await getAllByIndex<ReadingSession>('reading_sessions', 'by_user', userId)
  const scoped = bookId ? all.filter((s) => s.bookId === bookId) : all
  return scoped.sort((a, b) => b.readAt.localeCompare(a.readAt))
}

/* ------------------------------------------------------------------ shelves */

export async function listShelves(userId: string): Promise<Shelf[]> {
  const shelves = await getAllByIndex<Shelf>('shelves', 'by_user', userId)
  return shelves.sort((a, b) => a.name.localeCompare(b.name))
}

export async function createShelf(
  userId: string,
  name: string,
  color?: string | null,
): Promise<Shelf> {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Give the shelf a name.')
  const existing = await listShelves(userId)
  if (existing.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
    throw new Error('You already have a shelf with that name.')
  }
  const shelf: Shelf = {
    id: uid('shf'),
    userId,
    name: trimmed,
    slug: slugify(trimmed),
    description: null,
    color: color ?? null,
    isSystem: false,
    createdAt: nowIso(),
  }
  await put<Shelf>('shelves', shelf)
  await logActivity(userId, 'shelf_created', `Created the shelf ${trimmed}`)
  return shelf
}

export async function renameShelf(
  userId: string,
  shelfId: string,
  name: string,
): Promise<Shelf> {
  const shelf = await get<Shelf>('shelves', shelfId)
  if (!shelf || shelf.userId !== userId) throw new Error('Shelf not found')
  const next = { ...shelf, name: name.trim(), slug: slugify(name) }
  await put<Shelf>('shelves', next)
  return next
}

export async function deleteShelf(userId: string, shelfId: string): Promise<void> {
  const shelf = await get<Shelf>('shelves', shelfId)
  if (!shelf || shelf.userId !== userId) throw new Error('Shelf not found')
  await removeWhere<ShelfBook>(
    'shelf_books',
    (l) => l.shelfId === shelfId && l.userId === userId,
    (l) => [l.shelfId, l.bookId],
  )
  await remove('shelves', shelfId)
}

export async function setBookShelves(
  userId: string,
  bookId: string,
  shelfIds: string[],
): Promise<void> {
  await removeWhere<ShelfBook>(
    'shelf_books',
    (l) => l.userId === userId && l.bookId === bookId,
    (l) => [l.shelfId, l.bookId],
  )
  await putMany<ShelfBook>(
    'shelf_books',
    shelfIds.map((shelfId) => ({ shelfId, bookId, userId, addedAt: nowIso() })),
  )
}

export async function listShelfLinks(userId: string): Promise<ShelfBook[]> {
  return getAllByIndex<ShelfBook>('shelf_books', 'by_user', userId)
}

/* -------------------------------------------------------------------- notes */

export async function listNotes(userId: string, bookId?: string): Promise<Note[]> {
  const notes = await getAllByIndex<Note>('notes', 'by_user', userId)
  const scoped = bookId ? notes.filter((n) => n.bookId === bookId) : notes
  return scoped.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    return b.updatedAt.localeCompare(a.updatedAt)
  })
}

export async function getNote(userId: string, noteId: string): Promise<Note | null> {
  const note = await get<Note>('notes', noteId)
  if (!note || note.userId !== userId) return null
  return note
}

export async function createNote(
  userId: string,
  draft: Partial<Pick<Note, 'title' | 'body' | 'bookId' | 'kind' | 'chapter' | 'tags'>> = {},
): Promise<Note> {
  const timestamp = nowIso()
  const note: Note = {
    id: uid('not'),
    userId,
    bookId: draft.bookId ?? null,
    kind: (draft.kind as NoteKind) ?? (draft.bookId ? 'book' : 'quick'),
    title: draft.title ?? 'Untitled note',
    body: draft.body ?? '',
    chapter: draft.chapter ?? null,
    tags: draft.tags ?? [],
    isPinned: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await put<Note>('notes', note)
  await logActivity(userId, 'note_created', `Created the note “${note.title}”`, {
    bookId: note.bookId,
    noteId: note.id,
  })
  return note
}

export async function updateNote(
  userId: string,
  noteId: string,
  patch: Partial<Omit<Note, 'id' | 'userId' | 'createdAt'>>,
): Promise<Note> {
  const note = await getNote(userId, noteId)
  if (!note) throw new Error('Note not found')
  const next: Note = { ...note, ...patch, updatedAt: nowIso() }
  await put<Note>('notes', next)
  return next
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const note = await getNote(userId, noteId)
  if (!note) throw new Error('Note not found')
  await remove('notes', noteId)
  await removeWhere<Activity>(
    'activities',
    (a) => a.userId === userId && a.noteId === noteId,
    (a) => a.id,
  )
}

/* ------------------------------------------------------------------- quotes */

export async function listQuotes(userId: string, bookId?: string): Promise<Quote[]> {
  const quotes = await getAllByIndex<Quote>('quotes', 'by_user', userId)
  const scoped = bookId ? quotes.filter((q) => q.bookId === bookId) : quotes
  return scoped.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function createQuote(
  userId: string,
  draft: Pick<Quote, 'text'> &
    Partial<Pick<Quote, 'bookId' | 'page' | 'chapter' | 'comment' | 'tags'>>,
): Promise<Quote> {
  if (!draft.text.trim()) throw new Error('A quote needs some text.')
  const timestamp = nowIso()
  const quote: Quote = {
    id: uid('quo'),
    userId,
    bookId: draft.bookId ?? null,
    text: draft.text.trim(),
    page: draft.page ?? null,
    chapter: draft.chapter ?? null,
    comment: draft.comment ?? null,
    tags: draft.tags ?? [],
    isFavorite: false,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
  await put<Quote>('quotes', quote)
  await logActivity(userId, 'quote_saved', 'Saved a new quote', {
    bookId: quote.bookId,
    quoteId: quote.id,
  })
  return quote
}

export async function updateQuote(
  userId: string,
  quoteId: string,
  patch: Partial<Omit<Quote, 'id' | 'userId' | 'createdAt'>>,
): Promise<Quote> {
  const quote = await get<Quote>('quotes', quoteId)
  if (!quote || quote.userId !== userId) throw new Error('Quote not found')
  const next: Quote = { ...quote, ...patch, updatedAt: nowIso() }
  await put<Quote>('quotes', next)
  return next
}

export async function deleteQuote(userId: string, quoteId: string): Promise<void> {
  const quote = await get<Quote>('quotes', quoteId)
  if (!quote || quote.userId !== userId) throw new Error('Quote not found')
  await remove('quotes', quoteId)
}

/* ------------------------------------------------------------------ reviews */

export async function getReview(userId: string, bookId: string): Promise<Review | null> {
  return (await getByIndex<Review>('reviews', 'by_user_book', [userId, bookId])) ?? null
}

export async function listReviews(userId: string): Promise<Review[]> {
  const reviews = await getAllByIndex<Review>('reviews', 'by_user', userId)
  return reviews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export async function upsertReview(
  userId: string,
  bookId: string,
  draft: Partial<Omit<Review, 'id' | 'userId' | 'bookId' | 'createdAt' | 'updatedAt'>>,
): Promise<Review> {
  const existing = await getReview(userId, bookId)
  const timestamp = nowIso()
  const review: Review = {
    id: existing?.id ?? uid('rev'),
    userId,
    bookId,
    rating: draft.rating ?? existing?.rating ?? 0,
    title: draft.title ?? existing?.title ?? null,
    body: draft.body ?? existing?.body ?? '',
    containsSpoilers: draft.containsSpoilers ?? existing?.containsSpoilers ?? false,
    pros: draft.pros ?? existing?.pros ?? [],
    cons: draft.cons ?? existing?.cons ?? [],
    favoriteQuote: draft.favoriteQuote ?? existing?.favoriteQuote ?? null,
    recommended: draft.recommended ?? existing?.recommended ?? null,
    visibility: draft.visibility ?? existing?.visibility ?? 'private',
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
  await put<Review>('reviews', review)
  if (!existing) {
    const book = await getBook(userId, bookId)
    await logActivity(userId, 'review_written', `Reviewed ${book?.title ?? 'a book'}`, {
      bookId,
    })
  }
  return review
}

export async function deleteReview(userId: string, bookId: string): Promise<void> {
  const review = await getReview(userId, bookId)
  if (review) await remove('reviews', review.id)
}

/* ---------------------------------------------------------------- learnings */

export async function getLearning(
  userId: string,
  bookId: string,
): Promise<Learning | null> {
  return (
    (await getByIndex<Learning>('learnings', 'by_user_book', [userId, bookId])) ?? null
  )
}

export async function upsertLearning(
  userId: string,
  bookId: string,
  patch: Partial<Omit<Learning, 'id' | 'userId' | 'bookId' | 'createdAt' | 'updatedAt'>>,
): Promise<Learning> {
  const existing = await getLearning(userId, bookId)
  const timestamp = nowIso()
  const learning: Learning = {
    id: existing?.id ?? uid('lrn'),
    userId,
    bookId,
    biggestLessons: '',
    ideasWorthRemembering: '',
    disagreements: '',
    changedThinking: '',
    howToApply: '',
    favoriteIdeas: '',
    oneSentenceSummary: '',
    scoreUsefulness: null,
    scoreWriting: null,
    scoreOriginality: null,
    scoreApplicability: null,
    ...existing,
    ...patch,
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
  await put<Learning>('learnings', learning)
  return learning
}

/* -------------------------------------------------------------------- goals */

export function currentPeriodKey(period: GoalPeriod, date = new Date()): string {
  return period === 'year'
    ? String(date.getFullYear())
    : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export async function listGoals(userId: string): Promise<ReadingGoal[]> {
  return getAllByIndex<ReadingGoal>('reading_goals', 'by_user', userId)
}

export async function getGoal(
  userId: string,
  period: GoalPeriod,
  metric: GoalMetric,
  periodKey = currentPeriodKey(period),
): Promise<ReadingGoal | null> {
  const goals = await listGoals(userId)
  return (
    goals.find(
      (g) => g.period === period && g.metric === metric && g.periodKey === periodKey,
    ) ?? null
  )
}

export async function setGoal(
  userId: string,
  period: GoalPeriod,
  metric: GoalMetric,
  target: number,
  periodKey = currentPeriodKey(period),
): Promise<ReadingGoal> {
  const existing = await getGoal(userId, period, metric, periodKey)
  const timestamp = nowIso()
  const goal: ReadingGoal = {
    id: existing?.id ?? uid('gol'),
    userId,
    period,
    metric,
    periodKey,
    target: Math.max(0, Math.round(target)),
    createdAt: existing?.createdAt ?? timestamp,
    updatedAt: timestamp,
  }
  await put<ReadingGoal>('reading_goals', goal)
  if (!existing) {
    await logActivity(
      userId,
      'goal_set',
      `Set a ${periodKey} goal of ${goal.target} ${metric}`,
    )
  }
  return goal
}

export async function deleteGoal(userId: string, goalId: string): Promise<void> {
  const goal = await get<ReadingGoal>('reading_goals', goalId)
  if (!goal || goal.userId !== userId) return
  await remove('reading_goals', goalId)
}

/* ---------------------------------------------------------------- activity */

export async function logActivity(
  userId: string,
  kind: ActivityKind,
  summary: string,
  refs: { bookId?: string | null; noteId?: string | null; quoteId?: string | null } = {},
): Promise<void> {
  await put<Activity>('activities', {
    id: uid('act'),
    userId,
    kind,
    bookId: refs.bookId ?? null,
    noteId: refs.noteId ?? null,
    quoteId: refs.quoteId ?? null,
    summary,
    createdAt: nowIso(),
  })
}

export async function listActivity(userId: string, limit = 100): Promise<Activity[]> {
  const activities = await getAllByIndex<Activity>('activities', 'by_user', userId)
  return activities
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
}

/* --------------------------------------------------------------------- tabs */

export async function listTabs(userId: string): Promise<Tab[]> {
  const tabs = await getAllByIndex<Tab>('tabs', 'by_user', userId)
  return tabs.sort((a, b) => a.position - b.position)
}

export async function saveTabs(userId: string, tabs: Tab[]): Promise<void> {
  await removeWhere<Tab>('tabs', (t) => t.userId === userId, (t) => t.id)
  await putMany<Tab>('tabs', tabs)
}

/* -------------------------------------------------------------- statistics */

/** Consecutive days (ending today or yesterday) with at least one session. */
function computeStreak(sessions: ReadingSession[]): {
  current: number
  longest: number
} {
  if (!sessions.length) return { current: 0, longest: 0 }
  const days = Array.from(
    new Set(sessions.map((s) => startOfDay(s.readAt).getTime())),
  ).sort((a, b) => b - a)

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

  const gapFromToday = daysBetween(new Date(), days[0])
  let current = 0
  if (gapFromToday <= 1) {
    current = 1
    for (let i = 1; i < days.length; i++) {
      if (daysBetween(days[i - 1], days[i]) === 1) current += 1
      else break
    }
  }
  return { current, longest: Math.max(longest, current) }
}

export async function getStats(userId: string): Promise<ReadingStats> {
  const [entries, sessions] = await Promise.all([
    listLibrary(userId),
    listSessions(userId),
  ])
  const year = new Date().getFullYear()

  const finished = entries.filter((e) => e.userBook.status === 'finished')
  const finishedThisYear = finished.filter(
    (e) => e.userBook.dateFinished && new Date(e.userBook.dateFinished).getFullYear() === year,
  )
  const rated = entries.filter((e) => e.userBook.rating != null)
  const withPages = finished.filter((e) => e.book.pageCount)

  const pagesThisYear = sessions
    .filter((s) => new Date(s.readAt).getFullYear() === year)
    .reduce((sum, s) => sum + s.pagesRead, 0)
  const pagesAllTime = sessions.reduce((sum, s) => sum + s.pagesRead, 0)

  const started = entries.filter((e) => e.userBook.dateStarted).length
  const dnf = entries.filter((e) => e.userBook.status === 'dnf').length
  const { current, longest } = computeStreak(sessions)

  return {
    booksFinishedThisYear: finishedThisYear.length,
    booksFinishedAllTime: finished.length,
    pagesReadThisYear: pagesThisYear,
    pagesReadAllTime: pagesAllTime,
    currentStreak: current,
    longestStreak: longest,
    averageRating: rated.length
      ? rated.reduce((sum, e) => sum + (e.userBook.rating ?? 0), 0) / rated.length
      : null,
    currentlyReading: entries.filter((e) => e.userBook.status === 'reading').length,
    wantToRead: entries.filter((e) => e.userBook.status === 'want_to_read').length,
    dnfCount: dnf,
    averageBookLength: withPages.length
      ? Math.round(
          withPages.reduce((sum, e) => sum + (e.book.pageCount ?? 0), 0) /
            withPages.length,
        )
      : null,
    completionRate: started ? finished.length / started : null,
    dnfRate: started ? dnf / started : null,
  }
}

export interface MonthlyPoint {
  month: string
  label: string
  books: number
  pages: number
}

export async function getMonthlyBreakdown(
  userId: string,
  year = new Date().getFullYear(),
): Promise<MonthlyPoint[]> {
  const [entries, sessions] = await Promise.all([
    listLibrary(userId),
    listSessions(userId),
  ])
  const points: MonthlyPoint[] = Array.from({ length: 12 }, (_, i) => ({
    month: `${year}-${String(i + 1).padStart(2, '0')}`,
    label: new Date(year, i, 1).toLocaleDateString(undefined, { month: 'short' }),
    books: 0,
    pages: 0,
  }))

  for (const entry of entries) {
    const finishedAt = entry.userBook.dateFinished
    if (!finishedAt || entry.userBook.status !== 'finished') continue
    const date = new Date(finishedAt)
    if (date.getFullYear() !== year) continue
    points[date.getMonth()].books += 1
  }
  for (const session of sessions) {
    const date = new Date(session.readAt)
    if (date.getFullYear() !== year) continue
    points[date.getMonth()].pages += session.pagesRead
  }
  return points
}

export interface Tally {
  name: string
  count: number
}

export async function getTopAuthors(userId: string, limit = 5): Promise<Tally[]> {
  const entries = await listLibrary(userId)
  const counts = new Map<string, number>()
  for (const entry of entries) {
    if (entry.userBook.status !== 'finished') continue
    for (const author of entry.book.authors) {
      counts.set(author, (counts.get(author) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export async function getTopGenres(userId: string, limit = 6): Promise<Tally[]> {
  const entries = await listLibrary(userId)
  const counts = new Map<string, number>()
  for (const entry of entries) {
    for (const genre of entry.book.genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

/* -------------------------------------------------------------------- search */

export interface SearchHit {
  id: string
  type: 'book' | 'note' | 'quote'
  title: string
  subtitle: string | null
  path: string
}

export async function search(userId: string, query: string): Promise<SearchHit[]> {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const [entries, notes, quotes] = await Promise.all([
    listLibrary(userId),
    listNotes(userId),
    listQuotes(userId),
  ])
  const hits: SearchHit[] = []

  for (const entry of entries) {
    const haystack = [
      entry.book.title,
      entry.book.subtitle ?? '',
      entry.book.authors.join(' '),
      entry.book.genres.join(' '),
    ]
      .join(' ')
      .toLowerCase()
    if (haystack.includes(q)) {
      hits.push({
        id: entry.book.id,
        type: 'book',
        title: entry.book.title,
        subtitle: entry.book.authors.join(', ') || null,
        path: `/books/${entry.book.id}`,
      })
    }
  }
  for (const note of notes) {
    if (`${note.title} ${note.body} ${note.tags.join(' ')}`.toLowerCase().includes(q)) {
      hits.push({
        id: note.id,
        type: 'note',
        title: note.title,
        subtitle: note.body.slice(0, 80) || null,
        path: `/notes/${note.id}`,
      })
    }
  }
  for (const quote of quotes) {
    if (`${quote.text} ${quote.tags.join(' ')}`.toLowerCase().includes(q)) {
      hits.push({
        id: quote.id,
        type: 'quote',
        title: quote.text.slice(0, 70),
        subtitle: quote.page ? `Page ${quote.page}` : null,
        path: '/quotes',
      })
    }
  }
  return hits.slice(0, 30)
}

/* --------------------------------------------------------------- danger zone */

export async function resetEverything(): Promise<void> {
  await clearAll()
}
