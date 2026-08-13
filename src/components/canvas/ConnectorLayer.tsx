import { memo } from 'react'
import type { ConnectorContent, Point, SpaceObject } from '@/types/canvas'
import { connectorLabelPoint, connectorPath, resolveConnectorEnds } from './geometry'

function dashFor(line: string | undefined, width: number): string | undefined {
  if (line === 'dashed') return `${width * 3} ${width * 2.2}`
  if (line === 'dotted') return `0.1 ${width * 2.4}`
  return undefined
}

/**
 * All connectors render into one SVG layer.
 *
 * Endpoints are resolved from the live objects on every render, which is what
 * makes a connector follow the boxes it joins when they move, resize or rotate
 * — there is no stored geometry to go stale.
 */
export const ConnectorLayer = memo(function ConnectorLayer({
  connectors,
  byId,
  selection,
  draft,
  zoom,
  editingId,
  onLabelChange,
  onLabelDone,
  onLabelDoubleClick,
}: {
  connectors: SpaceObject[]
  byId: Map<string, SpaceObject>
  selection: string[]
  /** In-progress connector being dragged out from an object. */
  draft: { from: Point; to: Point } | null
  zoom: number
  editingId: string | null
  onLabelChange: (id: string, value: string) => void
  onLabelDone: () => void
  onLabelDoubleClick: (id: string) => void
}) {
  return (
    <svg
      className="pointer-events-none absolute overflow-visible"
      style={{ left: 0, top: 0, width: 1, height: 1, zIndex: 5 }}
      aria-hidden
    >
      <defs>
        <marker
          id="bs-arrow-end"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="context-stroke" />
        </marker>
        <marker
          id="bs-arrow-start"
          viewBox="0 0 10 10"
          refX="1"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto"
        >
          <path d="M 10 0 L 0 5 L 10 10 z" fill="context-stroke" />
        </marker>
      </defs>

      {connectors.map((connector) => {
        const ends = resolveConnectorEnds(connector, byId)
        if (!ends) return null
        const content = connector.content as unknown as ConnectorContent
        const style = connector.style
        const shape = style.connector ?? 'straight'
        const selected = selection.includes(connector.id)
        const width = style.strokeWidth ?? 2
        const path = connectorPath(ends.from, ends.to, shape)
        const label = content.label ?? ''
        const editing = editingId === connector.id
        const labelAt = connectorLabelPoint(
          ends.from,
          ends.to,
          shape,
          style.labelPosition ?? 0.5,
        )

        return (
          <g key={connector.id} opacity={style.opacity ?? 1}>
            {/* Fat invisible stroke so a thin line is still easy to hit. */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(16, width + 14)}
              className="pointer-events-auto cursor-pointer"
              data-object-id={connector.id}
            />
            {selected && (
              <path
                d={path}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={width + 6}
                strokeLinecap="round"
                opacity={0.18}
              />
            )}
            <path
              d={path}
              fill="none"
              stroke={selected ? 'var(--accent)' : (style.stroke ?? 'var(--text-muted)')}
              strokeWidth={width}
              strokeLinecap="round"
              strokeDasharray={dashFor(style.line, width)}
              markerEnd={style.arrowEnd === false ? undefined : 'url(#bs-arrow-end)'}
              markerStart={style.arrowStart ? 'url(#bs-arrow-start)' : undefined}
            />

            {/* Endpoint handles, shown while the connector is selected. */}
            {selected &&
              [ends.from, ends.to].map((point, index) => (
                <circle
                  key={index}
                  cx={point.x}
                  cy={point.y}
                  r={5 / zoom}
                  fill="var(--surface)"
                  stroke="var(--accent)"
                  strokeWidth={1.5 / zoom}
                />
              ))}

            {/* Label — travels with the path because it is derived from it. */}
            {(label || editing) && (
              <foreignObject
                x={labelAt.x - 90}
                y={labelAt.y - 16}
                width={180}
                height={32}
                className="pointer-events-auto overflow-visible"
              >
                <div className="flex size-full items-center justify-center">
                  {editing ? (
                    <input
                      autoFocus
                      value={label}
                      onChange={(event) => onLabelChange(connector.id, event.target.value)}
                      onBlur={onLabelDone}
                      onKeyDown={(event) => {
                        event.stopPropagation()
                        if (event.key === 'Enter' || event.key === 'Escape') {
                          event.preventDefault()
                          onLabelDone()
                        }
                      }}
                      onPointerDown={(event) => event.stopPropagation()}
                      placeholder="describe the link"
                      aria-label="Connector label"
                      className="w-full rounded-md border border-accent bg-surface px-1.5 py-0.5 text-center text-[11px] text-text shadow-[var(--shadow-sm)] focus:outline-none"
                    />
                  ) : (
                    <span
                      data-object-id={connector.id}
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        onLabelDoubleClick(connector.id)
                      }}
                      className="max-w-full cursor-pointer truncate rounded-md border border-border bg-surface px-1.5 py-0.5 text-center text-[11px] leading-snug text-text-muted shadow-[var(--shadow-sm)]"
                    >
                      {label}
                    </span>
                  )}
                </div>
              </foreignObject>
            )}
          </g>
        )
      })}

      {draft && (
        <path
          d={connectorPath(draft.from, draft.to, 'straight')}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeDasharray="5 4"
          markerEnd="url(#bs-arrow-end)"
        />
      )}
    </svg>
  )
})
