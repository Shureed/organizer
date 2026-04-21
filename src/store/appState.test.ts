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
import { useDataStore, useUIStore, useErrorStore } from './appState'

// ── helpers ───────────────────────────────────────────────────────────────────

const resetDataStore = () =>
  useDataStore.setState({
    data: {
      tasks: [],
      projects: [],
      closedTasks: [],
      closedProjects: [],
      inbox: [],
      chainStatus: [],
      chainNodesByOrigin: {},
      pinnedDoneTasks: [],
      recentItems: [],
    },
  })

const resetUIStore = () =>
  useUIStore.setState({
    ui: {
      currentView: 'today',
      calendarYear: 2026,
      calendarMonth: 0,
      calendarSelectedDay: null,
      issuesFilterType: '',
      issuesFilterPriority: '',
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
    // Merge only chainStatus — tasks and projects must survive.
    useDataStore.getState().setData({
      chainStatus: [
        {
          origin_id: 'orig-1',
          origin_name: 'Origin',
          origin_type: 'project',
          origin_status: 'active',
          chain_nodes: [],
        },
      ],
    })
    const { data } = useDataStore.getState()
    expect(data.tasks).toHaveLength(1)
    expect(data.projects).toHaveLength(1)
    expect(data.chainStatus).toHaveLength(1)
    expect(data.chainStatus[0].origin_id).toBe('orig-1')
  })

  it('chainNodesByOrigin patch does not clobber unrelated slices', () => {
    useDataStore.getState().setData({
      recentItems: [{ id: 'r1', name: 'R', status: 'open', updated_at: '', type: 'task', priority: null }],
    })
    useDataStore.getState().setData({
      chainNodesByOrigin: { 'orig-1': [{ id: 'n1', name: 'Node 1', type: 'task', status: 'active', chain_origin_id: 'orig-1' }] },
    })
    const { data } = useDataStore.getState()
    expect(data.recentItems).toHaveLength(1)
    expect(data.chainNodesByOrigin['orig-1']).toHaveLength(1)
  })
})

// ── ErrorStore / setLoadError + clearLoadError ────────────────────────────────

describe('ErrorStore.setLoadError / clearLoadError', () => {
  const resetErrorStore = () => useErrorStore.setState({ loadError: null })

  beforeEach(() => {
    resetErrorStore()
  })

  it('starts with no error', () => {
    expect(useErrorStore.getState().loadError).toBeNull()
  })

  it('setLoadError stores the slice and message', () => {
    useErrorStore.getState().setLoadError({ slice: 'tasks', message: 'network failure' })
    const { loadError } = useErrorStore.getState()
    expect(loadError).not.toBeNull()
    expect(loadError?.slice).toBe('tasks')
    expect(loadError?.message).toBe('network failure')
  })

  it('setLoadError overwrites a previous error', () => {
    useErrorStore.getState().setLoadError({ slice: 'tasks', message: 'first' })
    useErrorStore.getState().setLoadError({ slice: 'inbox', message: 'second' })
    const { loadError } = useErrorStore.getState()
    expect(loadError?.slice).toBe('inbox')
    expect(loadError?.message).toBe('second')
  })

  it('clearLoadError resets to null', () => {
    useErrorStore.getState().setLoadError({ slice: 'tasks', message: 'err' })
    useErrorStore.getState().clearLoadError()
    expect(useErrorStore.getState().loadError).toBeNull()
  })

  it('clearLoadError is idempotent when already null', () => {
    // Should not throw even if called with no error set.
    useErrorStore.getState().clearLoadError()
    expect(useErrorStore.getState().loadError).toBeNull()
  })

  it('clearLoadError after setLoadError leaves other stores untouched', () => {
    useDataStore.getState().setData({ tasks: [{ id: 'task-z' } as never] })
    useErrorStore.getState().setLoadError({ slice: 'tasks', message: 'err' })
    useErrorStore.getState().clearLoadError()
    expect(useErrorStore.getState().loadError).toBeNull()
    // DataStore must be unaffected.
    expect(useDataStore.getState().data.tasks[0].id).toBe('task-z')
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
    expect(ui.issuesFilterType).toBe('')
    expect(ui.showClosedSearch).toBe(false)
    expect(ui.openTaskId).toBe(null)
  })

  it('patchUI with openTaskId stores the value correctly', () => {
    useUIStore.getState().patchUI({ openTaskId: 'task-abc' })
    expect(useUIStore.getState().ui.openTaskId).toBe('task-abc')
  })
})
