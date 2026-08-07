import type { ClassDef, GridMap, Id, ItemSet, SkillDef, WeaponType, WinCondition } from '@paths-beyond/core';

// Um mapa de arena precisa de mais do que o `GridMap` puro do core (terreno) — a regra de
// vitória e o Valor inicial também são dados por mapa (§5.1/§5.6), mas não fazem parte do
// tipo `GridMap` em si (que é só terreno). `ArenaMap` é o par completo que o endpoint de
// batalha precisa pra montar um `BattleSetup`.
export interface ArenaMap {
  readonly grid: GridMap;
  readonly winCondition: WinCondition;
  readonly initialValor: number;
}

// Catálogo de conteúdo estático (classes/skills/sets/mapas/tabela de duelRange por arma) —
// não muda por jogador, carregado uma vez. Corte de escopo desta sub-sessão (registrado em
// DECISIONS.md): nenhum loader real a partir de packages/data existe ainda — mesclar
// maps.schema.ts (layout) + terrains.schema.ts (terreno) num `GridMap` de verdade é
// trabalho de integração novo e sem precedente no projeto (`sim-cli battle` sempre leu um
// `BattleSetup` já resolvido), e packages/data não tem conteúdo real pra carregar de
// qualquer forma (conteúdo de jogo é M8). Testes injetam um catálogo construído à mão, o
// mesmo padrão já usado pro `PlayerRepository` em memória.
export interface ContentCatalog {
  readonly classes: Readonly<Record<Id, ClassDef>>;
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  readonly weaponDuelRanges: Readonly<Record<WeaponType, number>>;
  readonly maps: Readonly<Record<Id, ArenaMap>>;
  // Ids canônicos de Contra-atacar/Defender (§6.4) — decisão de M7 sub-sessão 4:
  // sintetizados a partir do catálogo do chamador, não hardcoded no core.
  readonly baselineReactionSkillIds: readonly Id[];
}
