# P1 Bundle Baseline — Final (T10)

This document captures bundle metrics after all P1 code-splitting tasks (T2–T10) are complete.

## Build Date
April 18, 2026

## Before / After Entry Chunk

| Metric | Before (P1 start) | After (P1 complete) |
|--------|-------------------|---------------------|
| Entry chunk file | `index-D6VW2hiq.js` | `index-BFa5n9yo.js` |
| Uncompressed | 527.65 KB | 213.42 KB |
| Gzip | 155.35 KB | 68.54 KB |
| Reduction (uncompressed) | — | −59.5% |
| Reduction (gzip) | — | −55.9% |

## All Emitted JS Chunks (final build)

| Chunk | Uncompressed | Gzip |
|-------|-------------|------|
| `index-BFa5n9yo.js` | 213.42 kB | 68.54 kB |
| `supabase-B-FEEdH9.js` | 186.96 kB | 48.68 kB |
| `utils-DLI0vW2A.js` | 32.34 kB | 10.63 kB |
| `dialog-D18vwHul.js` | 30.40 kB | 10.53 kB |
| `IssuesView-CimxbopE.js` | 16.47 kB | 5.08 kB |
| `TaskDetailModal-BUHoj3d9.js` | 10.97 kB | 3.07 kB |
| `jsx-runtime-CUBmso4R.js` | 8.39 kB | 3.20 kB |
| `InboxView-CX9Kg1X4.js` | 7.36 kB | 2.44 kB |
| `TodayView-PopNBo7V.js` | 7.13 kB | 2.53 kB |
| `CalendarView-BhpnkkWm.js` | 5.48 kB | 2.01 kB |
| `AddTaskDialog-ClVYQoCj.js` | 4.08 kB | 1.25 kB |
| `react-dom-rrmiBBGR.js` | 3.54 kB | 1.34 kB |
| `LoginPage-DpGeXDSg.js` | 3.17 kB | 1.11 kB |
| `InboxDetailModal-BsZ-IZpw.js` | 3.06 kB | 1.32 kB |
| `useDataLoader-B1BhfkjG.js` | 2.49 kB | 0.71 kB |
| `CommentSection-Bj-u15YH.js` | 2.28 kB | 1.03 kB |
| `RecentsView-B1ZitXSh.js` | 2.21 kB | 0.94 kB |
| `x-BS1D5IPi.js` | 1.47 kB | 0.84 kB |
| `preload-helper-DnNL_lth.js` | 1.20 kB | 0.68 kB |
| `appState-D6yjdyJI.js` | 1.19 kB | 0.66 kB |
| `useMutations-DvuJ3Y9a.js` | 1.38 kB | 0.58 kB |
| `useAuth-B3zREbKb.js` | 0.71 kB | 0.41 kB |
| `StatusChip-Bl1M5avU.js` | 0.71 kB | 0.45 kB |
| `TypeBadge-0H1Euhfw.js` | 0.50 kB | 0.36 kB |
| `SourceBadge-DbtfxiWt.js` | 0.43 kB | 0.32 kB |
| `PinIcon-CYjFolVB.js` | 0.40 kB | 0.29 kB |
| `PriorityDot-CUyFwUFl.js` | 0.30 kB | 0.26 kB |

## P1 Optimisations Applied

- Lazy-loaded all five main views: `TodayView`, `CalendarView`, `RecentsView`, `IssuesView`, `InboxView`
- Lazy-loaded `LoginPage` behind auth check
- Lazy-loaded `TaskDetailModal` and `InboxDetailModal` behind open-state gates
- Lazy-loaded `AddTaskDialog` behind FAB interaction
- **T10: Prefetch view chunks on `mouseenter` / `onFocus` / `onTouchStart` over nav buttons, gated by Data Saver preference**

## Verification

- [x] `dist/stats.html` exists after `bun run build`
- [x] `bun run build` exits 0
- [x] `bunx tsc -b` passes
- [x] Entry chunk gzip reduced from 155.35 KB → 68.54 kB (−55.9%)
