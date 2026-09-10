import type {
  BattleCommand,
  BattleResult,
  BattleSetup,
  Coord,
  EnergyState,
  EntryLimitState,
  Hero,
  ItemInstance,
  MapAiArchetype,
} from '@paths-beyond/core';

// §9.1 — "ELO, temporadas de 14 dias." 1200 é o ponto de partida clássico (Elo/xadrez),
// não um número dado pela spec — decisão registrada em DECISIONS.md (M7, sub-sessão 8).
export const DEFAULT_ELO = 1200;

// §10 — todo jogador começa sem marcas de arena; só ganha jogando PvP.
export const DEFAULT_ARENA_MARKS = 0;

// §10 — todo jogador começa sem ouro e sem pedras: as duas moedas de PvE só vêm de farmar.
export const DEFAULT_GOLD = 0;
export const DEFAULT_STONES = 0;

// §10/D17 (M18) — a QUARTA moeda, premium. Também começa em zero: ela não se ganha
// farmando, e as fontes dela (avanço de história, primeira completude, achievements,
// eventos) são todas coisas que o jogador ainda não fez numa conta nova.
export const DEFAULT_PREMIUM = 0;

// Conta nova de PvE: sem ouro, sem pedras, sem energia apurada. `asOfMs: 0` faz a
// primeira apuração creditar a regeneração desde a época — quem cria o jogador de
// verdade passa o instante atual (e o teto, se quiser começar com a barra cheia).
export const DEFAULT_PVE_ACCOUNT = {
  gold: DEFAULT_GOLD,
  stones: DEFAULT_STONES,
  premium: DEFAULT_PREMIUM,
  energy: { stored: 0, asOfMs: 0 },
} as const;

// §9.4 (M20) — a lista de providers, em constante de runtime pelo mesmo motivo que
// `ECONOMY_ACTION_KINDS` virou uma no M19: o `CHECK` da migration e o TypeScript precisam de
// uma fonte só, e `tests/migrations.test.ts` amarra as duas.
export const IDENTITY_PROVIDERS = ['steam', 'epic', 'dev'] as const;

export interface Player {
  readonly id: string;
  // §9.4 (M20) — a identidade da plataforma substituiu o token digitado. O par
  // (provider, platformId) é a chave da conta; credencial nenhuma é guardada.
  readonly platformProvider: (typeof IDENTITY_PROVIDERS)[number];
  readonly platformId: string;
  readonly displayName: string;
  readonly elo: number;
  // §10 — "marcas de arena" é a moeda da loja de PvP (venda gear de set específico e
  // cosméticos, nunca poder bruto). Ganha em toda batalha concluída (battle/routes.ts).
  readonly arenaMarks: number;
  // §10 (M14) — as outras duas moedas: `ouro` e `pedras`. Ouro paga awakening e enhance;
  // pedras pagam enhance (decisão do usuário em M14 2/N — é o sumidouro que faltava).
  readonly gold: number;
  readonly stones: number;
  // §10/D17 (M18) — a moeda premium. Separada de `stones` de propósito: `pedras` dropa de
  // masmorra e paga enhance; esta não se ganha farmando e paga summon e energia extra.
  readonly premium: number;
  // §10 — "energia de conta limita o farm diário". Guardada como o par
  // `{stored, asOfMs}` que `resolveEnergy` (core) consome: a energia atual é DERIVADA do
  // instante, não um contador que o servidor precisa incrementar em background.
  readonly energy: EnergyState;
}

export interface PlayerRepository {
  // §9.4 (M20) — a busca por identidade de plataforma no lugar da busca por token.
  getPlayerByPlatformIdentity(provider: string, platformId: string): Promise<Player | null>;
  getPlayerById(id: string): Promise<Player | null>;
  createPlayer(input: {
    id: string;
    platformProvider: (typeof IDENTITY_PROVIDERS)[number];
    platformId: string;
    displayName: string;
    elo?: number;
    arenaMarks?: number;
    gold?: number;
    stones?: number;
    premium?: number;
    energy?: EnergyState;
  }): Promise<Player>;
  updateElo(id: string, elo: number): Promise<Player>;
  updateArenaMarks(id: string, arenaMarks: number): Promise<Player>;
  // §10 (M14) — carteira e energia. Separadas de `updateArenaMarks` porque marcas são
  // PvP e estas são PvE: um fluxo nunca mexe nas duas coisas ao mesmo tempo.
  updateWallet(id: string, wallet: { gold: number; stones: number }): Promise<Player>;
  // §10/D17 (M18) — separada de `updateWallet` pelo mesmo motivo que aquela é separada de
  // `updateArenaMarks`: nenhum fluxo mexe nas duas coisas ao mesmo tempo. Summon e energia
  // extra tocam só esta; farmar e forjar tocam só aquela.
  updatePremium(id: string, premium: number): Promise<Player>;
  // §9.4 (M20) — exclusão de conta. Apaga o jogador e TUDO que o referencia; com chave
  // estrangeira, esquecer uma tabela não deixa lixo, deixa a exclusão falhar. Devolve
  // `false` se não havia o que apagar.
  deletePlayer(id: string): Promise<boolean>;
  updateEnergy(id: string, energy: EnergyState): Promise<Player>;
  // Candidatos de matchmaking dentro de uma faixa de ELO, excluindo o próprio chamador —
  // "quem tem defesa configurada" é filtrado depois, na rota (cruza com
  // ArenaDefenseRepository); manter esse cruzamento fora do repositório evita acoplar
  // PlayerRepository a ArenaDefenseRepository.
  findOpponentsNearElo(input: { excludePlayerId: string; eloMin: number; eloMax: number }): Promise<readonly Player[]>;
  // §9.1 — soft-reset de ELO no início de uma temporada nova (season/lifecycle.ts) precisa
  // tocar todo jogador, não só um.
  listAll(): Promise<readonly Player[]>;
}

// §9.1 — "ELO, temporadas de 14 dias." Uma linha por temporada; `seasonNumber` é
// sequencial a partir de 1. `endsAt` é sempre `startedAt + 14 dias` — guardado explícito
// (em vez de recalculado sempre a partir de `startedAt`) pra o rollover (season/
// lifecycle.ts) só precisar comparar contra `now()`, sem reimplementar a soma em todo
// lugar que lê a temporada atual.
export interface Season {
  readonly id: string;
  readonly seasonNumber: number;
  readonly startedAt: string; // ISO 8601
  readonly endsAt: string; // ISO 8601
}

export interface SeasonRepository {
  getCurrentSeason(): Promise<Season | null>;
  createSeason(season: Season): Promise<Season>;
}

// §9.4 — "servidor recalcula stat sheets a partir do inventário no banco; nunca aceita
// stats do cliente." `StoredHero` é a fonte de verdade server-side; o cliente só manda
// ids (heroId), nunca stats resolvidos.
export interface StoredHero {
  readonly ownerPlayerId: string;
  readonly hero: Hero;
  readonly equippedItems: readonly ItemInstance[];
}

export interface HeroRepository {
  // §9.4 (M20) — exclusão de conta. Cada repositório apaga o que ele guarda daquele
  // jogador; a rota orquestra os sete. Método por repositório em vez de um `ON DELETE
  // CASCADE` no banco porque os dois backends precisam da MESMA semântica observável, e
  // cascade só existiria no Postgres — a bateria de paridade não teria o que comparar.
  deleteHeroesByOwner(ownerPlayerId: string): Promise<void>;
  getHeroById(heroId: string): Promise<StoredHero | null>;
  // M27 2/N — devolve NA ORDEM PEDIDA, e os ids desconhecidos simplesmente não aparecem
  // (é assim que o chamador detecta "herói desconhecido": comparando os tamanhos).
  //
  // A ordem faz parte do contrato porque `assembleChapterBattle` e a masmorra casam
  // `stored[index]` com `slots[index]`: é ela que decide quem ocupa qual vaga, e quem ocupa
  // qual vaga decide a partida. O de memória sempre respeitou o pedido; o de Postgres
  // consultava com `= ANY($1)`, que não promete ordem alguma — a divergência só existiria
  // em produção, que é a categoria de defeito que a bateria de paridade existe para achar.
  getHeroesByIds(heroIds: readonly string[]): Promise<readonly StoredHero[]>;
  // §9.1 (M13, sub-sessão 2/N) — o roster do jogador. `POST /battles` sempre exigiu
  // `attackerHeroIds`, e até aqui não havia como o cliente DESCOBRIR quais são os seus:
  // os ids só existiam em fixture de teste e em seed de banco.
  listHeroesByOwner(ownerPlayerId: string): Promise<readonly StoredHero[]>;
  createHero(input: StoredHero): Promise<StoredHero>;
  // §10 — comprar na loja de arena reequipa um herói já existente (troca o item do slot
  // correspondente); nenhum fluxo precisava atualizar um herói salvo até agora.
  updateHero(input: StoredHero): Promise<StoredHero>;
}

// §9.1 — "o defensor monta um time de até 5 heróis, posiciona-os... define tacticsScript
// de cada um e uma IA de mapa declarativa por herói." Uma unidade de defesa referencia um
// heroId (o tacticsScript já mora no próprio Hero) + onde/como ela é IA.
export interface ArenaDefenseUnit {
  readonly heroId: string;
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype: MapAiArchetype;
}

export interface ArenaDefense {
  readonly ownerPlayerId: string;
  readonly mapId: string;
  readonly units: readonly ArenaDefenseUnit[];
}

export interface ArenaDefenseRepository {
  // §9.4 (M20) — exclusão de conta. Cada repositório apaga o que ele guarda daquele
  // jogador; a rota orquestra os sete. Método por repositório em vez de um `ON DELETE
  // CASCADE` no banco porque os dois backends precisam da MESMA semântica observável, e
  // cascade só existiria no Postgres — a bateria de paridade não teria o que comparar.
  deleteDefenseByOwner(ownerPlayerId: string): Promise<void>;
  getDefenseByOwner(ownerPlayerId: string): Promise<ArenaDefense | null>;
  saveDefense(defense: ArenaDefense): Promise<ArenaDefense>;
}

// §9.4 — "anti-replay: nonce por partida" + "replays" (roadmap de M7, sub-sessão 9): o
// `nonce` (gerado pelo cliente, único por tentativa de batalha) dobra como chave de
// idempotência (uma batalha só roda uma vez, mesmo se a requisição for reenviada) E como
// id do replay persistido — os dois problemas compartilham a mesma necessidade de
// identidade única por tentativa, então uma única tabela resolve ambos.
export interface StoredReplay {
  readonly nonce: string;
  readonly rulesVersion: string;
  readonly seed: number;
  readonly initialState: BattleSetup;
  readonly commands: readonly BattleCommand[];
  readonly result: BattleResult;
  readonly attackerPlayerId: string;
  readonly defenderPlayerId: string;
  readonly createdAt: string; // ISO 8601
}

export interface ReplayRepository {
  // §9.4 (M20) — exclusão de conta. Cada repositório apaga o que ele guarda daquele
  // jogador; a rota orquestra os sete. Método por repositório em vez de um `ON DELETE
  // CASCADE` no banco porque os dois backends precisam da MESMA semântica observável, e
  // cascade só existiria no Postgres — a bateria de paridade não teria o que comparar.
  deleteReplaysOfPlayer(playerId: string): Promise<void>;
  getByNonce(nonce: string): Promise<StoredReplay | null>;
  save(replay: StoredReplay): Promise<StoredReplay>;
}


// §10 (M14, sub-sessão 3/N) — o estado de conta do PvE. Decisão do usuário na sub-sessão
// 1/N: ele mora no SERVIDOR, como o PvP de M7/M8, porque §9.4 manda o servidor recalcular
// tudo a partir do banco e porque partir a economia em duas (marcas no servidor, ouro no
// cliente) seria pior que não tê-la.
//
// Fica em um repositório próprio, e não dentro de `PlayerRepository`, pelo mesmo motivo
// que `ArenaDefenseRepository` é separado: nenhum fluxo precisa das duas coisas juntas, e
// juntar acoplaria o cadastro de jogador ao inventário.
export interface DungeonRunRecord {
  readonly nonce: string;
  readonly playerId: string;
  readonly dungeonId: string;
  readonly mode: 'manual' | 'auto';
  readonly outcome: 'victory' | 'defeat';
  readonly createdAt: string; // ISO 8601
}

// §10 (M14, 4/N) — as ações de progressão que cobram recurso. Uma chave de idempotência
// por ação, pelo mesmo motivo do nonce da batalha: reenvio de rede não pode cobrar duas
// vezes.
// M19 — os kinds viraram uma CONSTANTE, e o tipo é derivado dela.
//
// Antes era uma união escrita à mão aqui e uma cláusula `CHECK` escrita à mão na migration
// 0008, e as duas derivaram: M18 3/N acrescentou `summon` e `energy` de um lado só. Em
// memória um `Map` aceita qualquer string, então a suíte inteira ficou verde enquanto o
// Postgres recusaria as duas ações que gastam a moeda premium.
//
// Uma constante em tempo de execução é o que permite a `tests/migrations.test.ts` comparar
// os dois lados. O tipo continua estreito porque sai dela.
export const ECONOMY_ACTION_KINDS = ['enhance', 'awaken', 'imprint', 'equip', 'summon', 'energy'] as const;

export interface EconomyActionRecord {
  readonly nonce: string;
  readonly playerId: string;
  // M18 3/N acrescentou `summon` e `energy`: são ações que cobram recurso, e reusar este
  // mecanismo é melhor que inventar outro — reenvio de rede não pode cobrar duas vezes, e
  // o problema é literalmente o mesmo.
  readonly kind: (typeof ECONOMY_ACTION_KINDS)[number];
  readonly createdAt: string; // ISO 8601
}

// §10 (M18, 3/N) — a POSSE de personagem, e o contador de pity.
//
// Posse é estado de conta, e até M18 não existia em lugar nenhum: `listHeroesByOwner`
// devolvia as instâncias de herói semeadas, e nenhuma rota perguntava se o jogador possuía
// o personagem que mandou. §9.4 ("o servidor recalcula a partir do banco") não tinha como
// pegar isso, porque não havia o que consultar.
//
// **O núcleo de história NÃO tem linha aqui.** Ele é derivado do catálogo — quem tem
// `acquisition: 'story'` é de todo mundo, por definição (D14). Guardar linhas para ele
// seria uma cópia que pode divergir, e obrigaria um passo de concessão em toda conta nova;
// derivando, um personagem de história acrescentado amanhã já é de todos, que é o que
// "garantido a todo jogador" quer dizer.
// §10 (M18, 4/N) — o que o jogador já reivindicou, e quais capítulos ele já limpou.
//
// Reivindicações de conquista e de evento compartilham a mesma tabela porque a pergunta é
// a mesma ("este prêmio já foi pago a este jogador?") e os ids são únicos entre os dois
// (`achievement-*` e `event-*`). Duas tabelas seriam duas implementações da mesma coisa.
//
// Os capítulos ficam SEPARADOS de `EconomyRepository.listClears`, que é das masmorras, e
// não por organização: aquele conjunto tem significado próprio — é o que libera a varredura
// (`requiresClearOf`) — e misturar capítulo nele faria um capítulo limpo destravar uma
// masmorra por acidente.
export interface RewardsRepository {
  // §9.4 (M20) — exclusão de conta. Cada repositório apaga o que ele guarda daquele
  // jogador; a rota orquestra os sete. Método por repositório em vez de um `ON DELETE
  // CASCADE` no banco porque os dois backends precisam da MESMA semântica observável, e
  // cascade só existiria no Postgres — a bateria de paridade não teria o que comparar.
  deletePlayerData(playerId: string): Promise<void>;
  listClaims(playerId: string): Promise<readonly string[]>;
  // Devolve `false` se já estava reivindicado. É a checagem e a escrita numa operação só,
  // porque separá-las deixaria a fresta em que duas requisições simultâneas pagam duas
  // vezes o mesmo prêmio.
  claim(playerId: string, rewardId: string): Promise<boolean>;

  listClearedChapters(playerId: string): Promise<readonly string[]>;
  // Devolve `true` se foi a PRIMEIRA vez. É o que decide se a moeda de primeira completude
  // é paga, pelo mesmo motivo de `claim`: perguntar e depois escrever abriria a fresta.
  markChapterCleared(playerId: string, chapterId: string): Promise<boolean>;
}

export interface CharacterOwnershipRepository {
  // §9.4 (M20) — exclusão de conta. Cada repositório apaga o que ele guarda daquele
  // jogador; a rota orquestra os sete. Método por repositório em vez de um `ON DELETE
  // CASCADE` no banco porque os dois backends precisam da MESMA semântica observável, e
  // cascade só existiria no Postgres — a bateria de paridade não teria o que comparar.
  deletePlayerData(playerId: string): Promise<void>;
  // Só o que foi ADQUIRIDO. Quem chama une com o núcleo do catálogo (`ownedCharacterIds`).
  listAcquired(playerId: string): Promise<readonly string[]>;
  grant(playerId: string, characterId: string): Promise<void>;
  // Contador de pity por (jogador, banner). Ausente = nunca rolou neste banner.
  getPity(playerId: string, bannerId: string): Promise<number | null>;
  setPity(playerId: string, bannerId: string, rollsSinceNew: number): Promise<void>;
}

export interface EconomyRepository {
  // §9.4 (M20) — exclusão de conta. Cada repositório apaga o que ele guarda daquele
  // jogador; a rota orquestra os sete. Método por repositório em vez de um `ON DELETE
  // CASCADE` no banco porque os dois backends precisam da MESMA semântica observável, e
  // cascade só existiria no Postgres — a bateria de paridade não teria o que comparar.
  deletePlayerData(playerId: string): Promise<void>;
  // Materiais e fragmentos, por jogador.
  getMaterials(playerId: string): Promise<Readonly<Record<string, number>>>;
  setMaterials(playerId: string, materials: Readonly<Record<string, number>>): Promise<Readonly<Record<string, number>>>;

  // Inventário: o que dropou e ainda não foi equipado. Item equipado vive em `heroes`
  // (StoredHero.equippedItems) desde M7 — um item nunca está nos dois lugares.
  listItems(playerId: string): Promise<readonly ItemInstance[]>;
  getItem(playerId: string, itemId: string): Promise<ItemInstance | null>;
  addItems(playerId: string, items: readonly ItemInstance[]): Promise<readonly ItemInstance[]>;
  replaceItem(playerId: string, item: ItemInstance): Promise<ItemInstance>;
  removeItem(playerId: string, itemId: string): Promise<void>;

  // Quais masmorras o jogador já limpou À MÃO — é o que libera a varredura (decisão do
  // usuário: "dificuldades menores que a pessoa teria que cleanar inicialmente e depois
  // poderia colocar um time automático").
  listClears(playerId: string): Promise<readonly string[]>;
  markCleared(playerId: string, dungeonId: string): Promise<void>;

  // Estado da trava de tempo, por masmorra. `null` = nunca entrou.
  getEntryState(playerId: string, dungeonId: string): Promise<EntryLimitState | null>;
  setEntryState(playerId: string, dungeonId: string, state: EntryLimitState): Promise<EntryLimitState>;

  // Idempotência da run, pelo mesmo mecanismo do `nonce` de `POST /battles` (M7): uma run
  // só é paga e recompensada uma vez, mesmo se a requisição for reenviada.
  getRun(nonce: string): Promise<DungeonRunRecord | null>;
  saveRun(run: DungeonRunRecord): Promise<DungeonRunRecord>;

  getAction(nonce: string): Promise<EconomyActionRecord | null>;
  saveAction(action: EconomyActionRecord): Promise<EconomyActionRecord>;
}

// §9.4 (M22, sub-sessão 2/N) — a RESPOSTA guardada por nonce.
//
// O nonce já existia em três lugares (`replays`, `dungeon_runs`, `economy_actions`) e já
// impedia a segunda cobrança. O que ele NÃO fazia é devolver o que aconteceu na primeira:
// o reenvio levava `409 nonce já utilizado`, e do ponto de vista do jogador a run tinha
// sumido levando a energia junto — ele pagou, o servidor resolveu, e a resposta se perdeu
// no cabo.
//
// Guardar a resposta transforma o reenvio em REPETIÇÃO da primeira: mesmo status, mesmo
// corpo, nenhuma cobrança nova. É o que a reconexão precisa, e é genérico de propósito —
// toda rota que aceita nonce ganha isso sem escrever uma linha.
export interface StoredResponse {
  readonly nonce: string;
  readonly playerId: string;
  // Método + rota (`POST /dungeons/:id/run`). Guardado para recusar o mesmo nonce usado em
  // outra rota: repetir a resposta de uma masmorra para um pedido de invocação seria
  // responder outra pergunta.
  readonly route: string;
  readonly status: number;
  readonly body: unknown;
  readonly createdAt: string; // ISO 8601
}

export interface IdempotencyRepository {
  get(playerId: string, nonce: string): Promise<StoredResponse | null>;
  save(entry: StoredResponse): Promise<void>;
  deletePlayerData(playerId: string): Promise<void>;
}
