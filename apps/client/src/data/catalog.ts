import { loadCatalogFromBrowser } from './loadCatalogFromBrowser.js';

// Catálogo carregado uma vez no boot do módulo — `import.meta.glob({eager:true})` já
// resolveu todo o JSON em build-time, então `loadCatalogFromBrowser()` não faz I/O de
// rede nenhuma aqui, só validação/indexação (síncrono, barato o suficiente pra rodar no
// top-level do módulo em vez de um estado de loading assíncrono).
export const catalog = loadCatalogFromBrowser();
