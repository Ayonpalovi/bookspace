import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Field, Input, NativeSelect, Textarea } from '@/components/ui/field'
import { toast } from '@/components/ui/toast'
import * as repo from '@/data/repository'
import { bump } from '@/stores/data'
import { useSession } from '@/stores/session'
import type { LibraryEntry, Quote } from '@/types'

export function QuoteDialog({
  open,
  onOpenChange,
  quote,
  bookId,
  books,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pass an existing quote to edit it; omit to create a new one. */
  quote?: Quote | null
  bookId?: string | null
  books?: LibraryEntry[]
  onSaved?: () => void
}) {
  const profile = useSession((s) => s.profile)!
  const [text, setText] = useState('')
  const [page, setPage] = useState('')
  const [chapter, setChapter] = useState('')
  const [comment, setComment] = useState('')
  const [tags, setTags] = useState('')
  const [source, setSource] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setText(quote?.text ?? '')
    setPage(quote?.page != null ? String(quote.page) : '')
    setChapter(quote?.chapter ?? '')
    setComment(quote?.comment ?? '')
    setTags(quote?.tags.join(', ') ?? '')
    setSource(quote?.bookId ?? bookId ?? '')
    setError(null)
  }, [open, quote, bookId])

  const save = async () => {
    if (!text.trim()) {
      setError('Add the quote text.')
      return
    }
    setSaving(true)
    try {
      const parsedPage = page ? Number.parseInt(page, 10) : null
      const payload = {
        text,
        page: Number.isFinite(parsedPage) ? parsedPage : null,
        chapter: chapter.trim() || null,
        comment: comment.trim() || null,
        bookId: source || null,
        tags: tags
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean),
      }
      if (quote) {
        await repo.updateQuote(profile.id, quote.id, payload)
      } else {
        await repo.createQuote(profile.id, payload)
      }
      bump('quotes', 'activity')
      onOpenChange(false)
      onSaved?.()
      toast.success(quote ? 'Quote updated' : 'Quote saved')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the quote.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={quote ? 'Edit quote' : 'Save a quote'}
        description="Capture the passage, where it came from, and why it stuck with you."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : 'Save quote'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Quote" required error={error}>
            {(props) => (
              <Textarea
                {...props}
                autoFocus
                rows={4}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="The passage, word for word."
                className="font-serif text-[15px]"
              />
            )}
          </Field>

          {books && (
            <Field label="From">
              {(props) => (
                <NativeSelect
                  {...props}
                  value={source}
                  onChange={(event) => setSource(event.target.value)}
                >
                  <option value="">No book</option>
                  {books.map((entry) => (
                    <option key={entry.book.id} value={entry.book.id}>
                      {entry.book.title}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Page">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={0}
                  value={page}
                  onChange={(event) => setPage(event.target.value)}
                />
              )}
            </Field>
            <Field label="Chapter">
              {(props) => (
                <Input
                  {...props}
                  value={chapter}
                  onChange={(event) => setChapter(event.target.value)}
                  placeholder="Chapter 4"
                />
              )}
            </Field>
          </div>

          <Field label="Your comment" hint="Why does this matter to you?">
            {(props) => (
              <Textarea
                {...props}
                rows={2}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
              />
            )}
          </Field>

          <Field label="Tags" hint="Comma separated">
            {(props) => (
              <Input
                {...props}
                value={tags}
                onChange={(event) => setTags(event.target.value)}
                placeholder="habits, important"
              />
            )}
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  )
}
