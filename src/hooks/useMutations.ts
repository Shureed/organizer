import { supabase } from '../lib/supabase'
import { optimistic } from './useOptimistic'
import { isSqliteAvailable, mutate as sqliteMutate } from '../sync/client'
import { enqueue, triggerReplay } from '../sync/outbox'
import type { OutboxEntry } from '../sync/outbox'
import type { Database } from '../types/database.types'
import type { ActiveTask, InboxItem } from '../store/appState'

type ItemStatus = Database['public']['Enums']['item_status']
type ItemBucket = Database['public']['Enums']['item_bucket']
type PriorityLevel = Database['public']['Enums']['priority_level']
type TaskType = Database['public']['Enums']['task_type']
type ActivityActor = Database['public']['Enums']['activity_actor']
type ItemType = Database['public']['Enums']['item_type']

// ── Flag helpers ─────────────────────────────────────────────────────────────

const SQLITE_FLAG = import.meta.env.VITE_SQLITE_READS === 'true'

let _sqliteAvailablePromise: Promise<boolean> | null = null
function sqliteReady(): Promise<boolean> {
  if (!SQLITE_FLAG) return Promise.resolve(false)
  return (_sqliteAvailablePromise ??= isSqliteAvailable())
}

// ── Local write helpers ───────────────────────────────────────────────────────

/**
 * Write an optimistic row into the local SQLite table and enqueue the
 * mutation for outbox replay.  Kicks replay immediately if online.
 *
 * The `patch` SQL must write the full post-mutation state including
 * _dirty = 1 so the LWW guard in pull.ts does not overwrite it.
 */
async function localWrite(
  patchSql: string,
  patchParams: unknown[],
  outboxEntry: OutboxEntry,
): Promise<void> {
  await sqliteMutate(patchSql, patchParams as never[])
  await enqueue(outboxEntry)
  if (navigator.onLine) void triggerReplay()
}

// ── Public input interfaces ───────────────────────────────────────────────────

export interface AddTaskInput {
  name: string
  type?: TaskType
  status?: ItemStatus
  parent_id?: string | null
  space_id?: string | null
  date?: string | null
  body?: string | null
  bucket?: ItemBucket | null
  priority?: PriorityLevel | null
}

export interface AddInboxInput {
  title: string
  body?: string | null
  source?: Database['public']['Enums']['inbox_source']
}

export interface PostCommentInput {
  entity_type: ItemType
  entity_id: string
  actor: ActivityActor
  body: string
}

// ── useMutations ──────────────────────────────────────────────────────────────

export function useMutations() {
  const changeTaskStatus = async (
    id: string,
    status: ItemStatus,
    bucket?: ItemBucket | null,
    date?: string | null,
    priority?: PriorityLevel | null,
  ) => {
    const update: Database['public']['Tables']['action_node']['Update'] = {
      status,
      ...(bucket !== undefined ? { bucket } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(status === 'done' ? { completed_at: new Date().toISOString() } : {}),
    }

    const useSQLite = await sqliteReady()

    return optimistic(
      'tasks',
      (tasks) =>
        tasks.map((t) =>
          t.id === id
            ? {
                ...t,
                status,
                ...(bucket !== undefined ? { bucket } : {}),
                ...(date !== undefined ? { date } : {}),
                ...(priority !== undefined ? { priority } : {}),
                ...(status === 'done' ? { completed_at: new Date().toISOString() } : {}),
              }
            : t
        ) as ActiveTask[],
      async () => {
        if (useSQLite) {
          const fields: string[] = ['status = ?', '_dirty = 1', 'updated_at = ?']
          const vals: unknown[] = [status, new Date().toISOString()]
          if (bucket !== undefined) { fields.push('bucket = ?'); vals.push(bucket) }
          if (date !== undefined) { fields.push('date = ?'); vals.push(date) }
          if (priority !== undefined) { fields.push('priority = ?'); vals.push(priority) }
          if (status === 'done') { fields.push('completed_at = ?'); vals.push(new Date().toISOString()) }
          vals.push(id)
          await localWrite(
            `UPDATE action_node SET ${fields.join(', ')} WHERE id = ?`,
            vals,
            { id: crypto.randomUUID(), table_name: 'action_node', row_id: id, op: 'update', payload: update },
          )
          return
        }
        const { error } = await supabase
          .from('action_node')
          .update(update)
          .eq('id', id)
        if (error) throw error
      },
    )
  }

  const archiveInbox = async (id: string) => {
    const useSQLite = await sqliteReady()

    return optimistic(
      'inbox',
      (inbox) => inbox.filter((item) => item.id !== id) as InboxItem[],
      async () => {
        if (useSQLite) {
          await localWrite(
            `UPDATE inbox SET archived = 1, _dirty = 1, updated_at = ? WHERE id = ?`,
            [new Date().toISOString(), id],
            { id: crypto.randomUUID(), table_name: 'inbox', row_id: id, op: 'update', payload: { archived: true } },
          )
          return
        }
        const { error } = await supabase
          .from('inbox')
          .update({ archived: true })
          .eq('id', id)
        if (error) throw error
      },
    )
  }

  const togglePin = async (id: string, pinned: boolean) => {
    const useSQLite = await sqliteReady()

    return optimistic(
      'inbox',
      (inbox) =>
        inbox.map((item) =>
          item.id === id ? { ...item, pinned } : item
        ) as InboxItem[],
      async () => {
        if (useSQLite) {
          await localWrite(
            `UPDATE inbox SET pinned = ?, _dirty = 1, updated_at = ? WHERE id = ?`,
            [pinned ? 1 : 0, new Date().toISOString(), id],
            { id: crypto.randomUUID(), table_name: 'inbox', row_id: id, op: 'update', payload: { pinned } },
          )
          return
        }
        const { error } = await supabase
          .from('inbox')
          .update({ pinned })
          .eq('id', id)
        if (error) throw error
      },
    )
  }

  const toggleTaskPin = async (id: string, pinned: boolean) => {
    const useSQLite = await sqliteReady()

    return optimistic(
      'tasks',
      (tasks) =>
        tasks.map((t) =>
          t.id === id ? { ...t, pinned } : t
        ) as ActiveTask[],
      async () => {
        if (useSQLite) {
          await localWrite(
            `UPDATE action_node SET pinned = ?, _dirty = 1, updated_at = ? WHERE id = ?`,
            [pinned ? 1 : 0, new Date().toISOString(), id],
            { id: crypto.randomUUID(), table_name: 'action_node', row_id: id, op: 'update', payload: { pinned } },
          )
          return
        }
        const { error } = await supabase
          .from('action_node')
          .update({ pinned })
          .eq('id', id)
        if (error) throw error
      },
    )
  }

  const addTask = async (task: AddTaskInput) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimisticRow: ActiveTask = {
      id,
      name: task.name,
      type: task.type ?? 'task',
      status: task.status ?? 'open',
      parent_id: task.parent_id ?? null,
      space_id: task.space_id ?? null,
      date: task.date ?? null,
      body: task.body ?? null,
      bucket: task.bucket ?? null,
      priority: task.priority ?? null,
      created_at: now,
      updated_at: now,
      completed_at: null,
      archived: false,
      pinned: false,
      git_backed: false,
      git_pr_url: null,
      project_name: null,
      space_name: null,
      space_path: null,
      user_id: null,
    }

    const useSQLite = await sqliteReady()

    return optimistic(
      'tasks',
      (tasks) => [optimisticRow, ...tasks] as ActiveTask[],
      async () => {
        if (useSQLite) {
          await localWrite(
            `INSERT OR IGNORE INTO action_node
              (id, name, type, status, parent_id, space_id, date, body, bucket, priority,
               created_at, updated_at, archived, pinned, git_backed, _dirty, _deleted)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 0)`,
            [id, task.name, task.type ?? 'task', task.status ?? 'open',
             task.parent_id ?? null, task.space_id ?? null, task.date ?? null,
             task.body ?? null, task.bucket ?? null, task.priority ?? null, now, now],
            {
              id: crypto.randomUUID(),
              table_name: 'action_node',
              row_id: id,
              op: 'insert',
              payload: {
                id,
                name: task.name,
                type: task.type ?? 'task',
                status: task.status ?? 'open',
                parent_id: task.parent_id ?? null,
                space_id: task.space_id ?? null,
                date: task.date ?? null,
                body: task.body ?? null,
                bucket: task.bucket ?? null,
                priority: task.priority ?? null,
              },
            },
          )
          return
        }
        const { error } = await supabase.from('action_node').insert({
          id,
          name: task.name,
          type: task.type ?? 'task',
          status: task.status ?? 'open',
          parent_id: task.parent_id ?? null,
          space_id: task.space_id ?? null,
          date: task.date ?? null,
          body: task.body ?? null,
          bucket: task.bucket ?? null,
          priority: task.priority ?? null,
        })
        if (error) throw error
      },
    )
  }

  const addInbox = async (item: AddInboxInput) => {
    const id = crypto.randomUUID()
    const now = new Date().toISOString()
    const optimisticRow: InboxItem = {
      id,
      title: item.title,
      body: item.body ?? null,
      source: item.source ?? 'shortcut',
      created_at: now,
      archived: false,
      pinned: false,
      read: false,
      item_id: null,
      item_type: null,
      user_id: null,
    }

    const useSQLite = await sqliteReady()

    return optimistic(
      'inbox',
      (inbox) => [optimisticRow, ...inbox] as InboxItem[],
      async () => {
        if (useSQLite) {
          await localWrite(
            `INSERT OR IGNORE INTO inbox
              (id, title, body, source, created_at, updated_at, archived, read, pinned, _dirty, _deleted)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 1, 0)`,
            [id, item.title, item.body ?? null, item.source ?? 'shortcut', now, now],
            {
              id: crypto.randomUUID(),
              table_name: 'inbox',
              row_id: id,
              op: 'insert',
              payload: {
                id,
                title: item.title,
                body: item.body ?? null,
                source: item.source ?? 'shortcut',
              },
            },
          )
          return
        }
        const { error } = await supabase.from('inbox').insert({
          id,
          title: item.title,
          body: item.body ?? null,
          source: item.source ?? 'shortcut',
        })
        if (error) throw error
      },
    )
  }

  const postComment = async (comment: PostCommentInput) => {
    const useSQLite = await sqliteReady()

    if (useSQLite) {
      const id = crypto.randomUUID()
      const now = new Date().toISOString()
      // Insert locally (append-only; no conflict path)
      await sqliteMutate(
        `INSERT OR IGNORE INTO comments
          (id, entity_type, entity_id, actor, body, created_at, _synced_at, _dirty)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [id, comment.entity_type, comment.entity_id, comment.actor, comment.body, now, Date.now()] as never[],
      )
      await enqueue({
        id: crypto.randomUUID(),
        table_name: 'comments',
        row_id: id,
        op: 'insert',
        payload: {
          id,
          entity_type: comment.entity_type,
          entity_id: comment.entity_id,
          actor: comment.actor,
          body: comment.body,
        },
      })
      if (navigator.onLine) void triggerReplay()
      return
    }

    const { error } = await supabase.from('comments').insert({
      entity_type: comment.entity_type,
      entity_id: comment.entity_id,
      actor: comment.actor,
      body: comment.body,
    })
    if (error) throw error
  }

  return { changeTaskStatus, archiveInbox, togglePin, toggleTaskPin, addTask, addInbox, postComment }
}
