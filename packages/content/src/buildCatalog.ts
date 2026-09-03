import type {
  ClassDef,
  ColumnTalentTree,
  EnemyDef,
  DungeonDef,
  EconomyRules,
  EffectDef,
  EnhanceRates,
  GridMap,
  Id,
  ItemInstance,
  ItemSet,
  MainstatWeightEntry,
  MaterialDef,
  SkillDef,
  SubstatWeightEntry,
  Terrain,
  Tile,
  ValorSkillDef,
  WeaponType,
  WinCondition,
} from '@paths-beyond/core';
import classSchema from '@paths-beyond/data/schemas/classes.schema.js';
import characterSchema from '@paths-beyond/data/schemas/characters.schema.js';
import characterTalentTreeSchema from '@paths-beyond/data/schemas/character-talent-trees.schema.js';
import enemySchema from '@paths-beyond/data/schemas/enemies.schema.js';
import compSchema from '@paths-beyond/data/schemas/comps.schema.js';
import effectSchema from '@paths-beyond/data/schemas/effects.schema.js';
import valorSkillSchema from '@paths-beyond/data/schemas/valor-skills.schema.js';
import encounterSchema from '@paths-beyond/data/schemas/encounters.schema.js';
import dungeonSchema from '@paths-beyond/data/schemas/dungeons.schema.js';
import dungeonEncounterSchema from '@paths-beyond/data/schemas/dungeon-encounters.schema.js';
import materialSchema from '@paths-beyond/data/schemas/materials.schema.js';
import bannerSchema from '@paths-beyond/data/schemas/banners.schema.js';
import achievementSchema from '@paths-beyond/data/schemas/achievements.schema.js';
import eventSchema from '@paths-beyond/data/schemas/events.schema.js';
import economyRulesSchema from '@paths-beyond/data/schemas/economy-rules.schema.js';
import substatWeightsSchema from '@paths-beyond/data/schemas/substat-weights.schema.js';
import mainstatWeightsSchema from '@paths-beyond/data/schemas/mainstat-weights.schema.js';
import enhanceRatesSchema from '@paths-beyond/data/schemas/enhance-rates.schema.js';
import itemSchema from '@paths-beyond/data/schemas/items.schema.js';
import itemSetSchema from '@paths-beyond/data/schemas/item-sets.schema.js';
import mapSchema from '@paths-beyond/data/schemas/maps.schema.js';
import skillSchema from '@paths-beyond/data/schemas/skills.schema.js';
import summonBlueprintSchema from '@paths-beyond/data/schemas/summon-blueprints.schema.js';
import terrainSchema from '@paths-beyond/data/schemas/terrains.schema.js';
import weaponDuelRangesSchema from '@paths-beyond/data/schemas/weapon-duel-ranges.schema.js';
import type {
  AchievementContent,
  ArenaMap,
  BannerContent,
  EventContent,
  CharacterContent,
  Composition,
  ContentCatalog,
  DungeonEncounter,
  Encounter,
  PremiumRules,
  SummonBlueprintContent,
} from './types.js';

interface MapContent {
  readonly id: Id;
  readonly width: number;
  readonly height: number;
  // O `Tile` do core, e não um shape local: desde M15 D3 o tile carrega `object` e a
  // descrição do portão, e redeclarar só `terrain`/`height` aqui faria o loader parecer
  // descartar esses campos (ele os repassa, mas o tipo estaria mentindo).
  readonly tiles: readonly (readonly Tile[])[];
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
  readonly characters: readonly unknown[];
  readonly characterTalentTrees: readonly unknown[];
  readonly enemies: readonly unknown[];
  readonly skills: readonly unknown[];
  readonly items: readonly unknown[];
  readonly itemSets: readonly unknown[];
  readonly effects: readonly unknown[];
  readonly valorSkills: readonly unknown[];
  // §5.6 (M15 D2). Opcional pelo mesmo motivo dos campos de economia abaixo: um adapter que
  // ainda não junta este diretório carrega um catálogo sem invocações, não um erro.
  readonly summonBlueprints?: readonly unknown[];
  readonly comps: readonly unknown[];
  readonly encounters: readonly unknown[];
  readonly maps: readonly unknown[];
  readonly terrains: readonly unknown[];
  readonly weaponDuelRanges: unknown;
  // §10 (M14). Opcionais para o adapter que ainda não os junta poder evoluir sozinho —
  // ausentes viram catálogo sem economia, não erro de carga.
  readonly dungeons?: readonly unknown[];
  readonly dungeonEncounters?: readonly unknown[];
  readonly materials?: readonly unknown[];
  // Obrigatório, sem `?`, pelo mesmo motivo de `characters` e `enemies`: esquecer de
  // passar tem de ser erro de tipo, não um catálogo sem banner descoberto em produção.
  readonly banners: readonly unknown[];
  readonly achievements: readonly unknown[];
  readonly events: readonly unknown[];
  readonly economyRules?: readonly unknown[];
  readonly substatWeights?: unknown;
  readonly mainstatWeights?: unknown;
  readonly enhanceRates?: unknown;
}

// Sem tabela de economia carregada, o catálogo ainda é válido — só não dá para farmar.
// Zeros explícitos em vez de `undefined` evitam que cada consumidor tenha de checar.
const EMPTY_ECONOMY_RULES: EconomyRules = { energy: { max: 0, refillIntervalMs: 1 }, awakening: [], imprint: [], enhance: [] };
const EMPTY_PREMIUM_RULES: PremiumRules = {
  summon: { premiumCost: 0, pityThreshold: 1 },
  energyPurchase: { premiumCost: 0, energy: 0 },
  premiumRewards: { chapterFirstClear: 0, dungeonFirstClear: 0 },
};
const EMPTY_ENHANCE_RATES: EnhanceRates = { toThree: 0, toSix: 0, toNine: 0, toTwelve: 0, toFifteen: 0 };

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

  // §8.1 (M17, sub-sessão 2/N) — o elenco e as árvores dele. OBRIGATÓRIOS, sem o
  // `?? []` que `summonBlueprints` usa: catálogo sem árvore não significa "esta partida não
  // tem talento", significa que o talento de todo personagem sumiu em silêncio.
  const characters = indexById(input.characters.map((raw) => characterSchema.parse(raw) as CharacterContent));

  // Indexadas por `characterId` e não por um `id` próprio — a árvore de §8.2 não tem id
  // próprio, e não precisa: ela é de um personagem e só dele.
  const characterTalentTrees: Record<Id, ColumnTalentTree> = {};
  for (const raw of input.characterTalentTrees) {
    const tree = characterTalentTreeSchema.parse(raw) as unknown as ColumnTalentTree;
    characterTalentTrees[tree.characterId] = tree;
  }

  // §8.1 (M17, 3/N) — os inimigos autorados. Obrigatórios pela mesma razão que o elenco:
  // catálogo sem inimigo não é "campanha sem inimigo", é um `enemyId` que não resolve.
  const enemies = indexById(input.enemies.map((raw) => enemySchema.parse(raw) as unknown as EnemyDef));

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

  // §5.6 (M15 D2) — o reforço que a invocação traz. Mesma história de `valorSkills` acima,
  // um milestone depois: até M14 o kind `summonReinforcement` rejeitava alto, então não
  // havia de onde a unidade vir e ninguém precisava deste catálogo.
  const summonBlueprints = indexById(
    (input.summonBlueprints ?? []).map((raw) => summonBlueprintSchema.parse(raw) as unknown as SummonBlueprintContent),
  );

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

  // §10 (M14) — economia PvE.
  const dungeons = indexById((input.dungeons ?? []).map((raw) => dungeonSchema.parse(raw) as unknown as DungeonDef));
  const dungeonEncounters = indexById(
    (input.dungeonEncounters ?? []).map((raw) => dungeonEncounterSchema.parse(raw) as unknown as DungeonEncounter),
  );
  const materials = indexById((input.materials ?? []).map((raw) => materialSchema.parse(raw) as MaterialDef));
  // §10 (M18, 2/N) — os banners. Obrigatórios como o elenco: sem eles um `bannerId` não
  // resolve, e "catálogo sem banner" não é um jogo sem aquisição.
  const banners = indexById(input.banners.map((raw) => bannerSchema.parse(raw) as unknown as BannerContent));

  // §10 (M18, 4/N) — as fontes autoradas da moeda premium.
  const achievements = indexById(
    input.achievements.map((raw) => achievementSchema.parse(raw) as unknown as AchievementContent),
  );
  const events = indexById(input.events.map((raw) => eventSchema.parse(raw) as unknown as EventContent));

  // O MESMO arquivo é lido duas vezes com dois recortes: o que o core conhece
  // (`EconomyRules`) e o que é da moeda premium (`PremiumRules`). Ver o comentário de
  // `PremiumRules` em `types.ts` — a separação é §15 no tipo, não organização.
  const economyRulesRaw = (input.economyRules ?? []).map((raw) => economyRulesSchema.parse(raw));
  const economyRules = (economyRulesRaw[0] as unknown as EconomyRules | undefined) ?? EMPTY_ECONOMY_RULES;
  const premiumRules = (economyRulesRaw[0] as unknown as PremiumRules | undefined) ?? EMPTY_PREMIUM_RULES;
  const substatWeights = (
    input.substatWeights === undefined ? [] : substatWeightsSchema.parse(input.substatWeights)
  ) as SubstatWeightEntry[];
  const mainstatWeights = (
    input.mainstatWeights === undefined ? [] : mainstatWeightsSchema.parse(input.mainstatWeights)
  ) as MainstatWeightEntry[];
  const enhanceRates = (
    input.enhanceRates === undefined ? EMPTY_ENHANCE_RATES : enhanceRatesSchema.parse(input.enhanceRates)
  ) as EnhanceRates;

  return {
    classes,
    characters,
    characterTalentTrees,
    enemies,
    skills,
    items,
    itemSets,
    effects,
    valorSkills,
    summonBlueprints,
    weaponDuelRanges,
    maps,
    comps,
    encounters,
    dungeons,
    dungeonEncounters,
    materials,
    banners,
    achievements,
    events,
    economyRules,
    premiumRules,
    substatWeights,
    mainstatWeights,
    enhanceRates,
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
