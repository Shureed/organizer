import { mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, {
  test: {
    environment: 'happy-dom',
    globals: true,
    exclude: ['node_modules', 'dist', 'e2e/**'],
  },
})
