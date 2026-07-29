/**
 * Icon set.
 *
 * Hand-rolled so the app ships with no icon dependency and works offline with
 * nothing to fetch. Single stroke weight, 24px grid, currentColor throughout.
 */

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

export type IconProps = { size?: number }

const wrap =
  (children: React.ReactNode) =>
  ({ size = 22 }: IconProps) => (
    <svg {...base} width={size} height={size}>
      {children}
    </svg>
  )

/** Gauge — the dashboard. */
export const IconDashboard = wrap(
  <>
    <path d="M3 13a9 9 0 0 1 18 0" />
    <path d="M12 13l4-3" />
    <circle cx="12" cy="13" r="1.4" />
    <path d="M3 13v4h18v-4" />
  </>,
)

/** Grid — the work matrix. */
export const IconMatrix = wrap(
  <>
    <rect x="3" y="3" width="18" height="18" rx="1.5" />
    <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
  </>,
)

/** Crew — manpower. */
export const IconCrew = wrap(
  <>
    <circle cx="9" cy="8" r="3" />
    <path d="M3 20a6 6 0 0 1 12 0" />
    <path d="M16 5.5a3 3 0 0 1 0 5" />
    <path d="M17.5 14.5A6 6 0 0 1 21 20" />
  </>,
)

/** Clipboard with a check — field entry. */
export const IconField = wrap(
  <>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4h6v3H9z" />
    <path d="M9 13l2 2 4-4" />
  </>,
)

/** Bar chart over time — timeline. */
export const IconTimeline = wrap(
  <>
    <path d="M3 6h9M6 12h12M9 18h9" />
    <circle cx="3" cy="6" r="0.6" fill="currentColor" />
  </>,
)

/** Trend line — forecast. */
export const IconForecast = wrap(
  <>
    <path d="M3 20V4" />
    <path d="M3 20h18" />
    <path d="M6 16c3 0 4-7 7-7s3 4 6 4" />
  </>,
)

/** Crate — materials. */
export const IconMaterials = wrap(
  <>
    <path d="M3 8l9-4 9 4v8l-9 4-9-4z" />
    <path d="M3 8l9 4 9-4M12 12v8" />
  </>,
)

/** Document — daily logs and tickets. */
export const IconLog = wrap(
  <>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4" />
    <path d="M9 12h6M9 16h6" />
  </>,
)

/** Shield — compliance. */
export const IconCompliance = wrap(
  <>
    <path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z" />
    <path d="M9 12l2 2 4-4" />
  </>,
)

/** Gear — settings. */
export const IconSettings = wrap(
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1" />
  </>,
)

export const IconPlus = wrap(<path d="M12 5v14M5 12h14" />)
export const IconPrint = wrap(
  <>
    <path d="M6 9V3h12v6" />
    <rect x="3" y="9" width="18" height="8" rx="2" />
    <path d="M6 17h12v4H6z" />
  </>,
)
export const IconDownload = wrap(
  <>
    <path d="M12 3v12" />
    <path d="M8 11l4 4 4-4" />
    <path d="M4 19h16" />
  </>,
)
export const IconUpload = wrap(
  <>
    <path d="M12 15V3" />
    <path d="M8 7l4-4 4 4" />
    <path d="M4 19h16" />
  </>,
)
export const IconMore = wrap(
  <>
    <circle cx="5" cy="12" r="1.3" fill="currentColor" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    <circle cx="19" cy="12" r="1.3" fill="currentColor" />
  </>,
)
export const IconBack = wrap(<path d="M15 5l-7 7 7 7" />)
export const IconTrash = wrap(
  <>
    <path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13" />
  </>,
)
export const IconWarn = wrap(
  <>
    <path d="M12 4l9 16H3z" />
    <path d="M12 10v4M12 17h.01" />
  </>,
)
export const IconSun = wrap(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </>,
)
export const IconMoon = wrap(<path d="M20 14A8 8 0 1 1 10 4a6.5 6.5 0 0 0 10 10z" />)
