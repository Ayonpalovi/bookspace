import {
  ArrowLeft,
  Bold,
  CheckSquare,
  Eye,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pencil,
  Pin,
  Quote as QuoteIcon,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Input, NativeSelect } from '@/components/ui/field'
import { Badge, EmptyState, PageLoader, Segmented } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import { Markdown } from '@/lib/markdown'
import { useAsync } from '@/hooks/useAsync'
import { useTab } from '@/hooks/useTab'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { bump, useVersion } from '@/stores/data'
import { useTabs } from '@/stores/tabs'
import { NOTE_KIND_LABEL, type Note, type NoteKind } from '@/types'
import { debounce, relativeTime } from '@/lib/utils'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

const TOOLBAR: {
  icon: typeof Bold
  label: string
  wrap: [string, string]
  block?: boolean
}[] = [
  { icon: Heading2, label: 'Heading', wrap: ['## ', ''], block: true },
  { icon: Bold, label: 'Bold', wrap: ['**', '**'] },
  { icon: Italic, label: 'Italic', wrap: ['_', '_'] },
  { icon: List, label: 'Bullet list', wrap: ['- ', ''], block: true },
  { icon: ListOrdered, label: 'Numbered list', wrap: ['1. ', ''], block: true },
  { icon: CheckSquare, label: 'Checklist', wrap: ['- [ ] ', ''], block: true },
  { icon: QuoteIcon, label: 'Quote', wrap: ['> ', ''], block: true },
  { icon: Link2, label: 'Link', wrap: ['[', '](https://)'] },
]

export function NoteDetailPage() {
  const { noteId } = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const profile = useSession((s) => s.profile)!
  const renameTab = useTabs((s) => s.rename)
  const notesVersion = useVersion('notes')
  const libraryVersion = useVersion('library')

  const isNew = noteId === 'new'
  const [note, setNote] = useState<Note | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [mode, setMode] = useState<'write' | 'preview'>('write')
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const { data, loading } = useAsync(
    async () => ({
      note: isNew ? null : await repo.getNote(profile.id, noteId ?? ''),
      entries: await repo.listLibrary(profile.id),
    }),
    [profile.id, noteId, isNew, notesVersion, libraryVersion],
  )

  // Create the note as soon as the page opens so autosave has something to
  // write to and a refresh never loses the draft.
  useEffect(() => {
    if (!isNew) return
    let cancelled = false
    void repo
      .createNote(profile.id, {
        bookId: search.get('bookId'),
        title: '',
        kind: search.get('bookId') ? 'book' : 'quick',
      })
      .then((created) => {
        if (cancelled) return
        bump('notes', 'activity')
        navigate(`/notes/${created.id}`, { replace: true })
      })
      .catch(() => toast.error('Could not start a new note'))
    return () => {
      cancelled = true
    }
  }, [isNew, profile.id, search, navigate])

  useEffect(() => {
    if (data?.note) setNote(data.note)
  }, [data?.note])

  const title = isNew ? 'New note' : (note?.title || 'Untitled note')
  useTab({ title: isNew ? null : title, kind: 'note', icon: 'note', entityId: noteId })

  useEffect(() => {
    if (!isNew && noteId) renameTab(`/notes/${noteId}`, title)
  }, [title, noteId, isNew, renameTab])

  const persist = useMemo(
    () =>
      debounce(async (id: string, patch: Partial<Note>) => {
        setSaveState('saving')
        try {
          await repo.updateNote(profile.id, id, patch)
          setSaveState('saved')
          bump('notes')
        } catch {
          setSaveState('error')
          toast.error('Your changes have not saved yet', 'We will keep trying.')
        }
      }, 600),
    [profile.id],
  )

  const patch = useCallback(
    (changes: Partial<Note>) => {
      setNote((current) => {
        if (!current) return current
        const next = { ...current, ...changes }
        persist(current.id, changes)
        return next
      })
    },
    [persist],
  )

  const applyFormat = (wrap: [string, string], block?: boolean) => {
    const textarea = bodyRef.current
    if (!textarea || !note) return
    const { selectionStart: start, selectionEnd: end, value } = textarea
    let nextValue: string
    let caret: number
    if (block) {
      const lineStart = value.lastIndexOf('\n', start - 1) + 1
      nextValue = value.slice(0, lineStart) + wrap[0] + value.slice(lineStart)
      caret = start + wrap[0].length
    } else {
      const selected = value.slice(start, end)
      nextValue =
        value.slice(0, start) + wrap[0] + selected + wrap[1] + value.slice(end)
      caret = start + wrap[0].length + selected.length
    }
    patch({ body: nextValue })
    requestAnimationFrame(() => {
      textarea.focus()
      textarea.setSelectionRange(caret, caret)
    })
  }

  if (isNew || (loading && !note)) return <PageLoader label="Opening note" />
  if (!note) {
    return (
      <div className="p-8">
        <EmptyState
          title="Note not found"
          description="It may have been deleted."
          actions={
            <Button asChild variant="primary">
              <Link to="/notes">Back to notes</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const entries = data?.entries ?? []
  const sourceBook = entries.find((e) => e.book.id === note.bookId)

  return (
    <div className="mx-auto max-w-3xl px-6 py-7">
      <div className="mb-5 flex items-center gap-2">
        <Button size="sm" variant="ghost" onClick={() => navigate('/notes')}>
          <ArrowLeft /> Notes
        </Button>
        <span className="ml-auto text-xs text-text-faint">
          {saveState === 'saving'
            ? 'Saving…'
            : saveState === 'error'
              ? 'Not saved'
              : saveState === 'saved'
                ? 'Saved'
                : `Edited ${relativeTime(note.updatedAt)}`}
        </span>
        <Segmented
          label="Editor mode"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'write', label: 'Write', icon: <Pencil /> },
            { value: 'preview', label: 'Preview', icon: <Eye /> },
          ]}
        />
        <Button
          size="icon"
          variant="ghost"
          aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
          onClick={() => patch({ isPinned: !note.isPinned })}
          className={note.isPinned ? 'text-accent' : undefined}
        >
          <Pin />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Delete note"
          onClick={async () => {
            await repo.deleteNote(profile.id, note.id)
            bump('notes', 'activity')
            toast.success('Note deleted')
            navigate('/notes')
          }}
        >
          <Trash2 />
        </Button>
      </div>

      <input
        value={note.title}
        onChange={(event) => patch({ title: event.target.value })}
        placeholder="Untitled note"
        aria-label="Note title"
        className="w-full bg-transparent font-serif text-[28px] leading-tight tracking-tight text-text placeholder:text-text-faint focus:outline-none"
      />

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <NativeSelect
          value={note.kind}
          onChange={(event) => patch({ kind: event.target.value as NoteKind })}
          className="h-8 w-36 text-[13px]"
          aria-label="Note type"
        >
          {(Object.keys(NOTE_KIND_LABEL) as NoteKind[]).map((value) => (
            <option key={value} value={value}>
              {NOTE_KIND_LABEL[value]}
            </option>
          ))}
        </NativeSelect>

        <NativeSelect
          value={note.bookId ?? ''}
          onChange={(event) => patch({ bookId: event.target.value || null })}
          className="h-8 w-48 text-[13px]"
          aria-label="Source book"
        >
          <option value="">No source book</option>
          {entries.map((entry) => (
            <option key={entry.book.id} value={entry.book.id}>
              {entry.book.title}
            </option>
          ))}
        </NativeSelect>

        <Input
          value={note.chapter ?? ''}
          onChange={(event) => patch({ chapter: event.target.value || null })}
          placeholder="Chapter"
          className="h-8 w-32 text-[13px]"
          aria-label="Chapter"
        />

        <Input
          value={note.tags.join(', ')}
          onChange={(event) =>
            patch({
              tags: event.target.value
                .split(',')
                .map((t) => t.trim().replace(/^#/, ''))
                .filter(Boolean),
            })
          }
          placeholder="Tags, comma separated"
          className="h-8 w-56 text-[13px]"
          aria-label="Tags"
        />
      </div>

      {sourceBook && (
        <p className="mt-3 text-[13px] text-text-muted">
          From{' '}
          <Link
            to={`/books/${sourceBook.book.id}`}
            className="font-medium text-accent hover:underline"
          >
            {sourceBook.book.title}
          </Link>
        </p>
      )}

      <div className="mt-6 border-t border-border pt-4">
        {mode === 'write' ? (
          <>
            <div className="mb-2 flex flex-wrap items-center gap-0.5">
              {TOOLBAR.map((tool) => {
                const Icon = tool.icon
                return (
                  <Button
                    key={tool.label}
                    size="icon-sm"
                    variant="ghost"
                    aria-label={tool.label}
                    title={tool.label}
                    onClick={() => applyFormat(tool.wrap, tool.block)}
                  >
                    <Icon />
                  </Button>
                )
              })}
              <Badge className="ml-2">Markdown</Badge>
            </div>
            <textarea
              ref={bodyRef}
              value={note.body}
              onChange={(event) => patch({ body: event.target.value })}
              placeholder="Start writing. Markdown works — ## headings, - lists, > quotes, **bold**."
              aria-label="Note body"
              className="min-h-[420px] w-full resize-y bg-transparent text-[15px] leading-relaxed text-text placeholder:text-text-faint focus:outline-none"
            />
          </>
        ) : note.body.trim() ? (
          <Markdown source={note.body} />
        ) : (
          <p className="py-10 text-center text-sm text-text-faint">
            Nothing to preview yet.
          </p>
        )}
      </div>
    </div>
  )
}
