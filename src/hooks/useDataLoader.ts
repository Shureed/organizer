import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/appState'
import { isSqliteAvailable } from '../sync/client'
import {
  sqliteTasks,
  sqliteProjects,
  sqliteClosedTasks,
  sqliteClosedProjects,
  sqliteInbox,
  sqliteChainStatus,
  sqlitePinnedDoneTasks,
  sqliteRecentItems,
  sqliteChainNodes,
} from '../sync/queries'
import type { ChainNode } from '../store/appState'

// ── Flag helpers ─────────────────────────────────────────────────────────────

const SQLITE_FLAG = import.meta.env.VITE_SQLITE_READS === 'true'

/**
 * Returns true when the SQLite flag is enabled AND the local DB is available.
 * Caches the availability check after the first resolution so repeated calls
 * are synchronous (the promise is the cache).
 */
let _sqliteAvailablePromise: Promise<boolean> | null = null
function sqliteReady(): Promise<boolean> {
  if (!SQLITE_FLAG) return Promise.resolve(false)
  return (_sqliteAvailablePromise ??= isSqliteAvailable())
}

// Module-scoped dedup map — still used by the REST fallback path.
const lastFetchedAt = new Map<string, number>()
const DEDUP_MS = 200

// ── Module-level slice loaders ──────────────────────────────────────────────────────
// Use store's getState() so these are plain async functions (no hook context needed).
// This makes the per-view composers below referentially stable module-level exports.

const getSetData = () => useAppStore.getState().setData

export async function loadTasks(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteTasks()

  const key = 'tasks'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('v_active_tasks')
    .select('*')
    .order('date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  getSetData()({ tasks: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadProjects(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteProjects()

  const key = 'projects'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('v_active_projects')
    .select('*')
    .order('name', { ascending: true })

  getSetData()({ projects: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadClosedTasks(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteClosedTasks()

  const key = 'closedTasks'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('action_node')
    .select('*')
    .in('status', ['done', 'cancelled'])
    .eq('archived', false)
    .neq('type', 'project')

  getSetData()({ closedTasks: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadClosedProjects(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteClosedProjects()

  const key = 'closedProjects'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('action_node')
    .select('*')
    .eq('type', 'project')
    .in('status', ['done', 'cancelled'])
    .eq('archived', false)

  getSetData()({ closedProjects: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadInbox(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteInbox()

  const key = 'inbox'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('v_new_inbox')
    .select('*')
    .order('created_at', { ascending: false })

  getSetData()({ inbox: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadChainStatus(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteChainStatus()

  const key = 'chainStatus'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('v_chain_status')
    .select('*')

  getSetData()({ chainStatus: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadPinnedDoneTasks(force = false): Promise<void> {
  if (await sqliteReady()) return sqlitePinnedDoneTasks()

  const key = 'pinnedDoneTasks'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('action_node')
    .select('*')
    .eq('pinned', true)
    .eq('status', 'done')
    .eq('archived', false)
    .order('created_at', { ascending: true })

  getSetData()({ pinnedDoneTasks: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadRecentItems(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteRecentItems()

  const key = 'recentItems'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data } = await supabase
    .from('action_node')
    .select('id, name, status, updated_at, type, priority')
    .eq('archived', false)
    .order('updated_at', { ascending: false })
    .limit(25)

  getSetData()({ recentItems: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

async function loadChainNodes(originIds: string[], _force = false): Promise<void> {
  if (await sqliteReady()) return sqliteChainNodes(originIds)

  const key = 'chainNodes'
  if (!_force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return
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

// ── Invalidation bus exports ────────────────────────────────────────────────────────
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

// ── Per-view composers ──────────────────────────────────────────────────────────────
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

// ── useDataLoader hook ──────────────────────────────────────────────────────────────
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
  const loadAllFn = () => Promise.all([
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
    loadAll: loadAllFn,
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
