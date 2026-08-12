import { Pin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge, Card } from '@/components/ui/primitives'
import type { Book, Note } from '@/types'
import { NOTE_KIND_LABEL } from '@/types'
import { relativeTime } from '@/lib/utils'

export function NoteCard({
  note,
  book,
}: {
  note: Note
  book?: Pick<Book, 'id' | 'title'> | null
}) {
  const preview = note.body.replace(/[#*_>`-]/g, '').trim()
  return (
    <Card className="transition-colors hover:border-border-strong">
      <Link to={`/notes/${note.id}`} className="block p-4">
        <div className="flex items-start gap-2">
          <h3 className="min-w-0 flex-1 truncate text-sm font-medium text-text">
            {note.title || 'Untitled note'}
          </h3>
          {note.isPinned && <Pin className="size-3.5 shrink-0 text-text-faint" />}
        </div>

        {preview && (
          <p className="mt-2 line-clamp-3 text-[13px] leading-relaxed text-text-muted">
            {preview}
          </p>
        )}

        <div className="mt-3.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-[11px] text-text-faint">
          <Badge>{NOTE_KIND_LABEL[note.kind]}</Badge>
          {book && <span className="truncate font-medium">{book.title}</span>}
          {note.chapter && <span>{note.chapter}</span>}
          <span>{relativeTime(note.updatedAt)}</span>
          {note.tags.slice(0, 3).map((tag) => (
            <Badge key={tag}>#{tag}</Badge>
          ))}
        </div>
      </Link>
    </Card>
  )
}
