import { useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { X } from 'lucide-react'
import { useCanvas } from '@/stores/canvas'
import { boundsOf } from './geometry'

const WIDTH = 190
const HEIGHT = 130
const PADDING = 10

const TYPE_COLOR: Record<string, string> = {
  sticky: 'var(--warning)',
  frame: 'var(--border-strong)',
  image: 'var(--success)',
  file: 'var(--success)',
  book_card: 'var(--accent)',
  note_card: 'var(--accent)',
  quote_card: 'var(--accent)',
}

/**
 * Overview of the whole board with a draggable viewport rectangle.
 * The projection covers the content bounds unioned with the current viewport,
 * so the indicator stays visible even when panned far off into empty canvas.
 */
export function Minimap({ stageSize }: { stageSize: { width: number; height: number } }) {
  const ref = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const objects = useCanvas((s) => s.objects)
  const viewport = useCanvas((s) => s.viewport)
  const setViewport = useCanvas((s) => s.setViewport)
  const toggleMinimap = useCanvas((s) => s.toggleMinimap)

  const viewRect = {
    x: viewport.x,
    y: viewport.y,
    width: stageSize.width / viewport.zoom,
    height: stageSize.height / viewport.zoom,
  }

  const content = boundsOf(objects.filter((o) => o.type !== 'connector'))
  const world = content
    ? {
        x: Math.min(content.x, viewRect.x),
        y: Math.min(content.y, viewRect.y),
        width:
          Math.max(content.x + content.width, viewRect.x + viewRect.width) -
          Math.min(content.x, viewRect.x),
        height:
          Math.max(content.y + content.height, viewRect.y + viewRect.height) -
          Math.min(content.y, viewRect.y),
      }
    : viewRect

  const scale = Math.min(
    (WIDTH - PADDING * 2) / Math.max(1, world.width),
    (HEIGHT - PADDING * 2) / Math.max(1, world.height),
  )
  const offsetX = PADDING + (WIDTH - PADDING * 2 - world.width * scale) / 2
  const offsetY = PADDING + (HEIGHT - PADDING * 2 - world.height * scale) / 2

  const project = (x: number, y: number) => ({
    left: offsetX + (x - world.x) * scale,
    top: offsetY + (y - world.y) * scale,
  })

  const centreOn = (event: { clientX: number; clientY: number }) => {
    const rect = ref.current!.getBoundingClientRect()
    const worldX = (event.clientX - rect.left - offsetX) / scale + world.x
    const worldY = (event.clientY - rect.top - offsetY) / scale + world.y
    setViewport({
      ...viewport,
      x: worldX - stageSize.width / (2 * viewport.zoom),
      y: worldY - stageSize.height / (2 * viewport.zoom),
    })
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = true
    ref.current?.setPointerCapture(event.pointerId)
    centreOn(event)
  }

  return (
    <div className="pointer-events-auto overflow-hidden rounded-xl border border-border bg-surface shadow-[var(--shadow-lg)]">
      <div className="flex items-center justify-between border-b border-border px-2 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
          Overview
        </span>
        <button
          type="button"
          aria-label="Hide minimap"
          onClick={toggleMinimap}
          className="rounded p-0.5 text-text-faint hover:text-text"
        >
          <X className="size-3" />
        </button>
      </div>
      <div
        ref={ref}
        role="presentation"
        onPointerDown={onPointerDown}
        onPointerMove={(event) => dragging.current && centreOn(event)}
        onPointerUp={(event) => {
          dragging.current = false
          try {
            ref.current?.releasePointerCapture(event.pointerId)
          } catch {
            // Pointer may have left the window mid-drag.
          }
        }}
        className="relative cursor-pointer bg-bg-subtle"
        style={{ width: WIDTH, height: HEIGHT }}
      >
        {objects
          .filter((o) => o.type !== 'connector' && !o.hidden)
          .map((object) => {
            const position = project(object.x, object.y)
            return (
              <div
                key={object.id}
                className="absolute rounded-[1px]"
                style={{
                  ...position,
                  width: Math.max(2, object.width * scale),
                  height: Math.max(2, object.height * scale),
                  background: TYPE_COLOR[object.type] ?? 'var(--text-faint)',
                  opacity: object.type === 'frame' ? 0.25 : 0.75,
                }}
              />
            )
          })}

        <div
          className="pointer-events-none absolute border-2 border-accent bg-[var(--accent-subtle)] opacity-60"
          style={{
            ...project(viewRect.x, viewRect.y),
            width: Math.max(6, viewRect.width * scale),
            height: Math.max(6, viewRect.height * scale),
          }}
        />
      </div>
    </div>
  )
}
