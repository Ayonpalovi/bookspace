import { BookOpen, BookText, Quote as QuoteIcon, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Kbd, Spinner } from '@/components/ui/primitives'
import * as repo from '@/data/repository'
import type { SearchHit } from '@/data/repository'
import { useSession } from '@/stores/session'
import { cn } from '@/lib/utils'

const TYPE_ICON = {
  book: BookOpen,
  note: BookText,
  quote: QuoteIcon,
}

const TYPE_LABEL = {
  book: 'Book',
  note: 'Note',
  quote: 'Quote',
}

export function SearchDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const userId = useSession((s) => s.profile?.id)
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<SearchHit[]>([])
  const [loading, setLoading] = useState(false)
  const [cursor, setCursor] = useState(0)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setHits([])
      setCursor(0)
    }
  }, [open])

  useEffect(() => {
    if (!userId || !query.trim()) {
      setHits([])
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(() => {
      repo
        .search(userId, query)
        .then((results) => {
          if (cancelled) return
          setHits(results)
          setCursor(0)
        })
        .finally(() => !cancelled && setLoading(false))
    }, 120)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, userId])

  const grouped = useMemo(() => hits.slice(0, 12), [hits])

  const go = (hit: SearchHit) => {
    onOpenChange(false)
    navigate(hit.path)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Search BookSpace"
        hideTitle
        size="md"
        className="top-[18%] translate-y-0"
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setCursor((c) => Math.min(c + 1, grouped.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
          } else if (event.key === 'Enter' && grouped[cursor]) {
            event.preventDefault()
            go(grouped[cursor])
          }
        }}
      >
        <div className="-m-6">
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="size-4 shrink-0 text-text-faint" />
            <DialogPrimitive.Title className="sr-only">Search</DialogPrimitive.Title>
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search books, notes and quotes…"
              className="h-12 w-full bg-transparent text-[15px] text-text placeholder:text-text-faint focus:outline-none"
            />
            {loading && <Spinner />}
          </div>

          <div className="max-h-80 overflow-y-auto p-2">
            {!query.trim() && (
              <p className="px-2 py-6 text-center text-[13px] text-text-faint">
                Start typing to search across your library, notes and quotes.
              </p>
            )}
            {query.trim() && !loading && !grouped.length && (
              <p className="px-2 py-6 text-center text-[13px] text-text-faint">
                Nothing matched “{query}”.
              </p>
            )}
            {grouped.map((hit, index) => {
              const Icon = TYPE_ICON[hit.type]
              return (
                <button
                  key={`${hit.type}-${hit.id}`}
                  type="button"
                  onMouseEnter={() => setCursor(index)}
                  onClick={() => go(hit)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors',
                    index === cursor ? 'bg-surface-hover' : 'hover:bg-surface-hover',
                  )}
                >
                  <Icon className="size-4 shrink-0 text-text-faint" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text">{hit.title}</span>
                    {hit.subtitle && (
                      <span className="block truncate text-xs text-text-faint">
                        {hit.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] text-text-faint">
                    {TYPE_LABEL[hit.type]}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center gap-3 border-t border-border bg-bg-subtle px-4 py-2 text-[11px] text-text-faint">
            <span className="flex items-center gap-1">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd> navigate
            </span>
            <span className="flex items-center gap-1">
              <Kbd>↵</Kbd> open
            </span>
            <span className="flex items-center gap-1">
              <Kbd>esc</Kbd> close
            </span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
