/**
 * appState.test.ts
 *
 * Unit tests for the DataStore's setData action and the UIStore's patchUI action.
 * Both are shallow-merge operations on their respective state slices.
 *
 * Note: useAppStore, useDataStore, and useUIStore are Zustand stores. Zustand
 * stores are module-level singletons, so state leaks between tests unless the
 * store is reset between each case.
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { useDataStore, useUIStore } from './appState'

// ── helpers ───────────────────────────────────────────────────────────────────

const resetDataStore = () =>
  useDataStore.setState({
    data: {
      tasks: [],
      projects: [],
      closedTasks: [],
      closedProjects: [],
      inbox: [],
      pinnedDoneTasks: [],
      pinnedAll: [],
      recentItems: [],
      activeContainers: [],
    },
  })

const resetUIStore = () =>
  useUIStore.setState({
    ui: {
      currentView: 'today',
      calendarYear: 2026,
      calendarMonth: 0,
      calendarSelectedDay: null,
      showClosedSearch: false,
      searchItems: [],
      fuseIndex: null,
      openTaskId: null,
      openInboxId: null,
    },
  })

// ── DataStore / setData ───────────────────────────────────────────────────────

describe('DataStore.setData', () => {
  beforeEach(() => {
    resetDataStore()
  })

  it('setting an empty patch leaves all slices at their defaults', () => {
    useDataStore.getState().setData({})
    const { data } = useDataStore.getState()
    expect(data.tasks).toEqual([])
    expect(data.projects).toEqual([])
    expect(data.inbox).toEqual([])
  })

  it('setting tasks to an empty array is reflected in state', () => {
    useDataStore.getState().setData({ tasks: [] })
    expect(useDataStore.getState().data.tasks).toEqual([])
  })

  it('partial update preserves untouched slices', () => {
    // Seed inbox with a value, then update only tasks.
    useDataStore.getState().setData({
      inbox: [{ id: 'inbox-1' } as never],
    })
    useDataStore.getState().setData({
      tasks: [{ id: 'task-1' } as never],
    })
    const { data } = useDataStore.getState()
    expect(data.tasks).toHaveLength(1)
    expect(data.tasks[0].id).toBe('task-1')
    // inbox must still be intact
    expect(data.inbox).toHaveLength(1)
    expect(data.inbox[0].id).toBe('inbox-1')
    // untouched slices remain at defaults
    expect(data.projects).toEqual([])
    expect(data.closedTasks).toEqual([])
  })

  it('idempotent re-set: applying the same patch twice yields equal state', () => {
    const patch = { tasks: [{ id: 'task-x' } as never] }
    useDataStore.getState().setData(patch)
    const stateAfterFirst = { ...useDataStore.getState().data }
    useDataStore.getState().setData(patch)
    const stateAfterSecond = useDataStore.getState().data
    expect(stateAfterSecond).toEqual(stateAfterFirst)
  })

  it('merging a new key does not clobber existing keys', () => {
    useDataStore.getState().setData({
      tasks: [{ id: 'task-1' } as never],
      projects: [{ id: 'proj-1' } as never],
    })
    // Merge only pinnedDoneTasks — tasks and projects must survive.
    useDataStore.getState().setData({
      pinnedDoneTasks: [{ id: 'pinned-1' } as never],
    })
    const { data } = useDataStore.getState()
    expect(data.tasks).toHaveLength(1)
    expect(data.projects).toHaveLength(1)
    expect(data.pinnedDoneTasks).toHaveLength(1)
    expect(data.pinnedDoneTasks[0].id).toBe('pinned-1')
  })

  it('recentItems patch does not clobber unrelated slices', () => {
    useDataStore.getState().setData({
      inbox: [{ id: 'inbox-1' } as never],
    })
    useDataStore.getState().setData({
      recentItems: [{ id: 'r1', name: 'R', status: 'open', updated_at: '', type: 'task', priority: null }],
    })
    const { data } = useDataStore.getState()
    expect(data.inbox).toHaveLength(1)
    expect(data.recentItems).toHaveLength(1)
  })
})

// ── UIStore / patchUI ─────────────────────────────────────────────────────────

describe('UIStore.patchUI', () => {
  beforeEach(() => {
    resetUIStore()
  })

  it('patchUI changes only the specified field, leaves others alone', () => {
    useUIStore.getState().patchUI({ currentView: 'inbox' })
    const { ui } = useUIStore.getState()
    expect(ui.currentView).toBe('inbox')
    // All other fields stay at reset defaults.
    expect(ui.showClosedSearch).toBe(false)
    expect(ui.openTaskId).toBe(null)
  })

  it('patchUI with openTaskId stores the value correctly', () => {
    useUIStore.getState().patchUI({ openTaskId: 'task-abc' })
    expect(useUIStore.getState().ui.openTaskId).toBe('task-abc')
  })
})
