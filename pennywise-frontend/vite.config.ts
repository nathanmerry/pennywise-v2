import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@/components/ui': path.resolve(__dirname, 'components/ui'),
      '@/lib/utils': path.resolve(__dirname, 'lib/utils'),
      '@/lib/api': path.resolve(__dirname, 'src/lib/api'),
      '@/hooks': path.resolve(__dirname, 'src/hooks'),
      '@': path.resolve(__dirname, '.'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3382',
    },
  },
})
