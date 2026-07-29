import { useState } from 'react'
import { addWeeks, format } from 'date-fns'
import {
  Button,
  DateInput,
  Explain,
  Field,
  NumberInput,
  Panel,
  RAG_COLOR,
  RagBadge,
  SectionHeader,
  Segmented,
  Select,
  Sheet,
  TextArea,
  TextInput,
  fmtDate,
  fmtDateFull,
} from '../components/ui'
import { IconDownload, IconPlus, IconPrint, IconTrash } from '../components/icons'
import { LONG_LEAD_TEMPLATES, UNITS, uid } from '../domain/templates'
import { PROCUREMENT_STAGES } from '../domain/types'
import type {
  MaterialLine,
  ProcurementItem,
  ProcurementStatus,
  Requisition,
} from '../domain/types'
import { procurementStatus, slipDays } from '../engine/procurement'
import { useActiveProject, useProjectStore } from '../store/project'
import { orderedAreas, orderedPhases, useDerived } from '../store/selectors'

/**
 * Materials and procurement.
 *
 * Two very different problems share this screen. Long-lead gear is a schedule
 * problem measured in *years* — a pad-mount transformer at 115 weeks has to be
 * submitted long before anyone breaks ground, so every date here is worked
 * backward from when the item must be on site. Requisitions are a this-week
 * problem: get the right material to the right floor before the crew gets
 * there.
 */

type Tab = 'gear' | 'requisitions'

export default function Materials() {
  const [tab, setTab] = useState<Tab>('gear')
  return (
    <div className="p-4 sm:p-6">
      <SectionHeader
        title="Materials"
        actions={
          <Segmented
            value={tab}
            onChange={setTab}
            options={[
              { value: 'gear', label: 'Long lead' },
              { value: 'requisitions', label: 'Requisitions' },
            ]}
          />
        }
      />
      {tab === 'gear' ? <LongLead /> : <Requisitions />}
    </div>
  )
}

// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<ProcurementStatus, string> = {
  identified: 'To submit',
  submitted: 'In approval',
  approved: 'Approved',
  released: 'Released',
  shipped: 'Shipping',
  onsite: 'On site',
}

function LongLead() {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)
  const [editing, setEditing] = useState<ProcurementItem | null>(null)
  const [view, setView] = useState<'board' | 'table'>('board')

  const blank = (): ProcurementItem => ({
    id: uid(),
    description: '',
    specSection: '',
    tag: '',
    supplier: '',
    poNumber: '',
    leadTimeWeeks: 20,
    approvalWeeks: 6,
    neededOnSite: format(addWeeks(new Date(), 26), 'yyyy-MM-dd'),
    status: 'identified',
    cost: 0,
    notes: '',
  })

  const late = project.procurement.filter(
    (i) => procurementStatus(i, derived.today).rag === 'risk',
  )

  return (
    <div className="grid gap-4">
      {late.length > 0 && (
        <div
          className="rounded-lg px-4 py-3"
          style={{ background: 'color-mix(in srgb, var(--color-risk-500) 14%, transparent)' }}
        >
          <div className="text-sm font-bold" style={{ color: 'var(--color-risk-500)' }}>
            {late.length} item{late.length === 1 ? '' : 's'} past the date it had to move
          </div>
          <ul className="mt-1 grid gap-0.5">
            {late.map((i) => {
              const slip = slipDays(i, derived.today)
              return (
                <li key={i.id} className="text-xs">
                  <strong>{i.description}</strong>
                  {i.tag && ` (${i.tag})`} — {procurementStatus(i, derived.today).nextAction.toLowerCase()}
                  {slip > 0 && `; earliest delivery now slips the need date by about ${Math.round(slip / 7)} weeks`}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-between gap-2">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'board', label: 'Board' },
            { value: 'table', label: 'Dates' },
          ]}
        />
        <div className="flex gap-2">
          <Button onClick={() => window.print()}>
            <IconPrint size={18} /> Print
          </Button>
          <Button variant="primary" onClick={() => setEditing(blank())}>
            <IconPlus size={18} /> Add item
          </Button>
        </div>
      </div>

      {project.procurement.length === 0 ? (
        <Panel>
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            Nothing logged yet. Start with the gear that decides the schedule — service transformer,
            switchgear, generator, ATS, switchboards.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {LONG_LEAD_TEMPLATES.slice(0, 6).map((t) => (
              <Button
                key={t.description}
                onClick={() =>
                  setEditing({
                    ...blank(),
                    description: t.description,
                    specSection: t.specSection,
                    leadTimeWeeks: t.leadTimeWeeks,
                    approvalWeeks: t.approvalWeeks,
                  })
                }
              >
                + {t.description}
              </Button>
            ))}
          </div>
        </Panel>
      ) : view === 'board' ? (
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {PROCUREMENT_STAGES.map((stage) => {
            const items = project.procurement.filter((i) => i.status === stage)
            return (
              <section key={stage} className="surface rounded-lg p-3">
                <header className="mb-2 flex items-center justify-between">
                  <h3 className="label-cap">{STAGE_LABEL[stage]}</h3>
                  <span className="text-xs font-bold" style={{ color: 'var(--app-text-dim)' }}>
                    {items.length}
                  </span>
                </header>
                <ul className="grid gap-2">
                  {items.map((item) => {
                    const s = procurementStatus(item, derived.today)
                    return (
                      <li key={item.id}>
                        <button
                          onClick={() => setEditing(item)}
                          className="surface-2 relative w-full rounded-lg p-2.5 text-left"
                          style={{ minHeight: 'var(--spacing-tap)' }}
                        >
                          <span
                            aria-hidden="true"
                            className="absolute top-0 bottom-0 left-0 w-1 rounded-l-lg"
                            style={{ background: RAG_COLOR[s.rag] }}
                          />
                          <div className="pl-1.5">
                            <div className="text-xs font-bold">{item.description}</div>
                            {item.tag && (
                              <div className="text-[10px]" style={{ color: 'var(--app-text-dim)' }}>
                                {item.tag}
                              </div>
                            )}
                            <div className="mt-1.5 text-[10px]" style={{ color: 'var(--app-text-muted)' }}>
                              {item.leadTimeWeeks} wk lead · on site {fmtDate(item.neededOnSite)}
                            </div>
                            {s.dueDate && (
                              <div className="mt-1">
                                <RagBadge
                                  rag={s.rag}
                                  label={
                                    s.daysRemaining! < 0
                                      ? `${Math.abs(s.daysRemaining!)}d late`
                                      : `${s.daysRemaining}d left`
                                  }
                                />
                              </div>
                            )}
                          </div>
                        </button>
                        {stage !== 'onsite' && (
                          <button
                            onClick={() =>
                              mutate((d) => {
                                const t = d.procurement.find((x) => x.id === item.id)
                                if (!t) return
                                const next =
                                  PROCUREMENT_STAGES[PROCUREMENT_STAGES.indexOf(t.status) + 1]
                                if (next) {
                                  t.status = next
                                  const stamp = derived.today
                                  if (next === 'submitted') t.submittedDate = stamp
                                  if (next === 'approved') t.approvedDate = stamp
                                  if (next === 'released') t.releasedDate = stamp
                                  if (next === 'shipped') t.shippedDate = stamp
                                  if (next === 'onsite') t.onsiteDate = stamp
                                }
                              })
                            }
                            className="mt-1 w-full rounded text-[10px] font-bold"
                            style={{ minHeight: '2rem', color: 'var(--color-amp-400)' }}
                          >
                            Advance →
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
        </div>
      ) : (
        <Panel title="Backward-scheduled dates">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="label-cap">
                  <th className="px-2 py-2 text-left">Item</th>
                  <th className="px-2 py-2 text-right">Approval</th>
                  <th className="px-2 py-2 text-right">Lead</th>
                  <th className="px-2 py-2 text-right">Submit by</th>
                  <th className="px-2 py-2 text-right">Release by</th>
                  <th className="px-2 py-2 text-right">On site</th>
                  <th className="px-2 py-2 text-left">Next</th>
                </tr>
              </thead>
              <tbody>
                {[...project.procurement]
                  .sort((a, b) =>
                    procurementStatus(a, derived.today).milestones.submitBy.localeCompare(
                      procurementStatus(b, derived.today).milestones.submitBy,
                    ),
                  )
                  .map((item) => {
                    const s = procurementStatus(item, derived.today)
                    return (
                      <tr key={item.id} className="border-t" style={{ borderColor: 'var(--app-line-soft)' }}>
                        <td className="px-2 py-2">
                          <button onClick={() => setEditing(item)} className="text-left font-semibold">
                            {item.description}
                          </button>
                          {item.tag && (
                            <span className="ml-2 text-xs" style={{ color: 'var(--app-text-dim)' }}>
                              {item.tag}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-right">{item.approvalWeeks}w</td>
                        <td className="px-2 py-2 text-right font-bold">{item.leadTimeWeeks}w</td>
                        <td className="px-2 py-2 text-right">{fmtDate(s.milestones.submitBy)}</td>
                        <td className="px-2 py-2 text-right">{fmtDate(s.milestones.releaseBy)}</td>
                        <td className="px-2 py-2 text-right">{fmtDate(item.neededOnSite)}</td>
                        <td className="px-2 py-2">
                          <RagBadge rag={s.rag} label={s.nextAction} />
                        </td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
          <Explain>
            Every date runs backward from the on-site date, never forward from today. Submit-by is
            the last day a submittal can go out and still protect the schedule — miss it and the
            need date moves, no matter how hard the crew works.
          </Explain>
        </Panel>
      )}

      {editing && <GearSheet item={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function GearSheet({ item, onClose }: { item: ProcurementItem; onClose: () => void }) {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const derived = useDerived(project)
  const [draft, setDraft] = useState(item)
  const exists = project.procurement.some((i) => i.id === item.id)
  const s = procurementStatus(draft, derived.today)

  return (
    <Sheet
      open
      onClose={onClose}
      title={exists ? draft.description || 'Edit item' : 'New long-lead item'}
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              onClick={() => {
                mutate((d) => {
                  d.procurement = d.procurement.filter((i) => i.id !== draft.id)
                })
                onClose()
              }}
            >
              <IconTrash size={18} />
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => {
              mutate((d) => {
                const i = d.procurement.findIndex((x) => x.id === draft.id)
                if (i >= 0) d.procurement[i] = draft
                else d.procurement.push(draft)
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
        {!exists && (
          <Field label="Start from a common item">
            <Select
              value=""
              onChange={(v) => {
                const t = LONG_LEAD_TEMPLATES.find((x) => x.description === v)
                if (t)
                  setDraft({
                    ...draft,
                    description: t.description,
                    specSection: t.specSection,
                    leadTimeWeeks: t.leadTimeWeeks,
                    approvalWeeks: t.approvalWeeks,
                  })
              }}
              options={[
                { value: '', label: 'Pick one…' },
                ...LONG_LEAD_TEMPLATES.map((t) => ({
                  value: t.description,
                  label: `${t.description} — ${t.leadTimeWeeks} wk`,
                })),
              ]}
            />
          </Field>
        )}

        <Field label="Description">
          <TextInput value={draft.description} onChange={(v) => setDraft({ ...draft, description: v })} />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tag / mark">
            <TextInput value={draft.tag} onChange={(v) => setDraft({ ...draft, tag: v })} />
          </Field>
          <Field label="Spec section">
            <TextInput value={draft.specSection} onChange={(v) => setDraft({ ...draft, specSection: v })} />
          </Field>
          <Field label="Needed on site">
            <DateInput value={draft.neededOnSite} onChange={(v) => setDraft({ ...draft, neededOnSite: v })} />
          </Field>
          <Field label="Status">
            <Select
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v })}
              options={PROCUREMENT_STAGES.map((st) => ({ value: st, label: STAGE_LABEL[st] }))}
            />
          </Field>
          <Field label="Lead time (weeks)" hint="Release to delivery, per the quote.">
            <NumberInput value={draft.leadTimeWeeks} onChange={(v) => setDraft({ ...draft, leadTimeWeeks: v })} />
          </Field>
          <Field label="Approval time (weeks)" hint="Prepare, submit and get it back approved.">
            <NumberInput value={draft.approvalWeeks} onChange={(v) => setDraft({ ...draft, approvalWeeks: v })} />
          </Field>
          <Field label="Supplier">
            <TextInput value={draft.supplier} onChange={(v) => setDraft({ ...draft, supplier: v })} />
          </Field>
          <Field label="PO number">
            <TextInput value={draft.poNumber} onChange={(v) => setDraft({ ...draft, poNumber: v })} />
          </Field>
          <Field label="Cost">
            <NumberInput value={draft.cost} onChange={(v) => setDraft({ ...draft, cost: v })} />
          </Field>
        </div>

        <Field label="Notes">
          <TextArea value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} rows={2} />
        </Field>

        <div className="surface-2 rounded-lg p-3">
          <div className="label-cap mb-2">Working backward from the on-site date</div>
          <ol className="grid gap-1.5 text-sm">
            <Milestone label="Submittal out by" date={s.milestones.submitBy} today={derived.today} />
            <Milestone label="Approved by" date={s.milestones.approveBy} today={derived.today} />
            <Milestone label="Released to factory by" date={s.milestones.releaseBy} today={derived.today} />
            <Milestone label="On site" date={draft.neededOnSite} today={derived.today} />
          </ol>
          <Explain>
            {s.totalWeeks} weeks from submittal to delivery. Next action: <strong>{s.nextAction}</strong>
            {s.dueDate &&
              (s.daysRemaining! < 0
                ? ` — ${Math.abs(s.daysRemaining!)} days past due.`
                : ` — ${s.daysRemaining} days left.`)}
          </Explain>
        </div>
      </div>
    </Sheet>
  )
}

function Milestone({ label, date, today }: { label: string; date: string; today: string }) {
  const past = date < today
  return (
    <li className="flex items-center justify-between gap-3">
      <span style={{ color: 'var(--app-text-muted)' }}>{label}</span>
      <span
        className="font-bold"
        style={{ color: past ? 'var(--color-risk-500)' : 'var(--app-text)' }}
      >
        {fmtDate(date)}
        {past && ' — passed'}
      </span>
    </li>
  )
}

// ---------------------------------------------------------------------------

function Requisitions() {
  const project = useActiveProject()!
  const derived = useDerived(project)
  const [editing, setEditing] = useState<Requisition | null>(null)

  const blank = (): Requisition => ({
    id: uid(),
    number: `REQ-${String(project.requisitions.length + 1).padStart(3, '0')}`,
    neededBy: format(addWeeks(new Date(), 1), 'yyyy-MM-dd'),
    deliverTo: '',
    status: 'draft',
    isPrefabKit: false,
    lines: [],
    notes: '',
  })

  return (
    <div className="grid gap-4">
      <div className="flex justify-end">
        <Button variant="primary" onClick={() => setEditing(blank())}>
          <IconPlus size={18} /> New requisition
        </Button>
      </div>

      {project.requisitions.length === 0 ? (
        <Panel>
          <p className="text-sm" style={{ color: 'var(--app-text-muted)' }}>
            No requisitions yet. Build one against the work face that needs it — the needed-by date
            comes from that activity's start, so material shows up before the crew does.
          </p>
        </Panel>
      ) : (
        <ul className="grid gap-3">
          {project.requisitions.map((r) => {
            const qty = r.lines.reduce((s, l) => s + l.qty, 0)
            const late = r.neededBy < derived.today && r.status !== 'delivered'
            return (
              <li key={r.id}>
                <button
                  onClick={() => setEditing(r)}
                  className="surface w-full rounded-lg p-3 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold">{r.number}</span>
                    {r.isPrefabKit && <RagBadge rag="go" label="Prefab kit" />}
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {r.deliverTo || 'No delivery point set'}
                    </span>
                    <RagBadge
                      rag={late ? 'risk' : r.status === 'delivered' ? 'go' : 'watch'}
                      label={`${r.status} · ${fmtDate(r.neededBy)}`}
                    />
                  </div>
                  <div className="mt-1 text-xs" style={{ color: 'var(--app-text-muted)' }}>
                    {r.lines.length} line{r.lines.length === 1 ? '' : 's'} · {qty.toLocaleString()} pieces
                    {r.areaId && ` · ${derived.areaById.get(r.areaId)?.name}`}
                    {r.phaseId && ` · ${derived.phaseById.get(r.phaseId)?.code}`}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && <ReqSheet req={editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function ReqSheet({ req, onClose }: { req: Requisition; onClose: () => void }) {
  const project = useActiveProject()!
  const mutate = useProjectStore((s) => s.mutate)
  const [draft, setDraft] = useState(req)
  const exists = project.requisitions.some((r) => r.id === req.id)

  const setLine = (id: string, patch: Partial<MaterialLine>) =>
    setDraft({
      ...draft,
      lines: draft.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    })

  const exportCsv = () => {
    const rows = [
      ['Requisition', draft.number],
      ['Job', project.name],
      ['Needed by', draft.neededBy],
      ['Deliver to', draft.deliverTo],
      [],
      ['Qty', 'Unit', 'Description', 'Catalog no.'],
      ...draft.lines.map((l) => [String(l.qty), l.unit, l.description, l.catalogNo]),
    ]
    const csv = rows
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `${draft.number}-${project.name.replace(/\W+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={draft.number}
      footer={
        <>
          {exists && (
            <Button
              variant="danger"
              onClick={() => {
                mutate((d) => {
                  d.requisitions = d.requisitions.filter((r) => r.id !== draft.id)
                })
                onClose()
              }}
            >
              <IconTrash size={18} />
            </Button>
          )}
          <Button onClick={exportCsv}>
            <IconDownload size={18} /> CSV
          </Button>
          <Button onClick={() => window.print()}>
            <IconPrint size={18} />
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              mutate((d) => {
                const i = d.requisitions.findIndex((x) => x.id === draft.id)
                if (i >= 0) d.requisitions[i] = draft
                else d.requisitions.push(draft)
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
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Requisition number">
            <TextInput value={draft.number} onChange={(v) => setDraft({ ...draft, number: v })} />
          </Field>
          <Field label="Needed by">
            <DateInput value={draft.neededBy} onChange={(v) => setDraft({ ...draft, neededBy: v })} />
          </Field>
          <Field label="Area">
            <Select
              value={draft.areaId ?? ''}
              onChange={(v) => setDraft({ ...draft, areaId: v || undefined })}
              options={[
                { value: '', label: 'Not area-specific' },
                ...orderedAreas(project).map((a) => ({ value: a.id, label: a.name })),
              ]}
            />
          </Field>
          <Field label="Phase">
            <Select
              value={draft.phaseId ?? ''}
              onChange={(v) => setDraft({ ...draft, phaseId: v || undefined })}
              options={[
                { value: '', label: 'Not phase-specific' },
                ...orderedPhases(project).map((p) => ({ value: p.id, label: `${p.code} — ${p.label}` })),
              ]}
            />
          </Field>
          <Field label="Deliver to" className="sm:col-span-2">
            <TextInput
              value={draft.deliverTo}
              onChange={(v) => setDraft({ ...draft, deliverTo: v })}
              placeholder="Level 4 — north stair landing"
            />
          </Field>
          <Field label="Status">
            <Select
              value={draft.status}
              onChange={(v) => setDraft({ ...draft, status: v })}
              options={[
                { value: 'draft', label: 'Draft' },
                { value: 'sent', label: 'Sent to supplier' },
                { value: 'confirmed', label: 'Confirmed' },
                { value: 'delivered', label: 'Delivered' },
              ]}
            />
          </Field>
          <Field label="Prefab kit" hint="Pulled, kitted and staged rather than dropped loose.">
            <Select
              value={draft.isPrefabKit ? 'yes' : 'no'}
              onChange={(v) => setDraft({ ...draft, isPrefabKit: v === 'yes' })}
              options={[
                { value: 'no', label: 'Loose material' },
                { value: 'yes', label: 'Prefab kit' },
              ]}
            />
          </Field>
        </div>

        <div>
          <div className="label-cap mb-2">Lines</div>
          <ul className="grid gap-2">
            {draft.lines.map((l) => (
              <li key={l.id} className="surface-2 grid grid-cols-12 gap-2 rounded-lg p-2">
                <div className="col-span-3 sm:col-span-2">
                  <NumberInput value={l.qty} onChange={(v) => setLine(l.id, { qty: v })} />
                </div>
                <div className="col-span-3 sm:col-span-2">
                  <Select
                    value={l.unit}
                    onChange={(v) => setLine(l.id, { unit: v })}
                    options={UNITS.map((u) => ({ value: u, label: u }))}
                  />
                </div>
                <div className="col-span-6 sm:col-span-5">
                  <TextInput
                    value={l.description}
                    onChange={(v) => setLine(l.id, { description: v })}
                    placeholder="Description"
                  />
                </div>
                <div className="col-span-10 sm:col-span-2">
                  <TextInput
                    value={l.catalogNo}
                    onChange={(v) => setLine(l.id, { catalogNo: v })}
                    placeholder="Cat #"
                  />
                </div>
                <button
                  aria-label="Remove line"
                  onClick={() =>
                    setDraft({ ...draft, lines: draft.lines.filter((x) => x.id !== l.id) })
                  }
                  className="col-span-2 sm:col-span-1"
                  style={{ color: 'var(--app-text-dim)' }}
                >
                  <IconTrash size={18} />
                </button>
              </li>
            ))}
          </ul>
          <Button
            className="mt-2"
            onClick={() =>
              setDraft({
                ...draft,
                lines: [
                  ...draft.lines,
                  { id: uid(), description: '', catalogNo: '', unit: 'EA', qty: 0 },
                ],
              })
            }
          >
            <IconPlus size={18} /> Add line
          </Button>
        </div>

        <Field label="Notes">
          <TextArea value={draft.notes} onChange={(v) => setDraft({ ...draft, notes: v })} rows={2} />
        </Field>

        <div className="print-only">
          <h1 className="text-lg font-extrabold">Material Requisition {draft.number}</h1>
          <p className="text-sm">
            {project.name} · Needed {fmtDateFull(draft.neededBy)} · Deliver to {draft.deliverTo}
          </p>
        </div>
      </div>
    </Sheet>
  )
}
