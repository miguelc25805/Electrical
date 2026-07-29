import {
  Explain,
  Panel,
  RagBadge,
  SectionHeader,
  StatTile,
  fmtDate,
  fmtDateFull,
  fmtFactor,
  fmtHours,
  fmtMoney,
  fmtPct,
  Meter,
} from '../components/ui'
import { Button } from '../components/ui'
import { IconPrint } from '../components/icons'
import { LineChart, SERIES } from '../components/charts'
import { projectedFinish } from '../engine/earnedValue'
import { useActiveProject } from '../store/project'
import { orderedPhases, summarize, useDerived } from '../store/selectors'

/**
 * Forecast.
 *
 * Answers the three questions a GF gets asked in every job meeting: where does
 * this land, how far off the estimate is it, and what would it take to fix.
 * All in hours first, because hours are the thing a GF can actually move.
 */
export default function Forecast() {
  const project = useActiveProject()!
  const derived = useDerived(project)
  const m = derived.metrics
  const rate = derived.blendedRate

  const finish = projectedFinish(derived.curve, m.budgetHours)
  const overBudget = m.varianceHours < 0

  const phaseRows = orderedPhases(project)
    .map((ph) => {
      const acts = project.activities.filter((a) => a.phaseId === ph.id)
      return { phase: ph, summary: summarize(acts, derived.activityMetrics) }
    })
    .filter((r) => r.summary.budgetHours > 0 && r.summary.actualHours >= 8)
    .sort((a, b) => a.summary.productionFactor - b.summary.productionFactor)

  if (m.budgetHours === 0) {
    return (
      <div className="p-4 sm:p-6">
        <SectionHeader title="Forecast" />
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Budget hours in the Work Matrix and report some field production, and the forecast starts
          working.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Forecast"
        subtitle={`${project.name}${project.number ? ` · #${project.number}` : ''}`}
        actions={
          <Button onClick={() => window.print()}>
            <IconPrint size={18} /> Print
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Production factor"
          value={fmtFactor(m.productionFactor)}
          rag={m.rag}
          sub={
            m.productionFactor >= 1
              ? 'Beating the estimate'
              : `${fmtPct((1 - m.productionFactor) * 100, 1)} off the estimate`
          }
        />
        <StatTile
          label="Forecast at completion"
          value={fmtHours(m.eacHours)}
          unit="hrs"
          rag={overBudget ? 'risk' : 'go'}
          sub={`${fmtHours(m.budgetHours)} budgeted`}
        />
        <StatTile
          label={overBudget ? 'Projected overrun' : 'Projected underrun'}
          value={fmtHours(Math.abs(m.varianceHours))}
          unit="hrs"
          rag={overBudget ? 'risk' : 'go'}
          sub={fmtMoney(Math.abs(m.varianceHours) * rate)}
        />
        <StatTile
          label="Projected finish"
          value={finish ? fmtDate(finish) : '—'}
          sub={
            finish
              ? finish > project.targetFinish
                ? `${weeksBetween(project.targetFinish, finish)} wks past target`
                : 'Ahead of target'
              : 'Not enough history yet'
          }
          rag={finish ? (finish > project.targetFinish ? 'risk' : 'go') : 'none'}
        />
      </div>

      <Panel title="Hours: planned, earned and spent" className="mb-4">
        <LineChart
          labels={derived.curve.map((p) => fmtDate(p.week))}
          series={[
            {
              label: 'Planned',
              color: 'var(--app-text-dim)',
              points: derived.curve.map((p) => p.planned),
              dashed: true,
            },
            { label: 'Earned', color: SERIES[0], points: derived.curve.map((p) => p.earned) },
            { label: 'Spent', color: SERIES[1], points: derived.curve.map((p) => p.actual) },
          ]}
          yLabel="Cumulative man-hours"
          height={260}
        />
        <Explain>
          <strong>Earned</strong> below <strong>planned</strong> means the work is behind schedule.{' '}
          <strong>Spent</strong> above <strong>earned</strong> means it is costing more labor than
          the estimate allowed. Right now the job has {fmtHours(m.earnedHours)} hours of work in
          place for {fmtHours(m.actualHours)} hours charged.
        </Explain>
      </Panel>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Where it lands">
          <dl className="grid gap-3">
            <Row label="Budget hours" value={fmtHours(m.budgetHours)} />
            <Row label="Hours charged to date" value={fmtHours(m.actualHours)} sub={fmtPct(m.burnPct)} />
            <Row label="Work in place" value={fmtHours(m.earnedHours)} sub={fmtPct(m.completePct)} />
            <Row label="Hours remaining in the work" value={fmtHours(m.remainingHours)} />
            <Row
              label="Forecast at completion"
              value={fmtHours(m.eacHours)}
              emphasis
              rag={overBudget ? 'risk' : 'go'}
            />
            <Row
              label={overBudget ? 'Over budget by' : 'Under budget by'}
              value={`${fmtHours(Math.abs(m.varianceHours))} hrs · ${fmtMoney(Math.abs(m.varianceHours) * rate)}`}
              emphasis
              rag={overBudget ? 'risk' : 'go'}
            />
          </dl>

          <div className="mt-4">
            <div className="label-cap mb-1">Budget burned vs work in place</div>
            <div className="grid gap-2">
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs">Spent</span>
                <Meter pct={m.burnPct} rag={m.burnPct > m.completePct ? 'risk' : 'go'} label="Budget burned" />
                <span className="w-12 shrink-0 text-right text-xs font-bold">{fmtPct(m.burnPct)}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-20 shrink-0 text-xs">In place</span>
                <Meter pct={m.completePct} label="Work in place" />
                <span className="w-12 shrink-0 text-right text-xs font-bold">{fmtPct(m.completePct)}</span>
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="What it would take to recover">
          {m.tcpi === null ? (
            <p className="text-sm">
              The budget for this job is already spent. Every remaining hour is an overrun — the
              conversation now is about change orders and impact, not recovery.
            </p>
          ) : (
            <>
              <div className="readout text-5xl font-extrabold" style={{ color: m.tcpi > 1.15 ? 'var(--color-risk-500)' : m.tcpi > 1 ? 'var(--color-watch-500)' : 'var(--color-go-500)' }}>
                {fmtFactor(m.tcpi)}
              </div>
              <p className="mt-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                Productivity needed on <strong>everything left</strong> to still finish at budget,
                against {fmtFactor(m.productionFactor)} so far.
              </p>
              <Explain>
                {m.tcpi <= 1
                  ? 'The job has room — holding current productivity finishes under budget.'
                  : m.tcpi <= 1.15
                    ? 'Recoverable, but it needs a real change: better material staging, prefab, or a tighter crew mix on the remaining work.'
                    : `A ${fmtPct((m.tcpi - 1) * 100)} productivity gain on all remaining work is not something a crew talks its way into. Treat this as a budget problem — document the impacts, price the change, and get the conversation started while there is still work left to price.`}
              </Explain>
            </>
          )}
        </Panel>
      </div>

      {phaseRows.length > 0 && (
        <Panel title="By phase — worst first">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-cap">
                  <th className="px-2 py-2 text-left">Phase</th>
                  <th className="px-2 py-2 text-right">Budget</th>
                  <th className="px-2 py-2 text-right">Earned</th>
                  <th className="px-2 py-2 text-right">Spent</th>
                  <th className="px-2 py-2 text-right">PF</th>
                  <th className="px-2 py-2 text-right">Forecast</th>
                  <th className="px-2 py-2 text-right">Variance</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {phaseRows.map(({ phase, summary: s }) => {
                  const eac =
                    s.productionFactor > 0
                      ? s.actualHours + (s.budgetHours - s.earnedHours) / s.productionFactor
                      : s.budgetHours
                  const variance = s.budgetHours - eac
                  return (
                    <tr key={phase.id} className="border-t" style={{ borderColor: 'var(--app-line-soft)' }}>
                      <td className="px-2 py-2">
                        <span className="font-extrabold" style={{ color: 'var(--color-amp-400)' }}>
                          {phase.code}
                        </span>
                        <span className="ml-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          {phase.label}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right">{fmtHours(s.budgetHours)}</td>
                      <td className="px-2 py-2 text-right">{fmtHours(s.earnedHours)}</td>
                      <td className="px-2 py-2 text-right">{fmtHours(s.actualHours)}</td>
                      <td className="px-2 py-2 text-right font-bold">{fmtFactor(s.productionFactor)}</td>
                      <td className="px-2 py-2 text-right">{fmtHours(eac)}</td>
                      <td
                        className="px-2 py-2 text-right font-bold"
                        style={{
                          color: variance < 0 ? 'var(--color-risk-500)' : 'var(--color-go-500)',
                        }}
                      >
                        {variance < 0 ? '−' : '+'}
                        {fmtHours(Math.abs(variance))}
                      </td>
                      <td className="px-2 py-2">
                        <RagBadge rag={s.rag} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <Explain>
            Sorted worst production first. The top row is where the hours are leaking — that is the
            phase worth a walk and a conversation before anything else on this screen.
          </Explain>
        </Panel>
      )}

      <p className="mt-6 text-xs" style={{ color: 'var(--app-text-dim)' }}>
        Dollar figures use a {fmtMoney(rate)}/hr fully-loaded blended rate from the hours reported so
        far. Confirm the wage package under Settings before quoting any of it.{' '}
        Report run {fmtDateFull(derived.today)}.
      </p>
    </div>
  )
}

function Row({
  label,
  value,
  sub,
  emphasis,
  rag,
}: {
  label: string
  value: string
  sub?: string
  emphasis?: boolean
  rag?: 'go' | 'risk'
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b pb-2" style={{ borderColor: 'var(--app-line-soft)' }}>
      <dt className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
        {label}
      </dt>
      <dd
        className={`readout text-right ${emphasis ? 'text-lg font-extrabold' : 'text-sm font-bold'}`}
        style={rag ? { color: rag === 'risk' ? 'var(--color-risk-500)' : 'var(--color-go-500)' } : undefined}
      >
        {value}
        {sub && (
          <span className="ml-2 text-xs font-normal" style={{ color: 'var(--app-text-dim)' }}>
            {sub}
          </span>
        )}
      </dd>
    </div>
  )
}

function weeksBetween(a: string, b: string): number {
  return Math.max(0, Math.round((Date.parse(b) - Date.parse(a)) / (7 * 86_400_000)))
}
