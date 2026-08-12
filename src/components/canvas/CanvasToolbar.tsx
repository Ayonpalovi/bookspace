import {
  Circle,
  Eraser,
  Frame,
  Hand,
  Image as ImageIcon,
  Lasso,
  MousePointer2,
  Pen,
  Redo2,
  Share2,
  Square,
  StickyNote,
  Table,
  Type,
  Undo2,
  Upload,
} from 'lucide-react'
import type { ComponentType } from 'react'
import { useCanvas, type Tool } from '@/stores/canvas'
import { cn } from '@/lib/utils'

interface ToolSpec {
  tool: Tool
  label: string
  icon: ComponentType<{ className?: string }>
  shortcut: string
}

const TOOLS: ToolSpec[] = [
  { tool: 'select', label: 'Select', icon: MousePointer2, shortcut: 'V' },
  { tool: 'hand', label: 'Hand', icon: Hand, shortcut: 'H' },
  { tool: 'lasso', label: 'Lasso select', icon: Lasso, shortcut: 'Q' },
  { tool: 'text', label: 'Text', icon: Type, shortcut: 'T' },
  { tool: 'sticky', label: 'Sticky note', icon: StickyNote, shortcut: 'N' },
  { tool: 'shape', label: 'Shape', icon: Square, shortcut: 'R' },
  { tool: 'connector', label: 'Connector', icon: Share2, shortcut: 'C' },
  { tool: 'pen', label: 'Pen', icon: Pen, shortcut: 'P' },
  { tool: 'eraser', label: 'Eraser', icon: Eraser, shortcut: 'E' },
  { tool: 'frame', label: 'Frame', icon: Frame, shortcut: 'F' },
  { tool: 'table', label: 'Table', icon: Table, shortcut: 'B' },
]

export function CanvasToolbar({
  onUpload,
  onInsertImage,
}: {
  onUpload: () => void
  onInsertImage: () => void
}) {
  const tool = useCanvas((s) => s.tool)
  const setTool = useCanvas((s) => s.setTool)
  const undo = useCanvas((s) => s.undo)
  const redo = useCanvas((s) => s.redo)
  const canUndo = useCanvas((s) => s.past.length > 0)
  const canRedo = useCanvas((s) => s.future.length > 0)

  return (
    <div
      role="toolbar"
      aria-label="Canvas tools"
      className="pointer-events-auto flex items-center gap-0.5 rounded-xl border border-border bg-surface p-1 shadow-[var(--shadow-lg)]"
    >
      {TOOLS.map((spec) => {
        const Icon = spec.icon
        const active = tool === spec.tool
        return (
          <button
            key={spec.tool}
            type="button"
            aria-label={spec.label}
            aria-pressed={active}
            title={`${spec.label} (${spec.shortcut})`}
            onClick={() => setTool(spec.tool)}
            className={cn(
              'flex size-8 items-center justify-center rounded-lg transition-colors',
              active
                ? 'bg-accent text-accent-fg'
                : 'text-text-muted hover:bg-surface-hover hover:text-text',
            )}
          >
            <Icon className="size-4" />
          </button>
        )
      })}

      <span className="mx-1 h-6 w-px bg-border" aria-hidden />

      <button
        type="button"
        aria-label="Insert image"
        title="Insert image"
        onClick={onInsertImage}
        className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        <ImageIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Upload file"
        title="Upload a file"
        onClick={onUpload}
        className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text"
      >
        <Upload className="size-4" />
      </button>

      <span className="mx-1 h-6 w-px bg-border" aria-hidden />

      <button
        type="button"
        aria-label="Undo"
        title="Undo (⌘Z)"
        disabled={!canUndo}
        onClick={undo}
        className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-35"
      >
        <Undo2 className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Redo"
        title="Redo (⌘⇧Z)"
        disabled={!canRedo}
        onClick={redo}
        className="flex size-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-surface-hover hover:text-text disabled:opacity-35"
      >
        <Redo2 className="size-4" />
      </button>
    </div>
  )
}

/** Shape picker shown when the shape tool is active. */
export function ShapeStrip() {
  const tool = useCanvas((s) => s.tool)
  if (tool !== 'shape') return null
  return (
    <div className="pointer-events-auto flex items-center gap-1 rounded-lg border border-border bg-surface px-2 py-1 text-[11px] text-text-muted shadow-[var(--shadow-md)]">
      <Square className="size-3" />
      <Circle className="size-3" />
      <span>Click the canvas to place a shape, then change its form in the panel.</span>
    </div>
  )
}
