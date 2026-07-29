import { useMemo } from 'react'
import type { Activity, Area, Phase, Project, Rag } from '../domain/types'
import { hoursPerWorkerWeek, projectWeeklyHours } from '../engine/curve'
import { dispatchPlan, type DispatchWeek } from '../engine/crew'
import {
  activityMetrics,
  projectMetrics,
  sCurve,
  type ActivityMetrics,
  type CurvePoint,
  type ProjectMetrics,
} from '../engine/earnedValue'
import { apprenticeRatio, stwfStatus } from '../engine/ratios'
import { itemsNeedingAction } from '../engine/procurement'
import { ppcForWeek, readiness, todayStr } from '../engine/schedule'
import { compositeRate, journeymanRate } from '../engine/wages'
import { weekKey } from '../engine/curve'

/**
 * Derived project data.
 *
 * Every screen reads from here rather than recomputing, so the number on the
 * dashboard and the number on the forecast can never disagree.
 */
export interface Derived {
  metrics: ProjectMetrics
  activityMetrics: Map<string, ActivityMetrics>
  weeklyHours: Record<string, number>
  dispatch: DispatchWeek[]
  curve: CurvePoint[]
  /** Fully-loaded blended rate from actual hours, falling back to journeyman. */
  blendedRate: number
  apprentice: ReturnType<typeof apprenticeRatio>
  stwf: ReturnType<typeof stwfStatus>
  procurementAlerts: ReturnType<typeof itemsNeedingAction>
  openConstraints: number
  notReadyActivities: number
  lastWeekPpc: ReturnType<typeof ppcForWeek>
  today: string
  areaById: Map<string, Area>
  phaseById: Map<string, Phase>
}

export function useDerived(project: Project): Derived {
  return useMemo(() => derive(project), [project])
}

export function derive(project: Project): Derived {
  const today = todayStr()
  const weekStartsOn = project.ruleProfile.workCalendar.weekStartsOn

  const am = new Map<string, ActivityMetrics>()
  for (const a of project.activities) {
    am.set(a.id, activityMetrics(a, project.progress, project.time))
  }

  const weeklyHours = projectWeeklyHours(project.activities, weekStartsOn)

  // Blend from hours actually worked; before any hours exist, price at
  // journeyman so an early forecast is a real number rather than zero.
  const mix: Record<string, number> = {}
  for (const e of project.time) {
    mix[e.classificationCode] =
      (mix[e.classificationCode] ?? 0) + e.straightHours + e.otHours + e.dtHours
  }
  const blended =
    Object.keys(mix).length > 0
      ? compositeRate(project.wagePackage, project.ruleProfile.classifications, mix)
      : journeymanRate(project.wagePackage, project.ruleProfile.classifications)

  const lastWeek = weekKey(
    new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10),
    weekStartsOn,
  )

  return {
    metrics: projectMetrics(project.activities, project.progress, project.time),
    activityMetrics: am,
    weeklyHours,
    dispatch: dispatchPlan(
      weeklyHours,
      hoursPerWorkerWeek(project.ruleProfile.workCalendar),
      project.ruleProfile,
      project.siteManpowerCap,
    ),
    curve: sCurve(project.activities, project.progress, project.time, weekStartsOn),
    blendedRate: blended,
    apprentice: apprenticeRatio(
      project.time,
      project.ruleProfile.classifications,
      project.ruleProfile,
    ),
    stwf: stwfStatus(
      project.time,
      project.ruleProfile.classifications,
      project.stwfPercent,
    ),
    procurementAlerts: itemsNeedingAction(project.procurement, today),
    openConstraints: project.constraints.filter((c) => c.status === 'open').length,
    notReadyActivities: project.activities.filter(
      (a) => !readiness(a, project.constraints, today).ready,
    ).length,
    lastWeekPpc: ppcForWeek(project.commitments, lastWeek),
    today,
    areaById: new Map(project.areas.map((a) => [a.id, a])),
    phaseById: new Map(project.phases.map((p) => [p.id, p])),
  }
}

/** Activities in one matrix cell — an area crossed with a phase. */
export function activitiesInCell(
  project: Project,
  areaId: string,
  phaseId: string,
): Activity[] {
  return project.activities.filter((a) => a.areaId === areaId && a.phaseId === phaseId)
}

export interface CellSummary {
  budgetHours: number
  earnedHours: number
  actualHours: number
  pctComplete: number
  productionFactor: number
  rag: Rag
  count: number
}

/** Roll a set of activities into one matrix cell reading. */
export function summarize(
  activities: Activity[],
  am: Map<string, ActivityMetrics>,
): CellSummary {
  let budgetHours = 0
  let earnedHours = 0
  let actualHours = 0

  for (const a of activities) {
    const m = am.get(a.id)
    if (!m) continue
    budgetHours += m.budgetHours
    earnedHours += m.earnedHours
    actualHours += m.actualHours
  }

  const pf = actualHours > 0 ? earnedHours / actualHours : 1

  return {
    budgetHours,
    earnedHours,
    actualHours,
    pctComplete: budgetHours > 0 ? (earnedHours / budgetHours) * 100 : 0,
    productionFactor: pf,
    rag: actualHours < 8 ? 'none' : pf >= 1 ? 'go' : pf >= 0.9 ? 'watch' : 'risk',
    count: activities.length,
  }
}

/** Sort areas so a parent is immediately followed by its children. */
export function orderedAreas(project: Project): Area[] {
  const roots = project.areas.filter((a) => !a.parentId).sort((a, b) => a.sort - b.sort)
  const out: Area[] = []
  const push = (area: Area) => {
    out.push(area)
    project.areas
      .filter((c) => c.parentId === area.id)
      .sort((a, b) => a.sort - b.sort)
      .forEach(push)
  }
  roots.forEach(push)
  // Anything orphaned by a deleted parent still has to show up somewhere.
  for (const a of project.areas) if (!out.includes(a)) out.push(a)
  return out
}

export function orderedPhases(project: Project): Phase[] {
  return [...project.phases].sort((a, b) => a.sort - b.sort)
}
