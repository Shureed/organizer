/**
 * check-realtime-publications.mjs — Static scan (Phase 3)
 *
 * Walks src/ with ts-morph and extracts every
 *   supabase.channel(...).on('postgres_changes', { schema, table, ... }, ...)
 * call-site. Verifies that the (schema, table) pair is present in the
 * `supabase_realtime` publication on Cortex, so we fail the build if a
 * developer adds a realtime subscription without also publishing the table.
 *
 * Dynamic / non-literal `schema` or `table` values emit a WARNING but do not
 * fail CI — we can't reason about them statically.
 *
 * Auth model: the scan calls `public.fn_realtime_publication_tables()`
 * (SECURITY DEFINER, granted to anon) via PostgREST RPC. It uses the
 * publishable key (VITE_SUPABASE_ANON_KEY) read directly from the committed
 * .env file — no CI secret provisioning required, single source of truth with
 * local dev.
 *
 * Env overrides (optional):
 *   SUPABASE_URL            — overrides VITE_SUPABASE_URL from .env
 *   SUPABASE_ANON_KEY       — overrides VITE_SUPABASE_ANON_KEY from .env
 *
 * Flags:
 *   --dry                   — parse + extract only, skip the Supabase fetch.
 *                             Also triggered by SKIP_REALTIME_PUB_CHECK=1.
 *
 * Exit codes:
 *   0 — all subscribed tables are published (or --dry mode)
 *   1 — subscribed tables are missing from supabase_realtime, OR env missing
 *   2 — unexpected error (parse failure, network failure, etc.)
 */

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import { Project, SyntaxKind } from 'ts-morph'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')

const DRY = process.argv.includes('--dry') || process.env.SKIP_REALTIME_PUB_CHECK === '1'

// ── 1. AST-walk src/ for .on('postgres_changes', { schema, table }, ...) ────

/**
 * Extract all (schema, table, location) triples from src/.
 * A subscription is any CallExpression of shape:
 *   <expr>.on('postgres_changes', <config-object>, <handler>)
 * where <config-object> has `schema` and `table` property assignments.
 */
function extractSubscriptions() {
  const project = new Project({
    tsConfigFilePath: path.join(repoRoot, 'tsconfig.app.json'),
    skipAddingFilesFromTsConfig: false,
  })

  const subs = []
  const warnings = []

  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath()
    // Only scan src/ — ignore node_modules, scripts, tests config, etc.
    if (!filePath.includes(`${path.sep}src${path.sep}`)) continue

    sourceFile.forEachDescendant((node) => {
      if (node.getKind() !== SyntaxKind.CallExpression) return
      const callExpr = node
      const expr = callExpr.getExpression()
      // Must be a property access: X.on(...)
      if (expr.getKind() !== SyntaxKind.PropertyAccessExpression) return
      if (expr.getName() !== 'on') return

      const args = callExpr.getArguments()
      if (args.length < 2) return

      const firstArg = args[0]
      // First arg must be string literal 'postgres_changes'
      if (firstArg.getKind() !== SyntaxKind.StringLiteral) return
      if (firstArg.getLiteralText() !== 'postgres_changes') return

      const configArg = args[1]
      const loc = `${path.relative(repoRoot, filePath)}:${firstArg.getStartLineNumber()}`

      if (configArg.getKind() !== SyntaxKind.ObjectLiteralExpression) {
        warnings.push(`${loc}  non-literal config object — skipped (cannot statically check)`)
        return
      }

      const schema = readStringProp(configArg, 'schema')
      const table = readStringProp(configArg, 'table')

      if (schema === null || table === null) {
        warnings.push(`${loc}  dynamic/non-literal schema or table — skipped`)
        return
      }
      // Missing `table` prop entirely is also skipped with a warning;
      // missing `schema` defaults to 'public' per Supabase docs.
      if (!table) {
        warnings.push(`${loc}  no 'table' property found on config object — skipped`)
        return
      }

      subs.push({
        schema: schema || 'public',
        table,
        loc,
      })
    })
  }

  return { subs, warnings }
}

/**
 * Read a string-literal property off an ObjectLiteralExpression.
 * Returns:
 *   ''      — property not present (caller decides if that's OK)
 *   null    — property present but value is dynamic/non-literal
 *   string  — the literal value
 */
function readStringProp(objLit, propName) {
  const prop = objLit.getProperty(propName)
  if (!prop) return ''
  if (prop.getKind() !== SyntaxKind.PropertyAssignment) return null
  const initializer = prop.getInitializer()
  if (!initializer) return null
  if (initializer.getKind() === SyntaxKind.StringLiteral) {
    return initializer.getLiteralText()
  }
  if (initializer.getKind() === SyntaxKind.NoSubstitutionTemplateLiteral) {
    return initializer.getLiteralText()
  }
  return null
}

// ── 2. Load publishable key from committed .env ──────────────────────────────

/**
 * Parse a dotenv-format file into { key: value } pairs.
 * Minimal parser: ignores comments (#) and blank lines, strips surrounding
 * single/double quotes. Not a full dotenv implementation — sufficient for
 * our two keys.
 */
function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {}
  const out = {}
  for (const raw of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    const k = line.slice(0, eq).trim()
    let v = line.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

function loadPublishableCreds() {
  const env = parseDotEnv(path.join(repoRoot, '.env'))
  const url = process.env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  return { url, key }
}

// ── 3. Fetch publication set via SECURITY DEFINER RPC ────────────────────────

async function fetchPublishedTables(url, key) {
  const endpoint = `${url.replace(/\/$/, '')}/rest/v1/rpc/fn_realtime_publication_tables`
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `fn_realtime_publication_tables RPC failed: ${res.status} ${res.statusText} — ${body}`,
    )
  }

  const data = await res.json()
  if (!Array.isArray(data)) {
    throw new Error(`RPC returned unexpected shape: ${JSON.stringify(data).slice(0, 400)}`)
  }

  return data.map((r) => ({ schema: r.schemaname, table: r.tablename }))
}

// ── 4. Main ──────────────────────────────────────────────────────────────────

async function main() {
  const { subs, warnings } = extractSubscriptions()

  console.log(`[realtime-pub-scan] found ${subs.length} static postgres_changes subscription(s):`)
  for (const s of subs) console.log(`  - ${s.schema}.${s.table}  (${s.loc})`)
  for (const w of warnings) console.warn(`[realtime-pub-scan] WARNING: ${w}`)

  if (subs.length === 0) {
    console.log('[realtime-pub-scan] nothing to check — exiting 0')
    return 0
  }

  if (DRY) {
    console.log('[realtime-pub-scan] --dry: skipping Supabase fetch')
    return 0
  }

  const { url, key } = loadPublishableCreds()
  if (!url || !key) {
    console.error(
      '[realtime-pub-scan] ERROR: could not resolve Supabase URL + publishable key. ' +
        'Checked process.env.SUPABASE_URL/SUPABASE_ANON_KEY and .env ' +
        '(VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
        'Pass --dry or set SKIP_REALTIME_PUB_CHECK=1 to skip the remote fetch.',
    )
    return 1
  }

  let published
  try {
    published = await fetchPublishedTables(url, key)
  } catch (err) {
    console.error(`[realtime-pub-scan] ERROR fetching publication set: ${err?.message || err}`)
    return 2
  }

  const publishedSet = new Set(published.map((p) => `${p.schema}.${p.table}`))
  console.log(`[realtime-pub-scan] supabase_realtime publishes ${publishedSet.size} table(s)`)

  const missing = []
  for (const s of subs) {
    if (!publishedSet.has(`${s.schema}.${s.table}`)) missing.push(s)
  }

  if (missing.length > 0) {
    console.error(
      '[realtime-pub-scan] FAIL — the following subscribed tables are NOT in the supabase_realtime publication:',
    )
    for (const m of missing) {
      console.error(`  - ${m.schema}.${m.table}  (${m.loc})`)
    }
    console.error('')
    console.error(
      '  Remediation: add each missing table to the supabase_realtime publication in a migration, e.g.',
    )
    console.error('    ALTER PUBLICATION supabase_realtime ADD TABLE public.<table>;')
    console.error('')
    console.error("  Without this, `.on('postgres_changes', ...)` will silently receive no events.")
    return 1
  }

  console.log('[realtime-pub-scan] OK — every subscribed table is published')
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[realtime-pub-scan] UNEXPECTED ERROR:', err)
    process.exit(2)
  })
