import { describe, expect, it } from 'vitest';
import { MELEE_ASSIST_RANGE, resolveHeroCombatProfile } from '../../src/hero/combatProfile.js';
import { resolveEnemyCombatProfile } from '../../src/enemy/combatProfile.js';
import type { EnemyDef } from '../../src/enemy/types.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { StatSheet } from '../../src/stats/types.js';
import type { WeaponType } from '../../src/tactics/types.js';

// §8.1 (M17, 3/N) — "Inimigo de fase NÃO é personagem: autorado direto, com status e
// skills escolhidos para a dificuldade pretendida, sem classe a resolver, sem nível a
// interpolar, sem árvore e sem alocação de talento."
//
// Este arquivo prova as duas metades disso: que a força declarada CHEGA intacta ao perfil
// de combate (nada a agrega, nada a multiplica), e que o que NÃO é força — alcance de
// arma, reações universais — continua saindo de onde sai para todo mundo. Um inimigo que
// pudesse declarar o próprio `duelRange` fura a assimetria de §6.1.

const weaponDuelRanges: Record<WeaponType, number> = {
  sword: 1,
  axe: 1,
  spear: 1,
  bow: 2,
  arcane: 2,
  nature: 2,
  holy: 2,
};

function statSheet(overrides: Partial<StatSheet> = {}): StatSheet {
  return {
    hp: 980,
    atk: 150,
    def: 92,
    spd: 84,
    chc: 100,
    chd: 1500,
    eff: 0,
    efr: 0,
    pen: 0,
    heal: 0,
    lifesteal: 0,
    focus: 0,
    vigor: 0,
    ...overrides,
  };
}

const basico: SkillDef = {
  id: 'skill-basico',
  name: 'Golpe Básico',
  kind: 'duel',
  apCost: 1,
  cooldown: 0,
  multiplier: 1000,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
};

const mapa: SkillDef = {
  id: 'skill-grito',
  name: 'Grito',
  kind: 'map',
  apCost: 1,
  cooldown: 1,
  multiplier: 0,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  tags: [],
};

const contra: SkillDef = {
  id: 'react-contra',
  name: 'Contra-atacar',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 800,
  flat: 0,
  scalesWith: 'atk',
  trigger: 'onAttacked',
  effects: [],
  tags: ['physical'],
};

const defender: SkillDef = {
  id: 'react-defender',
  name: 'Defender',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 0,
  flat: 0,
  scalesWith: 'atk',
  trigger: 'onAttacked',
  effects: [],
  tags: [],
};

const skillsCatalog: Record<string, SkillDef> = {
  [basico.id]: basico,
  [mapa.id]: mapa,
  [contra.id]: contra,
  [defender.id]: defender,
};

const baselineReactionSkillIds = [contra.id, defender.id];

const patrulheiro: EnemyDef = {
  id: 'enemy-patrulheiro',
  name: 'Patrulheiro',
  stats: statSheet(),
  unitType: 'infantry',
  weaponType: 'spear',
  moveType: 'foot',
  moveRange: 4,
  pools: { ap: 2, pp: 2 },
  duelSkills: [basico.id],
  mapSkills: [mapa.id],
  tacticsScript: [{ enabled: true, skillId: basico.id, conditions: [] }],
};

function resolver(overrides: Partial<EnemyDef> = {}) {
  return resolveEnemyCombatProfile({
    enemy: { ...patrulheiro, ...overrides },
    skillsCatalog,
    weaponDuelRanges,
    baselineReactionSkillIds,
  });
}

describe('resolveEnemyCombatProfile — a força declarada chega intacta', () => {
  it('os stats são os do dado, sem curva, sem despertar e sem imprint no caminho', () => {
    // A asserção é de IGUALDADE e não de "maior que": qualquer agregação a mais — um
    // multiplicador de 1000 aplicado por engano, um flat de promoção — apareceria aqui.
    expect(resolver().stats).toEqual(patrulheiro.stats);
  });

  it('os pools são os do dado — nada de basePools de classe mais bônus de talento', () => {
    const profile = resolver({ pools: { ap: 3, pp: 1 } });
    expect(profile.startingAp).toBe(3);
    expect(profile.startingPp).toBe(1);
  });

  it('unitType, moveType e moveRange vêm do inimigo, não de uma classe', () => {
    const profile = resolver({ unitType: 'flying', moveType: 'flying', moveRange: 6 });
    expect(profile.unitType).toBe('flying');
    expect(profile.moveType).toBe('flying');
    expect(profile.moveRange).toBe(6);
  });

  it('o script tático é o declarado, e o inimigo não tem efeito de set nenhum', () => {
    // Sem equipamento não há set, e `setSpecialEffectIds` vazio é a leitura certa — o
    // campo existe em `HeroCombatProfile` e precisa ter valor definido, não ausente.
    const profile = resolver();
    expect(profile.tacticsScript).toEqual(patrulheiro.tacticsScript);
    expect(profile.setSpecialEffectIds).toEqual([]);
  });
});

describe('resolveEnemyCombatProfile — o que NÃO é força continua vindo de onde sempre veio', () => {
  it('§6.1 — duelRange sai da tabela de armas, e o inimigo não pode declará-lo', () => {
    expect(resolver({ weaponType: 'spear' }).duelRange).toBe(1);
    expect(resolver({ weaponType: 'bow' }).duelRange).toBe(2);
  });

  it('§15 — assistRange é MELEE_ASSIST_RANGE em corpo a corpo e duelRange em alcance', () => {
    expect(resolver({ weaponType: 'spear' }).assistRange).toBe(MELEE_ASSIST_RANGE);
    expect(resolver({ weaponType: 'bow' }).assistRange).toBe(2);
  });

  it('§6.4 — as reações universais entram sozinhas, sem o inimigo pedir', () => {
    const profile = resolver();
    expect(profile.reactionScript.map((line) => line.skillId)).toEqual(baselineReactionSkillIds);
    for (const id of baselineReactionSkillIds) expect(profile.knownSkills[id]).toBeDefined();
  });

  it('as skills declaradas entram em knownSkills, de duelo e de mapa', () => {
    const profile = resolver();
    expect(profile.knownSkills[basico.id]).toEqual(basico);
    expect(profile.knownSkills[mapa.id]).toEqual(mapa);
  });

  it('skill fora do catálogo é ignorada em silêncio — mesmo precedente do herói', () => {
    const profile = resolver({ duelSkills: [basico.id, 'skill-que-nao-existe'] });
    expect(profile.knownSkills['skill-que-nao-existe']).toBeUndefined();
    expect(profile.knownSkills[basico.id]).toBeDefined();
  });
});

describe('a força congelada: o inimigo autorado reproduz o que o caminho de Hero produzia', () => {
  // É a propriedade que sustenta a migração inteira desta fatia. Se ela não valesse, trocar
  // o modelo de inimigo mudaria a dificuldade dos 14 encontros em silêncio, e nenhum teste
  // de campanha existente saberia dizer se a diferença foi intencional.
  const curva = Array.from({ length: 60 }, () => ({ hp: 980, atk: 150, def: 92, spd: 84 }));

  const classe: ClassDef = {
    id: 'classe-lanceiro',
    name: 'Lanceiro',
    tier: 'base',
    unitType: 'infantry',
    moveType: 'foot',
    moveRange: 4,
    allowedWeapons: ['spear'],
    basePools: { ap: 2, pp: 2 },
    statCurve: curva,
    awakeningMultipliers: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
    promotionFlat: [],
    imprintFlat: [[], [], [], [], [], []],
  };

  const heroi: Hero = {
    id: 'unit-patrulheiro-1',
    classId: classe.id,
    level: 8,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'spear',
    duelSkills: [basico.id],
    mapSkills: [mapa.id],
    tacticsScript: [{ enabled: true, skillId: basico.id, conditions: [] }],
  };

  it('os dois caminhos produzem o MESMO perfil de combate', () => {
    const pelaFicha = resolveHeroCombatProfile({
      hero: heroi,
      classDef: classe,
      equippedItems: [],
      itemSets: {},
      talentTree: [],
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });

    const autorado = resolveEnemyCombatProfile({
      enemy: {
        id: 'enemy-patrulheiro',
        name: 'Patrulheiro',
        stats: pelaFicha.stats,
        unitType: classe.unitType,
        weaponType: heroi.weaponType,
        moveType: classe.moveType,
        moveRange: classe.moveRange,
        pools: { ap: classe.basePools.ap, pp: classe.basePools.pp },
        duelSkills: heroi.duelSkills,
        mapSkills: heroi.mapSkills,
        tacticsScript: heroi.tacticsScript,
      },
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds,
    });

    expect(autorado).toEqual(pelaFicha);
  });
});
