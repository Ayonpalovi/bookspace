import { Plus, Quote as QuoteIcon, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { QuoteCard } from '@/components/quotes/QuoteCard'
import { QuoteDialog } from '@/components/quotes/QuoteDialog'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/field'
import { EmptyState, PageLoader } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import type { Quote } from '@/types'
import { cn } from '@/lib/utils'

export function QuotesPage() {
  useTab({ title: 'Quotes', kind: 'page', icon: 'quote' })
  const profile = useSession((s) => s.profile)!
  const quotesVersion = useVersion('quotes')
  const libraryVersion = useVersion('library')

  const [query, setQuery] = useState('')
  const [bookFilter, setBookFilter] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Quote | null>(null)

  const { data, loading, reload } = useAsync(
    async () => ({
      quotes: await repo.listQuotes(profile.id),
      entries: await repo.listLibrary(profile.id),
    }),
    [profile.id, quotesVersion, libraryVersion],
  )

  const bookById = useMemo(
    () => new Map((data?.entries ?? []).map((e) => [e.book.id, e.book])),
    [data],
  )

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const quote of data?.quotes ?? []) {
      for (const t of quote.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [data])

  const quotes = useMemo(() => {
    let result = data?.quotes ?? []
    if (bookFilter) result = result.filter((q) => q.bookId === bookFilter)
    if (tag) result = result.filter((q) => q.tags.includes(tag))
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter((quote) => {
        const book = quote.bookId ? bookById.get(quote.bookId) : null
        return `${quote.text} ${quote.comment ?? ''} ${quote.tags.join(' ')} ${
          book?.title ?? ''
        } ${book?.authors.join(' ') ?? ''}`
          .toLowerCase()
          .includes(q)
      })
    }
    return result
  }, [data, bookFilter, tag, query, bookById])

  const remove = async (quote: Quote) => {
    await repo.deleteQuote(profile.id, quote.id)
    bump('quotes')
    reload()
    toast.success('Quote deleted')
  }

  if (loading && !data) return <PageLoader label="Loading quotes" />

  return (
    <div className="mx-auto max-w-5xl px-6 py-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] leading-tight tracking-tight">Quotes</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {quotes.length} saved {quotes.length === 1 ? 'passage' : 'passages'}
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setEditing(null)
            setDialogOpen(true)
          }}
        >
          <Plus /> Save a quote
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quotes, books and authors"
            className="pl-8"
            aria-label="Search quotes"
          />
        </div>
        <NativeSelect
          value={bookFilter}
          onChange={(event) => setBookFilter(event.target.value)}
          className="w-52"
          aria-label="Filter by book"
        >
          <option value="">All books</option>
          {(data?.entries ?? []).map((entry) => (
            <option key={entry.book.id} value={entry.book.id}>
              {entry.book.title}
            </option>
          ))}
        </NativeSelect>
      </div>

      {tags.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          {tags.map(([name, count]) => (
            <button
              key={name}
              type="button"
              onClick={() => setTag(tag === name ? null : name)}
              className={cn(
                'rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                tag === name
                  ? 'border-transparent bg-accent-subtle text-accent'
                  : 'border-border text-text-muted hover:border-border-strong hover:text-text',
              )}
            >
              #{name}
              <span className="ml-1 text-text-faint">{count}</span>
            </button>
          ))}
        </div>
      )}

      {quotes.length === 0 ? (
        <EmptyState
          icon={<QuoteIcon />}
          title={
            data?.quotes.length ? 'No quotes match those filters' : 'No quotes saved yet'
          }
          description={
            data?.quotes.length
              ? 'Try a different search term or book.'
              : 'Save the lines worth keeping. They stay linked to the book they came from.'
          }
          actions={
            <Button
              variant="primary"
              onClick={() => {
                setEditing(null)
                setDialogOpen(true)
              }}
            >
              <Plus /> Save a quote
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {quotes.map((quote) => (
            <QuoteCard
              key={quote.id}
              quote={quote}
              book={quote.bookId ? bookById.get(quote.bookId) : null}
              onEdit={() => {
                setEditing(quote)
                setDialogOpen(true)
              }}
              onDelete={() => remove(quote)}
            />
          ))}
        </div>
      )}

      <QuoteDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        quote={editing}
        books={data?.entries}
        onSaved={reload}
      />
    </div>
  )
}
