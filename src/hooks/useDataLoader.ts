import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore, useErrorStore } from '../store/appState'
import type { ChainNode } from '../store/appState'

// Module-scoped dedup map
const lastFetchedAt = new Map<string, number>()
const DEDUP_MS = 200

// ── Module-level slice loaders ──────────────────────────────────────────────────
// Use store's getState() so these are plain async functions (no hook context needed).
// This makes the per-view composers below referentially stable module-level exports.

const getSetData = () => useAppStore.getState().setData
const getSetLoadError = () => useErrorStore.getState().setLoadError

export async function loadTasks(force = false): Promise<void> {
  const key = 'tasks'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('v_active_tasks')
    .select('*')
    .order('date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (error) throw error
  getSetData()({ tasks: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadProjects(force = false): Promise<void> {
  const key = 'projects'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('v_active_projects')
    .select('*')
    .order('name', { ascending: true })

  if (error) throw error
  getSetData()({ projects: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadClosedTasks(force = false): Promise<void> {
  const key = 'closedTasks'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('*')
    .in('status', ['done', 'cancelled'])
    .eq('archived', false)
    .neq('type', 'project')

  if (error) throw error
  getSetData()({ closedTasks: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadClosedProjects(force = false): Promise<void> {
  const key = 'closedProjects'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('*')
    .eq('type', 'project')
    .in('status', ['done', 'cancelled'])
    .eq('archived', false)

  if (error) throw error
  getSetData()({ closedProjects: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadInbox(force = false): Promise<void> {
  const key = 'inbox'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('v_new_inbox')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  getSetData()({ inbox: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadChainStatus(force = false): Promise<void> {
  const key = 'chainStatus'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('v_chain_status')
    .select('*')

  if (error) throw error
  getSetData()({ chainStatus: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadPinnedDoneTasks(force = false): Promise<void> {
  const key = 'pinnedDoneTasks'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('*')
    .eq('pinned', true)
    .eq('status', 'done')
    .eq('archived', false)
    .order('created_at', { ascending: true })

  if (error) throw error
  getSetData()({ pinnedDoneTasks: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadRecentItems(force = false): Promise<void> {
  const key = 'recentItems'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('id, name, status, updated_at, type, priority')
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(25)

  if (error) throw error
  getSetData()({ recentItems: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

// ── Error-surfacing wrapper ─────────────────────────────────────────────────────
// Wraps a loader so errors are stored in the error store for display.
export function withErrorSurfacing(
  slice: string,
  loader: (force?: boolean) => Promise<void>,
): (force?: boolean) => Promise<void> {
  return async (force?: boolean) => {
    try {
      await loader(force)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[useDataLoader] ${slice} failed:`, err)
      getSetLoadError()({ slice, message })
      throw err
    }
  }
}

async function loadChainNodes(originIds: string[], force = false): Promise<void> {
  const key = 'chainNodes'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return
  if (originIds.length === 0) return

  const { data, error } = await supabase
    .from('action_node')
    .select('id, name, type, status, chain_origin_id')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .in('chain_origin_id' as any, originIds)
    .eq('archived', false)
    .order('created_at', { ascending: true })

  if (error || !data) return

  const grouped: Record<string, ChainNode[]> = {}
  for (const row of data) {
    const k = (row as ChainNode).chain_origin_id
    if (!k) continue
    ;(grouped[k] ||= []).push(row as ChainNode)
  }
  useAppStore.getState().setData({ chainNodesByOrigin: grouped })
  lastFetchedAt.set(key, Date.now())
}

// ── Invalidation bus exports ────────────────────────────────────────────────────
// SliceKey + sliceLoaders let useRealtime fan out a realtime payload to the
// correct force-refetch functions without importing each loader individually.
// Trade-off: a flat map is simpler than a dynamic dispatch pattern, and all
// loaders are already module-level so there's no closure/hook-context concern.

export type SliceKey =
  | 'tasks'
  | 'projects'
  | 'closedTasks'
  | 'closedProjects'
  | 'pinnedDoneTasks'
  | 'recentItems'
  | 'chainStatus'
  | 'inbox'

export const sliceLoaders: Record<SliceKey, (force?: boolean) => Promise<void>> = {
  tasks: loadTasks,
  projects: loadProjects,
  closedTasks: loadClosedTasks,
  closedProjects: loadClosedProjects,
  pinnedDoneTasks: loadPinnedDoneTasks,
  recentItems: loadRecentItems,
  chainStatus: loadChainStatus,
  inbox: loadInbox,
}

// Module-level loadAll — used by useRealtime for reconnect/visibility reconciliation.
// Mirrors the hook's loadAll but callable outside of hook context.
export function loadAll(): Promise<unknown[]> {
  return Promise.all([
    loadTasks(true),
    loadProjects(true),
    loadClosedTasks(true),
    loadClosedProjects(true),
    loadInbox(true),
    loadChainStatus(true),
    loadPinnedDoneTasks(true),
    loadRecentItems(true),
  ])
}

// ── Per-view composers ──────────────────────────────────────────────────────────
// Stable module-level exports. Slice loaders dedup within 200ms so shell seed +
// view loader co-firing collapses to one request per slice.

export const loadShellSeed = (): Promise<void> => loadTasks()

export const loadTodayView = async (): Promise<void> => {
  await Promise.all([loadTasks(), loadProjects(), loadChainStatus(), loadPinnedDoneTasks()])
  const ids = useAppStore.getState().data.chainStatus.map(c => c.origin_id).filter(Boolean) as string[]
  if (ids.length) await loadChainNodes(ids)
}

export const loadCalendarView = (): Promise<unknown> =>
  Promise.all([loadTasks(), loadClosedTasks()])

export const loadIssuesView = (): Promise<void> => loadTasks()

export const loadRecentsView = (): Promise<void> => loadRecentItems()

export const loadInboxView = (): Promise<void> => loadInbox()

// ── useDataLoader hook ──────────────────────────────────────────────────────────
// Provides forced-refresh variants and the loadAll escape hatch for mutations.
export function useDataLoader() {
  // Recomposed refresh functions (force = true bypasses dedup)
  const refreshTasks = async () => {
    await Promise.all([
      loadTasks(true),
      loadProjects(true),
      loadClosedTasks(true),
      loadPinnedDoneTasks(true),
      loadRecentItems(true),
      loadChainStatus(true),
    ])
    const ids = useAppStore.getState().data.chainStatus.map(c => c.origin_id).filter(Boolean) as string[]
    if (ids.length) await loadChainNodes(ids, true)
  }

  const refreshInbox = () => loadInbox(true)

  // Load all slices (rollback escape hatch)
  const loadAll = () => Promise.all([
    loadTasks(true),
    loadProjects(true),
    loadClosedTasks(true),
    loadClosedProjects(true),
    loadInbox(true),
    loadChainStatus(true),
    loadPinnedDoneTasks(true),
    loadRecentItems(true),
  ])

  return {
    loadAll,
    refreshTasks,
    refreshInbox,
    loadTasks,
    loadProjects,
    loadClosedTasks,
    loadClosedProjects,
    loadInbox,
    loadChainStatus,
    loadPinnedDoneTasks,
    loadRecentItems,
  }
}

// ── useAutoRefresh ──────────────────────────────────────────────────────────────
// Visibility-gated polling. `load` should be a stable reference (module-level
// composer) so the effect deps are stable.
export function useAutoRefresh(load: () => Promise<unknown>, interval = 30000) {
  const lastRunAt = useRef(Date.now())
  useEffect(() => {
    const id = setInterval(() => {
      if (document.hidden) return
      load().then(() => { lastRunAt.current = Date.now() })
    }, interval)
    const onVis = () => {
      if (!document.hidden && Date.now() - lastRunAt.current > interval) {
        load().then(() => { lastRunAt.current = Date.now() })
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [load, interval])
}
