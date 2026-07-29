import { addDays, format, parseISO } from 'date-fns'
import {
  Button,
  Explain,
  Meter,
  Panel,
  RagBadge,
  SectionHeader,
  StatTile,
  fmtDate,
  fmtDateFull,
  fmtHours,
  fmtPct,
} from '../components/ui'
import { IconDownload, IconPrint } from '../components/icons'
import { entryHours } from '../engine/ratios'
import { useActiveProject } from '../store/project'
import { useDerived } from '../store/selectors'

/**
 * California public-works compliance.
 *
 * These are the obligations that quietly accumulate all job long and get
 * audited at the end, when nothing can be fixed. Every gauge here is a running
 * position rather than a closeout report, because the only useful time to
 * learn you are short on apprentice hours is while there are still hours left
 * to work.
 */
export default function Compliance() {
  const project = useActiveProject()!
  const derived = useDerived(project)
  const app = derived.apprentice
  const stwf = derived.stwf

  if (!project.complianceEnabled) {
    return (
      <div className="p-4 sm:p-6">
        <SectionHeader title="Compliance" />
        <Panel>
          <p className="text-sm">
            Compliance tracking is switched off for this job. Turn it on under Settings if this is
            public work — it tracks the apprentice ratio, the Skilled &amp; Trained Workforce
            percentage, and the DAS notice deadlines.
          </p>
        </Panel>
      </div>
    )
  }

  // First week apprentices appear in the plan drives the DAS-142 notice date.
  const firstApprenticeWeek = derived.dispatch.find(
    (w) => w.crew.apprentices > 0 && w.weekStart >= derived.today,
  )

  const hoursByClass = new Map<string, number>()
  for (const e of project.time) {
    hoursByClass.set(
      e.classificationCode,
      (hoursByClass.get(e.classificationCode) ?? 0) + entryHours(e),
    )
  }

  const exportHours = () => {
    const rows = [
      ['Job', project.name],
      ['Job number', project.number],
      ['Local', project.ruleProfile.localUnion],
      ['Report date', derived.today],
      [],
      ['Date', 'Classification', 'Workers', 'Straight', 'OT', 'DT', 'Total'],
      ...project.time
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((t) => [
          t.date,
          t.classificationCode,
          String(t.workers),
          String(t.straightHours),
          String(t.otHours),
          String(t.dtHours),
          String(entryHours(t)),
        ]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `hours-${project.name.replace(/\W+/g, '-')}-${derived.today}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Compliance"
        subtitle={`${project.contractType === 'public' ? 'Public works' : 'Private'} · ${project.county || 'county not set'} County`}
        actions={
          <>
            <Button onClick={exportHours}>
              <IconDownload size={18} /> Hours CSV
            </Button>
            <Button onClick={() => window.print()}>
              <IconPrint size={18} />
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Apprentice ratio"
          value={app.apprenticeHours > 0 ? `1:${app.actualRatio.toFixed(1)}` : '—'}
          rag={app.rag}
          sub={`Required 1:${app.requiredRatio}`}
        />
        <StatTile
          label="Apprentice hours owed"
          value={fmtHours(app.shortfallHours)}
          unit="hrs"
          rag={app.shortfallHours > 0 ? 'risk' : 'go'}
          sub={app.shortfallHours > 0 ? 'Behind the ratio' : 'On or ahead of ratio'}
        />
        {project.stwfRequired && (
          <StatTile
            label="Apprenticeship graduates"
            value={fmtPct(stwf.actualPct)}
            rag={stwf.rag}
            sub={`${stwf.requiredPct}% required`}
          />
        )}
        <StatTile
          label="Journey-level hours"
          value={fmtHours(app.journeymanHours)}
          unit="hrs"
          sub={`${fmtHours(app.apprenticeHours)} apprentice hrs`}
        />
      </div>

      {/* --- Apprentice ratio ------------------------------------------- */}
      <Panel title="Apprentice ratio — project to date" className="mb-4">
        <div className="flex items-center gap-3">
          <Meter
            pct={
              app.requiredApprenticeHours > 0
                ? (app.apprenticeHours / app.requiredApprenticeHours) * 100
                : 100
            }
            rag={app.rag}
            height={14}
            label="Apprentice ratio attainment"
          />
          <RagBadge rag={app.rag} label={app.compliant ? 'On ratio' : 'Short'} />
        </div>

        <dl className="mt-4 grid gap-2 text-sm">
          <Row label="Journeyman-level hours worked" value={fmtHours(app.journeymanHours)} />
          <Row label="Apprentice hours worked" value={fmtHours(app.apprenticeHours)} />
          <Row
            label={`Apprentice hours required at 1:${app.requiredRatio}`}
            value={fmtHours(app.requiredApprenticeHours)}
          />
          <Row
            label="Shortfall"
            value={fmtHours(app.shortfallHours)}
            rag={app.shortfallHours > 0 ? 'risk' : 'go'}
            emphasis
          />
        </dl>

        <Explain>
          California public works requires one hour of apprentice work for every five hours performed
          by a journey-level worker, per craft, <strong>totaled over the life of the project</strong>.
          Foremen and the general foreman count on the journeyman side. Because it is judged at the
          end, a shortfall carried into the last months is very expensive to close —{' '}
          {app.shortfallHours > 0
            ? `at ${fmtHours(app.shortfallHours)} hours behind, that is roughly ${Math.ceil(app.shortfallHours / 40)} apprentice-weeks to make up.`
            : 'this job is currently carrying its own weight.'}
        </Explain>
      </Panel>

      {/* --- STWF -------------------------------------------------------- */}
      {project.stwfRequired && (
        <Panel title="Skilled & Trained Workforce" className="mb-4">
          <div className="flex items-center gap-3">
            <Meter pct={stwf.actualPct} rag={stwf.rag} height={14} label="Graduate percentage" />
            <span className="readout shrink-0 text-lg font-extrabold">{fmtPct(stwf.actualPct)}</span>
            <RagBadge rag={stwf.rag} />
          </div>
          <dl className="mt-4 grid gap-2 text-sm">
            <Row label="Journey-level hours" value={fmtHours(stwf.journeyLevelHours)} />
            <Row label="Hours by apprenticeship graduates" value={fmtHours(stwf.graduateHours)} />
            <Row label={`Required at ${stwf.requiredPct}%`} value={fmtPct(stwf.requiredPct)} />
            <Row
              label="Graduate hours short"
              value={fmtHours(stwf.shortfallHours)}
              rag={stwf.shortfallHours > 0 ? 'risk' : 'go'}
              emphasis
            />
          </dl>
          <Explain>
            On covered public work, {stwf.requiredPct}% of the hours in an apprenticeable craft must
            be performed by journey-level workers who graduated a state-approved apprenticeship
            program. Mark which classifications count as graduates under Settings ▸ Classifications.
          </Explain>
        </Panel>
      )}

      {/* --- Notices ----------------------------------------------------- */}
      <Panel title="Apprenticeship notices" className="mb-4">
        <ul className="grid gap-3">
          <li className="surface-2 rounded-lg px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">DAS-140 — Contract Award Information</strong>
              <RagBadge rag="watch" label="Once per contract" />
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
              Goes to every applicable apprenticeship committee within 10 days of the contract award
              or execution, and before work starts. Required on public works contracts at or above
              the statutory threshold.
            </p>
            <p className="mt-1 text-xs" style={{ color: 'var(--app-text-dim)' }}>
              Job start on file: {fmtDateFull(project.startDate)} · due by{' '}
              {fmtDateFull(format(addDays(parseISO(project.startDate), 10), 'yyyy-MM-dd'))}
            </p>
          </li>

          <li className="surface-2 rounded-lg px-3 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-sm">DAS-142 — Request for Dispatch of Apprentices</strong>
              {firstApprenticeWeek ? (
                <RagBadge rag="watch" label={`Next: week of ${fmtDate(firstApprenticeWeek.weekStart)}`} />
              ) : (
                <RagBadge rag="none" label="No apprentices in the plan yet" />
              )}
            </div>
            <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
              Must reach the committee at least 72 hours before apprentices are needed, not counting
              weekends or holidays.
            </p>
            {firstApprenticeWeek && (
              <p className="mt-1 text-xs" style={{ color: 'var(--app-text-dim)' }}>
                The manpower plan puts {firstApprenticeWeek.crew.apprentices} apprentice
                {firstApprenticeWeek.crew.apprentices === 1 ? '' : 's'} on the job the week of{' '}
                {fmtDate(firstApprenticeWeek.weekStart)} — the request should go out no later than{' '}
                <strong>
                  {fmtDateFull(
                    format(addDays(parseISO(firstApprenticeWeek.weekStart), -5), 'yyyy-MM-dd'),
                  )}
                </strong>{' '}
                to clear the 72-hour window with room for a weekend.
              </p>
            )}
          </li>
        </ul>
        <Explain>
          Dates here are computed from your own manpower plan and job start. They are a planning aid,
          not legal advice — confirm the thresholds and deadlines that apply to your contract with
          your office or compliance department.
        </Explain>
      </Panel>

      {/* --- Hours by classification -------------------------------------- */}
      <Panel title="Hours by classification">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-cap">
                <th className="px-2 py-2 text-left">Code</th>
                <th className="px-2 py-2 text-left">Classification</th>
                <th className="px-2 py-2 text-center">Journey level</th>
                <th className="px-2 py-2 text-center">Graduate</th>
                <th className="px-2 py-2 text-right">Hours</th>
                <th className="px-2 py-2 text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {project.ruleProfile.classifications
                .filter((c) => (hoursByClass.get(c.code) ?? 0) > 0)
                .sort((a, b) => (hoursByClass.get(b.code) ?? 0) - (hoursByClass.get(a.code) ?? 0))
                .map((c) => {
                  const hours = hoursByClass.get(c.code) ?? 0
                  const total = [...hoursByClass.values()].reduce((a, b) => a + b, 0)
                  return (
                    <tr key={c.code} className="border-t" style={{ borderColor: 'var(--app-line-soft)' }}>
                      <td className="px-2 py-2 font-extrabold">{c.code}</td>
                      <td className="px-2 py-2">{c.label}</td>
                      <td className="px-2 py-2 text-center">{c.journeyLevel ? '✓' : '—'}</td>
                      <td className="px-2 py-2 text-center">{c.apprenticeshipGraduate ? '✓' : '—'}</td>
                      <td className="px-2 py-2 text-right font-bold">{fmtHours(hours)}</td>
                      <td className="px-2 py-2 text-right" style={{ color: 'var(--app-text-muted)' }}>
                        {fmtPct(total > 0 ? (hours / total) * 100 : 0, 1)}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>
        <Explain>
          Export this as CSV for whoever files the certified payroll — it is the hours side of the
          record, not a substitute for the payroll system's own reporting.
        </Explain>
      </Panel>
    </div>
  )
}

function Row({
  label,
  value,
  rag,
  emphasis,
}: {
  label: string
  value: string
  rag?: 'go' | 'risk'
  emphasis?: boolean
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 border-b pb-1.5"
      style={{ borderColor: 'var(--app-line-soft)' }}
    >
      <dt style={{ color: 'var(--app-text-muted)' }}>{label}</dt>
      <dd
        className={`readout ${emphasis ? 'text-base font-extrabold' : 'font-bold'}`}
        style={
          rag ? { color: rag === 'risk' ? 'var(--color-risk-500)' : 'var(--color-go-500)' } : undefined
        }
      >
        {value}
      </dd>
    </div>
  )
}
