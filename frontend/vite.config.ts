import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, res) => {
            // Write a service unavailable response instead of bubbling the error
            // to prevent Vite from outputting ugly tracebacks in the terminal log
            if (res && typeof (res as any).writeHead === 'function') {
              if (!(res as any).headersSent) {
                (res as any).writeHead(502, { 'Content-Type': 'application/json' });
              }
              res.end(JSON.stringify({ error: 'Backend connection refused or offline' }));
            }
          });
        },
      },
    },
  },
});
