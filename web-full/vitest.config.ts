import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const root = resolve(__dirname, '..')

export default defineConfig({
  root: __dirname,
  resolve: {
    alias: {
      '@genoffice/font-metrics/resolve': resolve(root, 'packages/font-metrics/src/resolve.ts'),
      '@genoffice/font-metrics/word-faces.json': resolve(root, 'packages/font-metrics/word-faces.json'),
    },
  },
  test: {
    name: 'web-full',
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
