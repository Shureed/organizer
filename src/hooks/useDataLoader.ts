import { supabase } from '../lib/supabase'
import { useAppStore, useErrorStore } from '../store/appState'
import { isSqliteAvailable } from '../sync/client'
import {
  sqliteTasks,
  sqliteProjects,
  sqliteClosedTasks,
  sqliteClosedProjects,
  sqliteInbox,
  sqlitePinnedDoneTasks,
  sqlitePinnedAll,
  sqliteRecentItems,
  getComments,
} from '../sync/queries'
import type { CommentRow } from '../components/shared/CommentSection'

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
const getSetLoadError = () => useErrorStore.getState().setLoadError

export async function loadTasks(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteTasks()

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
  if (await sqliteReady()) return sqliteProjects()

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
  if (await sqliteReady()) return sqliteClosedTasks()

  const key = 'closedTasks'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('*')
    .in('status', ['done', 'cancelled'])
    .eq('archived', false)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .neq('type' as any, 'project')

  if (error) throw error
  getSetData()({ closedTasks: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadClosedProjects(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteClosedProjects()

  const key = 'closedProjects'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('*')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .eq('type' as any, 'project')
    .in('status', ['done', 'cancelled'])
    .eq('archived', false)

  if (error) throw error
  getSetData()({ closedProjects: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadInbox(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteInbox()

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

export async function loadPinnedDoneTasks(force = false): Promise<void> {
  if (await sqliteReady()) return sqlitePinnedDoneTasks()

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

export async function loadPinnedAll(force = false): Promise<void> {
  if (await sqliteReady()) return sqlitePinnedAll()

  const key = 'pinnedAll'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('*')
    .eq('pinned', true)
    .eq('archived', false)
    .order('created_at', { ascending: true })

  if (error) throw error
  getSetData()({ pinnedAll: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadActiveContainers(force = false): Promise<void> {
  const key = 'activeContainers'
  if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

  const { data, error } = await supabase
    .from('action_node')
    .select('*')
    .in('type', ['improvement', 'feature', 'bug', 'idea'])
    .eq('status', 'in_progress')
    .eq('archived', false)
    .order('updated_at', { ascending: false })

  if (error) throw error
  getSetData()({ activeContainers: data ?? [] })
  lastFetchedAt.set(key, Date.now())
}

export async function loadRecentItems(force = false): Promise<void> {
  if (await sqliteReady()) return sqliteRecentItems()

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
  | 'pinnedAll'
  | 'recentItems'
  | 'inbox'
  | 'activeContainers'

/**
 * Central slice loader dispatch with per-slice error catch (T9 plan §T9.5).
 *
 * Every loader is wrapped so a silent rejection never masks UI breakage.
 * Logs [sliceLoader:<name>] failed with the error when a slice fails.
 * This is the check that would have caught the original PR-C bug (empty slices
 * with no visible error).
 */
export const sliceLoaders: Record<SliceKey, (force?: boolean) => Promise<void>> = {
  tasks: (f) => loadTasks(f).catch((e) => console.error('[sliceLoader:tasks] failed', e)),
  projects: (f) => loadProjects(f).catch((e) => console.error('[sliceLoader:projects] failed', e)),
  closedTasks: (f) => loadClosedTasks(f).catch((e) => console.error('[sliceLoader:closedTasks] failed', e)),
  closedProjects: (f) => loadClosedProjects(f).catch((e) => console.error('[sliceLoader:closedProjects] failed', e)),
  pinnedDoneTasks: (f) => loadPinnedDoneTasks(f).catch((e) => console.error('[sliceLoader:pinnedDoneTasks] failed', e)),
  pinnedAll: (f) => loadPinnedAll(f).catch((e) => console.error('[sliceLoader:pinnedAll] failed', e)),
  recentItems: (f) => loadRecentItems(f).catch((e) => console.error('[sliceLoader:recentItems] failed', e)),
  inbox: (f) => loadInbox(f).catch((e) => console.error('[sliceLoader:inbox] failed', e)),
  activeContainers: (f) => loadActiveContainers(f).catch((e) => console.error('[sliceLoader:activeContainers] failed', e)),
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
    loadPinnedDoneTasks(true),
    loadPinnedAll(true),
    loadRecentItems(true),
    loadActiveContainers(true),
  ])
}

// ── Per-view composers ──────────────────────────────────────────────────────────────
// Stable module-level exports. Slice loaders dedup within 200ms so shell seed +
// view loader co-firing collapses to one request per slice.

export const loadShellSeed = (): Promise<void> => loadTasks()

export const loadTodayView = (): Promise<unknown> =>
  Promise.all([loadTasks(), loadProjects(), loadPinnedDoneTasks(), loadPinnedAll(), loadActiveContainers()])

export const loadCalendarView = (): Promise<unknown> =>
  Promise.all([loadTasks(), loadClosedTasks()])

export const loadIssuesView = (): Promise<unknown> =>
  Promise.all([loadTasks(), loadActiveContainers()])

export const loadRecentsView = (): Promise<void> => loadRecentItems()

export const loadInboxView = (): Promise<void> => loadInbox()

// ── useDataLoader hook ──────────────────────────────────────────────────────────────
// Provides forced-refresh variants and the loadAll escape hatch for mutations.
export function useDataLoader() {
  // Recomposed refresh functions (force = true bypasses dedup)
  const refreshTasks = (): Promise<unknown> =>
    Promise.all([
      loadTasks(true),
      loadProjects(true),
      loadClosedTasks(true),
      loadPinnedDoneTasks(true),
      loadPinnedAll(true),
      loadRecentItems(true),
    ])

  const refreshInbox = () => loadInbox(true)

  // Load all slices (rollback escape hatch)
  const loadAllFn = () => Promise.all([
    loadTasks(true),
    loadProjects(true),
    loadClosedTasks(true),
    loadClosedProjects(true),
    loadInbox(true),
    loadPinnedDoneTasks(true),
    loadPinnedAll(true),
    loadRecentItems(true),
    loadActiveContainers(true),
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
    loadPinnedDoneTasks,
    loadPinnedAll,
    loadRecentItems,
    loadActiveContainers,
  }
}

// ── Comments slice (per-entity dynamic loader) ───────────────────────────────
// Comments are keyed on (entity_type, entity_id), so a static SliceKey-style
// entry doesn't fit.  Instead we keep a per-key cache + subscriber map so
// useComments can subscribe, and realtime (T1 invalidateComments) can force
// a refetch via invalidateCommentsFor(entityType, entityId).

type CommentsSliceKey = string // `${entity_type}:${entity_id}`

const commentsCache = new Map<CommentsSliceKey, CommentRow[]>()
const commentsSubs = new Map<CommentsSliceKey, Set<() => void>>()

function commentsKey(entityType: string, entityId: string): CommentsSliceKey {
  return `${entityType}:${entityId}`
}

function notifyCommentsSubs(key: CommentsSliceKey): void {
  const subs = commentsSubs.get(key)
  if (!subs) return
  for (const fn of subs) fn()
}

export function subscribeComments(
  entityType: string,
  entityId: string,
  fn: () => void,
): () => void {
  const key = commentsKey(entityType, entityId)
  let set = commentsSubs.get(key)
  if (!set) {
    set = new Set()
    commentsSubs.set(key, set)
  }
  set.add(fn)
  return () => {
    set!.delete(fn)
    if (set!.size === 0) commentsSubs.delete(key)
  }
}

export function getCommentsCache(
  entityType: string,
  entityId: string,
): CommentRow[] | undefined {
  return commentsCache.get(commentsKey(entityType, entityId))
}

/** Load comments for a single entity; SQLite when available, REST otherwise. */
export async function commentsFor(
  entityType: string,
  entityId: string,
): Promise<CommentRow[]> {
  const key = commentsKey(entityType, entityId)

  let rows: CommentRow[]
  if (await sqliteReady()) {
    const dbRows = await getComments(entityType, entityId)
    rows = dbRows.map((r) => ({
      id: r.id,
      actor: r.actor,
      body: r.body,
      created_at: r.created_at,
    }))
  } else {
    const { data } = await supabase
      .from('comments')
      .select('id, actor, body, created_at')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .eq('entity_type' as any, entityType)
      .eq('entity_id', entityId)
      .order('created_at', { ascending: true })
    rows = (data ?? []) as CommentRow[]
  }

  commentsCache.set(key, rows)
  notifyCommentsSubs(key)
  return rows
}

/**
 * Realtime-triggered invalidation for a per-entity comments slice.
 * Called from useRealtime (T1 invalidateComments) after the SQLite apply.
 */
export function invalidateCommentsFor(
  entityType: string,
  entityId: string,
): Promise<CommentRow[]> {
  return commentsFor(entityType, entityId)
}
