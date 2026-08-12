import { Heart } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BookCover } from './BookCover'
import { Badge, ProgressBar, StarRating } from '@/components/ui/primitives'
import type { LibraryEntry } from '@/types'
import { STATUS_SHORT_LABEL } from '@/types'
import { cn, relativeTime } from '@/lib/utils'

const STATUS_TONE = {
  reading: 'accent',
  finished: 'success',
  want_to_read: 'neutral',
  dnf: 'outline',
} as const

export function BookCard({ entry }: { entry: LibraryEntry }) {
  const { book, userBook, percent } = entry
  return (
    <Link
      to={`/books/${book.id}`}
      className="group flex flex-col gap-3 rounded-xl p-2 transition-colors hover:bg-surface-hover"
    >
      <div className="relative">
        <BookCover book={book} className="transition-transform group-hover:-translate-y-0.5" />
        {userBook.isFavorite && (
          <span className="absolute bottom-1.5 right-1.5 rounded-full bg-black/45 p-1 text-white backdrop-blur-sm">
            <Heart className="size-3 fill-current" />
          </span>
        )}
      </div>

      <div className="min-w-0 space-y-1.5">
        <p className="truncate text-[13px] font-medium leading-snug text-text">
          {book.title}
        </p>
        <p className="truncate text-xs text-text-faint">
          {book.authors.join(', ') || 'Unknown author'}
        </p>

        {userBook.status === 'reading' ? (
          <div className="space-y-1 pt-0.5">
            <ProgressBar value={percent} size="sm" label={`${percent}% read`} />
            <p className="text-[11px] text-text-faint">
              {percent}% · page {userBook.currentPage}
              {book.pageCount ? ` of ${book.pageCount}` : ''}
            </p>
          </div>
        ) : userBook.rating ? (
          <StarRating value={userBook.rating} size={12} />
        ) : (
          <Badge tone={STATUS_TONE[userBook.status]}>
            {STATUS_SHORT_LABEL[userBook.status]}
          </Badge>
        )}
      </div>
    </Link>
  )
}

export function BookRow({ entry }: { entry: LibraryEntry }) {
  const { book, userBook, percent } = entry
  return (
    <Link
      to={`/books/${book.id}`}
      className="flex items-center gap-4 rounded-xl border border-transparent px-3 py-2.5 transition-colors hover:border-border hover:bg-surface-hover"
    >
      <BookCover book={book} className="w-10" rounded="rounded-sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-text">{book.title}</p>
        <p className="truncate text-xs text-text-faint">
          {book.authors.join(', ') || 'Unknown author'}
          {book.pageCount ? ` · ${book.pageCount} pages` : ''}
        </p>
      </div>
      <div className="hidden w-32 shrink-0 sm:block">
        {userBook.status === 'reading' ? (
          <div className="space-y-1">
            <ProgressBar value={percent} size="sm" label={`${percent}% read`} />
            <p className="text-[11px] text-text-faint">{percent}%</p>
          </div>
        ) : (
          <Badge tone={STATUS_TONE[userBook.status]}>
            {STATUS_SHORT_LABEL[userBook.status]}
          </Badge>
        )}
      </div>
      <div className="hidden w-24 shrink-0 md:block">
        {userBook.rating ? (
          <StarRating value={userBook.rating} size={13} />
        ) : (
          <span className="text-xs text-text-faint">—</span>
        )}
      </div>
      <div
        className={cn(
          'hidden w-24 shrink-0 text-right text-xs text-text-faint lg:block',
        )}
      >
        {relativeTime(userBook.lastOpenedAt ?? userBook.dateAdded)}
      </div>
    </Link>
  )
}
