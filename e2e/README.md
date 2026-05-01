## What this is

- End-to-end test infrastructure for the organizer app, targeting the GitHub Pages deploy-preview URL.
- Audience 1: CI runner — Playwright CLI driven by `.github/workflows/e2e.yml`, runs on every deploy-preview success event.
- Audience 2: In-session agent — Playwright MCP server wired via `.mcp.json`, lets a Claude agent drive the browser interactively using `browser_*` tools without spawning a separate CI job.

---

## CI flow

```
PR opened / pushed
       │
       ▼
deploy-preview succeeds (GitHub Pages)
       │
       ▼
e2e.yml workflow triggered (deployment_status event)
       │
       ▼
global-setup.ts: signInWithPassword → seed session into localStorage → write storageState.json
       │
       ▼
specs/*.spec.ts run (storageState reused, single worker, 1 retry)
       │
       ▼
Playwright HTML report uploaded as artifact
```

| file | role |
|---|---|
| `e2e/playwright.config.ts` | Defines `testDir`, `globalSetup`, `storageState` path, `baseURL` from `E2E_PREVIEW_URL`, single chromium project |
| `e2e/global-setup.ts` | Authenticates test user via `signInWithPassword`, seeds session into localStorage, writes `storageState.json` |
| `e2e/storageState.json` | Serialised browser auth state (cookies + localStorage) reused by every spec; gitignored, regenerated per CI run |
| `e2e/specs/*.spec.ts` | Individual test files; each spec starts already authenticated via `storageState` |

---

## In-session MCP flow

- Playwright MCP is wired at project scope via `.mcp.json` (`npx @playwright/mcp@latest`, no extra args).
- It is also available at user scope if configured in `~/.claude/mcp.json`.
- The default capability set does **not** include `browser_set_storage_state` or the `browser_localstorage_*` / `browser_cookie_*` families — inject session via `browser_evaluate` instead.

```ts
// 1. Navigate to the app so the page context exists (localStorage is origin-scoped).
browser_navigate({ url: "https://shureed.github.io/organizer/" })

// 2. Inject the Supabase session from a known-good JSON blob.
browser_evaluate({
  code: `localStorage.setItem(
    'sb-blwymionidfxwrpacfrb-auth-token',
    JSON.stringify(/* paste session object here */)
  )`
})

// 3. Reload so the supabase-js client picks up the persisted session on boot.
browser_navigate({ url: "https://shureed.github.io/organizer/" })

// 4. Wait until the fixture task is visible (confirms auth + data load).
browser_wait_for({ text: "E2E fixture — today task", timeout: 30000 })

// 5. Capture outbound network activity to inspect API calls.
browser_network_requests({ filter: "supabase" })

// 6. Inspect the response body of a specific request.
browser_network_request({ url: "<url-from-step-5>", part: "response-body" })
```

---

## Regenerate storageState.json locally

```sh
E2E_EMAIL=... E2E_PASSWORD=... E2E_PREVIEW_URL=https://shureed.github.io/organizer/ npx playwright test --config=e2e/playwright.config.ts e2e/specs/smoke.spec.ts
```

---

## Tool surface notes

| tool | available in default? | workaround if missing |
|---|---|---|
| `browser_navigate` / `browser_evaluate` / `browser_network_requests` | yes | — |
| `browser_set_storage_state` | **no** (default capability set) | use `browser_evaluate` to call `localStorage.setItem(...)` after first navigation |
| `browser_localstorage_*` / `browser_cookie_*` | **no** (default capability set) | same — `browser_evaluate` |
| enable storage tools at server start | n/a | pass `--capability=devtools` (or similar) in `.mcp.json` args; not done by T1 |

---

## Local-dev driver (future)

- Running against `npm run dev` (`http://localhost:5173`) is documented for future scope; not implemented in this chain — same MCP commands work, swap the URL.
