import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button,
  DateInput,
  Explain,
  Field,
  NumberInput,
  Panel,
  Select,
  TextInput,
  fmtHours,
} from '../components/ui'
import { IconPlus, IconTrash } from '../components/icons'
import { AREA_TEMPLATES, uid } from '../domain/templates'
import { useActiveProject, useProjectStore } from '../store/project'
import { orderedPhases } from '../store/selectors'
import { addWeeks, format, parseISO } from 'date-fns'

/**
 * Setup wizard.
 *
 * The whole adoption argument rests on this screen: if standing up a job takes
 * an afternoon, nobody past the first curious foreman will ever do it. Five
 * steps, every one of them skippable, templates on the two that are tedious.
 */

const STEPS = ['Job', 'Crew & wages', 'Areas', 'Phases', 'Hours'] as const
type Step = (typeof STEPS)[number]

export default function Setup() {
  const navigate = useNavigate()
  const project = useActiveProject()
  const mutate = useProjectStore((s) => s.mutate)
  const [step, setStep] = useState(0)

  if (!project) {
    navigate('/projects')
    return null
  }

  const current = STEPS[step] as Step
  const last = step === STEPS.length - 1

  return (
    <div className="mx-auto max-w-3xl px-4 py-6">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight">Set up the job</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Five short steps. You can skip any of them and fill it in later — nothing here locks.
        </p>

        <ol className="mt-4 flex gap-1">
          {STEPS.map((s, i) => (
            <li key={s} className="flex-1">
              <button
                onClick={() => setStep(i)}
                className="w-full rounded text-left text-[10px] font-bold tracking-wide uppercase"
                style={{ color: i <= step ? 'var(--color-amp-400)' : 'var(--app-text-dim)' }}
              >
                <span
                  className="mb-1 block h-1.5 rounded-full"
                  style={{
                    background: i <= step ? 'var(--color-amp-400)' : 'var(--app-line-soft)',
                  }}
                />
                {s}
              </button>
            </li>
          ))}
        </ol>
      </header>

      {current === 'Job' && <StepJob />}
      {current === 'Crew & wages' && <StepWages />}
      {current === 'Areas' && <StepAreas />}
      {current === 'Phases' && <StepPhases />}
      {current === 'Hours' && <StepHours />}

      <footer className="mt-6 flex justify-between gap-2">
        <Button onClick={() => (step === 0 ? navigate('/projects') : setStep(step - 1))}>
          {step === 0 ? 'Cancel' : 'Back'}
        </Button>
        <div className="flex gap-2">
          {!last && <Button onClick={() => setStep(step + 1)}>Skip</Button>}
          <Button
            variant="primary"
            large
            onClick={() => (last ? navigate('/dashboard') : setStep(step + 1))}
          >
            {last ? 'Open the job' : 'Next'}
          </Button>
        </div>
      </footer>
    </div>
  )

  // -------------------------------------------------------------------------

  function StepJob() {
    const p = project!
    return (
      <Panel title="Job information">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Job name" className="sm:col-span-2">
            <TextInput value={p.name} onChange={(v) => mutate((d) => void (d.name = v))} />
          </Field>
          <Field label="Job number">
            <TextInput value={p.number} onChange={(v) => mutate((d) => void (d.number = v))} />
          </Field>
          <Field label="General contractor">
            <TextInput
              value={p.generalContractor}
              onChange={(v) => mutate((d) => void (d.generalContractor = v))}
            />
          </Field>
          <Field label="City">
            <TextInput value={p.city} onChange={(v) => mutate((d) => void (d.city = v))} />
          </Field>
          <Field label="County" hint="Drives which prevailing wage determination applies.">
            <TextInput value={p.county} onChange={(v) => mutate((d) => void (d.county = v))} />
          </Field>
          <Field label="Start date">
            <DateInput value={p.startDate} onChange={(v) => mutate((d) => void (d.startDate = v))} />
          </Field>
          <Field label="Target finish">
            <DateInput
              value={p.targetFinish}
              onChange={(v) => mutate((d) => void (d.targetFinish = v))}
            />
          </Field>
          <Field label="Contract type">
            <Select
              value={p.contractType}
              onChange={(v) =>
                mutate((d) => {
                  d.contractType = v
                  // Public work brings the compliance obligations with it.
                  d.complianceEnabled = v === 'public'
                  d.stwfRequired = v === 'public'
                })
              }
              options={[
                { value: 'private', label: 'Private' },
                { value: 'public', label: 'Public works (prevailing wage)' },
              ]}
            />
          </Field>
          <Field label="Contract value" hint="Optional — used for cost context only.">
            <NumberInput
              value={p.contractValue}
              onChange={(v) => mutate((d) => void (d.contractValue = v))}
            />
          </Field>
        </div>

        {p.contractType === 'public' && (
          <Explain>
            Compliance tracking is now on: the apprentice ratio (one apprentice hour per five
            journeyman hours, totaled over the job), the Skilled &amp; Trained Workforce percentage,
            and reminders for DAS-140 and DAS-142. Turn any of it off under Settings.
          </Explain>
        )}
      </Panel>
    )
  }

  function StepWages() {
    const p = project!
    const cal = p.ruleProfile.workCalendar
    return (
      <div className="grid gap-4">
        <Panel title="Local & agreement">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Local union">
              <TextInput
                value={p.ruleProfile.localUnion}
                onChange={(v) => mutate((d) => void (d.ruleProfile.localUnion = v))}
              />
            </Field>
            <Field label="Region">
              <TextInput
                value={p.ruleProfile.region}
                onChange={(v) => mutate((d) => void (d.ruleProfile.region = v))}
              />
            </Field>
            <Field label="Work days per week">
              <Select
                value={String(cal.daysPerWeek)}
                onChange={(v) =>
                  mutate((d) => void (d.ruleProfile.workCalendar.daysPerWeek = Number(v)))
                }
                options={[
                  { value: '4', label: '4 days' },
                  { value: '5', label: '5 days' },
                  { value: '6', label: '6 days' },
                ]}
              />
            </Field>
            <Field label="Hours per day" hint={`${cal.daysPerWeek * cal.hoursPerDay} hours a week per hand.`}>
              <Select
                value={String(cal.hoursPerDay)}
                onChange={(v) =>
                  mutate((d) => void (d.ruleProfile.workCalendar.hoursPerDay = Number(v)))
                }
                options={[
                  { value: '8', label: '8 hours (5×8)' },
                  { value: '10', label: '10 hours (4×10)' },
                  { value: '12', label: '12 hours' },
                ]}
              />
            </Field>
            <Field
              label="Site manpower cap"
              hint="Most bodies the site can absorb. 0 for no limit."
            >
              <NumberInput
                value={p.siteManpowerCap}
                onChange={(v) => mutate((d) => void (d.siteManpowerCap = v))}
              />
            </Field>
          </div>
        </Panel>

        <Panel title="Wage package">
          <Field
            label="Journeyman wireman base hourly rate"
            hint="Every other classification is a percentage of this. Fringes are on the Settings screen."
          >
            <NumberInput
              step={0.01}
              value={p.wagePackage.baseHourlyJW}
              onChange={(v) => mutate((d) => void (d.wagePackage.baseHourlyJW = v))}
            />
          </Field>
          <Explain>
            The app ships with a Southern California structure filled in as a starting point — base
            rate, health and welfare, both pensions, vacation, training, NEBF at 3% of base, AMF at
            0.5%, and LMCC. <strong>Check every figure against your current wage sheet</strong>{' '}
            under Settings before you trust a dollar number. The hours forecasting works regardless.
          </Explain>
        </Panel>
      </div>
    )
  }

  function StepAreas() {
    const p = project!
    const [name, setName] = useState('')

    const addArea = (n: string) => {
      const trimmed = n.trim()
      if (!trimmed) return
      mutate((d) => {
        d.areas.push({ id: uid(), name: trimmed, sort: d.areas.length })
      })
      setName('')
    }

    return (
      <Panel title="Areas">
        <p className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          How the job splits up on the ground — floors, buildings, zones. These become the rows of
          your work matrix.
        </p>

        {p.areas.length === 0 && (
          <div className="mb-4">
            <div className="label-cap mb-2">Start from a template</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(AREA_TEMPLATES).map(([label, names]) => (
                <Button
                  key={label}
                  onClick={() =>
                    mutate((d) => {
                      names.forEach((n, i) =>
                        d.areas.push({ id: uid(), name: n, sort: d.areas.length + i }),
                      )
                    })
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
        )}

        <ul className="mb-3 grid gap-2">
          {p.areas.map((a) => (
            <li key={a.id} className="surface-2 flex items-center gap-2 rounded-lg px-3 py-2">
              <input
                value={a.name}
                onChange={(e) =>
                  mutate((d) => {
                    const t = d.areas.find((x) => x.id === a.id)
                    if (t) t.name = e.target.value
                  })
                }
                className="flex-1 bg-transparent text-sm font-semibold outline-none"
                style={{ minHeight: '2rem', color: 'var(--app-text)' }}
              />
              <button
                aria-label={`Remove ${a.name}`}
                onClick={() =>
                  mutate((d) => {
                    d.areas = d.areas.filter((x) => x.id !== a.id)
                    d.activities = d.activities.filter((x) => x.areaId !== a.id)
                  })
                }
                style={{ color: 'var(--app-text-dim)' }}
              >
                <IconTrash size={18} />
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <TextInput
            value={name}
            onChange={setName}
            placeholder="Add an area — e.g. Level 3, Central Plant"
          />
          <Button onClick={() => addArea(name)}>
            <IconPlus size={18} />
          </Button>
        </div>
      </Panel>
    )
  }

  function StepPhases() {
    const p = project!
    return (
      <Panel title="Phase codes">
        <p className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          The eleven standard electrical phases are already here. Delete what this job does not
          have, rename anything your shop calls something else. These become the columns of the work
          matrix.
        </p>
        <ul className="grid gap-2">
          {orderedPhases(p).map((ph) => (
            <li key={ph.id} className="surface-2 flex items-center gap-2 rounded-lg px-3 py-2">
              <input
                value={ph.code}
                onChange={(e) =>
                  mutate((d) => {
                    const t = d.phases.find((x) => x.id === ph.id)
                    if (t) t.code = e.target.value.toUpperCase()
                  })
                }
                className="w-20 rounded bg-transparent text-sm font-extrabold outline-none"
                style={{ color: 'var(--color-amp-400)' }}
              />
              <input
                value={ph.label}
                onChange={(e) =>
                  mutate((d) => {
                    const t = d.phases.find((x) => x.id === ph.id)
                    if (t) t.label = e.target.value
                  })
                }
                className="flex-1 bg-transparent text-sm outline-none"
                style={{ color: 'var(--app-text)' }}
              />
              <button
                aria-label={`Remove ${ph.code}`}
                onClick={() =>
                  mutate((d) => {
                    d.phases = d.phases.filter((x) => x.id !== ph.id)
                    d.activities = d.activities.filter((x) => x.phaseId !== ph.id)
                  })
                }
                style={{ color: 'var(--app-text-dim)' }}
              >
                <IconTrash size={18} />
              </button>
            </li>
          ))}
        </ul>
        <Button
          className="mt-3"
          onClick={() =>
            mutate((d) => {
              d.phases.push({ id: uid(), code: 'NEW', label: 'New phase', sort: d.phases.length })
            })
          }
        >
          <IconPlus size={18} /> Add a phase
        </Button>
      </Panel>
    )
  }

  function StepHours() {
    const p = project!
    const areas = p.areas
    const phases = orderedPhases(p)
    const total = p.activities.reduce((s, a) => s + a.budgetHours, 0)

    if (areas.length === 0 || phases.length === 0) {
      return (
        <Panel title="Budget hours">
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            Add at least one area and one phase first — hours get budgeted where the two cross.
          </p>
        </Panel>
      )
    }

    return (
      <Panel
        title="Budget hours"
        actions={
          <span className="text-sm font-bold" style={{ color: 'var(--color-amp-400)' }}>
            {fmtHours(total)} hrs
          </span>
        }
      >
        <p className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Put the estimated hours where each phase meets each area. Leave a box empty if that work
          does not exist. Dates default to the job window and get adjusted on the Timeline.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="label-cap sticky left-0 z-10 px-2 py-2 text-left" style={{ background: 'var(--app-surface)' }}>
                  Area
                </th>
                {phases.map((ph) => (
                  <th key={ph.id} className="label-cap px-1 py-2 text-center" title={ph.label}>
                    {ph.code}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {areas.map((area) => (
                <tr key={area.id}>
                  <th
                    className="sticky left-0 z-10 max-w-[9rem] truncate px-2 py-1 text-left text-xs font-semibold"
                    style={{ background: 'var(--app-surface)' }}
                    title={area.name}
                  >
                    {area.name}
                  </th>
                  {phases.map((ph) => {
                    const existing = p.activities.find(
                      (a) => a.areaId === area.id && a.phaseId === ph.id,
                    )
                    return (
                      <td key={ph.id} className="p-0.5">
                        <input
                          type="number"
                          inputMode="numeric"
                          value={existing?.budgetHours || ''}
                          placeholder="—"
                          onChange={(e) => setHours(area.id, ph.id, Number(e.target.value))}
                          className="w-16 rounded px-1 py-2 text-center text-sm outline-none"
                          style={{
                            background: 'var(--app-surface-2)',
                            border: '1px solid var(--app-line-soft)',
                            color: 'var(--app-text)',
                          }}
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    )

    function setHours(areaId: string, phaseId: string, hours: number) {
      mutate((d) => {
        const existing = d.activities.find((a) => a.areaId === areaId && a.phaseId === phaseId)

        if (hours <= 0) {
          if (existing) d.activities = d.activities.filter((a) => a.id !== existing.id)
          return
        }

        if (existing) {
          existing.budgetHours = hours
          return
        }

        const ph = d.phases.find((x) => x.id === phaseId)
        const area = d.areas.find((x) => x.id === areaId)
        d.activities.push({
          id: uid(),
          areaId,
          phaseId,
          name: `${ph?.label ?? 'Work'} — ${area?.name ?? ''}`,
          budgetHours: hours,
          budgetQty: 0,
          unit: 'LOT',
          plannedStart: d.startDate,
          plannedFinish: format(addWeeks(parseISO(d.startDate), 4), 'yyyy-MM-dd'),
          curve: 'bell',
          predecessors: [],
          notes: '',
          sort: d.activities.length,
        })
      })
    }
  }
}
