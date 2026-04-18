import { useEffect } from 'react'
import { useAppStore } from '../store/appState'
import { RecentItem } from '../components/recents/RecentItem'
import { loadRecentsView, useAutoRefresh } from '../hooks/useDataLoader'

export function RecentsView() {
  const recentItems = useAppStore((s) => s.data.recentItems)
  const patchUI = useAppStore((s) => s.patchUI)

  useEffect(() => { loadRecentsView() }, [])
  useAutoRefresh(loadRecentsView, 30000)

  return (
    <div
      className="flex flex-col min-h-full pb-20"
      style={{ backgroundColor: 'var(--bg)' }}
    >
      {/* Header */}
      <div
        className="px-4 pt-5 pb-3"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        <h1
          style={{ color: 'var(--text)' }}
          className="text-base font-semibold"
        >
          Recents
        </h1>
        {recentItems.length > 0 && (
          <p style={{ color: 'var(--text-muted)' }} className="text-xs mt-0.5">
            Last {recentItems.length} modified
          </p>
        )}
      </div>

      {/* List */}
      <div
        className="flex-1"
        style={{ backgroundColor: 'var(--surface)' }}
      >
        {recentItems.length === 0 ? (
          <div className="flex items-center justify-center py-16 px-4">
            <p
              style={{ color: 'var(--text-muted)' }}
              className="text-sm text-center"
            >
              No recent items yet.
            </p>
          </div>
        ) : (
          <div className="flex flex-col">
            {recentItems.map((item, idx) => (
              <RecentItem
                key={item.id}
                item={item}
                onOpen={(id) => patchUI({ openTaskId: id })}
                isLast={idx === recentItems.length - 1}
              />
            ))}
          </div>
        )}
      </div>

    </div>
  )
}
