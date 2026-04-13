import { create } from 'zustand'
import type { Tables } from '../types/database.types'
import type Fuse from 'fuse.js'

// Row types derived from DB schema
export type ActiveTask = Tables<'v_active_tasks'>
export type ActiveProject = Tables<'v_active_projects'>
export type Space = Tables<'spaces'>
export type SpaceTree = Tables<'v_space_tree'>
export type InboxItem = Tables<'v_new_inbox'>
export type ChainStatusItem = {
  origin_id: string
  origin_name: string
  origin_type: string
  origin_status: string
  chain_nodes: string[]
}
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
  spaces: Space[]
  spaceTree: SpaceTree[]
  inbox: InboxItem[]
  chainStatus: ChainStatusItem[]
  completedToday: ActionNode[]
  recentItems: Pick<ActionNode, 'id' | 'name' | 'status' | 'updated_at' | 'type' | 'priority'>[]
}

export interface AppUI {
  currentView: 'today' | 'calendar' | 'recents' | 'issues' | 'inbox'
  calendarYear: number
  calendarMonth: number
  calendarSelectedDay: string | null
  todayFilterType: string
  todayFilterPriority: string
  issuesFilterType: string
  issuesFilterPriority: string
  showClosedSearch: boolean
  searchItems: SearchItem[]
  fuseIndex: Fuse<SearchItem> | null
}

interface AppStore {
  data: AppData
  ui: AppUI
  setData: (data: Partial<AppData>) => void
  setUI: (ui: AppUI) => void
  patchUI: (patch: Partial<AppUI>) => void
}

const initialData: AppData = {
  tasks: [],
  projects: [],
  closedTasks: [],
  closedProjects: [],
  spaces: [],
  spaceTree: [],
  inbox: [],
  chainStatus: [],
  completedToday: [],
  recentItems: [],
}

const initialUI: AppUI = {
  currentView: 'today',
  calendarYear: new Date().getFullYear(),
  calendarMonth: new Date().getMonth(),
  calendarSelectedDay: new Date().toISOString().slice(0, 10),
  todayFilterType: '',
  todayFilterPriority: '',
  issuesFilterType: '',
  issuesFilterPriority: '',
  showClosedSearch: false,
  searchItems: [],
  fuseIndex: null,
}

export const useAppStore = create<AppStore>((set) => ({
  data: initialData,
  ui: initialUI,
  setData: (patch) =>
    set((state) => ({ data: { ...state.data, ...patch } })),
  setUI: (ui) => set({ ui }),
  patchUI: (patch) =>
    set((state) => ({ ui: { ...state.ui, ...patch } })),
}))
