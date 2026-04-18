import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/appState'

// Module-scoped dedup map
const lastFetchedAt = new Map<string, number>()
const DEDUP_MS = 200

export function useDataLoader() {
  const setData = useAppStore((s) => s.setData)

  // Per-slice loaders
  const loadTasks = async (force = false) => {
    const key = 'tasks'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('v_active_tasks')
      .select('*')
      .order('date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    setData({ tasks: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  const loadProjects = async (force = false) => {
    const key = 'projects'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('v_active_projects')
      .select('*')
      .order('name', { ascending: true })

    setData({ projects: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  const loadClosedTasks = async (force = false) => {
    const key = 'closedTasks'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('action_node')
      .select('*')
      .in('status', ['done', 'cancelled'])
      .eq('archived', false)
      .neq('type', 'project')

    setData({ closedTasks: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  const loadClosedProjects = async (force = false) => {
    const key = 'closedProjects'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('action_node')
      .select('*')
      .eq('type', 'project')
      .in('status', ['done', 'cancelled'])
      .eq('archived', false)

    setData({ closedProjects: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  const loadInbox = async (force = false) => {
    const key = 'inbox'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('v_new_inbox')
      .select('*')
      .order('created_at', { ascending: false })

    setData({ inbox: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  const loadChainStatus = async (force = false) => {
    const key = 'chainStatus'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('v_chain_status')
      .select('*')

    setData({ chainStatus: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  const loadPinnedDoneTasks = async (force = false) => {
    const key = 'pinnedDoneTasks'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('action_node')
      .select('*')
      .eq('pinned', true)
      .eq('status', 'done')
      .eq('archived', false)
      .order('created_at', { ascending: true })

    setData({ pinnedDoneTasks: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  const loadRecentItems = async (force = false) => {
    const key = 'recentItems'
    if (!force && Date.now() - (lastFetchedAt.get(key) ?? 0) < DEDUP_MS) return

    const { data } = await supabase
      .from('action_node')
      .select('id, name, status, updated_at, type, priority')
      .eq('archived', false)
      .order('updated_at', { ascending: false })
      .limit(25)

    setData({ recentItems: data ?? [] })
    lastFetchedAt.set(key, Date.now())
  }

  // Recomposed refresh functions
  const refreshTasks = () => Promise.all([
    loadTasks(true),
    loadProjects(true),
    loadClosedTasks(true),
    loadPinnedDoneTasks(true),
    loadRecentItems(true),
    loadChainStatus(true),
  ])

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

export function useAutoRefresh(interval = 30000) {
  const { loadAll } = useDataLoader()
  const loadAllRef = useRef(loadAll)
  loadAllRef.current = loadAll

  useEffect(() => {
    const id = setInterval(() => loadAllRef.current(), interval)
    return () => clearInterval(id)
  }, [interval])
}
