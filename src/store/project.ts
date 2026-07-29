import { get as idbGet, set as idbSet } from 'idb-keyval'
import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import {
  DEFAULT_RULE_PROFILE,
  DEFAULT_WAGE_PACKAGE,
  PHASE_TEMPLATE,
  uid,
} from '../domain/templates'
import { SCHEMA_VERSION, type Project } from '../domain/types'
import { todayStr } from '../engine/schedule'

/**
 * Project store.
 *
 * Everything lives in IndexedDB on the device. No account, no server, no
 * network — the app has to work in a basement, in a shaft, and at 5:30am in a
 * yard with one bar. Projects move between people as files, the same way
 * drawings already do.
 */

const idbStorage: StateStorage = {
  getItem: async (name) => (await idbGet(name)) ?? null,
  setItem: async (name, value) => {
    await idbSet(name, value)
  },
  removeItem: async (name) => {
    await idbSet(name, undefined)
  },
}

export function blankProject(name = 'New Project'): Project {
  const today = todayStr()
  return {
    id: uid(),
    schemaVersion: SCHEMA_VERSION,
    name,
    number: '',
    generalContractor: '',
    owner: '',
    address: '',
    city: '',
    county: '',
    contractType: 'private',
    complianceEnabled: false,
    stwfRequired: false,
    stwfPercent: 60,
    contractValue: 0,
    startDate: today,
    targetFinish: today,
    siteManpowerCap: 0,
    ruleProfile: structuredClone(DEFAULT_RULE_PROFILE),
    wagePackage: structuredClone(DEFAULT_WAGE_PACKAGE),
    areas: [],
    phases: PHASE_TEMPLATE.map((p) => ({ ...p, id: uid() })),
    activities: [],
    progress: [],
    time: [],
    constraints: [],
    commitments: [],
    procurement: [],
    requisitions: [],
    dailyLogs: [],
    tmTickets: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

interface ProjectState {
  projects: Project[]
  activeId: string | null
  /** True once the IndexedDB read has finished, so the UI can hold its render. */
  hydrated: boolean
  /** User confirmed the seeded wage figures against their own wage sheet. */
  wagesConfirmed: Record<string, boolean>
  theme: 'dark' | 'light'

  addProject: (project: Project) => void
  updateProject: (id: string, patch: Partial<Project>) => void
  /** Mutate the active project in place. The workhorse for every editor. */
  mutate: (fn: (draft: Project) => void) => void
  removeProject: (id: string) => void
  setActive: (id: string | null) => void
  confirmWages: (id: string) => void
  setTheme: (theme: 'dark' | 'light') => void
  importProject: (project: Project) => void
  markHydrated: () => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set, getState) => ({
      projects: [],
      activeId: null,
      hydrated: false,
      wagesConfirmed: {},
      theme: 'dark',

      addProject: (project) =>
        set((s) => ({ projects: [...s.projects, project], activeId: project.id })),

      updateProject: (id, patch) =>
        set((s) => ({
          projects: s.projects.map((p) =>
            p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p,
          ),
        })),

      mutate: (fn) => {
        const { activeId, projects } = getState()
        if (!activeId) return
        const current = projects.find((p) => p.id === activeId)
        if (!current) return

        const draft = structuredClone(current)
        fn(draft)
        draft.updatedAt = new Date().toISOString()

        set({ projects: projects.map((p) => (p.id === activeId ? draft : p)) })
      },

      removeProject: (id) =>
        set((s) => ({
          projects: s.projects.filter((p) => p.id !== id),
          activeId: s.activeId === id ? null : s.activeId,
        })),

      setActive: (id) => set({ activeId: id }),

      confirmWages: (id) =>
        set((s) => ({ wagesConfirmed: { ...s.wagesConfirmed, [id]: true } })),

      setTheme: (theme) => set({ theme }),

      markHydrated: () => set({ hydrated: true }),

      importProject: (project) =>
        set((s) => {
          // Imported files get a fresh id so bringing back your own export
          // never silently overwrites the copy you are working on.
          const incoming: Project = { ...project, id: uid() }
          return { projects: [...s.projects, incoming], activeId: incoming.id }
        }),
    }),
    {
      name: 'gf-field-command',
      storage: createJSONStorage(() => idbStorage),
      partialize: (s) => ({
        projects: s.projects,
        activeId: s.activeId,
        wagesConfirmed: s.wagesConfirmed,
        theme: s.theme,
      }),
      // Fires after the IndexedDB read resolves — including on a first run
      // where there is nothing stored yet.
      onRehydrateStorage: () => (state) => {
        ;(state ?? useProjectStore.getState()).markHydrated()
      },
    },
  ),
)

/** The project currently open, or null. */
export function useActiveProject(): Project | null {
  return useProjectStore(
    (s) => s.projects.find((p) => p.id === s.activeId) ?? null,
  )
}
