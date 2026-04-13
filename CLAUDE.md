# Organizer

React + Vite frontend for the Secretary system. Reads from Supabase directly via the JS client.

## Build

```bash
npm run build          # tsc -b && vite build
npm run dev            # vite dev server
npm run lint           # eslint
```

## Type checking

The project uses composite TypeScript projects. `tsconfig.json` has `"files": []` and delegates to `tsconfig.app.json` via `references`. Running `tsc --noEmit --project tsconfig.json` checks **zero files** — always use build mode:

```bash
# Correct — matches what npm run build uses
./node_modules/.bin/tsc -b tsconfig.json --dry

# Or just run the full build check
npm run build
```

Never use `tsc --noEmit --project tsconfig.json` to verify types — it will silently pass on errors.

## Stack

- React 19, Vite 8, TypeScript 6, Tailwind CSS 4
- Zustand for state (`src/store/appState.ts`)
- Supabase JS client for all data access
- Generated types at `src/types/database.types.ts` — regenerate after schema changes

## Key files

| File | Purpose |
|------|---------|
| `src/store/appState.ts` | Global state, all data types |
| `src/hooks/useDataLoader.ts` | Supabase queries, populates store |
| `src/views/TodayView.tsx` | Today tab — tasks, projects, chain status |
| `src/types/database.types.ts` | Generated Supabase types — do not hand-edit |
