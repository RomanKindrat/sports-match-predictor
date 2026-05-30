import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      '@testing-library/react': path.resolve(__dirname, 'node_modules/@testing-library/react'),
      '@testing-library/user-event': path.resolve(__dirname, 'node_modules/@testing-library/user-event'),
    },
  },
  test: {
    root: path.resolve(__dirname, '..'),
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: [
        'frontend/src/api.js',
        'frontend/src/i18n.js',
        'frontend/src/constants.js',
        'frontend/src/utils/**/*.js',
        'frontend/src/components/**/*.jsx',
        'frontend/src/pages/*.jsx',
      ],
      exclude: ['frontend/src/main.jsx'],
    },
  },
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
