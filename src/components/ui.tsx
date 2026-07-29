import type { ReactNode } from 'react'
import type { Rag } from '../domain/types'

/**
 * Shared primitives.
 *
 * Two rules run through all of them:
 *   1. Nothing interactive is smaller than 48px. This app gets used with
 *      gloves on, standing up, on a dusty screen.
 *   2. Status is never color alone. Every RAG indicator carries a glyph and a
 *      word, because two of the four status colors sit below 3:1 on white and
 *      because roughly one in twelve men has a color vision deficiency — a
 *      meaningful share of any crew.
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export const RAG_COLOR: Record<Rag, string> = {
  go: 'var(--color-go-500)',
  watch: 'var(--color-watch-500)',
  risk: 'var(--color-risk-500)',
  none: 'var(--app-text-dim)',
}

/** Glyph channel, so status survives colorblindness, print and forced colors. */
export const RAG_GLYPH: Record<Rag, string> = {
  go: '●',
  watch: '▲',
  risk: '■',
  none: '–',
}

export const RAG_WORD: Record<Rag, string> = {
  go: 'On track',
  watch: 'Watch',
  risk: 'Behind',
  none: 'No data',
}

export function RagBadge({
  rag,
  label,
  className = '',
}: {
  rag: Rag
  label?: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-bold ${className}`}
      style={{
        color: RAG_COLOR[rag],
        background: `color-mix(in srgb, ${RAG_COLOR[rag]} 14%, transparent)`,
      }}
    >
      <span aria-hidden="true">{RAG_GLYPH[rag]}</span>
      {label ?? RAG_WORD[rag]}
    </span>
  )
}

/** A thin status stripe for the left edge of a row. */
export function RagStripe({ rag }: { rag: Rag }) {
  return (
    <span
      aria-hidden="true"
      className="absolute top-0 bottom-0 left-0 w-1"
      style={{ background: RAG_COLOR[rag] }}
    />
  )
}

// ---------------------------------------------------------------------------
// Readouts
// ---------------------------------------------------------------------------

/**
 * The primary way a number gets shown. Big enough to read at arm's length off
 * a tablet on a gang box.
 */
export function StatTile({
  label,
  value,
  unit,
  sub,
  rag,
  onClick,
  className = '',
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: ReactNode
  rag?: Rag
  onClick?: () => void
  className?: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={`surface relative flex min-h-tap flex-col justify-between rounded-lg p-3 text-left ${
        onClick ? 'transition-colors hover:brightness-110 active:brightness-95' : ''
      } ${className}`}
    >
      {rag && rag !== 'none' && <RagStripe rag={rag} />}
      <div className="label-cap">{label}</div>
      <div className="mt-2 flex items-baseline gap-1">
        <span
          className="readout text-3xl font-extrabold"
          style={rag ? { color: RAG_COLOR[rag] } : undefined}
        >
          {value}
        </span>
        {unit && (
          <span className="text-sm font-semibold" style={{ color: 'var(--app-text-muted)' }}>
            {unit}
          </span>
        )}
      </div>
      {sub && (
        <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
          {sub}
        </div>
      )}
    </Tag>
  )
}

/** Horizontal fill bar. Used for percent complete and budget burn. */
export function Meter({
  pct,
  rag = 'none',
  height = 8,
  label,
}: {
  pct: number
  rag?: Rag
  height?: number
  label?: string
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div
      role="meter"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? 'Percent complete'}
      className="w-full overflow-hidden rounded-full"
      style={{ height, background: 'var(--app-line-soft)' }}
    >
      <div
        className="h-full rounded-full transition-[width] duration-300"
        style={{
          width: `${clamped}%`,
          background: rag === 'none' ? 'var(--color-seq-400)' : RAG_COLOR[rag],
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_STYLE: Record<ButtonVariant, string> = {
  primary: 'text-[#1a1200] font-bold',
  secondary: 'font-semibold',
  ghost: 'font-semibold',
  danger: 'font-bold text-white',
}

export function Button({
  children,
  onClick,
  variant = 'secondary',
  type = 'button',
  disabled,
  full,
  large,
  className = '',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: ButtonVariant
  type?: 'button' | 'submit'
  disabled?: boolean
  full?: boolean
  large?: boolean
  className?: string
  title?: string
}) {
  const bg =
    variant === 'primary'
      ? 'var(--color-amp-400)'
      : variant === 'danger'
        ? 'var(--color-risk-500)'
        : variant === 'ghost'
          ? 'transparent'
          : 'var(--app-surface-2)'

  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`no-print inline-flex items-center justify-center gap-2 rounded-lg px-4 transition-[filter,opacity] hover:brightness-110 active:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 ${
        BUTTON_STYLE[variant]
      } ${full ? 'w-full' : ''} ${className}`}
      style={{
        background: bg,
        minHeight: large ? 'var(--spacing-tap-lg)' : 'var(--spacing-tap)',
        border: variant === 'secondary' || variant === 'ghost' ? '1px solid var(--app-line)' : 'none',
        color: variant === 'primary' || variant === 'danger' ? undefined : 'var(--app-text)',
      }}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  hint,
  children,
  className = '',
}: {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className}`}>
      <span className="label-cap">{label}</span>
      {children}
      {hint && (
        <span className="text-xs" style={{ color: 'var(--app-text-dim)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

const CONTROL_CLASS =
  'w-full rounded-lg px-3 outline-none transition-[border-color]'

const controlStyle = {
  minHeight: 'var(--spacing-tap)',
  background: 'var(--app-surface-2)',
  border: '1px solid var(--app-line)',
  color: 'var(--app-text)',
} as const

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  className?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`${CONTROL_CLASS} ${className}`}
      style={controlStyle}
    />
  )
}

/**
 * Numeric input that stays editable while it's being typed in.
 *
 * Coercing to a number on every keystroke makes a field impossible to clear
 * and fights the user on decimals — so the raw string is kept until blur.
 */
export function NumberInput({
  value,
  onChange,
  placeholder,
  step,
  className = '',
}: {
  value: number
  onChange: (v: number) => void
  placeholder?: string
  step?: number
  className?: string
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      step={step}
      value={Number.isFinite(value) ? value : ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
      className={`${CONTROL_CLASS} ${className}`}
      style={controlStyle}
    />
  )
}

export function Select<T extends string>({
  value,
  onChange,
  options,
  className = '',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as T)}
      className={`${CONTROL_CLASS} ${className}`}
      style={controlStyle}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

export function DateInput({
  value,
  onChange,
  className = '',
}: {
  value: string
  onChange: (v: string) => void
  className?: string
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${CONTROL_CLASS} ${className}`}
      style={controlStyle}
    />
  )
}

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2 outline-none"
      style={controlStyle}
    />
  )
}

/** Segmented control — a row of tabs sized for a thumb. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <div
      className="no-print inline-flex overflow-hidden rounded-lg p-1"
      style={{ background: 'var(--app-surface-2)', border: '1px solid var(--app-line)' }}
    >
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className="rounded-md px-3 text-sm font-semibold transition-colors"
            style={{
              minHeight: '2.5rem',
              background: active ? 'var(--color-amp-400)' : 'transparent',
              color: active ? '#1a1200' : 'var(--app-text-muted)',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function SectionHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {subtitle && (
          <p className="mt-0.5 text-sm" style={{ color: 'var(--app-text-muted)' }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

export function Panel({
  title,
  actions,
  children,
  className = '',
}: {
  title?: string
  actions?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`surface rounded-lg ${className}`}>
      {(title || actions) && (
        <header
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--app-line-soft)' }}
        >
          {title && <h3 className="text-sm font-bold tracking-tight">{title}</h3>}
          {actions && <div className="no-print flex gap-2">{actions}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string
  body: string
  action?: ReactNode
}) {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-lg px-6 py-12 text-center"
      style={{ border: '1px dashed var(--app-line)' }}
    >
      <h3 className="text-base font-bold">{title}</h3>
      <p className="mt-1 max-w-md text-sm" style={{ color: 'var(--app-text-muted)' }}>
        {body}
      </p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

/** Bottom sheet on a phone, centered dialog on a laptop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0"
        style={{ background: 'rgba(3,7,18,0.72)' }}
        onClick={onClose}
      />
      <div
        className="surface relative flex max-h-[92vh] w-full flex-col rounded-t-2xl sm:max-w-2xl sm:rounded-2xl"
        style={{ background: 'var(--app-surface)' }}
      >
        <header
          className="flex items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: 'var(--app-line-soft)' }}
        >
          <h3 className="text-base font-bold">{title}</h3>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center rounded-lg text-xl"
            style={{ minWidth: 'var(--spacing-tap)', minHeight: 'var(--spacing-tap)' }}
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
        {footer && (
          <footer
            className="flex justify-end gap-2 border-t p-4"
            style={{ borderColor: 'var(--app-line-soft)' }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  )
}

/** Explains a number in the GF's own words. Used under every forecast. */
export function Explain({ children }: { children: ReactNode }) {
  return (
    <p
      className="mt-2 text-xs leading-relaxed"
      style={{ color: 'var(--app-text-muted)' }}
    >
      {children}
    </p>
  )
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export const fmtHours = (n: number): string =>
  Math.abs(n) >= 10000
    ? `${(n / 1000).toFixed(1)}k`
    : n.toLocaleString('en-US', { maximumFractionDigits: 0 })

export const fmtMoney = (n: number): string =>
  Math.abs(n) >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(2)}M`
    : Math.abs(n) >= 1000
      ? `$${(n / 1000).toFixed(0)}k`
      : `$${n.toFixed(0)}`

export const fmtPct = (n: number, digits = 0): string =>
  `${n.toLocaleString('en-US', { maximumFractionDigits: digits })}%`

export const fmtFactor = (n: number): string => n.toFixed(2)

/** `Mon Mar 3` — how a date gets said out loud on a job. */
export function fmtDate(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

export function fmtDateFull(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
