import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Bind explicitly to loopback for security; use a standard, unreserved dev port
    host: '127.0.0.1',
    port: 5173,
  },
})
