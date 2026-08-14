import { BookMarked, Check, Compass, Loader2, Search, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { BookCover } from '@/components/books/BookCover'
import { Input } from '@/components/ui/field'
import { Badge, EmptyState, PageLoader } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import type { LibraryEntry } from '@/types'
import {
  coverUrl,
  searchBooks,
  worksBySubject,
  type DiscoveredBook,
} from '@/lib/openLibrary'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import { cn } from '@/lib/utils'

/**
 * Free, keyless catalogue search (spec: "a vast book knowledgebase where I
 * can search and add to my wishlist"). Every result comes straight from Open
 * Library — nothing here is invented, and a result the user already owns is
 * labelled as such rather than offered again as new.
 */
export function DiscoverPage() {
  useTab({ title: 'Discover', kind: 'page', icon: 'library' })
  const profile = useSession((s) => s.profile)!
  const libraryVersion = useVersion('library')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DiscoveredBook[]>([])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingId, setAddingId] = useState<string | null>(null)

  const { data: owned, reload: reloadOwned } = useAsync(
    async () => {
      const entries = await repo.listLibrary(profile.id)
      return new Set(
        entries
          .filter((e) => e.book.externalSource === 'openlibrary' && e.book.externalId)
          .map((e) => e.book.externalId as string),
      )
    },
    [profile.id, libraryVersion],
  )

  const { data: libraryInfo } = useAsync(
    async () => {
      const entries = await repo.listLibrary(profile.id)
      const counts = new Map<string, number>()
      for (const entry of entries) {
        for (const genre of entry.book.genres) {
          counts.set(genre, (counts.get(genre) ?? 0) + 1)
        }
      }
      const genres = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([genre]) => genre)
      return {
        genres,
        bookCount: entries.length,
        // Recommendations match on genre, so a book with none is invisible to
        // them — surfaced here so the empty state can point at the fix.
        untaggedBook: entries.find((entry) => entry.book.genres.length === 0) ?? null,
      }
    },
    [profile.id, libraryVersion],
  )

  // Debounced search — mirrors the pattern in the global ⌘K search dialog.
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      setSearchError(null)
      return
    }
    let cancelled = false
    setSearching(true)
    setSearchError(null)
    const timer = setTimeout(() => {
      searchBooks(query)
        .then((found) => {
          if (cancelled) return
          setResults(found)
        })
        .catch((caught: unknown) => {
          if (cancelled) return
          setSearchError(caught instanceof Error ? caught.message : 'Search failed.')
          setResults([])
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  const addToWishlist = async (book: DiscoveredBook) => {
    setAddingId(book.externalId)
    try {
      const existing = await repo.findBookByExternalId(
        profile.id,
        book.source,
        book.externalId,
      )
      if (existing) {
        toast.info(`${book.title} is already in your library`)
        return
      }
      await repo.addBook(
        profile.id,
        {
          title: book.title,
          authors: book.authors,
          coverUrl: coverUrl(book.coverId, 'L'),
          isbn: book.isbn,
          pageCount: book.pageCount,
          publishedDate: book.firstPublishYear ? `${book.firstPublishYear}-01-01` : null,
          genres: book.subjects.slice(0, 4),
          externalSource: book.source,
          externalId: book.externalId,
        },
        { status: 'want_to_read' },
      )
      bump('library', 'activity')
      reloadOwned()
      toast.success(`Added ${book.title} to Want to Read`)
    } catch (caught) {
      toast.error(
        'Could not add that book',
        caught instanceof Error ? caught.message : undefined,
      )
    } finally {
      setAddingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-7">
      <div className="mb-6">
        <h1 className="font-serif text-[26px] leading-tight tracking-tight">Discover</h1>
        <p className="mt-1 text-[13px] text-text-muted">
          Search a free, open catalogue of books and add anything that catches your eye
          to Want to Read.
        </p>
      </div>

      <div className="relative mb-6 max-w-lg">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-faint" />
        <Input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by title, author or subject"
          className="h-11 pl-10 text-[15px]"
          aria-label="Search books"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-text-faint" />
        )}
      </div>

      {query.trim() ? (
        <SearchResults
          results={results}
          loading={searching}
          error={searchError}
          owned={owned ?? new Set()}
          addingId={addingId}
          onAdd={addToWishlist}
        />
      ) : (
        <Recommendations
          genres={libraryInfo?.genres ?? []}
          bookCount={libraryInfo?.bookCount ?? 0}
          untaggedBook={libraryInfo?.untaggedBook ?? null}
          owned={owned ?? new Set()}
          addingId={addingId}
          onAdd={addToWishlist}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ results */

function ResultGrid({
  books,
  owned,
  addingId,
  onAdd,
}: {
  books: DiscoveredBook[]
  owned: Set<string>
  addingId: string | null
  onAdd: (book: DiscoveredBook) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {books.map((book) => {
        const isOwned = owned.has(book.externalId)
        const isAdding = addingId === book.externalId
        return (
          <div key={book.externalId} className="group flex flex-col gap-2">
            <div className="relative">
              <BookCover
                book={{
                  title: book.title,
                  authors: book.authors,
                  coverUrl: coverUrl(book.coverId, 'M'),
                }}
              />
              <button
                type="button"
                disabled={isOwned || isAdding}
                onClick={() => onAdd(book)}
                aria-label={isOwned ? `${book.title} is already in your library` : `Add ${book.title} to Want to Read`}
                className={cn(
                  'absolute bottom-1.5 right-1.5 flex size-7 items-center justify-center rounded-full shadow-[var(--shadow-sm)] backdrop-blur-sm transition-colors',
                  isOwned
                    ? 'bg-success text-white'
                    : 'bg-black/55 text-white hover:bg-accent',
                )}
              >
                {isAdding ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : isOwned ? (
                  <Check className="size-3.5" />
                ) : (
                  <BookMarked className="size-3.5" />
                )}
              </button>
            </div>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-text">{book.title}</p>
              <p className="truncate text-[11px] text-text-faint">
                {book.authors.join(', ') || 'Unknown author'}
                {book.firstPublishYear ? ` · ${book.firstPublishYear}` : ''}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function SearchResults({
  results,
  loading,
  error,
  owned,
  addingId,
  onAdd,
}: {
  results: DiscoveredBook[]
  loading: boolean
  error: string | null
  owned: Set<string>
  addingId: string | null
  onAdd: (book: DiscoveredBook) => void
}) {
  if (error) {
    return (
      <EmptyState
        icon={<Search />}
        title="Search didn't go through"
        description={error}
      />
    )
  }
  if (loading && results.length === 0) return <PageLoader label="Searching Open Library" />
  if (!loading && results.length === 0) {
    return (
      <EmptyState
        icon={<Search />}
        title="No matches"
        description="Try a different title, author, or a broader term."
      />
    )
  }
  return <ResultGrid books={results} owned={owned} addingId={addingId} onAdd={onAdd} />
}

/* ------------------------------------------------------------ recommended */

function Recommendations({
  genres,
  bookCount,
  untaggedBook,
  owned,
  addingId,
  onAdd,
}: {
  genres: string[]
  bookCount: number
  untaggedBook: LibraryEntry | null
  owned: Set<string>
  addingId: string | null
  onAdd: (book: DiscoveredBook) => void
}) {
  const topGenres = useMemo(() => genres.slice(0, 3), [genres])

  const { data, loading } = useAsync(async () => {
    if (!topGenres.length) return []
    const perGenre = await Promise.all(
      topGenres.map((genre) => worksBySubject(genre, 8).catch(() => [])),
    )
    // Interleave rather than concatenate so one genre doesn't dominate the row.
    const merged: DiscoveredBook[] = []
    const seen = new Set<string>()
    let index = 0
    while (merged.length < perGenre.flat().length) {
      let addedAny = false
      for (const list of perGenre) {
        const book = list[index]
        if (book && !seen.has(book.externalId)) {
          seen.add(book.externalId)
          merged.push(book)
          addedAny = true
        }
      }
      index += 1
      if (!addedAny) break
    }
    return merged
  }, [topGenres.join('|')])

  // A recommendation is only useful when it's new — books already owned are
  // filtered out here rather than in the fetch, so re-adding a book doesn't
  // require refetching the whole subject list.
  const suggestions = useMemo(
    () => (data ?? []).filter((book) => !owned.has(book.externalId)),
    [data, owned],
  )

  if (!topGenres.length) {
    // Two different reasons look identical from the outside (an empty
    // recommendations panel) but need different fixes, so they get different
    // copy: no books yet, versus books that exist but aren't tagged.
    if (bookCount === 0) {
      return (
        <EmptyState
          icon={<Compass />}
          title="Add a few books to get recommendations"
          description="Once your library has some genres in it, BookSpace will suggest well-regarded books in the same subjects — pulled from the same open catalogue, not invented."
        />
      )
    }
    return (
      <EmptyState
        icon={<Compass />}
        title="Your books don't have genres yet"
        description={`Recommendations are matched by genre, and none of your ${bookCount === 1 ? 'book has' : `${bookCount} books have`} one set — books added quickly with just a title skip that field. Add a genre and suggestions will appear here.`}
        actions={
          untaggedBook && (
            <Link
              to={`/books/${untaggedBook.book.id}`}
              className="text-[13px] font-medium text-accent hover:underline"
            >
              Open {untaggedBook.book.title} to add one →
            </Link>
          )
        }
      />
    )
  }

  return (
    <div>
      <div className="mb-4 flex items-center gap-2">
        <Sparkles className="size-4 text-accent" />
        <h2 className="text-[15px] font-semibold tracking-tight text-text">
          Because you read {topGenres.join(', ')}
        </h2>
      </div>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {topGenres.map((genre) => (
          <Badge key={genre} tone="accent">
            {genre}
          </Badge>
        ))}
      </div>
      {loading ? (
        <PageLoader label="Finding books you might like" />
      ) : !suggestions.length ? (
        <EmptyState
          title={
            data?.length
              ? 'You already have everything found for these subjects'
              : 'Nothing came back for those subjects'
          }
          description={
            data?.length
              ? 'Open Library only had matches you already own. Try searching directly for something more specific.'
              : "Open Library's subject tagging doesn't cover everything. Try searching directly instead."
          }
        />
      ) : (
        <ResultGrid books={suggestions} owned={owned} addingId={addingId} onAdd={onAdd} />
      )}
      <p className="mt-6 text-[11px] leading-relaxed text-text-faint">
        Suggestions are drawn from your library's genres and ranked by Open Library's own
        rating data — nothing here is generated or guessed.
      </p>
    </div>
  )
}
