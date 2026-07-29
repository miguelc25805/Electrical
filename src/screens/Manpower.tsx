import { useMemo, useState } from 'react'
import {
  Button,
  Explain,
  NumberInput,
  Panel,
  RagBadge,
  SectionHeader,
  Segmented,
  StatTile,
  fmtDate,
  fmtDateFull,
  fmtHours,
  fmtMoney,
} from '../components/ui'
import { IconPrint, IconWarn } from '../components/icons'
import { SERIES, StackedBarChart } from '../components/charts'
import { checkSupervision } from '../engine/ratios'
import { hoursPerWorkerWeek } from '../engine/curve'
import { peakCrew } from '../engine/crew'
import { useActiveProject, useProjectStore } from '../store/project'
import { useDerived } from '../store/selectors'

/**
 * Manpower plan and dispatch.
 *
 * The point of this screen is one sentence a GF can act on: *how many hands,
 * of what classification, in what week, and who do I call.* Everything else —
 * the histogram, the ratio warnings, the cost — exists to make that sentence
 * trustworthy before it gets said out loud to the hall.
 */

const CREW_SERIES = [
  { label: 'General foreman', color: SERIES[0] },
  { label: 'Foremen', color: SERIES[1] },
  { label: 'Journeymen', color: SERIES[2] },
  { label: 'Apprentices', color: SERIES[3] },
]

export default function Manpower() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)
  const [view, setView] = useState<'chart' | 'table'>('chart')

  const perWeek = hoursPerWorkerWeek(project.ruleProfile.workCalendar)
  const plan = derived.dispatch
  const peak = peakCrew(plan)

  // Weeks from this one forward — what still has to be staffed.
  const upcoming = useMemo(
    () => plan.filter((w) => w.weekStart >= derived.today).slice(0, 12),
    [plan, derived.today],
  )

  const chartData = plan.map((w) => ({
    label: fmtDate(w.weekStart),
    values: [w.crew.generalForeman, w.crew.foremen, w.crew.journeymen, w.crew.apprentices],
    flagged: w.overCap,
  }))

  const issues = plan
    .map((w) => ({ week: w, issues: checkSupervision(w.crew, project.ruleProfile) }))
    .filter((x) => x.issues.length > 0)

  const currentWeek = plan.find((w) => w.weekStart >= derived.today)
  const totalCost = plan.reduce((s, w) => s + w.hours, 0) * derived.blendedRate

  if (plan.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <SectionHeader title="Manpower" />
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Budget some hours in the Work Matrix and the manpower curve builds itself.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Manpower Plan"
        subtitle={`${perWeek} hours a week per hand · ${project.ruleProfile.workCalendar.daysPerWeek}×${project.ruleProfile.workCalendar.hoursPerDay}`}
        actions={
          <>
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { value: 'chart', label: 'Chart' },
                { value: 'table', label: 'Table' },
              ]}
            />
            <Button onClick={() => window.print()}>
              <IconPrint size={18} /> Print
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="On the job this week"
          value={currentWeek?.crew.total ?? 0}
          unit="hands"
          sub={currentWeek ? `${fmtHours(currentWeek.hours)} hrs planned` : 'No work scheduled'}
        />
        <StatTile
          label="Peak crew"
          value={peak?.crew.total ?? 0}
          unit="hands"
          sub={peak ? `Week of ${fmtDate(peak.weekStart)}` : '—'}
          rag={
            project.siteManpowerCap > 0 && (peak?.crew.total ?? 0) > project.siteManpowerCap
              ? 'risk'
              : 'none'
          }
        />
        <StatTile
          label="Weeks remaining"
          value={upcoming.length > 0 ? plan.filter((w) => w.weekStart >= derived.today).length : 0}
          unit="wks"
          sub={`Through ${fmtDate(plan[plan.length - 1].weekStart)}`}
        />
        <StatTile
          label="Labor cost at plan"
          value={fmtMoney(totalCost)}
          sub={`${fmtMoney(derived.blendedRate)}/hr fully loaded`}
        />
      </div>

      <Panel
        title="Crew by week"
        className="mb-4"
        actions={
          <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            Site cap
            <div className="w-20">
              <NumberInput
                value={project.siteManpowerCap}
                onChange={(v) => mutate((d) => void (d.siteManpowerCap = v))}
              />
            </div>
          </label>
        }
      >
        {view === 'chart' ? (
          <StackedBarChart
            data={chartData}
            series={CREW_SERIES}
            capLine={project.siteManpowerCap}
            yLabel="Hands on the job"
            height={260}
          />
        ) : (
          <CrewTable plan={plan} />
        )}
        <Explain>
          Built from the budgeted hours in the Work Matrix, spread across each activity's run using
          the manpower shape you picked for it, then divided by {perWeek} hours a week per hand.
          Supervision comes off the top per {project.ruleProfile.localUnion}, and apprentices are
          staffed toward the one-in-five state ratio.
        </Explain>
      </Panel>

      {issues.length > 0 && (
        <Panel title="Ratio warnings" className="mb-4">
          <ul className="grid gap-2">
            {issues.slice(0, 8).map(({ week, issues: list }) =>
              list.map((issue, i) => (
                <li
                  key={`${week.weekStart}-${i}`}
                  className="flex items-start gap-3 rounded-lg px-3 py-2"
                  style={{
                    background: `color-mix(in srgb, ${
                      issue.severity === 'risk' ? 'var(--color-risk-500)' : 'var(--color-watch-500)'
                    } 12%, transparent)`,
                  }}
                >
                  <span
                    className="mt-0.5 shrink-0"
                    style={{
                      color:
                        issue.severity === 'risk'
                          ? 'var(--color-risk-500)'
                          : 'var(--color-watch-500)',
                    }}
                  >
                    <IconWarn size={16} />
                  </span>
                  <div className="text-sm">
                    <span className="font-bold">Week of {fmtDate(week.weekStart)}</span> —{' '}
                    {issue.message}
                  </div>
                </li>
              )),
            )}
          </ul>
        </Panel>
      )}

      <DispatchRequest weeks={upcoming} />
    </div>
  )
}

// ---------------------------------------------------------------------------

function CrewTable({ plan }: { plan: ReturnType<typeof useDerived>['dispatch'] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="label-cap">
            <th className="px-2 py-2 text-left">Week of</th>
            <th className="px-2 py-2 text-right">Hours</th>
            <th className="px-2 py-2 text-right">GF</th>
            <th className="px-2 py-2 text-right">Foremen</th>
            <th className="px-2 py-2 text-right">JW</th>
            <th className="px-2 py-2 text-right">Appr</th>
            <th className="px-2 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {plan.map((w) => (
            <tr key={w.weekStart} className="border-t" style={{ borderColor: 'var(--app-line-soft)' }}>
              <td className="px-2 py-1.5 font-semibold">{fmtDate(w.weekStart)}</td>
              <td className="px-2 py-1.5 text-right">{fmtHours(w.hours)}</td>
              <td className="px-2 py-1.5 text-right">{w.crew.generalForeman || '—'}</td>
              <td className="px-2 py-1.5 text-right">{w.crew.foremen || '—'}</td>
              <td className="px-2 py-1.5 text-right">{w.crew.journeymen || '—'}</td>
              <td className="px-2 py-1.5 text-right">{w.crew.apprentices || '—'}</td>
              <td
                className="px-2 py-1.5 text-right font-bold"
                style={{ color: w.overCap ? 'var(--color-risk-500)' : undefined }}
              >
                {w.crew.total}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The actual deliverable: what to tell the hall, week by week, with the
 * apprentice notice lead time already worked out.
 */
function DispatchRequest({ weeks }: { weeks: ReturnType<typeof useDerived>['dispatch'] }) {
  const project = useActiveProject()!

  const rows = weeks
    .map((w) => {
      const calls: string[] = []
      const releases: string[] = []
      const push = (n: number, singular: string, plural: string) => {
        if (n > 0) calls.push(`${n} ${n === 1 ? singular : plural}`)
        if (n < 0) releases.push(`${-n} ${-n === 1 ? singular : plural}`)
      }
      push(w.delta.generalForeman, 'general foreman', 'general foremen')
      push(w.delta.foremen, 'foreman', 'foremen')
      push(w.delta.journeymen, 'journeyman', 'journeymen')
      push(w.delta.apprentices, 'apprentice', 'apprentices')
      return { week: w, calls, releases }
    })
    .filter((r) => r.calls.length > 0 || r.releases.length > 0)

  return (
    <Panel
      title="Dispatch request"
      actions={
        <Button onClick={() => window.print()}>
          <IconPrint size={18} /> Print
        </Button>
      }
    >
      <div className="print-keep">
        <div className="print-only mb-4">
          <h1 className="text-lg font-extrabold">Manpower / Dispatch Request</h1>
          <p className="text-sm">
            {project.name} {project.number && `· Job #${project.number}`} ·{' '}
            {project.ruleProfile.localUnion}
          </p>
          <p className="text-xs">Prepared {fmtDateFull(new Date().toISOString().slice(0, 10))}</p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            No changes to the crew in the next twelve weeks — the plan holds steady at the current
            manning.
          </p>
        ) : (
          <ul className="grid gap-2">
            {rows.map(({ week, calls, releases }) => (
              <li
                key={week.weekStart}
                className="surface-2 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-2.5 print-keep"
              >
                <span className="w-28 shrink-0 text-sm font-extrabold">
                  {fmtDate(week.weekStart)}
                </span>
                {calls.length > 0 && (
                  <span className="text-sm">
                    <strong style={{ color: 'var(--color-go-500)' }}>Call</strong> {calls.join(', ')}
                  </span>
                )}
                {releases.length > 0 && (
                  <span className="text-sm">
                    <strong style={{ color: 'var(--color-watch-500)' }}>Release</strong>{' '}
                    {releases.join(', ')}
                  </span>
                )}
                <span className="ml-auto text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  → {week.crew.total} on the job
                </span>
                {week.overCap && <RagBadge rag="risk" label="over site cap" />}
              </li>
            ))}
          </ul>
        )}

        {project.complianceEnabled && rows.some((r) => r.calls.some((c) => c.includes('apprentice'))) && (
          <Explain>
            <strong>Apprentice notice:</strong> a request for dispatch of apprentices (DAS-142) has
            to go to the apprenticeship committee at least 72 hours ahead, not counting weekends or
            holidays. The Compliance screen tracks which weeks that applies to.
          </Explain>
        )}
      </div>
    </Panel>
  )
}
