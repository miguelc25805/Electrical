/**
 * Domain model for GF Field Command.
 *
 * One `Project` holds everything for one job. That keeps persistence, backup,
 * export and hand-off trivial: a project is a single JSON file a GF can email,
 * drop on a thumb drive, or hand to the incoming foreman.
 */

export type ID = string

/** ISO `YYYY-MM-DD`. Dates on a job are days, never timestamps. */
export type DateStr = string

export const SCHEMA_VERSION = 1

// ---------------------------------------------------------------------------
// Union rules — every value here is editable so another local adopts the tool
// by changing one screen rather than waiting on a code change.
// ---------------------------------------------------------------------------

export type ClassKind =
  | 'generalForeman'
  | 'foreman'
  | 'journeyman'
  | 'apprentice'
  | 'trainee'

export interface Classification {
  code: string
  label: string
  kind: ClassKind
  /** Percent of the journeyman base rate. JW is 100. */
  wagePct: number
  /**
   * Counts on the journeyman side of an apprentice ratio. Foremen and the GF
   * are journey-level; apprentices and CW/CE trainees are not.
   */
  journeyLevel: boolean
  /** Apprentice period (1-based), for dispatch requests and ratio reporting. */
  apprenticePeriod?: number
  /**
   * Journey-level worker who graduated a state-approved apprenticeship.
   * Drives the Skilled & Trained Workforce percentage on covered public work.
   */
  apprenticeshipGraduate?: boolean
  /** Hidden from pickers unless the local actually uses the classification. */
  enabled: boolean
}

export interface OvertimeRules {
  /** Hours in a day past which OT begins. */
  dailyThreshold: number
  dailyMultiplier: number
  /** Hours in a day past which double time begins. 0 disables. */
  doubleTimeThreshold: number
  doubleTimeMultiplier: number
  weeklyThreshold: number
  saturdayMultiplier: number
  sundayMultiplier: number
  holidayMultiplier: number
}

export interface WorkCalendar {
  /** 4 for a 4×10, 5 for a 5×8. */
  daysPerWeek: number
  hoursPerDay: number
  /** 0 = Sunday. Most inside work starts Monday. */
  weekStartsOn: number
  holidays: DateStr[]
}

export interface RuleProfile {
  name: string
  localUnion: string
  region: string
  classifications: Classification[]

  /** Crew size (inclusive) at which the agreement requires a foreman. */
  foremanRequiredAtCrew: number
  /** Journeymen one foreman may supervise before a second is required. */
  journeymenPerForeman: number
  /** Number of foremen on a job that triggers designating a general foreman. */
  generalForemanAtForemen: number

  /**
   * State public-works ratio: journeyman hours permitted per apprentice hour,
   * totaled over the life of the project. California is 5 (a 1:5 ratio).
   */
  publicWorksJwHoursPerApprentice: number
  /**
   * On-the-job crew ratio from the agreement, expressed as the journeyman
   * count after which each additional journeyman allows another apprentice.
   * L11's 2026-2031 agreement moved to 1:1 starting with the second journeyman.
   */
  cbaApprenticeAllowedAfterJw: number

  workCalendar: WorkCalendar
  overtime: OvertimeRules
  shiftPremiums: { name: string; multiplier: number }[]
}

// ---------------------------------------------------------------------------
// Wages
// ---------------------------------------------------------------------------

/**
 * How a fringe is computed. Prevailing-wage determinations mix both: H&W,
 * pension and training are flat per-hour amounts, while NEBF (3% of base) and
 * AMF (0.5% of base) are percentages that get factored at the overtime
 * multiplier along with the base rate.
 */
export type FringeBasis = 'flat' | 'pctOfBase'

export interface Fringe {
  code: string
  label: string
  amount: number
  basis: FringeBasis
  /** True when the fringe is multiplied by the OT factor, as NEBF and AMF are. */
  otFactored: boolean
}

export interface WagePackage {
  /** Journeyman wireman base hourly rate. Every classification derives from it. */
  baseHourlyJW: number
  fringes: Fringe[]
  /** Employer payroll burden (FICA, SUI, workers' comp) as a percent of gross. */
  burdenPct: number
}

// ---------------------------------------------------------------------------
// Work breakdown — the spine. Areas × phases define activities, and every
// hour, quantity, material and constraint hangs off an activity.
// ---------------------------------------------------------------------------

export interface Area {
  id: ID
  name: string
  /** Supports Building ▸ Floor ▸ Zone without a separate level concept. */
  parentId?: ID
  sort: number
}

/**
 * A phase code. Deliberately carries no color: eleven hues nobody can tell
 * apart is not identity. Phases are named by their code in text everywhere,
 * and color is reserved for magnitude (the matrix heat grid) and status.
 */
export interface Phase {
  id: ID
  code: string
  label: string
  sort: number
}

export type CurveShape = 'uniform' | 'bell' | 'frontLoaded' | 'backLoaded'

export interface Activity {
  id: ID
  areaId: ID
  phaseId: ID
  name: string
  /** Budgeted man-hours from the estimate. The denominator for everything. */
  budgetHours: number
  /** Budgeted installed quantity, e.g. 1200 LF of 3/4" EMT. Optional. */
  budgetQty: number
  unit: string
  plannedStart: DateStr
  plannedFinish: DateStr
  curve: CurveShape
  predecessors: ID[]
  notes: string
  sort: number
}

/**
 * Field-reported production. Quantities are deltas (what went in today) so a
 * foreman never has to remember a running total. `pctOverride` covers work with
 * nothing countable — testing, startup, punch.
 */
export interface ProgressEntry {
  id: ID
  activityId: ID
  date: DateStr
  qtyInstalled: number
  /** Absolute percent snapshot, 0-100. Wins over quantity when set. */
  pctOverride?: number
  note: string
}

/** Hours to a cost code, split by classification so ratio math stays honest. */
export interface TimeEntry {
  id: ID
  activityId: ID
  date: DateStr
  classificationCode: string
  workers: number
  straightHours: number
  otHours: number
  dtHours: number
}

// ---------------------------------------------------------------------------
// Make-ready planning — Last Planner in the vocabulary foremen already use.
// ---------------------------------------------------------------------------

export type ConstraintType =
  | 'material'
  | 'submittal'
  | 'rfi'
  | 'access'
  | 'predecessor'
  | 'inspection'
  | 'permit'
  | 'engineering'
  | 'other'

export interface Constraint {
  id: ID
  activityId?: ID
  type: ConstraintType
  description: string
  /** Who owes the answer — GC, engineer, supplier, another trade. */
  owner: string
  needBy: DateStr
  status: 'open' | 'cleared'
  clearedDate?: DateStr
}

/** A weekly promise, scored at week's end to produce Percent Plan Complete. */
export interface Commitment {
  id: ID
  weekStart: DateStr
  activityId?: ID
  description: string
  promisedBy: string
  completed: boolean
  /** Why a promise missed. The reason codes are what actually drive improvement. */
  reasonCode?:
    | 'material'
    | 'manpower'
    | 'priorWork'
    | 'information'
    | 'access'
    | 'weather'
    | 'equipment'
    | 'rework'
    | 'other'
}

// ---------------------------------------------------------------------------
// Materials & procurement
// ---------------------------------------------------------------------------

export type ProcurementStatus =
  | 'identified'
  | 'submitted'
  | 'approved'
  | 'released'
  | 'shipped'
  | 'onsite'

export const PROCUREMENT_STAGES: ProcurementStatus[] = [
  'identified',
  'submitted',
  'approved',
  'released',
  'shipped',
  'onsite',
]

/**
 * A long-lead item. With 2026 switchgear at 40-80 weeks and pad-mount
 * transformers at 110-130, these are scheduled backward from the date the
 * item has to be on site — never forward from today.
 */
export interface ProcurementItem {
  id: ID
  description: string
  specSection: string
  tag: string
  supplier: string
  poNumber: string
  /** Weeks from release to delivery, per the quote. */
  leadTimeWeeks: number
  /** Weeks to prepare, submit and get the submittal back approved. */
  approvalWeeks: number
  neededOnSite: DateStr
  status: ProcurementStatus
  submittedDate?: DateStr
  approvedDate?: DateStr
  releasedDate?: DateStr
  shippedDate?: DateStr
  onsiteDate?: DateStr
  cost: number
  activityId?: ID
  notes: string
}

export interface MaterialLine {
  id: ID
  description: string
  catalogNo: string
  unit: string
  qty: number
}

export type RequisitionStatus = 'draft' | 'sent' | 'confirmed' | 'delivered'

/** A pick list for the supply house or the prefab shop, tied to a work face. */
export interface Requisition {
  id: ID
  number: string
  activityId?: ID
  areaId?: ID
  phaseId?: ID
  neededBy: DateStr
  deliverTo: string
  status: RequisitionStatus
  /** Prefab kits get pulled and staged rather than dropped loose. */
  isPrefabKit: boolean
  lines: MaterialLine[]
  notes: string
}

// ---------------------------------------------------------------------------
// Documentation — the paper that wins change orders and closes disputes.
// ---------------------------------------------------------------------------

export interface DailyLog {
  id: ID
  date: DateStr
  weather: string
  temperature: string
  workPerformed: string
  delays: string
  visitors: string
  safetyTopic: string
  notes: string
  /** Data URLs, kept local with the rest of the project. */
  photos: string[]
}

export interface TMLaborLine {
  id: ID
  classificationCode: string
  workers: number
  hours: number
  otHours: number
}

export interface TMMaterialLine {
  id: ID
  description: string
  qty: number
  unit: string
  unitCost: number
}

export interface TMTicket {
  id: ID
  number: string
  date: DateStr
  description: string
  /** RFI, ASI, CO or field directive that authorized the work. */
  reference: string
  labor: TMLaborLine[]
  materials: TMMaterialLine[]
  equipment: string
  signedBy: string
  signedTitle: string
  /** Data URL of the on-screen signature. */
  signatureDataUrl?: string
  status: 'draft' | 'signed' | 'submitted'
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
  id: ID
  schemaVersion: number
  name: string
  number: string
  generalContractor: string
  owner: string
  address: string
  city: string
  county: string
  contractType: 'public' | 'private'

  /** Public-works compliance tracking. On by default for public work. */
  complianceEnabled: boolean
  /** Skilled & Trained Workforce applies (AB 3018 covered project). */
  stwfRequired: boolean
  /** Required percent of journey-level hours from apprenticeship graduates. */
  stwfPercent: number

  contractValue: number
  startDate: DateStr
  targetFinish: DateStr
  /** Hard ceiling on bodies the site can absorb. Flags over-manning. */
  siteManpowerCap: number

  ruleProfile: RuleProfile
  wagePackage: WagePackage

  areas: Area[]
  phases: Phase[]
  activities: Activity[]
  progress: ProgressEntry[]
  time: TimeEntry[]
  constraints: Constraint[]
  commitments: Commitment[]
  procurement: ProcurementItem[]
  requisitions: Requisition[]
  dailyLogs: DailyLog[]
  tmTickets: TMTicket[]

  createdAt: string
  updatedAt: string
}

/** Traffic-light status. The only status vocabulary in the app. */
export type Rag = 'go' | 'watch' | 'risk' | 'none'
