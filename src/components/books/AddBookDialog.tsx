import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toast'
import * as repo from '@/data/repository'
import { useSession } from '@/stores/session'
import { bump } from '@/stores/data'
import { STATUS_LABEL, READING_STATUSES, type ReadingStatus } from '@/types'

const EMPTY = {
  title: '',
  subtitle: '',
  authors: '',
  pageCount: '',
  publisher: '',
  publishedDate: '',
  isbn: '',
  language: '',
  genres: '',
  coverUrl: '',
  description: '',
}

/**
 * Manual entry only, by design: BookSpace never depends on an external book API
 * being available. The `externalSource`/`externalId` columns on `books` are the
 * seam for adding a catalogue lookup later.
 */
export function AddBookDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded?: (bookId: string) => void
}) {
  const profile = useSession((s) => s.profile)
  const navigate = useNavigate()
  const [form, setForm] = useState(EMPTY)
  const [status, setStatus] = useState<ReadingStatus>('want_to_read')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const set = (key: keyof typeof EMPTY) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const reset = () => {
    setForm(EMPTY)
    setStatus('want_to_read')
    setError(null)
    setShowDetails(false)
  }

  const submit = async () => {
    if (!profile) return
    if (!form.title.trim()) {
      setError('A book needs a title.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const pageCount = form.pageCount ? Number.parseInt(form.pageCount, 10) : null
      const entry = await repo.addBook(
        profile.id,
        {
          title: form.title,
          subtitle: form.subtitle || null,
          authors: form.authors
            .split(',')
            .map((a) => a.trim())
            .filter(Boolean),
          pageCount: Number.isFinite(pageCount) ? pageCount : null,
          publisher: form.publisher || null,
          publishedDate: form.publishedDate || null,
          isbn: form.isbn || null,
          language: form.language || null,
          coverUrl: form.coverUrl || null,
          description: form.description || null,
          genres: form.genres
            .split(',')
            .map((g) => g.trim())
            .filter(Boolean),
        },
        { status },
      )
      bump('library', 'activity')
      toast.success(`${entry.book.title} added to your library`)
      onOpenChange(false)
      reset()
      if (onAdded) onAdded(entry.book.id)
      else navigate(`/books/${entry.book.id}`)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not add this book.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent
        title="Add a book"
        description="Enter what you know — you can fill in the rest later."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} disabled={saving}>
              {saving ? 'Adding…' : 'Add to library'}
            </Button>
          </>
        }
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <Field label="Title" required error={error}>
            {(props) => (
              <Input
                {...props}
                autoFocus
                value={form.title}
                onChange={(e) => set('title')(e.target.value)}
                placeholder="Atomic Habits"
              />
            )}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Author(s)" hint="Separate multiple authors with commas">
              {(props) => (
                <Input
                  {...props}
                  value={form.authors}
                  onChange={(e) => set('authors')(e.target.value)}
                  placeholder="James Clear"
                />
              )}
            </Field>
            <Field label="Pages">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  value={form.pageCount}
                  onChange={(e) => set('pageCount')(e.target.value)}
                  placeholder="320"
                />
              )}
            </Field>
          </div>

          <Field label="Shelf">
            {(props) => (
              <NativeSelect
                {...props}
                value={status}
                onChange={(e) => setStatus(e.target.value as ReadingStatus)}
              >
                {READING_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {STATUS_LABEL[value]}
                  </option>
                ))}
              </NativeSelect>
            )}
          </Field>

          {showDetails ? (
            <div className="space-y-4 border-t border-border pt-4">
              <Field label="Subtitle">
                {(props) => (
                  <Input
                    {...props}
                    value={form.subtitle}
                    onChange={(e) => set('subtitle')(e.target.value)}
                  />
                )}
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Publisher">
                  {(props) => (
                    <Input
                      {...props}
                      value={form.publisher}
                      onChange={(e) => set('publisher')(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Publication date">
                  {(props) => (
                    <Input
                      {...props}
                      type="date"
                      value={form.publishedDate}
                      onChange={(e) => set('publishedDate')(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="ISBN">
                  {(props) => (
                    <Input
                      {...props}
                      value={form.isbn}
                      onChange={(e) => set('isbn')(e.target.value)}
                    />
                  )}
                </Field>
                <Field label="Language">
                  {(props) => (
                    <Input
                      {...props}
                      value={form.language}
                      onChange={(e) => set('language')(e.target.value)}
                      placeholder="English"
                    />
                  )}
                </Field>
              </div>
              <Field label="Genres" hint="Comma separated">
                {(props) => (
                  <Input
                    {...props}
                    value={form.genres}
                    onChange={(e) => set('genres')(e.target.value)}
                    placeholder="Psychology, Productivity"
                  />
                )}
              </Field>
              <Field label="Cover image URL">
                {(props) => (
                  <Input
                    {...props}
                    type="url"
                    value={form.coverUrl}
                    onChange={(e) => set('coverUrl')(e.target.value)}
                    placeholder="https://…"
                  />
                )}
              </Field>
              <Field label="Description">
                {(props) => (
                  <Textarea
                    {...props}
                    value={form.description}
                    onChange={(e) => set('description')(e.target.value)}
                  />
                )}
              </Field>
            </div>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="px-0"
              onClick={() => setShowDetails(true)}
            >
              Add more details
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}
