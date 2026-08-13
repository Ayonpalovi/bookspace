import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { useCanvas } from '@/stores/canvas'
import type { Tool } from '@/stores/canvas'
import type { Anchor, Point, SpaceObject } from '@/types/canvas'
import { STICKY_COLORS } from '@/types/canvas'
import { ObjectView } from './ObjectView'
import { ConnectorLayer } from './ConnectorLayer'
import {
  applyResize,
  boundsOf,
  computeSnap,
  lassoSelects,
  objectRect,
  pointInRect,
  rectContains,
  rectsIntersect,
  simplifyStroke,
  toCanvas,
  type ResizeHandle,
  type SnapGuide,
} from './geometry'
import { cn } from '@/lib/utils'

const GRID_SIZE = 24
const HANDLES: ResizeHandle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
const ANCHORS: Anchor[] = ['top', 'right', 'bottom', 'left']

type Interaction =
  | { kind: 'none' }
  | { kind: 'pan'; startX: number; startY: number }
  | { kind: 'marquee'; origin: Point; current: Point; additive: boolean }
  | { kind: 'lasso'; points: Point[] }
  | { kind: 'move'; origin: Point; ids: string[]; startRects: Map<string, SpaceObject> }
  | {
      kind: 'resize'
      origin: Point
      handle: ResizeHandle
      id: string
      start: SpaceObject
    }
  | { kind: 'rotate'; id: string; centre: Point; startAngle: number; startRotation: number }
  | { kind: 'draw'; points: Point[] }
  | {
      kind: 'connect'
      fromId: string
      fromAnchor: Anchor
      from: Point
      to: Point
      hoverId: string | null
    }

export function CanvasStage({
  onOpenFile,
  onContextMenu,
  className,
}: {
  onOpenFile?: (fileId: string) => void
  onContextMenu?: (event: { x: number; y: number; objectId: string | null }) => void
  className?: string
}) {
  const stageRef = useRef<HTMLDivElement>(null)
  const [interaction, setInteraction] = useState<Interaction>({ kind: 'none' })
  const [guides, setGuides] = useState<SnapGuide[]>([])
  const [spaceHeld, setSpaceHeld] = useState(false)

  const objects = useCanvas((s) => s.objects)
  const selection = useCanvas((s) => s.selection)
  const editingId = useCanvas((s) => s.editingId)
  const viewport = useCanvas((s) => s.viewport)
  const tool = useCanvas((s) => s.tool)
  const showGrid = useCanvas((s) => s.showGrid)
  const snapEnabled = useCanvas((s) => s.snapEnabled)

  const store = useCanvas

  const byId = useMemo(() => new Map(objects.map((o) => [o.id, o])), [objects])
  const connectors = useMemo(() => objects.filter((o) => o.type === 'connector'), [objects])
  const frames = useMemo(() => objects.filter((o) => o.type === 'frame'), [objects])

  /** Objects intersecting the viewport, so a big board only renders what shows. */
  const visible = useMemo(() => {
    const stage = stageRef.current
    if (!stage) return objects
    const view = {
      x: viewport.x - 200,
      y: viewport.y - 200,
      width: stage.clientWidth / viewport.zoom + 400,
      height: stage.clientHeight / viewport.zoom + 400,
    }
    return objects.filter(
      (object) => object.type === 'connector' || rectsIntersect(objectRect(object), view),
    )
  }, [objects, viewport])

  const selectedObjects = useMemo(
    () => objects.filter((o) => selection.includes(o.id)),
    [objects, selection],
  )
  const selectionBounds = useMemo(() => boundsOf(selectedObjects), [selectedObjects])

  const rect = () => stageRef.current!.getBoundingClientRect()
  const pointOf = (event: { clientX: number; clientY: number }): Point =>
    toCanvas({ x: event.clientX, y: event.clientY }, rect(), store.getState().viewport)

  /* ------------------------------------------------------------ space key */

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (event.code === 'Space' && !isTypingTarget(event.target)) {
        event.preventDefault()
        setSpaceHeld(true)
      }
    }
    const up = (event: KeyboardEvent) => {
      if (event.code === 'Space') setSpaceHeld(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [])

  /* ---------------------------------------------------------------- wheel */

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const state = store.getState()
      // Pinch-zoom arrives as ctrlKey+wheel from trackpads; ⌘/Ctrl matches it.
      if (event.ctrlKey || event.metaKey) {
        const factor = Math.exp(-event.deltaY * 0.01)
        state.zoomAt(factor, { x: event.clientX, y: event.clientY }, stage.getBoundingClientRect())
      } else {
        // Direct manipulation: the board follows the gesture, so swiping right
        // moves the board right and swiping up moves it up — the same feel as
        // dragging with the hand tool. Shift turns a vertical wheel into a
        // horizontal pan for mice without a second axis.
        const dx = event.shiftKey ? event.deltaY : event.deltaX
        const dy = event.shiftKey ? 0 : event.deltaY
        state.panBy(dx, dy)
      }
    }
    stage.addEventListener('wheel', onWheel, { passive: false })
    return () => stage.removeEventListener('wheel', onWheel)
  }, [store])

  /* --------------------------------------------------------- pointer down */

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button === 2) return
      const state = store.getState()
      const target = event.target as HTMLElement
      const stage = stageRef.current!

      // Stop the browser moving focus to the canvas on mouse-down. Without this
      // it steals focus back from an inline editor we are about to open, and it
      // starts native text selection during drags.
      if (target.tagName !== 'TEXTAREA' && target.tagName !== 'INPUT') {
        event.preventDefault()
      }
      stage.setPointerCapture(event.pointerId)

      const handleEl = target.closest('[data-handle]') as HTMLElement | null
      const anchorEl = target.closest('[data-anchor]') as HTMLElement | null
      const objectEl = target.closest('[data-object-id]') as HTMLElement | null
      const objectId = objectEl?.dataset.objectId ?? null
      const point = pointOf(event)

      // --- pan: middle mouse, hand tool, or space held ---
      if (event.button === 1 || tool === 'hand' || spaceHeld) {
        setInteraction({ kind: 'pan', startX: event.clientX, startY: event.clientY })
        return
      }

      // --- rotate handle ---
      if (handleEl?.dataset.handle === 'rotate' && selectionBounds) {
        const centre = {
          x: selectionBounds.x + selectionBounds.width / 2,
          y: selectionBounds.y + selectionBounds.height / 2,
        }
        const object = selectedObjects[0]
        state.beginInteraction()
        setInteraction({
          kind: 'rotate',
          id: object.id,
          centre,
          startAngle: Math.atan2(point.y - centre.y, point.x - centre.x),
          startRotation: object.rotation,
        })
        return
      }

      // --- resize handle ---
      if (handleEl?.dataset.handle && selectedObjects.length === 1) {
        state.beginInteraction()
        setInteraction({
          kind: 'resize',
          origin: point,
          handle: handleEl.dataset.handle as ResizeHandle,
          id: selectedObjects[0].id,
          start: selectedObjects[0],
        })
        return
      }

      // --- connector drag from an anchor dot ---
      if (anchorEl?.dataset.anchor && objectId) {
        setInteraction({
          kind: 'connect',
          fromId: objectId,
          fromAnchor: anchorEl.dataset.anchor as Anchor,
          from: point,
          to: point,
          hoverId: null,
        })
        return
      }

      // --- creation tools ---
      if (tool === 'pen') {
        setInteraction({ kind: 'draw', points: [point] })
        return
      }
      if (tool === 'connector' && objectId) {
        setInteraction({
          kind: 'connect',
          fromId: objectId,
          fromAnchor: 'auto',
          from: point,
          to: point,
          hoverId: null,
        })
        return
      }
      if (tool === 'eraser') {
        if (objectId) state.deleteObjects([objectId])
        return
      }
      if (CREATE_TOOLS.includes(tool)) {
        createAt(tool, point)
        return
      }
      if (tool === 'lasso') {
        setInteraction({ kind: 'lasso', points: [point] })
        return
      }

      // --- select / move ---
      if (objectId) {
        const object = byId.get(objectId)
        if (!object) return
        const additive = event.shiftKey || event.metaKey
        // Clicking a group member selects the whole group.
        const groupIds = object.groupId
          ? objects.filter((o) => o.groupId === object.groupId).map((o) => o.id)
          : [objectId]

        let nextSelection = state.selection
        if (additive) {
          state.select(groupIds, true)
          nextSelection = store.getState().selection
        } else if (!state.selection.includes(objectId)) {
          state.select(groupIds)
          nextSelection = groupIds
        }

        if (object.locked) return

        const movingIds = expandWithFrameChildren(nextSelection, objects)
        state.beginInteraction()
        setInteraction({
          kind: 'move',
          origin: point,
          ids: movingIds,
          startRects: new Map(
            movingIds.map((id) => [id, objects.find((o) => o.id === id)!]),
          ),
        })
        return
      }

      // --- marquee on empty canvas ---
      if (!event.shiftKey) state.clearSelection()
      setInteraction({
        kind: 'marquee',
        origin: point,
        current: point,
        additive: event.shiftKey,
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tool, spaceHeld, byId, objects, selectedObjects, selectionBounds],
  )

  /* --------------------------------------------------------- pointer move */

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (interaction.kind === 'none') return
      const state = store.getState()
      const point = pointOf(event)

      switch (interaction.kind) {
        case 'pan': {
          state.panBy(
            -(event.clientX - interaction.startX),
            -(event.clientY - interaction.startY),
          )
          setInteraction({ ...interaction, startX: event.clientX, startY: event.clientY })
          break
        }

        case 'marquee':
          setInteraction({ ...interaction, current: point })
          break

        case 'lasso':
          setInteraction({ kind: 'lasso', points: [...interaction.points, point] })
          break

        case 'draw':
          setInteraction({ kind: 'draw', points: [...interaction.points, point] })
          break

        case 'connect': {
          const objectEl = (event.target as HTMLElement).closest(
            '[data-object-id]',
          ) as HTMLElement | null
          const hoverId = objectEl?.dataset.objectId ?? null
          setInteraction({
            ...interaction,
            to: point,
            hoverId: hoverId !== interaction.fromId ? hoverId : null,
          })
          break
        }

        case 'move': {
          let dx = point.x - interaction.origin.x
          let dy = point.y - interaction.origin.y

          const primary = interaction.startRects.get(interaction.ids[0])!
          const movingRects = interaction.ids
            .map((id) => interaction.startRects.get(id)!)
            .filter(Boolean)
          const bounds = boundsOf(movingRects)!

          if (snapEnabled && !event.altKey) {
            const others = objects.filter((o) => !interaction.ids.includes(o.id))
            const snap = computeSnap(
              { ...bounds, x: bounds.x + dx, y: bounds.y + dy },
              others,
              viewport.zoom,
              showGrid ? GRID_SIZE : null,
            )
            dx += snap.dx
            dy += snap.dy
            setGuides(snap.guides)
          } else {
            setGuides([])
          }
          void primary

          state.updateObjects(
            interaction.ids.map((id) => {
              const start = interaction.startRects.get(id)!
              return { id, changes: { x: start.x + dx, y: start.y + dy } }
            }),
          )
          break
        }

        case 'resize': {
          const dx = point.x - interaction.origin.x
          const dy = point.y - interaction.origin.y
          const next = applyResize(
            objectRect(interaction.start),
            interaction.handle,
            dx,
            dy,
            event.shiftKey,
          )
          state.updateObjects([{ id: interaction.id, changes: next }])
          break
        }

        case 'rotate': {
          const angle = Math.atan2(
            point.y - interaction.centre.y,
            point.x - interaction.centre.x,
          )
          let degrees =
            interaction.startRotation + ((angle - interaction.startAngle) * 180) / Math.PI
          if (event.shiftKey) degrees = Math.round(degrees / 15) * 15
          state.updateObjects([
            { id: interaction.id, changes: { rotation: Math.round(degrees) } },
          ])
          break
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interaction, objects, snapEnabled, showGrid, viewport.zoom],
  )

  /* ----------------------------------------------------------- pointer up */

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = store.getState()
      setGuides([])

      switch (interaction.kind) {
        case 'marquee': {
          const marquee = normalizeRect(interaction.origin, interaction.current)
          if (marquee.width > 3 || marquee.height > 3) {
            const hits = objects
              .filter((o) => !o.locked && !o.hidden && o.type !== 'connector')
              .filter((o) => rectsIntersect(objectRect(o), marquee))
              .map((o) => o.id)
            state.select(hits, interaction.additive)
          }
          break
        }

        case 'lasso': {
          if (interaction.points.length > 2) {
            const hits = objects
              .filter((o) => !o.locked && !o.hidden && o.type !== 'connector')
              .filter((o) => lassoSelects(interaction.points, o))
              .map((o) => o.id)
            state.select(hits)
          }
          state.setTool('select')
          break
        }

        case 'draw': {
          const points = simplifyStroke(interaction.points)
          if (points.length > 1) {
            const xs = points.map((p) => p.x)
            const ys = points.map((p) => p.y)
            const minX = Math.min(...xs)
            const minY = Math.min(...ys)
            state.createObject(
              {
                type: 'drawing',
                x: minX,
                y: minY,
                width: Math.max(1, Math.max(...xs) - minX),
                height: Math.max(1, Math.max(...ys) - minY),
                content: { points: points.map((p) => ({ x: p.x - minX, y: p.y - minY })) },
                style: { stroke: 'var(--text)', strokeWidth: 3 },
              },
              { select: false },
            )
          }
          break
        }

        case 'connect': {
          const targetId = interaction.hoverId
          if (targetId && targetId !== interaction.fromId) {
            state.createObject({
              type: 'connector',
              x: 0,
              y: 0,
              width: 0,
              height: 0,
              content: {
                fromId: interaction.fromId,
                toId: targetId,
                fromAnchor: interaction.fromAnchor,
                toAnchor: 'auto',
              },
              style: { connector: 'straight', arrowEnd: true, strokeWidth: 2 },
            })
          }
          if (tool === 'connector') state.setTool('select')
          break
        }

        case 'move': {
          // Re-parent anything dropped into (or out of) a frame.
          const patches = interaction.ids
            .map((id) => {
              const object = store.getState().objects.find((o) => o.id === id)
              if (!object || object.type === 'frame') return null
              const container = frames.find(
                (frame) =>
                  frame.id !== object.id &&
                  rectContains(objectRect(frame), objectRect(object)),
              )
              const next = container?.id ?? null
              return next === object.parentFrameId
                ? null
                : { id, changes: { parentFrameId: next } }
            })
            .filter(Boolean) as { id: string; changes: Partial<SpaceObject> }[]
          if (patches.length) state.updateObjects(patches)
          state.endInteraction()
          break
        }

        case 'resize':
        case 'rotate':
          state.endInteraction()
          break
      }

      setInteraction({ kind: 'none' })
      try {
        stageRef.current?.releasePointerCapture(event.pointerId)
      } catch {
        // Capture may already be gone if the pointer left the window.
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [interaction, objects, frames, tool],
  )

  /* ------------------------------------------------------------- creation */

  const createAt = (which: Tool, point: Point) => {
    const state = store.getState()
    const common = { x: point.x, y: point.y }
    // Return to the select tool first: setTool clears the editing target, so
    // doing it afterwards would immediately close the editor we just opened.
    state.setTool('select')
    if (which === 'text') {
      const object = state.createObject({
        type: 'text',
        ...common,
        content: { text: '' },
        style: { fontSize: 18, color: 'var(--text)' },
      })
      if (object) state.setEditing(object.id)
    } else if (which === 'sticky') {
      const colour = STICKY_COLORS[0]
      const object = state.createObject({
        type: 'sticky',
        ...common,
        content: { text: '' },
        style: { fill: colour.fill, color: colour.text, fontSize: 15 },
      })
      if (object) state.setEditing(object.id)
    } else if (which === 'shape') {
      state.createObject({
        type: 'shape',
        ...common,
        content: { text: '' },
        style: { shape: 'rectangle', fill: 'var(--surface)', stroke: 'var(--border-strong)', strokeWidth: 2, align: 'center' },
      })
    } else if (which === 'frame') {
      state.createObject({
        type: 'frame',
        ...common,
        content: { title: 'Frame' },
        style: { stroke: 'var(--border-strong)', fill: 'transparent' },
      })
    } else if (which === 'table') {
      state.createObject({
        type: 'table',
        ...common,
        content: {
          rows: [
            ['Column', 'Column'],
            ['', ''],
            ['', ''],
          ],
        },
      })
    }
  }

  /* -------------------------------------------------------------- render */

  const marquee =
    interaction.kind === 'marquee'
      ? normalizeRect(interaction.origin, interaction.current)
      : null

  const cursor =
    interaction.kind === 'pan' || spaceHeld || tool === 'hand'
      ? 'grabbing'
      : tool === 'pen'
        ? 'crosshair'
        : tool === 'eraser'
          ? 'cell'
          : CREATE_TOOLS.includes(tool) || tool === 'lasso' || tool === 'connector'
            ? 'crosshair'
            : 'default'

  return (
    <div
      ref={stageRef}
      className={cn('relative size-full touch-none overflow-hidden bg-bg-subtle', className)}
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={(event) => {
        const objectEl = (event.target as HTMLElement).closest(
          '[data-object-id]',
        ) as HTMLElement | null
        const state = store.getState()
        if (objectEl?.dataset.objectId) {
          const object = byId.get(objectEl.dataset.objectId)
          if (object && !object.locked && TEXT_TYPES.includes(object.type)) {
            state.setEditing(object.id)
          }
          return
        }
        createAt('text', pointOf(event))
      }}
      onContextMenu={(event) => {
        event.preventDefault()
        const objectEl = (event.target as HTMLElement).closest(
          '[data-object-id]',
        ) as HTMLElement | null
        const id = objectEl?.dataset.objectId ?? null
        if (id && !store.getState().selection.includes(id)) store.getState().select([id])
        onContextMenu?.({ x: event.clientX, y: event.clientY, objectId: id })
      }}
      role="application"
      aria-label="Infinite canvas"
    >
      {/* Grid — drawn in screen space, offset by the viewport. */}
      {showGrid && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              'radial-gradient(circle, var(--border-strong) 1px, transparent 1px)',
            backgroundSize: `${GRID_SIZE * viewport.zoom}px ${GRID_SIZE * viewport.zoom}px`,
            backgroundPosition: `${-viewport.x * viewport.zoom}px ${-viewport.y * viewport.zoom}px`,
            opacity: viewport.zoom < 0.4 ? 0 : 0.5,
          }}
        />
      )}

      {/* World */}
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          transform: `scale(${viewport.zoom}) translate(${-viewport.x}px, ${-viewport.y}px)`,
        }}
      >
        {visible.map((object) => (
          <ObjectView
            key={object.id}
            object={object}
            selected={selection.includes(object.id)}
            editing={editingId === object.id}
            onTextChange={(value) =>
              store.getState().updateObjects([
                {
                  id: object.id,
                  changes: {
                    content: {
                      ...object.content,
                      [object.type === 'frame' ? 'title' : 'text']: value,
                    },
                  },
                },
              ])
            }
            onEditDone={() => {
              store.getState().setEditing(null)
              store.getState().commit()
            }}
            onOpenFile={onOpenFile}
          />
        ))}

        <ConnectorLayer
          connectors={connectors}
          byId={byId}
          selection={selection}
          draft={
            interaction.kind === 'connect'
              ? { from: interaction.from, to: interaction.to }
              : null
          }
        />

        {/* Alignment guides */}
        {guides.map((guide, index) => (
          <div
            key={`${guide.axis}-${guide.position}-${index}`}
            aria-hidden
            className="pointer-events-none absolute bg-accent"
            style={
              guide.axis === 'x'
                ? {
                    left: guide.position,
                    top: guide.from,
                    width: 1 / viewport.zoom,
                    height: guide.to - guide.from,
                  }
                : {
                    left: guide.from,
                    top: guide.position,
                    height: 1 / viewport.zoom,
                    width: guide.to - guide.from,
                  }
            }
          />
        ))}

        {/* Selection outline + handles */}
        {selectionBounds && interaction.kind !== 'marquee' && (
          <SelectionOverlay
            bounds={selectionBounds}
            zoom={viewport.zoom}
            single={selectedObjects.length === 1 ? selectedObjects[0] : null}
            showAnchors={tool === 'select' || tool === 'connector'}
          />
        )}

        {/* Marquee */}
        {marquee && (
          <div
            aria-hidden
            className="pointer-events-none absolute border border-accent bg-[var(--accent-subtle)] opacity-70"
            style={{
              left: marquee.x,
              top: marquee.y,
              width: marquee.width,
              height: marquee.height,
            }}
          />
        )}

        {/* Lasso */}
        {interaction.kind === 'lasso' && interaction.points.length > 1 && (
          <svg className="pointer-events-none absolute overflow-visible" style={{ width: 1, height: 1 }}>
            <polygon
              points={interaction.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="var(--accent-subtle)"
              fillOpacity={0.5}
              stroke="var(--accent)"
              strokeWidth={1 / viewport.zoom}
              strokeDasharray={`${4 / viewport.zoom} ${3 / viewport.zoom}`}
            />
          </svg>
        )}

        {/* In-progress pen stroke */}
        {interaction.kind === 'draw' && interaction.points.length > 1 && (
          <svg className="pointer-events-none absolute overflow-visible" style={{ width: 1, height: 1 }}>
            <polyline
              points={interaction.points.map((p) => `${p.x},${p.y}`).join(' ')}
              fill="none"
              stroke="var(--text)"
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ pieces */

function SelectionOverlay({
  bounds,
  zoom,
  single,
  showAnchors,
}: {
  bounds: { x: number; y: number; width: number; height: number }
  zoom: number
  single: SpaceObject | null
  showAnchors: boolean
}) {
  const handleSize = 9 / zoom
  const offset = handleSize / 2
  const locked = single?.locked

  const handlePosition = (handle: ResizeHandle) => {
    const x =
      handle.includes('w') ? -offset : handle.includes('e') ? bounds.width - offset : bounds.width / 2 - offset
    const y =
      handle.includes('n') ? -offset : handle.includes('s') ? bounds.height - offset : bounds.height / 2 - offset
    return { left: x, top: y }
  }

  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: bounds.x,
        top: bounds.y,
        width: bounds.width,
        height: bounds.height,
        transform: single?.rotation ? `rotate(${single.rotation}deg)` : undefined,
      }}
    >
      <div
        className="absolute inset-0 border border-accent"
        style={{ borderWidth: 1.5 / zoom }}
      />

      {!locked && (
        <>
          {HANDLES.map((handle) => (
            <div
              key={handle}
              data-handle={handle}
              className="pointer-events-auto absolute rounded-[2px] border border-accent bg-surface"
              style={{
                ...handlePosition(handle),
                width: handleSize,
                height: handleSize,
                borderWidth: 1.5 / zoom,
                cursor: `${handle}-resize`,
              }}
            />
          ))}

          {single && (
            <div
              data-handle="rotate"
              title="Rotate"
              className="pointer-events-auto absolute rounded-full border border-accent bg-surface"
              style={{
                left: bounds.width / 2 - offset,
                top: -26 / zoom,
                width: handleSize,
                height: handleSize,
                borderWidth: 1.5 / zoom,
                cursor: 'grab',
              }}
            />
          )}
        </>
      )}

      {/* Connector anchors — drag one out to join this object to another. */}
      {showAnchors && single && !locked && single.type !== 'connector' && (
        <>
          {ANCHORS.map((anchor) => {
            const position =
              anchor === 'top'
                ? { left: bounds.width / 2 - offset, top: -offset }
                : anchor === 'bottom'
                  ? { left: bounds.width / 2 - offset, top: bounds.height - offset }
                  : anchor === 'left'
                    ? { left: -offset, top: bounds.height / 2 - offset }
                    : { left: bounds.width - offset, top: bounds.height / 2 - offset }
            return (
              <div
                key={anchor}
                data-anchor={anchor}
                data-object-id={single.id}
                title={`Connect from ${anchor}`}
                className="pointer-events-auto absolute rounded-full bg-accent opacity-0 transition-opacity hover:opacity-100"
                style={{
                  ...position,
                  width: handleSize,
                  height: handleSize,
                  cursor: 'crosshair',
                }}
              />
            )
          })}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ utils */

const CREATE_TOOLS: Tool[] = ['text', 'sticky', 'shape', 'frame', 'table']
const TEXT_TYPES = ['text', 'sticky', 'shape', 'frame']

function normalizeRect(a: Point, b: Point) {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  }
}

/** Moving a frame takes its contents along. */
function expandWithFrameChildren(ids: string[], objects: SpaceObject[]): string[] {
  const result = new Set(ids)
  for (const id of ids) {
    const object = objects.find((o) => o.id === id)
    if (object?.type !== 'frame') continue
    for (const child of objects) {
      if (child.parentFrameId === id) result.add(child.id)
      else if (
        child.id !== id &&
        child.type !== 'connector' &&
        pointInRect(
          { x: child.x + child.width / 2, y: child.y + child.height / 2 },
          objectRect(object),
        )
      ) {
        result.add(child.id)
      }
    }
  }
  return [...result]
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable
}
