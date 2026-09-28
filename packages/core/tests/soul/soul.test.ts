import { describe, expect, it } from 'vitest';
import {
  SOUL_SUBSTAT_COUNT,
  assertSoulFitsHero,
  craftSoul,
  equipSoul,
  generateSoul,
  recraftSoul,
  resolveSoul,
  soulSlotOpen,
  validateSoul,
} from '../../src/soul/index.js';
import type { CharacterSoulDef, SoulInstance, SoulRules } from '../../src/soul/types.js';
import type { ArtifactDef, EquippedArtifact } from '../../src/artifacts/types.js';
import { buildBattleSetupFromHeroes } from '../../src/battle/assemble.js';
import { simulate } from '../../src/battle/simulate.js';
import { hashState } from '../../src/determinism/hash.js';
import type { Wallet } from '../../src/economy/types.js';
import type { EnemyDef } from '../../src/enemy/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import { resolveHeroCombatProfile } from '../../src/hero/combatProfile.js';
import { resolveHeroStatSheet } from '../../src/hero/resolve.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { ColumnTalentNode } from '../../src/talents/columnTree.js';

// M39 2/N — A SOUL: o 8º slot, travado por PERSONAGEM (`soulOf`), com mainstat sorteado entre as
// 2–3 opções DAQUELE personagem e dois substats de uma tabela própria. Craftada a partir de
// material genérico, escolhendo o personagem no ato; o recraft re-sorteia tudo na mesma
// instância; a conta pode guardar várias Souls do mesmo personagem (decisões do usuário,
// 2026-09-26).

const classDef: ClassDef = {
  id: 'classe-espadachim',
  name: 'Espadachim',
  tier: 'base',
  unitType: 'infantry',
  moveType: 'foot',
  moveRange: 4,
  allowedWeapons: ['sword'],
  basePools: { ap: 2, pp: 2 },
  statCurve: Array.from({ length: 60 }, () => ({ hp: 1000, atk: 200, def: 100, spd: 90 })),
  awakeningMultipliers: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
  promotionFlat: [],
  imprintFlat: [[], [], [], [], [], []],
};

const basico: SkillDef = {
  id: 'skill-basico', name: 'Golpe Básico', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};
const skillsCatalog: Readonly<Record<string, SkillDef>> = { [basico.id]: basico };
const weaponDuelRanges = { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 } as const;

const ESSENCIA = 'material-essencia-de-alma';

const soulDoKael: CharacterSoulDef = {
  soulOf: 'ally-kael',
  mainstatOptions: [
    { stat: 'atk', weight: 1, valueRange: { min: 40, max: 60 } },
    { stat: 'chc', weight: 1, valueRange: { min: 50, max: 80 } },
    { stat: 'focus', weight: 1, valueRange: { min: 60, max: 90 } },
  ],
};
const soulDaSylla: CharacterSoulDef = {
  soulOf: 'ally-sylla',
  mainstatOptions: [
    { stat: 'eff', weight: 1, valueRange: { min: 60, max: 90 } },
    { stat: 'vigor', weight: 1, valueRange: { min: 60, max: 90 } },
  ],
};

const rules: SoulRules = {
  unlockLevel: 20,
  substats: [
    { stat: 'atk', weight: 1, valueRange: { min: 5, max: 10 } },
    { stat: 'hp', weight: 1, valueRange: { min: 30, max: 50 } },
    { stat: 'def', weight: 1, valueRange: { min: 5, max: 10 } },
    { stat: 'spd', weight: 1, valueRange: { min: 2, max: 4 } },
    { stat: 'chc', weight: 1, valueRange: { min: 20, max: 40 } },
  ],
  craftCost: { gold: 1000, materials: { [ESSENCIA]: 10 } },
  recraftCost: { gold: 500, materials: { [ESSENCIA]: 5 } },
};

const wallet: Wallet = { gold: 5000, stones: 0, arenaMarks: 0 };

function heroi(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'heroi-kael',
    characterId: 'ally-kael',
    classId: classDef.id,
    level: 20,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType: 'sword',
    duelSkills: [basico.id],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: basico.id, conditions: [] }],
    ...overrides,
  };
}

function soulFixa(overrides: Partial<SoulInstance> = {}): SoulInstance {
  return {
    id: 'soul-1',
    soulOf: 'ally-kael',
    mainstat: { stat: 'atk', value: 50 },
    substats: [
      { stat: 'hp', value: 40 },
      { stat: 'spd', value: 3 },
    ],
    crafts: 1,
    ...overrides,
  };
}

const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe('generateSoul — o sorteio', () => {
  it('mesma seed, mesma Soul', () => {
    const a = generateSoul({ id: 's', def: soulDoKael, rules, seed: 42, crafts: 1 });
    const b = generateSoul({ id: 's', def: soulDoKael, rules, seed: 42, crafts: 1 });
    expect(a).toEqual(b);
  });

  it('o mainstat sai SEMPRE das opções daquele personagem, e todas aparecem', () => {
    const vistos = new Set<string>();
    for (const seed of SEEDS) {
      const soul = generateSoul({ id: 's', def: soulDoKael, rules, seed, crafts: 1 });
      const opcao = soulDoKael.mainstatOptions.find((o) => o.stat === soul.mainstat.stat);
      expect(opcao, `seed ${seed}`).toBeDefined();
      expect(soul.mainstat.value).toBeGreaterThanOrEqual(opcao!.valueRange.min);
      expect(soul.mainstat.value).toBeLessThanOrEqual(opcao!.valueRange.max);
      vistos.add(soul.mainstat.stat);
    }
    expect([...vistos].sort()).toEqual(['atk', 'chc', 'focus']);
  });

  it('exatamente dois substats, distintos, nunca o stat do mainstat, dentro da faixa da tabela da Soul', () => {
    expect(SOUL_SUBSTAT_COUNT).toBe(2);
    for (const seed of SEEDS) {
      const soul = generateSoul({ id: 's', def: soulDoKael, rules, seed, crafts: 1 });
      expect(soul.substats).toHaveLength(2);
      const stats = soul.substats.map((s) => s.stat);
      expect(new Set(stats).size).toBe(2);
      expect(stats).not.toContain(soul.mainstat.stat);
      for (const sub of soul.substats) {
        const entrada = rules.substats.find((e) => e.stat === sub.stat)!;
        expect(sub.value).toBeGreaterThanOrEqual(entrada.valueRange.min);
        expect(sub.value).toBeLessThanOrEqual(entrada.valueRange.max);
      }
      expect(validateSoul(soul, soulDoKael, rules)).toEqual([]);
    }
  });

  it('o contador de crafts muda o sorteio (o recraft não repete o craft)', () => {
    const diferentes = SEEDS.filter((seed) => {
      const um = generateSoul({ id: 's', def: soulDoKael, rules, seed, crafts: 1 });
      const dois = generateSoul({ id: 's', def: soulDoKael, rules, seed, crafts: 2 });
      return JSON.stringify(um) !== JSON.stringify(dois);
    });
    expect(diferentes.length).toBeGreaterThan(SEEDS.length / 2);
  });

  it('falha alto com menos de 2 ou mais de 3 opções de mainstat', () => {
    const uma: CharacterSoulDef = { ...soulDoKael, mainstatOptions: soulDoKael.mainstatOptions.slice(0, 1) };
    const quatro: CharacterSoulDef = {
      ...soulDoKael,
      mainstatOptions: [...soulDoKael.mainstatOptions, { stat: 'hp', weight: 1, valueRange: { min: 1, max: 2 } }],
    };
    expect(() => generateSoul({ id: 's', def: uma, rules, seed: 1, crafts: 1 })).toThrow(/2 a 3/);
    expect(() => generateSoul({ id: 's', def: quatro, rules, seed: 1, crafts: 1 })).toThrow(/2 a 3/);
  });

  it('falha alto se a tabela não tem dois substats elegíveis fora do mainstat', () => {
    const curta: SoulRules = { ...rules, substats: [{ stat: 'hp', weight: 1, valueRange: { min: 1, max: 2 } }] };
    expect(() => generateSoul({ id: 's', def: soulDoKael, rules: curta, seed: 1, crafts: 1 })).toThrow(/substat/);
  });
});

describe('validateSoul — a trava por PERSONAGEM é forma', () => {
  it('uma Soul válida não tem erro', () => {
    expect(validateSoul(soulFixa(), soulDoKael, rules)).toEqual([]);
  });

  it('recusa mainstat que não é opção daquele personagem', () => {
    expect(validateSoul(soulFixa({ mainstat: { stat: 'eff', value: 70 } }), soulDoKael, rules)).not.toEqual([]);
  });

  it('recusa Soul de outro personagem, mesmo com mainstat que existiria nele', () => {
    const daSylla = soulFixa({ soulOf: 'ally-sylla', mainstat: { stat: 'eff', value: 70 } });
    expect(validateSoul(daSylla, soulDoKael, rules)).not.toEqual([]);
    expect(validateSoul(daSylla, soulDaSylla, rules)).toEqual([]);
  });

  it('recusa valor fora da faixa, substat a mais, repetido, igual ao mainstat ou fora da tabela', () => {
    expect(validateSoul(soulFixa({ mainstat: { stat: 'atk', value: 999 } }), soulDoKael, rules)).not.toEqual([]);
    expect(validateSoul(soulFixa({ substats: [{ stat: 'hp', value: 40 }, { stat: 'spd', value: 3 }, { stat: 'def', value: 6 }] }), soulDoKael, rules)).not.toEqual([]);
    expect(validateSoul(soulFixa({ substats: [{ stat: 'hp', value: 40 }, { stat: 'hp', value: 41 }] }), soulDoKael, rules)).not.toEqual([]);
    expect(validateSoul(soulFixa({ substats: [{ stat: 'atk', value: 6 }, { stat: 'hp', value: 41 }] }), soulDoKael, rules)).not.toEqual([]);
    expect(validateSoul(soulFixa({ substats: [{ stat: 'pen', value: 6 }, { stat: 'hp', value: 41 }] }), soulDoKael, rules)).not.toEqual([]);
    expect(validateSoul(soulFixa({ substats: [{ stat: 'hp', value: 999 }, { stat: 'spd', value: 3 }] }), soulDoKael, rules)).not.toEqual([]);
  });
});

describe('craftSoul — material genérico, o personagem escolhido no ato', () => {
  it('consome o custo e entrega uma Soul DAQUELE personagem, com um craft contado', () => {
    const r = craftSoul({ id: 'soul-nova', characterId: 'ally-kael', def: soulDoKael, rules, wallet, materials: { [ESSENCIA]: 12 }, seed: 7 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.soul.id).toBe('soul-nova');
    expect(r.soul.soulOf).toBe('ally-kael');
    expect(r.soul.crafts).toBe(1);
    expect(r.wallet.gold).toBe(4000);
    expect(r.materials[ESSENCIA]).toBe(2);
    expect(r.soul).toEqual(generateSoul({ id: 'soul-nova', def: soulDoKael, rules, seed: 7, crafts: 1 }));
  });

  it('o MESMO material serve a qualquer personagem: o que muda é só a escolha', () => {
    const kael = craftSoul({ id: 'a', characterId: 'ally-kael', def: soulDoKael, rules, wallet, materials: { [ESSENCIA]: 10 }, seed: 1 });
    const sylla = craftSoul({ id: 'b', characterId: 'ally-sylla', def: soulDaSylla, rules, wallet, materials: { [ESSENCIA]: 10 }, seed: 1 });
    expect(kael.ok && sylla.ok).toBe(true);
    if (kael.ok && sylla.ok) {
      expect(kael.soul.soulOf).toBe('ally-kael');
      expect(sylla.soul.soulOf).toBe('ally-sylla');
      expect(['eff', 'vigor']).toContain(sylla.soul.mainstat.stat);
    }
  });

  it('a conta pode ter várias Souls do mesmo personagem: craftar de novo gera outra instância', () => {
    const um = craftSoul({ id: 'soul-a', characterId: 'ally-kael', def: soulDoKael, rules, wallet, materials: { [ESSENCIA]: 20 }, seed: 1 });
    expect(um.ok).toBe(true);
    if (!um.ok) return;
    const dois = craftSoul({ id: 'soul-b', characterId: 'ally-kael', def: soulDoKael, rules, wallet: um.wallet, materials: um.materials, seed: 2 });
    expect(dois.ok).toBe(true);
    if (dois.ok) expect(dois.soul.id).not.toBe(um.soul.id);
  });

  it('recusa sem ouro, sem material, e com a definição de outro personagem', () => {
    expect(craftSoul({ id: 'x', characterId: 'ally-kael', def: soulDoKael, rules, wallet: { ...wallet, gold: 999 }, materials: { [ESSENCIA]: 10 }, seed: 1 }).ok).toBe(false);
    expect(craftSoul({ id: 'x', characterId: 'ally-kael', def: soulDoKael, rules, wallet, materials: { [ESSENCIA]: 9 }, seed: 1 }).ok).toBe(false);
    expect(craftSoul({ id: 'x', characterId: 'ally-kael', def: soulDaSylla, rules, wallet, materials: { [ESSENCIA]: 10 }, seed: 1 }).ok).toBe(false);
  });

  it('é pura: não muta carteira nem materiais de entrada', () => {
    const materials = { [ESSENCIA]: 10 };
    const antes = structuredClone({ wallet, materials });
    craftSoul({ id: 'x', characterId: 'ally-kael', def: soulDoKael, rules, wallet, materials, seed: 1 });
    expect({ wallet, materials }).toEqual(antes);
  });
});

describe('recraftSoul — re-sorteia TUDO na mesma instância', () => {
  it('consome o custo de recraft, mantém id e dono, conta o craft e sorteia de novo', () => {
    const soul = generateSoul({ id: 'soul-1', def: soulDoKael, rules, seed: 3, crafts: 1 });
    const r = recraftSoul({ soul, def: soulDoKael, rules, wallet, materials: { [ESSENCIA]: 5 }, seed: 3 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.soul.id).toBe('soul-1');
    expect(r.soul.soulOf).toBe('ally-kael');
    expect(r.soul.crafts).toBe(2);
    expect(r.soul).toEqual(generateSoul({ id: 'soul-1', def: soulDoKael, rules, seed: 3, crafts: 2 }));
    expect(r.wallet.gold).toBe(4500);
    expect(r.materials[ESSENCIA]).toBe(0);
  });

  it('o mainstat pode mudar entre as opções — é o sumidouro repetível', () => {
    const mainstats = new Set<string>();
    let soul = generateSoul({ id: 'soul-1', def: soulDoKael, rules, seed: 9, crafts: 1 });
    for (let i = 0; i < 30; i++) {
      const r = recraftSoul({ soul, def: soulDoKael, rules, wallet, materials: { [ESSENCIA]: 5 }, seed: 9 });
      if (!r.ok) throw new Error(r.reason);
      soul = r.soul;
      mainstats.add(soul.mainstat.stat);
    }
    expect(mainstats.size).toBeGreaterThan(1);
    expect(soul.crafts).toBe(31);
  });

  it('recusa sem custo e com a definição de outro personagem', () => {
    const soul = soulFixa();
    expect(recraftSoul({ soul, def: soulDoKael, rules, wallet, materials: { [ESSENCIA]: 4 }, seed: 1 }).ok).toBe(false);
    expect(recraftSoul({ soul, def: soulDoKael, rules, wallet: { ...wallet, gold: 0 }, materials: { [ESSENCIA]: 5 }, seed: 1 }).ok).toBe(false);
    expect(recraftSoul({ soul, def: soulDaSylla, rules, wallet, materials: { [ESSENCIA]: 5 }, seed: 1 }).ok).toBe(false);
  });
});

describe('o slot — abre no nível declarado em dado, e só para o dono', () => {
  it('abaixo do nível o slot está fechado; no nível exato, aberto', () => {
    expect(soulSlotOpen(heroi({ level: 19 }), rules)).toBe(false);
    expect(soulSlotOpen(heroi({ level: 20 }), rules)).toBe(true);
  });

  it('o nível é parâmetro, não constante: outra regra, outro limiar', () => {
    expect(soulSlotOpen(heroi({ level: 20 }), { ...rules, unlockLevel: 25 })).toBe(false);
    expect(soulSlotOpen(heroi({ level: 5 }), { ...rules, unlockLevel: 5 })).toBe(true);
  });

  it('equipSoul recusa abaixo do nível e aceita no nível', () => {
    expect(equipSoul({ hero: heroi({ level: 19 }), soul: soulFixa(), rules }).ok).toBe(false);
    const r = equipSoul({ hero: heroi({ level: 20 }), soul: soulFixa(), rules });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.hero.soul).toBe('soul-1');
  });

  it('equipSoul recusa Soul de outro personagem e herói sem personagem', () => {
    expect(equipSoul({ hero: heroi(), soul: soulFixa({ soulOf: 'ally-sylla' }), rules }).ok).toBe(false);
    const { characterId: _semPersonagem, ...semId } = heroi();
    expect(equipSoul({ hero: semId, soul: soulFixa(), rules }).ok).toBe(false);
  });

  it('é pura: o herói de entrada não muda', () => {
    const hero = heroi();
    const antes = structuredClone(hero);
    equipSoul({ hero, soul: soulFixa(), rules });
    expect(hero).toEqual(antes);
  });
});

describe('agregação (§4.1) — a Soul é equipamento: flat no passo 3', () => {
  const artefatoAtkPct: ArtifactDef = {
    id: 'artifact-x',
    signatureOf: 'ally-kael',
    name: 'X',
    classId: classDef.id,
    rank: 'hero',
    atkByAwakening: [0, 0, 0, 0, 0, 0, 0],
    variableStat: { stat: 'def', byAwakening: [0, 0, 0, 0, 0, 0, 0] },
    imprintFlat: [[], [], [], [], [], []],
    passive: { t: 'stat', stat: 'atk', pctByImprint: [100, 100, 100, 100, 100, 100] },
  };
  const artefato: EquippedArtifact = { def: artefatoAtkPct, instance: { id: 'ai', artifactId: 'artifact-x', awakening: 0, imprint: 0 } };
  const talento: ColumnTalentNode[] = [
    { id: 't-atk', column: 'a', row: 1, maxRank: 1, effects: [{ t: 'stat', stat: 'atk', flat: 100 }] },
  ];

  it('resolveSoul devolve o mainstat e os substats como flat', () => {
    expect(resolveSoul(soulFixa())).toEqual([
      { stat: 'atk', flat: 50 },
      { stat: 'hp', flat: 40 },
      { stat: 'spd', flat: 3 },
    ]);
  });

  it('o flat da Soul é multiplicado pelo % de equipamento (passo 4) e NÃO pelo que vem depois', () => {
    // atk: base 200 + Soul 50 = 250; × (1 + 10% do artefato) = 275; + talento 100 = 375.
    const sheet = resolveHeroStatSheet({
      hero: heroi({ talents: { 't-atk': 1 } }),
      classDef,
      equippedItems: [],
      itemSets: {},
      talentTree: talento,
      artifact: artefato,
      soul: soulFixa(),
    });
    expect(sheet.atk).toBe(375);
    expect(sheet.hp).toBe(1040);
    expect(sheet.spd).toBe(93);
  });

  it('sem Soul, o sheet é exatamente o de antes', () => {
    const sheet = resolveHeroStatSheet({ hero: heroi(), classDef, equippedItems: [], itemSets: {}, talentTree: [] });
    expect(sheet.atk).toBe(200);
    expect(sheet.hp).toBe(1000);
  });

  it('resolver com Soul de outro personagem falha alto', () => {
    expect(() => assertSoulFitsHero(soulFixa({ soulOf: 'ally-sylla' }), heroi())).toThrow(/personagem/);
    expect(() =>
      resolveHeroStatSheet({ hero: heroi(), classDef, equippedItems: [], itemSets: {}, talentTree: [], soul: soulFixa({ soulOf: 'ally-sylla' }) }),
    ).toThrow(/personagem/);
  });

  it('chega ao perfil de combate', () => {
    const comum = { hero: heroi(), classDef, equippedItems: [], itemSets: {}, talentTree: [], skillsCatalog, weaponDuelRanges, baselineReactionSkillIds: [] };
    expect(resolveHeroCombatProfile({ ...comum, soul: soulFixa() }).stats.atk).toBe(250);
    expect(resolveHeroCombatProfile(comum).stats.atk).toBe(200);
  });
});

describe('determinismo — mesma seed, mesmo hash, com Soul equipada', () => {
  const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };
  const map: GridMap = {
    width: 4,
    height: 4,
    tiles: Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => ({ terrain: 'plain', height: 0 as const }))),
    terrains: { plain },
    zocEnabled: false,
  };
  const inimigo: EnemyDef = {
    id: 'enemy-alvo',
    name: 'Alvo',
    stats: { hp: 900, atk: 150, def: 90, spd: 80, chc: 100, chd: 1500, eff: 0, efr: 0, pen: 0, heal: 0, lifesteal: 0, focus: 0, vigor: 0 },
    unitType: 'infantry',
    weaponType: 'sword',
    moveType: 'foot',
    moveRange: 3,
    pools: { ap: 2, pp: 2 },
    duelSkills: [basico.id],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: basico.id, conditions: [] }],
  };

  function batalha(soul: SoulInstance | undefined, seed: number): string {
    const initialState = buildBattleSetupFromHeroes({
      placements: [
        { unitId: 'u-heroi', hero: heroi(), classDef, equippedItems: [], side: 'player', pos: { x: 0, y: 0 }, height: 0, ...(soul ? { soul } : {}) },
        { unitId: 'u-inimigo', enemy: inimigo, side: 'enemy', pos: { x: 1, y: 0 }, height: 0 },
      ],
      map,
      permadeath: 'classic',
      winCondition: { t: 'rout' },
      effectDefs: {},
      initialValor: 0,
      itemSets: {},
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds: [],
      characterTalentTrees: {},
    });
    return hashState(simulate({ rulesVersion: 'test', seed, initialState, commands: [{ t: 'engage', unitId: 'u-heroi', targetId: 'u-inimigo' }] }));
  }

  it('mesma seed → mesmo hash', () => {
    const soul = generateSoul({ id: 'soul-1', def: soulDoKael, rules, seed: 5, crafts: 1 });
    expect(batalha(soul, 42)).toBe(batalha(soul, 42));
  });

  it('a Soul é observável: a mesma batalha sem ela dá outro hash', () => {
    expect(batalha(soulFixa(), 42)).not.toBe(batalha(undefined, 42));
  });
});

describe('RULES_VERSION — a Soul é regra nova (regra 11)', () => {
  // Subiu para 0.25.0 na 2/N; a 6/N (as curvas de classe, D63) subiu de novo, então aqui só se
  // exige que a versão da Soul em diante recuse o cliente de antes dela.
  it('subiu da 0.24.0, e o cliente de 0.24.0 é recusado', async () => {
    const { RULES_VERSION } = await import('../../src/rulesVersion.js');
    const { checkRulesVersion } = await import('../../src/rulesVersionCompat.js');
    expect(RULES_VERSION).not.toBe('0.24.0');
    expect(checkRulesVersion('0.24.0')).not.toBeNull();
  });

  // M39 6/N (D63) — as curvas de `atk`/`def` acima do nível 10 mudaram. É dado, mas muda o
  // resultado de toda batalha com herói acima do 10, e o replay é REEXECUTADO: sem o bump, uma
  // partida gravada antes daria outro desfecho sem ninguém ser avisado.
  it('as curvas de classe da 6/N sobem a versão: o cliente de 0.25.0 é recusado', async () => {
    const { checkRulesVersion } = await import('../../src/rulesVersionCompat.js');
    expect(checkRulesVersion('0.25.0')).not.toBeNull();
  });
});
