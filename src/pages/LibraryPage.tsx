import {
  ArrowUpDown,
  BookPlus,
  LayoutGrid,
  Library as LibraryIcon,
  List,
  Plus,
  Search,
  Tag,
  Trash2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AddBookDialog } from '@/components/books/AddBookDialog'
import { BookCard, BookRow } from '@/components/books/BookCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import {
  Badge,
  EmptyState,
  PageLoader,
  Segmented,
} from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import { STATUS_LABEL, type LibraryEntry, type ReadingStatus } from '@/types'
import { cn } from '@/lib/utils'

type SortKey = 'recent' | 'title' | 'author' | 'rating' | 'progress' | 'pages'

const SORT_LABEL: Record<SortKey, string> = {
  recent: 'Recently added',
  title: 'Title',
  author: 'Author',
  rating: 'Rating',
  progress: 'Progress',
  pages: 'Page count',
}

const FILTER_TO_STATUS: Record<string, ReadingStatus> = {
  reading: 'reading',
  'want-to-read': 'want_to_read',
  finished: 'finished',
  dnf: 'dnf',
}

function sortEntries(entries: LibraryEntry[], key: SortKey): LibraryEntry[] {
  const sorted = [...entries]
  switch (key) {
    case 'title':
      return sorted.sort((a, b) => a.book.title.localeCompare(b.book.title))
    case 'author':
      return sorted.sort((a, b) =>
        (a.book.authors[0] ?? '').localeCompare(b.book.authors[0] ?? ''),
      )
    case 'rating':
      return sorted.sort((a, b) => (b.userBook.rating ?? 0) - (a.userBook.rating ?? 0))
    case 'progress':
      return sorted.sort((a, b) => b.percent - a.percent)
    case 'pages':
      return sorted.sort((a, b) => (b.book.pageCount ?? 0) - (a.book.pageCount ?? 0))
    default:
      return sorted.sort((a, b) => b.userBook.dateAdded.localeCompare(a.userBook.dateAdded))
  }
}

export function LibraryPage() {
  const { filter } = useParams()
  const profile = useSession((s) => s.profile)!
  const libraryVersion = useVersion('library')
  const shelvesVersion = useVersion('shelves')

  const status = filter ? FILTER_TO_STATUS[filter] : undefined
  const heading = status ? STATUS_LABEL[status] : 'My Library'

  useTab({ title: heading, kind: 'page', icon: 'library' })

  const [view, setView] = useState<'grid' | 'list'>('grid')
  const [sort, setSort] = useState<SortKey>('recent')
  const [query, setQuery] = useState('')
  const [shelfId, setShelfId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [newShelfOpen, setNewShelfOpen] = useState(false)
  const [newShelfName, setNewShelfName] = useState('')

  const { data, loading, error, reload } = useAsync(
    async () => ({
      entries: await repo.listLibrary(profile.id),
      shelves: await repo.listShelves(profile.id),
    }),
    [profile.id, libraryVersion, shelvesVersion],
  )

  const entries = useMemo(() => {
    if (!data) return []
    let result = data.entries
    if (status) result = result.filter((e) => e.userBook.status === status)
    if (shelfId) result = result.filter((e) => e.shelfIds.includes(shelfId))
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter((e) =>
        `${e.book.title} ${e.book.subtitle ?? ''} ${e.book.authors.join(' ')}`
          .toLowerCase()
          .includes(q),
      )
    }
    return sortEntries(result, sort)
  }, [data, status, shelfId, query, sort])

  const createShelf = async () => {
    try {
      await repo.createShelf(profile.id, newShelfName)
      setNewShelfName('')
      setNewShelfOpen(false)
      bump('shelves', 'activity')
      toast.success('Shelf created')
    } catch (caught) {
      toast.error(
        'Could not create the shelf',
        caught instanceof Error ? caught.message : undefined,
      )
    }
  }

  const removeShelf = async (id: string, name: string) => {
    try {
      await repo.deleteShelf(profile.id, id)
      if (shelfId === id) setShelfId(null)
      bump('shelves', 'library')
      toast.success(`Deleted the shelf ${name}`)
    } catch {
      toast.error('Could not delete that shelf')
    }
  }

  if (loading && !data) return <PageLoader label="Loading your library" />
  if (error) {
    return (
      <div className="p-8">
        <EmptyState
          title="Your library could not be loaded"
          description={error.message}
          actions={<Button onClick={reload}>Try again</Button>}
        />
      </div>
    )
  }

  const shelves = data?.shelves ?? []
  const total = data?.entries.length ?? 0

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] leading-tight tracking-tight">
            {heading}
          </h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {entries.length === total
              ? `${total} ${total === 1 ? 'book' : 'books'}`
              : `${entries.length} of ${total} books`}
          </p>
        </div>
        <Button variant="primary" onClick={() => setAddOpen(true)}>
          <Plus /> Add book
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter by title or author"
            className="pl-8"
            aria-label="Filter library"
          />
        </div>

        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="secondary">
              <Tag /> {shelfId ? shelves.find((s) => s.id === shelfId)?.name : 'Shelves'}
            </Button>
          </MenuTrigger>
          <MenuContent className="w-56">
            <MenuItem onSelect={() => setShelfId(null)}>All shelves</MenuItem>
            {shelves.length > 0 && <MenuSeparator />}
            {shelves.map((shelf) => (
              <MenuItem
                key={shelf.id}
                onSelect={() => setShelfId(shelf.id)}
                className={shelf.id === shelfId ? 'bg-surface-hover' : undefined}
              >
                <span className="flex-1 truncate">{shelf.name}</span>
                <button
                  type="button"
                  aria-label={`Delete ${shelf.name}`}
                  onClick={(event) => {
                    event.preventDefault()
                    event.stopPropagation()
                    void removeShelf(shelf.id, shelf.name)
                  }}
                  className="rounded p-0.5 text-text-faint hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </MenuItem>
            ))}
            <MenuSeparator />
            <MenuItem onSelect={() => setNewShelfOpen(true)}>
              <Plus /> New shelf
            </MenuItem>
          </MenuContent>
        </Menu>

        <Menu>
          <MenuTrigger asChild>
            <Button size="sm" variant="secondary">
              <ArrowUpDown /> {SORT_LABEL[sort]}
            </Button>
          </MenuTrigger>
          <MenuContent className="w-52">
            <MenuLabel>Sort by</MenuLabel>
            <MenuRadioGroup
              value={sort}
              onValueChange={(value) => setSort(value as SortKey)}
            >
              {(Object.keys(SORT_LABEL) as SortKey[]).map((key) => (
                <MenuRadioItem key={key} value={key}>
                  {SORT_LABEL[key]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </Menu>

        <div className="ml-auto">
          <Segmented
            label="Layout"
            value={view}
            onChange={setView}
            options={[
              { value: 'grid', label: 'Grid', icon: <LayoutGrid /> },
              { value: 'list', label: 'List', icon: <List /> },
            ]}
          />
        </div>
      </div>

      {newShelfOpen && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-surface p-3">
          <Input
            autoFocus
            value={newShelfName}
            onChange={(event) => setNewShelfName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createShelf()
              if (event.key === 'Escape') setNewShelfOpen(false)
            }}
            placeholder="Shelf name — Business, University, Favorites…"
            className="max-w-xs"
            aria-label="New shelf name"
          />
          <Button variant="primary" size="sm" onClick={createShelf}>
            Create
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setNewShelfOpen(false)}>
            Cancel
          </Button>
        </div>
      )}

      {shelfId && (
        <div className="mb-4 flex items-center gap-2">
          <Badge tone="accent">{shelves.find((s) => s.id === shelfId)?.name}</Badge>
          <button
            type="button"
            onClick={() => setShelfId(null)}
            className="text-xs text-text-faint hover:text-text"
          >
            Clear shelf filter
          </button>
        </div>
      )}

      {entries.length === 0 ? (
        total === 0 ? (
          <EmptyState
            icon={<LibraryIcon />}
            title="Your library is waiting."
            description="Add your first book and start building your reading history."
            actions={
              <Button variant="primary" onClick={() => setAddOpen(true)}>
                <BookPlus /> Add a book
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Search />}
            title="Nothing matches those filters"
            description="Try a different search term, shelf, or shelf status."
            actions={
              <Button
                onClick={() => {
                  setQuery('')
                  setShelfId(null)
                }}
              >
                Clear filters
              </Button>
            }
          />
        )
      ) : view === 'grid' ? (
        <div
          className={cn(
            'grid gap-4',
            'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
          )}
        >
          {entries.map((entry) => (
            <BookCard key={entry.book.id} entry={entry} />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {entries.map((entry) => (
            <BookRow key={entry.book.id} entry={entry} />
          ))}
        </div>
      )}

      <AddBookDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
