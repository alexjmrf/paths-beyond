import { describe, expect, it } from 'vitest';
import { loadCatalogFromDisk } from '../src/loadCatalogFromDisk.js';

// §9.4 (M21, 3/N) — o ESPELHO das conquistas na plataforma, conferido contra o catálogo real.
//
// O schema de `packages/data` já garante que cada arquivo tem `platformId` e que ele está no
// formato que a Steam aceita. O que um schema NÃO consegue ver é o conjunto: dois arquivos
// com o mesmo espelho passam a validação isolada e, na plataforma, limpar uma masmorra
// desbloquearia a conquista de limpar quatro. Isso é validação cruzada, e por isso mora aqui.
//
// O teste também é o que falha quando alguém autora uma conquista nova e esquece o espelho —
// o erro mais provável desta fatia, e o único cujo sintoma seria silêncio.

describe('as conquistas do catálogo e o espelho na plataforma', () => {
  const catalog = loadCatalogFromDisk();
  const conquistas = Object.values(catalog.achievements);

  it('as 10 conquistas autoradas têm espelho na plataforma', () => {
    expect(conquistas).toHaveLength(10);
    for (const conquista of conquistas) {
      expect(conquista.platformId, conquista.id).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('nenhum espelho é compartilhado por duas conquistas', () => {
    const espelhos = conquistas.map((conquista) => conquista.platformId);
    expect(new Set(espelhos).size).toBe(espelhos.length);
  });

  // Os eventos são a outra fonte autorada da moeda premium e dividem rota, repositório e
  // idempotência com as conquistas (M18, 4/N) — mas NÃO têm espelho, porque evento é janela
  // de tempo e conquista de plataforma não expira. Se um dia um evento ganhar `platformId`,
  // este teste é o lugar onde a decisão será reaberta de propósito.
  it('os eventos não têm espelho — evento expira, conquista não', () => {
    for (const evento of Object.values(catalog.events)) {
      expect(evento, evento.id).not.toHaveProperty('platformId');
    }
  });
});
