import { BookText, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { NoteCard } from '@/components/notes/NoteCard'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/field'
import { Badge, EmptyState, PageLoader } from '@/components/ui/primitives'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { useVersion } from '@/stores/data'
import { NOTE_KIND_LABEL, type NoteKind } from '@/types'
import { cn } from '@/lib/utils'

export function NotesPage() {
  useTab({ title: 'Notes', kind: 'page', icon: 'note' })
  const profile = useSession((s) => s.profile)!
  const navigate = useNavigate()
  const notesVersion = useVersion('notes')
  const libraryVersion = useVersion('library')

  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<NoteKind | 'all'>('all')
  const [tag, setTag] = useState<string | null>(null)

  const { data, loading } = useAsync(
    async () => ({
      notes: await repo.listNotes(profile.id),
      entries: await repo.listLibrary(profile.id),
    }),
    [profile.id, notesVersion, libraryVersion],
  )

  const bookById = useMemo(
    () => new Map((data?.entries ?? []).map((e) => [e.book.id, e.book])),
    [data],
  )

  const tags = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of data?.notes ?? []) {
      for (const t of note.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  }, [data])

  const notes = useMemo(() => {
    let result = data?.notes ?? []
    if (kind !== 'all') result = result.filter((n) => n.kind === kind)
    if (tag) result = result.filter((n) => n.tags.includes(tag))
    const q = query.trim().toLowerCase()
    if (q) {
      result = result.filter((n) =>
        `${n.title} ${n.body} ${n.tags.join(' ')}`.toLowerCase().includes(q),
      )
    }
    return result
  }, [data, kind, tag, query])

  if (loading && !data) return <PageLoader label="Loading notes" />

  return (
    <div className="mx-auto max-w-6xl px-6 py-7">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[26px] leading-tight tracking-tight">Notes</h1>
          <p className="mt-1 text-[13px] text-text-muted">
            {notes.length} {notes.length === 1 ? 'note' : 'notes'}
          </p>
        </div>
        <Button variant="primary" onClick={() => navigate('/notes/new')}>
          <Plus /> New note
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 max-w-xs flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-text-faint" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes"
            className="pl-8"
            aria-label="Search notes"
          />
        </div>
        <NativeSelect
          value={kind}
          onChange={(event) => setKind(event.target.value as NoteKind | 'all')}
          className="w-44"
          aria-label="Filter by note type"
        >
          <option value="all">All types</option>
          {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((value) => (
            <option key={value} value={value}>
              {NOTE_KIND_LABEL[value]}
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
          {tag && (
            <button
              type="button"
              onClick={() => setTag(null)}
              className="ml-1 text-[11px] text-text-faint hover:text-text"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState
          icon={<BookText />}
          title={data?.notes.length ? 'No notes match those filters' : 'Nothing written down yet'}
          description={
            data?.notes.length
              ? 'Try a different search term or note type.'
              : 'Notes are where a book turns into something you actually keep. Start with one lesson.'
          }
          actions={
            <Button variant="primary" onClick={() => navigate('/notes/new')}>
              <Plus /> Write a note
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {notes.map((note) => (
            <NoteCard
              key={note.id}
              note={note}
              book={note.bookId ? bookById.get(note.bookId) : null}
            />
          ))}
        </div>
      )}

      {data && data.notes.length > 0 && notes.length > 0 && (
        <p className="mt-6 text-xs text-text-faint">
          <Badge>Tip</Badge> Press ⌘⇧N anywhere to start a new note.
        </p>
      )}
    </div>
  )
}
