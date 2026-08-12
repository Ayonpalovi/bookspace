import { Fragment, type ReactNode } from 'react'

/**
 * A deliberately small Markdown subset renderer for note previews.
 *
 * It renders to React elements rather than HTML strings, so note content can
 * never inject markup — no `dangerouslySetInnerHTML` anywhere in the app.
 *
 * Supported: headings, bold, italic, inline code, links, images, blockquotes,
 * bullet/numbered lists, task lists, horizontal rules.
 */

const INLINE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|`[^`]+`|!?\[[^\]]*\]\([^)]+\))/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts = text.split(INLINE).filter((part) => part !== '')
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (/^\*\*[^*]+\*\*$/.test(part) || /^__[^_]+__$/.test(part)) {
      return (
        <strong key={key} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      )
    }
    if (/^\*[^*]+\*$/.test(part) || /^_[^_]+_$/.test(part)) {
      return (
        <em key={key} className="italic">
          {part.slice(1, -1)}
        </em>
      )
    }
    if (/^`[^`]+`$/.test(part)) {
      return (
        <code
          key={key}
          className="rounded bg-surface-sunken px-1 py-0.5 font-mono text-[0.85em]"
        >
          {part.slice(1, -1)}
        </code>
      )
    }
    const image = part.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (image) {
      const href = image[2]
      if (!/^https?:\/\//i.test(href)) return <Fragment key={key}>{part}</Fragment>
      return (
        <img
          key={key}
          src={href}
          alt={image[1]}
          className="my-2 max-w-full rounded-lg border border-border"
        />
      )
    }
    const link = part.match(/^\[([^\]]*)\]\(([^)]+)\)$/)
    if (link) {
      const href = link[2]
      // Only http(s) links are rendered as links; anything else stays as text.
      if (!/^https?:\/\//i.test(href)) return <Fragment key={key}>{part}</Fragment>
      return (
        <a
          key={key}
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          className="text-accent underline underline-offset-2"
        >
          {link[1] || href}
        </a>
      )
    }
    return <Fragment key={key}>{part}</Fragment>
  })
}

export function Markdown({ source }: { source: string }) {
  const lines = source.split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushList = (key: string) => {
    if (!list) return
    const { ordered, items } = list
    const ListTag = ordered ? 'ol' : 'ul'
    blocks.push(
      <ListTag
        key={key}
        className={
          ordered
            ? 'my-3 list-decimal space-y-1 pl-5 marker:text-text-faint'
            : 'my-3 list-disc space-y-1 pl-5 marker:text-text-faint'
        }
      >
        {items.map((item, index) => {
          const task = item.match(/^\[([ xX])\]\s+(.*)$/)
          if (task) {
            return (
              <li key={index} className="list-none -ml-5 flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={task[1].toLowerCase() === 'x'}
                  readOnly
                  className="mt-1 size-3.5 accent-[var(--accent)]"
                />
                <span>{renderInline(task[2], `t-${index}`)}</span>
              </li>
            )
          }
          return <li key={index}>{renderInline(item, `i-${index}`)}</li>
        })}
      </ListTag>,
    )
    list = null
  }

  lines.forEach((raw, index) => {
    const line = raw.trimEnd()
    const key = `b-${index}`

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/)

    if (bullet) {
      if (list && list.ordered) flushList(`${key}-flush`)
      list ??= { ordered: false, items: [] }
      list.items.push(bullet[1])
      return
    }
    if (numbered) {
      if (list && !list.ordered) flushList(`${key}-flush`)
      list ??= { ordered: true, items: [] }
      list.items.push(numbered[1])
      return
    }
    flushList(`${key}-flush`)

    if (!line.trim()) return

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading) {
      const level = heading[1].length
      const sizes = ['text-xl', 'text-lg', 'text-base', 'text-sm']
      const Tag = (['h2', 'h3', 'h4', 'h5'] as const)[level - 1]
      blocks.push(
        <Tag
          key={key}
          className={`mt-5 mb-2 font-serif tracking-tight ${sizes[level - 1]}`}
        >
          {renderInline(heading[2], key)}
        </Tag>,
      )
      return
    }

    if (/^>\s?/.test(line)) {
      blocks.push(
        <blockquote
          key={key}
          className="my-3 border-l-2 border-border pl-3 font-serif text-[15px] italic text-text-muted"
        >
          {renderInline(line.replace(/^>\s?/, ''), key)}
        </blockquote>,
      )
      return
    }

    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      blocks.push(<hr key={key} className="my-6 border-border" />)
      return
    }

    blocks.push(
      <p key={key} className="my-2.5 leading-relaxed">
        {renderInline(line, key)}
      </p>,
    )
  })

  flushList('final')

  return <div className="text-[15px] text-text">{blocks}</div>
}
