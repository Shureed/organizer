import { mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, {
  test: {
    environment: 'happy-dom',
    globals: true,
    // `.claude/**` covers agent scratch — `.claude/worktrees/` holds full repo
    // clones whose own src/ + node_modules/ would otherwise be crawled,
    // inflating discovery from ~20 real files to thousands.
    exclude: ['node_modules', 'dist', 'e2e/**', '.claude/**'],
  },
})
