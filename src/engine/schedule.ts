import { addWeeks, format, parseISO, startOfWeek } from 'date-fns'
import type {
  Activity,
  Commitment,
  Constraint,
  DateStr,
  Rag,
} from '../domain/types'

/**
 * Make-ready planning and commitment tracking.
 *
 * This is the Last Planner idiom foremen already speak: look three weeks out,
 * clear what's in the way, promise only what's actually ready, then score the
 * promises. Percent Plan Complete below about 75% means the crew is being set
 * up to fail, and the reason codes say by what.
 */

/** The Monday of each week in the lookahead window. */
export function lookaheadWeeks(from: DateStr, count = 3, weekStartsOn = 1): string[] {
  const start = startOfWeek(parseISO(from), {
    weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6,
  })
  return Array.from({ length: count }, (_, i) =>
    format(addWeeks(start, i), 'yyyy-MM-dd'),
  )
}

/** Activities with any work inside the window. */
export function activitiesInWindow(
  activities: Activity[],
  windowStart: DateStr,
  windowEnd: DateStr,
): Activity[] {
  return activities
    .filter((a) => a.plannedStart <= windowEnd && a.plannedFinish >= windowStart)
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))
}

export interface Readiness {
  ready: boolean
  openConstraints: Constraint[]
  rag: Rag
}

/**
 * Whether an activity can actually be worked.
 *
 * An activity with an open constraint is not ready, no matter what the bar
 * chart says — and putting a crew on it anyway is how a week's production gets
 * lost. The lookahead marks these so they get cleared before they're needed,
 * not discovered on the morning of.
 */
export function readiness(
  activity: Activity,
  constraints: Constraint[],
  today: DateStr,
): Readiness {
  const open = constraints.filter((c) => c.activityId === activity.id && c.status === 'open')

  if (open.length === 0) return { ready: true, openConstraints: [], rag: 'go' }

  // Past its need-by date, or the work starts before the constraint clears.
  const critical = open.some((c) => c.needBy <= today || c.needBy >= activity.plannedStart)

  return {
    ready: false,
    openConstraints: open,
    rag: critical ? 'risk' : 'watch',
  }
}

export interface PpcResult {
  weekStart: string
  planned: number
  completed: number
  /** 0–100. Healthy is 75 and up. */
  pct: number
  rag: Rag
  /** Miss counts by reason code, worst first. */
  reasons: { code: string; count: number }[]
}

const REASON_LABELS: Record<string, string> = {
  material: 'Material not there',
  manpower: 'Not enough manpower',
  priorWork: 'Prior work not complete',
  information: 'Missing information / RFI',
  access: 'No access to the area',
  weather: 'Weather',
  equipment: 'Equipment unavailable',
  rework: 'Rework',
  other: 'Other',
}

export function reasonLabel(code: string): string {
  return REASON_LABELS[code] ?? code
}

/** Score one week's promises. */
export function ppcForWeek(commitments: Commitment[], weekStart: DateStr): PpcResult {
  const week = commitments.filter((c) => c.weekStart === weekStart)
  const planned = week.length
  const completed = week.filter((c) => c.completed).length
  const pct = planned > 0 ? (completed / planned) * 100 : 0

  const tally = new Map<string, number>()
  for (const c of week) {
    if (c.completed) continue
    const code = c.reasonCode ?? 'other'
    tally.set(code, (tally.get(code) ?? 0) + 1)
  }

  return {
    weekStart,
    planned,
    completed,
    pct,
    rag: planned === 0 ? 'none' : pct >= 75 ? 'go' : pct >= 60 ? 'watch' : 'risk',
    reasons: [...tally.entries()]
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count),
  }
}

/** PPC across every week that has commitments, oldest first. */
export function ppcHistory(commitments: Commitment[]): PpcResult[] {
  const weeks = [...new Set(commitments.map((c) => c.weekStart))].sort()
  return weeks.map((w) => ppcForWeek(commitments, w))
}

/** Aggregate miss reasons across the job — what keeps costing the crew weeks. */
export function topReasons(
  commitments: Commitment[],
): { code: string; label: string; count: number }[] {
  const tally = new Map<string, number>()
  for (const c of commitments) {
    if (c.completed) continue
    const code = c.reasonCode ?? 'other'
    tally.set(code, (tally.get(code) ?? 0) + 1)
  }
  return [...tally.entries()]
    .map(([code, count]) => ({ code, label: reasonLabel(code), count }))
    .sort((a, b) => b.count - a.count)
}

/**
 * Days of float before an activity has to start. Negative means it is already
 * late against the plan.
 */
export function daysUntilStart(activity: Activity, today: DateStr): number {
  return Math.round(
    (parseISO(activity.plannedStart).getTime() - parseISO(today).getTime()) / 86_400_000,
  )
}

/** Today as `YYYY-MM-DD`, in the user's own timezone rather than UTC. */
export function todayStr(): DateStr {
  return format(new Date(), 'yyyy-MM-dd')
}
