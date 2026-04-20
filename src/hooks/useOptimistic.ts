import { useDataStore, type AppData } from '../store/appState'

// Race window: optimistic patch → server rejects → rollback briefly stomps any
// external write that landed between our patch and the rejection. The next
// realtime echo (≤ ~1 s) corrects the store to the authoritative server state.

export async function optimistic<K extends keyof AppData>(
  slice: K,
  patch: (current: AppData[K]) => AppData[K],
  mutation: () => Promise<void>,
): Promise<void> {
  const prev = useDataStore.getState().data[slice]
  useDataStore.getState().setData({ [slice]: patch(prev) } as Partial<AppData>)
  try {
    await mutation()
  } catch (err) {
    useDataStore.getState().setData({ [slice]: prev } as Partial<AppData>)
    throw err
  }
  // Success: no refetch. Realtime echo reconciles via PR-A's invalidation bus.
}

type PatchEntry<K extends keyof AppData = keyof AppData> = {
  slice: K
  patch: (current: AppData[K]) => AppData[K]
}

export async function optimisticMany(
  patches: PatchEntry[],
  mutation: () => Promise<void>,
): Promise<void> {
  // Snapshot all prev values before applying any patches
  const snapshots = patches.map(({ slice }) => ({
    slice,
    prev: useDataStore.getState().data[slice],
  }))

  // Apply all patches synchronously
  for (const { slice, patch } of patches) {
    const current = useDataStore.getState().data[slice]
    useDataStore.getState().setData({ [slice]: patch(current) } as Partial<AppData>)
  }

  try {
    await mutation()
  } catch (err) {
    // Restore all slices to pre-patch state
    for (const { slice, prev } of snapshots) {
      useDataStore.getState().setData({ [slice]: prev } as Partial<AppData>)
    }
    throw err
  }
  // Success: no refetch. Realtime echo reconciles via PR-A's invalidation bus.
}
