import type {
  ArtifactDef,
  CharacterSoulDef,
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
import { SOUL_SUBSTAT_COUNT } from '@paths-beyond/core';
import classSchema from '@paths-beyond/data/schemas/classes.schema.js';
import characterSchema from '@paths-beyond/data/schemas/characters.schema.js';
import characterTalentTreeSchema from '@paths-beyond/data/schemas/character-talent-trees.schema.js';
import enemySchema from '@paths-beyond/data/schemas/enemies.schema.js';
import compSchema from '@paths-beyond/data/schemas/comps.schema.js';
import effectSchema from '@paths-beyond/data/schemas/effects.schema.js';
import valorSkillSchema from '@paths-beyond/data/schemas/valor-skills.schema.js';
import chapterSchema from '@paths-beyond/data/schemas/chapters.schema.js';
import encounterSchema from '@paths-beyond/data/schemas/encounters.schema.js';
import dungeonSchema from '@paths-beyond/data/schemas/dungeons.schema.js';
import dungeonEncounterSchema from '@paths-beyond/data/schemas/dungeon-encounters.schema.js';
import materialSchema from '@paths-beyond/data/schemas/materials.schema.js';
import artifactSchema from '@paths-beyond/data/schemas/artifacts.schema.js';
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
  BannerEntryContent,
  RotatingArtifactBannerContent,
  RotatingCharacterBannerContent,
  EventContent,
  Chapter,
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
  readonly chapters: readonly unknown[];
  readonly encounters: readonly unknown[];
  readonly maps: readonly unknown[];
  readonly terrains: readonly unknown[];
  readonly weaponDuelRanges: unknown;
  // §10 (M14). Opcionais para o adapter que ainda não os junta poder evoluir sozinho —
  // ausentes viram catálogo sem economia, não erro de carga.
  readonly dungeons?: readonly unknown[];
  readonly dungeonEncounters?: readonly unknown[];
  readonly materials?: readonly unknown[];
  // M38 2/N — obrigatório pelo mesmo motivo de `banners`: esquecer de passar tem de ser erro
  // de tipo, não um jogo em que o banner de artefato não tem o que entregar.
  readonly artifacts: readonly unknown[];
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
  summon: { premiumCost: 0, pityThresholds: { adventurer: 1, hero: 1 } },
  energyPurchase: { premiumCost: 0, energy: 0 },
  premiumRewards: { missionFirstClear: 0, chapterFirstClear: 0, dungeonFirstClear: 0 },
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

  // M27 — duas camadas, e as duas ordenadas aqui: `findJsonFiles` não garante ordem entre
  // plataformas, e a campanha é uma sequência (§10, "campanha em capítulos").
  const chapters = input.chapters
    .map((raw) => chapterSchema.parse(raw) as Chapter)
    .sort((a, b) => a.order - b.order);

  // A ordem da missão é DENTRO do capítulo, então ordenar por `order` sozinho embaralharia
  // capítulos. A chave é o par (posição do capítulo, posição da missão) — e um `chapterId`
  // que não existe vai para o fim em vez de derrubar a carga: quem reprova isso é o teste de
  // catálogo, com a mensagem que nomeia a missão.
  const posicaoDoCapitulo = new Map(chapters.map((c, i) => [c.id, i] as const));
  const encounters = input.encounters
    .map((raw) => encounterSchema.parse(raw) as unknown as Encounter)
    .sort(
      (a, b) =>
        (posicaoDoCapitulo.get(a.chapterId) ?? Number.MAX_SAFE_INTEGER) -
          (posicaoDoCapitulo.get(b.chapterId) ?? Number.MAX_SAFE_INTEGER) || a.order - b.order,
    );

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

  // M38 2/N (D53/D54) — os artefatos. O schema valida cada um sozinho; o que cruza tipos é
  // conferido aqui e falha ALTO na carga: dono no elenco, classe e rank de base IGUAIS aos do
  // dono (a classe é a trava, e o artefato de um Hero é Hero), um artefato por dono (o banner
  // rotativo garante "o artefato do Hero em destaque", e dois tornariam isso ambíguo), e a
  // skill de uma passiva `reaction` existindo e sendo reação — sem isso a passiva sumiria em
  // silêncio, porque skill ausente é ignorada pelo perfil de combate.
  const donosDeArtefato = new Set<Id>();
  const artifacts = indexById(
    input.artifacts.map((raw) => {
      const artifact = artifactSchema.parse(raw) as ArtifactDef;
      const dono = characters[artifact.signatureOf];
      if (!dono) throw new Error(`Artefato '${artifact.id}' é assinatura de '${artifact.signatureOf}', que não existe no elenco.`);
      if (artifact.classId !== dono.classId) {
        throw new Error(`Artefato '${artifact.id}' é da classe '${artifact.classId}', mas o dono '${dono.id}' é '${dono.classId}'.`);
      }
      if (artifact.rank !== dono.rank) {
        throw new Error(`Artefato '${artifact.id}' tem rank '${artifact.rank}', mas o dono '${dono.id}' é '${dono.rank}'.`);
      }
      if (donosDeArtefato.has(dono.id)) throw new Error(`'${dono.id}' tem dois artefatos: um por dono (mesmo dono repetido em '${artifact.id}').`);
      donosDeArtefato.add(dono.id);
      if (artifact.passive.t === 'reaction') {
        const skill = skills[artifact.passive.skillId];
        if (!skill) throw new Error(`Artefato '${artifact.id}': a skill '${artifact.passive.skillId}' da passiva não existe.`);
        if (skill.kind !== 'reaction') {
          throw new Error(`Artefato '${artifact.id}': a skill '${skill.id}' da passiva não é reação (kind: ${skill.kind}).`);
        }
      }
      return artifact;
    }),
  );
  // M38 5/N — o artefato declarado numa unidade de comp: tem de existir e ser da classe dela.
  // Conferido aqui, depois de os artefatos carregarem, e falhando ALTO: um artefato de outra
  // classe faria `resolveHeroStatSheet` falhar no meio do torneio, e um inexistente sumiria.
  for (const comp of comps) {
    for (const unit of comp.units) {
      if (unit.artifactId === undefined) continue;
      const artifact = artifacts[unit.artifactId];
      if (!artifact) throw new Error(`Comp '${comp.id}': o artefato '${unit.artifactId}' não existe.`);
      if (artifact.classId !== unit.hero.classId) {
        throw new Error(
          `Comp '${comp.id}': '${artifact.id}' é da classe '${artifact.classId}', e a unidade '${unit.hero.id}' é '${unit.hero.classId}'.`,
        );
      }
    }
  }

  // §10 (M18, 2/N) — os banners. Obrigatórios como o elenco: sem eles um `bannerId` não
  // resolve, e "catálogo sem banner" não é um jogo sem aquisição.
  //
  // D49/D50 (M37, 2/N) — **é AQUI que o rank de base entra na entrada do pool.** Ele não é
  // autorado no JSON do banner (o schema o recusa): é DERIVADO do personagem, que é quem o
  // declara, ao lado da classe. Uma fonte só para a mesma verdade, pela lição que o M18 2/N
  // aprendeu com o fragmento de imprint.
  //
  // Personagem do pool que não existe no elenco é erro de conteúdo e falha ALTO, aqui: sem
  // ele não há rank, e sem rank a rolagem não sabe de qual garantia aquela entrada paga.
  // Antes do M37 este erro só aparecia num teste de conformidade de `packages/content`.
  // M38 3/N (D54/D55) — o rank de uma entrada de ARTEFATO vem do catálogo de artefatos, pelo
  // mesmo argumento; e o fragmento declarado tem de ser o do próprio artefato, conferido aqui
  // porque o artefato não declara o seu (o material é quem aponta para ele, `forArtifactId`).
  //
  // O `token` do rotativo de personagem também é DERIVADO: o JSON só declara o limiar, e o
  // artefato é a assinatura do destaque (`signatureOf`), com o fragmento dele.
  const fragmentoDoArtefato = (artifactId: Id): Id | undefined =>
    Object.values(materials).find((m) => m.kind === 'artifactFragment' && m.forArtifactId === artifactId)?.id;

  type EntradaCrua = { readonly characterId?: Id; readonly artifactId?: Id; readonly weight: number; readonly fragmentMaterialId: Id };
  const comRank = (bannerId: Id, entry: EntradaCrua): BannerEntryContent => {
    if (entry.artifactId !== undefined) {
      const artifact = artifacts[entry.artifactId];
      if (!artifact) throw new Error(`Banner '${bannerId}' oferece o artefato '${entry.artifactId}', que não existe.`);
      if (fragmentoDoArtefato(artifact.id) !== entry.fragmentMaterialId) {
        throw new Error(`Banner '${bannerId}': o fragmento de '${artifact.id}' não é '${entry.fragmentMaterialId}'.`);
      }
      return { artifactId: artifact.id, weight: entry.weight, fragmentMaterialId: entry.fragmentMaterialId, rank: artifact.rank };
    }
    const character = characters[entry.characterId!];
    if (!character) {
      throw new Error(`Banner '${bannerId}' oferece '${entry.characterId}', que não existe no elenco: sem personagem não há rank.`);
    }
    return { characterId: character.id, weight: entry.weight, fragmentMaterialId: entry.fragmentMaterialId, rank: character.rank };
  };

  const banners = indexById(
    input.banners.map((raw): BannerContent => {
      const banner = bannerSchema.parse(raw);
      const pool = banner.pool.map((entry: EntradaCrua) => comRank(banner.id, entry));

      if (banner.kind === 'rotatingCharacter') {
        const { tokenThreshold, ...resto } = banner;
        const assinatura = Object.values(artifacts).find((a) => a.signatureOf === banner.featuredCharacterId);
        const fragmento = assinatura ? fragmentoDoArtefato(assinatura.id) : undefined;
        if (!assinatura || !fragmento) {
          throw new Error(`Banner '${banner.id}': o destaque '${banner.featuredCharacterId}' não tem artefato assinatura com fragmento para o token.`);
        }
        return {
          ...resto,
          pool: pool as RotatingCharacterBannerContent['pool'],
          token: { threshold: tokenThreshold, artifactId: assinatura.id, fragmentMaterialId: fragmento },
        };
      }
      if (banner.kind === 'rotatingArtifact') {
        return { ...banner, pool: pool as RotatingArtifactBannerContent['pool'] };
      }
      return { ...banner, pool };
    }),
  );

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

  // M39 3/N (D60) — a Soul. As opções moram no arquivo do personagem e o `soulOf` é derivado
  // dele, então não há dono para divergir. O que cruza tipos falha ALTO aqui: o material dos
  // custos existe e é GENÉRICO (a escolha do personagem é no craft, não no farm), e toda opção
  // de mainstat deixa dois substats elegíveis na tabela — senão `generateSoul` falharia no meio
  // de um craft já pago.
  const characterSouls: Record<Id, CharacterSoulDef> = {};
  for (const character of Object.values(characters)) {
    characterSouls[character.id] = { soulOf: character.id, mainstatOptions: character.soul.mainstatOptions };
  }
  const soulRules = economyRules.soul;
  if (soulRules) {
    for (const [nome, custo] of [['craft', soulRules.craftCost], ['recraft', soulRules.recraftCost]] as const) {
      for (const materialId of Object.keys(custo.materials)) {
        const material = materials[materialId];
        if (!material) throw new Error(`Soul: o custo de ${nome} usa '${materialId}', que não existe.`);
        if (material.kind !== 'generic') {
          throw new Error(`Soul: o custo de ${nome} usa '${materialId}' (kind: ${material.kind}); a Soul se crafta de material genérico.`);
        }
      }
    }
    for (const def of Object.values(characterSouls)) {
      for (const opcao of def.mainstatOptions) {
        const elegiveis = new Set(soulRules.substats.map((s) => s.stat).filter((stat) => stat !== opcao.stat));
        if (elegiveis.size < SOUL_SUBSTAT_COUNT) {
          throw new Error(`Soul de '${def.soulOf}': com mainstat ${opcao.stat}, a tabela de substats não deixa ${SOUL_SUBSTAT_COUNT} elegíveis.`);
        }
      }
    }
  }
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
    chapters,
    encounters,
    dungeons,
    dungeonEncounters,
    materials,
    artifacts,
    characterSouls,
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
