import {
  applyCommand,
  buildBattleSetupFromHeroes,
  buildInitialState,
  type BattleState,
  type HeroPlacement,
  type Id,
} from '@paths-beyond/core';
import { firstArenaMap, loadCatalogFromDisk, type Composition, type ContentCatalog } from '@paths-beyond/content';
import { describe, expect, it } from 'vitest';

// M10, sub-sessão 4/N — o critério de aceite 3 de M10 pede `pnpm balance` rodando com
// comps MULTI-UNIDADE e assistência real. `runTournament` não expõe assistências no
// `BattleOutcomeRecord` (e fazer `simulate()` devolver DuelResult seria mudança de core
// fora do escopo desta fatia), então a prova de que o CONTEÚDO REAL de fato dispara
// assistência é feita aqui: mesmo catálogo, mesmos comps, mesma cadeia de resolução
// (`buildBattleSetupFromHeroes`) que o torneio usa.
//
// Duas diferenças deliberadas em relação ao torneio, ambas pra o teste medir a mecânica de
// assistência e não o comportamento da IA:
//   - os times começam ADJACENTES (o torneio parte de 6 tiles e deixa a IA fechar);
//   - `aiArchetype` é omitido, então as unidades ficam sob controle "humano" (M2-M6) e
//     `buildInitialState` não resolve a batalha inteira sozinho antes da asserção.
function compById(content: ContentCatalog, id: Id): Composition {
  const comp = content.comps.find((c) => c.id === id);
  if (!comp) throw new Error(`composição não encontrada: ${id}`);
  return comp;
}

function placementsFor(
  comp: Composition,
  content: ContentCatalog,
  side: 'player' | 'enemy',
  offsetX: number,
): HeroPlacement[] {
  return comp.units.map((unit): HeroPlacement => {
    const classDef = content.classes[unit.hero.classId];
    if (!classDef) throw new Error(`classe desconhecida: ${unit.hero.classId}`);
    const equippedItems = Object.values(unit.hero.equipment)
      .filter((itemId): itemId is Id => itemId !== null)
      .map((itemId) => {
        const item = content.items[itemId];
        if (!item) throw new Error(`item desconhecido: ${itemId}`);
        return item;
      });
    return {
      unitId: unit.hero.id,
      hero: unit.hero,
      classDef,
      equippedItems,
      side,
      pos: { x: unit.pos.x + offsetX, y: unit.pos.y },
      height: unit.height,
      // aiArchetype omitido de propósito — ver comentário do topo.
    };
  });
}

describe('assistência real com conteúdo real (M10, sub-sessão 4/N)', () => {
  const content = loadCatalogFromDisk();
  const map = firstArenaMap(content);

  function initialState(attackerCompId: Id, defenderCompId: Id, seed: number): BattleState {
    const setup = buildBattleSetupFromHeroes({
      placements: [
        ...placementsFor(compById(content, attackerCompId), content, 'player', 0),
        // Atacante ocupa x=0..1, defensor x=2..3 — as duas linhas de frente encostam.
        ...placementsFor(compById(content, defenderCompId), content, 'enemy', 2),
      ],
      map: map.grid,
      permadeath: 'classic',
      winCondition: map.winCondition,
      effectDefs: content.effects,
      initialValor: map.initialValor,
      itemSets: content.itemSets,
      skillsCatalog: content.skills,
      weaponDuelRanges: content.weaponDuelRanges,
      baselineReactionSkillIds: content.baselineReactionSkillIds,
      characterTalentTrees: content.characterTalentTrees,
    });
    return buildInitialState(setup, seed);
  }

  // Procura o primeiro PAR (atacante, alvo) dentro do alcance de duelo — não basta pegar a
  // primeira unidade de cada lado: com os comps em L, nem toda unidade da frente do
  // atacante encosta em alguém (duelRange das armas reais é 1 desde M8).
  function engageBetween(attackerCompId: Id, defenderCompId: Id, seed: number) {
    const state = initialState(attackerCompId, defenderCompId, seed);
    const enemies = state.units.filter((u) => u.side === 'enemy');

    for (const attacker of state.units.filter((u) => u.side === 'player')) {
      const target = enemies.find(
        (e) => Math.abs(e.pos.x - attacker.pos.x) + Math.abs(e.pos.y - attacker.pos.y) <= attacker.duelRange,
      );
      if (!target) continue;
      return {
        before: state,
        outcome: applyCommand(state, { t: 'engage', unitId: attacker.unitId, targetId: target.unitId }),
      };
    }
    throw new Error('nenhum par de unidades ficou dentro do alcance de duelo — posicionamento do teste está errado');
  }

  it('toda unidade do comp real conhece skill-assistir via talento (e não por ser baseline)', () => {
    const state = initialState('comp-espadachim', 'comp-guerreiro', 1);
    expect(content.baselineReactionSkillIds).not.toContain('skill-assistir');
    for (const unit of state.units) {
      expect(unit.knownSkills['skill-assistir']).toBeDefined();
      expect(unit.reactionScript.some((line) => line.skillId === 'skill-assistir')).toBe(true);
    }
  });

  it('um duelo entre comps multi-unidade produz assistências de verdade', () => {
    const { outcome } = engageBetween('comp-espadachim', 'comp-guerreiro', 1234);
    expect(outcome.applied).toBe(true);

    const assists = [...outcome.duelResult!.attackerAssists, ...outcome.duelResult!.defenderAssists];
    expect(assists.length).toBeGreaterThan(0);
    for (const assist of assists) {
      expect(assist.skillId).toBe('skill-assistir');
    }
  });

  it('a assistência causa dano de verdade a HP (o que a sub-sessão 2 implementou, agora em conteúdo real)', () => {
    const { outcome } = engageBetween('comp-espadachim', 'comp-guerreiro', 1234);
    const assists = [...outcome.duelResult!.attackerAssists, ...outcome.duelResult!.defenderAssists];
    const totalAssistDamage = assists.reduce((sum, a) => sum + a.damageDealt, 0);
    expect(totalAssistDamage).toBeGreaterThan(0);
  });

  it('§6.5.4 — no máximo 2 assistências por lado, mesmo com o comp inteiro no alcance', () => {
    const { outcome } = engageBetween('comp-espadachim', 'comp-guerreiro', 1234);
    expect(outcome.duelResult!.attackerAssists.length).toBeLessThanOrEqual(2);
    expect(outcome.duelResult!.defenderAssists.length).toBeLessThanOrEqual(2);
  });

  it('§6.5.3 — assistir gasta 1 PP do assistente, não do duelista', () => {
    const { before, outcome } = engageBetween('comp-espadachim', 'comp-guerreiro', 1234);
    const assists = [...outcome.duelResult!.attackerAssists, ...outcome.duelResult!.defenderAssists];
    expect(assists.length).toBeGreaterThan(0);

    for (const assist of assists) {
      const ppBefore = before.units.find((u) => u.unitId === assist.assistantId)!.pp;
      const ppAfter = outcome.state.units.find((u) => u.unitId === assist.assistantId)!.pp;
      expect(ppAfter).toBe(ppBefore - 1);
    }
  });

  it('§6.5.5 — assistir NÃO consome o turno do assistente no mapa', () => {
    const { outcome } = engageBetween('comp-espadachim', 'comp-guerreiro', 1234);
    for (const assist of outcome.duelResult!.attackerAssists) {
      const assistant = outcome.state.units.find((u) => u.unitId === assist.assistantId)!;
      expect(assistant.hasActedThisRound).toBe(false);
    }
  });

  it('é determinístico — o mesmo engajamento produz as mesmas assistências duas vezes', () => {
    const a = engageBetween('comp-espadachim', 'comp-guerreiro', 99);
    const b = engageBetween('comp-espadachim', 'comp-guerreiro', 99);
    expect(JSON.stringify(a.outcome.duelResult!.attackerAssists)).toBe(
      JSON.stringify(b.outcome.duelResult!.attackerAssists),
    );
    expect(JSON.stringify(a.outcome.duelResult!.defenderAssists)).toBe(
      JSON.stringify(b.outcome.duelResult!.defenderAssists),
    );
  });
});
