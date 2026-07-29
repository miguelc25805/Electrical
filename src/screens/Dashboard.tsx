import { useNavigate } from 'react-router-dom'
import {
  Button,
  Explain,
  Meter,
  Panel,
  RagBadge,
  SectionHeader,
  StatTile,
  fmtDate,
  fmtFactor,
  fmtHours,
  fmtMoney,
  fmtPct,
} from '../components/ui'
import { IconWarn } from '../components/icons'
import { readiness } from '../engine/schedule'
import { useActiveProject, useProjectStore } from '../store/project'
import { useDerived } from '../store/selectors'

/**
 * Dashboard.
 *
 * Everything a GF needs before the 6am huddle, above the fold. Not a summary of
 * the app — a summary of the job, ordered by what could hurt you today. Every
 * tile is a door into the screen that can do something about it.
 */
export default function Dashboard() {
  const project = useActiveProject()!
  const navigate = useNavigate()
  const derived = useDerived(project)
  const wagesConfirmed = useProjectStore((s) => s.wagesConfirmed[project.id])
  const confirmWages = useProjectStore((s) => s.confirmWages)

  const m = derived.metrics
  const thisWeek = derived.dispatch.find((w) => w.weekStart >= derived.today)
  const overBudget = m.varianceHours < 0

  const notReady = project.activities
    .map((a) => ({ a, r: readiness(a, project.constraints, derived.today) }))
    .filter((x) => !x.r.ready)
    .slice(0, 5)

  const gearAlerts = derived.procurementAlerts.slice(0, 5)

  const worstPhases = [...derived.activityMetrics.values()]
    .filter((x) => x.actualHours >= 16 && x.productionFactor < 0.95)
    .sort((a, b) => a.productionFactor - b.productionFactor)
    .slice(0, 4)

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title={project.name}
        subtitle={`${project.number ? `#${project.number} · ` : ''}${
          project.generalContractor || 'No GC set'
        } · ${project.ruleProfile.localUnion}`}
      />

      {!wagesConfirmed && (
        <div
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg px-4 py-3"
          style={{ background: 'color-mix(in srgb, var(--color-watch-500) 14%, transparent)' }}
        >
          <span style={{ color: 'var(--color-watch-500)' }}>
            <IconWarn size={20} />
          </span>
          <p className="min-w-0 flex-1 text-sm">
            <strong>Check the wage package.</strong> Dollar figures use seeded Southern California
            defaults until you confirm them against your own wage sheet. Hours forecasting is
            unaffected.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => navigate('/settings')}>Review wages</Button>
            <Button variant="primary" onClick={() => confirmWages(project.id)}>
              They're correct
            </Button>
          </div>
        </div>
      )}

      {/* --- The four numbers that decide the day ------------------------ */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Production factor"
          value={fmtFactor(m.productionFactor)}
          rag={m.rag}
          sub={`${fmtHours(m.earnedHours)} earned / ${fmtHours(m.actualHours)} spent`}
          onClick={() => navigate('/forecast')}
        />
        <StatTile
          label={overBudget ? 'Headed over by' : 'Headed under by'}
          value={fmtHours(Math.abs(m.varianceHours))}
          unit="hrs"
          rag={overBudget ? 'risk' : 'go'}
          sub={fmtMoney(Math.abs(m.varianceHours) * derived.blendedRate)}
          onClick={() => navigate('/forecast')}
        />
        <StatTile
          label="Crew this week"
          value={thisWeek?.crew.total ?? 0}
          unit="hands"
          rag={thisWeek?.overCap ? 'risk' : 'none'}
          sub={
            thisWeek
              ? `${thisWeek.crew.foremen} foremen · ${thisWeek.crew.journeymen} JW · ${thisWeek.crew.apprentices} appr`
              : 'Nothing scheduled'
          }
          onClick={() => navigate('/manpower')}
        />
        <StatTile
          label="Gear needing action"
          value={gearAlerts.length}
          rag={gearAlerts.some((g) => g.status.rag === 'risk') ? 'risk' : gearAlerts.length ? 'watch' : 'go'}
          sub={gearAlerts.length ? 'Order dates inside 3 weeks' : 'Nothing due'}
          onClick={() => navigate('/materials')}
        />
      </div>

      {/* --- Progress ---------------------------------------------------- */}
      <Panel title="Where the job stands" className="mb-4">
        <div className="grid gap-3">
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs font-semibold">Work in place</span>
            <Meter pct={m.completePct} label="Work in place" />
            <span className="readout w-14 shrink-0 text-right text-sm font-bold">
              {fmtPct(m.completePct)}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="w-24 shrink-0 text-xs font-semibold">Budget spent</span>
            <Meter
              pct={m.burnPct}
              rag={m.burnPct > m.completePct + 5 ? 'risk' : 'go'}
              label="Budget spent"
            />
            <span className="readout w-14 shrink-0 text-right text-sm font-bold">
              {fmtPct(m.burnPct)}
            </span>
          </div>
        </div>
        <Explain>
          {m.burnPct > m.completePct + 5
            ? `The job has spent ${fmtPct(m.burnPct)} of its hours to get ${fmtPct(m.completePct)} of the work in place — labor is running ahead of production by ${fmtPct(m.burnPct - m.completePct)}.`
            : `Hours spent and work in place are tracking together — the estimate is holding.`}
        </Explain>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --- Not ready to work ---------------------------------------- */}
        <Panel
          title={`Not ready to work (${derived.openConstraints} open constraints)`}
          actions={<Button onClick={() => navigate('/timeline')}>Lookahead</Button>}
        >
          {notReady.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              Nothing is blocked. Every activity on the board can be worked.
            </p>
          ) : (
            <ul className="grid gap-2">
              {notReady.map(({ a, r }) => (
                <li key={a.id} className="surface-2 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-extrabold"
                      style={{
                        background: 'color-mix(in srgb, var(--color-amp-400) 18%, transparent)',
                        color: 'var(--color-amp-400)',
                      }}
                    >
                      {derived.phaseById.get(a.phaseId)?.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {derived.areaById.get(a.areaId)?.name}
                    </span>
                    <RagBadge rag={r.rag} label={r.openConstraints.length === 1 ? '1 blocker' : `${r.openConstraints.length} blockers`} />
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {r.openConstraints[0].description} — {r.openConstraints[0].owner}, needed{' '}
                    {fmtDate(r.openConstraints[0].needBy)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* --- Procurement ----------------------------------------------- */}
        <Panel
          title="Order dates coming up"
          actions={<Button onClick={() => navigate('/materials')}>Materials</Button>}
        >
          {gearAlerts.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              No submittal or release dates inside the next three weeks.
            </p>
          ) : (
            <ul className="grid gap-2">
              {gearAlerts.map(({ item, status }) => (
                <li key={item.id} className="surface-2 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-bold">
                      {item.description}
                      {item.tag && (
                        <span className="ml-2 text-xs" style={{ color: 'var(--app-text-dim)' }}>
                          {item.tag}
                        </span>
                      )}
                    </span>
                    <RagBadge
                      rag={status.rag}
                      label={
                        status.daysRemaining! < 0
                          ? `${Math.abs(status.daysRemaining!)}d late`
                          : `${status.daysRemaining}d`
                      }
                    />
                  </div>
                  <p className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {status.nextAction} · {item.leadTimeWeeks} wk lead
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {/* --- Worst production ------------------------------------------ */}
        <Panel
          title="Losing hours"
          actions={<Button onClick={() => navigate('/matrix')}>Work matrix</Button>}
        >
          {worstPhases.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              Nothing is running meaningfully behind the estimate.
            </p>
          ) : (
            <ul className="grid gap-2">
              {worstPhases.map((x) => {
                const a = project.activities.find((y) => y.id === x.activityId)!
                return (
                  <li key={x.activityId} className="surface-2 flex items-center gap-3 rounded-lg px-3 py-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-extrabold"
                      style={{
                        background: 'color-mix(in srgb, var(--color-amp-400) 18%, transparent)',
                        color: 'var(--color-amp-400)',
                      }}
                    >
                      {derived.phaseById.get(a.phaseId)?.code}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {derived.areaById.get(a.areaId)?.name}
                    </span>
                    <span className="readout shrink-0 text-sm font-extrabold" style={{ color: 'var(--color-risk-500)' }}>
                      {fmtFactor(x.productionFactor)}
                    </span>
                    <span className="shrink-0 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      {fmtHours(Math.abs(x.varianceHours))} over
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Panel>

        {/* --- Compliance & promises ------------------------------------- */}
        <Panel
          title="Last week's promises"
          actions={<Button onClick={() => navigate('/timeline')}>Commitments</Button>}
        >
          {derived.lastWeekPpc.planned === 0 ? (
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              No commitments were logged for last week. Making the crew's weekly promises explicit is
              the cheapest schedule tool there is.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-3">
                <span className="readout text-4xl font-extrabold">
                  {fmtPct(derived.lastWeekPpc.pct)}
                </span>
                <RagBadge rag={derived.lastWeekPpc.rag} />
                <span className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  {derived.lastWeekPpc.completed} of {derived.lastWeekPpc.planned} kept
                </span>
              </div>
              <Explain>
                Percent Plan Complete. Below 75% means the crew is being set up to fail — the reason
                codes on the Timeline screen say by what.
              </Explain>
            </>
          )}

          {project.complianceEnabled && (
            <div className="mt-4 grid gap-2 border-t pt-3" style={{ borderColor: 'var(--app-line-soft)' }}>
              <button
                onClick={() => navigate('/compliance')}
                className="flex items-center justify-between gap-3 text-left"
                style={{ minHeight: 'var(--spacing-tap)' }}
              >
                <span className="text-sm font-semibold">Apprentice ratio</span>
                <RagBadge
                  rag={derived.apprentice.rag}
                  label={
                    derived.apprentice.compliant
                      ? 'On ratio'
                      : `${fmtHours(derived.apprentice.shortfallHours)} hrs short`
                  }
                />
              </button>
              {project.stwfRequired && (
                <button
                  onClick={() => navigate('/compliance')}
                  className="flex items-center justify-between gap-3 text-left"
                  style={{ minHeight: 'var(--spacing-tap)' }}
                >
                  <span className="text-sm font-semibold">Skilled &amp; trained workforce</span>
                  <RagBadge rag={derived.stwf.rag} label={fmtPct(derived.stwf.actualPct)} />
                </button>
              )}
            </div>
          )}
        </Panel>
      </div>
    </div>
  )
}
