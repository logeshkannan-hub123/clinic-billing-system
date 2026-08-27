import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Vite rejects requests whose Host header it doesn't recognize (DNS
    // rebinding protection), which blocks anything reached through a
    // forwarded/tunneled URL (e.g. VS Code Dev Tunnels' *.devtunnels.ms).
    // `true` trusts any host — fine for a short-lived local testing tunnel,
    // but revert this if the dev server is ever reachable somewhere less
    // trusted than that.
    allowedHosts: true,
    proxy: {
      // Same-origin from the browser's point of view, so the session cookie
      // behaves as a normal first-party cookie in dev — see
      // docs/architecture/frontend.md.
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
