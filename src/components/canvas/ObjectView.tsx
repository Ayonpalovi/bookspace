import {
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Link as LinkIcon,
  Lock,
  Presentation,
  Sheet,
} from 'lucide-react'
import { memo, useEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import type { ShapeKind, SpaceObject } from '@/types/canvas'
import { useCanvasData } from './CanvasData'
import { strokePath } from './geometry'
import { cn, formatBytes, progressPercent } from '@/lib/utils'

/* ------------------------------------------------------------------ shapes */

function ShapeSvg({ kind, style }: { kind: ShapeKind; style: SpaceObject['style'] }) {
  const fill = style.fill ?? 'var(--surface)'
  const stroke = style.stroke ?? 'var(--border-strong)'
  const strokeWidth = style.strokeWidth ?? 2
  const common = {
    fill,
    stroke,
    strokeWidth,
    vectorEffect: 'non-scaling-stroke' as const,
  }
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {kind === 'rectangle' && <rect x="1" y="1" width="98" height="98" {...common} />}
      {kind === 'rounded' && (
        <rect x="1" y="1" width="98" height="98" rx="8" ry="8" {...common} />
      )}
      {kind === 'ellipse' && <ellipse cx="50" cy="50" rx="49" ry="49" {...common} />}
      {kind === 'triangle' && <polygon points="50,2 98,98 2,98" {...common} />}
      {kind === 'diamond' && <polygon points="50,1 99,50 50,99 1,50" {...common} />}
      {kind === 'star' && (
        <polygon
          points="50,2 61,38 99,38 68,60 79,96 50,74 21,96 32,60 1,38 39,38"
          {...common}
        />
      )}
    </svg>
  )
}

/* ------------------------------------------------------------ text editing */

function EditableText({
  value,
  editing,
  onChange,
  onDone,
  className,
  style,
  placeholder,
}: {
  value: string
  editing: boolean
  onChange: (value: string) => void
  onDone: () => void
  className?: string
  style?: CSSProperties
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  // The click that opens an editor finishes *after* the editor mounts, and the
  // browser then moves focus back to the canvas. Reclaim focus if it is taken
  // in that first instant; a genuine blur later still closes the editor.
  const openedAt = useRef(0)

  useEffect(() => {
    if (!editing) return
    const node = ref.current
    if (!node) return
    openedAt.current = Date.now()
    node.focus()
    node.setSelectionRange(node.value.length, node.value.length)
  }, [editing])

  if (editing) {
    return (
      <textarea
        ref={ref}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (Date.now() - openedAt.current < 200) {
            ref.current?.focus()
            return
          }
          onDone()
        }}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            onDone()
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        className={cn(
          'size-full resize-none bg-transparent outline-none',
          className,
        )}
        style={style}
        placeholder={placeholder}
      />
    )
  }

  return (
    <div
      className={cn('pointer-events-none size-full whitespace-pre-wrap break-words', className)}
      style={style}
    >
      {value || <span className="opacity-40">{placeholder}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------- cards */

function FileIcon({ mime, name }: { mime: string; name: string }) {
  const lower = name.toLowerCase()
  if (mime.startsWith('image/')) return <ImageIcon />
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) return <FileText />
  if (lower.endsWith('.ppt') || lower.endsWith('.pptx')) return <Presentation />
  if (lower.endsWith('.csv') || lower.endsWith('.xlsx')) return <Sheet />
  return <FileText />
}

/* ----------------------------------------------------------------- object */

export interface ObjectViewProps {
  object: SpaceObject
  selected: boolean
  editing: boolean
  onTextChange: (value: string) => void
  onEditDone: () => void
  onOpenFile?: (fileId: string) => void
}

function ObjectBody({
  object,
  editing,
  onTextChange,
  onEditDone,
  onOpenFile,
}: ObjectViewProps) {
  const data = useCanvasData()
  const style = object.style
  const text = (object.content.text as string) ?? ''

  const fontFamily =
    style.fontFamily === 'serif'
      ? 'var(--font-serif)'
      : style.fontFamily === 'mono'
        ? 'var(--font-mono)'
        : 'var(--font-sans)'

  const textStyle: CSSProperties = {
    color: style.color ?? 'var(--text)',
    fontSize: style.fontSize ?? 15,
    fontWeight: style.fontWeight ?? 400,
    fontStyle: style.fontStyle ?? 'normal',
    textDecoration: style.textDecoration ?? 'none',
    textAlign: style.align ?? 'left',
    lineHeight: style.lineHeight ?? 1.4,
    fontFamily,
  }

  switch (object.type) {
    case 'text':
      return (
        <EditableText
          value={text}
          editing={editing}
          onChange={onTextChange}
          onDone={onEditDone}
          style={textStyle}
          placeholder="Type something"
        />
      )

    case 'sticky':
      return (
        <div
          className="size-full rounded-[3px] p-3 shadow-[0_1px_2px_rgba(0,0,0,0.12),0_6px_14px_rgba(0,0,0,0.08)]"
          style={{ background: style.fill ?? '#FDE9A9' }}
        >
          <EditableText
            value={text}
            editing={editing}
            onChange={onTextChange}
            onDone={onEditDone}
            style={{ ...textStyle, color: style.color ?? '#4A3B12' }}
            placeholder="Note"
          />
        </div>
      )

    case 'shape':
      return (
        <>
          <ShapeSvg kind={style.shape ?? 'rectangle'} style={style} />
          <div className="relative flex size-full items-center justify-center p-3">
            <EditableText
              value={text}
              editing={editing}
              onChange={onTextChange}
              onDone={onEditDone}
              className="text-center"
              style={{ ...textStyle, textAlign: style.align ?? 'center' }}
              placeholder=""
            />
          </div>
        </>
      )

    case 'frame':
      return (
        <div
          className="size-full rounded-lg border-2 border-dashed"
          style={{
            borderColor: style.stroke ?? 'var(--border-strong)',
            background: style.fill && style.fill !== 'transparent' ? style.fill : 'transparent',
          }}
        />
      )

    case 'drawing': {
      const points = (object.content.points as { x: number; y: number }[]) ?? []
      return (
        <svg
          className="pointer-events-none absolute inset-0 size-full overflow-visible"
          viewBox={`0 0 ${Math.max(1, object.width)} ${Math.max(1, object.height)}`}
        >
          <path
            d={strokePath(points)}
            fill="none"
            stroke={style.stroke ?? 'var(--text)'}
            strokeWidth={style.strokeWidth ?? 3}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )
    }

    case 'image': {
      const fileId = object.content.fileId as string
      const url = data.blobUrls.get(fileId)
      return url ? (
        <img
          src={url}
          alt={(object.content.alt as string) ?? ''}
          draggable={false}
          className="pointer-events-none size-full rounded-md object-cover"
        />
      ) : (
        <div className="flex size-full items-center justify-center rounded-md border border-border bg-surface-sunken text-text-faint">
          <ImageIcon className="size-5" />
        </div>
      )
    }

    case 'file': {
      const fileId = object.content.fileId as string
      const file = data.files.get(fileId)
      const preview = file?.previewUrl
      return (
        <div className="flex size-full flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-[var(--shadow-sm)]">
          {preview ? (
            <img
              src={preview}
              alt=""
              draggable={false}
              className="pointer-events-none min-h-0 flex-1 object-cover object-top"
            />
          ) : (
            <div className="flex min-h-0 flex-1 items-center justify-center bg-surface-sunken text-text-faint [&_svg]:size-7">
              <FileIcon mime={file?.mimeType ?? ''} name={file?.name ?? ''} />
            </div>
          )}
          <div className="shrink-0 border-t border-border p-2">
            <p className="truncate text-[12px] font-medium text-text">
              {file?.name ?? 'Missing file'}
            </p>
            <div className="mt-0.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-text-faint">
                {file ? formatBytes(file.size) : '—'}
                {file?.pageCount ? ` · ${file.pageCount} pages` : ''}
              </span>
              {file && (
                <button
                  type="button"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    onOpenFile?.(fileId)
                  }}
                  className="rounded px-1.5 py-0.5 text-[10px] font-medium text-accent hover:bg-accent-subtle"
                >
                  Open
                </button>
              )}
            </div>
          </div>
        </div>
      )
    }

    case 'link': {
      const url = (object.content.url as string) ?? ''
      let host = url
      try {
        host = new URL(url).hostname.replace(/^www\./, '')
      } catch {
        host = url
      }
      return (
        <div className="flex size-full flex-col justify-between overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
          <div className="flex items-start gap-2">
            <LinkIcon className="mt-0.5 size-3.5 shrink-0 text-text-faint" />
            <p className="line-clamp-2 text-[13px] font-medium leading-snug text-text">
              {(object.content.title as string) || host}
            </p>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="truncate text-[11px] text-text-faint">{host}</span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-subtle"
            >
              Open <ExternalLink className="size-3" />
            </a>
          </div>
        </div>
      )
    }

    case 'table': {
      const rows = (object.content.rows as string[][]) ?? [['', '']]
      return (
        <div className="size-full overflow-hidden rounded-lg border border-border bg-surface">
          <table className="size-full border-collapse text-[12px]">
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td
                      key={cellIndex}
                      className={cn(
                        'border border-border px-2 py-1 align-top',
                        rowIndex === 0 && 'bg-surface-sunken font-semibold',
                      )}
                    >
                      <span className="line-clamp-2">{cell}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    }

    case 'book_card': {
      const entry = data.books.get(object.content.bookId as string)
      if (!entry) {
        return (
          <div className="flex size-full items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-text-faint">
            Book not in library
          </div>
        )
      }
      const percent = progressPercent(entry.userBook.currentPage, entry.book.pageCount)
      return (
        <div className="flex size-full flex-col overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
          <div
            className="mb-2 min-h-0 flex-1 overflow-hidden rounded"
            style={{ background: 'var(--surface-sunken)' }}
          >
            {entry.book.coverUrl ? (
              <img
                src={entry.book.coverUrl}
                alt=""
                draggable={false}
                className="pointer-events-none size-full object-cover"
              />
            ) : (
              <div className="flex size-full items-center justify-center p-2 text-center font-serif text-[13px] leading-tight text-text-muted">
                {entry.book.title}
              </div>
            )}
          </div>
          <p className="truncate text-[13px] font-medium text-text">{entry.book.title}</p>
          <p className="truncate text-[11px] text-text-faint">
            {entry.book.authors.join(', ') || 'Unknown author'}
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px] text-text-muted">
            {entry.userBook.rating ? <span>★ {entry.userBook.rating}</span> : null}
            {entry.book.pageCount ? <span>{percent}% read</span> : null}
          </div>
        </div>
      )
    }

    case 'note_card': {
      const note = data.notes.get(object.content.noteId as string)
      if (!note) {
        return (
          <div className="flex size-full items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-text-faint">
            Note deleted
          </div>
        )
      }
      return (
        <div className="flex size-full flex-col overflow-hidden rounded-lg border border-border bg-surface p-3 shadow-[var(--shadow-sm)]">
          <p className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-faint">
            <FileText className="size-3" /> Note
          </p>
          <p className="truncate text-[13px] font-medium text-text">
            {note.title || 'Untitled note'}
          </p>
          <p className="mt-1 min-h-0 flex-1 overflow-hidden text-[11px] leading-relaxed text-text-muted">
            {note.body.replace(/[#*_>`-]/g, '').slice(0, 240)}
          </p>
        </div>
      )
    }

    case 'quote_card': {
      const quote = data.quotes.get(object.content.quoteId as string)
      if (!quote) {
        return (
          <div className="flex size-full items-center justify-center rounded-lg border border-dashed border-border text-[12px] text-text-faint">
            Quote deleted
          </div>
        )
      }
      const book = quote.bookId ? data.books.get(quote.bookId) : null
      return (
        <div
          className="flex size-full flex-col justify-between overflow-hidden rounded-lg border border-border p-4 shadow-[var(--shadow-sm)]"
          style={{ background: style.fill ?? 'var(--surface)' }}
        >
          <p className="overflow-hidden font-serif text-[15px] leading-snug text-text">
            <span className="text-text-faint">“</span>
            {quote.text}
            <span className="text-text-faint">”</span>
          </p>
          <p className="mt-2 shrink-0 truncate text-[11px] text-text-faint">
            {book?.book.title ?? 'Unknown source'}
            {quote.page != null ? ` · p. ${quote.page}` : ''}
          </p>
        </div>
      )
    }

    default:
      return null
  }
}

/**
 * One canvas object. Memoized on identity — the store replaces objects
 * immutably, so an unchanged object never re-renders during a drag of others.
 */
export const ObjectView = memo(function ObjectView(props: ObjectViewProps) {
  const { object, selected } = props

  // Connectors live in a single SVG layer, not as positioned boxes.
  if (object.type === 'connector' || object.hidden) return null

  return (
    <div
      data-object-id={object.id}
      className={cn(
        'absolute',
        object.locked ? 'cursor-default' : 'cursor-move',
        object.type === 'frame' && 'pointer-events-none',
      )}
      style={{
        left: object.x,
        top: object.y,
        width: object.width,
        height: object.height,
        transform: object.rotation ? `rotate(${object.rotation}deg)` : undefined,
        zIndex: object.zIndex,
        opacity: object.style.opacity ?? 1,
      }}
    >
      {object.type === 'frame' && (
        <div className="pointer-events-auto absolute -top-6 left-0 flex items-center gap-1 text-[12px] font-medium text-text-muted">
          {object.locked && <Lock className="size-3" />}
          <span className="max-w-64 truncate">
            {(object.content.title as string) || 'Frame'}
          </span>
        </div>
      )}
      {/* A frame's body stays click-through so objects inside it stay reachable;
          it is selected by its title chip or its edge handles instead. */}
      <div className="size-full">
        <ObjectBody {...props} />
      </div>
      {selected && object.locked && (
        <span className="absolute right-1 top-1 rounded bg-black/50 p-0.5 text-white">
          <Lock className="size-3" />
        </span>
      )}
    </div>
  )
})
