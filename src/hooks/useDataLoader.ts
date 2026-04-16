import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/appState'

export function useDataLoader() {
  const setData = useAppStore((s) => s.setData)

  const loadAll = async () => {
    const [
      tasksRes,
      projectsRes,
      closedTasksRes,
      closedProjectsRes,
      spacesRes,
      spaceTreeRes,
      inboxRes,
      chainStatusRes,
      pinnedDoneTasksRes,
      recentItemsRes,
    ] = await Promise.all([
      supabase
        .from('v_active_tasks')
        .select('*')
        .order('date', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true }),

      supabase
        .from('v_active_projects')
        .select('*')
        .order('name', { ascending: true }),

      supabase
        .from('action_node')
        .select('*')
        .in('status', ['done', 'cancelled'])
        .eq('archived', false)
        .neq('type', 'project'),

      supabase
        .from('action_node')
        .select('*')
        .eq('type', 'project')
        .in('status', ['done', 'cancelled'])
        .eq('archived', false),

      supabase
        .from('spaces')
        .select('*')
        .eq('archived', false)
        .order('name', { ascending: true }),

      supabase
        .from('v_space_tree')
        .select('*')
        .order('path', { ascending: true }),

      supabase
        .from('v_new_inbox')
        .select('*')
        .order('created_at', { ascending: false }),

      supabase
        .from('v_chain_status')
        .select('*'),

      supabase
        .from('action_node')
        .select('*')
        .eq('pinned', true)
        .eq('status', 'done')
        .eq('archived', false)
        .order('created_at', { ascending: true }),

      supabase
        .from('action_node')
        .select('id, name, status, updated_at, type, priority')
        .eq('archived', false)
        .order('updated_at', { ascending: false })
        .limit(25),

    ])

    setData({
      tasks: tasksRes.data ?? [],
      projects: projectsRes.data ?? [],
      closedTasks: closedTasksRes.data ?? [],
      closedProjects: closedProjectsRes.data ?? [],
      spaces: spacesRes.data ?? [],
      spaceTree: spaceTreeRes.data ?? [],
      inbox: inboxRes.data ?? [],
      chainStatus: chainStatusRes.data ?? [],
      pinnedDoneTasks: pinnedDoneTasksRes.data ?? [],
      recentItems: recentItemsRes.data ?? [],
    })
  }

  const refreshTasks = async () => {
    const [tasksRes, projectsRes, closedTasksRes, pinnedDoneTasksRes, recentItemsRes, chainStatusRes] =
      await Promise.all([
        supabase
          .from('v_active_tasks')
          .select('*')
          .order('date', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: true }),

        supabase
          .from('v_active_projects')
          .select('*')
          .order('name', { ascending: true }),

        supabase
          .from('action_node')
          .select('*')
          .in('status', ['done', 'cancelled'])
          .eq('archived', false)
          .neq('type', 'project'),

        supabase
          .from('action_node')
          .select('*')
          .eq('pinned', true)
          .eq('status', 'done')
          .eq('archived', false)
          .order('created_at', { ascending: true }),

        supabase
          .from('action_node')
          .select('id, name, status, updated_at, type, priority')
          .eq('archived', false)
          .order('updated_at', { ascending: false })
          .limit(25),

        supabase
          .from('v_chain_status')
          .select('*'),
      ])

    setData({
      tasks: tasksRes.data ?? [],
      projects: projectsRes.data ?? [],
      closedTasks: closedTasksRes.data ?? [],
      pinnedDoneTasks: pinnedDoneTasksRes.data ?? [],
      recentItems: recentItemsRes.data ?? [],
      chainStatus: chainStatusRes.data ?? [],
    })
  }

  const refreshInbox = async () => {
    const { data } = await supabase
      .from('v_new_inbox')
      .select('*')
      .order('created_at', { ascending: false })

    setData({ inbox: data ?? [] })
  }

  return { loadAll, refreshTasks, refreshInbox }
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
