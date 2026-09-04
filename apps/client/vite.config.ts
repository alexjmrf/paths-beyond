import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // §2 (M21, 2/N) — caminhos RELATIVOS no build.
  //
  // O padrão do Vite é `/assets/...`, absoluto, e isso funciona enquanto há um servidor
  // servindo a raiz. O shell desktop abre o `index.html` por `file://`, onde `/assets`
  // aponta para a raiz do disco do jogador — a tela abre em branco, sem erro visível.
  // Relativo funciona nos dois: servidor e arquivo.
  base: './',
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
