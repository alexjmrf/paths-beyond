import type {
  ClassDef,
  ColumnTalentTree,
  EnemyDef,
  Coord,
  DungeonDef,
  EconomyRules,
  EffectDef,
  EnhanceRates,
  GridMap,
  Hero,
  Id,
  ItemInstance,
  ItemSet,
  MainstatWeightEntry,
  MapAiArchetype,
  MaterialDef,
  PermadeathMode,
  SkillDef,
  SubstatWeightEntry,
  ValorSkillDef,
  WeaponType,
  WinCondition,
} from '@paths-beyond/core';

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
// §10 (M12, sub-sessão 1/N) — o ELENCO de um mapa jogado da campanha. O layout fica em
// `maps` e é referenciado por `mapId`. Até M11 este conteúdo vivia em
// `apps/client/src/data/campaign.ts` como TypeScript — último canto de conteúdo hardcoded
// do projeto, e o que impedia servidor e `sim-cli` de rodarem um mapa de campanha.
// §8.1 (M17, 3/N) — a unidade de um encontro tem duas formas, e a discriminante é `side`.
// Espelho da união em `packages/data/schemas/encounters.schema.ts`: o jogador leva uma
// ficha de progressão, o inimigo é uma referência ao catálogo de `enemies/`.
interface EncounterUnitCommon {
  readonly unitId: Id;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype?: MapAiArchetype;
}

export interface PlayerEncounterUnit extends EncounterUnitCommon {
  readonly side: 'player';
  readonly hero: Hero;
}

export interface EnemyEncounterUnit extends EncounterUnitCommon {
  readonly side: 'enemy';
  readonly enemyId: Id;
}

// §10/D16 (M18, 5/N) — o ALIADO DE CENÁRIO: luta do lado do jogador e NÃO é do elenco.
// Nasceu do capítulo 5, que escolta a Mensageira depois de D14 fazer dela uma personagem
// adquirível — enquanto ela ocupava uma vaga da party, quem não a possuía não tinha a
// unidade que `escort` nomeia, e o capítulo era injogável.
//
// Um arm próprio, e não um `PlayerEncounterUnit` sem `characterId`: o aliado é uma coisa
// declaradamente diferente, e a trava de M17 4/N (todo herói do jogador tem personagem)
// continua inteira.
export interface AllyEncounterUnit extends EncounterUnitCommon {
  readonly side: 'ally';
  readonly hero: Hero;
}

export type EncounterUnitContent = PlayerEncounterUnit | AllyEncounterUnit | EnemyEncounterUnit;

export interface Encounter {
  readonly id: Id;
  readonly name: string;
  readonly mapId: Id;
  readonly chapter: number;
  readonly permadeath: PermadeathMode;
  // Sobrepõe a condição do layout quando presente (§5.7) — ver DECISIONS.md.
  readonly winCondition?: WinCondition;
  readonly units: readonly EncounterUnitContent[];
}

// §10 (M14) — o confronto de uma masmorra. Mesma forma de `Encounter`, sem `chapter`:
// masmorra não faz parte da sequência da campanha, e foi essa diferença que obrigou os dois
// a serem tipos de conteúdo separados.
export interface DungeonEncounter {
  readonly id: Id;
  readonly name: string;
  readonly mapId: Id;
  readonly permadeath: 'casual';
  readonly winCondition?: WinCondition;
  readonly units: readonly EncounterUnitContent[];
}

// §5.6 (M15 D2) — o reforço que `summonReinforcement` invoca. Mesma forma de
// `EncounterUnitContent` menos o que só a invocação sabe (tile, lado, id da instância): o
// blueprint é uma unidade de cenário, com nível, arma e script próprios.
export interface SummonBlueprintContent {
  readonly id: Id;
  readonly name: string;
  readonly hero: Hero;
}

// §8.1 (M17) — um personagem do ELENCO. Espelho de
// `packages/data/schemas/characters.schema.ts`: identidade e classe, e nada de estado.
// Não vem do core porque o core não tem noção de elenco — ele resolve a árvore que lhe
// entregam, e quem é o dono dela é assunto de conteúdo.
export interface CharacterContent {
  readonly id: Id;
  readonly name: string;
  readonly classId: Id;
  // D14 (M18) — `story` é o núcleo garantido a todo jogador (é contra ele que a campanha é
  // afinada); `summon` é adquirível por banner.
  readonly acquisition: 'story' | 'summon';
  readonly fragmentMaterialId: Id;
  // §10/D14 (M18, 6/N) — com o que o jogador RECEBE este personagem, no núcleo de uma conta
  // nova ou saindo do banner. É um subconjunto de `Hero` de propósito: o que ela não
  // carrega é progresso (exp, awakening, imprint, talentos), que é estado de conta.
  readonly startingHero: StartingHeroContent;
}

export interface StartingHeroContent {
  readonly level: number;
  readonly weaponType: Hero['weaponType'];
  readonly equipment: Hero['equipment'];
  readonly duelSkills: readonly Id[];
  readonly mapSkills: readonly Id[];
  readonly tacticsScript: Hero['tacticsScript'];
}

// §10 (M18, 2/N) — o BANNER. Espelho de `packages/data/schemas/banners.schema.ts`.
// Estruturalmente compatível com o `BannerDef` de `packages/gacha`, e é assim de propósito:
// o catálogo entrega o banner direto à rolagem, sem uma camada de conversão que pudesse
// divergir. O teste de conformidade em `tests/banner.test.ts` é quem trava isso.
export interface BannerEntryContent {
  readonly characterId: Id;
  readonly weight: number;
  readonly fragmentMaterialId: Id;
}

export interface BannerContent {
  readonly id: Id;
  readonly name: string;
  readonly pityThreshold: number;
  readonly pool: readonly BannerEntryContent[];
}

// §10/D17 (M18) — os números da moeda PREMIUM. Moram aqui, e NÃO em `EconomyRules` do
// core, e isso é a §15 sendo levada a sério no tipo e não só no diretório: pôr o custo de
// summon dentro do `EconomyRules` do core seria o gacha entrando no core pela porta do
// tipo, ainda que nenhuma função de lá o lesse. O core continua conhecendo energia,
// awakening, imprint e enhance — que são regras dele — e nada de aquisição.
//
// Os dois vivem no mesmo arquivo de dado (`economy-rules/economy.json`) porque são a mesma
// tabela de economia para quem autora; é só a leitura que se separa.
export interface PremiumRules {
  readonly summon: {
    readonly premiumCost: number;
    readonly pityThreshold: number;
  };
  readonly energyPurchase: {
    readonly premiumCost: number;
    readonly energy: number;
  };
  // §10 (M18, 4/N) — duas das quatro FONTES: a primeira completude. Uniformes por tipo,
  // então um número por tipo em vez de um por peça de conteúdo.
  readonly premiumRewards: {
    readonly chapterFirstClear: number;
    readonly dungeonFirstClear: number;
  };
}

// §10 (M18, 4/N) — as condições autoradas de conquista e evento. A avaliação delas é do
// servidor (é ele que tem o estado de conta); o que mora aqui é a forma.
export type RewardCondition =
  | { readonly kind: 'chaptersCleared'; readonly atLeast: number }
  | { readonly kind: 'dungeonsCleared'; readonly atLeast: number }
  | { readonly kind: 'charactersOwned'; readonly atLeast: number }
  | { readonly kind: 'heroImprint'; readonly atLeast: number }
  | { readonly kind: 'heroAwakening'; readonly atLeast: number }
  | { readonly kind: 'elo'; readonly atLeast: number };

export interface AchievementContent {
  readonly id: Id;
  readonly name: string;
  readonly description: string;
  readonly premium: number;
  // §9.4 (M21, 3/N) — o nome desta conquista na plataforma (o *API name* da Steam). Autorado
  // em `packages/data`, não derivado do `id`: quem o define de verdade é o backend de
  // parceiro, e discordar dele por uma letra dá uma conquista que paga a moeda e nunca
  // aparece no perfil.
  readonly platformId: string;
  readonly condition: RewardCondition;
}

export interface EventContent {
  readonly id: Id;
  readonly name: string;
  readonly description: string;
  readonly premium: number;
  // Epoch ms, como `EnergyState.asOfMs`: o projeto compara instantes como número.
  readonly startsAt: number;
  readonly endsAt: number;
  readonly condition?: RewardCondition;
}

export interface ContentCatalog {
  readonly classes: Readonly<Record<Id, ClassDef>>;
  // §8.1/§8.2 (M17, sub-sessão 2/N) — o ELENCO fechado e as árvores dele.
  //
  // D6: "o servidor passa a precisar conhecer o elenco". Enquanto a árvore era da classe,
  // resolver a alocação de qualquer herói só exigia a classe dele; com a árvore sendo do
  // personagem, ela exige saber QUEM ele é — e isso só fecha com elenco autorado.
  readonly characters: Readonly<Record<Id, CharacterContent>>;
  // Indexadas por `characterId`, que é também a chave de `characters` acima.
  readonly characterTalentTrees: Readonly<Record<Id, ColumnTalentTree>>;
  // §8.1 (M17, 3/N) — os INIMIGOS DE FASE autorados. Indexados por id porque o encontro os
  // referencia: a mesma ficha de "Guarda do Covil" serve os dois tiers da masmorra, e
  // embutir a ficha em cada encontro repetiria a força em vez de nomeá-la.
  readonly enemies: Readonly<Record<Id, EnemyDef>>;
  readonly skills: Readonly<Record<Id, SkillDef>>;
  readonly items: Readonly<Record<Id, ItemInstance>>;
  readonly itemSets: Readonly<Record<Id, ItemSet>>;
  // M10 — antes ausente do catálogo: skill.effects era mecanicamente inerte (resolveDuel
  // nunca lia EffectApplication), então nenhum chamador real precisava de EffectDef.
  // Agora que resolveDuel aplica de verdade, servidor/cliente/tools-balance precisam
  // deste campo para que skill.effects tenha efeito observável fora de packages/core.
  readonly effects: Readonly<Record<Id, EffectDef>>;
  // §5.6 (M11 sub-sessão 3/N) — antes ausente pelo mesmo motivo que `effects` até M10:
  // `useValor` ignorava o `skillId`, então nenhum consumidor precisava das definições.
  readonly valorSkills: Readonly<Record<Id, ValorSkillDef>>;
  // §5.6 (M15 D2) — indexado pelo `blueprintId` que a valor-skill de invocação nomeia. Sem
  // este campo o kind `summonReinforcement` resolveria em teste e nunca em jogo, porque quem
  // monta a batalha não teria de onde tirar o perfil da unidade invocada.
  readonly summonBlueprints: Readonly<Record<Id, SummonBlueprintContent>>;
  readonly weaponDuelRanges: Readonly<Record<WeaponType, number>>;
  // D2 (M9): antes um único mapa (`loadFirstValid` sempre pegava o primeiro arquivo
  // encontrado) — agora todo mapa real vira uma entrada, indexado pelo próprio `id`.
  readonly maps: Readonly<Record<Id, ArenaMap>>;
  readonly comps: readonly Composition[];
  // §10 (M12) — campanha em capítulos, ordenada por `chapter`.
  readonly encounters: readonly Encounter[];
  // Ids de Contra-atacar/Defender (§6.4) — antes recebidos prontos de quem montava a
  // batalha (`apps/server`) ou hardcoded (`tools/balance/src/runTournament.ts`); D2 (M9)
  // move a derivação pro catálogo. Regra adotada nesta sub-sessão (registrada em
  // DECISIONS.md): toda skill `kind:'reaction'` do catálogo é baseline — hoje só existem
  // duas (`skill-contra-atacar`/`skill-defender`), ambas de fato pensadas como baseline;
  // se um talento vier a conceder uma reação exclusiva no futuro, este ponto precisa
  // reabrir a decisão (candidato: um campo explícito em vez de inferir por `kind`).
  // §10 (M14) — a economia PvE. Sem estes campos o servidor não tem como listar masmorra,
  // montar o confronto dela, cobrar energia nem gerar um drop (a geração de item exige as
  // tabelas de peso, que até M14 2/N só existiam como fixture de teste).
  readonly dungeons: Readonly<Record<Id, DungeonDef>>;
  readonly dungeonEncounters: Readonly<Record<Id, DungeonEncounter>>;
  readonly materials: Readonly<Record<Id, MaterialDef>>;
  // §10 (M18, 2/N) — os banners de invocação. Obrigatórios pela mesma razão que o elenco:
  // catálogo sem banner não é "este jogo não tem aquisição", é uma rota de summon que não
  // resolve.
  readonly banners: Readonly<Record<Id, BannerContent>>;
  // §10/D17 (M18) — separados de `economyRules` de propósito; ver `PremiumRules`.
  readonly premiumRules: PremiumRules;
  // §10 (M18, 4/N) — as duas fontes autoradas da moeda premium.
  readonly achievements: Readonly<Record<Id, AchievementContent>>;
  readonly events: Readonly<Record<Id, EventContent>>;
  readonly economyRules: EconomyRules;
  readonly substatWeights: readonly SubstatWeightEntry[];
  readonly mainstatWeights: readonly MainstatWeightEntry[];
  readonly enhanceRates: EnhanceRates;
  readonly baselineReactionSkillIds: readonly Id[];
}
