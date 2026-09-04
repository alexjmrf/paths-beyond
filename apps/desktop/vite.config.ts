import { defineConfig } from 'vite';

// M21, 1/N — o bundle da MEDIÇÃO de determinismo, não do jogo.
//
// Ele existe porque o renderer do Electron não resolve pacotes de workspace por conta
// própria: para medir o hash lá dentro é preciso entregar um arquivo já resolvido. Formato
// IIFE e um arquivo só, porque o processo principal o injeta como texto via
// `executeJavaScript` — sem servidor, sem `import`, sem rede.
export default defineConfig({
  build: {
    outDir: 'dist-renderer',
    emptyOutDir: true,
    lib: {
      entry: 'src/determinismRenderer.ts',
      formats: ['iife'],
      name: 'PathsBeyondDeterminism',
      fileName: () => 'determinism.js',
    },
  },
});
