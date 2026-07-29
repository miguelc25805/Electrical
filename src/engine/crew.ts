import type { RuleProfile } from '../domain/types'

/**
 * Crew composition and dispatch.
 *
 * Weekly hours are only half an answer. What a GF actually needs is *who* to
 * call and *when* — a count by classification that already respects the
 * agreement's supervision ratios and the state apprentice ratio, so the call
 * to the hall doesn't create a compliance problem on the way to fixing a
 * manpower one.
 */

export interface CrewMix {
  generalForeman: number
  foremen: number
  journeymen: number
  apprentices: number
  total: number
}

export const EMPTY_CREW: CrewMix = {
  generalForeman: 0,
  foremen: 0,
  journeymen: 0,
  apprentices: 0,
  total: 0,
}

/**
 * Size and compose a crew for a week's worth of hours.
 *
 * Supervision comes off the top: the agreement requires a foreman once a job
 * reaches a threshold crew size, another foreman per so many journeymen, and a
 * general foreman once there are multiple foremen. The remaining bodies split
 * between journeymen and apprentices at the state ratio (California: one
 * apprentice hour per five journeyman hours, so apprentices are one-sixth of
 * the crew), capped by what the agreement allows on the job.
 */
export function crewForHours(
  hours: number,
  hoursPerWorkerWeek: number,
  profile: RuleProfile,
): CrewMix {
  if (hours <= 0 || hoursPerWorkerWeek <= 0) return { ...EMPTY_CREW }

  const total = Math.max(1, Math.round(hours / hoursPerWorkerWeek))

  // --- Supervision -------------------------------------------------------
  let foremen = 0
  let generalForeman = 0

  if (total >= profile.foremanRequiredAtCrew) {
    foremen = Math.max(1, Math.ceil(total / Math.max(1, profile.journeymenPerForeman)))
    if (foremen >= profile.generalForemanAtForemen) {
      generalForeman = 1
    }
  }

  const supervision = Math.min(total, foremen + generalForeman)
  const nonSupervisory = Math.max(0, total - supervision)

  // --- Apprentices -------------------------------------------------------
  // The state ratio is expressed against journeyman hours, so an apprentice
  // share of 1/(1+5) of the crew lands the project on 1:5 overall.
  const ratio = Math.max(1, profile.publicWorksJwHoursPerApprentice)
  let apprentices = Math.min(nonSupervisory, Math.round(total / (1 + ratio)))

  // The agreement also caps how many apprentices may be on the job at once.
  const journeyLevel = total - apprentices
  const cbaCap = Math.max(0, journeyLevel - profile.cbaApprenticeAllowedAfterJw)
  apprentices = Math.max(0, Math.min(apprentices, cbaCap))

  const journeymen = Math.max(0, total - supervision - apprentices)

  return {
    generalForeman,
    foremen: Math.max(0, supervision - generalForeman),
    journeymen,
    apprentices,
    total,
  }
}

/** Signed difference between two crews — positive means call, negative release. */
export function crewDelta(from: CrewMix, to: CrewMix): CrewMix {
  return {
    generalForeman: to.generalForeman - from.generalForeman,
    foremen: to.foremen - from.foremen,
    journeymen: to.journeymen - from.journeymen,
    apprentices: to.apprentices - from.apprentices,
    total: to.total - from.total,
  }
}

export interface DispatchWeek {
  weekStart: string
  hours: number
  crew: CrewMix
  /** Change from the previous week. This is the actual call to the hall. */
  delta: CrewMix
  /** Crew exceeds what the site can physically absorb. */
  overCap: boolean
}

/**
 * Week-by-week manpower plan with the calls and releases already worked out.
 *
 * @param siteCap hard ceiling on bodies the site can absorb; 0 disables.
 */
export function dispatchPlan(
  weeklyHours: Record<string, number>,
  hoursPerWorkerWeek: number,
  profile: RuleProfile,
  siteCap = 0,
): DispatchWeek[] {
  const weeks = Object.keys(weeklyHours).sort()
  let previous: CrewMix = { ...EMPTY_CREW }

  return weeks.map((weekStart) => {
    const hours = weeklyHours[weekStart] ?? 0
    const crew = crewForHours(hours, hoursPerWorkerWeek, profile)
    const delta = crewDelta(previous, crew)
    previous = crew
    return {
      weekStart,
      hours,
      crew,
      delta,
      overCap: siteCap > 0 && crew.total > siteCap,
    }
  })
}

/** The staffing peak — the number that decides whether a job is manageable. */
export function peakCrew(plan: DispatchWeek[]): { weekStart: string; crew: CrewMix } | null {
  if (plan.length === 0) return null
  const peak = plan.reduce((a, b) => (b.crew.total > a.crew.total ? b : a))
  return { weekStart: peak.weekStart, crew: peak.crew }
}

/** Total planned man-hours across the plan. */
export function totalPlannedHours(plan: DispatchWeek[]): number {
  return plan.reduce((sum, w) => sum + w.hours, 0)
}

/**
 * Flatten a crew into hours by classification code, so it can be priced with
 * `compositeRate` or checked against the ratio rules.
 */
export function crewToHoursMix(
  crew: CrewMix,
  hoursPerWorkerWeek: number,
): Record<string, number> {
  return {
    GF: crew.generalForeman * hoursPerWorkerWeek,
    FOR: crew.foremen * hoursPerWorkerWeek,
    JW: crew.journeymen * hoursPerWorkerWeek,
    A5: crew.apprentices * hoursPerWorkerWeek,
  }
}
