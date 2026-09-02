import { describe, expect, it } from 'vitest';
import { awaken } from '../../src/economy/awakening.js';
import { applyImprint } from '../../src/economy/imprint.js';
import type { AwakeningStep, ImprintStep, MaterialDef, Wallet } from '../../src/economy/types.js';
import { resolveHeroStatSheet } from '../../src/hero/resolve.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { StatSheet } from '../../src/stats/types.js';

// M14, sub-sessão 1/N — §10: "Awakening (0–6): multiplica a curva base e libera nós
// avançados de talento a partir de 5" e "Imprint: duplicatas viram bônus permanente de
// stat".
//
// O EFEITO dos dois em stats existe desde M7 (`resolveHeroStatSheet`, passos 1b e 5). O
// que não existia era como se GANHA: awakening consome materiais de chefe + ouro, imprint
// consome fragmentos do herói (decisão do usuário em M14 1/N). Custos são dado, nunca
// código — daí todo teste aqui passar as tabelas por parâmetro.

function curva(): Partial<StatSheet>[] {
  const c: Partial<StatSheet>[] = [];
  for (let i = 0; i < 60; i++) c.push(i === 9 ? { hp: 5000, atk: 800, def: 500, spd: 100 } : {});
  return c;
}

const classDef: ClassDef = {
  id: 'classe-teste',
  name: 'Classe de teste',
  tier: 'base',
  unitType: 'infantry',
  moveType: 'foot',
  moveRange: 5,
  allowedWeapons: ['sword'],
  basePools: { ap: 3, pp: 2 },
  statCurve: curva(),
  // Awakening 1 multiplica a curva base por 1,2 (escala 1000).
  awakeningMultipliers: [1000, 1200, 1200, 1200, 1200, 1200, 1200],
  promotionFlat: [],
  imprintFlat: [[], [{ stat: 'atk', flat: 60 }], [{ stat: 'atk', flat: 60 }], [], [], []],
};

const heroi: Hero = {
  id: 'heroi-teste',
  classId: 'classe-teste',
  level: 10,
  exp: 0,
  awakening: 0,
  imprint: 0,
  talents: {},
  equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
  weaponType: 'sword',
  duelSkills: [],
  mapSkills: [],
  tacticsScript: [],
};

const NUCLEO = 'material-teste-nucleo';
const FRAGMENTO = 'material-teste-fragmento';

const passosDeAwakening: readonly AwakeningStep[] = [
  { gold: 100, materials: { [NUCLEO]: 2 } }, // 0 → 1
  { gold: 200, materials: { [NUCLEO]: 4 } }, // 1 → 2
  { gold: 300, materials: { [NUCLEO]: 6 } },
  { gold: 400, materials: { [NUCLEO]: 8 } },
  { gold: 500, materials: { [NUCLEO]: 10 } },
  { gold: 600, materials: { [NUCLEO]: 12 } }, // 5 → 6
];

const passosDeImprint: readonly ImprintStep[] = [
  { fragments: 1 },
  { fragments: 2 },
  { fragments: 3 },
  { fragments: 4 },
  { fragments: 5 },
];

const fragmentoDoHeroi: MaterialDef = {
  id: FRAGMENTO,
  name: 'Fragmento do herói de teste',
  kind: 'heroFragment',
  forHeroId: 'heroi-teste',
};

const carteira: Wallet = { gold: 10_000, stones: 0, arenaMarks: 0 };

function statsDe(hero: Hero): StatSheet {
  // A árvore vazia é o assunto deste arquivo: progressão mede nível, awakening e imprint,
  // e nenhum dos três passa por talento.
  return resolveHeroStatSheet({ hero, classDef, talentTree: [], equippedItems: [], itemSets: {} });
}

describe('awaken', () => {
  it('sobe um rank cobrando exatamente o que o dado manda', () => {
    const r = awaken({ hero: heroi, wallet: carteira, materials: { [NUCLEO]: 5 }, steps: passosDeAwakening });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hero.awakening).toBe(1);
    expect(r.wallet.gold).toBe(9_900);
    expect(r.materials[NUCLEO]).toBe(3);
  });

  it('o rank novo multiplica a curva base de verdade (§10)', () => {
    const antes = statsDe(heroi);
    const r = awaken({ hero: heroi, wallet: carteira, materials: { [NUCLEO]: 5 }, steps: passosDeAwakening });
    if (!r.ok) throw new Error('deveria ter despertado');
    const depois = statsDe(r.hero);
    expect(depois.atk).toBeGreaterThan(antes.atk);
    expect(depois.atk).toBe(960); // 800 × 1,2
  });

  it('rejeita sem material suficiente, sem cobrar nada', () => {
    const r = awaken({ hero: heroi, wallet: carteira, materials: { [NUCLEO]: 1 }, steps: passosDeAwakening });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toContain(NUCLEO);
  });

  it('rejeita sem ouro suficiente', () => {
    const pobre: Wallet = { gold: 50, stones: 0, arenaMarks: 0 };
    const r = awaken({ hero: heroi, wallet: pobre, materials: { [NUCLEO]: 9 }, steps: passosDeAwakening });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('ouro');
  });

  it('para em 6, que é o teto de §10', () => {
    const noTeto: Hero = { ...heroi, awakening: 6 };
    const r = awaken({ hero: noTeto, wallet: carteira, materials: { [NUCLEO]: 99 }, steps: passosDeAwakening });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('6');
  });

  it('vai de 0 a 6 encadeado, cobrando a tabela inteira', () => {
    let hero = heroi;
    let wallet = carteira;
    let materials = { [NUCLEO]: 42 }; // 2+4+6+8+10+12
    for (let rank = 1; rank <= 6; rank++) {
      const r = awaken({ hero, wallet, materials, steps: passosDeAwakening });
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      hero = r.hero;
      wallet = r.wallet;
      materials = { ...r.materials } as { [NUCLEO]: number };
      expect(hero.awakening).toBe(rank);
    }
    expect(materials[NUCLEO]).toBe(0);
    expect(wallet.gold).toBe(10_000 - 2100);
  });

  it('não muda nada além de awakening no herói', () => {
    const r = awaken({ hero: heroi, wallet: carteira, materials: { [NUCLEO]: 5 }, steps: passosDeAwakening });
    if (!r.ok) throw new Error('deveria ter despertado');
    expect({ ...r.hero, awakening: 0 }).toEqual(heroi);
  });
});

describe('applyImprint', () => {
  it('consome fragmento e sobe o imprint', () => {
    const r = applyImprint({
      hero: heroi,
      materials: { [FRAGMENTO]: 3 },
      fragment: fragmentoDoHeroi,
      steps: passosDeImprint,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.hero.imprint).toBe(1);
    expect(r.materials[FRAGMENTO]).toBe(2);
  });

  it('o imprint novo vira bônus permanente de stat (§10)', () => {
    const antes = statsDe(heroi);
    const r = applyImprint({
      hero: heroi,
      materials: { [FRAGMENTO]: 1 },
      fragment: fragmentoDoHeroi,
      steps: passosDeImprint,
    });
    if (!r.ok) throw new Error('deveria ter aplicado');
    expect(statsDe(r.hero).atk).toBe(antes.atk + 60);
  });

  it('fragmento de OUTRO herói não serve', () => {
    const deOutro: MaterialDef = { ...fragmentoDoHeroi, forHeroId: 'outro-heroi' };
    const r = applyImprint({ hero: heroi, materials: { [FRAGMENTO]: 5 }, fragment: deOutro, steps: passosDeImprint });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('outro-heroi');
  });

  it('material que não é fragmento não serve', () => {
    const nucleo: MaterialDef = { id: NUCLEO, name: 'Núcleo', kind: 'awakening' };
    const r = applyImprint({ hero: heroi, materials: { [NUCLEO]: 5 }, fragment: nucleo, steps: passosDeImprint });
    expect(r.ok).toBe(false);
  });

  it('rejeita sem fragmentos suficientes', () => {
    const noSegundo: Hero = { ...heroi, imprint: 1 }; // exige 2
    const r = applyImprint({
      hero: noSegundo,
      materials: { [FRAGMENTO]: 1 },
      fragment: fragmentoDoHeroi,
      steps: passosDeImprint,
    });
    expect(r.ok).toBe(false);
  });

  it('para em 5, que é o tamanho da tabela de imprint da classe (§4.2)', () => {
    const noTeto: Hero = { ...heroi, imprint: 5 };
    const r = applyImprint({
      hero: noTeto,
      materials: { [FRAGMENTO]: 99 },
      fragment: fragmentoDoHeroi,
      steps: passosDeImprint,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('5');
  });
});
