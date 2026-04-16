import { useEffect, useMemo, useState } from 'react'
import { useAppStore } from '../store/appState'
import { TaskCard } from '../components/calendar/TaskCard'
import { ActionTakenRow } from '../components/calendar/ActionTakenRow'
import { TaskDetailModal } from '../components/shared/TaskDetailModal'
import { TypeBadge } from '../components/shared/TypeBadge'
import { useDayActions } from '../hooks/useDayActions'
import type { DayActionItem } from '../hooks/useDayActions'
import type { Database } from '../types/database.types'

type ItemStatus = Database['public']['Enums']['item_status']

// Status dot colors
const STATUS_COLORS: Record<string, string> = {
  open: '#58a6ff',
  in_progress: '#d29922',
  waiting: '#db6d28',
  done: '#3fb950',
  cancelled: '#f85149',
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const LONG_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface ChainGroup {
  originId: string
  originName: string
  originType: string
  isTouched: boolean // true if the origin node itself appears in dayActions
  touchedOriginItem: DayActionItem | null
  members: DayActionItem[]
  maxTouchedAt: string
}

function buildChainGroups(dayActions: DayActionItem[]): {
  groups: ChainGroup[]
  standalones: DayActionItem[]
} {
  // Primary group key: project_id (nearest project ancestor) > chain_origin_id > standalone
  const getGroupKey = (item: DayActionItem): string | null =>
    item.project_id ?? item.chain_origin_id ?? null

  const buckets = new Map<string, DayActionItem[]>()
  const standalones: DayActionItem[] = []

  for (const item of dayActions) {
    const key = getGroupKey(item)
    if (!key) {
      standalones.push(item)
    } else {
      if (!buckets.has(key)) buckets.set(key, [])
      buckets.get(key)!.push(item)
    }
  }

  const groups: ChainGroup[] = []

  for (const [groupKey, items] of buckets.entries()) {
    // The header item is the node whose id IS the group key (the project or origin itself)
    let headerItem: DayActionItem | null = null
    const members: DayActionItem[] = []

    for (const item of items) {
      if (item.node_id === groupKey) {
        headerItem = item
      } else {
        members.push(item)
      }
    }

    // If only the project/origin was touched (no children in list), render standalone
    if (members.length === 0) {
      if (headerItem) standalones.push(headerItem)
      continue
    }

    members.sort((a, b) => b.touched_at.localeCompare(a.touched_at))

    const sample = items[0]
    const isProjectGroup = !!sample.project_id

    const originName =
      headerItem?.node_name ??
      (isProjectGroup ? sample.project_name : sample.chain_origin_name) ??
      groupKey
    const originType = headerItem?.node_type ?? (isProjectGroup ? 'project' : 'task')

    const allTimes = items.map(i => i.touched_at)
    const maxTouchedAt = allTimes.sort((a, b) => b.localeCompare(a))[0] ?? ''

    groups.push({
      originId: groupKey,
      originName,
      originType,
      isTouched: !!headerItem,
      touchedOriginItem: headerItem,
      members,
      maxTouchedAt,
    })
  }

  groups.sort((a, b) => b.maxTouchedAt.localeCompare(a.maxTouchedAt))

  return { groups, standalones }
}

function formatSelectedDay(dateStr: string): string {
  // dateStr = 'YYYY-MM-DD'
  const [year, month, day] = dateStr.split('-').map(Number)
  const d = new Date(year, month - 1, day)
  return `${LONG_DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`
}

interface CalendarTask {
  id: string
  name: string | null
  status: ItemStatus | null
  date: string | null
}

export function CalendarView() {
  const { data, ui, patchUI } = useAppStore()
  const { calendarYear, calendarMonth, calendarSelectedDay } = ui

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)

  const { items: dayActions, loading: dayActionsLoading } = useDayActions(calendarSelectedDay)

  useEffect(() => {
    setActionsOpen(false)
  }, [calendarSelectedDay])

  // Today's date string
  const today = useMemo(() => {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }, [])

  // Build per-day task map from active + closed tasks
  const tasksByDay = useMemo(() => {
    const map = new Map<string, CalendarTask[]>()

    const addTask = (t: CalendarTask) => {
      if (!t.date) return
      // date field is YYYY-MM-DD or ISO — normalize to YYYY-MM-DD
      const dateKey = t.date.slice(0, 10)
      if (!map.has(dateKey)) map.set(dateKey, [])
      map.get(dateKey)!.push(t)
    }

    for (const t of data.tasks) {
      if (t.id && t.date) addTask({ id: t.id, name: t.name, status: t.status, date: t.date })
    }
    for (const t of data.closedTasks) {
      if (t.id && t.date && t.status !== 'cancelled') addTask({ id: t.id, name: t.name, status: t.status, date: t.date })
    }

    return map
  }, [data.tasks, data.closedTasks])

  // Calendar grid cells
  const cells = useMemo(() => {
    const firstDay = new Date(calendarYear, calendarMonth, 1).getDay() // 0=Sun
    const daysInMonth = new Date(calendarYear, calendarMonth + 1, 0).getDate()

    const result: Array<{ day: number | null; dateStr: string | null }> = []

    // Leading empty cells
    for (let i = 0; i < firstDay; i++) {
      result.push({ day: null, dateStr: null })
    }

    // Day cells
    for (let d = 1; d <= daysInMonth; d++) {
      const m = String(calendarMonth + 1).padStart(2, '0')
      const dd = String(d).padStart(2, '0')
      result.push({ day: d, dateStr: `${calendarYear}-${m}-${dd}` })
    }

    // Trailing cells to fill last row
    const remainder = result.length % 7
    if (remainder !== 0) {
      for (let i = 0; i < 7 - remainder; i++) {
        result.push({ day: null, dateStr: null })
      }
    }

    return result
  }, [calendarYear, calendarMonth])

  // Navigation handlers
  const goToPrevMonth = () => {
    let y = calendarYear
    let m = calendarMonth - 1
    if (m < 0) { m = 11; y-- }
    patchUI({ calendarYear: y, calendarMonth: m })
  }

  const goToNextMonth = () => {
    let y = calendarYear
    let m = calendarMonth + 1
    if (m > 11) { m = 0; y++ }
    patchUI({ calendarYear: y, calendarMonth: m })
  }

  const goToToday = () => {
    const now = new Date()
    patchUI({
      calendarYear: now.getFullYear(),
      calendarMonth: now.getMonth(),
      calendarSelectedDay: today,
    })
  }

  const handleDayClick = (dateStr: string) => {
    patchUI({ calendarSelectedDay: calendarSelectedDay === dateStr ? null : dateStr })
  }

  // Tasks for selected day
  const selectedDayTasks = useMemo(() => {
    if (!calendarSelectedDay) return []
    return tasksByDay.get(calendarSelectedDay) ?? []
  }, [calendarSelectedDay, tasksByDay])

  return (
    <div className="flex flex-col h-full" style={{ color: 'var(--text)' }}>
      {/* Month navigation header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: 'var(--border)' }}
      >
        <button
          onClick={goToPrevMonth}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-lg transition-colors hover:bg-[var(--surface2)]"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Previous month"
        >
          ‹
        </button>

        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold" style={{ color: 'var(--text)' }}>
            {MONTHS[calendarMonth]} {calendarYear}
          </h2>
          <button
            onClick={goToToday}
            className="text-xs px-2 py-1 rounded-md border transition-colors hover:bg-[var(--surface2)]"
            style={{
              borderColor: 'var(--border)',
              color: 'var(--accent)',
            }}
          >
            Today
          </button>
        </div>

        <button
          onClick={goToNextMonth}
          className="flex items-center justify-center w-8 h-8 rounded-lg text-lg transition-colors hover:bg-[var(--surface2)]"
          style={{ color: 'var(--text-muted)' }}
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      {/* Calendar grid */}
      <div className="px-2 pt-2 shrink-0">
        {/* Day-of-week header */}
        <div className="grid grid-cols-7 mb-1">
          {DAY_NAMES.map((d) => (
            <div
              key={d}
              className="text-center text-[11px] font-medium py-1"
              style={{ color: 'var(--text-muted)' }}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 gap-px" style={{ background: 'var(--border)' }}>
          {cells.map((cell, idx) => {
            if (!cell.day || !cell.dateStr) {
              return (
                <div
                  key={idx}
                  className="min-h-[60px]"
                  style={{ background: 'var(--bg)' }}
                />
              )
            }

            const isToday = cell.dateStr === today
            const isSelected = cell.dateStr === calendarSelectedDay
            const isPast = cell.dateStr < today
            const tasks = tasksByDay.get(cell.dateStr) ?? []
            const visibleTasks = tasks.slice(0, 3)
            const extraCount = tasks.length - 3

            return (
              <button
                key={cell.dateStr}
                onClick={() => handleDayClick(cell.dateStr!)}
                className="min-h-[60px] flex flex-col items-start p-1 text-left transition-colors relative"
                style={{
                  background: isSelected
                    ? 'var(--surface2)'
                    : 'var(--surface)',
                }}
              >
                {/* Day number */}
                <span
                  className={`
                    text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full mb-0.5 leading-none
                    ${isToday ? 'font-bold' : ''}
                  `}
                  style={{
                    background: isToday ? 'var(--accent)' : 'transparent',
                    color: isToday
                      ? '#0d1117'
                      : isPast
                        ? 'var(--text-muted)'
                        : 'var(--text)',
                    boxShadow: isSelected && !isToday
                      ? '0 0 0 2px var(--accent)'
                      : 'none',
                  }}
                >
                  {cell.day}
                </span>

                {/* Task indicator dots */}
                {visibleTasks.length > 0 && (
                  <div className="flex flex-wrap gap-0.5 px-0.5">
                    {visibleTasks.map((t) => (
                      <span
                        key={t.id}
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: STATUS_COLORS[t.status ?? 'open'] ?? STATUS_COLORS.open }}
                      />
                    ))}
                  </div>
                )}

                {/* N more */}
                {extraCount > 0 && (
                  <span
                    className="text-[9px] leading-none px-0.5 mt-0.5"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    +{extraCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Selected day detail panel */}
      {calendarSelectedDay && (
        <div
          className="flex-1 overflow-y-auto border-t mt-2 pt-3 px-4 pb-4"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            {formatSelectedDay(calendarSelectedDay)}
          </p>

          {selectedDayTasks.length === 0 ? (
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No tasks for this day.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {selectedDayTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  onClick={() => setSelectedTaskId(t.id)}
                />
              ))}
            </div>
          )}
          {/* Actions taken section */}
          <div className="mt-4">
            <button
              onClick={() => setActionsOpen(o => !o)}
              className="flex items-center justify-between w-full text-left mb-2"
            >
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Actions taken
              </span>
              <span className="flex items-center gap-1.5">
                {dayActions.length > 0 && (
                  <span
                    className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                    style={{ backgroundColor: 'var(--surface2)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
                  >
                    {dayActions.length}
                  </span>
                )}
                <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  {actionsOpen ? '▼' : '▶'}
                </span>
              </span>
            </button>

            {actionsOpen && (
              <div className="flex flex-col gap-1">
                {dayActionsLoading ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading...</p>
                ) : dayActions.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Nothing recorded for this day.</p>
                ) : (() => {
                  const { groups, standalones } = buildChainGroups(dayActions)
                  return (
                    <>
                      {groups.map(group => (
                        <div key={group.originId} className="flex flex-col gap-1">
                          {/* Group header */}
                          {group.isTouched ? (
                            // Active header — origin was touched today, clickable
                            <button
                              onClick={() => setSelectedTaskId(group.originId)}
                              className="w-full text-left flex items-center gap-1.5 px-1 py-1 rounded transition-colors hover:bg-[var(--surface2)]"
                            >
                              <span className="flex-1 text-xs font-medium truncate" style={{ color: 'var(--text)' }}>
                                {group.originName || '(Untitled)'}
                              </span>
                              <div className="shrink-0">
                                <TypeBadge type={group.originType} />
                              </div>
                            </button>
                          ) : (
                            // Muted header — origin not touched today, context only
                            <div className="flex items-center gap-1.5 px-1 py-1">
                              <span
                                className="flex-1 text-xs truncate italic"
                                style={{ color: 'var(--text-muted)', fontWeight: 400 }}
                              >
                                {group.originName || '(Untitled)'}
                              </span>
                              <div className="shrink-0">
                                <TypeBadge type={group.originType} />
                              </div>
                            </div>
                          )}
                          {/* Member rows with left-border indent */}
                          <div
                            className="flex flex-col gap-1 pl-3 border-l"
                            style={{ borderColor: 'var(--border)' }}
                          >
                            {group.members.map(item => (
                              <ActionTakenRow
                                key={item.node_id}
                                nodeId={item.node_id}
                                nodeName={item.node_name}
                                nodeType={item.node_type}
                                touchedAt={item.touched_at}
                                touchSource={item.touch_source}
                                onClick={() => setSelectedTaskId(item.node_id)}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                      {/* Standalones — no grouping, no indentation */}
                      {standalones.map(item => (
                        <ActionTakenRow
                          key={item.node_id}
                          nodeId={item.node_id}
                          nodeName={item.node_name}
                          nodeType={item.node_type}
                          touchedAt={item.touched_at}
                          touchSource={item.touch_source}
                          onClick={() => setSelectedTaskId(item.node_id)}
                        />
                      ))}
                    </>
                  )
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Task detail modal */}
      <TaskDetailModal
        taskId={selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
      />
    </div>
  )
}
