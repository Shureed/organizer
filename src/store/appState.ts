import { create } from 'zustand'
import type { Tables } from '../types/database.types'
import type Fuse from 'fuse.js'

// Row types derived from DB schema
export type ActiveTask = Tables<'v_active_tasks'>
export type ActiveProject = Tables<'v_active_projects'>
export type Space = Tables<'spaces'>
export type SpaceTree = Tables<'v_space_tree'>
export type InboxItem = Tables<'v_new_inbox'>
export type ActionNode = Tables<'action_node'>

export interface SearchItem {
  type: string
  id: string
  name: string
  meta: string
  closed: boolean
  searchText: string
  handler: () => void
}

export interface AppData {
  tasks: ActiveTask[]
  projects: ActiveProject[]
  closedTasks: ActionNode[]
  closedProjects: ActionNode[]
  inbox: InboxItem[]
  pinnedDoneTasks: ActionNode[]
  pinnedAll: ActionNode[]
  recentItems: Pick<ActionNode, 'id' | 'name' | 'status' | 'updated_at' | 'type' | 'priority'>[]
  activeContainers: ActionNode[]
}

export interface AppUI {
  currentView: 'today' | 'calendar' | 'recents' | 'settings' | 'inbox'
  calendarYear: number
  calendarMonth: number
  calendarSelectedDay: string | null
  showClosedSearch: boolean
  searchItems: SearchItem[]
  fuseIndex: Fuse<SearchItem> | null
  openTaskId: string | null
  openInboxId: string | null
}

// ── Data store ─────────────────────────────────────────────────────────────────

interface DataStore {
  data: AppData
  setData: (patch: Partial<AppData>) => void
}

// Module-level stable empty arrays — never inline `?? []` in selectors (Zustand ref equality).
const EMPTY_ACTIVE_CONTAINERS: ActionNode[] = []

const initialData: AppData = {
  tasks: [],
  projects: [],
  closedTasks: [],
  closedProjects: [],
  inbox: [],
  pinnedDoneTasks: [],
  pinnedAll: [],
  recentItems: [],
  activeContainers: EMPTY_ACTIVE_CONTAINERS,
}

export const useDataStore = create<DataStore>((set) => ({
  data: initialData,
  setData: (patch) =>
    set((state) => ({ data: { ...state.data, ...patch } })),
}))

// ── UI store ───────────────────────────────────────────────────────────────────

interface UIStore {
  ui: AppUI
  setUI: (ui: AppUI) => void
  patchUI: (patch: Partial<AppUI>) => void
}

const initialUI: AppUI = {
  currentView: 'today',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  calendarSelectedDay: new Date().toLocaleDateString('en-CA'),
  showClosedSearch: false,
  searchItems: [],
  fuseIndex: null,
  openTaskId: null,
  openInboxId: null,
}

export const useUIStore = create<UIStore>((set) => ({
  ui: initialUI,
  setUI: (ui) => set({ ui }),
  patchUI: (patch) =>
    set((state) => ({ ui: { ...state.ui, ...patch } })),
}))

// ── Error store ───────────────────────────────────────────────────────────────

export interface LoadError {
  slice: string
  message: string
}

interface ErrorStore {
  loadError: LoadError | null
  setLoadError: (err: LoadError) => void
  clearLoadError: () => void
}

export const useErrorStore = create<ErrorStore>((set) => ({
  loadError: null,
  setLoadError: (err) => set({ loadError: err }),
  clearLoadError: () => set({ loadError: null }),
}))

// ── Compat shim ────────────────────────────────────────────────────────────────
// useAppStore(selector) runs the selector against a combined snapshot
// { data, ui, setData, setUI, patchUI }. Zustand's default Object.is comparison
// on the selector output means primitive/ref selectors are stable.
//
// NOTE: calling useAppStore() with NO selector returns the combined object —
// a new reference every render. Destructuring that defeats the perf goal.
// Migrate callsites to useDataStore / useUIStore directly for the actual win.

type CombinedStore = {
  data: AppData
  ui: AppUI
  setData: DataStore['setData']
  setUI: UIStore['setUI']
  patchUI: UIStore['patchUI']
}

// Identity selector used when no selector is provided (whole-object compat).
const IDENTITY = (s: CombinedStore) => s

export function useAppStore(): CombinedStore
export function useAppStore<T>(selector: (s: CombinedStore) => T): T
export function useAppStore<T>(selector?: (s: CombinedStore) => T): CombinedStore | T {
  const data = useDataStore((s) => s.data)
  const setData = useDataStore((s) => s.setData)
  const ui = useUIStore((s) => s.ui)
  const setUI = useUIStore((s) => s.setUI)
  const patchUI = useUIStore((s) => s.patchUI)

  const combined: CombinedStore = { data, ui, setData, setUI, patchUI }

  return (selector ?? IDENTITY)(combined) as CombinedStore | T
}

// Give the compat shim access to .getState() used by hooks/useDataLoader and
// hooks/useSearch (they call useAppStore.getState().setData / patchUI).
useAppStore.getState = (): CombinedStore => {
  const { data, setData } = useDataStore.getState()
  const { ui, setUI, patchUI } = useUIStore.getState()
  return { data, ui, setData, setUI, patchUI }
}
