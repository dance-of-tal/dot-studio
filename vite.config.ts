import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined
          }

          if (id.includes('@xyflow/react')) {
            return 'flow-vendor'
          }

          if (id.includes('@dnd-kit/')) {
            return 'dnd-vendor'
          }

          if (id.includes('@tanstack/react-query')) {
            return 'query-vendor'
          }

          if (id.includes('@xterm/')) {
            return 'terminal-vendor'
          }

          if (
            id.includes('react-markdown') ||
            id.includes('remark-gfm') ||
            id.includes('rehype-highlight') ||
            id.includes('highlight.js')
          ) {
            return 'markdown-vendor'
          }

          if (id.includes('@opencode-ai/sdk') || id.includes('opencode-ai')) {
            return 'opencode-vendor'
          }

          if (id.includes('elkjs')) {
            return 'graph-vendor'
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('scheduler')
          ) {
            return 'react-vendor'
          }

          if (id.includes('lucide-react')) {
            return 'icon-vendor'
          }

          return undefined
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:3001',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
