import type { ClassDef, Coord, GridMap, Hero, Id, ItemInstance, ItemSet, MapAiArchetype, SkillDef, WeaponType, WinCondition } from '@paths-beyond/core';

// Um mapa de arena precisa de mais do que o `GridMap` puro do core (terreno) — a regra de
// vitória e o Valor inicial também são dados por mapa (§5.1/§5.6), mas não fazem parte do
// tipo `GridMap` em si (que é só terreno). `ArenaMap` é o par completo que uma batalha
// precisa pra montar um `BattleSetup`.
//
// D1/D2 (M9, docs/milestones/M9-integracao-de-conteudo.md): definição única, substituindo
// as duas cópias verbatim que existiam em `tools/balance/src/loadContent.ts` e
// `apps/server/src/content/types.ts` antes desta milestone.
export interface ArenaMap {
  readonly grid: GridMap;
  readonly winCondition: WinCondition;
  readonly initialValor: number;
}

// M8 — composição de balanceamento (Modo 2/Coliseu, §9.2): `hero` é o Hero inteiro
// embutido (não uma referência por id), autocontido como `duel-participants` (M2).
export interface CompUnitContent {
  readonly hero: Hero;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype: MapAiArchetype;
}

export interface Composition {
  readonly id: Id;
  readonly name: string;
  readonly units: readonly CompUnitContent[];
}

// Catálogo de conteúdo estático — não muda por jogador, carregado uma vez. Único loader
// do projeto (M9): substitui o `ContentCatalog` de `apps/server` (classes/skills/
// itemSets/weaponDuelRanges/maps/baselineReactionSkillIds) e o `BalanceContent` de
// `tools/balance` (que também precisava de `items`/`comps`) por um tipo só.
export interface ContentCatalog {
  readonly classes: Readonly<Record<Id, ClassDef>>;
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly items: Readonly<Record<Id, ItemInstance>>;
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  readonly weaponDuelRanges: Readonly<Record<WeaponType, number>>;
  // D2 (M9): antes um único mapa (`loadFirstValid` sempre pegava o primeiro arquivo
  // encontrado) — agora todo mapa real vira uma entrada, indexado pelo próprio `id`.
  readonly maps: Readonly<Record<Id, ArenaMap>>;
  readonly comps: readonly Composition[];
  // Ids de Contra-atacar/Defender (§6.4) — antes recebidos prontos de quem montava a
  // batalha (`apps/server`) ou hardcoded (`tools/balance/src/runTournament.ts`); D2 (M9)
  // move a derivação pro catálogo. Regra adotada nesta sub-sessão (registrada em
  // DECISIONS.md): toda skill `kind:'reaction'` do catálogo é baseline — hoje só existem
  // duas (`skill-contra-atacar`/`skill-defender`), ambas de fato pensadas como baseline;
  // se um talento vier a conceder uma reação exclusiva no futuro, este ponto precisa
  // reabrir a decisão (candidato: um campo explícito em vez de inferir por `kind`).
  readonly baselineReactionSkillIds: readonly Id[];
}
