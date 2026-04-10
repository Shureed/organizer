import { useCallback } from 'react'
import Fuse from 'fuse.js'
import { useAppStore } from '../store/appState'
import type { AppData, SearchItem } from '../store/appState'

function normalizeSearchText(text: string): string {
  return text
    .replace(/[-\u2014\u2013:·]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

export function buildSearchIndex(data: AppData) {
  const items: SearchItem[] = []

  // Active tasks
  for (const t of data.tasks) {
    if (!t.id || !t.name) continue
    const meta = [t.project_name, t.space_name].filter(Boolean).join(' · ')
    items.push({
      type: 'task',
      id: t.id,
      name: t.name,
      meta,
      closed: false,
      searchText: normalizeSearchText(`${t.name} ${meta}`),
      handler: () => {},
    })
  }

  // Active projects
  for (const p of data.projects) {
    if (!p.id || !p.name) continue
    const meta = p.space_name ?? ''
    items.push({
      type: 'project',
      id: p.id,
      name: p.name,
      meta,
      closed: false,
      searchText: normalizeSearchText(`${p.name} ${meta}`),
      handler: () => {},
    })
  }

  // Closed tasks
  for (const t of data.closedTasks) {
    if (!t.id || !t.name) continue
    items.push({
      type: 'task',
      id: t.id,
      name: t.name,
      meta: t.status ?? '',
      closed: true,
      searchText: normalizeSearchText(t.name),
      handler: () => {},
    })
  }

  // Closed projects
  for (const p of data.closedProjects) {
    if (!p.id || !p.name) continue
    items.push({
      type: 'project',
      id: p.id,
      name: p.name,
      meta: p.status ?? '',
      closed: true,
      searchText: normalizeSearchText(p.name),
      handler: () => {},
    })
  }

  // Inbox items
  for (const i of data.inbox) {
    if (!i.id || !i.title) continue
    items.push({
      type: 'inbox',
      id: i.id,
      name: i.title,
      meta: i.source ?? '',
      closed: false,
      searchText: normalizeSearchText(i.title),
      handler: () => {},
    })
  }

  const fuseIndex = new Fuse(items, {
    keys: ['searchText'],
    threshold: 0.35,
    minMatchCharLength: 2,
  })

  useAppStore.getState().patchUI({ searchItems: items, fuseIndex })
}

export interface SearchResult {
  type: string
  id: string
  name: string
  meta: string
  closed: boolean
  navigate: () => void
}

export function useSearch() {
  const fuseIndex = useAppStore((s) => s.ui.fuseIndex)
  const showClosed = useAppStore((s) => s.ui.showClosedSearch)
  const patchUI = useAppStore((s) => s.patchUI)

  const search = useCallback(
    (query: string): SearchResult[] => {
      if (!query.trim() || !fuseIndex) return []

      const normalized = normalizeSearchText(query)
      const results = fuseIndex.search(normalized)

      return results
        .map((r) => r.item)
        .filter((item) => showClosed || !item.closed)
        .map((item) => ({
          type: item.type,
          id: item.id,
          name: item.name,
          meta: item.meta,
          closed: item.closed,
          navigate: item.handler,
        }))
    },
    [fuseIndex, showClosed]
  )

  const toggleShowClosed = useCallback(() => {
    patchUI({ showClosedSearch: !showClosed })
  }, [patchUI, showClosed])

  return { search, showClosed, toggleShowClosed }
}
