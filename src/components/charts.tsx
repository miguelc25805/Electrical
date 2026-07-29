import { useId, useState } from 'react'
import type { ReactNode } from 'react'

/**
 * Charts.
 *
 * Hand-rolled SVG rather than a charting library: it keeps the bundle small
 * enough to cache for offline use, and it lets the marks follow the house
 * spec exactly — thin marks, a 2px surface gap between stacked segments,
 * rounded data-ends anchored to the baseline, recessive axes, and a hover
 * layer on every plot.
 *
 * Series colors come from the four validated categorical slots and are
 * assigned in fixed order, never cycled. Nothing here plots more than four.
 */

export const SERIES = [
  'var(--color-series-1)',
  'var(--color-series-2)',
  'var(--color-series-3)',
  'var(--color-series-4)',
] as const

const AXIS = 'var(--app-line)'
const GRID = 'var(--app-line-soft)'
const INK_MUTED = 'var(--app-text-muted)'

// ---------------------------------------------------------------------------

export function Legend({
  items,
}: {
  items: { label: string; color: string; dashed?: boolean }[]
}) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5 text-xs" style={{ color: INK_MUTED }}>
          <span
            aria-hidden="true"
            className="inline-block rounded-full"
            style={{
              width: 14,
              height: it.dashed ? 0 : 10,
              borderTop: it.dashed ? `2px dashed ${it.color}` : undefined,
              background: it.dashed ? undefined : it.color,
            }}
          />
          {it.label}
        </li>
      ))}
    </ul>
  )
}

function Tooltip({
  x,
  y,
  width,
  children,
}: {
  x: number
  y: number
  width: number
  children: ReactNode
}) {
  // Flip to the other side near the right edge so the card never clips.
  const flip = x > width * 0.62
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg px-3 py-2 text-xs whitespace-nowrap"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(0, y - 10),
        background: 'var(--app-raised)',
        border: '1px solid var(--app-line)',
        boxShadow: '0 6px 24px rgba(0,0,0,0.35)',
        color: 'var(--app-text)',
      }}
    >
      {children}
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface StackedDatum {
  label: string
  /** Segment values, bottom to top. Length must match `series`. */
  values: number[]
  /** Draws the bar with hazard hatching — over the site's manpower cap. */
  flagged?: boolean
}

/**
 * Weekly crew histogram, stacked by classification.
 *
 * Four categories at most (general foreman, foreman, journeyman, apprentice),
 * which is exactly what the validated palette supports.
 */
export function StackedBarChart({
  data,
  series,
  height = 220,
  yLabel,
  capLine,
  formatValue = (n) => String(Math.round(n)),
}: {
  data: StackedDatum[]
  series: { label: string; color: string }[]
  height?: number
  yLabel?: string
  capLine?: number
  formatValue?: (n: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const padL = 34
  const padB = 26
  const padT = 10
  const width = Math.max(320, data.length * 34)
  const plotH = height - padB - padT
  const plotW = width - padL

  const totals = data.map((d) => d.values.reduce((a, b) => a + b, 0))
  const max = Math.max(1, ...totals, capLine ?? 0)
  const ticks = niceTicks(max, 4)
  const scaleY = (v: number) => padT + plotH - (v / ticks.max) * plotH
  const bandW = plotW / Math.max(1, data.length)
  const barW = Math.min(26, bandW - 4)

  return (
    <div className="relative">
      <div className="overflow-x-auto">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Crew by week. Peak ${Math.round(Math.max(...totals))}.`}
          onMouseLeave={() => setHover(null)}
        >
          {ticks.values.map((t) => (
            <g key={t}>
              <line x1={padL} x2={width} y1={scaleY(t)} y2={scaleY(t)} stroke={GRID} strokeWidth={1} />
              <text
                x={padL - 6}
                y={scaleY(t) + 4}
                textAnchor="end"
                fontSize={10}
                fill={INK_MUTED}
              >
                {t}
              </text>
            </g>
          ))}

          {capLine != null && capLine > 0 && (
            <g>
              <line
                x1={padL}
                x2={width}
                y1={scaleY(capLine)}
                y2={scaleY(capLine)}
                stroke="var(--color-risk-500)"
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              <text x={padL + 4} y={scaleY(capLine) - 5} fontSize={10} fill="var(--color-risk-500)">
                site cap {capLine}
              </text>
            </g>
          )}

          {data.map((d, i) => {
            const x = padL + i * bandW + (bandW - barW) / 2
            let acc = 0
            return (
              <g
                key={d.label}
                onMouseEnter={() => setHover(i)}
                onFocus={() => setHover(i)}
                tabIndex={0}
                role="graphics-symbol"
                aria-label={`${d.label}: ${Math.round(totals[i])} workers`}
              >
                {/* Generous invisible hit target — bigger than the mark. */}
                <rect x={padL + i * bandW} y={padT} width={bandW} height={plotH} fill="transparent" />
                {d.values.map((v, s) => {
                  if (v <= 0) return null
                  const y0 = scaleY(acc)
                  acc += v
                  const y1 = scaleY(acc)
                  // 2px surface gap between segments keeps stacks legible.
                  const h = Math.max(1, y0 - y1 - 2)
                  const topSegment = s === lastNonZero(d.values)
                  return (
                    <rect
                      key={s}
                      x={x}
                      y={y1}
                      width={barW}
                      height={h}
                      rx={topSegment ? 4 : 0}
                      fill={series[s]?.color ?? SERIES[0]}
                      opacity={hover === null || hover === i ? 1 : 0.45}
                    />
                  )
                })}
                {d.flagged && (
                  <rect
                    x={x}
                    y={scaleY(totals[i])}
                    width={barW}
                    height={plotH + padT - scaleY(totals[i])}
                    fill="none"
                    stroke="var(--color-risk-500)"
                    strokeWidth={2}
                    rx={4}
                  />
                )}
              </g>
            )
          })}

          <line x1={padL} x2={width} y1={padT + plotH} y2={padT + plotH} stroke={AXIS} strokeWidth={1} />

          {data.map((d, i) =>
            i % Math.ceil(data.length / 10) === 0 ? (
              <text
                key={d.label}
                x={padL + i * bandW + bandW / 2}
                y={height - 8}
                textAnchor="middle"
                fontSize={9}
                fill={INK_MUTED}
              >
                {d.label}
              </text>
            ) : null,
          )}
        </svg>
      </div>

      {hover !== null && (
        <Tooltip x={padL + hover * bandW + bandW / 2} y={scaleY(totals[hover])} width={width}>
          <div className="mb-1 font-bold">{data[hover].label}</div>
          {series.map((s, i) =>
            data[hover].values[i] > 0 ? (
              <div key={s.label} className="flex items-center gap-2">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                {s.label}: <strong>{formatValue(data[hover].values[i])}</strong>
              </div>
            ) : null,
          )}
          <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--app-line)' }}>
            Total: <strong>{formatValue(totals[hover])}</strong>
          </div>
        </Tooltip>
      )}

      {yLabel && (
        <div className="label-cap mt-1" style={{ color: INK_MUTED }}>
          {yLabel}
        </div>
      )}
      <Legend items={series} />
    </div>
  )
}

// ---------------------------------------------------------------------------

export interface LineSeries {
  label: string
  color: string
  /** null breaks the line — used where a series simply has no data yet. */
  points: (number | null)[]
  dashed?: boolean
}

/**
 * Cumulative S-curve. One y-axis, always — plan, earned and actual are all
 * man-hours, which is exactly why they belong on the same scale.
 */
export function LineChart({
  labels,
  series,
  height = 240,
  yLabel,
  formatValue = (n) => Math.round(n).toLocaleString(),
}: {
  labels: string[]
  series: LineSeries[]
  height?: number
  yLabel?: string
  formatValue?: (n: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const padL = 44
  const padB = 26
  const padT = 10
  const width = 720
  const plotH = height - padB - padT
  const plotW = width - padL

  const max = Math.max(
    1,
    ...series.flatMap((s) => s.points.filter((v): v is number => v != null)),
  )
  const ticks = niceTicks(max, 4)
  const scaleY = (v: number) => padT + plotH - (v / ticks.max) * plotH
  const scaleX = (i: number) =>
    padL + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW)

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Cumulative hours: ${series.map((s) => s.label).join(', ')}`}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const px = ((e.clientX - rect.left) / rect.width) * width
          const i = Math.round(((px - padL) / plotW) * (labels.length - 1))
          setHover(i >= 0 && i < labels.length ? i : null)
        }}
      >
        {ticks.values.map((t) => (
          <g key={t}>
            <line x1={padL} x2={width} y1={scaleY(t)} y2={scaleY(t)} stroke={GRID} strokeWidth={1} />
            <text x={padL - 6} y={scaleY(t) + 4} textAnchor="end" fontSize={10} fill={INK_MUTED}>
              {formatValue(t)}
            </text>
          </g>
        ))}

        {hover !== null && (
          <line
            x1={scaleX(hover)}
            x2={scaleX(hover)}
            y1={padT}
            y2={padT + plotH}
            stroke={AXIS}
            strokeWidth={1}
          />
        )}

        {series.flatMap((s) =>
          runs(s.points).map((run, r) => (
            <polyline
              key={`${id}-${s.label}-${r}`}
              fill="none"
              stroke={s.color}
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={s.dashed ? '6 5' : undefined}
              points={run.map(({ i, v }) => `${scaleX(i)},${scaleY(v)}`).join(' ')}
            />
          )),
        )}

        {hover !== null &&
          series.map((s) =>
            s.points[hover] == null ? null : (
              <circle
                key={`${id}-dot-${s.label}`}
                cx={scaleX(hover)}
                cy={scaleY(s.points[hover])}
                r={5}
                fill={s.color}
                // 2px surface ring keeps overlapping marks readable.
                stroke="var(--app-surface)"
                strokeWidth={2}
              />
            ),
          )}

        <line x1={padL} x2={width} y1={padT + plotH} y2={padT + plotH} stroke={AXIS} strokeWidth={1} />

        {labels.map((l, i) =>
          i % Math.ceil(labels.length / 8) === 0 ? (
            <text
              key={l}
              x={scaleX(i)}
              y={height - 8}
              textAnchor="middle"
              fontSize={9}
              fill={INK_MUTED}
            >
              {l}
            </text>
          ) : null,
        )}
      </svg>

      {hover !== null && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg px-3 py-2 text-xs"
          style={{
            left: `${(scaleX(hover) / width) * 100}%`,
            transform:
              scaleX(hover) > width * 0.6 ? 'translateX(calc(-100% - 12px))' : 'translateX(12px)',
            background: 'var(--app-raised)',
            border: '1px solid var(--app-line)',
            color: 'var(--app-text)',
          }}
        >
          <div className="mb-1 font-bold">{labels[hover]}</div>
          {series.map((s) =>
            s.points[hover] == null ? null : (
              <div key={s.label} className="flex items-center gap-2 whitespace-nowrap">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                {s.label}: <strong>{formatValue(s.points[hover])}</strong>
              </div>
            ),
          )}
        </div>
      )}

      {yLabel && (
        <div className="label-cap mt-1" style={{ color: INK_MUTED }}>
          {yLabel}
        </div>
      )}
      <Legend items={series.map((s) => ({ label: s.label, color: s.color, dashed: s.dashed }))} />
    </div>
  )
}

// ---------------------------------------------------------------------------

/** Single-series bar chart with a target line. Used for weekly PPC. */
export function BarChart({
  data,
  height = 160,
  target,
  colorFor,
  formatValue = (n) => `${Math.round(n)}%`,
}: {
  data: { label: string; value: number }[]
  height?: number
  target?: number
  colorFor?: (v: number) => string
  formatValue?: (n: number) => string
}) {
  const [hover, setHover] = useState<number | null>(null)
  const padL = 32
  const padB = 24
  const padT = 8
  const width = Math.max(280, data.length * 46)
  const plotH = height - padB - padT
  const plotW = width - padL
  const max = Math.max(100, ...data.map((d) => d.value))
  const scaleY = (v: number) => padT + plotH - (v / max) * plotH
  const bandW = plotW / Math.max(1, data.length)
  const barW = Math.min(28, bandW - 8)

  return (
    <div className="relative overflow-x-auto">
      <svg width={width} height={height} role="img" aria-label="Percent plan complete by week">
        {[0, 50, 100].map((t) => (
          <line key={t} x1={padL} x2={width} y1={scaleY(t)} y2={scaleY(t)} stroke={GRID} strokeWidth={1} />
        ))}
        {target != null && (
          <>
            <line
              x1={padL}
              x2={width}
              y1={scaleY(target)}
              y2={scaleY(target)}
              stroke="var(--color-go-500)"
              strokeWidth={2}
              strokeDasharray="6 4"
            />
            <text x={padL + 2} y={scaleY(target) - 4} fontSize={9} fill="var(--color-go-500)">
              target {target}%
            </text>
          </>
        )}
        {data.map((d, i) => {
          const x = padL + i * bandW + (bandW - barW) / 2
          const y = scaleY(d.value)
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              tabIndex={0}
              aria-label={`${d.label}: ${formatValue(d.value)}`}
            >
              <rect x={padL + i * bandW} y={padT} width={bandW} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(2, padT + plotH - y)}
                rx={4}
                fill={colorFor?.(d.value) ?? SERIES[0]}
                opacity={hover === null || hover === i ? 1 : 0.5}
              />
              <text
                x={x + barW / 2}
                y={y - 5}
                textAnchor="middle"
                fontSize={9}
                fill="var(--app-text-muted)"
              >
                {formatValue(d.value)}
              </text>
              <text
                x={x + barW / 2}
                y={height - 7}
                textAnchor="middle"
                fontSize={9}
                fill={INK_MUTED}
              >
                {d.label}
              </text>
            </g>
          )
        })}
        <line x1={padL} x2={width} y1={padT + plotH} y2={padT + plotH} stroke={AXIS} strokeWidth={1} />
      </svg>
    </div>
  )
}

// ---------------------------------------------------------------------------

function niceTicks(max: number, count: number): { max: number; values: number[] } {
  const raw = max / count
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, raw))))
  const step = Math.ceil(raw / mag) * mag
  const top = step * count
  return {
    max: top,
    values: Array.from({ length: count + 1 }, (_, i) => i * step),
  }
}

/** Split a series into contiguous runs of non-null points. */
function runs(points: (number | null)[]): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = []
  let current: { i: number; v: number }[] = []
  points.forEach((v, i) => {
    if (v == null) {
      if (current.length > 0) out.push(current)
      current = []
    } else {
      current.push({ i, v })
    }
  })
  if (current.length > 0) out.push(current)
  return out
}

function lastNonZero(values: number[]): number {
  for (let i = values.length - 1; i >= 0; i--) if (values[i] > 0) return i
  return -1
}
