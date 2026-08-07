import {
  RULES_VERSION,
  buildBattleSetupFromHeroes,
  nextUint32,
  seedRng,
  simulate,
  type BattleUnit,
  type Hero,
  type HeroPlacement,
  type Id,
  type ItemInstance,
  type RngState,
} from '@paths-beyond/core';
import { firstArenaMap, type Composition, type ContentCatalog } from '@paths-beyond/content';

// §9.5 — "a defesa recebe +1 AP inicial por herói e o bônus de terreno do mapa" (o
// bônus de terreno já vem de onde as unidades pisam no mapa; o +1 AP é aplicado aqui,
// fora de packages/core — mesma categoria de decisão de posicionamento específica de
// modo de jogo já tomada em apps/server/src/battle/routes.ts, M7).
const DEFENDER_AP_BONUS = 1;

// Desloca o time defensor pra não colidir com as posições do time atacante — os dois
// comps de um fixture usam as mesmas coordenadas pequenas (0,0)/(0,1) porque cada
// composição é autocontida e não sabe contra quem vai lutar.
const DEFENDER_POSITION_OFFSET_X = 6;

export interface BattleOutcomeRecord {
  readonly attackerCompId: Id;
  readonly defenderCompId: Id;
  // Exposta pra reproduzir uma batalha específica fora do torneio (debug) e pra testar
  // a geração de seed diretamente, sem depender de o resultado do combate variar (com
  // composições muito desiguais, o vencedor pode ser o mesmo em toda seed, mesmo com
  // rolagens de dano diferentes por baixo).
  readonly seed: number;
  readonly outcome: 'victory' | 'defeat' | 'ongoing';
  readonly winningCompId: Id | null;
  readonly winningUnitsSpd: readonly number[];
  readonly allUnitsSpd: readonly number[];
}

// M8, sub-sessão 3/N: `hero.equipment` (6 slots, ids ou null) passa a ser resolvido de
// verdade em `ItemInstance[]` a partir do catálogo carregado por `loadCatalogFromDisk()` —
// antes, `equippedItems` era sempre `[]`, então nenhum item jamais entrava na conta do
// torneio, mesmo quando um comp referenciava um item de verdade em `hero.equipment`.
function resolveEquippedItems(hero: Hero, content: ContentCatalog, compId: Id): readonly ItemInstance[] {
  const equipped: ItemInstance[] = [];
  for (const itemId of Object.values(hero.equipment)) {
    if (itemId === null) continue;
    const item = content.items[itemId];
    if (!item) throw new Error(`item desconhecido: ${itemId} (herói ${hero.id}, composição ${compId})`);
    equipped.push(item);
  }
  return equipped;
}

function toPlacements(
  comp: Composition,
  content: ContentCatalog,
  side: 'player' | 'enemy',
  positionOffsetX: number,
): HeroPlacement[] {
  return comp.units.map((unit): HeroPlacement => {
    const classDef = content.classes[unit.hero.classId];
    if (!classDef) throw new Error(`classe desconhecida: ${unit.hero.classId} (composição ${comp.id})`);
    return {
      unitId: unit.hero.id,
      hero: unit.hero,
      classDef,
      equippedItems: resolveEquippedItems(unit.hero, content, comp.id),
      side,
      pos: { x: unit.pos.x + positionOffsetX, y: unit.pos.y },
      height: unit.height,
      aiArchetype: unit.aiArchetype,
    };
  });
}

function applyDefenderBonus(units: readonly BattleUnit[]): readonly BattleUnit[] {
  return units.map((unit) => (unit.side === 'enemy' ? { ...unit, ap: unit.ap + DEFENDER_AP_BONUS } : unit));
}

// Modo 2/Coliseu (§9.2): os dois lados são 100% IA — `simulate()` com `commands: []`
// já resolve a batalha inteira sozinho, via `resolveAiTurns` (M7, sub-sessão 6),
// conectado dentro de `buildInitialState`. Nenhum comando precisa ser submetido.
function runOneBattle(attacker: Composition, defender: Composition, content: ContentCatalog, seed: number): BattleOutcomeRecord {
  const attackerPlacements = toPlacements(attacker, content, 'player', 0);
  const defenderPlacements = toPlacements(defender, content, 'enemy', DEFENDER_POSITION_OFFSET_X);
  // Coliseu (§9.2) só conhece uma arena — ver `firstArenaMap` em `@paths-beyond/content`
  // pra saber por que "o primeiro mapa carregado" ainda é seguro nesta sub-sessão.
  const map = firstArenaMap(content);

  const setup = buildBattleSetupFromHeroes({
    placements: [...attackerPlacements, ...defenderPlacements],
    map: map.grid,
    permadeath: 'classic',
    winCondition: map.winCondition,
    effectDefs: {},
    initialValor: map.initialValor,
    itemSets: content.itemSets,
    skillsCatalog: content.skills,
    weaponDuelRanges: content.weaponDuelRanges,
    baselineReactionSkillIds: content.baselineReactionSkillIds,
  });

  const buffedSetup = { ...setup, units: applyDefenderBonus(setup.units) };

  const result = simulate({ rulesVersion: RULES_VERSION, seed, initialState: buffedSetup, commands: [] });

  const winningSide = result.outcome === 'victory' ? 'player' : result.outcome === 'defeat' ? 'enemy' : null;
  const winningCompId = winningSide === 'player' ? attacker.id : winningSide === 'enemy' ? defender.id : null;

  return {
    attackerCompId: attacker.id,
    defenderCompId: defender.id,
    seed,
    outcome: result.outcome,
    winningCompId,
    winningUnitsSpd: winningSide ? result.finalUnits.filter((u) => u.side === winningSide).map((u) => u.stats.spd) : [],
    allUnitsSpd: result.finalUnits.map((u) => u.stats.spd),
  };
}

export interface RunTournamentOptions {
  readonly runsPerPairing: number;
  readonly masterSeed: number;
}

// PRNG só pra gerar seeds distintas de batalha — não é RNG de regra (isso continua
// sendo `rngFor` dentro de `simulate()`). Reusa `seedRng`/`nextUint32` do core em vez
// de `Math.random`, pra o torneio inteiro ser reproduzível a partir de um masterSeed.
function nextBattleSeed(state: RngState): { seed: number; state: RngState } {
  const result = nextUint32(state);
  return { seed: result.value, state: result.state };
}

// Roda `runsPerPairing` batalhas pra cada par ORDENADO de composições distintas
// (A ataca B, B ataca A são pareamentos diferentes — a vantagem do atacante em
// escolher o engajamento, §9.5, é assimétrica por natureza).
export function runTournament(content: ContentCatalog, options: RunTournamentOptions): readonly BattleOutcomeRecord[] {
  const records: BattleOutcomeRecord[] = [];
  let rngState = seedRng(options.masterSeed);

  for (const attacker of content.comps) {
    for (const defender of content.comps) {
      if (attacker.id === defender.id) continue;

      for (let i = 0; i < options.runsPerPairing; i++) {
        const picked = nextBattleSeed(rngState);
        rngState = picked.state;
        records.push(runOneBattle(attacker, defender, content, picked.seed));
      }
    }
  }

  return records;
}
