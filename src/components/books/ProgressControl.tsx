import { Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { ProgressBar } from '@/components/ui/primitives'
import { toast } from '@/components/ui/toast'
import * as repo from '@/data/repository'
import { bump } from '@/stores/data'
import { useSession } from '@/stores/session'
import { progressPercent, relativeTime } from '@/lib/utils'
import type { Book, UserBook } from '@/types'

/**
 * Quick progress entry. Used on the dashboard and the book page so the user can
 * log pages without navigating anywhere.
 */
export function ProgressControl({
  book,
  userBook,
  onUpdated,
  compact = false,
}: {
  book: Book
  userBook: UserBook
  onUpdated?: (next: UserBook) => void
  compact?: boolean
}) {
  const profile = useSession((s) => s.profile)!
  const [page, setPage] = useState(String(userBook.currentPage))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setPage(String(userBook.currentPage))
  }, [userBook.currentPage])

  const percent = progressPercent(userBook.currentPage, book.pageCount)
  const parsed = Number.parseInt(page, 10)
  const dirty = Number.isFinite(parsed) && parsed !== userBook.currentPage

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      const next = await repo.updateProgress(profile.id, book.id, parsed)
      bump('library', 'activity')
      onUpdated?.(next)
      if (next.status === 'finished' && userBook.status !== 'finished') {
        toast.success(`Finished ${book.title}`, 'Moved to your Finished shelf.')
      }
    } catch (caught) {
      toast.error(
        'Progress not saved',
        caught instanceof Error ? caught.message : undefined,
      )
      setPage(String(userBook.currentPage))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-1.5 text-[13px]">
          <span className="font-medium text-text">
            Page {userBook.currentPage}
            {book.pageCount ? (
              <span className="text-text-faint"> / {book.pageCount}</span>
            ) : null}
          </span>
          {book.pageCount ? (
            <span className="text-text-faint">· {percent}%</span>
          ) : null}
        </div>
        {!compact && (
          <span className="text-[11px] text-text-faint">
            Updated {relativeTime(userBook.updatedAt)}
          </span>
        )}
      </div>

      <ProgressBar value={percent} label={`${percent}% of ${book.title} read`} />

      <div className="flex items-center gap-1.5 pt-0.5">
        <Input
          type="number"
          min={0}
          max={book.pageCount ?? undefined}
          value={page}
          onChange={(event) => setPage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void save()
          }}
          className="h-8 w-24"
          aria-label={`Current page in ${book.title}`}
        />
        <Button
          size="sm"
          variant={dirty ? 'primary' : 'secondary'}
          disabled={!dirty || saving}
          onClick={save}
        >
          <Check /> {saving ? 'Saving…' : 'Update'}
        </Button>
        {book.pageCount && userBook.currentPage < book.pageCount && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setPage(String(book.pageCount))}
          >
            Finished it
          </Button>
        )}
      </div>
    </div>
  )
}
