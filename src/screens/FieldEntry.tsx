import { useMemo, useState } from 'react'
import {
  Button,
  DateInput,
  Explain,
  Field,
  Meter,
  NumberInput,
  Panel,
  RagBadge,
  SectionHeader,
  TextArea,
  fmtDate,
  fmtHours,
  fmtPct,
} from '../components/ui'
import { IconBack } from '../components/icons'
import { uid } from '../domain/templates'
import type { Activity, TimeEntry } from '../domain/types'
import { useActiveProject, useProjectStore } from '../store/project'
import { useDerived } from '../store/selectors'
import { todayStr } from '../engine/schedule'

/**
 * Field entry.
 *
 * The whole tool lives or dies here. If reporting a day takes more than about
 * a minute standing up with one thumb, it does not get done, and every forecast
 * downstream is fiction.
 *
 * So: pick the work, say how much went in, say who was on it. Yesterday's crew
 * is pre-filled because it is almost always the same crew, and the running
 * totals appear as you type so a foreman can sanity-check without leaving.
 */

export default function FieldEntry() {
  const project = useActiveProject()!
  const derived = useDerived(project)
  const [date, setDate] = useState(todayStr())
  const [activityId, setActivityId] = useState<string | null>(null)

  // Work that is actually live right now floats to the top; a foreman should
  // not scroll past punch-out work from six months ago to find today's face.
  const sorted = useMemo(() => {
    const active = (a: Activity) => a.plannedStart <= date && a.plannedFinish >= date
    return [...project.activities].sort((a, b) => {
      if (active(a) !== active(b)) return active(a) ? -1 : 1
      const ma = derived.activityMetrics.get(a.id)
      const mb = derived.activityMetrics.get(b.id)
      // Then work already under way, then by start date.
      const sa = (ma?.pctComplete ?? 0) > 0 ? 0 : 1
      const sb = (mb?.pctComplete ?? 0) > 0 ? 0 : 1
      if (sa !== sb) return sa - sb
      return a.plannedStart.localeCompare(b.plannedStart)
    })
  }, [project.activities, derived.activityMetrics, date])

  if (project.activities.length === 0) {
    return (
      <div className="p-4 sm:p-6">
        <SectionHeader title="Field Entry" />
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Budget some work in the Work Matrix first — there is nothing to report against yet.
        </p>
      </div>
    )
  }

  if (activityId) {
    return (
      <EntryForm
        activityId={activityId}
        date={date}
        onBack={() => setActivityId(null)}
      />
    )
  }

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Field Entry"
        subtitle="Tap the work you put in today."
        actions={
          <div className="w-44">
            <DateInput value={date} onChange={setDate} />
          </div>
        }
      />

      <ul className="grid gap-2">
        {sorted.map((a) => {
          const m = derived.activityMetrics.get(a.id)!
          const area = derived.areaById.get(a.areaId)
          const phase = derived.phaseById.get(a.phaseId)
          const live = a.plannedStart <= date && a.plannedFinish >= date
          const reportedToday = project.progress.some(
            (p) => p.activityId === a.id && p.date === date,
          )

          return (
            <li key={a.id}>
              <button
                onClick={() => setActivityId(a.id)}
                className="surface w-full rounded-lg p-3 text-left transition-[filter] hover:brightness-110"
                style={{
                  minHeight: 'var(--spacing-tap-lg)',
                  opacity: live ? 1 : 0.62,
                  borderColor: reportedToday ? 'var(--color-go-500)' : undefined,
                }}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="rounded px-1.5 py-0.5 text-[10px] font-extrabold"
                    style={{
                      background: 'color-mix(in srgb, var(--color-amp-400) 18%, transparent)',
                      color: 'var(--color-amp-400)',
                    }}
                  >
                    {phase?.code}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-bold">{area?.name}</span>
                  {reportedToday && <RagBadge rag="go" label="reported" />}
                </div>
                <div className="mt-0.5 truncate text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  {a.name}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Meter pct={m.pctComplete} rag={m.rag} height={6} label={`${a.name} complete`} />
                  <span className="readout shrink-0 text-xs font-bold">
                    {fmtPct(m.pctComplete)}
                  </span>
                </div>
                <div className="mt-1 text-[11px]" style={{ color: 'var(--app-text-dim)' }}>
                  {fmtHours(m.actualHours)} of {fmtHours(m.budgetHours)} hrs ·{' '}
                  {fmtDate(a.plannedStart)}–{fmtDate(a.plannedFinish)}
                </div>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// ---------------------------------------------------------------------------

function EntryForm({
  activityId,
  date,
  onBack,
}: {
  activityId: string
  date: string
  onBack: () => void
}) {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)

  const activity = project.activities.find((a) => a.id === activityId)!
  const metrics = derived.activityMetrics.get(activityId)!
  const area = derived.areaById.get(activity.areaId)
  const phase = derived.phaseById.get(activity.phaseId)

  const [qty, setQty] = useState(0)
  const [pct, setPct] = useState(Math.round(metrics.pctComplete))
  const [note, setNote] = useState('')

  const classes = project.ruleProfile.classifications.filter((c) => c.enabled)

  // Pre-fill from the most recent day anyone worked this activity — the crew
  // is nearly always the same crew, so the common case becomes zero typing.
  const [crew, setCrew] = useState<Record<string, number>>(() => {
    const dates = project.time
      .filter((t) => t.activityId === activityId && t.date < date)
      .map((t) => t.date)
      .sort()
    const last = dates[dates.length - 1]
    if (!last) return {}
    const out: Record<string, number> = {}
    for (const t of project.time) {
      if (t.activityId === activityId && t.date === last) {
        out[t.classificationCode] = t.straightHours + t.otHours + t.dtHours
      }
    }
    return out
  })

  const byQuantity = activity.budgetQty > 0
  const crewHours = Object.values(crew).reduce((a, b) => a + b, 0)

  const save = () => {
    mutate((d) => {
      // Replace anything already reported for this activity on this day rather
      // than stacking a second entry — a foreman correcting a number should not
      // have to hunt down the first one.
      d.progress = d.progress.filter(
        (p) => !(p.activityId === activityId && p.date === date),
      )
      d.time = d.time.filter((t) => !(t.activityId === activityId && t.date === date))

      if (byQuantity ? qty !== 0 : pct !== Math.round(metrics.pctComplete)) {
        d.progress.push({
          id: uid(),
          activityId,
          date,
          qtyInstalled: byQuantity ? qty : 0,
          pctOverride: byQuantity ? undefined : pct,
          note,
        })
      }

      for (const [code, hours] of Object.entries(crew)) {
        if (!hours) continue
        const perDay = d.ruleProfile.workCalendar.hoursPerDay
        const entry: TimeEntry = {
          id: uid(),
          activityId,
          date,
          classificationCode: code,
          workers: Math.max(1, Math.round(hours / perDay)),
          // Anything past the scheduled day for one hand is premium time.
          straightHours: Math.min(hours, Math.ceil(hours / perDay) * perDay),
          otHours: 0,
          dtHours: 0,
        }
        d.time.push(entry)
      }
    })
    onBack()
  }

  return (
    <div className="p-4 sm:p-6">
      <button
        onClick={onBack}
        className="mb-3 flex items-center gap-1 text-sm font-semibold"
        style={{ color: 'var(--app-text-muted)', minHeight: 'var(--spacing-tap)' }}
      >
        <IconBack size={18} /> All work
      </button>

      <SectionHeader
        title={`${phase?.code} · ${area?.name}`}
        subtitle={`${activity.name} · reporting ${fmtDate(date)}`}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={byQuantity ? 'What went in today' : 'How far along is it'}>
          {byQuantity ? (
            <>
              <Field
                label={`Quantity installed today (${activity.unit})`}
                hint={`${fmtHours(metrics.qtyInstalled)} of ${fmtHours(activity.budgetQty)} ${activity.unit} in place so far.`}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  value={qty || ''}
                  placeholder="0"
                  onChange={(e) => setQty(Number(e.target.value))}
                  className="w-full rounded-lg px-4 text-center text-3xl font-extrabold outline-none"
                  style={{
                    minHeight: '4.5rem',
                    background: 'var(--app-surface-2)',
                    border: '1px solid var(--app-line)',
                    color: 'var(--app-text)',
                  }}
                />
              </Field>
              <div className="mt-3 flex flex-wrap gap-2">
                {[10, 25, 50, 100, 250].map((n) => (
                  <Button key={n} onClick={() => setQty(qty + n)}>
                    +{n}
                  </Button>
                ))}
                <Button onClick={() => setQty(0)}>Clear</Button>
              </div>
              <div className="mt-4">
                <Meter
                  pct={
                    activity.budgetQty > 0
                      ? ((metrics.qtyInstalled + qty) / activity.budgetQty) * 100
                      : 0
                  }
                  label="Projected complete"
                />
                <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                  Would put it at{' '}
                  <strong>
                    {fmtPct(
                      activity.budgetQty > 0
                        ? ((metrics.qtyInstalled + qty) / activity.budgetQty) * 100
                        : 0,
                    )}
                  </strong>{' '}
                  complete.
                </div>
              </div>
            </>
          ) : (
            <>
              <Field label="Percent complete" hint="For work with nothing countable — testing, trim, punch.">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={pct}
                  onChange={(e) => setPct(Number(e.target.value))}
                  className="w-full"
                  style={{ minHeight: 'var(--spacing-tap)', accentColor: 'var(--color-amp-400)' }}
                />
              </Field>
              <div className="readout mt-1 text-center text-4xl font-extrabold">{pct}%</div>
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {[0, 25, 50, 75, 90, 100].map((n) => (
                  <Button key={n} onClick={() => setPct(n)}>
                    {n}%
                  </Button>
                ))}
              </div>
            </>
          )}

          <Field label="Note" className="mt-4">
            <TextArea
              value={note}
              onChange={setNote}
              rows={2}
              placeholder="Anything worth remembering about today on this work"
            />
          </Field>
        </Panel>

        <Panel title="Who was on it">
          <p className="mb-3 text-xs" style={{ color: 'var(--app-text-muted)' }}>
            Hours by classification. Pre-filled from the last day this work was reported — change
            what moved.
          </p>
          <div className="grid gap-2">
            {classes.map((c) => (
              <div key={c.code} className="flex items-center gap-2">
                <span className="w-28 shrink-0 text-xs font-bold">{c.code}</span>
                <span
                  className="min-w-0 flex-1 truncate text-xs"
                  style={{ color: 'var(--app-text-muted)' }}
                >
                  {c.label}
                </span>
                <div className="w-24 shrink-0">
                  <NumberInput
                    value={crew[c.code] ?? 0}
                    onChange={(v) => setCrew({ ...crew, [c.code]: v })}
                  />
                </div>
              </div>
            ))}
          </div>
          <div
            className="mt-3 flex items-center justify-between border-t pt-3 text-sm font-bold"
            style={{ borderColor: 'var(--app-line-soft)' }}
          >
            <span>Total hours today</span>
            <span className="readout text-lg">{fmtHours(crewHours)}</span>
          </div>
        </Panel>
      </div>

      <div className="mt-4 flex gap-2">
        <Button onClick={onBack}>Cancel</Button>
        <Button variant="primary" large full onClick={save}>
          Save {fmtDate(date)}
        </Button>
      </div>

      <Explain>
        Percent complete comes from what is physically in place, never from hours burned — that is
        the only way the production factor can tell you something you did not already know. This
        work has {fmtHours(metrics.actualHours)} hours charged against {fmtHours(metrics.budgetHours)}{' '}
        budgeted.
      </Explain>
    </div>
  )
}
