import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // M13, sub-sessão 2/N — o cliente fala com o servidor de M7 por caminho relativo
    // (`/api/...`) e o Vite encaminha. Sem isto seria uma origem diferente e a chamada
    // morreria no CORS; resolver por proxy de desenvolvimento evita registrar plugin de
    // CORS no Fastify só por causa do laço local.
    proxy: {
      '/api': {
        target: process.env.PATHS_BEYOND_SERVER ?? 'http://127.0.0.1:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
});
