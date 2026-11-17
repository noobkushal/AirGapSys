import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server binds to loopback only: this app is designed for an air-gapped host.
export default defineConfig({
  plugins: [react()],
  // ignore the backend folder when it is nested in this project (its SQLite/WAL files change constantly)
  server: { host: '127.0.0.1', port: 5173, watch: { ignored: ['**/clarix-backend/**', '**/.venv/**'] } },
  preview: { host: '127.0.0.1', port: 4173 },
});
