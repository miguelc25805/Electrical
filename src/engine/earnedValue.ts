import { addWeeks, format, parseISO } from 'date-fns'
import type {
  Activity,
  DateStr,
  ProgressEntry,
  Rag,
  TimeEntry,
} from '../domain/types'
import { entryHours } from './ratios'
import { projectWeeklyHours, weekKey } from './curve'

/**
 * Earned value, in the units a GF thinks in: man-hours.
 *
 * Dollars are the office's language. Hours are the field's, and hours are what
 * a GF can actually move. So every forecast here runs on hours first and gets
 * priced afterward.
 *
 *   earned hours      = budget × percent complete   (what the work was worth)
 *   production factor = earned ÷ actual             (1.0 is on the estimate)
 *   EAC               = actual + remaining ÷ PF     (where it ends up)
 *   TCPI              = productivity needed from here to still hit budget
 */

/** How percent complete was determined, so the UI can ask for what's missing. */
export type ProgressBasis = 'override' | 'quantity' | 'none'

export interface ActivityMetrics {
  activityId: string
  budgetHours: number
  actualHours: number
  /** 0–100. */
  pctComplete: number
  progressBasis: ProgressBasis
  qtyInstalled: number
  earnedHours: number
  /** Earned ÷ actual. Above 1.0 beats the estimate. */
  productionFactor: number
  remainingHours: number
  eacHours: number
  /** Budget − EAC. Positive is money left on the table for the shop. */
  varianceHours: number
  /**
   * Productivity required on the remaining work to still finish at budget.
   * null once the budget is already spent — nothing recovers it.
   */
  tcpi: number | null
  rag: Rag
}

/** Actual hours booked to an activity. */
export function actualHoursFor(activityId: string, time: TimeEntry[]): number {
  return time.reduce((sum, e) => (e.activityId === activityId ? sum + entryHours(e) : sum), 0)
}

/**
 * Percent complete for one activity.
 *
 * A percent override wins when present — testing, startup and punch have
 * nothing countable, so a foreman's judgment is the only signal. Otherwise it
 * comes from installed quantity against the takeoff, which is the honest one.
 * Percent complete is never derived from hours burned; that would make the
 * production factor 1.0 forever and hide the very problem it exists to find.
 */
export function percentComplete(
  activity: Activity,
  progress: ProgressEntry[],
): { pct: number; basis: ProgressBasis; qtyInstalled: number } {
  const entries = progress
    .filter((p) => p.activityId === activity.id)
    .sort((a, b) => a.date.localeCompare(b.date))

  const qtyInstalled = entries.reduce((sum, p) => sum + (p.qtyInstalled || 0), 0)

  const lastOverride = [...entries].reverse().find((p) => p.pctOverride != null)
  if (lastOverride?.pctOverride != null) {
    return {
      pct: clamp(lastOverride.pctOverride, 0, 100),
      basis: 'override',
      qtyInstalled,
    }
  }

  if (activity.budgetQty > 0) {
    return {
      pct: clamp((qtyInstalled / activity.budgetQty) * 100, 0, 100),
      basis: 'quantity',
      qtyInstalled,
    }
  }

  return { pct: 0, basis: 'none', qtyInstalled }
}

export function activityMetrics(
  activity: Activity,
  progress: ProgressEntry[],
  time: TimeEntry[],
): ActivityMetrics {
  const { pct, basis, qtyInstalled } = percentComplete(activity, progress)
  const actualHours = actualHoursFor(activity.id, time)
  const earnedHours = activity.budgetHours * (pct / 100)

  return {
    activityId: activity.id,
    ...rollup(activity.budgetHours, earnedHours, actualHours),
    pctComplete: pct,
    progressBasis: basis,
    qtyInstalled,
  }
}

/** Shared math between a single activity and the whole-job rollup. */
function rollup(budgetHours: number, earnedHours: number, actualHours: number) {
  // With no hours booked yet there is nothing to judge — assume the estimate.
  const productionFactor = actualHours > 0 ? earnedHours / actualHours : 1
  const remainingHours = Math.max(0, budgetHours - earnedHours)

  // A zero production factor means hours went in and nothing came out. Rather
  // than forecast an infinite cost, carry the burned hours as loss and assume
  // the remaining work runs at the estimate.
  const eacHours =
    productionFactor > 0
      ? actualHours + remainingHours / productionFactor
      : actualHours + remainingHours

  const budgetLeft = budgetHours - actualHours
  const tcpi = budgetLeft > 0 ? remainingHours / budgetLeft : null

  return {
    budgetHours,
    actualHours,
    earnedHours,
    productionFactor,
    remainingHours,
    eacHours,
    varianceHours: budgetHours - eacHours,
    tcpi,
    rag: ragForFactor(productionFactor, actualHours),
  }
}

/**
 * Traffic light for a production factor. Held at neutral until enough hours
 * exist to mean anything — a single bad morning is not a trend.
 */
export function ragForFactor(pf: number, actualHours: number): Rag {
  if (actualHours < 8) return 'none'
  if (pf >= 1) return 'go'
  if (pf >= 0.9) return 'watch'
  return 'risk'
}

export interface ProjectMetrics extends Omit<ActivityMetrics, 'activityId' | 'progressBasis' | 'qtyInstalled'> {
  /** Share of budgeted hours already spent, 0–100. */
  burnPct: number
  /** Share of the work actually in place, 0–100. */
  completePct: number
  activityCount: number
}

export function projectMetrics(
  activities: Activity[],
  progress: ProgressEntry[],
  time: TimeEntry[],
): ProjectMetrics {
  let budgetHours = 0
  let earnedHours = 0

  for (const activity of activities) {
    const m = activityMetrics(activity, progress, time)
    budgetHours += m.budgetHours
    earnedHours += m.earnedHours
  }

  // Every hour on the job counts, including any booked to a deleted activity.
  const actualHours = time.reduce((sum, e) => sum + entryHours(e), 0)
  const base = rollup(budgetHours, earnedHours, actualHours)

  return {
    ...base,
    pctComplete: budgetHours > 0 ? (earnedHours / budgetHours) * 100 : 0,
    burnPct: budgetHours > 0 ? (actualHours / budgetHours) * 100 : 0,
    completePct: budgetHours > 0 ? (earnedHours / budgetHours) * 100 : 0,
    activityCount: activities.length,
  }
}

// ---------------------------------------------------------------------------
// S-curve
// ---------------------------------------------------------------------------

export interface CurvePoint {
  week: string
  /** Cumulative hours the plan said would be spent by this week. */
  planned: number
  /**
   * Cumulative hours of work put in place, valued at budget. null for weeks
   * past the last one with reported production — the actual lines have to stop
   * at today rather than run flat into the future, which would read as a job
   * that stalled instead of one that simply has not happened yet.
   */
  earned: number | null
  /** Cumulative hours charged. null past the last reported week. */
  actual: number | null
}

/**
 * The three cumulative lines a GF reads together: plan, earned and actual.
 * Earned below planned means behind schedule; actual above earned means over
 * on labor. The gap between them is the whole story of the job.
 */
export function sCurve(
  activities: Activity[],
  progress: ProgressEntry[],
  time: TimeEntry[],
  weekStartsOn = 1,
): CurvePoint[] {
  const planned = projectWeeklyHours(activities, weekStartsOn)

  // Actual hours, bucketed by the week they were worked.
  const actualByWeek: Record<string, number> = {}
  for (const e of time) {
    const wk = weekKey(e.date, weekStartsOn)
    actualByWeek[wk] = (actualByWeek[wk] ?? 0) + entryHours(e)
  }

  // Earned hours, bucketed by the week the work went in.
  const earnedByWeek: Record<string, number> = {}

  for (const activity of activities) {
    const entries = progress
      .filter((p) => p.activityId === activity.id)
      .sort((a, b) => a.date.localeCompare(b.date))
    if (entries.length === 0) continue

    let priorPct = 0
    for (const entry of entries) {
      const pct = pctAfter(activity, entries, entry)
      const gained = Math.max(0, pct - priorPct)
      priorPct = pct
      const wk = weekKey(entry.date, weekStartsOn)
      earnedByWeek[wk] = (earnedByWeek[wk] ?? 0) + activity.budgetHours * (gained / 100)
    }
  }

  const weeks = [
    ...new Set([
      ...Object.keys(planned),
      ...Object.keys(actualByWeek),
      ...Object.keys(earnedByWeek),
    ]),
  ].sort()

  // The last week anything was actually reported. Past it, the earned and
  // actual lines stop rather than continue flat.
  const reportedWeeks = [...Object.keys(earnedByWeek), ...Object.keys(actualByWeek)].sort()
  const lastReported = reportedWeeks[reportedWeeks.length - 1]

  let cp = 0
  let ce = 0
  let ca = 0

  return weeks.map((week) => {
    cp += planned[week] ?? 0
    ce += earnedByWeek[week] ?? 0
    ca += actualByWeek[week] ?? 0
    const live = lastReported != null && week <= lastReported
    return { week, planned: cp, earned: live ? ce : null, actual: live ? ca : null }
  })

  function pctAfter(
    activity: Activity,
    entries: ProgressEntry[],
    upTo: ProgressEntry,
  ): number {
    const idx = entries.indexOf(upTo)
    const slice = entries.slice(0, idx + 1)
    const lastOverride = [...slice].reverse().find((p) => p.pctOverride != null)
    if (lastOverride?.pctOverride != null) return clamp(lastOverride.pctOverride, 0, 100)
    if (activity.budgetQty > 0) {
      const qty = slice.reduce((s, p) => s + (p.qtyInstalled || 0), 0)
      return clamp((qty / activity.budgetQty) * 100, 0, 100)
    }
    return 0
  }
}

/**
 * Projected finish at the rate work is currently going in place.
 *
 * Uses the trailing weeks of earned hours rather than the plan, because the
 * plan is the thing being tested. Returns null until there is enough history
 * to draw a line through.
 */
export function projectedFinish(
  curve: CurvePoint[],
  totalBudgetHours: number,
  trailingWeeks = 4,
): DateStr | null {
  // Only weeks with reported production carry a rate; future weeks are empty
  // by construction and would drag the trend to zero.
  const reported = curve.filter((p) => p.earned != null) as (CurvePoint & { earned: number })[]
  if (reported.length < 2) return null

  const window = reported.slice(-Math.max(2, trailingWeeks))
  const gained = window[window.length - 1].earned - window[0].earned
  const spanWeeks = window.length - 1
  const perWeek = spanWeeks > 0 ? gained / spanWeeks : 0

  if (perWeek <= 0) return null

  const last = reported[reported.length - 1]
  const remaining = Math.max(0, totalBudgetHours - last.earned)
  const weeksLeft = Math.ceil(remaining / perWeek)
  return format(addWeeks(parseISO(last.week), weeksLeft), 'yyyy-MM-dd')
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n))
}
