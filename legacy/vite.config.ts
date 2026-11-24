import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    host: true, // listen on all network interfaces so other devices on the LAN can connect
    proxy: { '/api': 'http://localhost:4000' },
    // The API and its SQLite files live in server/; changes there must not reload the browser.
    watch: { ignored: ['**/server/**'] },
  },
  build: { chunkSizeWarningLimit: 1200 },
});
