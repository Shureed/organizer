import { supabase } from '../lib/supabase'
import { useDataLoader } from './useDataLoader'
import type { Database } from '../types/database.types'

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
  const { refreshTasks, refreshInbox } = useDataLoader()

  const changeTaskStatus = async (
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

    const { error } = await supabase
      .from('action_node')
      .update(update)
      .eq('id', id)

    if (error) throw error
    await refreshTasks()
  }

  const archiveInbox = async (id: string) => {
    const { error } = await supabase
      .from('inbox')
      .update({ archived: true })
      .eq('id', id)

    if (error) throw error
    await refreshInbox()
  }

  const markRead = async (id: string) => {
    const { error } = await supabase
      .from('inbox')
      .update({ read: true })
      .eq('id', id)

    if (error) throw error
    await refreshInbox()
  }

  const addTask = async (task: AddTaskInput) => {
    const { error } = await supabase.from('action_node').insert({
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
    await refreshTasks()
  }

  const addInbox = async (item: AddInboxInput) => {
    const { error } = await supabase.from('inbox').insert({
      title: item.title,
      body: item.body ?? null,
      source: item.source ?? 'shortcut',
    })

    if (error) throw error
    await refreshInbox()
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

  return { changeTaskStatus, archiveInbox, markRead, addTask, addInbox, postComment }
}
