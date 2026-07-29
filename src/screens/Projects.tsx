import { useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bolt } from '../App'
import { Button, EmptyState, fmtDateFull, fmtHours } from '../components/ui'
import { IconPlus, IconTrash, IconUpload } from '../components/icons'
import { buildDemoProject } from '../domain/demo'
import type { Project } from '../domain/types'
import { blankProject, useProjectStore } from '../store/project'
import { projectMetrics } from '../engine/earnedValue'

/**
 * The front door. Also the only screen a first-time user sees, so it has to
 * answer "what is this and why should I care" without a tour.
 */
export default function Projects() {
  const navigate = useNavigate()
  const projects = useProjectStore((s) => s.projects)
  const addProject = useProjectStore((s) => s.addProject)
  const setActive = useProjectStore((s) => s.setActive)
  const removeProject = useProjectStore((s) => s.removeProject)
  const importProject = useProjectStore((s) => s.importProject)
  const fileRef = useRef<HTMLInputElement>(null)

  const startNew = () => {
    addProject(blankProject())
    navigate('/setup')
  }

  const startDemo = () => {
    addProject(buildDemoProject(blankProject()))
    navigate('/dashboard')
  }

  const open = (id: string) => {
    setActive(id)
    navigate('/dashboard')
  }

  const onImport = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as Project
      if (!parsed.schemaVersion || !Array.isArray(parsed.activities)) {
        alert('That file is not a GF Field Command project export.')
        return
      }
      importProject(parsed)
      navigate('/dashboard')
    } catch {
      alert('Could not read that file. Make sure it is a project .json export.')
    }
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:py-14">
      <header className="mb-8">
        <div className="flex items-center gap-3">
          <Bolt size={34} />
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
              GF Field Command
            </h1>
            <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
              Labor, manpower, material and schedule — one place, works offline.
            </p>
          </div>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="grid gap-4">
          <EmptyState
            title="Start with the worked example"
            body="A five-story medical office job, about forty percent through, already running a little behind on rough-in with a transformer that is late to submit. Poke at it before you put your own job in — nothing here leaves your device."
            action={
              <Button variant="primary" large onClick={startDemo}>
                Open the example job
              </Button>
            }
          />
          <div className="flex flex-wrap gap-2">
            <Button large onClick={startNew}>
              <IconPlus size={18} /> Set up my job
            </Button>
            <Button large onClick={() => fileRef.current?.click()}>
              <IconUpload size={18} /> Open a project file
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            <Button variant="primary" large onClick={startNew}>
              <IconPlus size={18} /> New job
            </Button>
            <Button large onClick={() => fileRef.current?.click()}>
              <IconUpload size={18} /> Open a file
            </Button>
            {!projects.some((p) => p.number === '24-118') && (
              <Button large onClick={startDemo}>
                Load example job
              </Button>
            )}
          </div>

          <ul className="grid gap-3">
            {projects.map((p) => {
              const m = projectMetrics(p.activities, p.progress, p.time)
              return (
                <li key={p.id} className="surface flex items-center gap-3 rounded-lg p-4">
                  <button onClick={() => open(p.id)} className="min-w-0 flex-1 text-left">
                    <div className="truncate text-base font-bold">{p.name}</div>
                    <div className="truncate text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      {p.number ? `#${p.number} · ` : ''}
                      {p.generalContractor || 'No GC set'} · {p.ruleProfile.localUnion}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: 'var(--app-text-dim)' }}>
                      {fmtHours(m.budgetHours)} budget hrs ·{' '}
                      {m.budgetHours > 0 ? `${Math.round(m.completePct)}% complete` : 'not set up yet'} ·
                      updated {fmtDateFull(p.updatedAt.slice(0, 10))}
                    </div>
                  </button>
                  <button
                    aria-label={`Delete ${p.name}`}
                    onClick={() => {
                      if (
                        confirm(
                          `Delete "${p.name}"? This removes it from this device permanently. Export it first if you want a copy.`,
                        )
                      ) {
                        removeProject(p.id)
                      }
                    }}
                    className="flex shrink-0 items-center justify-center rounded-lg"
                    style={{
                      minWidth: 'var(--spacing-tap)',
                      minHeight: 'var(--spacing-tap)',
                      color: 'var(--app-text-dim)',
                    }}
                  >
                    <IconTrash size={18} />
                  </button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void onImport(f)
          e.target.value = ''
        }}
      />

      <footer
        className="mt-10 border-t pt-6 text-xs leading-relaxed"
        style={{ borderColor: 'var(--app-line-soft)', color: 'var(--app-text-dim)' }}
      >
        <p>
          Everything stays on this device — there is no account and no server. Use
          <strong> Settings ▸ Backup</strong> to export a job as a file you can email, keep on a
          drive, or hand to the next foreman. Add this page to your home screen and it runs with no
          signal at all.
        </p>
        <p className="mt-2">
          Wage figures and agreement rules ship as editable defaults. Check them against your own
          wage sheet and agreement before trusting any dollar forecast.
        </p>
      </footer>
    </div>
  )
}
