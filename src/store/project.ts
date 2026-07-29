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
 * Everything lives on the device. No account, no server, no network — the app
 * has to work in a basement, in a shaft, and at 5:30am in a yard with one bar.
 * Projects move between people as files, the same way drawings already do.
 */

/** Which backend actually accepted the data, so the UI can be honest about it. */
export type StorageMode = 'indexeddb' | 'localstorage' | 'memory'

let storageMode: StorageMode = 'indexeddb'
export const getStorageMode = (): StorageMode => storageMode

/** Last-resort bucket so the app still runs, even if nothing persists. */
const memory = new Map<string, string>()

/**
 * Storage that degrades instead of failing.
 *
 * IndexedDB is unavailable more often than it looks: private browsing, Safari
 * lockdown mode, a sandboxed iframe, or a browser with site data blocked. If a
 * read throws and nothing catches it, zustand's rehydration never resolves and
 * the app sits on its loading screen forever — so every call here is guarded,
 * and each one falls back a step rather than rejecting.
 */
const resilientStorage: StateStorage = {
  getItem: async (name) => {
    try {
      const value = await idbGet(name)
      if (value != null) {
        storageMode = 'indexeddb'
        return value as string
      }
    } catch {
      // Fall through to the next backend.
    }

    try {
      const value = localStorage.getItem(name)
      if (value != null) {
        storageMode = 'localstorage'
        return value
      }
    } catch {
      storageMode = 'memory'
    }

    return memory.get(name) ?? null
  },

  setItem: async (name, value) => {
    try {
      await idbSet(name, value)
      storageMode = 'indexeddb'
      return
    } catch {
      // Fall through.
    }

    try {
      localStorage.setItem(name, value)
      storageMode = 'localstorage'
      return
    } catch {
      // Fall through.
    }

    // Nothing durable is available. Keep the session working and let the UI
    // warn the user rather than silently dropping a day of field entries.
    storageMode = 'memory'
    memory.set(name, value)
  },

  removeItem: async (name) => {
    try {
      await idbSet(name, undefined)
    } catch {
      /* ignore */
    }
    try {
      localStorage.removeItem(name)
    } catch {
      /* ignore */
    }
    memory.delete(name)
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
      storage: createJSONStorage(() => resilientStorage),
      partialize: (s) => ({
        projects: s.projects,
        activeId: s.activeId,
        wagesConfirmed: s.wagesConfirmed,
        theme: s.theme,
      }),
      // Fires after the read resolves — including on a first run where there
      // is nothing stored, and on a failure where `state` is undefined.
      onRehydrateStorage: () => (state, error) => {
        if (error) {
          console.warn('Could not read saved projects; starting empty.', error)
        }
        ;(state ?? useProjectStore.getState()).markHydrated()
      },
    },
  ),
)

// Belt and braces: a corrupt payload or a storage layer that never settles must
// not strand the user on the loading screen. Whatever happens, the app opens.
if (typeof window !== 'undefined') {
  setTimeout(() => {
    if (!useProjectStore.getState().hydrated) {
      console.warn('Storage did not respond in time; opening without saved data.')
      useProjectStore.getState().markHydrated()
    }
  }, 3000)
}

/** The project currently open, or null. */
export function useActiveProject(): Project | null {
  return useProjectStore(
    (s) => s.projects.find((p) => p.id === s.activeId) ?? null,
  )
}
