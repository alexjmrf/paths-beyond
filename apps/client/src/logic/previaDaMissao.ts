import { toEncounterPlacements } from '@paths-beyond/content/src/encounterPlacements.js';
import { toSummonBlueprintPlacements } from '@paths-beyond/content/src/summonPlacements.js';
import type { ContentCatalog } from '@paths-beyond/content/src/types.js';
import { buildBattleSetupFromHeroes, buildInitialState, type BattleSetup, type Coord } from '@paths-beyond/core';
import { tilesAmeacados } from './ameaca.js';

// M35 2/N (D42) — a PRÉVIA da missão: o tabuleiro de verdade, montado do catálogo, sem ticket.
//
// Escolher uma missão mostra contra o que se vai ANTES de escolher quem leva — §1.1
// (legibilidade tática) antes de entrar. A prévia é montada LOCALMENTE: pedir ticket é entrar
// (`enterChapter`), e a prévia é olhar. O que se monta é o setup do conteúdo pela MESMA
// `buildBattleSetupFromHeroes` que o servidor usa em `assembleChapterBattle` — só que sem as
// vagas do jogador, que ele ainda vai preencher, e que aqui viram marcas no tabuleiro.
//
// Nada aqui decide regra (regra 3): é o conteúdo autorado, desenhado. `artIdByUnitId` sai no
// mesmo formato do ticket, para o tabuleiro dar nome e arte às peças pelo mesmo caminho.

export interface InimigoDaPrevia {
  readonly unitId: string;
  readonly enemyId: string;
}

export interface PreviaDaMissao {
  readonly setup: BattleSetup;
  /** Onde o jogador vai entrar: as posições autoradas das vagas, na ordem delas. */
  readonly vagas: readonly Coord[];
  readonly inimigos: readonly InimigoDaPrevia[];
  readonly artIdByUnitId: Readonly<Record<string, string>>;
  /** M35 4/N (D44) — a zona de ameaça no estado inicial: §1.1 inteiro antes de entrar. */
  readonly ameaca: readonly Coord[];
}

export function previaDaMissao(catalogo: ContentCatalog, missionId: string): PreviaDaMissao | null {
  const encounter = catalogo.encounters.find((e) => e.id === missionId);
  if (!encounter) return null;
  const mapa = catalogo.maps[encounter.mapId];
  if (!mapa) return null;

  const doCenario = encounter.units.filter((unit) => unit.side !== 'player');
  const artIdByUnitId: Record<string, string> = {};
  const inimigos: InimigoDaPrevia[] = [];
  for (const unit of doCenario) {
    if (unit.side === 'enemy') {
      artIdByUnitId[unit.unitId] = unit.enemyId;
      inimigos.push({ unitId: unit.unitId, enemyId: unit.enemyId });
    } else if (unit.hero.characterId) {
      artIdByUnitId[unit.unitId] = unit.hero.characterId;
    }
  }

  const setup = buildBattleSetupFromHeroes({
      placements: toEncounterPlacements(doCenario, catalogo),
      map: mapa.grid,
      permadeath: encounter.permadeath,
      winCondition: encounter.winCondition ?? mapa.winCondition,
      effectDefs: catalogo.effects,
      initialValor: mapa.initialValor,
      valorSkills: catalogo.valorSkills,
      summonBlueprints: toSummonBlueprintPlacements(catalogo),
      itemSets: catalogo.itemSets,
      skillsCatalog: catalogo.skills,
      weaponDuelRanges: catalogo.weaponDuelRanges,
      baselineReactionSkillIds: catalogo.baselineReactionSkillIds,
      characterTalentTrees: catalogo.characterTalentTrees,
  });

  return {
    setup,
    vagas: encounter.units.filter((unit) => unit.side === 'player').map((unit) => unit.pos),
    inimigos,
    artIdByUnitId,
    // A ameaça não depende de seed: é alcance + terreno + quem está de pé. Seed 0 é só o que
    // `buildInitialState` exige para montar o estado.
    ameaca: tilesAmeacados(buildInitialState(setup, 0)),
  };
}
