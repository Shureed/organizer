import { useMemo, useEffect } from 'react'
import { useAppStore } from '../store/appState'
import { loadCalendarView, useAutoRefresh } from '../hooks/useDataLoader'
import { TaskCard } from '../components/calendar/TaskCard'
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

  useEffect(() => { loadCalendarView() }, [])
  useAutoRefresh(loadCalendarView, 30000)

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
                  onClick={() => patchUI({ openTaskId: t.id })}
                />
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}
