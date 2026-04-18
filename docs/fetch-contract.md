# Fetch Contract — Post-P2

This document specifies the data loading, refresh, and search indexing patterns that P2 established. P4 realtime invalidation will hook into these contracts; P5 optimistic mutations will replace post-mutation refetches with this schema as reference.

## Per-View Slice Mapping

Each view loads a specific set of slices via a per-view composer function. Slices are deduplicated at the module level: two requests for the same slice within 200ms result in a single network call.

| View | Slices Fetched | Composer | # Queries (cold) | Notes |
|------|---|---|---|---|
| Shell Seed | `tasks` | `loadShellSeed()` | 1 | Fires in App.tsx on mount before any view mounts. Absorbs co-firing view-loader race via dedup. |
| Today | `tasks`, `projects`, `chainStatus`, `pinnedDoneTasks` + chain nodes | `loadTodayView()` | 4–5 | Extracts origin IDs from chainStatus, then batches one `.in()` query for all chain nodes per origin (stored in `chainNodesByOrigin`). |
| Calendar | `tasks`, `closedTasks` | `loadCalendarView()` | 2 | |
| Issues | `tasks` | `loadIssuesView()` | 1 | Scoped by client-side filter in view. |
| Recents | `recentItems` | `loadRecentsView()` | 1 | Single query with limit 25; ordered by `updated_at DESC`. |
| Inbox | `inbox` | `loadInboxView()` | 1 | |

**Dedup Behavior:**  
Module-scoped `lastFetchedAt` map tracks the timestamp of the last fetch per slice key (e.g., `'tasks'`, `'projects'`). Before any network call, `loadXxx(force = false)` checks if `Date.now() - lastFetchedAt.get(key) < 200`. If true, returns early; otherwise, fetches and updates the timestamp. Shell seed (`loadShellSeed`) and view loaders can fire simultaneously; the dedup mechanism collapses redundant requests to a single RPC call.

## Refresh Semantics

Mutations trigger explicit refreshes via `refreshTasks()` or `refreshInbox()` to keep state current. The `force:true` parameter bypasses dedup to ensure a fresh network call.

| Mutation | Calls | Covers Slices |
|----------|-------|---|
| `changeTaskStatus(id, status, bucket?, date?, priority?)` | `refreshTasks(force:true)` | tasks, projects, closedTasks, pinnedDoneTasks, recentItems, chainStatus, chainNodes (if origin IDs present) |
| `addTask(input)` | `refreshTasks(force:true)` | tasks, projects, closedTasks, pinnedDoneTasks, recentItems, chainStatus, chainNodes |
| `toggleTaskPin(id, pinned)` | `refreshTasks(force:true)` | tasks, projects, closedTasks, pinnedDoneTasks, recentItems, chainStatus, chainNodes |
| `archiveInbox(id)` | `refreshInbox(force:true)` | inbox |
| `togglePin(id, pinned)` | `refreshInbox(force:true)` | inbox |
| `addInbox(item)` | `refreshInbox(force:true)` | inbox |
| `postComment(…)` | (none) | No refresh; comments are satellite data. |

**Location:** `src/hooks/useMutations.ts` line 37.  
**Refresh Functions:** Defined in `useDataLoader()` hook (lines 179–192).

- **`refreshTasks(force:true)`** (lines 179–190): Calls all 8 slice loaders with `force:true`, then extracts origin IDs from chainStatus and calls `loadChainNodes(ids, force:true)` if non-empty.
- **`refreshInbox(force:true)`** (line 192): Single call to `loadInbox(true)`.

## Auto-Refresh Behaviour

`useAutoRefresh(load, interval = 30000)` provides visibility-gated polling for each view. The hook is instantiated per-view loader at mount time (e.g., `useAutoRefresh(loadTodayView, 30000)` in TodayView).

**Mechanism:**
- Sets up a `setInterval` that fires `load()` every `interval` ms (default 30s).
- Gate: skips execution if `document.hidden === true` (user has switched tabs).
- Foreground catch-up rule: on `visibilitychange` to foreground, if `Date.now() - lastRunAt > interval`, fire immediately.
- Cleanup: clears interval and removes visibility listener on unmount.

**Location:** `src/hooks/useDataLoader.ts` lines 224–239.

## Search Index

The search index is a Fuse.js instance over items computed from slices. Rebuilds are idle-coalesced: multiple slice updates queue one `requestIdleCallback` with a 500ms timeout (Safari fallback: `setTimeout(..., 16)`).

**Flow:**

1. `scheduleSearchRebuild(slice: SliceKey, data: AppData)` (lines 100–113 in `src/hooks/useSearch.ts`):
   - Computes `SearchItem[]` for the slice via `computeSliceItems()`.
   - Stores in module-scoped `itemsBySlice` map.
   - If no rebuild already pending, schedules one via `requestIdleCallback(run, { timeout: 500 })` or `setTimeout(run, 16)`.

2. Rebuild callback (`run` function):
   - Flattens all slices in `itemsBySlice` into a single array.
   - Constructs new Fuse index.
   - Patches store with `searchItems` and `fuseIndex`.

3. **Effect triggers in App.tsx** (lines 208–212):
   - Five slice-keyed effects call `scheduleSearchRebuild` whenever slice data changes.
   - Example: `useEffect(() => { scheduleSearchRebuild('tasks', data) }, [data.tasks])`.
   - All five effects can fire in rapid succession; idle coalescing ensures one Fuse index rebuild.

**Slice Keys:** `'tasks'`, `'projects'`, `'closedTasks'`, `'closedProjects'`, `'inbox'` (type: `SliceKey` in `useSearch.ts` line 20).

## Chain Nodes

Chain nodes are loaded on-demand during Today view load and refreshes. Instead of one query per origin card, a single batched `.in('chain_origin_id', originIds)` query fetches all chain descendants.

**Load Pattern:**

- `loadChainNodes(originIds: string[], force = false)` (lines 129–152 in `useDataLoader.ts`):
  - Skips if `force === false` and within 200ms dedup window (same as other loaders).
  - Fetches from `action_node` table with `.in('chain_origin_id', originIds)` filter.
  - Groups result rows by `chain_origin_id` into `Record<string, ChainNode[]>`.
  - Stores in `chainNodesByOrigin` slice.

- **Called by `loadTodayView()`** (lines 160–164):
  - Executes all base loaders in parallel.
  - Extracts origin IDs: `chainStatus.map(c => c.origin_id).filter(Boolean)`.
  - If non-empty, calls `loadChainNodes(ids)` sequentially after base loaders settle.

- **Called by `refreshTasks(force:true)`** (lines 188–189):
  - After all other slice refreshes, extracts origin IDs and calls `loadChainNodes(ids, force:true)`.

**Store:** `chainNodesByOrigin: Record<string, ChainNode[]>` (type defined in `appState.ts` line 45).

## P4 Contract: Realtime Invalidation Hook

This document defines the shape of each slice and the queries that populate them. P4 realtime will:

- Subscribe to table changes (create/update/delete on `action_node`, `inbox`, views, etc.).
- Invalidate individual slices (e.g., if an `action_node` update affects task status, invalidate `tasks` and `chainStatus` slices).
- Trigger the corresponding slice loader(s) with `force:true` to refetch.
- Re-trigger `scheduleSearchRebuild` for affected slices.

Example: A task status change invalidates `tasks`, `closedTasks` (if now closed), `chainStatus`, `chainNodesByOrigin`, and search slices.

## P5 Contract: Optimistic Mutations

This document specifies which slices each mutation affects. P5 optimistic mutations will:

- Apply local state mutations immediately (e.g., update `tasks` array slice-in-place).
- Dispatch the server request fire-and-forget.
- On error, call `refreshTasks()` or `refreshInbox()` to roll back to server state.

Example: `changeTaskStatus(id, 'done')` optimistically updates the task's status in the `tasks` slice, queues the Supabase update, and rolls back via full `refreshTasks()` on error.
