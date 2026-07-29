import { addDays, addWeeks, format, parseISO, subWeeks } from 'date-fns'
import { curveWeights, weeksInRange } from '../engine/curve'
import { LONG_LEAD_TEMPLATES, uid } from './templates'
import type {
  Activity,
  Area,
  Commitment,
  Constraint,
  ProcurementItem,
  ProgressEntry,
  Project,
  Requisition,
  TimeEntry,
} from './types'

/**
 * A worked example.
 *
 * A blank app is impossible to evaluate — a GF deciding whether this is worth
 * their time needs to see a real job with real numbers, mid-flight, already
 * showing a couple of problems. This builds a five-story commercial job about
 * forty percent through, running slightly behind on labor, with a transformer
 * that is late to submit and a fixture package holding up level three.
 *
 * Dates are generated relative to today so the demo never goes stale.
 */

/** Deterministic pseudo-random, so the demo looks the same every time. */
function seeded(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

const iso = (d: Date) => format(d, 'yyyy-MM-dd')

export function buildDemoProject(base: Project): Project {
  const rand = seeded(20260729)
  const today = new Date()
  // The job started five months ago and runs about a year.
  const start = subWeeks(today, 22)
  const finish = addWeeks(today, 30)

  const p: Project = {
    ...base,
    name: 'Harbor Point Medical Office Building',
    number: '24-118',
    generalContractor: 'Sundt Construction',
    owner: 'Harbor Point Health Partners',
    address: '4100 Harbor Point Drive',
    city: 'Long Beach',
    county: 'Los Angeles',
    contractType: 'public',
    complianceEnabled: true,
    stwfRequired: true,
    stwfPercent: 60,
    contractValue: 14_800_000,
    startDate: iso(start),
    targetFinish: iso(finish),
    siteManpowerCap: 34,
  }

  // --- Areas -------------------------------------------------------------
  const areaNames = [
    'Level 1 — Lobby & Retail',
    'Level 2 — Clinic',
    'Level 3 — Imaging',
    'Level 4 — Offices',
    'Level 5 — Mechanical',
    'Site & Underground',
  ]
  const areas: Area[] = areaNames.map((name, i) => ({ id: uid(), name, sort: i }))
  p.areas = areas

  const phase = (code: string) => p.phases.find((x) => x.code === code)!

  // --- Activities --------------------------------------------------------
  // Each phase runs through the building on its own stagger, the way the work
  // actually sequences: underground first, then gear, then floor by floor.
  const activities: Activity[] = []
  let sort = 0

  const plan: {
    phase: string
    label: string
    hoursPerArea: number
    qtyPerArea: number
    unit: string
    offsetWeeks: number
    durWeeks: number
    staggerWeeks: number
    curve: Activity['curve']
    areas?: number[]
  }[] = [
    { phase: 'UG', label: 'Underground duct bank & site', hoursPerArea: 1450, qtyPerArea: 2400, unit: 'LF', offsetWeeks: 0, durWeeks: 8, staggerWeeks: 0, curve: 'bell', areas: [5] },
    { phase: 'GEAR', label: 'Gear set & terminations', hoursPerArea: 620, qtyPerArea: 14, unit: 'EA', offsetWeeks: 8, durWeeks: 6, staggerWeeks: 1, curve: 'frontLoaded', areas: [0, 4, 5] },
    { phase: 'FEED', label: 'Feeders & riser', hoursPerArea: 780, qtyPerArea: 1800, unit: 'LF', offsetWeeks: 10, durWeeks: 8, staggerWeeks: 2, curve: 'bell' },
    { phase: 'RI', label: 'Branch rough-in', hoursPerArea: 1720, qtyPerArea: 5200, unit: 'LF', offsetWeeks: 14, durWeeks: 10, staggerWeeks: 3, curve: 'bell' },
    { phase: 'LTG', label: 'Lighting rough & fixtures', hoursPerArea: 940, qtyPerArea: 310, unit: 'EA', offsetWeeks: 24, durWeeks: 8, staggerWeeks: 3, curve: 'bell' },
    { phase: 'DEV', label: 'Devices & plates', hoursPerArea: 460, qtyPerArea: 420, unit: 'EA', offsetWeeks: 30, durWeeks: 6, staggerWeeks: 3, curve: 'backLoaded' },
    { phase: 'FA', label: 'Fire alarm devices & wiring', hoursPerArea: 380, qtyPerArea: 180, unit: 'EA', offsetWeeks: 28, durWeeks: 7, staggerWeeks: 2, curve: 'uniform' },
    { phase: 'LV', label: 'Low voltage & nurse call', hoursPerArea: 420, qtyPerArea: 160, unit: 'EA', offsetWeeks: 30, durWeeks: 7, staggerWeeks: 2, curve: 'uniform' },
    { phase: 'TRIM', label: 'Trim & finish', hoursPerArea: 340, qtyPerArea: 0, unit: 'LOT', offsetWeeks: 36, durWeeks: 5, staggerWeeks: 2, curve: 'backLoaded' },
    { phase: 'TEST', label: 'Test, startup & commissioning', hoursPerArea: 220, qtyPerArea: 0, unit: 'LOT', offsetWeeks: 42, durWeeks: 4, staggerWeeks: 1, curve: 'uniform' },
    { phase: 'PUNCH', label: 'Punch & closeout', hoursPerArea: 160, qtyPerArea: 0, unit: 'LOT', offsetWeeks: 46, durWeeks: 4, staggerWeeks: 1, curve: 'backLoaded' },
  ]

  for (const row of plan) {
    const targets = row.areas ?? [0, 1, 2, 3, 4]
    targets.forEach((areaIdx, n) => {
      const s = addWeeks(start, row.offsetWeeks + n * row.staggerWeeks)
      const f = addDays(addWeeks(s, row.durWeeks), -1)
      const jitter = 0.85 + rand() * 0.3
      activities.push({
        id: uid(),
        areaId: areas[areaIdx].id,
        phaseId: phase(row.phase).id,
        name: row.label,
        budgetHours: Math.round((row.hoursPerArea * jitter) / 10) * 10,
        budgetQty: Math.round(row.qtyPerArea * jitter),
        unit: row.unit,
        plannedStart: iso(s),
        plannedFinish: iso(f),
        curve: row.curve,
        predecessors: [],
        notes: '',
        sort: sort++,
      })
    })
  }
  p.activities = activities

  // --- Progress and hours ------------------------------------------------
  // Generated week by week rather than as one lump, so the S-curve, the
  // production-factor trend and the projected finish all have real history to
  // read. Branch rough-in and lighting deliberately run behind, because a demo
  // where everything is green teaches a GF nothing.
  const progress: ProgressEntry[] = []
  const time: TimeEntry[] = []
  const todayIso = iso(today)

  // Roughly the crew mix the plan calls for, so the compliance screens have
  // something honest to read.
  const splits: [string, number][] = [
    ['GF', 0.05],
    ['FOR', 0.11],
    ['JW', 0.5],
    ['JW-NG', 0.17],
    ['A6', 0.1],
    ['A3', 0.07],
  ]

  for (const a of activities) {
    if (a.plannedStart > todayIso) continue

    const phaseCode = p.phases.find((x) => x.id === a.phaseId)!.code
    const behind = phaseCode === 'RI' || phaseCode === 'LTG'

    // How much slower than plan the work is actually going in.
    const drag = phaseCode === 'RI' ? 0.84 : phaseCode === 'LTG' ? 0.72 : 0.98 + rand() * 0.06
    // Productivity: below 1.0 means hours are outrunning the work in place.
    const pf = phaseCode === 'RI' ? 0.85 : phaseCode === 'LTG' ? 0.78 : 0.99 + rand() * 0.1

    const weeks = weeksInRange(a.plannedStart, a.plannedFinish, 1)
    const weights = curveWeights(a.curve, weeks.length)

    let cumPct = 0
    let cumQty = 0

    for (let i = 0; i < weeks.length; i++) {
      const wk = weeks[i]
      if (wk > todayIso) break

      const gained = Math.min(weights[i] * drag, 1 - cumPct)
      if (gained <= 0.0005) continue
      cumPct += gained

      // Report mid-week, never past today.
      const day = iso(addDays(parseISO(wk), 4))
      const date = day > todayIso ? todayIso : day

      if (a.budgetQty > 0) {
        const qty = Math.round(a.budgetQty * cumPct) - cumQty
        cumQty += qty
        if (qty > 0) {
          progress.push({ id: uid(), activityId: a.id, date, qtyInstalled: qty, note: '' })
        }
      } else {
        progress.push({
          id: uid(),
          activityId: a.id,
          date,
          qtyInstalled: 0,
          pctOverride: Math.round(cumPct * 100),
          note: '',
        })
      }

      const earnedThisWeek = a.budgetHours * gained
      const actualThisWeek = earnedThisWeek / pf

      for (const [code, share] of splits) {
        const hours = actualThisWeek * share
        if (hours < 0.5) continue
        time.push({
          id: uid(),
          activityId: a.id,
          date,
          classificationCode: code,
          workers: Math.max(1, Math.round(hours / 40)),
          straightHours: Math.round(hours * 0.93 * 10) / 10,
          otHours: Math.round(hours * 0.07 * 10) / 10,
          dtHours: 0,
        })
      }
    }

    // Work whose window closed and that is not one of the two problem phases
    // finished — close out the last few percent left by the curve.
    if (a.plannedFinish < todayIso && !behind && cumPct < 1 && cumPct > 0) {
      const gained = 1 - cumPct
      const date = a.plannedFinish
      if (a.budgetQty > 0) {
        const qty = a.budgetQty - cumQty
        if (qty > 0) progress.push({ id: uid(), activityId: a.id, date, qtyInstalled: qty, note: '' })
      } else {
        progress.push({ id: uid(), activityId: a.id, date, qtyInstalled: 0, pctOverride: 100, note: '' })
      }
      const actualThisWeek = (a.budgetHours * gained) / pf
      for (const [code, share] of splits) {
        const hours = actualThisWeek * share
        if (hours < 0.5) continue
        time.push({
          id: uid(),
          activityId: a.id,
          date,
          classificationCode: code,
          workers: 1,
          straightHours: Math.round(hours * 10) / 10,
          otHours: 0,
          dtHours: 0,
        })
      }
    }
  }
  p.progress = progress
  p.time = time

  // --- Constraints -------------------------------------------------------
  const l3Lighting = activities.find(
    (a) => a.areaId === areas[2].id && p.phases.find((x) => x.id === a.phaseId)?.code === 'LTG',
  )
  const l4Rough = activities.find(
    (a) => a.areaId === areas[3].id && p.phases.find((x) => x.id === a.phaseId)?.code === 'RI',
  )

  const constraints: Constraint[] = [
    {
      id: uid(),
      activityId: l3Lighting?.id,
      type: 'submittal',
      description: 'Imaging suite fixture package rejected — resubmit with revised lens spec',
      owner: 'Engineer of record',
      needBy: iso(addWeeks(today, 1)),
      status: 'open',
    },
    {
      id: uid(),
      activityId: l4Rough?.id,
      type: 'predecessor',
      description: 'Metal stud framing incomplete, north half of Level 4',
      owner: 'GC — Sundt',
      needBy: iso(addWeeks(today, 2)),
      status: 'open',
    },
    {
      id: uid(),
      type: 'rfi',
      description: 'RFI 214 — panel schedule conflict, LP-3B vs drawing E4.2',
      owner: 'Engineer of record',
      needBy: iso(addWeeks(today, 3)),
      status: 'open',
    },
    {
      id: uid(),
      type: 'access',
      description: 'Roof crane pick window for mechanical yard feeders',
      owner: 'GC — Sundt',
      needBy: iso(subWeeks(today, 2)),
      status: 'cleared',
      clearedDate: iso(subWeeks(today, 3)),
    },
  ]
  p.constraints = constraints

  // --- Procurement -------------------------------------------------------
  // The gear that had to be ordered before the job broke ground is where it
  // should be. The story here is the lighting package: its submittal came back
  // rejected, the approval date has already passed, and it is the same item
  // holding up Level 3 in the constraint log.
  const pick = (name: string) => LONG_LEAD_TEMPLATES.find((t) => t.description === name)!

  const procurement: ProcurementItem[] = [
    mkItem(pick('Pad-mount service transformer'), 'T-1', addWeeks(today, 18), 'shipped', 148_000),
    mkItem(pick('Low-voltage draw-out switchgear'), 'SWGR-1', addWeeks(today, 22), 'released', 396_000),
    mkItem(pick('Automatic transfer switch'), 'ATS-1', addWeeks(today, 20), 'released', 74_000),
    mkItem(pick('Standby generator'), 'GEN-1', addWeeks(today, 26), 'released', 288_000),
    mkItem(pick('Distribution panelboards'), 'LP/HP series', addWeeks(today, 9), 'shipped', 92_000),
    // Rejected submittal — approval was due ten weeks ago and the clock ran out.
    mkItem(pick('Lighting fixture package'), 'Type A–M', addWeeks(today, 6), 'submitted', 410_000),
    // Release date lands about now: the one worth chasing this week.
    mkItem(pick('Fire alarm control panel & devices'), 'FACP', addWeeks(today, 14), 'approved', 118_000),
    mkItem(pick('Dry-type transformers'), 'XFMR T2–T9', addWeeks(today, 4), 'onsite', 63_000),
  ]
  p.procurement = procurement

  function mkItem(
    tpl: (typeof LONG_LEAD_TEMPLATES)[number],
    tag: string,
    needed: Date,
    status: ProcurementItem['status'],
    cost: number,
  ): ProcurementItem {
    return {
      id: uid(),
      description: tpl.description,
      specSection: tpl.specSection,
      tag,
      supplier: 'One Source / Graybar',
      poNumber: status === 'identified' ? '' : `PO-${Math.floor(rand() * 9000 + 1000)}`,
      leadTimeWeeks: tpl.leadTimeWeeks,
      approvalWeeks: tpl.approvalWeeks,
      neededOnSite: iso(needed),
      status,
      cost,
      notes: '',
    }
  }

  // --- Commitments (PPC) -------------------------------------------------
  const commitments: Commitment[] = []
  const names = ['Ruiz', 'Delgado', 'Okafor', 'Chen', 'Barrera']
  for (let w = 6; w >= 1; w--) {
    const weekStart = iso(subWeeks(today, w))
    const count = 6 + Math.floor(rand() * 3)
    for (let i = 0; i < count; i++) {
      const hit = rand() > (w <= 2 ? 0.34 : 0.22)
      commitments.push({
        id: uid(),
        weekStart,
        description: sampleCommitment(rand),
        promisedBy: names[Math.floor(rand() * names.length)],
        completed: hit,
        reasonCode: hit
          ? undefined
          : (['material', 'priorWork', 'manpower', 'information', 'access'] as const)[
              Math.floor(rand() * 5)
            ],
      })
    }
  }
  p.commitments = commitments

  // --- Requisitions ------------------------------------------------------
  const reqs: Requisition[] = [
    {
      id: uid(),
      number: 'REQ-041',
      areaId: areas[3].id,
      phaseId: phase('RI').id,
      neededBy: iso(addWeeks(today, 1)),
      deliverTo: 'Level 4 — north stair landing',
      status: 'sent',
      isPrefabKit: false,
      lines: [
        { id: uid(), description: '3/4" EMT, 10\' stick', catalogNo: 'EMT075', unit: 'EA', qty: 260 },
        { id: uid(), description: '3/4" EMT set screw connector', catalogNo: 'SSC075', unit: 'EA', qty: 500 },
        { id: uid(), description: '4" square box, 2-1/8" deep', catalogNo: '4SD212', unit: 'EA', qty: 180 },
        { id: uid(), description: '#12 THHN, black', catalogNo: 'THHN12B', unit: 'LF', qty: 8000 },
      ],
      notes: '',
    },
    {
      id: uid(),
      number: 'REQ-042',
      areaId: areas[1].id,
      phaseId: phase('DEV').id,
      neededBy: iso(addWeeks(today, 3)),
      deliverTo: 'Prefab shop — kit and stage',
      status: 'draft',
      isPrefabKit: true,
      lines: [
        { id: uid(), description: 'Exam room device kit (assembled)', catalogNo: 'KIT-EXAM', unit: 'EA', qty: 42 },
        { id: uid(), description: '20A duplex receptacle, hospital grade', catalogNo: 'HG5362', unit: 'EA', qty: 168 },
        { id: uid(), description: 'Stainless device plate, 1-gang', catalogNo: 'SS1G', unit: 'EA', qty: 168 },
      ],
      notes: 'Kit by room number, tag per the room schedule.',
    },
  ]
  p.requisitions = reqs

  // --- Daily logs & T&M --------------------------------------------------
  p.dailyLogs = [
    {
      id: uid(),
      date: iso(addDays(today, -1)),
      weather: 'Clear',
      temperature: '74°F',
      workPerformed:
        'Branch rough-in continued Level 4 south. Feeder pulls to LP-3B complete. Fire alarm rough started Level 2.',
      delays:
        'North half of Level 4 still not framed — moved four hands to Level 2 fire alarm rather than send them home.',
      visitors: 'DSA inspector, 10:00–11:30. Owner walk 14:00.',
      safetyTopic: 'Ladder safety and three points of contact',
      notes: '',
      photos: [],
    },
  ]

  p.tmTickets = [
    {
      id: uid(),
      number: 'TM-018',
      date: iso(addDays(today, -4)),
      description:
        'Relocate six exam room circuits per ASI-12 after casework revision, Level 2 east.',
      reference: 'ASI-12',
      labor: [
        { id: uid(), classificationCode: 'FOR', workers: 1, hours: 8, otHours: 0 },
        { id: uid(), classificationCode: 'JW', workers: 2, hours: 16, otHours: 0 },
        { id: uid(), classificationCode: 'A6', workers: 1, hours: 8, otHours: 0 },
      ],
      materials: [
        { id: uid(), description: '3/4" EMT, 10\' stick', qty: 24, unit: 'EA', unitCost: 12.4 },
        { id: uid(), description: '#12 THHN', qty: 900, unit: 'LF', unitCost: 0.28 },
      ],
      equipment: 'Scissor lift, 1 day',
      signedBy: '',
      signedTitle: '',
      status: 'draft',
    },
  ]

  return p
}

function sampleCommitment(rand: () => number): string {
  const options = [
    'Complete branch rough-in, Level 4 south corridor',
    'Pull and terminate feeders to LP-3B',
    'Set and trim panels, Level 2 electrical room',
    'Fire alarm rough-in, Level 2 patient corridor',
    'Hang fixtures, Level 1 lobby',
    'Underground stub-ups at the generator pad',
    'Device trim, Level 2 exam rooms 201–214',
    'Low voltage backbone, IDF-3 to IDF-4',
    'Gear terminations, main electrical room',
    'Megger and label Level 3 branch circuits',
  ]
  return options[Math.floor(rand() * options.length)]
}
