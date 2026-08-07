import { RULES_VERSION, nextUint32, resolveHeroCombatProfile, seedRng, simulate } from '@paths-beyond/core';
import type { ClassDef, GridMap, Hero, Replay, SkillDef, StatSheet, Terrain } from '@paths-beyond/core';
import type { ArenaMap, ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createInMemoryRateLimiter } from '../src/battle/rateLimit.js';
import {
  createMemoryArenaDefenseRepository,
  createMemoryHeroRepository,
  createMemoryPlayerRepository,
  createMemoryReplayRepository,
  createMemorySeasonRepository,
} from '../src/repository/memoryRepository.js';
import type { ArenaDefense, StoredHero } from '../src/repository/types.js';

// Critério de aceite raiz de M7 (§09-roadmap.md): "resultado do servidor idêntico ao do
// cliente em 1000 partidas de fuzz; manipulação de stats no cliente é rejeitada."

const plain: Terrain = { id: 'plain', moveCost: { foot: 1, cavalry: 1, flying: 1, heavy: 1, aquatic: 2 }, defBonus: 0, evaBonus: 0, blocksSight: false };

function buildGrid(): GridMap {
  const tiles = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => ({ terrain: 'plain', height: 0 as const })));
  return { width: 6, height: 6, tiles, terrains: { plain }, zocEnabled: false };
}

function statSheet(overrides: Partial<StatSheet> = {}): Partial<StatSheet> {
  return { hp: 2000, atk: 400, def: 150, spd: 90, chc: 100, chd: 1500, ...overrides };
}

function buildClass(overrides: Partial<ClassDef>): ClassDef {
  return {
    id: 'classe',
    name: 'Classe',
    tier: 'base',
    unitType: 'infantry',
    moveType: 'foot',
    moveRange: 4,
    allowedWeapons: ['sword'],
    basePools: { ap: 2, pp: 2 },
    statCurve: Array.from({ length: 60 }, () => statSheet()),
    awakeningMultipliers: [1000, 1000, 1000, 1000, 1000, 1000, 1000],
    promotionFlat: [],
    imprintFlat: [[], [], [], [], [], []],
    talentTree: [],
    ...overrides,
  };
}

// Quatro classes cobrindo cantos diferentes de §6.8 (triângulo físico/mágico, arco vs
// flying, mitigação de armored) — exercita mais caminhos de `computeDamage` no fuzz.
const classSword = buildClass({ id: 'classe-espada', unitType: 'infantry', allowedWeapons: ['sword'] });
const classArcane = buildClass({ id: 'classe-arcano', unitType: 'caster', allowedWeapons: ['arcane'], statCurve: Array.from({ length: 60 }, () => statSheet({ atk: 600, def: 80 })) });
const classBowFlying = buildClass({ id: 'classe-arco-voadora', unitType: 'flying', allowedWeapons: ['bow'] });
const classArmored = buildClass({ id: 'classe-armadura', unitType: 'armored', allowedWeapons: ['axe'], statCurve: Array.from({ length: 60 }, () => statSheet({ def: 400 })) });

const basico: SkillDef = {
  id: 'skill-basico', name: 'Golpe Básico', kind: 'duel', apCost: 1, cooldown: 0,
  multiplier: 1000, flat: 0, scalesWith: 'atk', effects: [], tags: ['physical'],
};
const forte: SkillDef = {
  id: 'skill-forte', name: 'Golpe Forte', kind: 'duel', apCost: 2, cooldown: 1,
  multiplier: 1600, flat: 50, scalesWith: 'atk', effects: [], tags: ['physical'],
};
const counter: SkillDef = {
  id: 'react-counter', name: 'Contra-atacar', kind: 'reaction', apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 800, flat: 0, scalesWith: 'atk', trigger: 'onAttacked', effects: [], tags: ['physical'],
};
const defend: SkillDef = {
  id: 'react-defend', name: 'Defender', kind: 'reaction', apCost: 0, ppCost: 1, cooldown: 0,
  multiplier: 0, flat: 0, scalesWith: 'atk', trigger: 'onAttacked', effects: [], tags: [],
};

function buildHero(id: string, classDef: ClassDef, weaponType: Hero['weaponType']): Hero {
  return {
    id,
    classId: classDef.id,
    level: 1,
    exp: 0,
    awakening: 0,
    imprint: 0,
    talents: {},
    equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
    weaponType,
    duelSkills: ['skill-basico', 'skill-forte'],
    mapSkills: [],
    tacticsScript: [{ enabled: true, skillId: 'skill-basico', conditions: [] }],
  };
}

const attackerRoster: readonly Hero[] = [
  buildHero('heroi-atk-1', classSword, 'sword'),
  buildHero('heroi-atk-2', classArcane, 'arcane'),
  buildHero('heroi-atk-3', classBowFlying, 'bow'),
  buildHero('heroi-atk-4', classArmored, 'axe'),
];

const arenaMap: ArenaMap = { grid: buildGrid(), winCondition: { t: 'rout' }, initialValor: 5 };

const catalog: ContentCatalog = {
  classes: { [classSword.id]: classSword, [classArcane.id]: classArcane, [classBowFlying.id]: classBowFlying, [classArmored.id]: classArmored },
  skills: { [basico.id]: basico, [forte.id]: forte, [counter.id]: counter, [defend.id]: defend },
  items: {},
  itemSets: {},
  weaponDuelRanges: { sword: 1, axe: 1, spear: 1, bow: 2, arcane: 2, nature: 2, holy: 2 },
  maps: { 'mapa-fuzz': arenaMap },
  comps: [],
  baselineReactionSkillIds: [counter.id, defend.id],
};

const ATTACKER_TOKEN = 'token-atacante-fuzz';

// Três defensores diferentes — classe/arquétipo/posição variados — pra o fuzz alternar
// entre alvo em alcance (engage funciona), fora de alcance (engage é ignorado, exercita
// o caminho de comando inválido) e todos os 3 arquétipos de IA usados no roteiro.
const defenderConfigs: readonly { playerId: string; hero: Hero; defense: ArenaDefense }[] = [
  {
    playerId: 'player-defensor-perto',
    hero: buildHero('heroi-def-perto', classSword, 'sword'),
    defense: { ownerPlayerId: 'player-defensor-perto', mapId: 'mapa-fuzz', units: [{ heroId: 'heroi-def-perto', pos: { x: 1, y: 0 }, height: 0, aiArchetype: 'hold-position' }] },
  },
  {
    playerId: 'player-defensor-longe',
    hero: buildHero('heroi-def-longe', classArmored, 'axe'),
    defense: { ownerPlayerId: 'player-defensor-longe', mapId: 'mapa-fuzz', units: [{ heroId: 'heroi-def-longe', pos: { x: 5, y: 5 }, height: 0, aiArchetype: 'aggressive' }] },
  },
  {
    playerId: 'player-defensor-voador',
    hero: buildHero('heroi-def-voador', classBowFlying, 'bow'),
    defense: { ownerPlayerId: 'player-defensor-voador', mapId: 'mapa-fuzz', units: [{ heroId: 'heroi-def-voador', pos: { x: 2, y: 2 }, height: 0, aiArchetype: 'guard-tile' }] },
  },
];

function buildFuzzApp() {
  const repository = createMemoryPlayerRepository([
    { id: 'player-atacante', token: ATTACKER_TOKEN, displayName: 'Atacante', elo: 1200, arenaMarks: 0 },
    ...defenderConfigs.map((d) => ({ id: d.playerId, token: `token-${d.playerId}`, displayName: d.playerId, elo: 1200, arenaMarks: 0 })),
  ]);

  const heroRepository = createMemoryHeroRepository([
    ...attackerRoster.map((hero): StoredHero => ({ ownerPlayerId: 'player-atacante', hero, equippedItems: [] })),
    ...defenderConfigs.map((d): StoredHero => ({ ownerPlayerId: d.playerId, hero: d.hero, equippedItems: [] })),
  ]);

  const arenaDefenseRepository = createMemoryArenaDefenseRepository(defenderConfigs.map((d) => d.defense));

  const app = buildApp({
    repository,
    heroRepository,
    arenaDefenseRepository,
    replayRepository: createMemoryReplayRepository(),
    seasonRepository: createMemorySeasonRepository(),
    catalog,
    shopCatalog: {},
    rateLimiter: createInMemoryRateLimiter({ maxRequests: 5000, windowMs: 60_000 }),
  });

  return app;
}

// PRNG determinístico só pra escolher PARÂMETROS do fuzz (time do atacante, defensor
// alvo, quais unidades engajam) — não é RNG de regra (isso é `simulate()`, já
// determinístico via `rngFor`); reusa `seedRng`/`nextUint32` do próprio core em vez de
// inventar outro gerador, pra uma falha do fuzz ser sempre reproduzível.
function nextIndex(state: ReturnType<typeof seedRng>, max: number): { index: number; state: ReturnType<typeof seedRng> } {
  const result = nextUint32(state);
  return { index: result.value % max, state: result.state };
}

const FUZZ_ITERATIONS = 1000;

describe('fuzz: servidor vs. core local em 1000 partidas (critério de aceite raiz de M7)', () => {
  it(`roda ${FUZZ_ITERATIONS} batalhas com times/alvos/comandos variados e o replay persistido reproduz exatamente o resultado devolvido pelo servidor`, async () => {
    const app = buildFuzzApp();
    let rngState = seedRng(12345);

    for (let i = 0; i < FUZZ_ITERATIONS; i++) {
      const teamSizePick = nextIndex(rngState, attackerRoster.length);
      rngState = teamSizePick.state;
      const teamSize = teamSizePick.index + 1; // 1..4

      const defenderPick = nextIndex(rngState, defenderConfigs.length);
      rngState = defenderPick.state;
      const defender = defenderConfigs[defenderPick.index]!;

      const attackerHeroIds = attackerRoster.slice(0, teamSize).map((h) => h.id);
      const defenderHeroId = defender.defense.units[0]!.heroId;

      const commands = attackerHeroIds.map((heroId) => {
        const enginePick = nextIndex(rngState, 2);
        rngState = enginePick.state;
        return enginePick.index === 0
          ? { t: 'engage' as const, unitId: heroId, targetId: defenderHeroId }
          : { t: 'wait' as const, unitId: heroId };
      });

      const nonce = `fuzz-${i}`;
      const response = await app.inject({
        method: 'POST',
        url: '/battles',
        headers: { 'x-player-token': ATTACKER_TOKEN },
        payload: { attackerHeroIds, defenderPlayerId: defender.playerId, commands, rulesVersion: RULES_VERSION, nonce },
      });
      expect(response.statusCode).toBe(200);
      const serverBody = response.json();

      const replayResponse = await app.inject({
        method: 'GET',
        url: `/battles/${nonce}`,
        headers: { 'x-player-token': ATTACKER_TOKEN },
      });
      expect(replayResponse.statusCode).toBe(200);
      const replay = replayResponse.json();

      // "o cliente" — em vez de reimplementar a simulação, roda o MESMO simulate() do
      // core com exatamente o que o servidor persistiu (initialState+seed+commands).
      // É precisamente essa reprodutibilidade que a arquitetura promete (§9.1): cliente
      // e servidor sempre concordam porque os dois usam o mesmo pacote sobre a mesma
      // entrada — a garantia real é que NADA além de initialState+seed+commands afeta o
      // resultado, o que este loop testa sob 1000 combinações de time/alvo/comando.
      const localReplay: Replay = {
        rulesVersion: replay.rulesVersion,
        seed: replay.seed,
        initialState: replay.initialState,
        commands: replay.commands,
      };
      const localResult = simulate(localReplay);

      expect(JSON.stringify(localResult)).toBe(JSON.stringify(serverBody.result));
    }
  });
});

describe('anti-cheat: manipulação de stats no cliente é rejeitada (critério de aceite raiz de M7)', () => {
  it('mesmo com campos extras/forjados no corpo da requisição, os stats resolvidos são sempre os do HeroRepository, nunca os enviados pelo cliente', async () => {
    const app = buildFuzzApp();

    const forgedPayload = {
      attackerHeroIds: [attackerRoster[0]!.id],
      defenderPlayerId: defenderConfigs[0]!.playerId,
      commands: [{ t: 'wait', unitId: attackerRoster[0]!.id }],
      rulesVersion: RULES_VERSION,
      nonce: 'fuzz-anti-cheat-1',
      // Nenhum destes campos existe no contrato da rota — um cliente malicioso tentando
      // inflar os próprios stats ou forjar o resultado.
      stats: { hp: 999999999, atk: 999999999 },
      forcedResult: { outcome: 'victory' },
      attackerHeroes: [{ id: attackerRoster[0]!.id, stats: { hp: 999999999 } }],
    };

    const response = await app.inject({
      method: 'POST',
      url: '/battles',
      headers: { 'x-player-token': ATTACKER_TOKEN },
      payload: forgedPayload,
    });
    expect(response.statusCode).toBe(200);

    const replayResponse = await app.inject({
      method: 'GET',
      url: '/battles/fuzz-anti-cheat-1',
      headers: { 'x-player-token': ATTACKER_TOKEN },
    });
    const replay = replayResponse.json();
    const attackerUnit = replay.initialState.units.find((u: { heroId: string }) => u.heroId === attackerRoster[0]!.id);

    // O stat real resolvido a partir de Hero+ClassDef (level 1, classSword) via
    // resolveHeroCombatProfile — não os 999999999 forjados no corpo da requisição.
    const expectedProfile = resolveHeroCombatProfile({
      hero: attackerRoster[0]!,
      classDef: classSword,
      equippedItems: [],
      itemSets: {},
      skillsCatalog: catalog.skills,
      weaponDuelRanges: catalog.weaponDuelRanges,
      baselineReactionSkillIds: catalog.baselineReactionSkillIds,
    });

    expect(attackerUnit.stats.hp).toBe(expectedProfile.stats.hp);
    expect(attackerUnit.stats.atk).toBe(expectedProfile.stats.atk);
    expect(attackerUnit.stats.hp).not.toBe(999999999);
    expect(attackerUnit.stats.atk).not.toBe(999999999);
  });
});
