import { defineConfig } from 'vite';

// M21, 1/N — o `preload`, empacotado em CommonJS.
//
// Electron carrega preload como CJS quando o renderer está em `sandbox: true`, e o pacote
// declara `"type": "module"` — então o arquivo precisa da extensão `.cjs` para não ser lido
// como ESM. Um config próprio porque o formato é diferente do bundle do renderer.
export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    lib: {
      entry: 'src/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs',
    },
    rollupOptions: { external: ['electron'] },
  },
});
