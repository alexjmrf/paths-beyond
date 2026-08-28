import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { loadCatalogFromDisk } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { loadShopCatalog, realDataRootDir } from '../src/shop/catalog.js';

// §10 — "Na loja de PvP venda gear de set específico e cosméticos — **nunca poder bruto**",
// e o critério de aceite de M14: "nenhuma moeda compra poder bruto".
//
// A frase precisava de uma definição VERIFICÁVEL, senão o critério não é testável. A que
// ficou registrada em `DECISIONS.md` (M14 1/N) e que este arquivo trava:
//
//   1. Nenhuma oferta concede material, fragmento ou enhance — as coisas que fazem o herói
//      subir de patamar só vêm de jogar.
//   2. Todo item vendido existe no MESMO pool que dropa: a loja não inventa item exclusivo
//      mais forte, ela adianta o que a masmorra daria.
//   3. Nenhuma moeda compra awakening ou imprint: o único caminho é material de masmorra.
//
// A 3ª é sobre o SERVIDOR e não sobre o dado — por isso ela é lida do código das rotas, não
// de um JSON: o que garante a regra é não existir rota que troque moeda por rank.

const catalog = loadCatalogFromDisk();
const shop = loadShopCatalog();
const dataRoot = realDataRootDir();

describe('a loja não vende poder bruto (§10)', () => {
  it('a loja tem oferta (senão os testes abaixo passam por vazio)', () => {
    expect(Object.keys(shop).length).toBeGreaterThan(0);
  });

  it('nenhuma oferta vende material, fragmento ou qualquer coisa que não seja item de equipamento', () => {
    const materialIds = new Set(Object.keys(catalog.materials));
    for (const offer of Object.values(shop)) {
      expect(materialIds.has(offer.item.id), `${offer.id} vende material`).toBe(false);
      expect(offer.item.slot, `${offer.id} sem slot de equipamento`).toBeTruthy();
    }
  });

  it('todo item vendido existe no catálogo comum — a loja não inventa item exclusivo', () => {
    for (const offer of Object.values(shop)) {
      expect(catalog.items[offer.item.id], `${offer.id} vende item fora do catálogo`).toBeDefined();
    }
  });

  it('todo SET vendido também dropa em alguma masmorra: a loja adianta, não cria poder', () => {
    const setsQueDropam = new Set(
      Object.values(catalog.dungeons).flatMap((dungeon) => (dungeon.gearDrops ?? []).map((drop) => drop.setId)),
    );
    for (const offer of Object.values(shop)) {
      expect(setsQueDropam, `${offer.id} vende um set que nenhuma masmorra dropa`).toContain(offer.item.setId);
    }
  });

  it('nenhum item vendido vem aprimorado ou reforjado — enhance se conquista, não se compra', () => {
    for (const offer of Object.values(shop)) {
      expect(offer.item.enhance, `${offer.id} vende item já aprimorado`).toBe(0);
      expect(offer.item.reforged, `${offer.id} vende item reforjado`).toBe(false);
    }
  });
});

describe('nenhuma moeda compra progressão (§10 / critério de aceite de M14)', () => {
  const routesDir = join(dataRoot, '..', '..', 'apps', 'server', 'src');

  function readAllRoutes(): string {
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('routes.ts') || entry.name.endsWith('Routes.ts')) files.push(full);
      }
    };
    walk(routesDir);
    return files.map((file) => readFileSync(file, 'utf8')).join('\n');
  }

  const rotas = readAllRoutes();

  it('awakening e imprint são cobrados em MATERIAL, e o material só vem de masmorra', () => {
    // As duas rotas existem e chamam o motor, que cobra `steps[].materials`.
    expect(rotas).toContain("'/heroes/:heroId/awaken'");
    expect(rotas).toContain("'/heroes/:heroId/imprint'");

    // A tabela de custo de awakening cobra material em todos os passos.
    for (const passo of catalog.economyRules.awakening) {
      expect(Object.keys(passo.materials).length, 'passo de awakening sem material').toBeGreaterThan(0);
    }

    // E todo material cobrado dropa em masmorra — não há outra fonte.
    const dropados = new Set(
      Object.values(catalog.dungeons).flatMap((d) => (d.materialDrops ?? []).map((drop) => drop.materialId)),
    );
    for (const passo of catalog.economyRules.awakening) {
      for (const materialId of Object.keys(passo.materials)) {
        expect(dropados, `${materialId} é cobrado mas não dropa`).toContain(materialId);
      }
    }
  });

  it('a loja cobra em marcas de arena, que só vêm de jogar PvP', () => {
    for (const offer of Object.values(shop)) {
      expect(offer.priceMarks).toBeGreaterThan(0);
    }
    // Não existe rota que converta ouro/pedras em marcas: se existisse, ouro de PvE
    // compraria indiretamente o que a loja vende.
    expect(rotas).not.toMatch(/updateArenaMarks\([^)]*gold/);
    expect(rotas).not.toMatch(/arenaMarks:\s*player\.gold/);
  });

  it('o enhance cobra recurso de PvE e é uma CHANCE, não uma compra garantida', () => {
    // §7.3 — chance decrescente. Se todos os marcos fossem 100%, "comprar +15" seria
    // exatamente comprar poder bruto.
    const taxas = [
      catalog.enhanceRates.toThree,
      catalog.enhanceRates.toSix,
      catalog.enhanceRates.toNine,
      catalog.enhanceRates.toTwelve,
      catalog.enhanceRates.toFifteen,
    ];
    expect(taxas.filter((taxa) => taxa < 1000).length, 'todo marco de enhance é garantido').toBeGreaterThan(0);
  });
});
