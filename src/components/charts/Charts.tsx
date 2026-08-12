import { useId } from 'react'
import { cn, formatNumber } from '@/lib/utils'

/**
 * Charts here are single-series by design, so identity never rides on color:
 * one accent hue for the data, recessive axes, values shown on demand.
 * Anything needing two measures gets two charts rather than a second y-axis.
 */

export interface BarDatum {
  label: string
  value: number
  /** Longer text used in the tooltip when the axis label is abbreviated. */
  title?: string
}

export function ColumnChart({
  data,
  height = 180,
  valueLabel,
  className,
}: {
  data: BarDatum[]
  height?: number
  valueLabel: string
  className?: string
}) {
  const max = Math.max(1, ...data.map((d) => d.value))
  const tableId = useId()

  return (
    <figure className={cn('m-0', className)}>
      <div
        className="flex items-end gap-1.5"
        style={{ height }}
        role="img"
        aria-describedby={tableId}
        aria-label={`${valueLabel} by month`}
      >
        {data.map((datum) => {
          const ratio = datum.value / max
          return (
            <div
              key={datum.label}
              className="group relative flex h-full flex-1 flex-col justify-end"
              title={`${datum.title ?? datum.label}: ${formatNumber(datum.value)} ${valueLabel}`}
            >
              <span className="mb-1 text-center text-[10px] tabular-nums text-text-faint opacity-0 transition-opacity group-hover:opacity-100">
                {datum.value > 0 ? formatNumber(datum.value) : ''}
              </span>
              <div
                className="w-full rounded-t bg-accent transition-[height] duration-500 ease-[var(--ease-out-soft)] group-hover:opacity-85"
                style={{
                  height: `${Math.max(datum.value > 0 ? 3 : 0, ratio * 100)}%`,
                  minHeight: datum.value > 0 ? 3 : 0,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-2 flex gap-1.5 border-t border-border pt-1.5">
        {data.map((datum) => (
          <span
            key={datum.label}
            className="flex-1 text-center text-[10px] text-text-faint"
          >
            {datum.label}
          </span>
        ))}
      </div>
      {/* Table view — the same numbers, available to screen readers. */}
      <figcaption id={tableId} className="sr-only">
        {data.map((d) => `${d.title ?? d.label}: ${d.value} ${valueLabel}`).join('. ')}
      </figcaption>
    </figure>
  )
}

export function RankedBars({
  data,
  valueLabel,
  className,
  emptyMessage = 'Not enough data yet.',
}: {
  data: BarDatum[]
  valueLabel: string
  className?: string
  emptyMessage?: string
}) {
  if (!data.length) {
    return <p className="py-6 text-center text-[13px] text-text-faint">{emptyMessage}</p>
  }
  const max = Math.max(1, ...data.map((d) => d.value))

  return (
    <ul className={cn('space-y-2.5', className)}>
      {data.map((datum) => (
        <li key={datum.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] text-text">{datum.label}</span>
            <span className="shrink-0 text-[13px] tabular-nums text-text-muted">
              {formatNumber(datum.value)}
              <span className="ml-1 text-text-faint">{valueLabel}</span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease-out-soft)]"
              style={{ width: `${(datum.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** A calendar-style strip of the last N days, shaded by pages read. */
export function ActivityStrip({
  days,
  className,
}: {
  days: { date: string; value: number }[]
  className?: string
}) {
  const max = Math.max(1, ...days.map((d) => d.value))
  return (
    <div className={cn('flex flex-wrap gap-1', className)} role="img" aria-label="Daily reading over the last 12 weeks">
      {days.map((day) => {
        const ratio = day.value / max
        return (
          <span
            key={day.date}
            title={`${new Date(day.date).toLocaleDateString()}: ${day.value} pages`}
            className="size-3 rounded-[3px] border border-border/60"
            style={{
              backgroundColor:
                day.value === 0
                  ? 'var(--surface-sunken)'
                  : `color-mix(in oklab, var(--accent) ${Math.round(
                      25 + ratio * 75,
                    )}%, var(--surface))`,
            }}
          />
        )
      })}
    </div>
  )
}
