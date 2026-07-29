import type { Classification, Rag, RuleProfile, TimeEntry } from '../domain/types'
import type { CrewMix } from './crew'

/**
 * Ratio compliance.
 *
 * Two separate rules get confused constantly, so the app tracks them apart:
 *
 *  1. State public-works ratio — one apprentice hour per five journeyman
 *     hours, per craft, *totaled over the life of the project*. It is measured
 *     in hours, not bodies, and it is judged at the end. That makes it easy to
 *     drift out of compliance early and expensive to fix late, which is
 *     exactly why it belongs on a running gauge instead of a closeout report.
 *
 *  2. Agreement supervision ratios — how many journeymen a foreman may
 *     supervise and when a general foreman must be designated. Measured in
 *     bodies, right now, on the job.
 */

/** Total hours on a time entry, straight and premium alike. */
export function entryHours(e: TimeEntry): number {
  return e.straightHours + e.otHours + e.dtHours
}

export interface ApprenticeRatioStatus {
  journeymanHours: number
  apprenticeHours: number
  /** Apprentice hours the project owes at the current journeyman total. */
  requiredApprenticeHours: number
  shortfallHours: number
  /** Journeyman hours per apprentice hour actually worked. Lower is richer. */
  actualRatio: number
  requiredRatio: number
  compliant: boolean
  rag: Rag
}

/**
 * Running apprentice-ratio position for the project to date.
 *
 * Journey-level classifications (journeyman, foreman, general foreman) count
 * on the journeyman side. CW/CE trainees are neither — they count on neither
 * side of this particular ratio.
 */
export function apprenticeRatio(
  time: TimeEntry[],
  classifications: Classification[],
  profile: RuleProfile,
): ApprenticeRatioStatus {
  const byCode = new Map(classifications.map((c) => [c.code, c]))

  let journeymanHours = 0
  let apprenticeHours = 0

  for (const e of time) {
    const c = byCode.get(e.classificationCode)
    if (!c) continue
    const hours = entryHours(e)
    if (c.journeyLevel) journeymanHours += hours
    else if (c.kind === 'apprentice') apprenticeHours += hours
  }

  const requiredRatio = Math.max(1, profile.publicWorksJwHoursPerApprentice)
  const requiredApprenticeHours = journeymanHours / requiredRatio
  const shortfallHours = Math.max(0, requiredApprenticeHours - apprenticeHours)
  const actualRatio = apprenticeHours > 0 ? journeymanHours / apprenticeHours : Infinity

  const attainment =
    requiredApprenticeHours > 0 ? apprenticeHours / requiredApprenticeHours : 1

  return {
    journeymanHours,
    apprenticeHours,
    requiredApprenticeHours,
    shortfallHours,
    actualRatio,
    requiredRatio,
    compliant: shortfallHours === 0,
    rag: attainment >= 1 ? 'go' : attainment >= 0.8 ? 'watch' : 'risk',
  }
}

export interface StwfStatus {
  journeyLevelHours: number
  graduateHours: number
  actualPct: number
  requiredPct: number
  shortfallHours: number
  compliant: boolean
  rag: Rag
}

/**
 * Skilled & Trained Workforce position (AB 3018).
 *
 * On covered public work, a required percentage of the hours in an
 * apprenticeable craft — 60% since January 2020 — must be performed by
 * journey-level workers who graduated a state-approved apprenticeship.
 */
export function stwfStatus(
  time: TimeEntry[],
  classifications: Classification[],
  requiredPct: number,
): StwfStatus {
  const byCode = new Map(classifications.map((c) => [c.code, c]))

  let journeyLevelHours = 0
  let graduateHours = 0

  for (const e of time) {
    const c = byCode.get(e.classificationCode)
    if (!c?.journeyLevel) continue
    const hours = entryHours(e)
    journeyLevelHours += hours
    if (c.apprenticeshipGraduate) graduateHours += hours
  }

  const actualPct = journeyLevelHours > 0 ? (graduateHours / journeyLevelHours) * 100 : 0
  const requiredHours = journeyLevelHours * (requiredPct / 100)
  const shortfallHours = Math.max(0, requiredHours - graduateHours)

  return {
    journeyLevelHours,
    graduateHours,
    actualPct,
    requiredPct,
    shortfallHours,
    compliant: journeyLevelHours === 0 || actualPct >= requiredPct,
    rag:
      journeyLevelHours === 0
        ? 'none'
        : actualPct >= requiredPct
          ? 'go'
          : actualPct >= requiredPct - 10
            ? 'watch'
            : 'risk',
  }
}

export interface SupervisionIssue {
  severity: Rag
  message: string
}

/**
 * Check a crew against the agreement's supervision requirements.
 *
 * Returns plain-language findings rather than error codes — this text goes
 * straight onto the manpower screen next to the offending week.
 */
export function checkSupervision(
  crew: CrewMix,
  profile: RuleProfile,
): SupervisionIssue[] {
  const issues: SupervisionIssue[] = []
  if (crew.total === 0) return issues

  const supervised = crew.journeymen + crew.apprentices

  if (crew.total >= profile.foremanRequiredAtCrew && crew.foremen === 0) {
    issues.push({
      severity: 'risk',
      message: `A crew of ${crew.total} requires a foreman (${profile.localUnion} requires one at ${profile.foremanRequiredAtCrew} or more).`,
    })
  }

  if (crew.foremen > 0) {
    const perForeman = supervised / crew.foremen
    if (perForeman > profile.journeymenPerForeman) {
      issues.push({
        severity: 'risk',
        message: `${perForeman.toFixed(1)} workers per foreman exceeds the ${profile.journeymenPerForeman} allowed — add a foreman.`,
      })
    }
  }

  if (crew.foremen >= profile.generalForemanAtForemen && crew.generalForeman === 0) {
    issues.push({
      severity: 'watch',
      message: `${crew.foremen} foremen on the job — one must be designated general foreman.`,
    })
  }

  return issues
}

/**
 * On-the-job apprentice ratio permitted by the agreement, as opposed to the
 * state's hour-based ratio. L11's current agreement allows 1:1 starting with
 * the second journeyman.
 */
export function maxApprenticesOnJob(journeyLevelCount: number, profile: RuleProfile): number {
  return Math.max(0, journeyLevelCount - profile.cbaApprenticeAllowedAfterJw)
}
