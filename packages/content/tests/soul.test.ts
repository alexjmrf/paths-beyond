import { describe, expect, it } from 'vitest';
import { craftSoul, generateSoul, validateSoul, type SoulRules } from '@paths-beyond/core';
import { buildCatalog } from '../src/buildCatalog.js';
import { loadCatalogFromDisk, readContentFilesFromDisk } from '../src/loadCatalogFromDisk.js';

// M39 3/N (D60) — a Soul conversando com o resto do catálogo e com o motor do core. O schema valida
// cada arquivo sozinho; o que cruza tipos (o material do custo existe e é genérico? toda opção de
// mainstat deixa dois substats elegíveis na tabela?) é `buildCatalog`, e falha ALTO na carga.

const catalog = loadCatalogFromDisk();
const ESSENCIA = 'material-essencia-de-alma';

function regras(): SoulRules {
  const soul = catalog.economyRules.soul;
  if (!soul) throw new Error('o catálogo real não trouxe as regras da Soul');
  return soul;
}

function comEconomiaAlterada(patchSoul: Record<string, unknown>) {
  const files = readContentFilesFromDisk();
  return () =>
    buildCatalog({
      ...files,
      economyRules: (files.economyRules ?? []).map((raw) => {
        const e = raw as { soul: object };
        return { ...e, soul: { ...e.soul, ...patchSoul } };
      }),
    });
}

describe('o catálogo carrega a Soul', () => {
  it('uma definição por personagem do elenco, indexada pelo personagem, com `soulOf` = ele', () => {
    const personagens = Object.keys(catalog.characters).sort();
    expect(Object.keys(catalog.characterSouls).sort()).toEqual(personagens);
    for (const [id, def] of Object.entries(catalog.characterSouls)) expect(def.soulOf).toBe(id);
  });

  it('as regras chegam ao `economyRules`, no formato que o core consome', () => {
    const r = regras();
    expect(r.unlockLevel).toBe(20);
    expect(r.substats.length).toBeGreaterThanOrEqual(2);
    expect(r.craftCost.materials[ESSENCIA]).toBe(40);
    expect(r.recraftCost.materials[ESSENCIA]).toBe(20);
  });
});

describe('o motor do core aceita o dado real', () => {
  it('toda Soul sorteada, de todo personagem, é válida contra o catálogo', () => {
    for (const def of Object.values(catalog.characterSouls)) {
      for (let seed = 1; seed <= 100; seed++) {
        const soul = generateSoul({ id: `soul-${seed}`, def, rules: regras(), seed, crafts: 1 });
        expect(validateSoul(soul, def, regras()), `${def.soulOf} seed ${seed}`).toEqual([]);
      }
    }
  });

  it('o mainstat de um personagem, numa Soul de outro, é recusado', () => {
    const aren = catalog.characterSouls['hero-jogador']!;
    const miron = catalog.characterSouls['ally-clerigo']!;
    const soul = generateSoul({ id: 's', def: miron, rules: regras(), seed: 1, crafts: 1 });
    expect(validateSoul({ ...soul, soulOf: 'hero-jogador', mainstat: { stat: 'heal', value: 60 } }, aren, regras())).not.toEqual([]);
  });

  it('o craft paga com a Essência real e entrega a Soul do personagem escolhido', () => {
    const r = craftSoul({
      id: 'soul-x',
      characterId: 'ally-arqueiro',
      def: catalog.characterSouls['ally-arqueiro']!,
      rules: regras(),
      wallet: { gold: 5000, stones: 0, arenaMarks: 0 },
      materials: { [ESSENCIA]: 40 },
      seed: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.soul.soulOf).toBe('ally-arqueiro');
      expect(r.wallet.gold).toBe(0);
      expect(r.materials[ESSENCIA]).toBe(0);
    }
  });
});

describe('as referências cruzadas falham alto', () => {
  it('custo com material que não existe', () => {
    expect(comEconomiaAlterada({ craftCost: { gold: 1, materials: { 'material-inexistente': 1 } } })).toThrow(/não existe/);
  });

  it('custo com material que não é genérico (a Soul se crafta de material GENÉRICO)', () => {
    expect(comEconomiaAlterada({ recraftCost: { gold: 1, materials: { 'material-nucleo-de-artefato': 1 } } })).toThrow(/genérico/);
  });

  it('tabela de substats que não deixa dois elegíveis fora de alguma opção de mainstat', () => {
    expect(comEconomiaAlterada({ substats: [{ stat: 'atk', weight: 1, valueRange: { min: 1, max: 2 } }, { stat: 'spd', weight: 1, valueRange: { min: 1, max: 2 } }] })).toThrow(
      /substats/,
    );
  });
});
