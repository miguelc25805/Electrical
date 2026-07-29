import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoreNav } from '../App'
import {
  Button,
  Explain,
  Field,
  NumberInput,
  Panel,
  SectionHeader,
  Segmented,
  Select,
  TextInput,
} from '../components/ui'
import { IconDownload, IconPlus, IconTrash, IconUpload } from '../components/icons'
import type { Fringe, Project } from '../domain/types'
import { classificationBase, computeRate } from '../engine/wages'
import { useActiveProject, useProjectStore } from '../store/project'

/**
 * Settings.
 *
 * This is the screen that decides whether the tool travels past one local. Every
 * agreement rule, wage figure and classification is data here — another local
 * adopts the app by editing this page, never by waiting on a code change.
 */

type Tab = 'job' | 'rules' | 'wages' | 'classes' | 'backup'

export default function Settings() {
  const [tab, setTab] = useState<Tab>('job')
  const theme = useProjectStore((s) => s.theme)
  const setTheme = useProjectStore((s) => s.setTheme)

  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Settings & Rules"
        actions={
          <Button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? 'Bright mode' : 'Dark mode'}
          </Button>
        }
      />

      <div className="mb-4 sm:hidden">
        <MoreNav />
      </div>

      <div className="mb-4 overflow-x-auto">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'job', label: 'Job' },
            { value: 'rules', label: 'Agreement' },
            { value: 'wages', label: 'Wages' },
            { value: 'classes', label: 'Classifications' },
            { value: 'backup', label: 'Backup' },
          ]}
        />
      </div>

      {tab === 'job' && <JobTab />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'wages' && <WagesTab />}
      {tab === 'classes' && <ClassesTab />}
      {tab === 'backup' && <BackupTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function JobTab() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)

  return (
    <Panel title="Job information">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Job name" className="sm:col-span-2">
          <TextInput value={project.name} onChange={(v) => mutate((d) => void (d.name = v))} />
        </Field>
        <Field label="Job number">
          <TextInput value={project.number} onChange={(v) => mutate((d) => void (d.number = v))} />
        </Field>
        <Field label="General contractor">
          <TextInput
            value={project.generalContractor}
            onChange={(v) => mutate((d) => void (d.generalContractor = v))}
          />
        </Field>
        <Field label="Owner">
          <TextInput value={project.owner} onChange={(v) => mutate((d) => void (d.owner = v))} />
        </Field>
        <Field label="Address">
          <TextInput value={project.address} onChange={(v) => mutate((d) => void (d.address = v))} />
        </Field>
        <Field label="City">
          <TextInput value={project.city} onChange={(v) => mutate((d) => void (d.city = v))} />
        </Field>
        <Field label="County">
          <TextInput value={project.county} onChange={(v) => mutate((d) => void (d.county = v))} />
        </Field>
        <Field label="Contract type">
          <Select
            value={project.contractType}
            onChange={(v) => mutate((d) => void (d.contractType = v))}
            options={[
              { value: 'private', label: 'Private' },
              { value: 'public', label: 'Public works' },
            ]}
          />
        </Field>
        <Field label="Contract value">
          <NumberInput
            value={project.contractValue}
            onChange={(v) => mutate((d) => void (d.contractValue = v))}
          />
        </Field>
        <Field label="Track public-works compliance">
          <Select
            value={project.complianceEnabled ? 'yes' : 'no'}
            onChange={(v) => mutate((d) => void (d.complianceEnabled = v === 'yes'))}
            options={[
              { value: 'yes', label: 'Yes — apprentice ratio, DAS notices' },
              { value: 'no', label: 'No' },
            ]}
          />
        </Field>
        <Field label="Skilled & Trained Workforce applies">
          <Select
            value={project.stwfRequired ? 'yes' : 'no'}
            onChange={(v) => mutate((d) => void (d.stwfRequired = v === 'yes'))}
            options={[
              { value: 'yes', label: 'Yes — AB 3018 covered project' },
              { value: 'no', label: 'No' },
            ]}
          />
        </Field>
        <Field label="Required graduate percentage" hint="60% since January 2020 for most crafts.">
          <NumberInput
            value={project.stwfPercent}
            onChange={(v) => mutate((d) => void (d.stwfPercent = v))}
          />
        </Field>
      </div>
    </Panel>
  )
}

// ---------------------------------------------------------------------------

function RulesTab() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const rp = project.ruleProfile

  return (
    <div className="grid gap-4">
      <Panel title="Local & calendar">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Profile name" className="sm:col-span-2">
            <TextInput
              value={rp.name}
              onChange={(v) => mutate((d) => void (d.ruleProfile.name = v))}
            />
          </Field>
          <Field label="Local union">
            <TextInput
              value={rp.localUnion}
              onChange={(v) => mutate((d) => void (d.ruleProfile.localUnion = v))}
            />
          </Field>
          <Field label="Region">
            <TextInput
              value={rp.region}
              onChange={(v) => mutate((d) => void (d.ruleProfile.region = v))}
            />
          </Field>
          <Field label="Work days per week">
            <NumberInput
              value={rp.workCalendar.daysPerWeek}
              onChange={(v) => mutate((d) => void (d.ruleProfile.workCalendar.daysPerWeek = v))}
            />
          </Field>
          <Field label="Hours per day">
            <NumberInput
              value={rp.workCalendar.hoursPerDay}
              onChange={(v) => mutate((d) => void (d.ruleProfile.workCalendar.hoursPerDay = v))}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Supervision ratios">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Foreman required at crew of"
            hint="Crew size at which the agreement requires a foreman."
          >
            <NumberInput
              value={rp.foremanRequiredAtCrew}
              onChange={(v) => mutate((d) => void (d.ruleProfile.foremanRequiredAtCrew = v))}
            />
          </Field>
          <Field
            label="Workers per foreman"
            hint="Before a second foreman is required."
          >
            <NumberInput
              value={rp.journeymenPerForeman}
              onChange={(v) => mutate((d) => void (d.ruleProfile.journeymenPerForeman = v))}
            />
          </Field>
          <Field
            label="General foreman at"
            hint="Number of foremen that triggers a GF."
          >
            <NumberInput
              value={rp.generalForemanAtForemen}
              onChange={(v) => mutate((d) => void (d.ruleProfile.generalForemanAtForemen = v))}
            />
          </Field>
        </div>
        <Explain>
          These are seeded from what is common in inside agreements — a foreman required at three or
          more workers, roughly ten workers per foreman, and a general foreman designated once there
          are two foremen. <strong>Confirm them against your own agreement</strong>; they vary by
          local and by contract term.
        </Explain>
      </Panel>

      <Panel title="Apprentice ratios">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Journeyman hours per apprentice hour"
            hint="California public works is 5, giving a 1:5 ratio over the life of the job."
          >
            <NumberInput
              value={rp.publicWorksJwHoursPerApprentice}
              onChange={(v) =>
                mutate((d) => void (d.ruleProfile.publicWorksJwHoursPerApprentice = v))
              }
            />
          </Field>
          <Field
            label="Apprentice allowed after journeyman #"
            hint="On-the-job crew ratio from the agreement. 1 means 1:1 starting with the second journeyman."
          >
            <NumberInput
              value={rp.cbaApprenticeAllowedAfterJw}
              onChange={(v) => mutate((d) => void (d.ruleProfile.cbaApprenticeAllowedAfterJw = v))}
            />
          </Field>
        </div>
      </Panel>

      <Panel title="Overtime">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Overtime after (hrs/day)">
            <NumberInput
              value={rp.overtime.dailyThreshold}
              onChange={(v) => mutate((d) => void (d.ruleProfile.overtime.dailyThreshold = v))}
            />
          </Field>
          <Field label="Overtime multiplier">
            <NumberInput
              step={0.1}
              value={rp.overtime.dailyMultiplier}
              onChange={(v) => mutate((d) => void (d.ruleProfile.overtime.dailyMultiplier = v))}
            />
          </Field>
          <Field label="Double time after (hrs/day)">
            <NumberInput
              value={rp.overtime.doubleTimeThreshold}
              onChange={(v) => mutate((d) => void (d.ruleProfile.overtime.doubleTimeThreshold = v))}
            />
          </Field>
          <Field label="Saturday multiplier">
            <NumberInput
              step={0.1}
              value={rp.overtime.saturdayMultiplier}
              onChange={(v) => mutate((d) => void (d.ruleProfile.overtime.saturdayMultiplier = v))}
            />
          </Field>
          <Field label="Sunday multiplier">
            <NumberInput
              step={0.1}
              value={rp.overtime.sundayMultiplier}
              onChange={(v) => mutate((d) => void (d.ruleProfile.overtime.sundayMultiplier = v))}
            />
          </Field>
          <Field label="Holiday multiplier">
            <NumberInput
              step={0.1}
              value={rp.overtime.holidayMultiplier}
              onChange={(v) => mutate((d) => void (d.ruleProfile.overtime.holidayMultiplier = v))}
            />
          </Field>
        </div>
      </Panel>
    </div>
  )
}

// ---------------------------------------------------------------------------

function WagesTab() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const confirmWages = useProjectStore((s) => s.confirmWages)
  const confirmed = useProjectStore((s) => s.wagesConfirmed[project.id])
  const pkg = project.wagePackage

  const jw = project.ruleProfile.classifications.find((c) => c.code === 'JW')
  const straight = jw ? computeRate(pkg, jw, 1) : null
  const overtime = jw ? computeRate(pkg, jw, 1.5) : null

  const setFringe = (code: string, patch: Partial<Fringe>) =>
    mutate((d) => {
      const f = d.wagePackage.fringes.find((x) => x.code === code)
      if (f) Object.assign(f, patch)
    })

  return (
    <div className="grid gap-4">
      <Panel title="Base rate">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Journeyman wireman base hourly"
            hint="Every classification is a percentage of this."
          >
            <NumberInput
              step={0.01}
              value={pkg.baseHourlyJW}
              onChange={(v) => mutate((d) => void (d.wagePackage.baseHourlyJW = v))}
            />
          </Field>
          <Field
            label="Payroll burden %"
            hint="FICA, SUI and workers' comp on the cash wage."
          >
            <NumberInput
              step={0.5}
              value={pkg.burdenPct}
              onChange={(v) => mutate((d) => void (d.wagePackage.burdenPct = v))}
            />
          </Field>
        </div>
        {!confirmed && (
          <div className="mt-3">
            <Button variant="primary" onClick={() => confirmWages(project.id)}>
              I've checked these against my wage sheet
            </Button>
          </div>
        )}
      </Panel>

      <Panel
        title="Fringes"
        actions={
          <Button
            onClick={() =>
              mutate((d) => {
                d.wagePackage.fringes.push({
                  code: `F${d.wagePackage.fringes.length + 1}`,
                  label: 'New fringe',
                  amount: 0,
                  basis: 'flat',
                  otFactored: false,
                })
              })
            }
          >
            <IconPlus size={18} />
          </Button>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="label-cap">
                <th className="px-2 py-2 text-left">Fringe</th>
                <th className="px-2 py-2 text-right">Amount</th>
                <th className="px-2 py-2 text-left">Basis</th>
                <th className="px-2 py-2 text-center">OT factored</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pkg.fringes.map((f) => (
                <tr key={f.code} className="border-t" style={{ borderColor: 'var(--app-line-soft)' }}>
                  <td className="px-2 py-1.5">
                    <TextInput value={f.label} onChange={(v) => setFringe(f.code, { label: v })} />
                  </td>
                  <td className="w-28 px-2 py-1.5">
                    <NumberInput
                      step={0.01}
                      value={f.amount}
                      onChange={(v) => setFringe(f.code, { amount: v })}
                    />
                  </td>
                  <td className="w-40 px-2 py-1.5">
                    <Select
                      value={f.basis}
                      onChange={(v) => setFringe(f.code, { basis: v })}
                      options={[
                        { value: 'flat', label: '$ per hour' },
                        { value: 'pctOfBase', label: '% of base' },
                      ]}
                    />
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    <input
                      type="checkbox"
                      checked={f.otFactored}
                      onChange={(e) => setFringe(f.code, { otFactored: e.target.checked })}
                      className="h-5 w-5"
                      style={{ accentColor: 'var(--color-amp-400)' }}
                    />
                  </td>
                  <td className="px-2">
                    <button
                      aria-label={`Remove ${f.label}`}
                      onClick={() =>
                        mutate((d) => {
                          d.wagePackage.fringes = d.wagePackage.fringes.filter(
                            (x) => x.code !== f.code,
                          )
                        })
                      }
                      style={{ color: 'var(--app-text-dim)' }}
                    >
                      <IconTrash size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Explain>
          <strong>$ per hour</strong> fringes are a fixed contribution and do not change on overtime.{' '}
          <strong>% of base</strong> fringes — NEBF at 3% and AMF at 0.5% — are factored at the
          overtime multiplier along with the wage, which is why overtime costs more than one and a
          half times straight time.
        </Explain>
      </Panel>

      {straight && overtime && (
        <Panel title="What an hour costs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-cap">
                  <th className="px-2 py-2 text-left">Journeyman wireman</th>
                  <th className="px-2 py-2 text-right">Straight</th>
                  <th className="px-2 py-2 text-right">Time and a half</th>
                </tr>
              </thead>
              <tbody>
                <RateRow label="Cash wage" a={straight.cashWage} b={overtime.cashWage} />
                <RateRow label="Flat fringes" a={straight.flatFringes} b={overtime.flatFringes} />
                <RateRow label="% of base fringes" a={straight.pctFringes} b={overtime.pctFringes} />
                <RateRow label="Total package" a={straight.totalPackage} b={overtime.totalPackage} bold />
                <RateRow label="Payroll burden" a={straight.burden} b={overtime.burden} />
                <RateRow label="Fully loaded cost" a={straight.fullyLoaded} b={overtime.fullyLoaded} bold />
              </tbody>
            </table>
          </div>
        </Panel>
      )}
    </div>
  )
}

function RateRow({ label, a, b, bold }: { label: string; a: number; b: number; bold?: boolean }) {
  return (
    <tr className="border-t" style={{ borderColor: 'var(--app-line-soft)' }}>
      <td className={`px-2 py-1.5 ${bold ? 'font-bold' : ''}`}>{label}</td>
      <td className={`readout px-2 py-1.5 text-right ${bold ? 'font-extrabold' : ''}`}>
        ${a.toFixed(2)}
      </td>
      <td className={`readout px-2 py-1.5 text-right ${bold ? 'font-extrabold' : ''}`}>
        ${b.toFixed(2)}
      </td>
    </tr>
  )
}

// ---------------------------------------------------------------------------

function ClassesTab() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const pkg = project.wagePackage

  return (
    <Panel title="Classifications">
      <p className="mb-4 text-sm" style={{ color: 'var(--app-text-muted)' }}>
        Percent of the journeyman rate, and how each classification counts for ratio purposes. Switch
        off anything your local does not use so it stays out of the field-entry pickers.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="label-cap">
              <th className="px-2 py-2 text-left">Code</th>
              <th className="px-2 py-2 text-left">Label</th>
              <th className="px-2 py-2 text-right">% of JW</th>
              <th className="px-2 py-2 text-right">Rate</th>
              <th className="px-2 py-2 text-center" title="Counts on the journeyman side of the apprentice ratio">
                Journey
              </th>
              <th className="px-2 py-2 text-center" title="Graduated a state-approved apprenticeship — counts toward Skilled & Trained">
                Grad
              </th>
              <th className="px-2 py-2 text-center">On</th>
            </tr>
          </thead>
          <tbody>
            {project.ruleProfile.classifications.map((c) => (
              <tr key={c.code} className="border-t" style={{ borderColor: 'var(--app-line-soft)' }}>
                <td className="px-2 py-1.5 font-extrabold">{c.code}</td>
                <td className="px-2 py-1.5">{c.label}</td>
                <td className="w-24 px-2 py-1.5">
                  <NumberInput
                    value={c.wagePct}
                    onChange={(v) =>
                      mutate((d) => {
                        const t = d.ruleProfile.classifications.find((x) => x.code === c.code)
                        if (t) t.wagePct = v
                      })
                    }
                  />
                </td>
                <td className="readout px-2 py-1.5 text-right">
                  ${classificationBase(pkg, c).toFixed(2)}
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={c.journeyLevel}
                    onChange={(e) =>
                      mutate((d) => {
                        const t = d.ruleProfile.classifications.find((x) => x.code === c.code)
                        if (t) t.journeyLevel = e.target.checked
                      })
                    }
                    className="h-5 w-5"
                    style={{ accentColor: 'var(--color-amp-400)' }}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={Boolean(c.apprenticeshipGraduate)}
                    onChange={(e) =>
                      mutate((d) => {
                        const t = d.ruleProfile.classifications.find((x) => x.code === c.code)
                        if (t) t.apprenticeshipGraduate = e.target.checked
                      })
                    }
                    className="h-5 w-5"
                    style={{ accentColor: 'var(--color-amp-400)' }}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={c.enabled}
                    onChange={(e) =>
                      mutate((d) => {
                        const t = d.ruleProfile.classifications.find((x) => x.code === c.code)
                        if (t) t.enabled = e.target.checked
                      })
                    }
                    className="h-5 w-5"
                    style={{ accentColor: 'var(--color-go-500)' }}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Explain>
        <strong>Journey</strong> means the classification counts on the journeyman side of the 1:5
        apprentice ratio — foremen and the general foreman do.{' '}
        <strong>Grad</strong> marks journey-level workers who graduated a state-approved
        apprenticeship, which is what the Skilled &amp; Trained Workforce percentage measures.
      </Explain>
    </Panel>
  )
}

// ---------------------------------------------------------------------------

function BackupTab() {
  const project = useActiveProject()!
  const navigate = useNavigate()
  const importProject = useProjectStore((s) => s.importProject)
  const removeProject = useProjectStore((s) => s.removeProject)
  const fileRef = useRef<HTMLInputElement>(null)

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${project.name.replace(/\W+/g, '-')}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="grid gap-4">
      <Panel title="Backup & hand-off">
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Everything lives on this device. There is no server holding a copy — so export the job
          somewhere safe, the same way you would back up anything else that matters.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="primary" large onClick={exportJson}>
            <IconDownload size={18} /> Export this job
          </Button>
          <Button large onClick={() => fileRef.current?.click()}>
            <IconUpload size={18} /> Open a job file
          </Button>
        </div>
        <Explain>
          The export is a single file with the whole job in it — hours, quantities, materials,
          constraints, logs and tickets. Email it to yourself weekly, keep it on a drive, or hand it
          to the foreman taking over. Opening a file brings it in as a separate copy so it never
          overwrites what you are working on.
        </Explain>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const parsed = JSON.parse(await f.text()) as Project
              if (!parsed.schemaVersion || !Array.isArray(parsed.activities)) {
                alert('That file is not a GF Field Command project export.')
                return
              }
              importProject(parsed)
              navigate('/dashboard')
            } catch {
              alert('Could not read that file.')
            }
          }}
        />
      </Panel>

      <Panel title="Install on this device">
        <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
          Use your browser's <strong>Add to Home Screen</strong> (or Install) option. It then opens
          like any other app and works with no signal at all — basements, shafts, yards, anywhere.
        </p>
      </Panel>

      <Panel title="Danger zone">
        <Button
          variant="danger"
          onClick={() => {
            if (
              confirm(
                `Delete "${project.name}" from this device? Everything reported against it goes with it. Export it first if you want a copy.`,
              )
            ) {
              removeProject(project.id)
              navigate('/projects')
            }
          }}
        >
          <IconTrash size={18} /> Delete this job
        </Button>
      </Panel>
    </div>
  )
}
