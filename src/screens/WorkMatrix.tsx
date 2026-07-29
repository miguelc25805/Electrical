import { useState } from 'react'
import {
  Button,
  DateInput,
  Explain,
  Field,
  Meter,
  NumberInput,
  RAG_COLOR,
  RAG_GLYPH,
  RagBadge,
  SectionHeader,
  Segmented,
  Select,
  Sheet,
  TextArea,
  fmtDate,
  fmtFactor,
  fmtHours,
  fmtPct,
} from '../components/ui'
import { IconPlus, IconTrash } from '../components/icons'
import { UNITS, uid } from '../domain/templates'
import type { Activity, CurveShape } from '../domain/types'
import { useActiveProject, useProjectStore } from '../store/project'
import {
  activitiesInCell,
  orderedAreas,
  orderedPhases,
  summarize,
  useDerived,
} from '../store/selectors'

/**
 * The work matrix.
 *
 * Areas down the side, phase codes across the top, hours where they cross.
 * This is how the job already exists in a GF's head — "level four rough-in" is
 * a cell, not a row in a spreadsheet — so it is the spine everything else hangs
 * off of.
 *
 * The fill encodes one thing only: how much of that cell's work is in place.
 * Phase identity is carried by the code in text, because eleven hues nobody can
 * distinguish is decoration, not information.
 */

type Mode = 'complete' | 'hours' | 'production'

export default function WorkMatrix() {
  const project = useActiveProject()!
  const derived = useDerived(project)
  const [mode, setMode] = useState<Mode>('complete')
  const [cell, setCell] = useState<{ areaId: string; phaseId: string } | null>(null)

  const areas = orderedAreas(project)
  const phases = orderedPhases(project)

  if (areas.length === 0 || phases.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <SectionHeader title="Work Matrix" />
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Add areas and phases in Settings, or run the setup wizard, and the matrix builds itself.
        </p>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Work Matrix"
        subtitle="Every area against every phase. Tap a box to open the work in it."
        actions={
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'complete', label: '% Complete' },
              { value: 'hours', label: 'Hours' },
              { value: 'production', label: 'Production' },
            ]}
          />
        }
      />

      <div className="surface overflow-x-auto rounded-lg">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th
                className="label-cap sticky left-0 z-20 px-3 py-3 text-left"
                style={{ background: 'var(--app-surface)' }}
              >
                Area
              </th>
              {phases.map((ph) => (
                <th key={ph.id} className="px-1 py-3 text-center" title={ph.label}>
                  <div className="text-xs font-extrabold" style={{ color: 'var(--color-amp-400)' }}>
                    {ph.code}
                  </div>
                </th>
              ))}
              <th className="label-cap px-3 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {areas.map((area) => {
              const rowActivities = project.activities.filter((a) => a.areaId === area.id)
              const rowTotal = summarize(rowActivities, derived.activityMetrics)

              return (
                <tr key={area.id}>
                  <th
                    className="sticky left-0 z-10 max-w-[10rem] truncate border-t px-3 py-2 text-left text-xs font-bold"
                    style={{
                      background: 'var(--app-surface)',
                      borderColor: 'var(--app-line-soft)',
                    }}
                    title={area.name}
                  >
                    {area.name}
                  </th>

                  {phases.map((ph) => {
                    const acts = activitiesInCell(project, area.id, ph.id)
                    const s = summarize(acts, derived.activityMetrics)
                    return (
                      <td
                        key={ph.id}
                        className="border-t p-0.5"
                        style={{ borderColor: 'var(--app-line-soft)' }}
                      >
                        <Cell
                          summary={s}
                          mode={mode}
                          onClick={() => setCell({ areaId: area.id, phaseId: ph.id })}
                          label={`${area.name} ${ph.code}`}
                        />
                      </td>
                    )
                  })}

                  <td
                    className="border-t px-3 py-2 text-right text-xs font-bold"
                    style={{ borderColor: 'var(--app-line-soft)' }}
                  >
                    {rowTotal.budgetHours > 0 ? (
                      <>
                        <div>{fmtHours(rowTotal.budgetHours)}</div>
                        <div style={{ color: 'var(--app-text-dim)' }}>
                          {fmtPct(rowTotal.pctComplete)}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--app-text-dim)' }}>—</span>
                    )}
                  </td>
                </tr>
              )
            })}

            <tr>
              <th
                className="label-cap sticky left-0 z-10 border-t-2 px-3 py-3 text-left"
                style={{ background: 'var(--app-surface)', borderColor: 'var(--app-line)' }}
              >
                Total
              </th>
              {phases.map((ph) => {
                const acts = project.activities.filter((a) => a.phaseId === ph.id)
                const s = summarize(acts, derived.activityMetrics)
                return (
                  <td
                    key={ph.id}
                    className="border-t-2 px-1 py-3 text-center text-xs font-bold"
                    style={{ borderColor: 'var(--app-line)' }}
                  >
                    {s.budgetHours > 0 ? fmtHours(s.budgetHours) : '—'}
                  </td>
                )
              })}
              <td
                className="border-t-2 px-3 py-3 text-right text-xs font-extrabold"
                style={{ borderColor: 'var(--app-line)', color: 'var(--color-amp-400)' }}
              >
                {fmtHours(derived.metrics.budgetHours)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Legend mode={mode} />

      {cell && (
        <CellSheet
          areaId={cell.areaId}
          phaseId={cell.phaseId}
          onClose={() => setCell(null)}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Cell({
  summary,
  mode,
  onClick,
  label,
}: {
  summary: ReturnType<typeof summarize>
  mode: Mode
  onClick: () => void
  label: string
}) {
  const empty = summary.budgetHours === 0

  if (empty) {
    return (
      <button
        onClick={onClick}
        aria-label={`${label} — no work budgeted. Add work.`}
        className="flex w-full items-center justify-center rounded text-xs"
        style={{
          minHeight: '3.25rem',
          minWidth: '3.5rem',
          color: 'var(--app-text-dim)',
          border: '1px dashed var(--app-line-soft)',
        }}
      >
        +
      </button>
    )
  }

  // Sequential fill: one hue, deepening with how much work is in place.
  const fill = `color-mix(in srgb, var(--color-seq-400) ${Math.round(
    12 + summary.pctComplete * 0.68,
  )}%, transparent)`

  const primary =
    mode === 'hours'
      ? fmtHours(summary.budgetHours)
      : mode === 'production'
        ? fmtFactor(summary.productionFactor)
        : fmtPct(summary.pctComplete)

  const secondary =
    mode === 'hours'
      ? `${fmtHours(summary.actualHours)} used`
      : mode === 'production'
        ? `${fmtHours(summary.actualHours)} hrs`
        : fmtHours(summary.budgetHours)

  return (
    <button
      onClick={onClick}
      title={`${label} — ${fmtPct(summary.pctComplete)} complete, ${fmtHours(
        summary.budgetHours,
      )} budget hours, production factor ${fmtFactor(summary.productionFactor)}`}
      aria-label={`${label}: ${fmtPct(summary.pctComplete)} complete, ${fmtHours(
        summary.budgetHours,
      )} budget hours`}
      className="relative flex w-full flex-col items-center justify-center gap-0.5 rounded transition-[filter] hover:brightness-125"
      style={{
        minHeight: '3.25rem',
        minWidth: '3.5rem',
        background: fill,
        border: '1px solid var(--app-line-soft)',
      }}
    >
      {summary.rag !== 'none' && summary.rag !== 'go' && (
        <span
          aria-hidden="true"
          className="absolute top-0.5 right-1 text-[9px] leading-none"
          style={{ color: RAG_COLOR[summary.rag] }}
        >
          {RAG_GLYPH[summary.rag]}
        </span>
      )}
      <span className="readout text-sm font-extrabold">{primary}</span>
      <span className="text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
        {secondary}
      </span>
    </button>
  )
}

function Legend({ mode }: { mode: Mode }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
      <div className="flex items-center gap-2">
        <span className="label-cap">Fill</span>
        <span>none</span>
        <span className="flex">
          {[0, 25, 50, 75, 100].map((p) => (
            <span
              key={p}
              className="h-4 w-6"
              style={{
                background: `color-mix(in srgb, var(--color-seq-400) ${Math.round(12 + p * 0.68)}%, transparent)`,
                border: '1px solid var(--app-line-soft)',
              }}
            />
          ))}
        </span>
        <span>all in place</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="label-cap">Corner mark</span>
        <span style={{ color: RAG_COLOR.watch }}>{RAG_GLYPH.watch} slipping</span>
        <span style={{ color: RAG_COLOR.risk }}>{RAG_GLYPH.risk} behind</span>
      </div>
      <span>
        {mode === 'production'
          ? 'Production factor: hours earned ÷ hours spent. 1.00 is exactly on the estimate.'
          : mode === 'hours'
            ? 'Budget hours in each box, with hours charged so far underneath.'
            : 'Percent of the work physically in place, with budget hours underneath.'}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------

function CellSheet({
  areaId,
  phaseId,
  onClose,
}: {
  areaId: string
  phaseId: string
  onClose: () => void
}) {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)

  const area = project.areas.find((a) => a.id === areaId)
  const phase = project.phases.find((p) => p.id === phaseId)
  const acts = activitiesInCell(project, areaId, phaseId)

  const add = () =>
    mutate((d) => {
      d.activities.push({
        id: uid(),
        areaId,
        phaseId,
        name: `${phase?.label ?? 'Work'} — ${area?.name ?? ''}`,
        budgetHours: 0,
        budgetQty: 0,
        unit: 'LF',
        plannedStart: d.startDate,
        plannedFinish: d.targetFinish,
        curve: 'bell',
        predecessors: [],
        notes: '',
        sort: d.activities.length,
      })
    })

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${area?.name ?? ''} · ${phase?.code ?? ''}`}
      footer={
        <>
          <Button onClick={add}>
            <IconPlus size={18} /> Add work
          </Button>
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        </>
      }
    >
      {acts.length === 0 ? (
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Nothing budgeted where {area?.name} meets {phase?.label}. Add work if this job has some.
        </p>
      ) : (
        <div className="grid gap-4">
          {acts.map((a) => (
            <ActivityEditor key={a.id} activity={a} metrics={derived.activityMetrics.get(a.id)!} />
          ))}
        </div>
      )}
    </Sheet>
  )
}

function ActivityEditor({
  activity,
  metrics,
}: {
  activity: Activity
  metrics: ReturnType<typeof summarize> | import('../engine/earnedValue').ActivityMetrics
}) {
  const mutate = useProjectStore((s) => s.mutate)
  const m = metrics as import('../engine/earnedValue').ActivityMetrics

  const patch = (fn: (a: Activity) => void) =>
    mutate((d) => {
      const t = d.activities.find((x) => x.id === activity.id)
      if (t) fn(t)
    })

  return (
    <div className="surface-2 rounded-lg p-3">
      <div className="mb-3 flex items-start justify-between gap-2">
        <input
          value={activity.name}
          onChange={(e) => patch((a) => void (a.name = e.target.value))}
          className="flex-1 bg-transparent text-sm font-bold outline-none"
          style={{ color: 'var(--app-text)' }}
        />
        <button
          aria-label="Delete this work"
          onClick={() => {
            if (confirm('Delete this work and every hour and quantity reported against it?')) {
              mutate((d) => {
                d.activities = d.activities.filter((x) => x.id !== activity.id)
                d.progress = d.progress.filter((x) => x.activityId !== activity.id)
                d.time = d.time.filter((x) => x.activityId !== activity.id)
              })
            }
          }}
          style={{ color: 'var(--app-text-dim)' }}
        >
          <IconTrash size={18} />
        </button>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <Meter pct={m.pctComplete} rag={m.rag} label={`${activity.name} percent complete`} />
        <span className="readout shrink-0 text-sm font-extrabold">{fmtPct(m.pctComplete)}</span>
        <RagBadge rag={m.rag} label={`PF ${fmtFactor(m.productionFactor)}`} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Budget hours">
          <NumberInput value={activity.budgetHours} onChange={(v) => patch((a) => void (a.budgetHours = v))} />
        </Field>
        <Field label="Hours charged" hint="Reported from the field — not editable here.">
          <div
            className="flex items-center rounded-lg px-3"
            style={{
              minHeight: 'var(--spacing-tap)',
              background: 'var(--app-surface)',
              border: '1px solid var(--app-line-soft)',
              color: 'var(--app-text-muted)',
            }}
          >
            {fmtHours(m.actualHours)}
          </div>
        </Field>
        <Field label="Budget quantity" hint="What you can count. Leave 0 to track by percent instead.">
          <NumberInput value={activity.budgetQty} onChange={(v) => patch((a) => void (a.budgetQty = v))} />
        </Field>
        <Field label="Unit">
          <Select
            value={activity.unit}
            onChange={(v) => patch((a) => void (a.unit = v))}
            options={UNITS.map((u) => ({ value: u, label: u }))}
          />
        </Field>
        <Field label="Start">
          <DateInput value={activity.plannedStart} onChange={(v) => patch((a) => void (a.plannedStart = v))} />
        </Field>
        <Field label="Finish">
          <DateInput value={activity.plannedFinish} onChange={(v) => patch((a) => void (a.plannedFinish = v))} />
        </Field>
        <Field
          label="Manpower shape"
          hint="How the crew loads across the run."
          className="sm:col-span-2"
        >
          <Select<CurveShape>
            value={activity.curve}
            onChange={(v) => patch((a) => void (a.curve = v))}
            options={[
              { value: 'bell', label: 'Ramp up, peak, taper off (most work)' },
              { value: 'uniform', label: 'Flat crew the whole run' },
              { value: 'frontLoaded', label: 'Heavy at the start (gear sets, pulls)' },
              { value: 'backLoaded', label: 'Heavy at the end (trim, punch)' },
            ]}
          />
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          <TextArea value={activity.notes} onChange={(v) => patch((a) => void (a.notes = v))} rows={2} />
        </Field>
      </div>

      {m.actualHours >= 8 && (
        <Explain>
          {m.productionFactor >= 1
            ? `Beating the estimate: ${fmtHours(m.earnedHours)} hours of work in place for ${fmtHours(m.actualHours)} hours charged. On this pace it finishes around ${fmtHours(m.eacHours)} hours, ${fmtHours(Math.abs(m.varianceHours))} under.`
            : `${fmtHours(m.earnedHours)} hours of work in place for ${fmtHours(m.actualHours)} charged. On this pace it finishes around ${fmtHours(m.eacHours)} hours — ${fmtHours(Math.abs(m.varianceHours))} over budget.${m.tcpi ? ` Getting back to budget needs ${fmtFactor(m.tcpi)} productivity on everything left.` : ' The budget for this work is already spent.'}`}
          {' '}Runs {fmtDate(activity.plannedStart)} to {fmtDate(activity.plannedFinish)}.
        </Explain>
      )}
    </div>
  )
}
