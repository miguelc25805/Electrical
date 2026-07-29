import { useMemo, useState } from 'react'
import { addWeeks, format, parseISO } from 'date-fns'
import {
  Button,
  DateInput,
  Explain,
  Field,
  Panel,
  RAG_COLOR,
  RagBadge,
  SectionHeader,
  Segmented,
  Select,
  Sheet,
  TextInput,
  fmtDate,
  fmtDateFull,
  fmtHours,
  fmtPct,
} from '../components/ui'
import { IconPlus, IconPrint, IconTrash } from '../components/icons'
import { BarChart } from '../components/charts'
import { uid } from '../domain/templates'
import type { Commitment, Constraint, ConstraintType } from '../domain/types'
import { lookaheadWeeks, ppcHistory, readiness, reasonLabel, topReasons } from '../engine/schedule'
import { weekKey } from '../engine/curve'
import { useActiveProject, useProjectStore } from '../store/project'
import { orderedAreas, useDerived } from '../store/selectors'

/**
 * Timeline and make-ready planning.
 *
 * Three views of the same work at three zoom levels: the whole job as bars,
 * the next three weeks as a make-ready list, and last week's promises scored.
 * Bars are colored by whether the work can actually be done — not by phase,
 * since the phase code is already written on the bar.
 */

type Tab = 'gantt' | 'lookahead' | 'commitments'

export default function Timeline() {
  const [tab, setTab] = useState<Tab>('gantt')

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Timeline & Lookahead"
        actions={
          <>
            <Segmented
              value={tab}
              onChange={setTab}
              options={[
                { value: 'gantt', label: 'Whole job' },
                { value: 'lookahead', label: '3-week' },
                { value: 'commitments', label: 'Promises' },
              ]}
            />
            <Button onClick={() => window.print()}>
              <IconPrint size={18} />
            </Button>
          </>
        }
      />
      {tab === 'gantt' && <Gantt />}
      {tab === 'lookahead' && <Lookahead />}
      {tab === 'commitments' && <Commitments />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function Gantt() {
  const project = useActiveProject()!
  const derived = useDerived(project)
  const areas = orderedAreas(project)

  const { min, max, spanDays } = useMemo(() => {
    const dates = project.activities.flatMap((a) => [a.plannedStart, a.plannedFinish])
    if (dates.length === 0) {
      return { min: project.startDate, max: project.targetFinish, spanDays: 1 }
    }
    const lo = dates.reduce((a, b) => (a < b ? a : b))
    const hi = dates.reduce((a, b) => (a > b ? a : b))
    return {
      min: lo,
      max: hi,
      spanDays: Math.max(1, (Date.parse(hi) - Date.parse(lo)) / 86_400_000),
    }
  }, [project.activities, project.startDate, project.targetFinish])

  const pos = (d: string) => ((Date.parse(d) - Date.parse(min)) / 86_400_000 / spanDays) * 100
  const todayPos = pos(derived.today)

  if (project.activities.length === 0) {
    return (
      <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
        Budget work in the Work Matrix and it appears here as a schedule.
      </p>
    )
  }

  // Month ticks across the top.
  const months: { label: string; left: number }[] = []
  {
    const d = parseISO(min)
    d.setDate(1)
    while (d <= parseISO(max)) {
      const iso = format(d, 'yyyy-MM-dd')
      if (iso >= min) months.push({ label: format(d, 'MMM'), left: pos(iso) })
      d.setMonth(d.getMonth() + 1)
    }
  }

  return (
    // A job that crosses a year boundary needs the year spelled out, or
    // "Feb 25 — Mar 9" reads as a two-week job.
    <Panel title={`${fmtDateFull(min)} — ${fmtDateFull(max)}`}>
      <div className="relative">
        <div className="relative mb-1 h-4" style={{ marginLeft: '11rem' }}>
          {months.map((m) => (
            <span
              key={m.label + m.left}
              className="absolute text-[10px]"
              style={{ left: `${m.left}%`, color: 'var(--app-text-muted)' }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {areas.map((area) => {
          const acts = project.activities
            .filter((a) => a.areaId === area.id)
            .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))
          if (acts.length === 0) return null

          return (
            <div key={area.id} className="mb-3">
              <div className="mb-1 text-xs font-extrabold">{area.name}</div>
              {acts.map((a) => {
                const m = derived.activityMetrics.get(a.id)!
                const r = readiness(a, project.constraints, derived.today)
                const done = m.pctComplete >= 99.5
                // Bar color says whether the work can be done, not which phase
                // it is — the phase code is written on the bar itself.
                const color = done
                  ? 'var(--color-go-500)'
                  : !r.ready
                    ? RAG_COLOR[r.rag]
                    : m.rag === 'risk'
                      ? 'var(--color-risk-500)'
                      : m.rag === 'watch'
                        ? 'var(--color-watch-500)'
                        : 'var(--color-seq-400)'

                return (
                  <div key={a.id} className="flex items-center gap-2">
                    <div
                      className="w-44 shrink-0 truncate text-[11px]"
                      style={{ color: 'var(--app-text-muted)' }}
                      title={a.name}
                    >
                      <span className="font-extrabold" style={{ color: 'var(--color-amp-400)' }}>
                        {derived.phaseById.get(a.phaseId)?.code}
                      </span>{' '}
                      {fmtHours(a.budgetHours)}h
                    </div>
                    <div className="relative h-6 flex-1">
                      <div
                        className={`absolute top-1 h-4 rounded ${!r.ready ? 'hazard' : ''}`}
                        style={{
                          left: `${pos(a.plannedStart)}%`,
                          width: `${Math.max(0.6, pos(a.plannedFinish) - pos(a.plannedStart))}%`,
                          background: color,
                          opacity: done ? 0.5 : 1,
                        }}
                        title={`${a.name} · ${fmtDate(a.plannedStart)}–${fmtDate(a.plannedFinish)} · ${fmtPct(m.pctComplete)} complete${r.ready ? '' : ' · BLOCKED'}`}
                      />
                      {/* Progress overlay: how much of the bar is actually in. */}
                      {m.pctComplete > 0 && !done && (
                        <div
                          className="absolute top-1 h-4 rounded"
                          style={{
                            left: `${pos(a.plannedStart)}%`,
                            width: `${Math.max(0.3, (pos(a.plannedFinish) - pos(a.plannedStart)) * (m.pctComplete / 100))}%`,
                            background: 'var(--app-text)',
                            opacity: 0.25,
                          }}
                        />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}

        {todayPos >= 0 && todayPos <= 100 && (
          <div
            className="pointer-events-none absolute top-0 bottom-0"
            style={{
              left: `calc(11rem + ${todayPos}% * (100% - 11rem) / 100%)`,
              width: 2,
              background: 'var(--color-amp-400)',
            }}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-xs" style={{ color: 'var(--app-text-muted)' }}>
        <LegendChip color="var(--color-seq-400)" label="Ready to work" />
        <LegendChip color="var(--color-watch-500)" label="Slipping" />
        <LegendChip color="var(--color-risk-500)" label="Behind or blocked" />
        <LegendChip color="var(--color-go-500)" label="Complete" />
        <span>Hatched = blocked by an open constraint. The amber line is today.</span>
      </div>
    </Panel>
  )
}

function LegendChip({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-5 rounded" style={{ background: color }} aria-hidden="true" />
      {label}
    </span>
  )
}

// ---------------------------------------------------------------------------

function Lookahead() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)
  const [editing, setEditing] = useState<Constraint | null>(null)

  const weeks = lookaheadWeeks(derived.today, 3, project.ruleProfile.workCalendar.weekStartsOn)
  const windowEnd = format(addWeeks(parseISO(weeks[0]), 3), 'yyyy-MM-dd')

  const inWindow = project.activities
    .filter((a) => a.plannedStart <= windowEnd && a.plannedFinish >= weeks[0])
    .sort((a, b) => a.plannedStart.localeCompare(b.plannedStart))

  const openConstraints = project.constraints
    .filter((c) => c.status === 'open')
    .sort((a, b) => a.needBy.localeCompare(b.needBy))

  const newConstraint = (): Constraint => ({
    id: uid(),
    type: 'material',
    description: '',
    owner: '',
    needBy: format(addWeeks(new Date(), 1), 'yyyy-MM-dd'),
    status: 'open',
  })

  return (
    <div className="grid gap-4">
      <Panel title={`Make-ready — ${fmtDate(weeks[0])} through ${fmtDate(windowEnd)}`}>
        {inWindow.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            No work scheduled in the next three weeks.
          </p>
        ) : (
          <ul className="grid gap-2">
            {inWindow.map((a) => {
              const r = readiness(a, project.constraints, derived.today)
              const m = derived.activityMetrics.get(a.id)!
              return (
                <li
                  key={a.id}
                  className={`surface-2 rounded-lg px-3 py-2.5 ${r.ready ? '' : 'hazard'}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
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
                    <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      {fmtDate(a.plannedStart)}–{fmtDate(a.plannedFinish)} · {fmtHours(a.budgetHours)}h
                    </span>
                    <RagBadge
                      rag={r.ready ? 'go' : r.rag}
                      label={r.ready ? 'Ready' : `${r.openConstraints.length} blocker${r.openConstraints.length === 1 ? '' : 's'}`}
                    />
                  </div>
                  {!r.ready && (
                    <ul className="mt-1.5 grid gap-1">
                      {r.openConstraints.map((c) => (
                        <li key={c.id} className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                          <strong style={{ color: 'var(--color-risk-500)' }}>
                            {c.type.toUpperCase()}
                          </strong>{' '}
                          {c.description} — {c.owner || 'unassigned'}, needed {fmtDate(c.needBy)}
                        </li>
                      ))}
                    </ul>
                  )}
                  {r.ready && m.pctComplete > 0 && (
                    <div className="mt-1 text-xs" style={{ color: 'var(--app-text-dim)' }}>
                      {fmtPct(m.pctComplete)} in place
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <Explain>
          An activity with an open constraint is not ready, whatever the bar chart says — putting a
          crew on it is how a week of production gets lost. Clear these before the week they are
          needed, not on the morning of.
        </Explain>
      </Panel>

      <Panel
        title={`Constraint log (${openConstraints.length} open)`}
        actions={
          <Button onClick={() => setEditing(newConstraint())}>
            <IconPlus size={18} /> Add
          </Button>
        }
      >
        {openConstraints.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            Nothing open. Log anything standing between the crew and the work — material, an RFI,
            another trade, access, an inspection.
          </p>
        ) : (
          <ul className="grid gap-2">
            {openConstraints.map((c) => {
              const late = c.needBy < derived.today
              const activity = project.activities.find((a) => a.id === c.activityId)
              return (
                <li key={c.id} className="surface-2 flex items-start gap-3 rounded-lg px-3 py-2">
                  <button
                    onClick={() => setEditing(c)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-extrabold uppercase"
                        style={{
                          background: 'color-mix(in srgb, var(--color-risk-500) 16%, transparent)',
                          color: 'var(--color-risk-500)',
                        }}
                      >
                        {c.type}
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-semibold">{c.description}</span>
                      <RagBadge
                        rag={late ? 'risk' : 'watch'}
                        label={late ? `${fmtDate(c.needBy)} — past due` : fmtDate(c.needBy)}
                      />
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      {c.owner || 'Unassigned'}
                      {activity && ` · blocks ${derived.phaseById.get(activity.phaseId)?.code} in ${derived.areaById.get(activity.areaId)?.name}`}
                    </div>
                  </button>
                  <Button
                    onClick={() =>
                      mutate((d) => {
                        const t = d.constraints.find((x) => x.id === c.id)
                        if (t) {
                          t.status = 'cleared'
                          t.clearedDate = derived.today
                        }
                      })
                    }
                  >
                    Clear
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
      </Panel>

      {editing && (
        <ConstraintSheet constraint={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  )
}

function ConstraintSheet({
  constraint,
  onClose,
}: {
  constraint: Constraint
  onClose: () => void
}) {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)
  const [draft, setDraft] = useState<Constraint>(constraint)
  const exists = project.constraints.some((c) => c.id === constraint.id)

  const save = () => {
    mutate((d) => {
      const i = d.constraints.findIndex((c) => c.id === draft.id)
      if (i >= 0) d.constraints[i] = draft
      else d.constraints.push(draft)
    })
    onClose()
  }

  const TYPES: { value: ConstraintType; label: string }[] = [
    { value: 'material', label: 'Material not on site' },
    { value: 'submittal', label: 'Submittal not approved' },
    { value: 'rfi', label: 'RFI / missing information' },
    { value: 'predecessor', label: 'Another trade is not done' },
    { value: 'access', label: 'No access to the area' },
    { value: 'inspection', label: 'Inspection needed' },
    { value: 'permit', label: 'Permit' },
    { value: 'engineering', label: 'Engineering / design' },
    { value: 'other', label: 'Other' },
  ]

  return (
    <Sheet
      open
      onClose={onClose}
      title={exists ? 'Edit constraint' : 'New constraint'}
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              onClick={() => {
                mutate((d) => {
                  d.constraints = d.constraints.filter((c) => c.id !== draft.id)
                })
                onClose()
              }}
            >
              <IconTrash size={18} /> Delete
            </Button>
          )}
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <Field label="What is in the way">
          <TextInput
            value={draft.description}
            onChange={(v) => setDraft({ ...draft, description: v })}
            placeholder="Fixture package rejected — resubmit with revised lens spec"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Type">
            <Select
              value={draft.type}
              onChange={(v) => setDraft({ ...draft, type: v })}
              options={TYPES}
            />
          </Field>
          <Field label="Who owes it">
            <TextInput
              value={draft.owner}
              onChange={(v) => setDraft({ ...draft, owner: v })}
              placeholder="GC, engineer, supplier"
            />
          </Field>
          <Field label="Needed by">
            <DateInput value={draft.needBy} onChange={(v) => setDraft({ ...draft, needBy: v })} />
          </Field>
          <Field label="Blocks which work" hint="Optional — links it to the schedule.">
            <Select
              value={draft.activityId ?? ''}
              onChange={(v) => setDraft({ ...draft, activityId: v || undefined })}
              options={[
                { value: '', label: 'Not tied to specific work' },
                ...project.activities.map((a) => ({
                  value: a.id,
                  label: `${derived.phaseById.get(a.phaseId)?.code} — ${derived.areaById.get(a.areaId)?.name}`,
                })),
              ]}
            />
          </Field>
        </div>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

function Commitments() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)
  const [text, setText] = useState('')
  const [who, setWho] = useState('')

  const thisWeek = weekKey(derived.today, project.ruleProfile.workCalendar.weekStartsOn)
  const history = ppcHistory(project.commitments).slice(-8)
  const reasons = topReasons(project.commitments)
  const week = project.commitments.filter((c) => c.weekStart === thisWeek)

  const add = () => {
    if (!text.trim()) return
    mutate((d) => {
      const c: Commitment = {
        id: uid(),
        weekStart: thisWeek,
        description: text.trim(),
        promisedBy: who.trim(),
        completed: false,
      }
      d.commitments.push(c)
    })
    setText('')
  }

  return (
    <div className="grid gap-4">
      <Panel title={`This week's promises — week of ${fmtDate(thisWeek)}`}>
        <ul className="mb-3 grid gap-2">
          {week.map((c) => (
            <li key={c.id} className="surface-2 flex items-center gap-3 rounded-lg px-3 py-2">
              <input
                type="checkbox"
                checked={c.completed}
                onChange={(e) =>
                  mutate((d) => {
                    const t = d.commitments.find((x) => x.id === c.id)
                    if (t) {
                      t.completed = e.target.checked
                      if (e.target.checked) t.reasonCode = undefined
                    }
                  })
                }
                className="h-6 w-6 shrink-0"
                style={{ accentColor: 'var(--color-go-500)' }}
              />
              <div className="min-w-0 flex-1">
                <div className={`text-sm ${c.completed ? 'line-through opacity-60' : 'font-semibold'}`}>
                  {c.description}
                </div>
                {c.promisedBy && (
                  <div className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {c.promisedBy}
                  </div>
                )}
              </div>
              {!c.completed && (
                <div className="w-40 shrink-0">
                  <Select
                    value={c.reasonCode ?? ''}
                    onChange={(v) =>
                      mutate((d) => {
                        const t = d.commitments.find((x) => x.id === c.id)
                        if (t) t.reasonCode = (v || undefined) as Commitment['reasonCode']
                      })
                    }
                    options={[
                      { value: '', label: 'If missed, why?' },
                      { value: 'material', label: 'Material' },
                      { value: 'manpower', label: 'Manpower' },
                      { value: 'priorWork', label: 'Prior work' },
                      { value: 'information', label: 'Information' },
                      { value: 'access', label: 'Access' },
                      { value: 'weather', label: 'Weather' },
                      { value: 'equipment', label: 'Equipment' },
                      { value: 'rework', label: 'Rework' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </div>
              )}
              <button
                aria-label="Remove promise"
                onClick={() =>
                  mutate((d) => {
                    d.commitments = d.commitments.filter((x) => x.id !== c.id)
                  })
                }
                style={{ color: 'var(--app-text-dim)' }}
              >
                <IconTrash size={16} />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <div className="min-w-0 flex-1">
            <TextInput
              value={text}
              onChange={setText}
              placeholder="What the crew is promising this week"
            />
          </div>
          <div className="w-36">
            <TextInput value={who} onChange={setWho} placeholder="Who" />
          </div>
          <Button onClick={add}>
            <IconPlus size={18} />
          </Button>
        </div>
      </Panel>

      {history.length > 0 && (
        <Panel title="Percent Plan Complete">
          <BarChart
            data={history.map((h) => ({ label: fmtDate(h.weekStart), value: h.pct }))}
            target={75}
            colorFor={(v) =>
              v >= 75 ? 'var(--color-go-500)' : v >= 60 ? 'var(--color-watch-500)' : 'var(--color-risk-500)'
            }
          />
          <Explain>
            The share of each week's promises the crew actually kept. Below 75% means the work is
            not being made ready before it is handed to the crew — the fix is upstream of the field,
            in the constraint log.
          </Explain>
        </Panel>
      )}

      {reasons.length > 0 && (
        <Panel title="Why promises get missed">
          <ul className="grid gap-2">
            {reasons.map((r) => (
              <li key={r.code} className="flex items-center gap-3">
                <span className="w-40 shrink-0 text-sm">{reasonLabel(r.code)}</span>
                <div
                  className="h-5 rounded"
                  style={{
                    width: `${(r.count / reasons[0].count) * 60}%`,
                    background: 'var(--color-series-2)',
                  }}
                />
                <span className="text-xs font-bold">{r.count}</span>
              </li>
            ))}
          </ul>
          <Explain>
            This is the most useful list on the job. The top reason is what is costing the crew
            weeks — and it is almost never something the crew controls.
          </Explain>
        </Panel>
      )}
    </div>
  )
}
