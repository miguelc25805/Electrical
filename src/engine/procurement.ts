import { differenceInCalendarDays, format, parseISO, subWeeks } from 'date-fns'
import type { DateStr, ProcurementItem, ProcurementStatus, Rag } from '../domain/types'

/**
 * Procurement scheduling.
 *
 * Long-lead gear is scheduled *backward from the date it has to be on site*,
 * never forward from today. In the 2026 market that difference is the whole
 * job: medium-voltage switchgear runs 40–80 weeks, low-voltage draw-out gear
 * 70–80, automatic transfer switches 45–80, and pad-mount service transformers
 * 110–130. A transformer ordered when the slab pours arrives two years after
 * the building needed power.
 *
 * So the number that matters is not "when will it show up" — it is "what is
 * the last day I can still submit this without moving the schedule."
 */

export interface ProcurementMilestones {
  /** Last day the submittal can go out and still protect the on-site date. */
  submitBy: DateStr
  /** Last day approval can come back. */
  approveBy: DateStr
  /** Last day the order can be released to the factory. */
  releaseBy: DateStr
  neededOnSite: DateStr
}

export function milestones(item: ProcurementItem): ProcurementMilestones {
  const onSite = parseISO(item.neededOnSite)
  const releaseBy = subWeeks(onSite, Math.max(0, item.leadTimeWeeks))
  const submitBy = subWeeks(releaseBy, Math.max(0, item.approvalWeeks))

  return {
    submitBy: format(submitBy, 'yyyy-MM-dd'),
    // Approval has to be in hand to release, so the two share a date.
    approveBy: format(releaseBy, 'yyyy-MM-dd'),
    releaseBy: format(releaseBy, 'yyyy-MM-dd'),
    neededOnSite: item.neededOnSite,
  }
}

export interface ProcurementStatusInfo {
  milestones: ProcurementMilestones
  /** What has to happen next, in plain language. */
  nextAction: string
  /** The date that action is due. null once the item is on site. */
  dueDate: DateStr | null
  /** Negative means the date has already passed. */
  daysRemaining: number | null
  rag: Rag
  /** Total weeks from submittal to delivery — the item's true schedule cost. */
  totalWeeks: number
}

const NEXT_ACTION: Record<ProcurementStatus, string> = {
  identified: 'Prepare and send submittal',
  submitted: 'Chase approval',
  approved: 'Release order to factory',
  released: 'Track fabrication and shipping',
  shipped: 'Receive and stage on site',
  onsite: 'On site — complete',
}

export function procurementStatus(
  item: ProcurementItem,
  today: DateStr,
): ProcurementStatusInfo {
  const ms = milestones(item)
  const totalWeeks = Math.max(0, item.leadTimeWeeks) + Math.max(0, item.approvalWeeks)

  const dueDate =
    item.status === 'identified'
      ? ms.submitBy
      : item.status === 'submitted'
        ? ms.approveBy
        : item.status === 'approved'
          ? ms.releaseBy
          : item.status === 'released' || item.status === 'shipped'
            ? ms.neededOnSite
            : null

  const daysRemaining =
    dueDate === null ? null : differenceInCalendarDays(parseISO(dueDate), parseISO(today))

  let rag: Rag = 'go'
  if (item.status === 'onsite') rag = 'go'
  else if (daysRemaining === null) rag = 'none'
  else if (daysRemaining < 0) rag = 'risk'
  else if (daysRemaining <= 21) rag = 'watch'

  return {
    milestones: ms,
    nextAction: NEXT_ACTION[item.status],
    dueDate,
    daysRemaining,
    rag,
    totalWeeks,
  }
}

/** Items whose next action is already late or lands inside the window. */
export function itemsNeedingAction(
  items: ProcurementItem[],
  today: DateStr,
  withinDays = 21,
): { item: ProcurementItem; status: ProcurementStatusInfo }[] {
  return items
    .map((item) => ({ item, status: procurementStatus(item, today) }))
    .filter(
      ({ status }) =>
        status.daysRemaining !== null && status.daysRemaining <= withinDays,
    )
    .sort((a, b) => (a.status.daysRemaining ?? 0) - (b.status.daysRemaining ?? 0))
}

/**
 * Latest on-site date an item can still support, given today's date and the
 * work still ahead of it. Answers "we blew the submittal date — how much did
 * that just cost the schedule?"
 */
export function earliestPossibleOnSite(
  item: ProcurementItem,
  today: DateStr,
): DateStr {
  const remainingWeeks =
    item.status === 'identified'
      ? item.approvalWeeks + item.leadTimeWeeks
      : item.status === 'submitted'
        ? item.approvalWeeks + item.leadTimeWeeks
        : item.status === 'approved'
          ? item.leadTimeWeeks
          : item.status === 'released'
            ? item.leadTimeWeeks
            : 0

  const d = parseISO(today)
  d.setDate(d.getDate() + Math.round(remainingWeeks * 7))
  return format(d, 'yyyy-MM-dd')
}

/** How many days late the item already is against its own on-site date. */
export function slipDays(item: ProcurementItem, today: DateStr): number {
  const earliest = earliestPossibleOnSite(item, today)
  return Math.max(
    0,
    differenceInCalendarDays(parseISO(earliest), parseISO(item.neededOnSite)),
  )
}
