import { useRef, useState } from 'react'
import {
  Button,
  DateInput,
  Explain,
  Field,
  Panel,
  RagBadge,
  SectionHeader,
  Segmented,
  Select,
  Sheet,
  TextArea,
  TextInput,
  fmtDate,
  fmtDateFull,
  fmtHours,
  fmtMoney,
  NumberInput,
} from '../components/ui'
import { IconPlus, IconPrint, IconTrash } from '../components/icons'
import { uid } from '../domain/templates'
import type { DailyLog, TMTicket } from '../domain/types'
import { computeRate, findClassification } from '../engine/wages'
import { todayStr } from '../engine/schedule'
import { useActiveProject, useProjectStore } from '../store/project'

/**
 * Daily logs and extra-work tickets.
 *
 * This is the defensive half of the job. A daily log written the same day, and
 * a T&M ticket signed on the spot, are what turn "we got hammered by that
 * casework change" into a paid change order six months later. Nobody enjoys
 * this part, so it is built to take two minutes.
 */

type Tab = 'daily' | 'tm'

export default function Logs() {
  const [tab, setTab] = useState<Tab>('daily')
  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Daily Log & Extra Work"
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'daily', label: 'Daily log' },
              { value: 'tm', label: 'T&M tickets' },
            ]}
          />
        }
      />
      {tab === 'daily' ? <DailyLogs /> : <TMTickets />}
    </div>
  )
}

// ---------------------------------------------------------------------------

function DailyLogs() {
  const project = useActiveProject()!
  const [editing, setEditing] = useState<DailyLog | null>(null)

  const blank = (): DailyLog => ({
    id: uid(),
    date: todayStr(),
    weather: '',
    temperature: '',
    workPerformed: '',
    delays: '',
    visitors: '',
    safetyTopic: '',
    notes: '',
    photos: [],
  })

  const logs = [...project.dailyLogs].sort((a, b) => b.date.localeCompare(a.date))
  const hasToday = logs.some((l) => l.date === todayStr())

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button variant="primary" large onClick={() => setEditing(blank())}>
          <IconPlus size={18} /> {hasToday ? 'Add a log' : "Write today's log"}
        </Button>
      </div>

      {logs.length === 0 ? (
        <Panel>
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            No logs yet. A daily log written the day it happened is worth more than a memo written
            six months later — especially the delays field.
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-3">
          {logs.map((l) => (
            <li key={l.id}>
              <button onClick={() => setEditing(l)} className="surface w-full rounded-lg p-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold">{fmtDateFull(l.date)}</span>
                  {l.weather && (
                    <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                      {l.weather} {l.temperature}
                    </span>
                  )}
                  {l.delays && <RagBadge rag="risk" label="Delay logged" />}
                  {l.photos.length > 0 && (
                    <span className="text-xs" style={{ color: 'var(--app-text-dim)' }}>
                      {l.photos.length} photo{l.photos.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
                <p className="mt-1 line-clamp-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  {l.workPerformed || 'No work described'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && <DailyLogSheet log={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function DailyLogSheet({ log, onClose }: { log: DailyLog; onClose: () => void }) {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const [draft, setDraft] = useState(log)
  const fileRef = useRef<HTMLInputElement>(null)
  const exists = project.dailyLogs.some((l) => l.id === log.id)

  // Hours already reported through Field Entry for this day — no retyping.
  const dayHours = project.time
    .filter((t) => t.date === draft.date)
    .reduce((s, t) => s + t.straightHours + t.otHours + t.dtHours, 0)
  const dayCrew = new Set(
    project.time.filter((t) => t.date === draft.date).map((t) => t.classificationCode),
  )

  const addPhoto = async (file: File) => {
    const reader = new FileReader()
    reader.onload = () =>
      setDraft((d) => ({ ...d, photos: [...d.photos, String(reader.result)] }))
    reader.readAsDataURL(file)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Daily log — ${fmtDate(draft.date)}`}
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              onClick={() => {
                mutate((d) => {
                  d.dailyLogs = d.dailyLogs.filter((l) => l.id !== draft.id)
                })
                onClose()
              }}
            >
              <IconTrash size={18} />
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <IconPrint size={18} />
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              mutate((d) => {
                const i = d.dailyLogs.findIndex((l) => l.id === draft.id)
                if (i >= 0) d.dailyLogs[i] = draft
                else d.dailyLogs.push(draft)
              })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Date">
            <DateInput value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
          </Field>
          <Field label="Weather">
            <TextInput
              value={draft.weather}
              onChange={(v) => setDraft({ ...draft, weather: v })}
              placeholder="Clear, windy, rain"
            />
          </Field>
          <Field label="Temperature">
            <TextInput
              value={draft.temperature}
              onChange={(v) => setDraft({ ...draft, temperature: v })}
              placeholder="74°F"
            />
          </Field>
        </div>

        {dayHours > 0 && (
          <div className="surface-2 rounded-lg px-3 py-2 text-sm">
            <strong>{fmtHours(dayHours)} hours</strong> already reported for this day through Field
            Entry, across {dayCrew.size} classification{dayCrew.size === 1 ? '' : 's'}.
          </div>
        )}

        <Field label="Work performed">
          <TextArea
            value={draft.workPerformed}
            onChange={(v) => setDraft({ ...draft, workPerformed: v })}
            rows={4}
            placeholder="What the crew put in today, by area"
          />
        </Field>

        <Field
          label="Delays & impacts"
          hint="The most valuable field on this screen. Write what stopped the crew, who owned it, and how long."
        >
          <TextArea
            value={draft.delays}
            onChange={(v) => setDraft({ ...draft, delays: v })}
            rows={3}
            placeholder="North half of Level 4 still not framed — moved four hands rather than send them home"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Visitors & inspections">
            <TextArea
              value={draft.visitors}
              onChange={(v) => setDraft({ ...draft, visitors: v })}
              rows={2}
            />
          </Field>
          <Field label="Safety topic">
            <TextArea
              value={draft.safetyTopic}
              onChange={(v) => setDraft({ ...draft, safetyTopic: v })}
              rows={2}
              placeholder="Toolbox talk subject"
            />
          </Field>
        </div>

        <div>
          <div className="label-cap mb-2">Photos</div>
          <div className="flex flex-wrap gap-2">
            {draft.photos.map((src, i) => (
              <div key={i} className="relative">
                <img
                  src={src}
                  alt={`Job photo ${i + 1}`}
                  className="h-24 w-24 rounded-lg object-cover"
                />
                <button
                  aria-label="Remove photo"
                  onClick={() =>
                    setDraft({ ...draft, photos: draft.photos.filter((_, j) => j !== i) })
                  }
                  className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full text-xs"
                  style={{ background: 'var(--color-risk-500)', color: '#fff' }}
                >
                  ✕
                </button>
              </div>
            ))}
            <Button onClick={() => fileRef.current?.click()}>
              <IconPlus size={18} /> Photo
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void addPhoto(f)
              e.target.value = ''
            }}
          />
        </div>

        <div className="print-only">
          <h1 className="text-lg font-extrabold">Daily Report</h1>
          <p className="text-sm">
            {project.name} · {fmtDateFull(draft.date)} · {project.ruleProfile.localUnion}
          </p>
        </div>
      </div>
    </Sheet>
  )
}

// ---------------------------------------------------------------------------

function TMTickets() {
  const project = useActiveProject()!
  const [editing, setEditing] = useState<TMTicket | null>(null)

  const blank = (): TMTicket => ({
    id: uid(),
    number: `TM-${String(project.tmTickets.length + 1).padStart(3, '0')}`,
    date: todayStr(),
    description: '',
    reference: '',
    labor: [],
    materials: [],
    equipment: '',
    signedBy: '',
    signedTitle: '',
    status: 'draft',
  })

  const tickets = [...project.tmTickets].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button variant="primary" large onClick={() => setEditing(blank())}>
          <IconPlus size={18} /> New ticket
        </Button>
      </div>

      {tickets.length === 0 ? (
        <Panel>
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            No extra-work tickets. Write one the day the work happens and get it signed on the spot
            — an unsigned ticket found at closeout is worth a fraction of a signed one.
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-3">
          {tickets.map((t) => (
            <li key={t.id}>
              <button onClick={() => setEditing(t)} className="surface w-full rounded-lg p-3 text-left">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-extrabold">{t.number}</span>
                  <span className="text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {fmtDate(t.date)}
                  </span>
                  {t.reference && (
                    <span className="text-xs" style={{ color: 'var(--app-text-dim)' }}>
                      ref {t.reference}
                    </span>
                  )}
                  <span className="flex-1" />
                  <RagBadge
                    rag={t.status === 'draft' ? 'watch' : 'go'}
                    label={t.status === 'draft' ? 'Unsigned' : t.status}
                  />
                </div>
                <p className="mt-1 line-clamp-2 text-sm" style={{ color: 'var(--app-text-muted)' }}>
                  {t.description || 'No description'}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {editing && <TMSheet ticket={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function TMSheet({ ticket, onClose }: { ticket: TMTicket; onClose: () => void }) {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const [draft, setDraft] = useState(ticket)
  const exists = project.tmTickets.some((t) => t.id === ticket.id)
  const classes = project.ruleProfile.classifications.filter((c) => c.enabled)

  const laborCost = draft.labor.reduce((sum, l) => {
    const c = findClassification(project.ruleProfile.classifications, l.classificationCode)
    if (!c) return sum
    const straight = computeRate(project.wagePackage, c, 1).fullyLoaded * l.hours
    const ot = computeRate(project.wagePackage, c, 1.5).fullyLoaded * l.otHours
    return sum + straight + ot
  }, 0)

  const materialCost = draft.materials.reduce((s, m) => s + m.qty * m.unitCost, 0)
  const totalHours = draft.labor.reduce((s, l) => s + l.hours + l.otHours, 0)

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${draft.number} — extra work`}
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              onClick={() => {
                mutate((d) => {
                  d.tmTickets = d.tmTickets.filter((t) => t.id !== draft.id)
                })
                onClose()
              }}
            >
              <IconTrash size={18} />
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <IconPrint size={18} />
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              mutate((d) => {
                const i = d.tmTickets.findIndex((t) => t.id === draft.id)
                if (i >= 0) d.tmTickets[i] = draft
                else d.tmTickets.push(draft)
              })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Ticket number">
            <TextInput value={draft.number} onChange={(v) => setDraft({ ...draft, number: v })} />
          </Field>
          <Field label="Date">
            <DateInput value={draft.date} onChange={(v) => setDraft({ ...draft, date: v })} />
          </Field>
          <Field label="Authorized by" hint="RFI, ASI, CO or field directive.">
            <TextInput value={draft.reference} onChange={(v) => setDraft({ ...draft, reference: v })} />
          </Field>
        </div>

        <Field label="Description of extra work">
          <TextArea
            value={draft.description}
            onChange={(v) => setDraft({ ...draft, description: v })}
            rows={3}
          />
        </Field>

        {/* --- Labor ------------------------------------------------------ */}
        <div>
          <div className="label-cap mb-2">Labor</div>
          <ul className="grid gap-2">
            {draft.labor.map((l) => (
              <li key={l.id} className="surface-2 grid grid-cols-12 items-center gap-2 rounded-lg p-2">
                <div className="col-span-5">
                  <Select
                    value={l.classificationCode}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        labor: draft.labor.map((x) =>
                          x.id === l.id ? { ...x, classificationCode: v } : x,
                        ),
                      })
                    }
                    options={classes.map((c) => ({ value: c.code, label: c.label }))}
                  />
                </div>
                <div className="col-span-3">
                  <NumberInput
                    value={l.hours}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        labor: draft.labor.map((x) => (x.id === l.id ? { ...x, hours: v } : x)),
                      })
                    }
                  />
                </div>
                <div className="col-span-3">
                  <NumberInput
                    value={l.otHours}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        labor: draft.labor.map((x) => (x.id === l.id ? { ...x, otHours: v } : x)),
                      })
                    }
                  />
                </div>
                <button
                  aria-label="Remove labor line"
                  onClick={() =>
                    setDraft({ ...draft, labor: draft.labor.filter((x) => x.id !== l.id) })
                  }
                  className="col-span-1"
                  style={{ color: 'var(--app-text-dim)' }}
                >
                  <IconTrash size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 grid grid-cols-12 gap-2 px-2 text-[10px]" style={{ color: 'var(--app-text-dim)' }}>
            <span className="col-span-5">Classification</span>
            <span className="col-span-3">Straight hrs</span>
            <span className="col-span-3">OT hrs</span>
          </div>
          <Button
            className="mt-2"
            onClick={() =>
              setDraft({
                ...draft,
                labor: [
                  ...draft.labor,
                  { id: uid(), classificationCode: 'JW', workers: 1, hours: 0, otHours: 0 },
                ],
              })
            }
          >
            <IconPlus size={18} /> Labor line
          </Button>
        </div>

        {/* --- Materials --------------------------------------------------- */}
        <div>
          <div className="label-cap mb-2">Materials</div>
          <ul className="grid gap-2">
            {draft.materials.map((m) => (
              <li key={m.id} className="surface-2 grid grid-cols-12 items-center gap-2 rounded-lg p-2">
                <div className="col-span-5">
                  <TextInput
                    value={m.description}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        materials: draft.materials.map((x) =>
                          x.id === m.id ? { ...x, description: v } : x,
                        ),
                      })
                    }
                    placeholder="Description"
                  />
                </div>
                <div className="col-span-3">
                  <NumberInput
                    value={m.qty}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        materials: draft.materials.map((x) => (x.id === m.id ? { ...x, qty: v } : x)),
                      })
                    }
                  />
                </div>
                <div className="col-span-3">
                  <NumberInput
                    step={0.01}
                    value={m.unitCost}
                    onChange={(v) =>
                      setDraft({
                        ...draft,
                        materials: draft.materials.map((x) =>
                          x.id === m.id ? { ...x, unitCost: v } : x,
                        ),
                      })
                    }
                  />
                </div>
                <button
                  aria-label="Remove material line"
                  onClick={() =>
                    setDraft({ ...draft, materials: draft.materials.filter((x) => x.id !== m.id) })
                  }
                  className="col-span-1"
                  style={{ color: 'var(--app-text-dim)' }}
                >
                  <IconTrash size={16} />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-1 grid grid-cols-12 gap-2 px-2 text-[10px]" style={{ color: 'var(--app-text-dim)' }}>
            <span className="col-span-5">Description</span>
            <span className="col-span-3">Qty</span>
            <span className="col-span-3">Unit cost</span>
          </div>
          <Button
            className="mt-2"
            onClick={() =>
              setDraft({
                ...draft,
                materials: [
                  ...draft.materials,
                  { id: uid(), description: '', qty: 0, unit: 'EA', unitCost: 0 },
                ],
              })
            }
          >
            <IconPlus size={18} /> Material line
          </Button>
        </div>

        <Field label="Equipment">
          <TextInput
            value={draft.equipment}
            onChange={(v) => setDraft({ ...draft, equipment: v })}
            placeholder="Scissor lift, 1 day"
          />
        </Field>

        <div className="surface-2 grid gap-1 rounded-lg p-3 text-sm">
          <div className="flex justify-between">
            <span style={{ color: 'var(--app-text-muted)' }}>Labor — {fmtHours(totalHours)} hrs</span>
            <strong>{fmtMoney(laborCost)}</strong>
          </div>
          <div className="flex justify-between">
            <span style={{ color: 'var(--app-text-muted)' }}>Materials</span>
            <strong>{fmtMoney(materialCost)}</strong>
          </div>
          <div
            className="mt-1 flex justify-between border-t pt-1 text-base"
            style={{ borderColor: 'var(--app-line)' }}
          >
            <span className="font-bold">Total</span>
            <strong>{fmtMoney(laborCost + materialCost)}</strong>
          </div>
          <Explain>
            Costs use the wage package from Settings, at fully-loaded rates with overtime factored
            per the agreement. Markup, if your contract allows it, is added by the office.
          </Explain>
        </div>

        <Signature
          value={draft.signatureDataUrl}
          onChange={(v) =>
            setDraft({ ...draft, signatureDataUrl: v, status: v ? 'signed' : 'draft' })
          }
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Signed by">
            <TextInput value={draft.signedBy} onChange={(v) => setDraft({ ...draft, signedBy: v })} />
          </Field>
          <Field label="Title">
            <TextInput
              value={draft.signedTitle}
              onChange={(v) => setDraft({ ...draft, signedTitle: v })}
              placeholder="Superintendent"
            />
          </Field>
        </div>
      </div>
    </Sheet>
  )
}

/** Finger-signature pad. The whole point of writing the ticket in the field. */
function Signature({
  value,
  onChange,
}: {
  value?: string
  onChange: (v: string | undefined) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  return (
    <div>
      <div className="label-cap mb-2">Signature</div>
      {value ? (
        <div className="surface-2 rounded-lg p-2">
          <img src={value} alt="Signature" className="h-24 w-full object-contain" />
          <Button className="mt-2" onClick={() => onChange(undefined)}>
            Clear and sign again
          </Button>
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={600}
            height={180}
            className="w-full touch-none rounded-lg"
            style={{ background: '#fff', border: '1px solid var(--app-line)', height: 120 }}
            onPointerDown={(e) => {
              drawing.current = true
              const ctx = canvasRef.current!.getContext('2d')!
              const { x, y } = point(e)
              ctx.beginPath()
              ctx.moveTo(x, y)
              e.currentTarget.setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return
              const ctx = canvasRef.current!.getContext('2d')!
              const { x, y } = point(e)
              ctx.lineTo(x, y)
              ctx.strokeStyle = '#111'
              ctx.lineWidth = 2.5
              ctx.lineCap = 'round'
              ctx.stroke()
            }}
            onPointerUp={() => {
              drawing.current = false
            }}
          />
          <div className="mt-2 flex gap-2">
            <Button
              onClick={() => {
                const canvas = canvasRef.current!
                canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
              }}
            >
              Clear
            </Button>
            <Button variant="primary" onClick={() => onChange(canvasRef.current!.toDataURL())}>
              Accept signature
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
