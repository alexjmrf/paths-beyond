import type { Hero, SoulInstance } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { poderDoHeroi } from '../src/logic/poder.js';
import { cliqueNoRecraft, custoDaSoul, estadoDoSlotDeSoul, soulDoHeroi, soulsDoPersonagem } from '../src/logic/soul.js';

// M39 5/N — o que a tela mostra da Soul. Nada aqui decide (regra 3): a trava de nível é
// `soulSlotOpen` do core com o número do catálogo, e o poder é o `resolveHeroStatSheet` da batalha.

const regras = catalog.economyRules.soul!;

const heroi = (level: number, soul: string | null = null): Hero => ({
  id: 'p1-ally-guerreiro',
  characterId: 'ally-guerreiro',
  classId: 'class-guerreiro',
  level,
  exp: 0,
  awakening: 0,
  imprint: 0,
  talents: {},
  equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
  soul,
  weaponType: 'axe',
  duelSkills: [],
  mapSkills: [],
  tacticsScript: [] as never,
});

const SOUL_RURIK: SoulInstance = {
  id: 'soul-p1-a',
  soulOf: 'ally-guerreiro',
  mainstat: { stat: 'atk', value: 30 },
  substats: [
    { stat: 'hp', value: 100 },
    { stat: 'spd', value: 4 },
  ],
  crafts: 1,
};
const SOUL_NYRA: SoulInstance = { ...SOUL_RURIK, id: 'soul-p1-b', soulOf: 'ally-lanceiro' };

describe('o slot da Soul', () => {
  it('o nível que abre o slot vem do catálogo (economy.json), não de constante na tela', () => {
    expect(regras.unlockLevel).toBe(20);
    expect(estadoDoSlotDeSoul(heroi(regras.unlockLevel - 1), regras)).toEqual({ aberto: false, nivelParaAbrir: regras.unlockLevel });
    expect(estadoDoSlotDeSoul(heroi(regras.unlockLevel), regras)).toEqual({ aberto: true, nivelParaAbrir: regras.unlockLevel });
  });

  it('a lista mostra só as Souls DAQUELE personagem', () => {
    expect(soulsDoPersonagem([SOUL_RURIK, SOUL_NYRA], 'ally-guerreiro')).toEqual([SOUL_RURIK]);
    expect(soulsDoPersonagem([SOUL_RURIK, SOUL_NYRA], undefined)).toEqual([]);
  });

  it('a Soul equipada só conta se for do personagem do herói', () => {
    expect(soulDoHeroi(heroi(20, SOUL_RURIK.id), [SOUL_RURIK])).toEqual(SOUL_RURIK);
    expect(soulDoHeroi(heroi(20, SOUL_NYRA.id), [SOUL_NYRA])).toBeUndefined();
    expect(soulDoHeroi(heroi(20, null), [SOUL_RURIK])).toBeUndefined();
  });
});

// O recraft re-sorteia TUDO e apaga a Soul atual (D59): o primeiro clique só arma, o segundo
// na MESMA Soul manda (decisão do usuário ao aprovar o plano da 5/N).
describe('o recraft em dois cliques', () => {
  it('o primeiro clique arma, o segundo na mesma Soul confirma', () => {
    expect(cliqueNoRecraft(null, 'soul-a')).toEqual({ enviar: false, armada: 'soul-a' });
    expect(cliqueNoRecraft('soul-a', 'soul-a')).toEqual({ enviar: true, armada: null });
  });

  it('clicar em outra Soul rearma nela em vez de mandar', () => {
    expect(cliqueNoRecraft('soul-a', 'soul-b')).toEqual({ enviar: false, armada: 'soul-b' });
  });
});

describe('o custo exibido', () => {
  it('vem de economy.json, com o que o jogador tem e o que precisa', () => {
    const [materialId, precisa] = Object.entries(regras.craftCost.materials)[0]!;
    const custo = custoDaSoul(regras.craftCost, { gold: 1_000_000 }, { [materialId]: precisa });
    expect(custo.ouro).toEqual({ tem: 1_000_000, precisa: regras.craftCost.gold });
    expect(custo.materiais).toEqual([{ id: materialId, tem: precisa, precisa }]);
    expect(custo.basta).toBe(true);
  });

  it('falta de material ou de ouro não basta', () => {
    const [materialId, precisa] = Object.entries(regras.recraftCost.materials)[0]!;
    expect(custoDaSoul(regras.recraftCost, { gold: 1_000_000 }, { [materialId]: precisa - 1 }).basta).toBe(false);
    expect(custoDaSoul(regras.recraftCost, { gold: regras.recraftCost.gold - 1 }, { [materialId]: precisa }).basta).toBe(false);
  });
});

describe('o poder do herói', () => {
  it('inclui a Soul equipada, pelo mesmo cálculo da batalha', () => {
    const sem = poderDoHeroi({ hero: heroi(20), equippedItems: [] }, [], [SOUL_RURIK]);
    const com = poderDoHeroi({ hero: heroi(20, SOUL_RURIK.id), equippedItems: [] }, [], [SOUL_RURIK]);
    expect(sem).not.toBeNull();
    expect(com! - sem!).toBe(30 + 100 + 4);
  });
});
