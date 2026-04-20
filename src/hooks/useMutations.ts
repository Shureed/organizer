import { supabase } from '../lib/supabase'
import { optimistic } from './useOptimistic'
import type { Database } from '../types/database.types'
import type { ActiveTask, InboxItem } from '../store/appState'

type ItemStatus = Database['public']['Enums']['item_status']
type ItemBucket = Database['public']['Enums']['item_bucket']
type PriorityLevel = Database['public']['Enums']['priority_level']
type TaskType = Database['public']['Enums']['task_type']
type ActivityActor = Database['public']['Enums']['activity_actor']
type ItemType = Database['public']['Enums']['item_type']

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

export function useMutations() {
  const changeTaskStatus = (
    id: string,
    status: ItemStatus,
    bucket?: ItemBucket | null,
    date?: string | null,
    priority?: PriorityLevel | null
  ) => {
    const update: Database['public']['Tables']['action_node']['Update'] = {
      status,
      ...(bucket !== undefined ? { bucket } : {}),
      ...(date !== undefined ? { date } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(status === 'done' ? { completed_at: new Date().toISOString() } : {}),
    }

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
        const { error } = await supabase
          .from('action_node')
          .update(update)
          .eq('id', id)
        if (error) throw error
      },
    )
  }

  const archiveInbox = (id: string) =>
    optimistic(
      'inbox',
      (inbox) => inbox.filter((item) => item.id !== id) as InboxItem[],
      async () => {
        const { error } = await supabase
          .from('inbox')
          .update({ archived: true })
          .eq('id', id)
        if (error) throw error
      },
    )

  const togglePin = (id: string, pinned: boolean) =>
    optimistic(
      'inbox',
      (inbox) =>
        inbox.map((item) =>
          item.id === id ? { ...item, pinned } : item
        ) as InboxItem[],
      async () => {
        const { error } = await supabase
          .from('inbox')
          .update({ pinned })
          .eq('id', id)
        if (error) throw error
      },
    )

  const toggleTaskPin = (id: string, pinned: boolean) =>
    optimistic(
      'tasks',
      (tasks) =>
        tasks.map((t) =>
          t.id === id ? { ...t, pinned } : t
        ) as ActiveTask[],
      async () => {
        const { error } = await supabase
          .from('action_node')
          .update({ pinned })
          .eq('id', id)
        if (error) throw error
      },
    )

  const addTask = (task: AddTaskInput) => {
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

    return optimistic(
      'tasks',
      (tasks) => [optimisticRow, ...tasks] as ActiveTask[],
      async () => {
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

  const addInbox = (item: AddInboxInput) => {
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

    return optimistic(
      'inbox',
      (inbox) => [optimisticRow, ...inbox] as InboxItem[],
      async () => {
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
