import { describe, expect, it } from 'vitest';
import {
  MAX_ARTIFACT_AWAKENING,
  MAX_ARTIFACT_IMPRINT,
  applyArtifactImprint,
  artifactRank,
  awakenArtifact,
  equipArtifact,
  resolveArtifact,
} from '../../src/artifacts/index.js';
import type { ArtifactDef, ArtifactInstance, EquippedArtifact } from '../../src/artifacts/types.js';
import { buildBattleSetupFromHeroes } from '../../src/battle/assemble.js';
import { simulate } from '../../src/battle/simulate.js';
import { hashState } from '../../src/determinism/hash.js';
import type { AwakeningStep, ImprintStep, MaterialDef, Wallet } from '../../src/economy/types.js';
import type { EnemyDef } from '../../src/enemy/types.js';
import { resolveHeroCombatProfile } from '../../src/hero/combatProfile.js';
import { resolveHeroStatSheet } from '../../src/hero/resolve.js';
import type { ClassDef, Hero } from '../../src/hero/types.js';
import type { GridMap, Terrain } from '../../src/grid/types.js';
import type { SkillDef } from '../../src/skills/types.js';
import type { ColumnTalentNode } from '../../src/talents/columnTree.js';

// M38 1/N (D53) — O ARTEFATO: o 7º slot, travado por CLASSE, com rank de base no catálogo e
// rank corrente derivado de um awakening PRÓPRIO; `atk` fixo + um stat variável; uma passiva
// exclusiva; imprint por duplicata que mexe em status e no NÚMERO da própria passiva, nunca
// num efeito novo.

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

const outraClasse: ClassDef = { ...classDef, id: 'classe-arqueiro', name: 'Arqueiro' };

const reacaoDoArtefato: SkillDef = {
  id: 'skill-reacao-artefato',
  name: 'Lâmina Vingativa',
  kind: 'reaction',
  apCost: 0,
  ppCost: 1,
  cooldown: 0,
  multiplier: 500,
  flat: 0,
  scalesWith: 'atk',
  effects: [],
  tags: ['physical'],
  trigger: 'onDamaged',
};

const basico: SkillDef = {
  id: 'skill-basico', name: 'Golpe Básico', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};

const skillsCatalog: Readonly<Record<string, SkillDef>> = {
  [basico.id]: basico,
  [reacaoDoArtefato.id]: reacaoDoArtefato,
};
const weaponDuelRanges = { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 } as const;

function artefato(overrides: Partial<ArtifactDef> = {}): ArtifactDef {
  return {
    id: 'artifact-lamina-do-juramento',
    signatureOf: 'hero-jogador',
    name: 'Lâmina do Juramento',
    classId: classDef.id,
    rank: 'hero',
    atkByAwakening: [30, 40, 50, 60, 70, 80, 100],
    variableStat: { stat: 'def', byAwakening: [10, 12, 14, 16, 18, 20, 25] },
    imprintFlat: [[], [{ stat: 'hp', flat: 50 }], [{ stat: 'hp', flat: 100 }], [{ stat: 'hp', flat: 150 }], [{ stat: 'hp', flat: 200 }], [{ stat: 'hp', flat: 300 }]],
    passive: { t: 'stat', stat: 'atk', pctByImprint: [100, 120, 140, 160, 180, 200] },
    ...overrides,
  };
}

function instancia(overrides: Partial<ArtifactInstance> = {}): ArtifactInstance {
  return { id: 'art-inst-1', artifactId: 'artifact-lamina-do-juramento', awakening: 0, imprint: 0, ...overrides };
}

function heroi(overrides: Partial<Hero> = {}): Hero {
  return {
    id: 'heroi-x',
    classId: classDef.id,
    level: 1,
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

function equipado(def: ArtifactDef = artefato(), inst: ArtifactInstance = instancia()): EquippedArtifact {
  return { def, instance: inst };
}

describe('resolveArtifact — status e passiva por awakening e imprint', () => {
  it('o awakening escolhe o valor dos dois stats; o imprint soma o flat da tabela', () => {
    const r = resolveArtifact(equipado(artefato(), instancia({ awakening: 3, imprint: 2 })));
    expect(r.equipmentFlat).toEqual([
      { stat: 'atk', flat: 60 },
      { stat: 'def', flat: 16 },
      { stat: 'hp', flat: 100 },
    ]);
  });

  it('o imprint muda o NÚMERO da passiva, e só ele', () => {
    const zero = resolveArtifact(equipado(artefato(), instancia({ imprint: 0 })));
    const cinco = resolveArtifact(equipado(artefato(), instancia({ imprint: 5 })));
    expect(zero.equipmentPct).toEqual([{ stat: 'atk', pct: 100 }]);
    expect(cinco.equipmentPct).toEqual([{ stat: 'atk', pct: 200 }]);
    // Nenhum efeito novo aparece com o imprint: a forma da contribuição é a mesma.
    expect(Object.keys(cinco).sort()).toEqual(Object.keys(zero).sort());
    expect(cinco.grantedReactionIds).toEqual(zero.grantedReactionIds);
  });

  it('passiva de pool soma AP/PP de ENTRADA na batalha (não é regeneração — regra 7)', () => {
    const def = artefato({ passive: { t: 'startingPool', pool: 'pp', amountByImprint: [1, 1, 1, 2, 2, 2] } });
    expect(resolveArtifact(equipado(def, instancia({ imprint: 0 }))).startingPpBonus).toBe(1);
    expect(resolveArtifact(equipado(def, instancia({ imprint: 3 }))).startingPpBonus).toBe(2);
    expect(resolveArtifact(equipado(def, instancia({ imprint: 3 }))).startingApBonus).toBe(0);
  });

  it('passiva de reação concede a skill; o imprint só ajusta o multiplicador dela', () => {
    const def = artefato({
      passive: { t: 'reaction', skillId: reacaoDoArtefato.id, multiplierByImprint: [500, 550, 600, 650, 700, 800] },
    });
    const r = resolveArtifact(equipado(def, instancia({ imprint: 4 })));
    expect(r.grantedReactionIds).toEqual([reacaoDoArtefato.id]);
    expect(r.skillPatches).toEqual({ [reacaoDoArtefato.id]: { multiplier: 700 } });
  });

  it('é pura: não muta a definição nem a instância', () => {
    const def = artefato();
    const inst = instancia({ awakening: 2, imprint: 1 });
    const antes = structuredClone({ def, inst });
    resolveArtifact(equipado(def, inst));
    expect({ def, inst }).toEqual(antes);
  });
});

describe('agregação (§4.1) — os status no passo 3, o % da passiva no passo 4', () => {
  it('o % da passiva multiplica base + equipamento flat, mas NÃO o flat de talento (passo 5)', () => {
    const talento: ColumnTalentNode[] = [
      { id: 't-atk', column: 'a', row: 1, maxRank: 1, effects: [{ t: 'stat', stat: 'atk', flat: 100 }] },
    ];
    // atk base 200 + artefato 30 (awakening 0) = 230; × (1 + 10%) = 253; + talento 100 = 353.
    const sheet = resolveHeroStatSheet({
      hero: heroi({ talents: { 't-atk': 1 } }),
      classDef,
      equippedItems: [],
      itemSets: {},
      talentTree: talento,
      artifact: equipado(),
    });
    expect(sheet.atk).toBe(353);
    // def base 100 + variável 10 = 110; o % da passiva é de atk e não a toca.
    expect(sheet.def).toBe(110);
  });

  it('sem artefato, o sheet é exatamente o de antes do M38', () => {
    const semCampo = resolveHeroStatSheet({ hero: heroi(), classDef, equippedItems: [], itemSets: {}, talentTree: [] });
    expect(semCampo.atk).toBe(200);
    expect(semCampo.def).toBe(100);
  });
});

describe('a trava por CLASSE', () => {
  it('equipArtifact recusa artefato de outra classe e aceita o da classe do herói', () => {
    const recusa = equipArtifact({ hero: heroi({ classId: outraClasse.id }), artifact: equipado() });
    expect(recusa.ok).toBe(false);

    const aceita = equipArtifact({ hero: heroi(), artifact: equipado() });
    expect(aceita.ok).toBe(true);
    if (aceita.ok) expect(aceita.hero.artifact).toBe('art-inst-1');
  });

  it('equipArtifact recusa instância que não é daquele artefato', () => {
    const r = equipArtifact({ hero: heroi(), artifact: equipado(artefato(), instancia({ artifactId: 'artifact-outro' })) });
    expect(r.ok).toBe(false);
  });

  it('resolver o sheet com artefato de outra classe falha alto em vez de somar em silêncio', () => {
    expect(() =>
      resolveHeroStatSheet({
        hero: heroi({ classId: outraClasse.id }),
        classDef: outraClasse,
        equippedItems: [],
        itemSets: {},
        talentTree: [],
        artifact: equipado(),
      }),
    ).toThrow(/classe/);
  });
});

describe('o rank do artefato — base no catálogo, corrente derivado do awakening próprio', () => {
  it('Hero de base sobe direto a Legend no topo', () => {
    const def = artefato({ rank: 'hero' });
    expect(artifactRank(def, instancia({ awakening: 0 }))).toBe('hero');
    expect(artifactRank(def, instancia({ awakening: 5 }))).toBe('hero');
    expect(artifactRank(def, instancia({ awakening: MAX_ARTIFACT_AWAKENING }))).toBe('legend');
  });

  it('Adventurer de base passa por Hero no meio e chega a Legend no topo', () => {
    const def = artefato({ rank: 'adventurer' });
    expect(artifactRank(def, instancia({ awakening: 2 }))).toBe('adventurer');
    expect(artifactRank(def, instancia({ awakening: 3 }))).toBe('hero');
    expect(artifactRank(def, instancia({ awakening: 6 }))).toBe('legend');
  });

  it('a instância não guarda rank: o corrente é função, nunca campo', () => {
    expect(Object.keys(instancia()).sort()).toEqual(['artifactId', 'awakening', 'id', 'imprint']);
  });
});

describe('awakenArtifact — o awakening PRÓPRIO do artefato', () => {
  const nucleo = 'material-nucleo-de-artefato';
  const steps: AwakeningStep[] = Array.from({ length: 6 }, (_, i) => ({ gold: 100 * (i + 1), materials: { [nucleo]: i + 1 } }));
  const wallet: Wallet = { gold: 1000, stones: 0, arenaMarks: 0 };

  it('consome ouro e material e sobe um degrau, sem tocar em nenhum herói', () => {
    const r = awakenArtifact({ instance: instancia(), wallet, materials: { [nucleo]: 5 }, steps });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.instance.awakening).toBe(1);
    expect(r.wallet.gold).toBe(900);
    expect(r.materials[nucleo]).toBe(4);
  });

  it('recusa sem material, sem ouro e no teto', () => {
    expect(awakenArtifact({ instance: instancia(), wallet, materials: {}, steps }).ok).toBe(false);
    expect(awakenArtifact({ instance: instancia(), wallet: { ...wallet, gold: 0 }, materials: { [nucleo]: 5 }, steps }).ok).toBe(false);
    expect(awakenArtifact({ instance: instancia({ awakening: 6 }), wallet, materials: { [nucleo]: 99 }, steps }).ok).toBe(false);
  });
});

describe('applyArtifactImprint — a duplicata vira fragmento DAQUELE artefato', () => {
  const fragmento: MaterialDef = {
    id: 'material-fragmento-artifact-lamina-do-juramento',
    name: 'Fragmento',
    kind: 'artifactFragment',
    forArtifactId: 'artifact-lamina-do-juramento',
  };
  const steps: ImprintStep[] = Array.from({ length: 5 }, () => ({ fragments: 1 }));

  it('consome o fragmento e sobe o imprint', () => {
    const r = applyArtifactImprint({ instance: instancia(), materials: { [fragmento.id]: 2 }, fragment: fragmento, steps });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.instance.imprint).toBe(1);
    expect(r.materials[fragmento.id]).toBe(1);
  });

  it('recusa fragmento de outro artefato, fragmento de personagem e o teto', () => {
    const deOutro: MaterialDef = { ...fragmento, id: 'frag-outro', forArtifactId: 'artifact-outro' };
    expect(applyArtifactImprint({ instance: instancia(), materials: { [deOutro.id]: 9 }, fragment: deOutro, steps }).ok).toBe(false);

    const dePersonagem: MaterialDef = { id: 'frag-heroi', name: 'x', kind: 'heroFragment', forCharacterId: 'ally-x' };
    expect(applyArtifactImprint({ instance: instancia(), materials: { [dePersonagem.id]: 9 }, fragment: dePersonagem, steps }).ok).toBe(false);

    expect(
      applyArtifactImprint({ instance: instancia({ imprint: MAX_ARTIFACT_IMPRINT }), materials: { [fragmento.id]: 9 }, fragment: fragmento, steps }).ok,
    ).toBe(false);
  });
});

describe('perfil de combate — a passiva chega ao duelo', () => {
  function perfil(artifact?: EquippedArtifact) {
    return resolveHeroCombatProfile({
      hero: heroi(),
      classDef,
      equippedItems: [],
      itemSets: {},
      talentTree: [],
      skillsCatalog,
      weaponDuelRanges,
      baselineReactionSkillIds: [],
      ...(artifact ? { artifact } : {}),
    });
  }

  it('a reação do artefato vem ANTES da baseline de mesmo gatilho (D57)', () => {
    // Medido na 5/N: atrás de `contra-atacar` (mesmo gatilho, sem condição), zerar a magnitude
    // da reação do artefato não mudava UM resultado do torneio — ela nunca disparava.
    const contra: SkillDef = { ...reacaoDoArtefato, id: 'react-contra-baseline', name: 'Contra-atacar' };
    const def = artefato({ passive: { t: 'reaction', skillId: reacaoDoArtefato.id, multiplierByImprint: [500, 550, 600, 650, 700, 800] } });
    const p = resolveHeroCombatProfile({
      hero: heroi(),
      classDef,
      equippedItems: [],
      itemSets: {},
      talentTree: [],
      skillsCatalog: { ...skillsCatalog, [contra.id]: contra },
      weaponDuelRanges,
      baselineReactionSkillIds: [contra.id],
      artifact: equipado(def),
    });
    expect(p.reactionScript.map((l) => l.skillId)).toEqual([reacaoDoArtefato.id, contra.id]);
  });

  it('a reação do artefato vem antes TAMBÉM da concedida por talento de mesmo gatilho (D57)', () => {
    // Medido na 5/N: a Sylla tem `assistir` concedida por talento; com o talento na frente, a
    // assistência do artefato dela nunca disparava.
    const doTalento: SkillDef = { ...reacaoDoArtefato, id: 'react-do-talento', name: 'Do talento' };
    const def = artefato({ passive: { t: 'reaction', skillId: reacaoDoArtefato.id, multiplierByImprint: [500, 550, 600, 650, 700, 800] } });
    const arvore: readonly ColumnTalentNode[] = [
      { id: 'no-reacao', column: 'a', row: 1, maxRank: 1, effects: [{ t: 'grantReaction', reactionId: doTalento.id }] },
    ];
    const p = resolveHeroCombatProfile({
      hero: { ...heroi(), talents: { 'no-reacao': 1 } },
      classDef,
      equippedItems: [],
      itemSets: {},
      talentTree: arvore,
      skillsCatalog: { ...skillsCatalog, [doTalento.id]: doTalento },
      weaponDuelRanges,
      baselineReactionSkillIds: [],
      artifact: equipado(def),
    });
    expect(p.reactionScript.map((l) => l.skillId)).toEqual([reacaoDoArtefato.id, doTalento.id]);
  });

  it('passiva de pool entra no AP/PP inicial', () => {
    const def = artefato({ passive: { t: 'startingPool', pool: 'ap', amountByImprint: [1, 1, 1, 1, 1, 1] } });
    expect(perfil(equipado(def)).startingAp).toBe(perfil().startingAp + 1);
  });

  it('passiva de reação entra no script de reação e na lista de skills, com o multiplicador do imprint', () => {
    const def = artefato({
      passive: { t: 'reaction', skillId: reacaoDoArtefato.id, multiplierByImprint: [500, 550, 600, 650, 700, 800] },
    });
    const p = perfil(equipado(def, instancia({ imprint: 1 })));
    expect(p.reactionScript.map((l) => l.skillId)).toContain(reacaoDoArtefato.id);

    expect(p.knownSkills[reacaoDoArtefato.id]?.multiplier).toBe(550);
    expect(perfil().reactionScript.map((l) => l.skillId)).not.toContain(reacaoDoArtefato.id);
  });
});

describe('determinismo — mesma seed, mesmo hash, com artefato equipado', () => {
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

  function batalha(artifact: EquippedArtifact | undefined, seed: number): string {
    const initialState = buildBattleSetupFromHeroes({
      placements: [
        { unitId: 'u-heroi', hero: heroi(), classDef, equippedItems: [], side: 'player', pos: { x: 0, y: 0 }, height: 0, ...(artifact ? { artifact } : {}) },
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
    const def = artefato({ passive: { t: 'reaction', skillId: reacaoDoArtefato.id, multiplierByImprint: [500, 550, 600, 650, 700, 800] } });
    expect(batalha(equipado(def), 42)).toBe(batalha(equipado(def), 42));
  });

  it('o artefato é observável: a mesma batalha sem ele dá outro hash', () => {
    expect(batalha(equipado(), 42)).not.toBe(batalha(undefined, 42));
  });
});

describe('RULES_VERSION — o artefato é regra nova (regra 11)', () => {
  // A versão exata é afirmada pela fatia mais recente (M38 3/N: `packages/gacha/tests/versao.test.ts`);
  // aqui fica o que a 1/N garantiu: o cliente do M37 não volta a ser aceito.
  it('subiu do M37: o cliente de 0.20.0 é recusado', async () => {
    const { RULES_VERSION } = await import('../../src/rulesVersion.js');
    const { checkRulesVersion } = await import('../../src/rulesVersionCompat.js');
    expect(RULES_VERSION).not.toBe('0.20.0');
    expect(checkRulesVersion('0.20.0')).not.toBeNull();
    expect(checkRulesVersion(RULES_VERSION)).toBeNull();
  });
});

describe('determinismo das funções públicas — mesma entrada, mesmo hash, duas vezes', () => {
  const nucleo = 'material-nucleo-de-artefato';
  const fragmento: MaterialDef = { id: 'frag', name: 'F', kind: 'artifactFragment', forArtifactId: 'artifact-lamina-do-juramento' };
  const wallet: Wallet = { gold: 1000, stones: 0, arenaMarks: 0 };
  const casos: Record<string, () => unknown> = {
    resolveArtifact: () => resolveArtifact(equipado(artefato(), instancia({ awakening: 4, imprint: 2 }))),
    artifactRank: () => artifactRank(artefato({ rank: 'adventurer' }), instancia({ awakening: 3 })),
    equipArtifact: () => equipArtifact({ hero: heroi(), artifact: equipado() }),
    awakenArtifact: () =>
      awakenArtifact({ instance: instancia(), wallet, materials: { [nucleo]: 3 }, steps: [{ gold: 100, materials: { [nucleo]: 1 } }] }),
    applyArtifactImprint: () =>
      applyArtifactImprint({ instance: instancia(), materials: { frag: 2 }, fragment: fragmento, steps: [{ fragments: 1 }] }),
  };
  for (const [nome, f] of Object.entries(casos)) {
    it(nome, () => expect(hashState(f())).toBe(hashState(f())));
  }
});
