import * as TabsPrimitive from '@radix-ui/react-tabs'
import { BookOpen, FileText, Quote as QuoteIcon, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Input } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import * as repo from '@/data/repository'
import { useCanvas } from '@/stores/canvas'
import { useSession } from '@/stores/session'
import type { Point } from '@/types/canvas'
import { cn } from '@/lib/utils'

/**
 * Drops live book, note and quote cards onto the canvas.
 *
 * Cards store only the entity id, so they read through to the real record —
 * editing a note updates its card, and clicking through opens the source.
 */
export function AddFromLibraryDialog({
  open,
  onOpenChange,
  at,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  at: () => Point
  onAdded?: () => void
}) {
  const profile = useSession((s) => s.profile)!
  const store = useCanvas
  const [query, setQuery] = useState('')

  const { data } = useAsync(
    async () => ({
      entries: await repo.listLibrary(profile.id),
      notes: await repo.listNotes(profile.id),
      quotes: await repo.listQuotes(profile.id),
    }),
    [profile.id, open],
  )

  const q = query.trim().toLowerCase()
  const books = useMemo(
    () =>
      (data?.entries ?? []).filter((e) =>
        `${e.book.title} ${e.book.authors.join(' ')}`.toLowerCase().includes(q),
      ),
    [data, q],
  )
  const notes = useMemo(
    () => (data?.notes ?? []).filter((n) => `${n.title} ${n.body}`.toLowerCase().includes(q)),
    [data, q],
  )
  const quotes = useMemo(
    () => (data?.quotes ?? []).filter((quote) => quote.text.toLowerCase().includes(q)),
    [data, q],
  )

  const place = (
    type: 'book_card' | 'note_card' | 'quote_card',
    content: Record<string, unknown>,
    label: string,
  ) => {
    const point = at()
    const created = store.getState().createObject({ type, x: point.x, y: point.y, content })
    if (created) {
      toast.success(`${label} added to the canvas`)
      onAdded?.()
      onOpenChange(false)
    }
  }

  const tabClass =
    'flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium text-text-muted transition-colors hover:text-text data-[state=active]:text-text relative after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[state=active]:after:bg-accent'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Add from your library"
        description="Book, note and quote cards stay linked to the original record."
        size="lg"
      >
        <div className="relative mb-4">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search books, notes and quotes"
            className="pl-8"
            aria-label="Search library"
          />
        </div>

        <TabsPrimitive.Root defaultValue="books">
          <TabsPrimitive.List className="flex gap-1 border-b border-border">
            <TabsPrimitive.Trigger value="books" className={tabClass}>
              <BookOpen className="size-3.5" /> Books
              <span className="text-text-faint">{books.length}</span>
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger value="notes" className={tabClass}>
              <FileText className="size-3.5" /> Notes
              <span className="text-text-faint">{notes.length}</span>
            </TabsPrimitive.Trigger>
            <TabsPrimitive.Trigger value="quotes" className={tabClass}>
              <QuoteIcon className="size-3.5" /> Quotes
              <span className="text-text-faint">{quotes.length}</span>
            </TabsPrimitive.Trigger>
          </TabsPrimitive.List>

          <div className="max-h-80 overflow-y-auto pt-3">
            <TabsPrimitive.Content value="books">
              {books.length === 0 ? (
                <EmptyState title="No books match" className="border-0 py-10" />
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {books.map((entry) => (
                    <button
                      key={entry.book.id}
                      type="button"
                      onClick={() =>
                        place('book_card', { bookId: entry.book.id }, entry.book.title)
                      }
                      className={cn(
                        'flex items-center gap-3 rounded-lg border border-border p-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-hover',
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-text">
                          {entry.book.title}
                        </span>
                        <span className="block truncate text-[11px] text-text-faint">
                          {entry.book.authors.join(', ') || 'Unknown author'}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="notes">
              {notes.length === 0 ? (
                <EmptyState title="No notes match" className="border-0 py-10" />
              ) : (
                <div className="space-y-2">
                  {notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() =>
                        place('note_card', { noteId: note.id }, note.title || 'Note')
                      }
                      className="block w-full rounded-lg border border-border p-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-hover"
                    >
                      <span className="block truncate text-[13px] font-medium text-text">
                        {note.title || 'Untitled note'}
                      </span>
                      <span className="mt-0.5 block truncate text-[11px] text-text-faint">
                        {note.body.slice(0, 90) || 'Empty note'}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </TabsPrimitive.Content>

            <TabsPrimitive.Content value="quotes">
              {quotes.length === 0 ? (
                <EmptyState title="No quotes match" className="border-0 py-10" />
              ) : (
                <div className="space-y-2">
                  {quotes.map((quote) => (
                    <button
                      key={quote.id}
                      type="button"
                      onClick={() => place('quote_card', { quoteId: quote.id }, 'Quote')}
                      className="block w-full rounded-lg border border-border p-2.5 text-left transition-colors hover:border-border-strong hover:bg-surface-hover"
                    >
                      <span className="line-clamp-2 font-serif text-[13px] text-text">
                        {quote.text}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </TabsPrimitive.Content>
          </div>
        </TabsPrimitive.Root>
      </DialogContent>
    </Dialog>
  )
}
