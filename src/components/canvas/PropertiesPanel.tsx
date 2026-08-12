import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignHorizontalSpaceAround,
  AlignStartHorizontal,
  AlignVerticalSpaceAround,
  Bold,
  Copy,
  Eye,
  EyeOff,
  Group,
  Italic,
  Lock,
  MoveDown,
  MoveUp,
  Trash2,
  Ungroup,
  Unlock,
  Underline,
} from 'lucide-react'
import { useMemo } from 'react'
import { useCanvas } from '@/stores/canvas'
import { SHAPE_PRESETS, STICKY_COLORS, type ShapeKind } from '@/types/canvas'
import { cn } from '@/lib/utils'

const SWATCHES = [
  'var(--surface)',
  '#E9EDF2',
  '#D7E4F5',
  '#D6EDDC',
  '#FBE7B3',
  '#F6D6D9',
  '#E1D8F3',
  'transparent',
]

const STROKES = ['var(--border-strong)', '#5B6B7C', '#2F6DB5', '#2F8C58', '#C08A16', '#B4515C']

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-text-faint">
        {label}
      </p>
      {children}
    </div>
  )
}

function IconButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex size-7 items-center justify-center rounded-md transition-colors [&_svg]:size-3.5',
        active
          ? 'bg-accent text-accent-fg'
          : 'text-text-muted hover:bg-surface-hover hover:text-text',
      )}
    >
      {children}
    </button>
  )
}

export function PropertiesPanel() {
  const objects = useCanvas((s) => s.objects)
  const selection = useCanvas((s) => s.selection)
  const update = useCanvas((s) => s.updateObjects)
  const reorder = useCanvas((s) => s.reorder)
  const group = useCanvas((s) => s.group)
  const ungroup = useCanvas((s) => s.ungroup)
  const toggleLock = useCanvas((s) => s.toggleLock)
  const toggleHidden = useCanvas((s) => s.toggleHidden)
  const align = useCanvas((s) => s.align)
  const duplicate = useCanvas((s) => s.duplicateSelection)
  const remove = useCanvas((s) => s.deleteSelection)

  const selected = useMemo(
    () => objects.filter((o) => selection.includes(o.id)),
    [objects, selection],
  )

  if (!selected.length) return null

  const first = selected[0]
  const types = new Set(selected.map((o) => o.type))
  const style = first.style

  const setStyle = (changes: Partial<typeof style>) =>
    update(
      selected.map((object) => ({
        id: object.id,
        changes: { style: { ...object.style, ...changes } },
      })),
      { history: true },
    )

  const anyLocked = selected.some((o) => o.locked)
  const anyHidden = selected.some((o) => o.hidden)
  const canGroup = selected.length > 1
  const canUngroup = selected.some((o) => o.groupId)
  const showFill = types.has('shape') || types.has('sticky') || types.has('frame') || types.has('quote_card')
  const showStroke = types.has('shape') || types.has('frame') || types.has('connector') || types.has('drawing')
  const showText =
    types.has('text') || types.has('sticky') || types.has('shape')
  const showShape = types.has('shape')
  const showConnector = types.has('connector')

  return (
    <aside
      aria-label="Object properties"
      className="pointer-events-auto flex max-h-[calc(100dvh-220px)] w-56 flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-surface p-3 shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-text">
          {selected.length === 1 ? LABELS[first.type] : `${selected.length} objects`}
        </p>
        <div className="flex gap-0.5">
          <IconButton label={anyLocked ? 'Unlock' : 'Lock'} onClick={() => toggleLock(selection)}>
            {anyLocked ? <Unlock /> : <Lock />}
          </IconButton>
          <IconButton
            label={anyHidden ? 'Show' : 'Hide'}
            onClick={() => toggleHidden(selection)}
          >
            {anyHidden ? <EyeOff /> : <Eye />}
          </IconButton>
        </div>
      </div>

      {showShape && (
        <Row label="Shape">
          <div className="grid grid-cols-3 gap-1">
            {SHAPE_PRESETS.map((preset) => (
              <button
                key={preset.kind}
                type="button"
                title={preset.label}
                onClick={() => setStyle({ shape: preset.kind as ShapeKind })}
                className={cn(
                  'rounded-md border px-1 py-1 text-[10px] transition-colors',
                  style.shape === preset.kind
                    ? 'border-accent bg-accent-subtle text-accent'
                    : 'border-border text-text-muted hover:border-border-strong',
                )}
              >
                {preset.label.split(' ')[0]}
              </button>
            ))}
          </div>
        </Row>
      )}

      {types.has('sticky') && (
        <Row label="Sticky colour">
          <div className="flex flex-wrap gap-1.5">
            {STICKY_COLORS.map((colour) => (
              <button
                key={colour.name}
                type="button"
                title={colour.name}
                aria-label={colour.name}
                onClick={() => setStyle({ fill: colour.fill, color: colour.text })}
                className={cn(
                  'size-5 rounded border transition-transform hover:scale-110',
                  style.fill === colour.fill ? 'border-accent' : 'border-black/10',
                )}
                style={{ background: colour.fill }}
              />
            ))}
          </div>
        </Row>
      )}

      {showFill && !types.has('sticky') && (
        <Row label="Fill">
          <div className="flex flex-wrap gap-1.5">
            {SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={swatch === 'transparent' ? 'No fill' : swatch}
                onClick={() => setStyle({ fill: swatch })}
                className={cn(
                  'size-5 rounded border transition-transform hover:scale-110',
                  style.fill === swatch ? 'border-accent' : 'border-black/10',
                  swatch === 'transparent' &&
                    'bg-[repeating-conic-gradient(var(--border)_0%_25%,transparent_0%_50%)] bg-[length:8px_8px]',
                )}
                style={swatch === 'transparent' ? undefined : { background: swatch }}
              />
            ))}
          </div>
        </Row>
      )}

      {showStroke && (
        <>
          <Row label="Stroke">
            <div className="flex flex-wrap gap-1.5">
              {STROKES.map((stroke) => (
                <button
                  key={stroke}
                  type="button"
                  aria-label={stroke}
                  onClick={() => setStyle({ stroke })}
                  className={cn(
                    'size-5 rounded border transition-transform hover:scale-110',
                    style.stroke === stroke ? 'border-accent' : 'border-black/10',
                  )}
                  style={{ background: stroke }}
                />
              ))}
            </div>
          </Row>
          <Row label={`Stroke width — ${style.strokeWidth ?? 2}px`}>
            <input
              type="range"
              min={1}
              max={12}
              value={style.strokeWidth ?? 2}
              onChange={(event) => setStyle({ strokeWidth: Number(event.target.value) })}
              className="w-full accent-[var(--accent)]"
              aria-label="Stroke width"
            />
          </Row>
        </>
      )}

      {showConnector && (
        <>
          <Row label="Line">
            <div className="grid grid-cols-3 gap-1">
              {(['straight', 'elbow', 'curved'] as const).map((shape) => (
                <button
                  key={shape}
                  type="button"
                  onClick={() => setStyle({ connector: shape })}
                  className={cn(
                    'rounded-md border px-1 py-1 text-[10px] capitalize transition-colors',
                    (style.connector ?? 'straight') === shape
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border text-text-muted hover:border-border-strong',
                  )}
                >
                  {shape}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Arrows">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setStyle({ arrowStart: !style.arrowStart })}
                className={cn(
                  'flex-1 rounded-md border px-1 py-1 text-[10px] transition-colors',
                  style.arrowStart
                    ? 'border-accent bg-accent-subtle text-accent'
                    : 'border-border text-text-muted',
                )}
              >
                Start
              </button>
              <button
                type="button"
                onClick={() => setStyle({ arrowEnd: style.arrowEnd === false })}
                className={cn(
                  'flex-1 rounded-md border px-1 py-1 text-[10px] transition-colors',
                  style.arrowEnd !== false
                    ? 'border-accent bg-accent-subtle text-accent'
                    : 'border-border text-text-muted',
                )}
              >
                End
              </button>
            </div>
          </Row>
        </>
      )}

      {showText && (
        <>
          <Row label={`Text size — ${style.fontSize ?? 15}px`}>
            <input
              type="range"
              min={10}
              max={72}
              value={style.fontSize ?? 15}
              onChange={(event) => setStyle({ fontSize: Number(event.target.value) })}
              className="w-full accent-[var(--accent)]"
              aria-label="Font size"
            />
          </Row>
          <Row label="Text">
            <div className="flex gap-0.5">
              <IconButton
                label="Bold"
                active={(style.fontWeight ?? 400) >= 600}
                onClick={() =>
                  setStyle({ fontWeight: (style.fontWeight ?? 400) >= 600 ? 400 : 600 })
                }
              >
                <Bold />
              </IconButton>
              <IconButton
                label="Italic"
                active={style.fontStyle === 'italic'}
                onClick={() =>
                  setStyle({ fontStyle: style.fontStyle === 'italic' ? 'normal' : 'italic' })
                }
              >
                <Italic />
              </IconButton>
              <IconButton
                label="Underline"
                active={style.textDecoration === 'underline'}
                onClick={() =>
                  setStyle({
                    textDecoration:
                      style.textDecoration === 'underline' ? 'none' : 'underline',
                  })
                }
              >
                <Underline />
              </IconButton>
              <span className="mx-0.5 w-px bg-border" aria-hidden />
              {(['left', 'center', 'right'] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  title={`Align ${value}`}
                  aria-label={`Align ${value}`}
                  onClick={() => setStyle({ align: value })}
                  className={cn(
                    'flex size-7 items-center justify-center rounded-md text-[10px] uppercase transition-colors',
                    (style.align ?? 'left') === value
                      ? 'bg-accent text-accent-fg'
                      : 'text-text-muted hover:bg-surface-hover',
                  )}
                >
                  {value[0]}
                </button>
              ))}
            </div>
          </Row>
          <Row label="Typeface">
            <div className="grid grid-cols-3 gap-1">
              {(['sans', 'serif', 'mono'] as const).map((family) => (
                <button
                  key={family}
                  type="button"
                  onClick={() => setStyle({ fontFamily: family })}
                  className={cn(
                    'rounded-md border px-1 py-1 text-[10px] capitalize transition-colors',
                    (style.fontFamily ?? 'sans') === family
                      ? 'border-accent bg-accent-subtle text-accent'
                      : 'border-border text-text-muted hover:border-border-strong',
                  )}
                >
                  {family}
                </button>
              ))}
            </div>
          </Row>
        </>
      )}

      <Row label={`Opacity — ${Math.round((style.opacity ?? 1) * 100)}%`}>
        <input
          type="range"
          min={10}
          max={100}
          value={Math.round((style.opacity ?? 1) * 100)}
          onChange={(event) => setStyle({ opacity: Number(event.target.value) / 100 })}
          className="w-full accent-[var(--accent)]"
          aria-label="Opacity"
        />
      </Row>

      {selected.length > 1 && (
        <Row label="Align">
          <div className="grid grid-cols-4 gap-0.5">
            <IconButton label="Align left" onClick={() => align('left')}>
              <AlignStartHorizontal className="rotate-90" />
            </IconButton>
            <IconButton label="Centre horizontally" onClick={() => align('center-x')}>
              <AlignCenterVertical />
            </IconButton>
            <IconButton label="Align right" onClick={() => align('right')}>
              <AlignEndHorizontal className="rotate-90" />
            </IconButton>
            <IconButton label="Distribute horizontally" onClick={() => align('dist-x')}>
              <AlignHorizontalSpaceAround />
            </IconButton>
            <IconButton label="Align top" onClick={() => align('top')}>
              <AlignStartHorizontal />
            </IconButton>
            <IconButton label="Centre vertically" onClick={() => align('center-y')}>
              <AlignCenterHorizontal />
            </IconButton>
            <IconButton label="Align bottom" onClick={() => align('bottom')}>
              <AlignEndHorizontal />
            </IconButton>
            <IconButton label="Distribute vertically" onClick={() => align('dist-y')}>
              <AlignVerticalSpaceAround />
            </IconButton>
          </div>
        </Row>
      )}

      <Row label="Arrange">
        <div className="flex gap-0.5">
          <IconButton label="Bring to front" onClick={() => reorder(selection, 'front')}>
            <MoveUp />
          </IconButton>
          <IconButton label="Bring forward" onClick={() => reorder(selection, 'forward')}>
            <MoveUp className="opacity-60" />
          </IconButton>
          <IconButton label="Send backward" onClick={() => reorder(selection, 'backward')}>
            <MoveDown className="opacity-60" />
          </IconButton>
          <IconButton label="Send to back" onClick={() => reorder(selection, 'back')}>
            <MoveDown />
          </IconButton>
        </div>
      </Row>

      <div className="flex gap-0.5 border-t border-border pt-3">
        {canGroup && (
          <IconButton label="Group (⌘G)" onClick={group}>
            <Group />
          </IconButton>
        )}
        {canUngroup && (
          <IconButton label="Ungroup (⌘⇧G)" onClick={ungroup}>
            <Ungroup />
          </IconButton>
        )}
        <IconButton label="Duplicate (⌘D)" onClick={duplicate}>
          <Copy />
        </IconButton>
        <span className="flex-1" />
        <button
          type="button"
          title="Delete"
          aria-label="Delete"
          onClick={remove}
          className="flex size-7 items-center justify-center rounded-md text-danger transition-colors hover:bg-danger-subtle [&_svg]:size-3.5"
        >
          <Trash2 />
        </button>
      </div>
    </aside>
  )
}

const LABELS: Record<string, string> = {
  text: 'Text',
  sticky: 'Sticky note',
  shape: 'Shape',
  frame: 'Frame',
  connector: 'Connector',
  drawing: 'Drawing',
  image: 'Image',
  file: 'File',
  link: 'Link',
  table: 'Table',
  book_card: 'Book card',
  note_card: 'Note card',
  quote_card: 'Quote card',
}
