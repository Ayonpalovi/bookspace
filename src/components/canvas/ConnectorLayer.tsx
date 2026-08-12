import { memo } from 'react'
import type { Point, SpaceObject } from '@/types/canvas'
import { connectorPath, resolveConnectorEnds } from './geometry'

/**
 * All connectors render into one SVG layer.
 *
 * Endpoints are resolved from the live objects on every render, which is what
 * makes a connector follow the boxes it joins when they move — there is no
 * stored geometry to go stale.
 */
export const ConnectorLayer = memo(function ConnectorLayer({
  connectors,
  byId,
  selection,
  draft,
}: {
  connectors: SpaceObject[]
  byId: Map<string, SpaceObject>
  selection: string[]
  /** In-progress connector being dragged out from an object. */
  draft: { from: Point; to: Point } | null
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
        const style = connector.style
        const selected = selection.includes(connector.id)
        const path = connectorPath(ends.from, ends.to, style.connector ?? 'straight')
        return (
          <g key={connector.id}>
            {/* Fat invisible stroke so the line is easy to click. */}
            <path
              d={path}
              fill="none"
              stroke="transparent"
              strokeWidth={14}
              className="pointer-events-auto cursor-pointer"
              data-object-id={connector.id}
            />
            <path
              d={path}
              fill="none"
              stroke={selected ? 'var(--accent)' : (style.stroke ?? 'var(--text-muted)')}
              strokeWidth={style.strokeWidth ?? 2}
              strokeLinecap="round"
              markerEnd={style.arrowEnd === false ? undefined : 'url(#bs-arrow-end)'}
              markerStart={style.arrowStart ? 'url(#bs-arrow-start)' : undefined}
              opacity={connector.style.opacity ?? 1}
            />
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
