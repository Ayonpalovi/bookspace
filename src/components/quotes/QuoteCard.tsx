import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '@/components/ui/primitives'
import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { AddToSpaceDialog } from '@/components/canvas/AddToSpaceDialog'
import { useState } from 'react'
import type { Book, Quote } from '@/types'
import { formatDate } from '@/lib/utils'

export function QuoteCard({
  quote,
  book,
  onEdit,
  onDelete,
  showSource = true,
}: {
  quote: Quote
  book?: Pick<Book, 'id' | 'title' | 'authors'> | null
  onEdit?: () => void
  onDelete?: () => void
  showSource?: boolean
}) {
  const [spaceOpen, setSpaceOpen] = useState(false)
  return (
    <Card className="group relative p-5">
      <blockquote className="font-serif text-[17px] leading-relaxed tracking-tight text-text">
        <span className="text-text-faint">“</span>
        {quote.text}
        <span className="text-text-faint">”</span>
      </blockquote>

      {quote.comment && (
        <p className="mt-3 border-l-2 border-border pl-3 text-[13px] leading-relaxed text-text-muted">
          {quote.comment}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text-faint">
        {showSource && book && (
          <Link
            to={`/books/${book.id}`}
            className="font-medium text-text-muted hover:text-accent hover:underline"
          >
            {book.title}
          </Link>
        )}
        {quote.page != null && <span>Page {quote.page}</span>}
        {quote.chapter && <span>{quote.chapter}</span>}
        <span>{formatDate(quote.createdAt)}</span>
        {quote.tags.map((tag) => (
          <Badge key={tag}>#{tag}</Badge>
        ))}
      </div>

      <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <Menu>
            <MenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="Quote actions">
                <MoreHorizontal />
              </Button>
            </MenuTrigger>
            <MenuContent align="end" className="w-48">
              <MenuItem onSelect={() => setSpaceOpen(true)}>
                <Plus /> Add to Space
              </MenuItem>
              {onEdit && (
                <MenuItem onSelect={onEdit}>
                  <Pencil /> Edit
                </MenuItem>
              )}
              {onDelete && (
                <MenuItem destructive onSelect={onDelete}>
                  <Trash2 /> Delete
                </MenuItem>
              )}
            </MenuContent>
          </Menu>
      </div>

      <AddToSpaceDialog
        open={spaceOpen}
        onOpenChange={setSpaceOpen}
        type="quote_card"
        content={{ quoteId: quote.id }}
        label={book?.title ? `${book.title} quotes` : 'Quotes'}
      />
    </Card>
  )
}
