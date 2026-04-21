import { useState, useCallback, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useMutations } from './useMutations'
import { useDataLoader } from './useDataLoader'
import type { CommentRow } from '../components/shared/CommentSection'
import type { Database } from '../types/database.types'

type ItemStatus = Database['public']['Enums']['item_status']
type ItemBucket = Database['public']['Enums']['item_bucket']
type PriorityLevel = Database['public']['Enums']['priority_level']

export interface TaskRow {
  id: string
  name: string
  status: ItemStatus | null
  date: string | null
  priority: PriorityLevel | null
  bucket: ItemBucket | null
  body: string | null
  parent_id: string | null
  type: string
  pinned: boolean
  git_pr_url: string | null
}

export interface SubtaskRow {
  id: string
  name: string
  status: ItemStatus | null
}

export interface RelatedItem {
  link_id: string
  entity_type: string
  entity_id: string
  direction: string
  name: string
  display_type: string
}

export interface UseTaskDetailResult {
  task: TaskRow | null
  subtasks: SubtaskRow[]
  comments: CommentRow[]
  related: RelatedItem[]
  parentNode: { id: string; name: string; type: string } | null
  loading: boolean
  saving: boolean
  pinning: boolean
  error: string | null

  ui: {
    status: ItemStatus
    date: string
    priority: string
    bucket: string
    commentBody: string
    submittingComment: boolean
    relatedOpen: boolean
    activeTaskId: string | null
    isDateSet: boolean
    setStatus: (v: ItemStatus) => void
    setDate: (v: string) => void
    setPriority: (v: string) => void
    setBucket: (v: string) => void
    setCommentBody: (v: string) => void
    setRelatedOpen: (updater: boolean | ((prev: boolean) => boolean)) => void
    setActiveTaskId: (id: string | null) => void
  }

  actions: {
    fetchTask: (id: string) => Promise<void>
    handleUpdate: (onClose: () => void) => Promise<void>
    handleCommentSubmit: (scrollToBottom: () => void) => Promise<void>
    handleTogglePin: () => Promise<void>
  }
}

export function useTaskDetail(taskId: string | null): UseTaskDetailResult {
  const [task, setTask] = useState<TaskRow | null>(null)
  const [subtasks, setSubtasks] = useState<SubtaskRow[]>([])
  const [comments, setComments] = useState<CommentRow[]>([])
  const [related, setRelated] = useState<RelatedItem[]>([])
  const [relatedOpen, setRelatedOpen] = useState(false)
  const [parentNode, setParentNode] = useState<{ id: string; name: string; type: string } | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pinning, setPinning] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [status, setStatus] = useState<ItemStatus>('open')
  const [date, setDate] = useState('')
  const [priority, setPriority] = useState('')
  const [bucket, setBucket] = useState('')

  const [commentBody, setCommentBody] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  const [activeTaskId, setActiveTaskId] = useState<string | null>(taskId)

  const { changeTaskStatus, postComment, toggleTaskPin } = useMutations()
  const { refreshTasks } = useDataLoader()

  const fetchTask = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [taskRes, subtasksRes, commentsRes] = await Promise.all([
        supabase.from('action_node').select('*').eq('id', id).single(),
        supabase
          .from('action_node')
          .select('id, name, status')
          .eq('parent_id', id)
          .eq('archived', false)
          .order('status', { ascending: true })
          .order('created_at', { ascending: true }),
        supabase
          .from('comments')
          .select('id, actor, body, created_at')
          .eq('entity_type', 'task')
          .eq('entity_id', id)
          .order('created_at', { ascending: true }),
      ])

      if (taskRes.error) throw taskRes.error
      const t = taskRes.data as TaskRow
      setTask(t)
      setStatus(t.status ?? 'open')
      setDate(t.date ?? '')
      setPriority(t.priority ?? '')
      setBucket(t.bucket ?? '')
      setSubtasks((subtasksRes.data ?? []) as SubtaskRow[])
      setComments((commentsRes.data ?? []) as CommentRow[])

      if (t.parent_id) {
        const { data: parentData } = await supabase
          .from('action_node')
          .select('id, name, type')
          .eq('id', t.parent_id)
          .single()
        setParentNode(parentData ? { id: parentData.id, name: parentData.name ?? '', type: parentData.type ?? '' } : null)
      } else {
        setParentNode(null)
      }

      // All action_node items are stored as item_type 'task' in related_items
      const { data: rawRelated, error: relatedErr } = await supabase.rpc('fn_related', {
        p_type: 'task' as 'task',
        p_id: id,
      })
      if (relatedErr) console.error('fn_related error:', relatedErr)
      const relatedRows = (rawRelated ?? []) as Array<{
        link_id: string; entity_type: string; entity_id: string; direction: string
      }>
      if (relatedRows.length > 0) {
        // All action_node items (tasks, projects, bugs, etc.) are stored as entity_type='task'
        // Fetch actual name + type from action_node for all of them
        const nodeIds = relatedRows.map(r => r.entity_id)
        const nameMap: Record<string, string> = {}
        const typeMap: Record<string, string> = {}
        const { data: nameData } = await supabase
          .from('action_node')
          .select('id, name, type')
          .in('id', nodeIds)
        ;(nameData ?? []).forEach(n => {
          nameMap[n.id] = n.name ?? n.id
          typeMap[n.id] = n.type ?? 'task'
        })
        // Inbox items live in the inbox table, not action_node — fetch their titles separately
        const inboxIds = relatedRows.filter(r => r.entity_type === 'inbox').map(r => r.entity_id)
        if (inboxIds.length > 0) {
          const { data: inboxData } = await supabase
            .from('inbox')
            .select('id, title, body')
            .in('id', inboxIds)
          ;(inboxData ?? []).forEach(i => {
            nameMap[i.id] = i.title || (i.body?.slice(0, 50) ?? i.id)
            typeMap[i.id] = 'inbox'
          })
        }
        setRelated(relatedRows.map(r => ({
          ...r,
          name: nameMap[r.entity_id] ?? r.entity_type,
          display_type: typeMap[r.entity_id] ?? r.entity_type,
        })))
      } else {
        setRelated([])
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load task')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setActiveTaskId(taskId)
  }, [taskId])

  useEffect(() => {
    if (activeTaskId) {
      fetchTask(activeTaskId)
    }
  }, [activeTaskId, fetchTask])

  const handleUpdate = useCallback(async (onClose: () => void) => {
    if (!activeTaskId) return
    setSaving(true)
    try {
      await changeTaskStatus(
        activeTaskId,
        status,
        (bucket || null) as ItemBucket | null,
        date || null,
        (priority || null) as PriorityLevel | null
      )
      await refreshTasks()
      onClose()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Update failed')
    } finally {
      setSaving(false)
    }
  }, [activeTaskId, status, bucket, date, priority, changeTaskStatus, refreshTasks])

  const handleCommentSubmit = useCallback(async (scrollToBottom: () => void) => {
    if (!activeTaskId || !commentBody.trim()) return
    const body = commentBody.trim()
    const optimistic: CommentRow = {
      id: 'pending',
      actor: 'shureed',
      body,
      created_at: new Date().toISOString(),
      pending: true,
    }
    setComments(prev => [...prev, optimistic])
    setCommentBody('')
    setSubmittingComment(true)
    try {
      await postComment({
        entity_type: 'task',
        entity_id: activeTaskId,
        actor: 'shureed',
        body,
      })
      const { data } = await supabase
        .from('comments')
        .select('id, actor, body, created_at')
        .eq('entity_type', 'task')
        .eq('entity_id', activeTaskId)
        .order('created_at', { ascending: true })
      setComments((data ?? []) as CommentRow[])
      scrollToBottom()
    } catch (e: unknown) {
      setComments(prev => prev.filter(c => c.id !== 'pending'))
      setCommentBody(body)
      setError(e instanceof Error ? e.message : 'Failed to post comment')
    } finally {
      setSubmittingComment(false)
    }
  }, [activeTaskId, commentBody, postComment])

  const handleTogglePin = useCallback(async () => {
    if (!activeTaskId || pinning || !task) return
    setPinning(true)
    try {
      await toggleTaskPin(activeTaskId, !task.pinned)
      await fetchTask(activeTaskId)
    } finally {
      setPinning(false)
    }
  }, [activeTaskId, pinning, task, toggleTaskPin, fetchTask])

  return {
    task,
    subtasks,
    comments,
    related,
    parentNode,
    loading,
    saving,
    pinning,
    error,

    ui: {
      status,
      date,
      priority,
      bucket,
      commentBody,
      submittingComment,
      relatedOpen,
      activeTaskId,
      isDateSet: !!date,
      setStatus,
      setDate,
      setPriority,
      setBucket,
      setCommentBody,
      setRelatedOpen,
      setActiveTaskId,
    },

    actions: {
      fetchTask,
      handleUpdate,
      handleCommentSubmit,
      handleTogglePin,
    },
  }
}
