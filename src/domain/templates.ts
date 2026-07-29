import type {
  Classification,
  Phase,
  RuleProfile,
  WagePackage,
} from './types'

/**
 * Seeded defaults.
 *
 * Everything here is a starting point, not a rule. Agreements differ between
 * locals and change every term, so the app treats these as editable data — a
 * local adopts the tool by changing the Rules screen, never the code. The app
 * prompts the user to check the seeded wage figures against their current wage
 * sheet before trusting any dollar forecast.
 */

export const uid = (): string =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`

// ---------------------------------------------------------------------------
// Phase codes — how electrical work actually gets broken down and tracked.
// ---------------------------------------------------------------------------

export const PHASE_TEMPLATE: Omit<Phase, 'id'>[] = [
  { code: 'UG', label: 'Underground / Site', sort: 0 },
  { code: 'FEED', label: 'Feeders & Distribution', sort: 1 },
  { code: 'GEAR', label: 'Gear & Equipment', sort: 2 },
  { code: 'RI', label: 'Branch Rough-In', sort: 3 },
  { code: 'LTG', label: 'Lighting', sort: 4 },
  { code: 'DEV', label: 'Devices', sort: 5 },
  { code: 'FA', label: 'Fire Alarm', sort: 6 },
  { code: 'LV', label: 'Low Voltage / Systems', sort: 7 },
  { code: 'TRIM', label: 'Trim & Finish', sort: 8 },
  { code: 'TEST', label: 'Test & Startup', sort: 9 },
  { code: 'PUNCH', label: 'Punch & Closeout', sort: 10 },
]

// ---------------------------------------------------------------------------
// Classifications
// ---------------------------------------------------------------------------

/** Inside apprenticeships run five years / ten periods on a rising percentage. */
const apprenticeSteps: Classification[] = Array.from({ length: 10 }, (_, i) => {
  const period = i + 1
  return {
    code: `A${period}`,
    label: `Apprentice — ${ordinal(period)} Period`,
    kind: 'apprentice' as const,
    wagePct: 40 + i * 5,
    journeyLevel: false,
    apprenticePeriod: period,
    enabled: true,
  }
})

/**
 * Construction Wireman / Construction Electrician. Many California locals use
 * them, some don't — seeded but switched off so they stay out of the way until
 * a local turns them on.
 */
const cwCeSteps: Classification[] = [
  ...Array.from({ length: 5 }, (_, i) => ({
    code: `CW${i + 1}`,
    label: `Construction Wireman ${i + 1}`,
    kind: 'trainee' as const,
    wagePct: 40 + i * 5,
    journeyLevel: false,
    enabled: false,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    code: `CE${i + 1}`,
    label: `Construction Electrician ${i + 1}`,
    kind: 'trainee' as const,
    wagePct: 65 + i * 5,
    journeyLevel: false,
    enabled: false,
  })),
]

export const DEFAULT_CLASSIFICATIONS: Classification[] = [
  {
    code: 'GF',
    label: 'General Foreman',
    kind: 'generalForeman',
    wagePct: 120,
    journeyLevel: true,
    apprenticeshipGraduate: true,
    enabled: true,
  },
  {
    code: 'FOR',
    label: 'Foreman',
    kind: 'foreman',
    wagePct: 110,
    journeyLevel: true,
    apprenticeshipGraduate: true,
    enabled: true,
  },
  {
    code: 'JW',
    label: 'Journeyman Wireman',
    kind: 'journeyman',
    wagePct: 100,
    journeyLevel: true,
    apprenticeshipGraduate: true,
    enabled: true,
  },
  {
    code: 'JW-NG',
    label: 'Journeyman — Non-Graduate',
    kind: 'journeyman',
    wagePct: 100,
    journeyLevel: true,
    // Journey-level but did not graduate a state-approved apprenticeship, so
    // these hours do not count toward a Skilled & Trained Workforce percentage.
    apprenticeshipGraduate: false,
    enabled: true,
  },
  ...apprenticeSteps,
  ...cwCeSteps,
]

// ---------------------------------------------------------------------------
// Rule profile
// ---------------------------------------------------------------------------

export const DEFAULT_RULE_PROFILE: RuleProfile = {
  name: 'IBEW Inside — Southern California (edit to match your agreement)',
  localUnion: 'IBEW Local 11',
  region: 'Los Angeles County, CA',
  classifications: DEFAULT_CLASSIFICATIONS,

  // Inside agreements commonly require a foreman once a job carries three or
  // more workers, and a foreman supervises on the order of ten journeymen
  // before a second foreman is required. When two foremen are on the job, one
  // is designated general foreman. Confirm against your own agreement.
  foremanRequiredAtCrew: 3,
  journeymenPerForeman: 10,
  generalForemanAtForemen: 2,

  // California public works: one apprentice hour per five journeyman hours,
  // per craft, totaled at the end of the project.
  publicWorksJwHoursPerApprentice: 5,
  // L11's 2026-2031 agreement allows 1:1 starting with the second journeyman.
  cbaApprenticeAllowedAfterJw: 1,

  workCalendar: {
    daysPerWeek: 5,
    hoursPerDay: 8,
    weekStartsOn: 1,
    holidays: [],
  },

  overtime: {
    dailyThreshold: 8,
    dailyMultiplier: 1.5,
    doubleTimeThreshold: 12,
    doubleTimeMultiplier: 2,
    weeklyThreshold: 40,
    saturdayMultiplier: 1.5,
    sundayMultiplier: 2,
    holidayMultiplier: 2,
  },

  shiftPremiums: [
    { name: 'Day shift', multiplier: 1 },
    { name: 'Swing shift', multiplier: 1.15 },
    { name: 'Graveyard shift', multiplier: 1.25 },
  ],
}

// ---------------------------------------------------------------------------
// Wage package
// ---------------------------------------------------------------------------

/**
 * Structure matters more than the seeded numbers. Prevailing-wage
 * determinations mix flat per-hour fringes with percentage-of-base fringes,
 * and the percentage ones (NEBF at 3%, AMF at 0.5%) are factored at the
 * overtime multiplier along with the base rate. Getting that split right is
 * why the composite rate can't just be one number.
 *
 * Verify every figure against your current wage sheet before relying on the
 * dollar forecast — the app shows a reminder until the user confirms them.
 */
export const DEFAULT_WAGE_PACKAGE: WagePackage = {
  baseHourlyJW: 56,
  fringes: [
    { code: 'HW', label: 'Health & Welfare', amount: 11.5, basis: 'flat', otFactored: false },
    { code: 'PEN-DB', label: 'Pension — Defined Benefit', amount: 7.25, basis: 'flat', otFactored: false },
    { code: 'PEN-DC', label: 'Pension — Defined Contribution', amount: 4.0, basis: 'flat', otFactored: false },
    { code: 'VAC', label: 'Vacation / Holiday', amount: 3.0, basis: 'flat', otFactored: false },
    { code: 'TRAIN', label: 'Apprenticeship & Training (JATC)', amount: 1.05, basis: 'flat', otFactored: false },
    { code: 'NEBF', label: 'National Electrical Benefit Fund', amount: 3, basis: 'pctOfBase', otFactored: true },
    { code: 'AMF', label: 'Administrative Maintenance Fund', amount: 0.5, basis: 'pctOfBase', otFactored: true },
    { code: 'LMCC', label: 'Labor-Management Cooperation Committee', amount: 0.28, basis: 'flat', otFactored: false },
  ],
  burdenPct: 18,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ordinal(n: number): string {
  const suffix = ['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]
  return `${n}${suffix}`
}

/** Common units for electrical takeoff quantities. */
export const UNITS = [
  'LF',
  'EA',
  'CY',
  'SF',
  'LOT',
  'PR',
  'CKT',
  'TERM',
  'SET',
] as const

/** Starter area sets, so a new job skips a blank screen. */
export const AREA_TEMPLATES: Record<string, string[]> = {
  'Multi-story building': [
    'Level 1',
    'Level 2',
    'Level 3',
    'Level 4',
    'Roof',
    'Site / Exterior',
  ],
  'Warehouse / Industrial': [
    'Warehouse Floor',
    'Office Area',
    'Mechanical Room',
    'Electrical Room',
    'Yard / Site',
  ],
  'Healthcare / OSHPD': [
    'Patient Wing',
    'Surgery / Procedure',
    'Imaging',
    'Central Plant',
    'Site / Exterior',
  ],
  'Data center': [
    'Data Hall 1',
    'Data Hall 2',
    'Electrical Yard',
    'Generator Yard',
    'Admin / Support',
  ],
  'Tenant improvement': ['Suite — North', 'Suite — South', 'Core / Corridor', 'MPOE / IDF'],
}

/** Lead times reflect the 2026 market, where gear drives the schedule. */
export const LONG_LEAD_TEMPLATES: {
  description: string
  leadTimeWeeks: number
  approvalWeeks: number
  specSection: string
}[] = [
  { description: 'Pad-mount service transformer', leadTimeWeeks: 115, approvalWeeks: 8, specSection: '26 12 00' },
  { description: 'Medium-voltage switchgear', leadTimeWeeks: 60, approvalWeeks: 8, specSection: '26 13 00' },
  { description: 'Low-voltage draw-out switchgear', leadTimeWeeks: 74, approvalWeeks: 8, specSection: '26 23 00' },
  { description: 'Switchboard', leadTimeWeeks: 45, approvalWeeks: 6, specSection: '26 24 13' },
  { description: 'Automatic transfer switch', leadTimeWeeks: 55, approvalWeeks: 6, specSection: '26 36 23' },
  { description: 'Standby generator', leadTimeWeeks: 52, approvalWeeks: 8, specSection: '26 32 13' },
  { description: 'Distribution panelboards', leadTimeWeeks: 24, approvalWeeks: 5, specSection: '26 24 16' },
  { description: 'Dry-type transformers', leadTimeWeeks: 20, approvalWeeks: 4, specSection: '26 22 00' },
  { description: 'Lighting fixture package', leadTimeWeeks: 16, approvalWeeks: 6, specSection: '26 51 00' },
  { description: 'Fire alarm control panel & devices', leadTimeWeeks: 14, approvalWeeks: 6, specSection: '28 31 00' },
  { description: 'Busway / bus duct', leadTimeWeeks: 30, approvalWeeks: 6, specSection: '26 25 00' },
  { description: 'Motor control centers', leadTimeWeeks: 36, approvalWeeks: 6, specSection: '26 24 19' },
]
