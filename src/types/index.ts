/**
 * BookSpace domain model.
 *
 * These types mirror the PostgreSQL schema in supabase/migrations 1:1 so the
 * local IndexedDB adapter and a future Supabase adapter can satisfy the same
 * repository interface without any UI changes.
 */

export type ReadingStatus = 'want_to_read' | 'reading' | 'finished' | 'dnf'

export const READING_STATUSES: ReadingStatus[] = [
  'want_to_read',
  'reading',
  'finished',
  'dnf',
]

export const STATUS_LABEL: Record<ReadingStatus, string> = {
  want_to_read: 'Want to Read',
  reading: 'Currently Reading',
  finished: 'Finished',
  dnf: 'Did Not Finish',
}

export const STATUS_SHORT_LABEL: Record<ReadingStatus, string> = {
  want_to_read: 'Want to Read',
  reading: 'Reading',
  finished: 'Finished',
  dnf: 'DNF',
}

export type Visibility = 'private' | 'team' | 'public'

export type NoteKind =
  | 'quick'
  | 'book'
  | 'chapter'
  | 'lesson'
  | 'research'
  | 'reflection'

export const NOTE_KIND_LABEL: Record<NoteKind, string> = {
  quick: 'Quick note',
  book: 'Book note',
  chapter: 'Chapter note',
  lesson: 'Lesson',
  research: 'Research',
  reflection: 'Reflection',
}

export type ActivityKind =
  | 'book_added'
  | 'book_started'
  | 'book_finished'
  | 'book_dnf'
  | 'progress_updated'
  | 'note_created'
  | 'quote_saved'
  | 'review_written'
  | 'shelf_created'
  | 'goal_set'
  | 'space_created'
  | 'space_edited'
  | 'file_uploaded'

export interface Profile {
  id: string
  username: string
  displayName: string
  email: string
  bio: string | null
  avatarUrl: string | null
  createdAt: string
  onboardedAt: string | null
  favoriteGenres: string[]
  profileVisibility: Visibility
  reviewVisibility: Visibility
  showReadingActivity: boolean
}

/**
 * A book record. `ownerId` is null for catalogue books shared across users;
 * Phase 1 creates every book as user-owned, but the shape leaves room for a
 * public catalogue fed by an external API later.
 */
export interface Book {
  id: string
  ownerId: string | null
  title: string
  subtitle: string | null
  authors: string[]
  coverUrl: string | null
  description: string | null
  isbn: string | null
  publisher: string | null
  publishedDate: string | null
  pageCount: number | null
  language: string | null
  genres: string[]
  averageRating: number | null
  externalSource: string | null
  externalId: string | null
  createdAt: string
  updatedAt: string
}

/** The user's relationship to a book: status, progress, rating, dates. */
export interface UserBook {
  id: string
  userId: string
  bookId: string
  status: ReadingStatus
  rating: number | null
  currentPage: number
  isFavorite: boolean
  tags: string[]
  dateAdded: string
  dateStarted: string | null
  dateFinished: string | null
  lastOpenedAt: string | null
  updatedAt: string
}

export interface Shelf {
  id: string
  userId: string
  name: string
  slug: string
  description: string | null
  color: string | null
  isSystem: boolean
  createdAt: string
}

export interface ShelfBook {
  shelfId: string
  bookId: string
  userId: string
  addedAt: string
}

/** One progress entry. The log is what powers streaks and pages-read stats. */
export interface ReadingSession {
  id: string
  userId: string
  bookId: string
  fromPage: number
  toPage: number
  pagesRead: number
  note: string | null
  readAt: string
  createdAt: string
}

export type GoalPeriod = 'year' | 'month'
export type GoalMetric = 'books' | 'pages'

export interface ReadingGoal {
  id: string
  userId: string
  period: GoalPeriod
  metric: GoalMetric
  /** Year for yearly goals; `YYYY-MM` for monthly goals. */
  periodKey: string
  target: number
  createdAt: string
  updatedAt: string
}

export interface Review {
  id: string
  userId: string
  bookId: string
  rating: number
  title: string | null
  body: string
  containsSpoilers: boolean
  pros: string[]
  cons: string[]
  favoriteQuote: string | null
  recommended: boolean | null
  visibility: Visibility
  createdAt: string
  updatedAt: string
}

export interface Quote {
  id: string
  userId: string
  bookId: string | null
  text: string
  page: number | null
  chapter: string | null
  comment: string | null
  tags: string[]
  isFavorite: boolean
  createdAt: string
  updatedAt: string
}

export interface Note {
  id: string
  userId: string
  bookId: string | null
  kind: NoteKind
  title: string
  /** Markdown-ish rich text. Stored as text so export stays trivial. */
  body: string
  chapter: string | null
  tags: string[]
  isPinned: boolean
  createdAt: string
  updatedAt: string
}

/** The signature "What I Learned" record — one per book per user. */
export interface Learning {
  id: string
  userId: string
  bookId: string
  biggestLessons: string
  ideasWorthRemembering: string
  disagreements: string
  changedThinking: string
  howToApply: string
  favoriteIdeas: string
  oneSentenceSummary: string
  scoreUsefulness: number | null
  scoreWriting: number | null
  scoreOriginality: number | null
  scoreApplicability: number | null
  createdAt: string
  updatedAt: string
}

export interface Activity {
  id: string
  userId: string
  kind: ActivityKind
  bookId: string | null
  noteId: string | null
  quoteId: string | null
  /** Pre-rendered summary so the feed never needs N+1 lookups. */
  summary: string
  createdAt: string
}

export interface Tab {
  id: string
  userId: string
  kind: 'book' | 'note' | 'page'
  /** Route this tab restores to. */
  path: string
  title: string
  icon: string | null
  entityId: string | null
  isPinned: boolean
  position: number
  openedAt: string
}

/* -------------------------------------------------------------------------
   View models — shapes the UI works with, assembled by the repository.
------------------------------------------------------------------------- */

export interface LibraryEntry {
  userBook: UserBook
  book: Book
  percent: number
  shelfIds: string[]
}

export interface ReadingStats {
  booksFinishedThisYear: number
  booksFinishedAllTime: number
  pagesReadThisYear: number
  pagesReadAllTime: number
  currentStreak: number
  longestStreak: number
  averageRating: number | null
  currentlyReading: number
  wantToRead: number
  dnfCount: number
  averageBookLength: number | null
  completionRate: number | null
  dnfRate: number | null
}
