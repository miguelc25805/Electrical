import type { Classification, WagePackage } from '../domain/types'

/**
 * Wage math.
 *
 * A composite rate cannot be a single number, because a prevailing-wage
 * determination mixes two kinds of fringe:
 *
 *   flat       — a per-hour dollar amount (H&W, pension, vacation, training,
 *                LMCC). Paid at the same amount on straight and overtime hours.
 *   pctOfBase  — a percentage of the base hourly rate (NEBF at 3%, AMF at
 *                0.5%). These are *factored at the overtime multiplier* along
 *                with the base rate, so an OT hour costs more in fringe too.
 *
 * Treating every fringe as flat understates the cost of overtime, which is
 * exactly the decision a GF is trying to make when a job starts slipping.
 */

export interface RateBreakdown {
  /** Base hourly for this classification, before any fringe. */
  baseWage: number
  /** Cash wage for the hour, including any overtime factor. */
  cashWage: number
  flatFringes: number
  pctFringes: number
  /** Employer payroll burden (FICA, SUI, workers' comp) on the cash wage. */
  burden: number
  /** Cash wage plus every fringe — the prevailing-wage "total package". */
  totalPackage: number
  /** What the hour actually costs the contractor. */
  fullyLoaded: number
}

/** Base hourly rate for a classification, derived from the journeyman rate. */
export function classificationBase(
  pkg: WagePackage,
  classification: Classification,
): number {
  return pkg.baseHourlyJW * (classification.wagePct / 100)
}

/**
 * Full cost of one hour for one classification.
 *
 * @param otMultiplier 1 for straight time, 1.5 for time-and-a-half, 2 for
 *   double time. Applies to the cash wage and to OT-factored fringes only.
 */
export function computeRate(
  pkg: WagePackage,
  classification: Classification,
  otMultiplier = 1,
): RateBreakdown {
  const baseWage = classificationBase(pkg, classification)
  const cashWage = baseWage * otMultiplier

  let flatFringes = 0
  let pctFringes = 0

  for (const fringe of pkg.fringes) {
    if (fringe.basis === 'flat') {
      // Flat fringes are a fixed cents-per-hour contribution and do not get
      // multiplied by the overtime factor.
      flatFringes += fringe.amount
    } else {
      const factor = fringe.otFactored ? otMultiplier : 1
      pctFringes += baseWage * factor * (fringe.amount / 100)
    }
  }

  const burden = cashWage * (pkg.burdenPct / 100)
  const totalPackage = cashWage + flatFringes + pctFringes

  return {
    baseWage,
    cashWage,
    flatFringes,
    pctFringes,
    burden,
    totalPackage,
    fullyLoaded: totalPackage + burden,
  }
}

/** Look up a classification by code, or undefined if the local disabled it. */
export function findClassification(
  classifications: Classification[],
  code: string,
): Classification | undefined {
  return classifications.find((c) => c.code === code)
}

/**
 * Blended fully-loaded rate for a crew mix.
 *
 * @param mix hours by classification code — the shape that both the planned
 *   manpower curve and actual time entries reduce to.
 */
export function compositeRate(
  pkg: WagePackage,
  classifications: Classification[],
  mix: Record<string, number>,
): number {
  let hours = 0
  let cost = 0

  for (const [code, h] of Object.entries(mix)) {
    if (!h) continue
    const classification = findClassification(classifications, code)
    if (!classification) continue
    hours += h
    cost += h * computeRate(pkg, classification).fullyLoaded
  }

  return hours > 0 ? cost / hours : 0
}

/**
 * Fallback rate used before any hours exist — a crew of journeymen. Keeps
 * early-stage dollar forecasts from reading as zero.
 */
export function journeymanRate(
  pkg: WagePackage,
  classifications: Classification[],
): number {
  const jw =
    findClassification(classifications, 'JW') ??
    classifications.find((c) => c.kind === 'journeyman')
  return jw ? computeRate(pkg, jw).fullyLoaded : 0
}
