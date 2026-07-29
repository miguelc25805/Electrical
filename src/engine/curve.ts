import {
  addDays,
  differenceInCalendarDays,
  eachWeekOfInterval,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns'
import type { Activity, CurveShape, DateStr, WorkCalendar } from '../domain/types'

/**
 * Manpower curve.
 *
 * Turns "this activity is 1,400 hours between March and June" into hours per
 * week, which is the only form a GF can act on — because bodies get called and
 * released by the week, not by the month.
 *
 * Work rarely loads flat. A rough-in ramps up, peaks and tapers; a gear set is
 * front-loaded; punch is back-loaded. The shape a GF picks changes the peak
 * headcount, which is the number that decides whether the job is staffable.
 */

/** Monday-anchored week key, `YYYY-MM-DD`. Used as the map key everywhere. */
export function weekKey(date: Date | DateStr, weekStartsOn = 1): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(
    startOfWeek(d, { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 }),
    'yyyy-MM-dd',
  )
}

/** Every week key touched by an inclusive date range. */
export function weeksInRange(
  start: DateStr,
  finish: DateStr,
  weekStartsOn = 1,
): string[] {
  const s = parseISO(start)
  const f = parseISO(finish)
  if (f < s) return [weekKey(s, weekStartsOn)]

  return eachWeekOfInterval(
    { start: s, end: f },
    { weekStartsOn: weekStartsOn as 0 | 1 | 2 | 3 | 4 | 5 | 6 },
  ).map((d) => format(d, 'yyyy-MM-dd'))
}

/**
 * Relative weight per period for a curve shape. Weights always sum to 1, so
 * the caller can multiply straight through by total hours.
 */
export function curveWeights(shape: CurveShape, periods: number): number[] {
  if (periods <= 0) return []
  if (periods === 1) return [1]

  let raw: number[]

  switch (shape) {
    case 'bell':
      // Half-sine: a natural ramp up to peak crew and back down.
      raw = Array.from({ length: periods }, (_, i) =>
        Math.sin((Math.PI * (i + 0.5)) / periods),
      )
      break

    case 'frontLoaded':
      // Heaviest at the start, tapering to a third of the opening weight.
      raw = Array.from({ length: periods }, (_, i) => 1 - (0.66 * i) / (periods - 1))
      break

    case 'backLoaded':
      raw = Array.from({ length: periods }, (_, i) => 0.34 + (0.66 * i) / (periods - 1))
      break

    case 'uniform':
    default:
      raw = Array.from({ length: periods }, () => 1)
      break
  }

  const total = raw.reduce((a, b) => a + b, 0)
  return raw.map((w) => w / total)
}

/**
 * Spread one activity's budget hours across the weeks it spans.
 *
 * Partial weeks at each end are weighted by the number of days the activity is
 * actually in that week, so a Thursday start doesn't book a full week of crew.
 */
export function activityWeeklyHours(
  activity: Activity,
  weekStartsOn = 1,
): Record<string, number> {
  const weeks = weeksInRange(activity.plannedStart, activity.plannedFinish, weekStartsOn)
  if (weeks.length === 0) return {}

  const start = parseISO(activity.plannedStart)
  const finish = parseISO(activity.plannedFinish)

  // Days of the activity that fall inside each week, used to trim the ends.
  const dayShare = weeks.map((wk) => {
    const weekStart = parseISO(wk)
    const weekEnd = addDays(weekStart, 6)
    const from = weekStart > start ? weekStart : start
    const to = weekEnd < finish ? weekEnd : finish
    return Math.max(0, differenceInCalendarDays(to, from) + 1)
  })

  const shape = curveWeights(activity.curve, weeks.length)
  const weighted = shape.map((w, i) => w * (dayShare[i] / 7))
  const total = weighted.reduce((a, b) => a + b, 0)

  const out: Record<string, number> = {}
  if (total <= 0) {
    out[weeks[0]] = activity.budgetHours
    return out
  }

  weeks.forEach((wk, i) => {
    const hours = (weighted[i] / total) * activity.budgetHours
    if (hours > 0) out[wk] = (out[wk] ?? 0) + hours
  })

  return out
}

/** Weekly planned hours for the whole job, summed across activities. */
export function projectWeeklyHours(
  activities: Activity[],
  weekStartsOn = 1,
): Record<string, number> {
  const out: Record<string, number> = {}
  for (const activity of activities) {
    for (const [wk, hours] of Object.entries(activityWeeklyHours(activity, weekStartsOn))) {
      out[wk] = (out[wk] ?? 0) + hours
    }
  }
  return out
}

/** Weekly planned hours broken out per phase, for the stacked histogram. */
export function weeklyHoursByPhase(
  activities: Activity[],
  weekStartsOn = 1,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const activity of activities) {
    for (const [wk, hours] of Object.entries(activityWeeklyHours(activity, weekStartsOn))) {
      out[wk] ??= {}
      out[wk][activity.phaseId] = (out[wk][activity.phaseId] ?? 0) + hours
    }
  }
  return out
}

/** Scheduled hours one worker puts in per week, e.g. 40 on a 5×8, 40 on a 4×10. */
export function hoursPerWorkerWeek(calendar: WorkCalendar): number {
  return calendar.daysPerWeek * calendar.hoursPerDay
}

/** Sorted week keys spanning every activity on the job. */
export function projectWeeks(activities: Activity[], weekStartsOn = 1): string[] {
  const keys = new Set<string>()
  for (const activity of activities) {
    for (const wk of weeksInRange(
      activity.plannedStart,
      activity.plannedFinish,
      weekStartsOn,
    )) {
      keys.add(wk)
    }
  }
  return [...keys].sort()
}
