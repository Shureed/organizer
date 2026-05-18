/**
 * Regression test for the OAuth-callback mount location.
 *
 * The plan called for rendering <MainApp /> directly under heavy mocking
 * (supabase, sqlite-wasm, realtime, sync layer, data loader, lazy views).
 * In practice that test would be both expensive and fragile — and the
 * specific failure mode it would catch (the `useGcalCallback` hook moving
 * out of the app shell back into a view) is provable via a source-file
 * assertion without running React.
 *
 * Companion behavior tests live in src/hooks/useGcalCallback.test.ts.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP_TSX = readFileSync(resolve(HERE, 'App.tsx'), 'utf-8')

describe('OAuth callback mount location', () => {
  it('App.tsx imports useGcalCallback from the hooks module', () => {
    expect(APP_TSX).toMatch(
      /import\s*\{\s*useGcalCallback\s*\}\s*from\s*['"]\.\/hooks\/useGcalCallback['"]/,
    )
  })

  it('MainApp body calls useGcalCallback() unconditionally', () => {
    const mainAppMatch = APP_TSX.match(/function\s+MainApp\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/)
    expect(mainAppMatch, 'MainApp function not found in App.tsx').toBeTruthy()
    const body = mainAppMatch![1]
    // Must call the hook somewhere in the body.
    expect(body).toMatch(/useGcalCallback\s*\(\s*\)/)
    // Must not be wrapped in a view-conditional (basic guard against a
    // regression that re-gates the hook to SettingsView).
    expect(body).not.toMatch(/currentView\s*===\s*['"]settings['"][\s\S]*useGcalCallback/)
  })

  it('SettingsView does NOT import or call useGcalCallback (lives on the shell now)', () => {
    const settings = readFileSync(resolve(HERE, 'views/SettingsView.tsx'), 'utf-8')
    // A bare mention in a comment is fine; an import or a call is the regression.
    expect(settings).not.toMatch(/^import[^\n]*useGcalCallback[^\n]*from/m)
    expect(settings).not.toMatch(/useGcalCallback\s*\(/)
  })
})
