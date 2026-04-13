import { useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAppStore } from '../store/appState'

/** Returns midnight today in America/New_York as a UTC ISO string */
function getTodayETStart(): string {
  const now = new Date()

  // Get today's date string in ET (YYYY-MM-DD)
  const etDateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)

  // Find the UTC offset for ET at noon today, then compute midnight UTC
  // Test: what hour is it in ET when it's noon UTC?
  const testDate = new Date(`${etDateStr}T12:00:00Z`)
  const etHourAtNoonUTC = parseInt(
    testDate.toLocaleString('en-US', {
      timeZone: 'America/New_York',
      hour: '2-digit',
      hour12: false,
    })
  )
  // etHourAtNoonUTC - 12 = offsetHours (e.g. -4 for EDT, -5 for EST)
  const offsetHours = etHourAtNoonUTC - 12

  // Midnight UTC for ET date = midnight ET + (negative offset in hours)
  const midnightUTC = new Date(`${etDateStr}T00:00:00Z`)
  midnightUTC.setUTCHours(midnightUTC.getUTCHours() - offsetHours)
  return midnightUTC.toISOString()
}

export function useDataLoader() {
  const setData = useAppStore((s) => s.setData)

  const loadAll = async () => {
    const todayStart = getTodayETStart()

    const [
      tasksRes,
      projectsRes,
      closedTasksRes,
      closedProjectsRes,
      spacesRes,
      spaceTreeRes,
      inboxRes,
      chainStatusRes,
      completedTodayRes,
      pinnedDoneTasksRes,
      recentItemsRes,
    ] = await Promise.all([
      supabase
        .from('v_active_tasks')
        .select('*')
        .order('date', { ascending: true, nullsFirst: false }),

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
        .eq('status', 'done')
        .eq('archived', false)
        .gte('completed_at', todayStart),

      supabase
        .from('action_node')
        .select('*')
        .eq('pinned', true)
        .eq('status', 'done')
        .eq('archived', false),

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
      completedToday: completedTodayRes.data ?? [],
      pinnedDoneTasks: pinnedDoneTasksRes.data ?? [],
      recentItems: recentItemsRes.data ?? [],
    })
  }

  const refreshTasks = async () => {
    const todayStart = getTodayETStart()

    const [tasksRes, closedTasksRes, completedTodayRes, pinnedDoneTasksRes, recentItemsRes] =
      await Promise.all([
        supabase
          .from('v_active_tasks')
          .select('*')
          .order('date', { ascending: true, nullsFirst: false }),

        supabase
          .from('action_node')
          .select('*')
          .in('status', ['done', 'cancelled'])
          .eq('archived', false)
          .neq('type', 'project'),

        supabase
          .from('action_node')
          .select('*')
          .eq('status', 'done')
          .eq('archived', false)
          .gte('completed_at', todayStart),

        supabase
          .from('action_node')
          .select('*')
          .eq('pinned', true)
          .eq('status', 'done')
          .eq('archived', false),

        supabase
          .from('action_node')
          .select('id, name, status, updated_at, type, priority')
          .eq('archived', false)
          .order('updated_at', { ascending: false })
          .limit(25),
      ])

    setData({
      tasks: tasksRes.data ?? [],
      closedTasks: closedTasksRes.data ?? [],
      completedToday: completedTodayRes.data ?? [],
      pinnedDoneTasks: pinnedDoneTasksRes.data ?? [],
      recentItems: recentItemsRes.data ?? [],
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
