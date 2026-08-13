import type { ClassDef, EffectDef, GridMap, Id, ItemInstance, ItemSet, SkillDef, Terrain, ValorSkillDef, WeaponType, WinCondition } from '@paths-beyond/core';
import classSchema from '@paths-beyond/data/schemas/classes.schema.js';
import compSchema from '@paths-beyond/data/schemas/comps.schema.js';
import effectSchema from '@paths-beyond/data/schemas/effects.schema.js';
import valorSkillSchema from '@paths-beyond/data/schemas/valor-skills.schema.js';
import encounterSchema from '@paths-beyond/data/schemas/encounters.schema.js';
import itemSchema from '@paths-beyond/data/schemas/items.schema.js';
import itemSetSchema from '@paths-beyond/data/schemas/item-sets.schema.js';
import mapSchema from '@paths-beyond/data/schemas/maps.schema.js';
import skillSchema from '@paths-beyond/data/schemas/skills.schema.js';
import terrainSchema from '@paths-beyond/data/schemas/terrains.schema.js';
import weaponDuelRangesSchema from '@paths-beyond/data/schemas/weapon-duel-ranges.schema.js';
import type { ArenaMap, Composition, ContentCatalog, Encounter } from './types.js';

interface MapContent {
  readonly id: Id;
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly (readonly { readonly terrain: string; readonly height: 0 | 1 | 2 | 3 }[])[];
  readonly zocEnabled: boolean;
  readonly winCondition: WinCondition;
  readonly initialValor: number;
}

// D2 (M9, docs/milestones/M9-integracao-de-conteudo.md): `buildCatalog` é a metade
// isomórfica do loader — puro, sem `node:fs`, roda em browser. Recebe JSON já parseado
// (ainda não validado por Zod — a validação real acontece aqui, dentro da função, porque
// Zod em si não depende de Node e funciona igual nos dois ambientes) e devolve o
// `ContentCatalog` completo: indexação por id, fusão maps+terrains → `GridMap`, derivação
// de `baselineReactionSkillIds`. O adapter Node (`loadCatalogFromDisk.ts`) só junta os
// arquivos do disco e entrega pra cá; o futuro adapter de browser (`apps/client`,
// sub-sessão 3) fará o mesmo via `import.meta.glob`.
export interface ParsedContentFiles {
  readonly classes: readonly unknown[];
  readonly skills: readonly unknown[];
  readonly items: readonly unknown[];
  readonly itemSets: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly valorSkills: readonly unknown[];
  readonly comps: readonly unknown[];
  readonly encounters: readonly unknown[];
  readonly maps: readonly unknown[];
  readonly terrains: readonly unknown[];
  readonly weaponDuelRanges: unknown;
}

function indexById<T extends { id: Id }>(list: readonly T[]): Record<Id, T> {
  const result: Record<Id, T> = {};
  for (const entry of list) result[entry.id] = entry;
  return result;
}

// Toda skill `kind:'reaction'` do catálogo é baseline (decisão desta sub-sessão,
// registrada em DECISIONS.md — ver comentário em `types.ts`).
// §6.4 — "Reações padrão que toda unidade tem: Contra-atacar, Defender. Classes e
// talentos adicionam outras." Até M10 sub-sessão 3 bastava ser `kind:'reaction'`, o que
// só estava certo por acidente: as duas únicas reações do catálogo eram exatamente as
// duas que §6.4 chama de universais. Com `skill-assistir` (concedida por talento, M10
// sub-sessão 4/N) a distinção passou a ser explícita no dado — ver DECISIONS.md.
function deriveBaselineReactionSkillIds(skills: readonly SkillDef[]): readonly Id[] {
  return skills
    .filter((skill) => skill.kind === 'reaction' && skill.baseline === true)
    .map((skill) => skill.id)
    .sort();
}

export function buildCatalog(input: ParsedContentFiles): ContentCatalog {
  const classes = indexById(input.classes.map((raw) => classSchema.parse(raw) as ClassDef));

  const skillList = input.skills.map((raw) => skillSchema.parse(raw) as SkillDef);
  const skills = indexById(skillList);

  // Descompasso Zod-vs-core já documentado desde M8 sub-sessão 3 (`enhance` validado
  // como `0..15` solto no schema, tipado como os 6 marcos literais de `EnhanceLevel` no
  // core) — `schema.parse` já garante que o valor real está nos marcos certos; o cast é
  // só pra TS aceitar a ponte entre os dois sistemas de tipo.
  const items = indexById(input.items.map((raw) => itemSchema.parse(raw) as unknown as ItemInstance));

  const itemSets = indexById(input.itemSets.map((raw) => itemSetSchema.parse(raw) as ItemSet));

  const effects = indexById(input.effects.map((raw) => effectSchema.parse(raw) as EffectDef));

  // §5.6 (M11 sub-sessão 3/N) — antes ausente do catálogo: `useValor` ignorava o `skillId`
  // e nenhum consumidor precisava das definições. Agora que o comando resolve de verdade,
  // servidor/cliente/sim-cli precisam do campo pra montar `BattleSetup.valorSkills`.
  const valorSkills = indexById(input.valorSkills.map((raw) => valorSkillSchema.parse(raw) as ValorSkillDef));

  // Mesmo descompasso, pra variante recursiva `not` de `Condition` (`hero.tacticsScript`
  // dentro de cada unidade de uma composição).
  const comps = input.comps.map((raw) => compSchema.parse(raw) as unknown as Composition);

  // Ordenados por `chapter`: `findJsonFiles` não garante ordem entre plataformas, e a
  // campanha é uma sequência (§10, "campanha em capítulos").
  const encounters = input.encounters
    .map((raw) => encounterSchema.parse(raw) as unknown as Encounter)
    .sort((a, b) => a.chapter - b.chapter);

  const terrains: Record<string, Terrain> = indexById(input.terrains.map((raw) => terrainSchema.parse(raw) as Terrain));

  const mapContents = input.maps.map((raw) => mapSchema.parse(raw) as MapContent);
  const maps: Record<Id, ArenaMap> = {};
  for (const mapContent of mapContents) {
    const grid: GridMap = {
      width: mapContent.width,
      height: mapContent.height,
      tiles: mapContent.tiles,
      terrains,
      zocEnabled: mapContent.zocEnabled,
    };
    maps[mapContent.id] = { grid, winCondition: mapContent.winCondition, initialValor: mapContent.initialValor };
  }

  const weaponDuelRanges = weaponDuelRangesSchema.parse(input.weaponDuelRanges) as Record<WeaponType, number>;

  return {
    classes,
    skills,
    items,
    itemSets,
    effects,
    valorSkills,
    weaponDuelRanges,
    maps,
    comps,
    encounters,
    baselineReactionSkillIds: deriveBaselineReactionSkillIds(skillList),
  };
}

// Conveniência pra consumidores de mapa único (hoje `tools/balance`, Modo 2/Coliseu):
// "o primeiro mapa carregado", na mesma ordem de inserção dos arquivos de disco —
// continuação fiel de `loadFirstValid` (pré-M9), que sempre pegava o primeiro arquivo
// encontrado. Só é seguro enquanto existir exatamente um mapa "de arena" por dataset;
// vira candidato a escolha explícita por id quando um consumidor precisar de mais de um
// (ex.: `apps/client`, sub-sessão 3, que porta 3 mapas de campanha).
export function firstArenaMap(catalog: ContentCatalog): ArenaMap {
  const first = Object.values(catalog.maps)[0];
  if (!first) throw new Error('catálogo não tem nenhum mapa');
  return first;
}
