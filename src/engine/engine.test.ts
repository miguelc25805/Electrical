import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLASSIFICATIONS,
  DEFAULT_RULE_PROFILE,
  DEFAULT_WAGE_PACKAGE,
} from '../domain/templates'
import type {
  Activity,
  Commitment,
  Constraint,
  ProcurementItem,
  ProgressEntry,
  TimeEntry,
} from '../domain/types'
import { classificationBase, compositeRate, computeRate, findClassification } from './wages'
import { activityWeeklyHours, curveWeights, weeksInRange } from './curve'
import { crewForHours, dispatchPlan, peakCrew } from './crew'
import { apprenticeRatio, checkSupervision, stwfStatus } from './ratios'
import { activityMetrics, projectMetrics, projectedFinish, sCurve } from './earnedValue'
import { milestones, procurementStatus, slipDays } from './procurement'
import { ppcForWeek, readiness, topReasons } from './schedule'

const CLASSES = DEFAULT_CLASSIFICATIONS
const PROFILE = DEFAULT_RULE_PROFILE
const PKG = DEFAULT_WAGE_PACKAGE

const jw = findClassification(CLASSES, 'JW')!
const foreman = findClassification(CLASSES, 'FOR')!

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// ---------------------------------------------------------------------------

describe('wages', () => {
  it('derives every classification from the journeyman base rate', () => {
    expect(classificationBase(PKG, jw)).toBeCloseTo(56)
    // Foreman is seeded at journeyman + 10%.
    expect(classificationBase(PKG, foreman)).toBeCloseTo(61.6)
  })

  it('adds flat and percent-of-base fringes at straight time', () => {
    const r = computeRate(PKG, jw)
    // H&W + DB + DC + vacation + training + LMCC
    expect(r.flatFringes).toBeCloseTo(27.08)
    // NEBF 3% of base + AMF 0.5% of base
    expect(r.pctFringes).toBeCloseTo(56 * 0.03 + 56 * 0.005)
    expect(r.totalPackage).toBeCloseTo(56 + 27.08 + 1.96)
  })

  it('factors NEBF and AMF at the overtime multiplier but leaves flat fringes alone', () => {
    const straight = computeRate(PKG, jw, 1)
    const overtime = computeRate(PKG, jw, 1.5)

    expect(overtime.cashWage).toBeCloseTo(84)
    // This is the rule that a single blended rate gets wrong: the percentage
    // fringes scale with overtime, the flat ones do not.
    expect(overtime.pctFringes).toBeCloseTo(straight.pctFringes * 1.5)
    expect(overtime.flatFringes).toBeCloseTo(straight.flatFringes)
    expect(overtime.totalPackage).toBeCloseTo(84 + 27.08 + 2.94)
  })

  it('applies payroll burden to the cash wage only', () => {
    const r = computeRate(PKG, jw)
    expect(r.burden).toBeCloseTo(56 * 0.18)
    expect(r.fullyLoaded).toBeCloseTo(r.totalPackage + r.burden)
  })

  it('blends a crew mix by hours', () => {
    const blended = compositeRate(PKG, CLASSES, { JW: 100, FOR: 100 })
    const jwRate = computeRate(PKG, jw).fullyLoaded
    const forRate = computeRate(PKG, foreman).fullyLoaded
    expect(blended).toBeCloseTo((jwRate + forRate) / 2)
  })

  it('ignores classifications the local does not use', () => {
    expect(compositeRate(PKG, CLASSES, { NOPE: 100 })).toBe(0)
  })
})

// ---------------------------------------------------------------------------

describe('manpower curve', () => {
  const base: Activity = {
    id: 'a1',
    areaId: 'area1',
    phaseId: 'p1',
    name: 'Branch rough-in — Level 2',
    budgetHours: 1000,
    budgetQty: 1000,
    unit: 'LF',
    plannedStart: '2025-03-03', // Monday
    plannedFinish: '2025-03-30', // Sunday, exactly four weeks
    curve: 'uniform',
    predecessors: [],
    notes: '',
    sort: 0,
  }

  it('spans the right number of weeks', () => {
    expect(weeksInRange(base.plannedStart, base.plannedFinish)).toHaveLength(4)
  })

  it('spreads a flat activity evenly', () => {
    const weekly = activityWeeklyHours(base)
    expect(Object.keys(weekly)).toHaveLength(4)
    for (const hours of Object.values(weekly)) expect(hours).toBeCloseTo(250)
  })

  it('conserves total hours under every curve shape', () => {
    for (const curve of ['uniform', 'bell', 'frontLoaded', 'backLoaded'] as const) {
      const weekly = activityWeeklyHours({ ...base, curve })
      expect(sum(Object.values(weekly))).toBeCloseTo(1000)
    }
  })

  it('peaks a bell curve in the middle and tapers at the ends', () => {
    const w = curveWeights('bell', 5)
    expect(w[2]).toBeGreaterThan(w[0])
    expect(w[2]).toBeGreaterThan(w[4])
    expect(sum(w)).toBeCloseTo(1)
  })

  it('front-loads and back-loads in opposite directions', () => {
    const front = curveWeights('frontLoaded', 4)
    const back = curveWeights('backLoaded', 4)
    expect(front[0]).toBeGreaterThan(front[3])
    expect(back[0]).toBeLessThan(back[3])
  })

  it('does not book a full week of crew for a partial first week', () => {
    // Starts Thursday: only four days of that week belong to the activity.
    const weekly = activityWeeklyHours({ ...base, plannedStart: '2025-03-06' })
    const keys = Object.keys(weekly).sort()
    expect(weekly[keys[0]]).toBeLessThan(weekly[keys[1]])
    expect(sum(Object.values(weekly))).toBeCloseTo(1000)
  })
})

// ---------------------------------------------------------------------------

describe('crew composition', () => {
  it('runs a two-hand crew with no foreman', () => {
    // Below the agreement's three-worker threshold.
    const crew = crewForHours(80, 40, PROFILE)
    expect(crew.total).toBe(2)
    expect(crew.foremen).toBe(0)
    expect(crew.generalForeman).toBe(0)
  })

  it('requires a foreman once the crew reaches the threshold', () => {
    const crew = crewForHours(120, 40, PROFILE)
    expect(crew.total).toBe(3)
    expect(crew.foremen).toBe(1)
  })

  it('adds a foreman per ten supervised workers', () => {
    const crew = crewForHours(400, 40, PROFILE) // 10 hands
    expect(crew.total).toBe(10)
    expect(crew.foremen).toBe(1)
    expect(crew.generalForeman).toBe(0)
  })

  it('designates a general foreman once a second foreman is needed', () => {
    const crew = crewForHours(1600, 40, PROFILE) // 40 hands
    expect(crew.total).toBe(40)
    expect(crew.foremen).toBe(4)
    expect(crew.generalForeman).toBe(1)
    // Every body is accounted for in exactly one classification.
    expect(
      crew.generalForeman + crew.foremen + crew.journeymen + crew.apprentices,
    ).toBe(crew.total)
  })

  it('staffs apprentices toward the 1:5 state ratio', () => {
    const crew = crewForHours(1600, 40, PROFILE)
    // One apprentice per five journey-level hands ≈ one sixth of the crew.
    expect(crew.apprentices).toBe(Math.round(40 / 6))
  })

  it('produces calls and releases week over week', () => {
    const plan = dispatchPlan(
      { '2025-03-03': 400, '2025-03-10': 800, '2025-03-17': 200 },
      40,
      PROFILE,
    )
    expect(plan[0].delta.total).toBe(10) // ramp on from nothing
    expect(plan[1].delta.total).toBe(10) // call ten more
    expect(plan[2].delta.total).toBe(-15) // release fifteen
    expect(peakCrew(plan)?.crew.total).toBe(20)
  })

  it('flags weeks that exceed what the site can absorb', () => {
    const plan = dispatchPlan({ '2025-03-03': 1200 }, 40, PROFILE, 12)
    expect(plan[0].crew.total).toBe(30)
    expect(plan[0].overCap).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('ratio compliance', () => {
  const time = (code: string, hours: number, id = code): TimeEntry => ({
    id,
    activityId: 'a1',
    date: '2025-03-05',
    classificationCode: code,
    workers: 1,
    straightHours: hours,
    otHours: 0,
    dtHours: 0,
  })

  it('is compliant at exactly one apprentice hour per five journeyman hours', () => {
    const r = apprenticeRatio([time('JW', 500), time('A3', 100)], CLASSES, PROFILE)
    expect(r.journeymanHours).toBe(500)
    expect(r.apprenticeHours).toBe(100)
    expect(r.requiredApprenticeHours).toBe(100)
    expect(r.shortfallHours).toBe(0)
    expect(r.actualRatio).toBe(5)
    expect(r.compliant).toBe(true)
    expect(r.rag).toBe('go')
  })

  it('counts foremen and the general foreman on the journeyman side', () => {
    const r = apprenticeRatio(
      [time('JW', 300), time('FOR', 100), time('GF', 100), time('A3', 100)],
      CLASSES,
      PROFILE,
    )
    expect(r.journeymanHours).toBe(500)
    expect(r.compliant).toBe(true)
  })

  it('reports the apprentice hours a short project still owes', () => {
    const r = apprenticeRatio([time('JW', 500), time('A3', 50)], CLASSES, PROFILE)
    expect(r.shortfallHours).toBe(50)
    expect(r.compliant).toBe(false)
    expect(r.rag).toBe('risk')
  })

  it('counts overtime and double time toward the ratio', () => {
    const r = apprenticeRatio(
      [{ ...time('JW', 0), straightHours: 40, otHours: 8, dtHours: 2 }],
      CLASSES,
      PROFILE,
    )
    expect(r.journeymanHours).toBe(50)
  })

  it('measures the skilled and trained workforce percentage against journey-level hours', () => {
    const s = stwfStatus([time('JW', 600), time('JW-NG', 400)], CLASSES, 60)
    expect(s.journeyLevelHours).toBe(1000)
    expect(s.graduateHours).toBe(600)
    expect(s.actualPct).toBeCloseTo(60)
    expect(s.compliant).toBe(true)
  })

  it('flags a shortfall of apprenticeship graduates', () => {
    const s = stwfStatus([time('JW', 400), time('JW-NG', 600)], CLASSES, 60)
    expect(s.actualPct).toBeCloseTo(40)
    expect(s.compliant).toBe(false)
    expect(s.shortfallHours).toBeCloseTo(200)
    expect(s.rag).toBe('risk')
  })

  it('calls out an unsupervised crew', () => {
    const issues = checkSupervision(
      { generalForeman: 0, foremen: 0, journeymen: 6, apprentices: 1, total: 7 },
      PROFILE,
    )
    expect(issues.some((i) => i.message.includes('requires a foreman'))).toBe(true)
  })

  it('calls out an overloaded foreman', () => {
    const issues = checkSupervision(
      { generalForeman: 0, foremen: 1, journeymen: 14, apprentices: 3, total: 18 },
      PROFILE,
    )
    expect(issues.some((i) => i.message.includes('per foreman'))).toBe(true)
  })

  it('is quiet when the crew is properly supervised', () => {
    expect(
      checkSupervision(
        { generalForeman: 1, foremen: 2, journeymen: 14, apprentices: 3, total: 20 },
        PROFILE,
      ),
    ).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------

describe('earned value', () => {
  const activity: Activity = {
    id: 'a1',
    areaId: 'area1',
    phaseId: 'p1',
    name: 'Feeders',
    budgetHours: 1000,
    budgetQty: 1000,
    unit: 'LF',
    plannedStart: '2025-03-03',
    plannedFinish: '2025-03-30',
    curve: 'uniform',
    predecessors: [],
    notes: '',
    sort: 0,
  }

  const progress: ProgressEntry[] = [
    { id: 'p1', activityId: 'a1', date: '2025-03-07', qtyInstalled: 400, note: '' },
  ]
  const time: TimeEntry[] = [
    {
      id: 't1',
      activityId: 'a1',
      date: '2025-03-07',
      classificationCode: 'JW',
      workers: 1,
      straightHours: 500,
      otHours: 0,
      dtHours: 0,
    },
  ]

  it('earns hours from installed quantity, never from hours burned', () => {
    const m = activityMetrics(activity, progress, time)
    expect(m.pctComplete).toBeCloseTo(40)
    expect(m.progressBasis).toBe('quantity')
    expect(m.earnedHours).toBeCloseTo(400)
  })

  it('computes a production factor below 1.0 when the job is losing', () => {
    const m = activityMetrics(activity, progress, time)
    expect(m.productionFactor).toBeCloseTo(0.8)
    expect(m.rag).toBe('risk')
  })

  it('forecasts the estimate at completion from the current production factor', () => {
    const m = activityMetrics(activity, progress, time)
    // 500 spent + 600 remaining at 0.8 productivity = 1250.
    expect(m.eacHours).toBeCloseTo(1250)
    expect(m.varianceHours).toBeCloseTo(-250)
  })

  it('states the productivity needed from here to still hit budget', () => {
    const m = activityMetrics(activity, progress, time)
    // 600 hours of work left, 500 budget hours left to do it in.
    expect(m.tcpi).toBeCloseTo(1.2)
  })

  it('reports no recovery once the budget is spent', () => {
    const m = activityMetrics(activity, progress, [
      { ...time[0], straightHours: 1100 },
    ])
    expect(m.tcpi).toBeNull()
  })

  it('lets a percent override stand in where nothing is countable', () => {
    const punch: Activity = { ...activity, id: 'a2', budgetQty: 0, budgetHours: 100 }
    const m = activityMetrics(
      punch,
      [{ id: 'p9', activityId: 'a2', date: '2025-04-01', qtyInstalled: 0, pctOverride: 75, note: '' }],
      [],
    )
    expect(m.pctComplete).toBe(75)
    expect(m.progressBasis).toBe('override')
    expect(m.earnedHours).toBeCloseTo(75)
  })

  it('asks for progress when there is no quantity and no override', () => {
    const m = activityMetrics({ ...activity, budgetQty: 0 }, [], [])
    expect(m.progressBasis).toBe('none')
  })

  it('stays neutral before enough hours exist to judge', () => {
    const m = activityMetrics(activity, [], [])
    expect(m.rag).toBe('none')
    expect(m.productionFactor).toBe(1)
  })

  it('rolls the whole job up and keeps stray hours in the total', () => {
    const orphan: TimeEntry = { ...time[0], id: 't2', activityId: 'deleted', straightHours: 100 }
    const m = projectMetrics([activity], progress, [...time, orphan])
    expect(m.budgetHours).toBe(1000)
    expect(m.actualHours).toBe(600)
    expect(m.earnedHours).toBeCloseTo(400)
    expect(m.burnPct).toBeCloseTo(60)
    expect(m.completePct).toBeCloseTo(40)
  })

  it('builds cumulative plan, earned and actual lines', () => {
    const curve = sCurve([activity], progress, time)
    expect(curve.length).toBeGreaterThan(0)
    expect(curve[curve.length - 1].planned).toBeCloseTo(1000)

    const reported = curve.filter((p) => p.earned != null)
    const last = reported[reported.length - 1]
    expect(last.earned).toBeCloseTo(400)
    expect(last.actual).toBeCloseTo(500)

    // Cumulative lines never go backward.
    for (let i = 1; i < reported.length; i++) {
      expect(reported[i].earned!).toBeGreaterThanOrEqual(reported[i - 1].earned!)
      expect(reported[i].actual!).toBeGreaterThanOrEqual(reported[i - 1].actual!)
    }
  })

  it('stops the earned and spent lines after the last reported week', () => {
    // The plan runs four weeks; production was only reported in the first.
    const curve = sCurve([activity], progress, time)
    expect(curve.length).toBe(4)
    // A flat line running to the end of the plan would read as a stalled job
    // rather than one that simply has not happened yet.
    expect(curve[0].earned).not.toBeNull()
    expect(curve[curve.length - 1].earned).toBeNull()
    expect(curve[curve.length - 1].actual).toBeNull()
    // The plan line always runs the full width.
    expect(curve[curve.length - 1].planned).toBeCloseTo(1000)
  })

  it('projects a finish date from reported weeks only', () => {
    // Two weeks of production, 200 earned hours each, against a 1000 budget.
    const steady: ProgressEntry[] = [
      { id: 'q1', activityId: 'a1', date: '2025-03-05', qtyInstalled: 200, note: '' },
      { id: 'q2', activityId: 'a1', date: '2025-03-12', qtyInstalled: 200, note: '' },
    ]
    const curve = sCurve([activity], steady, time)
    // 400 of 1000 hours earned, so 600 left at 200 a week is three more weeks
    // from the last reported week start (Mar 10). The empty future weeks in
    // the curve must not drag the rate to zero.
    expect(projectedFinish(curve, 1000)).toBe('2025-03-31')
  })
})

// ---------------------------------------------------------------------------

describe('procurement', () => {
  const transformer: ProcurementItem = {
    id: 'g1',
    description: 'Pad-mount service transformer',
    specSection: '26 12 00',
    tag: 'T-1',
    supplier: '',
    poNumber: '',
    leadTimeWeeks: 115,
    approvalWeeks: 8,
    neededOnSite: '2027-06-01',
    status: 'identified',
    cost: 0,
    notes: '',
  }

  it('schedules backward from the date the gear has to be on site', () => {
    const ms = milestones(transformer)
    expect(ms.releaseBy).toBe('2025-03-18')
    expect(ms.submitBy).toBe('2025-01-21')
    expect(ms.neededOnSite).toBe('2027-06-01')
  })

  it('puts the full approval plus lead time between submittal and delivery', () => {
    const ms = milestones(transformer)
    const days =
      (Date.parse(ms.neededOnSite) - Date.parse(ms.submitBy)) / 86_400_000
    expect(days).toBe((115 + 8) * 7)
  })

  it('goes red once the submittal date has passed', () => {
    const s = procurementStatus(transformer, '2025-06-01')
    expect(s.nextAction).toMatch(/submittal/i)
    expect(s.daysRemaining).toBeLessThan(0)
    expect(s.rag).toBe('risk')
  })

  it('warns three weeks out', () => {
    const s = procurementStatus(transformer, '2025-01-08')
    expect(s.daysRemaining).toBe(13)
    expect(s.rag).toBe('watch')
  })

  it('is green with room to spare', () => {
    expect(procurementStatus(transformer, '2024-06-01').rag).toBe('go')
  })

  it('tracks the next milestone as the item advances', () => {
    const released = procurementStatus({ ...transformer, status: 'released' }, '2025-06-01')
    expect(released.nextAction).toMatch(/fabrication/i)
    expect(released.dueDate).toBe('2027-06-01')
  })

  it('stops chasing dates once the gear is on site', () => {
    const done = procurementStatus({ ...transformer, status: 'onsite' }, '2027-06-05')
    expect(done.dueDate).toBeNull()
    expect(done.rag).toBe('go')
  })

  it('quantifies the schedule damage of a blown submittal date', () => {
    // A year late to submit on a 123-week item pushes delivery out.
    expect(slipDays(transformer, '2026-01-21')).toBeGreaterThan(300)
    expect(slipDays(transformer, '2025-01-21')).toBe(0)
  })
})

// ---------------------------------------------------------------------------

describe('make-ready planning', () => {
  const activity: Activity = {
    id: 'a1',
    areaId: 'area1',
    phaseId: 'p1',
    name: 'Lighting — Level 3',
    budgetHours: 200,
    budgetQty: 120,
    unit: 'EA',
    plannedStart: '2025-04-07',
    plannedFinish: '2025-04-25',
    curve: 'uniform',
    predecessors: [],
    notes: '',
    sort: 0,
  }

  const constraint: Constraint = {
    id: 'c1',
    activityId: 'a1',
    type: 'material',
    description: 'Fixture package not approved',
    owner: 'Engineer',
    needBy: '2025-03-20',
    status: 'open',
  }

  it('treats an activity with no open constraints as ready to work', () => {
    expect(readiness(activity, [], '2025-04-01').ready).toBe(true)
  })

  it('marks an activity with an open constraint as not ready', () => {
    const r = readiness(activity, [constraint], '2025-04-01')
    expect(r.ready).toBe(false)
    expect(r.rag).toBe('risk')
    expect(r.openConstraints).toHaveLength(1)
  })

  it('releases the activity once the constraint clears', () => {
    const cleared: Constraint = { ...constraint, status: 'cleared', clearedDate: '2025-03-18' }
    expect(readiness(activity, [cleared], '2025-04-01').ready).toBe(true)
  })

  it('scores percent plan complete for a week', () => {
    const commitments: Commitment[] = [
      { id: '1', weekStart: '2025-04-07', description: 'a', promisedBy: 'Ruiz', completed: true },
      { id: '2', weekStart: '2025-04-07', description: 'b', promisedBy: 'Ruiz', completed: true },
      { id: '3', weekStart: '2025-04-07', description: 'c', promisedBy: 'Ruiz', completed: true },
      { id: '4', weekStart: '2025-04-07', description: 'd', promisedBy: 'Ruiz', completed: false, reasonCode: 'material' },
    ]
    const ppc = ppcForWeek(commitments, '2025-04-07')
    expect(ppc.planned).toBe(4)
    expect(ppc.completed).toBe(3)
    expect(ppc.pct).toBe(75)
    expect(ppc.rag).toBe('go') // 75% is the healthy threshold
    expect(ppc.reasons[0]).toEqual({ code: 'material', count: 1 })
  })

  it('goes red when the crew is missing most of its promises', () => {
    const commitments: Commitment[] = [
      { id: '1', weekStart: '2025-04-14', description: 'a', promisedBy: 'Ruiz', completed: true },
      { id: '2', weekStart: '2025-04-14', description: 'b', promisedBy: 'Ruiz', completed: false, reasonCode: 'manpower' },
      { id: '3', weekStart: '2025-04-14', description: 'c', promisedBy: 'Ruiz', completed: false, reasonCode: 'manpower' },
    ]
    expect(ppcForWeek(commitments, '2025-04-14').rag).toBe('risk')
    expect(topReasons(commitments)[0]).toMatchObject({ code: 'manpower', count: 2 })
  })
})
