/**
 * smoke-slices.mjs — Dev smoke test for all slice loaders (master-P6 PR-C T9.5)
 *
 * Mount in the browser dev console via the window.__smokeSlices() global.
 * Available when VITE_SQLITE_READS === 'true' OR VITE_SYNC_DEBUG === 'true'.
 *
 * Usage (in browser dev console after app loads):
 *   const report = await window.__smokeSlices()
 *   console.table(report)
 *
 * Returns an object like:
 *   {
 *     tasks:           { ok: true,  rows: 12, ms: 4 },
 *     projects:        { ok: true,  rows: 3,  ms: 2 },
 *     closedTasks:     { ok: true,  rows: 45, ms: 6 },
 *     closedProjects:  { ok: true,  rows: 2,  ms: 1 },
 *     inbox:           { ok: true,  rows: 7,  ms: 3 },
 *     chainStatus:     { ok: true,  rows: 1,  ms: 2 },
 *     pinnedDoneTasks: { ok: true,  rows: 0,  ms: 1 },
 *     recentItems:     { ok: true,  rows: 25, ms: 3 },
 *     sqliteAvailable: true,
 *     flagOn:          true,
 *   }
 *
 * Each slice result:
 *   ok:   true = loaded without error; false = threw
 *   rows: number of rows returned by the SQLite view/table query
 *   ms:   elapsed time in milliseconds
 *   err:  error message if ok === false
 *
 * This script is designed to be pasted into the browser console or imported
 * via a Vite dev-server import.  It does NOT run any mutations.
 *
 * The 7 auth-dependent smoke tests from PR attempt #33 are replicated below as
 * a checklist for manual verification — they require an authenticated session.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Mount the global at module evaluation time (called by the app entry in DEV)
// ─────────────────────────────────────────────────────────────────────────────

async function smokeSlices() {
  // Lazily import SQLite client so this script can be pasted into the console
  // without a build step (uses the same dynamic import path as the app).
  const { query, isSqliteAvailable } = await import('/organizer/src/sync/client.ts')

  const flagOn = import.meta?.env?.VITE_SQLITE_READS === 'true'
  let sqliteAvailable = false
  try {
    sqliteAvailable = await isSqliteAvailable()
  } catch {
    sqliteAvailable = false
  }

  const slices = [
    {
      name: 'tasks',
      sql: `SELECT COUNT(*) AS n FROM v_active_tasks`,
    },
    {
      name: 'projects',
      sql: `SELECT COUNT(*) AS n FROM v_active_projects`,
    },
    {
      name: 'closedTasks',
      sql: `SELECT COUNT(*) AS n FROM action_node WHERE status IN ('done','cancelled') AND archived=0 AND type!='project' AND _deleted=0`,
    },
    {
      name: 'closedProjects',
      sql: `SELECT COUNT(*) AS n FROM action_node WHERE type='project' AND status IN ('done','cancelled') AND archived=0 AND _deleted=0`,
    },
    {
      name: 'inbox',
      sql: `SELECT COUNT(*) AS n FROM v_new_inbox`,
    },
    {
      name: 'chainStatus',
      sql: `SELECT COUNT(*) AS n FROM v_chain_status`,
    },
    {
      name: 'pinnedDoneTasks',
      sql: `SELECT COUNT(*) AS n FROM action_node WHERE pinned=1 AND status='done' AND archived=0 AND _deleted=0`,
    },
    {
      name: 'recentItems',
      sql: `SELECT COUNT(*) AS n FROM action_node WHERE archived=0 AND _deleted=0`,
    },
  ]

  const results = {}

  for (const slice of slices) {
    const t0 = performance.now()
    try {
      const rows = await query(slice.sql)
      const ms = Math.round(performance.now() - t0)
      const n = rows[0]?.n ?? 0
      results[slice.name] = { ok: true, rows: n, ms }
      console.log(`[smoke] ${slice.name.padEnd(16)} ok  rows=${n}  ${ms}ms`)
    } catch (err) {
      const ms = Math.round(performance.now() - t0)
      results[slice.name] = { ok: false, rows: 0, ms, err: String(err) }
      console.error(`[smoke] ${slice.name.padEnd(16)} FAIL ${ms}ms`, err)
    }
  }

  // Also verify join cols are populated on active tasks.
  try {
    const joinCheck = await query(
      `SELECT COUNT(*) AS n FROM action_node
        WHERE archived=0
          AND status NOT IN ('done','cancelled')
          AND type!='project'
          AND _deleted=0
          AND project_name IS NULL
          AND space_name IS NULL
          AND space_path IS NULL`
    )
    const nullJoinRows = joinCheck[0]?.n ?? 0
    const totalActive = results['tasks']?.rows ?? 0
    results['joinColsPopulated'] = {
      ok: true,
      nullJoinRows,
      totalActive,
      pctPopulated: totalActive > 0
        ? Math.round((1 - nullJoinRows / totalActive) * 100) + '%'
        : 'n/a (no active tasks)',
    }
    if (nullJoinRows > 0 && totalActive > 0) {
      console.warn(
        `[smoke] joinColsPopulated  WARNING: ${nullJoinRows}/${totalActive} active tasks have NULL join cols.`,
        'Run initialSync() to repopulate.',
      )
    } else {
      console.log(`[smoke] joinColsPopulated  ok  all active tasks have join cols`)
    }
  } catch (err) {
    results['joinColsPopulated'] = { ok: false, err: String(err) }
    console.error('[smoke] joinColsPopulated  FAIL', err)
  }

  results['sqliteAvailable'] = sqliteAvailable
  results['flagOn'] = flagOn

  const allOk = Object.values(results).every((r) =>
    typeof r === 'boolean' ? true : r.ok !== false,
  )
  console.log(
    allOk
      ? '[smoke] ALL PASSED — SQLite slice loaders operational'
      : '[smoke] SOME FAILURES — check results above',
  )

  return results
}

// Mount globally so it survives HMR and can be called from the console.
if (typeof window !== 'undefined') {
  window.__smokeSlices = smokeSlices
  if (import.meta?.env?.VITE_SYNC_DEBUG === 'true' || import.meta?.env?.VITE_SQLITE_READS === 'true') {
    console.info('[smoke-slices] window.__smokeSlices() registered — call it in the console to run slice smoke tests')
  }
}

export { smokeSlices }

/**
 * ─── Manual auth-dependent smoke tests (reproduce from PR #33) ───────────────
 *
 * These require a logged-in session and cannot be automated. Run in sequence
 * after app loads and SQLite bootstrap completes (watch for "[App] SQLite
 * bootstrap" log in the console).
 *
 * 1. ONLINE COLD BOOT
 *    - Clear OPFS: DevTools → Application → Storage → Origin Private File System → delete
 *    - Reload app while online
 *    - Expected: console shows "[sync] boot Xms", "[App] SQLite bootstrap", then
 *      Today / Calendar / Issues / Inbox / Recents all render data.
 *    - Run: await window.__smokeSlices()  → all ok, rows > 0 for tasks/projects/inbox
 *
 * 2. WARM OPFS READ
 *    - Reload app (OPFS already populated)
 *    - Expected: UI renders immediately from SQLite without any network waterfall
 *      to /rest/v1/ views in the Network tab.
 *
 * 3. JOIN COLS POPULATED
 *    - Run: await window.__smokeSlices()
 *    - Expected: joinColsPopulated.nullJoinRows === 0
 *    - Confirms project_name / space_name / space_path are not NULL on active tasks.
 *
 * 4. AIRPLANE MODE READ
 *    - Go offline (DevTools → Network → Offline)
 *    - Reload app
 *    - Expected: all 5 views render last-known SQLite data; no "No tasks" empty states.
 *
 * 5. OFFLINE MUTATION
 *    - While offline: complete a task (status → done)
 *    - Expected: task disappears from Today view immediately (optimistic)
 *    - Check _outbox: await (await window.__smokeSlices(), query('SELECT * FROM _outbox'))
 *      → 1 pending entry with op='update'
 *
 * 6. OUTBOX REPLAY
 *    - Go back online
 *    - Expected: _outbox drains within 5 s; Supabase Studio confirms the update landed.
 *    - Check: await (await import('/organizer/src/sync/outbox.ts')).pendingCount() → 0
 *
 * 7. REALTIME DIRECT APPLY
 *    - From another tab or Supabase Studio: update a task name
 *    - Expected: the task name updates in the UI within ~1 s (< 1 s target from plan §2)
 *      WITHOUT a Network request to /rest/v1/v_active_tasks visible in DevTools.
 *    - Check: await query('SELECT name FROM action_node WHERE id=?', [taskId])
 *      → shows updated name from the realtime payload.
 */
