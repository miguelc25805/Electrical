import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useActiveProject, useProjectStore } from './store/project'
import {
  IconCompliance,
  IconCrew,
  IconDashboard,
  IconField,
  IconForecast,
  IconLog,
  IconMaterials,
  IconMatrix,
  IconMore,
  IconSettings,
  IconSun,
  IconMoon,
  IconTimeline,
} from './components/icons'
import Dashboard from './screens/Dashboard'
import WorkMatrix from './screens/WorkMatrix'
import Manpower from './screens/Manpower'
import FieldEntry from './screens/FieldEntry'
import Timeline from './screens/Timeline'
import Forecast from './screens/Forecast'
import Materials from './screens/Materials'
import Logs from './screens/Logs'
import Compliance from './screens/Compliance'
import Settings from './screens/Settings'
import Projects from './screens/Projects'
import Setup from './screens/Setup'

interface NavItem {
  to: string
  label: string
  short: string
  Icon: (p: { size?: number }) => React.ReactElement
  /** Shown in the phone tab bar rather than behind "More". */
  primary?: boolean
}

/**
 * Navigation order follows the day, not the data model: check the job, look at
 * the work, staff it, report it, then everything else.
 */
const NAV: NavItem[] = [
  { to: '/dashboard', label: 'Dashboard', short: 'Job', Icon: IconDashboard, primary: true },
  { to: '/matrix', label: 'Work Matrix', short: 'Work', Icon: IconMatrix, primary: true },
  { to: '/manpower', label: 'Manpower', short: 'Crew', Icon: IconCrew, primary: true },
  { to: '/field', label: 'Field Entry', short: 'Report', Icon: IconField, primary: true },
  { to: '/timeline', label: 'Timeline & Lookahead', short: 'Plan', Icon: IconTimeline },
  { to: '/forecast', label: 'Forecast', short: 'Forecast', Icon: IconForecast },
  { to: '/materials', label: 'Materials', short: 'Material', Icon: IconMaterials },
  { to: '/logs', label: 'Daily Log & T&M', short: 'Logs', Icon: IconLog },
  { to: '/compliance', label: 'Compliance', short: 'Comply', Icon: IconCompliance },
  { to: '/settings', label: 'Settings & Rules', short: 'Setup', Icon: IconSettings },
]

export default function App() {
  const hydrated = useProjectStore((s) => s.hydrated)
  const theme = useProjectStore((s) => s.theme)
  const project = useActiveProject()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.classList.toggle('light', theme === 'light')
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Hold the first paint until IndexedDB answers, so a returning user never
  // sees an empty-state flash that reads like their job was lost.
  if (!hydrated) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="label-cap animate-pulse">Loading job data…</div>
      </div>
    )
  }

  const onProjectsScreen = location.pathname === '/projects'
  const showChrome = Boolean(project) && !onProjectsScreen

  return (
    <div className="flex h-full flex-col sm:flex-row">
      {showChrome && <Sidebar />}

      <main className="flex-1 overflow-y-auto pb-24 sm:pb-0">
        <Routes>
          <Route path="/" element={<Navigate to={project ? '/dashboard' : '/projects'} replace />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />
          <Route path="/matrix" element={<Guard><WorkMatrix /></Guard>} />
          <Route path="/manpower" element={<Guard><Manpower /></Guard>} />
          <Route path="/field" element={<Guard><FieldEntry /></Guard>} />
          <Route path="/timeline" element={<Guard><Timeline /></Guard>} />
          <Route path="/forecast" element={<Guard><Forecast /></Guard>} />
          <Route path="/materials" element={<Guard><Materials /></Guard>} />
          <Route path="/logs" element={<Guard><Logs /></Guard>} />
          <Route path="/compliance" element={<Guard><Compliance /></Guard>} />
          <Route path="/settings" element={<Guard><Settings /></Guard>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {showChrome && <TabBar />}
    </div>
  )
}

/** Sends the user to the project list rather than rendering an empty screen. */
function Guard({ children }: { children: React.ReactNode }) {
  const project = useActiveProject()
  if (!project) return <Navigate to="/projects" replace />
  return <>{children}</>
}

// ---------------------------------------------------------------------------

function Sidebar() {
  const project = useActiveProject()
  const theme = useProjectStore((s) => s.theme)
  const setTheme = useProjectStore((s) => s.setTheme)

  return (
    <nav
      className="no-print hidden w-60 shrink-0 flex-col overflow-y-auto border-r sm:flex"
      style={{ background: 'var(--app-surface)', borderColor: 'var(--app-line-soft)' }}
    >
      <NavLink to="/projects" className="block px-4 py-4">
        <div className="flex items-center gap-2">
          <Bolt />
          <span className="text-sm font-extrabold tracking-tight">GF FIELD COMMAND</span>
        </div>
        <div className="mt-2 truncate text-xs font-semibold" style={{ color: 'var(--app-text-muted)' }}>
          {project?.name}
        </div>
        <div className="truncate text-xs" style={{ color: 'var(--app-text-dim)' }}>
          {project?.number ? `#${project.number} · ` : ''}
          {project?.ruleProfile.localUnion}
        </div>
      </NavLink>

      <div className="flex-1 px-2 pb-4">
        {NAV.map(({ to, label, Icon }) => (
          <NavLink
            key={to}
            to={to}
            className="mb-0.5 flex items-center gap-3 rounded-lg px-3 text-sm font-semibold"
            style={({ isActive }) => ({
              minHeight: 'var(--spacing-tap)',
              background: isActive ? 'color-mix(in srgb, var(--color-amp-400) 16%, transparent)' : 'transparent',
              color: isActive ? 'var(--color-amp-400)' : 'var(--app-text-muted)',
            })}
          >
            <Icon size={20} />
            {label}
          </NavLink>
        ))}
      </div>

      <button
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="m-2 flex items-center gap-3 rounded-lg px-3 text-sm font-semibold"
        style={{ minHeight: 'var(--spacing-tap)', color: 'var(--app-text-muted)' }}
      >
        {theme === 'dark' ? <IconSun size={20} /> : <IconMoon size={20} />}
        {theme === 'dark' ? 'Bright (sunlight)' : 'Dark (indoors)'}
      </button>
    </nav>
  )
}

/**
 * Phone navigation: four screens on the bar, the rest behind "More". The four
 * are the ones a foreman opens while standing on the deck.
 */
function TabBar() {
  const primary = NAV.filter((n) => n.primary)

  return (
    <nav
      className="no-print fixed inset-x-0 bottom-0 z-40 flex border-t sm:hidden"
      style={{
        background: 'var(--app-surface)',
        borderColor: 'var(--app-line-soft)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {primary.map(({ to, short, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold"
          style={({ isActive }) => ({
            minHeight: 'var(--spacing-tap-lg)',
            color: isActive ? 'var(--color-amp-400)' : 'var(--app-text-muted)',
          })}
        >
          <Icon size={22} />
          {short}
        </NavLink>
      ))}
      <NavLink
        to="/settings"
        className="flex flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-bold"
        style={({ isActive }) => ({
          minHeight: 'var(--spacing-tap-lg)',
          color: isActive ? 'var(--color-amp-400)' : 'var(--app-text-muted)',
        })}
      >
        <IconMore size={22} />
        More
      </NavLink>
    </nav>
  )
}

/** Wordmark glyph — a bolt in a conduit ring. */
export function Bolt({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="var(--color-amp-400)"
        strokeWidth="1.8"
      />
      <path d="M13 5l-5 8h3.5L11 19l5-8h-3.5L13 5z" fill="var(--color-amp-400)" />
    </svg>
  )
}

/** Secondary navigation list, rendered inside Settings on a phone. */
export function MoreNav() {
  return (
    <div className="grid gap-2 sm:hidden">
      {NAV.filter((n) => !n.primary).map(({ to, label, Icon }) => (
        <NavLink
          key={to}
          to={to}
          className="surface flex items-center gap-3 rounded-lg px-4 text-sm font-semibold"
          style={{ minHeight: 'var(--spacing-tap-lg)' }}
        >
          <Icon size={20} />
          {label}
        </NavLink>
      ))}
    </div>
  )
}
