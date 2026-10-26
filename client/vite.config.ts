import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': 'http://localhost:5000',
      '/fdrs': 'http://localhost:5000',
      '/release-requests': 'http://localhost:5000',
      '/copilot': 'http://localhost:5000',
      '/dashboard': 'http://localhost:5000',
      '/reports': 'http://localhost:5000',
      '/admin': 'http://localhost:5000',
      '/audit': 'http://localhost:5000'
    }
  }
});
