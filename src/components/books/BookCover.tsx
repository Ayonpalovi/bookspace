import { useState } from 'react'
import type { Book } from '@/types'
import { cn, hashIndex } from '@/lib/utils'

/**
 * Covers are optional. When one is missing we render a typographic placeholder
 * rather than a grey box — it keeps the library legible and looks deliberate.
 */
const PALETTE = [
  { bg: 'oklch(32% 0.05 250)', fg: 'oklch(93% 0.02 250)' },
  { bg: 'oklch(34% 0.05 155)', fg: 'oklch(93% 0.02 155)' },
  { bg: 'oklch(36% 0.06 60)', fg: 'oklch(95% 0.02 60)' },
  { bg: 'oklch(33% 0.06 20)', fg: 'oklch(94% 0.02 20)' },
  { bg: 'oklch(32% 0.06 320)', fg: 'oklch(94% 0.02 320)' },
  { bg: 'oklch(28% 0.02 260)', fg: 'oklch(92% 0.01 260)' },
]

export function BookCover({
  book,
  className,
  rounded = 'rounded-md',
}: {
  book: Pick<Book, 'title' | 'authors' | 'coverUrl'>
  className?: string
  rounded?: string
}) {
  const [failed, setFailed] = useState(false)
  const tone = PALETTE[hashIndex(book.title, PALETTE.length)]
  const showImage = book.coverUrl && !failed

  return (
    <div
      className={cn(
        'relative aspect-[2/3] w-full shrink-0 overflow-hidden border border-black/10 shadow-[var(--shadow-sm)] [container-type:inline-size]',
        rounded,
        className,
      )}
      style={showImage ? undefined : { backgroundColor: tone.bg, color: tone.fg }}
    >
      {showImage ? (
        <img
          src={book.coverUrl ?? undefined}
          alt={`Cover of ${book.title}`}
          loading="lazy"
          onError={() => setFailed(true)}
          className="size-full object-cover"
        />
      ) : (
        <div className="flex size-full flex-col justify-between p-[8%]">
          <span
            className="font-serif leading-tight tracking-tight"
            style={{ fontSize: 'clamp(9px, 13cqw, 20px)' }}
          >
            {book.title}
          </span>
          <span
            className="truncate text-[0.65em] uppercase tracking-widest opacity-70"
            style={{ fontSize: 'clamp(6px, 6cqw, 10px)' }}
          >
            {book.authors[0] ?? ''}
          </span>
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3%] bg-black/20"
          />
        </div>
      )}
    </div>
  )
}
