import { RULES_VERSION, isRulesVersionMismatch, type RulesVersionMismatch } from '@paths-beyond/core';
import { resolveApiBaseUrl } from './platformBridge.js';
import type {
  ActiveEffect,
  BattleCommand,
  DuelResult,
  BattleResult,
  BattleSetup,
  BattleUnit,
  Coord,
  GridMap,
  Hero,
  ItemInstance,
  MapAiArchetype,
  SoulInstance,
  TacticsScript,
  TalentAllocation,
  UnitType,
  WinCondition,
} from '@paths-beyond/core';

// M13, sub-sessão 2/N — a camada de rede do cliente. Até aqui o cliente **não tinha um
// `fetch` sequer**: o servidor de M7 existia e ninguém falava com ele.
//
// Caminho relativo `/api/...` de propósito: o Vite encaminha pro servidor em dev
// (vite.config.ts) e em produção o mesmo caminho vale atrás de qualquer proxy. Sem isso
// seria origem cruzada e a chamada morreria no CORS.
//
// Nada aqui interpreta regra de jogo — só transporta. Quem simula é `packages/core`, dos
// dois lados (regra 3).

// §9.4 (M21, 2/N) — resolvido na carga do módulo: o `preload` do shell injeta
// `window.pathsBeyond` antes de qualquer script da página, e no navegador a resolução cai no
// caminho relativo de sempre.
const BASE = resolveApiBaseUrl();

// §9.4 (M20) — auth por TICKET DE PLATAFORMA no header `x-platform-ticket`.
//
// Era um token opaco que o jogador digitava (stub de M7). Com economia real e uma moeda que
// se compra com dinheiro, um identificador digitável é ao mesmo tempo a autenticação e o
// mecanismo de personificação. O ticket vem da plataforma (`data/platformBridge.ts`), vale
// segundos, e nada dele é guardado do nosso lado.
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    // §3.3/§9.4 (M22, 1/N) — o corpo do erro, guardado inteiro.
    //
    // Até aqui só a mensagem sobrevivia ao `throw`, e mensagem é texto para humano. O
    // servidor passou a responder mismatch de versão com dado estruturado, e quem precisa
    // DECIDIR o que mostrar é a tela: com o corpo em mãos, `isRulesVersionMismatch` responde
    // por código em vez de por redação.
    readonly body: unknown = null,
  ) {
    super(message);
  }

  // "Este erro quer dizer: atualize o jogo." Perguntado assim, e não comparando string, para
  // a tela não parar de aparecer no dia em que alguém melhorar a frase.
  get rulesVersionMismatch(): boolean {
    return isRulesVersionMismatch(this.body);
  }
}

// §3.3/§9.4 (M22, 1/N) — o AVISO de versão incompatível, publicado de um lugar só.
//
// **Por que aqui e não em cada `catch` da store.** O mismatch pode vir de QUALQUER rota que
// reexecuta comandos — arena, masmorra, capítulo — e as três estão em telas diferentes.
// Tratar em cada chamada significaria lembrar de tratar em toda chamada nova; publicando na
// camada de requisição, uma rota futura já nasce coberta.
type OuvinteDeVersao = (mismatch: RulesVersionMismatch) => void;
const ouvintesDeVersao = new Set<OuvinteDeVersao>();

export function onRulesVersionMismatch(ouvinte: OuvinteDeVersao): () => void {
  ouvintesDeVersao.add(ouvinte);
  return () => ouvintesDeVersao.delete(ouvinte);
}

async function request<T>(ticket: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-platform-ticket': ticket,
      ...(init?.headers ?? {}),
    },
  });

  const text = await response.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!response.ok) {
    const message = (body as { error?: string } | null)?.error ?? `erro ${response.status}`;
    if (isRulesVersionMismatch(body)) {
      // O erro continua sendo lançado: quem chamou precisa saber que a requisição falhou. O
      // aviso é além disso, para a tela que bloqueia o jogo.
      for (const ouvinte of ouvintesDeVersao) ouvinte(body);
    }
    throw new ApiError(response.status, message, body);
  }
  return body as T;
}

export interface PlayerInfo {
  readonly id: string;
  readonly displayName: string;
  readonly elo: number;
  readonly arenaMarks: number;
}

export interface OpponentInfo {
  readonly playerId: string;
  readonly displayName: string;
  readonly elo: number;
  readonly mapId?: string;
}

export interface RosterEntry {
  readonly hero: Hero;
  readonly equippedItems: readonly ItemInstance[];
}

// O "ticket de batalha" (§9.1/§9.4): o confronto montado e a seed, ANTES de jogar. Ver
// `apps/server/src/battle/ticket.ts`.
export interface BattleTicket {
  readonly nonce: string;
  readonly seed: number;
  readonly rulesVersion: string;
  readonly setup: BattleSetup;
  readonly defenderPlayerId: string;
  // M26 3/N — quem é cada unidade do tabuleiro, para DESENHAR. `BattleUnit.heroId` guarda a
  // INSTÂNCIA de herói e o manifesto de arte é indexado pelo PERSONAGEM; na campanha o cliente
  // fecha essa distância pelo roster, e em PvP não fecha nem em princípio — o time do defensor
  // são instâncias de outra conta. Viaja ao lado do setup, e não dentro dele, para
  // `packages/core` ficar intocado e `RULES_VERSION` não subir por um dado que nenhuma regra lê.
  // Unidade ausente do mapa cai no glifo do M16, que é o caso normal de uma ficha de cenário.
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
}

// §9.1 (M15, sub-sessão 3/N) — o time que defende o castelo do jogador enquanto ele está
// offline. `PUT /me/defense` existe no servidor desde M7 e NENHUMA linha de cliente jamais
// o chamou: era a razão de o PvP assíncrono inteiro ser inalcançável sem `curl`.
export interface ArenaDefenseUnit {
  readonly heroId: string;
  readonly pos: { readonly x: number; readonly y: number };
  readonly height: 0 | 1 | 2 | 3;
  readonly aiArchetype: MapAiArchetype;
}

export interface ArenaDefense {
  readonly ownerPlayerId: string;
  readonly mapId: string;
  readonly units: readonly ArenaDefenseUnit[];
}

// M35 3/N (D42) — os presets de party: 8 slots por conta, no servidor.
export interface PartyPreset {
  readonly ownerPlayerId: string;
  readonly slot: number;
  readonly name: string;
  readonly heroIds: readonly string[];
}

export interface PartyPresetsResponse {
  readonly slots: number;
  readonly presets: readonly PartyPreset[];
}

// M34 2/N (D45) — a telemetria: a escolha de recusar e a DECLARAÇÃO do que é coletado, que
// é do servidor (ele a trava contra as próprias tabelas) e a tela só traduz.
export interface TelemetryResponse {
  readonly optOut: boolean;
  readonly collected: readonly string[];
}

export interface BattleOutcomeResponse {
  readonly seed: number;
  readonly result: BattleResult;
  readonly elo?: { readonly attacker: number; readonly defender: number };
  readonly arenaMarks?: { readonly attacker: number; readonly defender: number };
}

export interface StoredReplayResponse {
  readonly nonce: string;
  readonly rulesVersion: string;
  readonly seed: number;
  readonly initialState: BattleSetup;
  readonly commands: readonly BattleCommand[];
  readonly result: BattleResult;
  readonly attackerPlayerId: string;
  readonly defenderPlayerId: string;
  readonly createdAt: string;
  // Ver `BattleTicket.characterIdByUnitId`.
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
}

// §10 (M14, sub-sessão 5/N) — a economia PvE. O servidor já resolve a disponibilidade de
// cada masmorra (trancada, sem energia, varredura liberada); o cliente só desenha o que
// recebe (regra 3).
export interface EconomySnapshot {
  readonly energy: { readonly stored: number; readonly asOfMs: number };
  readonly energyMax: number;
  readonly wallet: { readonly gold: number; readonly stones: number; readonly arenaMarks: number };
  readonly materials: Readonly<Record<string, number>>;
  readonly inventory: readonly ItemInstance[];
  readonly clearedDungeons: readonly string[];
}

export interface DungeonListEntry {
  readonly id: string;
  readonly name: string;
  readonly focus: 'gear' | 'exp' | 'gold' | 'boss';
  readonly difficulty: 'normal' | 'elite';
  readonly energyCost: number;
  readonly manualOnly: boolean;
  readonly cleared: boolean;
  readonly sweepAvailable: boolean;
  readonly lockedBy: string | null;
  readonly entriesLeft: number | null;
  readonly enoughEnergy: boolean;
}

export interface DungeonTicket {
  readonly nonce: string;
  readonly seed: number;
  readonly rulesVersion: string;
  readonly setup: BattleSetup;
  readonly dungeonId: string;
  // Ver `BattleTicket.characterIdByUnitId`.
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
}

export interface DungeonRunRewards {
  readonly gold: number;
  readonly exp: number;
  readonly stones: number;
  readonly items: readonly ItemInstance[];
  readonly materials: Readonly<Record<string, number>>;
}

export interface DungeonRunResponse {
  readonly outcome: 'victory' | 'defeat';
  readonly roundsPlayed: number;
  readonly rewards: DungeonRunRewards | null;
  readonly energy: { readonly stored: number; readonly asOfMs: number };
}

export interface EnhanceResponse {
  readonly success: boolean;
  readonly item: ItemInstance;
  readonly cost: { readonly gold: number; readonly stones: number };
  readonly wallet: { readonly gold: number; readonly stones: number; readonly arenaMarks: number };
}

export interface EquipResponse {
  readonly hero: Hero;
  readonly equippedItems: readonly ItemInstance[];
  readonly unequipped: ItemInstance | null;
}

// §10/§9.4 (M18, 7/N) — a CAMPANHA, agora jogada contra o servidor. Mesmo fluxo da masmorra
// desde M14: ticket com o setup e a seed, o cliente joga a camada de grid, e a submissão
// reexecuta os comandos e exige vitória. Quem marca "capítulo limpo" e paga é sempre o
// servidor — cliente afirmando "limpei" é o vetor de fraude clássico, e aqui pior que o
// normal, porque a moeda que ele ganharia também se compra com dinheiro real.
// M27 (D23) — a MISSÃO. É ela que se joga: o ticket e a run continuam sendo por id de
// missão, e é o id dela que o servidor guarda como limpo.
export interface CampaignMission {
  readonly id: string;
  readonly order: number;
  readonly name: string;
  readonly cleared: boolean;
  // D16 — a missão declara VAGAS, não a party. Quantas o jogador preenche.
  readonly slots: number;
}

// M27 — o CAPÍTULO, camada nova. Não é jogável: ele agrupa missões e fecha quando todas
// elas caem — a mesma regra que `countFullyClearedChapters` aplica do lado das conquistas.
export interface CampaignChapter {
  readonly id: string;
  readonly order: number;
  readonly name: string;
  readonly cleared: boolean;
  readonly missions: readonly CampaignMission[];
}

// M36 (D47) — O ESTADO VISÍVEL, que é o que o cliente passa a receber de toda superfície de
// batalha. Espelha `apps/server/src/battle/visao.ts`, pela mesma convenção de todo outro tipo
// deste arquivo: o servidor é dono do contrato e o cliente o declara para poder desenhar.
//
// A assimetria é o milestone inteiro. A unidade do PRÓPRIO jogador chega como `BattleUnit`
// completo — §1.1, ele precisa ler o próprio compromisso. A do outro lado chega assim:
export interface UnidadeInimigaVisivel {
  readonly unitId: string;
  readonly side: 'player' | 'enemy';
  readonly pos: Coord;
  readonly height: 0 | 1 | 2 | 3;
  readonly hp: number;
  /** D48 — a exceção declarada: o HP resolvido, para a barra existir. */
  readonly hpMax: number;
  readonly ap: number;
  readonly pp: number;
  readonly hasActedThisRound: boolean;
  readonly effects: readonly ActiveEffect[];
  /** D48 — identidade é visível: o que a peça É (a arte já o mostra), e o que dá peso à animação. */
  readonly unitType: UnitType;
}

export type UnidadeVisivel = BattleUnit | UnidadeInimigaVisivel;

/** Quem é a unidade completa. Só o `BattleUnit` tem `stats` — é o discriminante. */
export function ehVisivelPorInteiro(unidade: UnidadeVisivel): unidade is BattleUnit {
  return 'stats' in unidade;
}

/** O HP máximo, venha ele do stat resolvido (meu lado) ou do campo redigido (o outro). */
export function hpMaximo(unidade: UnidadeVisivel): number {
  return ehVisivelPorInteiro(unidade) ? unidade.stats.hp : unidade.hpMax;
}

// M36 4/N (D47) — O ESTADO VISÍVEL INTEIRO, e a BATALHA VIVA.
//
// `ticket → joga tudo → run` morreu na 2/N. O que existe agora é uma partida no servidor: abrir
// devolve o tabuleiro redigido, cada comando é uma requisição, e o desfecho chega no comando que
// o produz. O cliente **reproduz o log** — ele não simula mais nada que envolva o inimigo.
export interface EstadoVisivel {
  readonly map: GridMap;
  readonly units: readonly UnidadeVisivel[];
  readonly initiativeOrder: readonly { readonly unitId: string; readonly initiative: number }[];
  readonly round: number;
  readonly valor: number;
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly winCondition: WinCondition;
  readonly permadeath: 'casual' | 'classic' | 'ironman';
  /** Só as unidades do próprio lado — é o que o cliente precisa para o alcance restante. */
  readonly distanceMovedThisTurn: Readonly<Record<string, number>>;
  readonly gateState?: Readonly<Record<string, { readonly opened: boolean; readonly hits: number }>>;
  readonly capturedObjectives?: readonly string[];
}

/**
 * Um passo do turno da IA, já redigido. É o que o cliente ANIMA — e a razão de ele existir é a
 * mesma do M16 4/N: sem o relato, as peças do inimigo TELEPORTAM. O que mudou em M36 é quem o
 * produz: antes o próprio cliente, rodando a IA; agora o servidor, porque os scripts dela são
 * ocultos (D47).
 */
export interface PassoDaIa {
  readonly command: BattleCommand;
  readonly duelResult?: DuelResult;
  readonly estadoAntes: EstadoVisivel;
}

/** O que o servidor paga ou cobra quando a batalha fecha. A forma varia com a superfície. */
export interface LiquidacaoDaPartida {
  readonly premiumAwarded?: number;
  readonly premium?: number;
  readonly rewards?: DungeonRunRewards | null;
  readonly energy?: { readonly stored: number; readonly asOfMs: number };
  readonly wallet?: { readonly gold: number; readonly stones: number; readonly arenaMarks: number };
  readonly elo?: { readonly attacker: number; readonly defender: number };
  readonly arenaMarks?: { readonly attacker: number; readonly defender: number };
  // M39 1/N — o exp da vitória numa instância PvE (a soma dos inimigos) e quem subiu de nível.
  readonly exp?: number;
  readonly subidas?: readonly { readonly heroId: string; readonly level: number; readonly niveisGanhos: number }[];
}

/** A partida, como ela chega ao abrir e ao reconectar. */
export interface VistaDaPartida {
  readonly nonce: string;
  readonly kind: 'campaign' | 'dungeon' | 'arena';
  /** `chapterId`, `dungeonId` ou o id do defensor, conforme o `kind`. */
  readonly refId: string;
  readonly rulesVersion: string;
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly visivel: EstadoVisivel;
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
  /** O turno de IA que acontece ANTES do primeiro comando. */
  readonly aberturaDaIa: readonly PassoDaIa[];
  /** Presente quando a batalha já nasceu decidida (o turno de abertura a fechou). */
  readonly liquidacao?: LiquidacaoDaPartida;
}

export interface RespostaDeComando {
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly roundsPlayed: number;
  readonly visivel: EstadoVisivel;
  /** O duelo que ESTE comando abriu, quando ele foi um `engage`. */
  readonly duelResult?: DuelResult;
  readonly passosDaIa: readonly PassoDaIa[];
  readonly liquidacao?: LiquidacaoDaPartida;
}

/**
 * O replay, na forma que o cliente REPRODUZ: uma lista de passos já redigidos.
 *
 * O acervo completo (`GET /battles/:nonce`) continua existindo, com o setup dos dois lados e os
 * comandos — é registro de auditoria, e quem o abre é quem jogou. O que o cliente usa para
 * DESENHAR é este, pelo mesmo motivo que ele não simula a batalha ao vivo: reproduzir o log é o
 * caminho único, e um segundo caminho que remontasse o estado localmente seria a divergência que
 * §9.1 chama de bug crítico.
 */
export interface LogDeReplay {
  readonly nonce: string;
  readonly rulesVersion: string;
  readonly outcome: 'ongoing' | 'victory' | 'defeat';
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
  readonly estadoInicial: EstadoVisivel;
  readonly passos: readonly PassoDaIa[];
}

// M36 3/N (D48) — a PRÉVIA da missão, agora do servidor.
//
// Ela era montada no cliente a partir de `packages/data/encounters` empacotado junto com o jogo
// (M35 2/N). Com o catálogo partido esse arquivo não viaja mais no bundle, e o que chega é o
// mesmo retrato que a batalha manda: o tabuleiro e o VISÍVEL. O time do jogador não está aqui —
// ele ainda vai escolher quem leva; o que está são as VAGAS onde eles vão entrar.
export interface MissionPreviewResponse {
  readonly missionId: string;
  readonly map: GridMap;
  readonly winCondition: WinCondition;
  /** Onde o jogador vai entrar: as posições autoradas das vagas, na ordem delas. */
  readonly vagas: readonly Coord[];
  readonly unidades: readonly UnidadeVisivel[];
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
}

export interface CampaignListResponse {
  readonly chapters: readonly CampaignChapter[];
  // Por MISSÃO. O bônus de fechar o capítulo vem à parte — ver D23 e o comentário em
  // `economy-rules.schema.ts` sobre por que são dois números e não um.
  readonly premiumOnFirstClear: number;
  readonly premiumOnChapterClear: number;
  // M36 3/N (D48) — a ordem em que a campanha APRESENTA os personagens, derivada do conteúdo
  // autorado no servidor. Era derivada aqui, de `catalog.encounters`, que saiu do bundle junto
  // com a ficha dos inimigos que mora nos mesmos arquivos. Opcional para um cliente novo
  // sobreviver a um servidor velho.
  readonly castOrder?: readonly string[];
}

export interface CampaignTicket {
  readonly nonce: string;
  readonly seed: number;
  readonly rulesVersion: string;
  readonly setup: BattleSetup;
  readonly chapterId: string;
  // Ver `BattleTicket.characterIdByUnitId`.
  readonly characterIdByUnitId: Readonly<Record<string, string>>;
}

export interface CampaignRunResponse {
  readonly outcome: 'victory' | 'defeat';
  readonly roundsPlayed: number;
  readonly premiumAwarded: number;
  readonly premium: number;
}

// §10 (M18, 6/N) — a AQUISIÇÃO. Quatro superfícies novas do servidor: o roster de
// PERSONAGENS (que não é o de heróis — um diz quem o jogador tem, o outro quais instâncias
// ele leva ao mapa), o banner com o pity, o resultado da rolagem e os prêmios.
//
// Nenhuma delas calcula nada aqui: quem sorteia é `packages/gacha` no servidor, quem conta
// o pity é a conta, e quem decide se um prêmio é reivindicável é `rewards/conditions.ts`.
// O cliente desenha o que recebeu (regra 3).
export interface CharacterRosterEntry {
  readonly id: string;
  readonly name: string;
  readonly classId: string;
  readonly acquisition: 'story' | 'summon';
  readonly owned: boolean;
  readonly fromStory: boolean;
}

export interface CharacterRosterResponse {
  readonly premium: number;
  readonly characters: readonly CharacterRosterEntry[];
}

// D49/D50 (M37) — o rank de BASE. O `legend` não aparece aqui porque não é invocável: o
// topo chega por evolução, e é estado de conta, não pool de banner.
export type BaseRankView = 'adventurer' | 'hero';

// M38 3/N–4/N (D54/D55/D56) — os TRÊS tipos de banner. O pity é guardado por tipo, o
// rotativo tem destaque e janela, o de personagem tem o token de 1,5·P e o genérico tem a
// escolha a cada 180.
export type BannerKindView = 'rotatingCharacter' | 'rotatingArtifact' | 'generic';

// Uma entrada do pool é personagem OU artefato — a forma do dado, que o servidor repete.
export type BannerPoolEntryView =
  | { readonly characterId: string; readonly artifactId?: undefined; readonly rank: BaseRankView; readonly weight: number }
  | { readonly artifactId: string; readonly characterId?: undefined; readonly rank: BaseRankView; readonly weight: number };

export interface BannerTokenView {
  readonly threshold: number;
  readonly artifactId: string;
  readonly rolls: number;
  readonly status: 'counting' | 'pending' | 'granted';
}

export interface BannerChoiceView {
  readonly every: number;
  readonly rolls: number;
  readonly pending: number;
}

export interface BannerView {
  readonly id: string;
  readonly kind: BannerKindView;
  readonly name: string;
  // D56 — a taxa BASE de `Hero`, em milésimos (6 = 0,6%). É o único número da curva que a
  // tela recebe: o soft pity fica escondido no servidor, por decisão do usuário.
  readonly baseRate: number;
  // Só nos rotativos: quem está em destaque (personagem ou artefato) e quando o banner sai.
  readonly featuredId?: string;
  readonly activeFrom?: string;
  readonly activeUntil?: string;
  // Só no rotativo de personagem.
  readonly token?: BannerTokenView;
  // Só no genérico.
  readonly choice?: BannerChoiceView;
  // D50 — o pity é DURO, contado e de DOIS ANDARES: um limiar e um contador por rank.
  // Depois de `pityThresholds[rank]` rolagens sem ninguém daquele rank, a próxima é
  // garantida NAQUELE rank. Os dois contadores são independentes. Tudo isso é da conta e
  // do servidor; a tela só exibe (regra 3).
  readonly pityThresholds: Readonly<Record<BaseRankView, number>>;
  readonly premiumCost: number;
  readonly rollsSince: Readonly<Record<BaseRankView, number>>;
  readonly pool: readonly BannerPoolEntryView[];
}

export interface BannersResponse {
  readonly premium: number;
  readonly banners: readonly BannerView[];
}

export type SummonOutcome =
  | { readonly kind: 'character'; readonly characterId: string; readonly rank: BaseRankView }
  | {
      readonly kind: 'duplicate';
      readonly characterId: string;
      readonly rank: BaseRankView;
      readonly fragmentMaterialId: string;
    }
  // M38 3/N — o artefato, e a duplicata dele (que vira fragmento do próprio artefato).
  | { readonly kind: 'artifact'; readonly artifactId: string; readonly rank: BaseRankView }
  | {
      readonly kind: 'artifactDuplicate';
      readonly artifactId: string;
      readonly rank: BaseRankView;
      readonly fragmentMaterialId: string;
    };

export interface SummonResponse {
  readonly outcome: SummonOutcome;
  readonly premium: number;
  // D50 — qual garantia disparou, se alguma. Fica fora do desfecho porque uma garantia pode
  // terminar em duplicata: ela promete o rank, não a novidade.
  readonly guaranteed: BaseRankView | null;
  readonly rollsSince: Readonly<Record<BaseRankView, number>>;
  // M38 3/N — o que o token entregou NESTA resposta (o deste banner, ou um pendente de outro
  // que a rolagem destravou), e o estado do token e da escolha deste banner.
  readonly tokenGrants?: readonly SummonOutcome[];
  readonly token?: { readonly rolls: number; readonly status: BannerTokenView['status'] };
  readonly choice?: { readonly rolls: number; readonly pending: number };
}

// M38 3/N — o resgate da escolha do genérico.
export interface ChoiceResponse {
  readonly outcome: SummonOutcome;
  readonly choice: { readonly rolls: number; readonly pending: number };
  readonly tokenGrants: readonly SummonOutcome[];
}

// M38 4/N (D53) — a instância de artefato na conta. O rank corrente NÃO vem: é função do
// awakening (`artifactRank` do core), e a tela o calcula para exibir.
export interface ArtifactInstanceView {
  readonly id: string;
  readonly artifactId: string;
  readonly awakening: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  readonly imprint: 0 | 1 | 2 | 3 | 4 | 5;
}

export interface RewardView {
  readonly id: string;
  readonly kind: 'achievement' | 'event';
  readonly name: string;
  readonly description: string;
  readonly premium: number;
  readonly claimed: boolean;
  readonly claimable: boolean;
  // Só em evento: "ainda não cumpri" e "perdi a janela" são estados diferentes, e separá-los
  // no cliente exigiria o relógio dele — que não decide nada neste projeto.
  readonly windowOpen?: boolean;
  // §9.4 (M21, 3/N) — só em conquista: o nome dela na plataforma e se está CUMPRIDA.
  // `earned` é cumprimento, não reivindicação: a conquista diz o que o jogador fez, e pegar
  // a moeda é outra coisa. Quem calcula é o servidor — aqui a string só é encaminhada.
  readonly platform?: { readonly id: string; readonly earned: boolean };
}

export interface RewardsResponse {
  readonly premium: number;
  readonly rewards: readonly RewardView[];
}

export interface ClaimResponse {
  readonly rewardId: string;
  readonly premiumAwarded: number;
  readonly premium: number;
}

export interface EnergyPurchaseResponse {
  readonly energy: { readonly stored: number; readonly asOfMs: number };
  readonly premium: number;
}

// O nonce é do CLIENTE, como no PvP: ele é a chave de idempotência (um reenvio de rede não
// pode cobrar duas vezes) e, no caso da masmorra, também o que deriva a seed no servidor.
function nonce(): string {
  return crypto.randomUUID();
}

export interface SessionResponse {
  readonly id: string;
  readonly displayName: string;
  readonly platformProvider: string;
  readonly platformId: string;
  readonly elo: number;
  readonly arenaMarks: number;
  // `true` só na primeira vez: é o que a tela usa para dizer "bem-vindo" em vez de
  // "bem-vindo de volta".
  readonly created: boolean;
}

export const api = {
  // §9.4 (M20) — o sign-in. É a ÚNICA rota que cria conta, e por isso a única que aceita um
  // ticket sem conta do outro lado.
  session: (ticket: string) =>
    request<SessionResponse>(ticket, '/accounts/session', { method: 'POST', body: JSON.stringify({}) }),

  deleteAccount: (ticket: string) => request<{ deleted: boolean }>(ticket, '/me', { method: 'DELETE' }),

  exportAccount: (ticket: string) => request<unknown>(ticket, '/me/export'),

  me: (ticket: string) => request<PlayerInfo>(ticket, '/me'),
  roster: (ticket: string) => request<readonly RosterEntry[]>(ticket, '/me/heroes'),
  findOpponent: (ticket: string) => request<OpponentInfo>(ticket, '/matchmaking/opponent'),

  // 404 = "ainda não montei defesa", que é estado normal e não erro: quem chama trata.
  defense: (ticket: string) => request<ArenaDefense>(ticket, '/me/defense'),
  // M35 3/N (D42) — presets de party.
  partyPresets: (ticket: string) => request<PartyPresetsResponse>(ticket, '/me/party-presets'),
  savePartyPreset: (ticket: string, slot: number, name: string, heroIds: readonly string[]) =>
    request<PartyPreset>(ticket, `/me/party-presets/${slot}`, { method: 'PUT', body: JSON.stringify({ name, heroIds }) }),
  deletePartyPreset: (ticket: string, slot: number) =>
    request<{ readonly deleted: boolean }>(ticket, `/me/party-presets/${slot}`, { method: 'DELETE' }),

  // M34 2/N (D45) — telemetria.
  telemetry: (ticket: string) => request<TelemetryResponse>(ticket, '/me/telemetry'),
  setTelemetry: (ticket: string, optOut: boolean) =>
    request<TelemetryResponse>(ticket, '/me/telemetry', { method: 'PUT', body: JSON.stringify({ optOut }) }),

  saveDefense: (ticket: string, mapId: string, units: readonly ArenaDefenseUnit[]) =>
    request<ArenaDefense>(ticket, '/me/defense', { method: 'PUT', body: JSON.stringify({ mapId, units }) }),

  // M36 4/N (D47) — `requestTicket`, `submitBattle` e `fetchReplay` SAÍRAM. As duas primeiras
  // eram o modelo `ticket → joga tudo → run` da arena, e o servidor não as registra mais; a
  // terceira lia o replay COMPLETO (setup dos dois lados, seed, comandos) para o cliente
  // reproduzir localmente, e reproduzir localmente é a simulação que D47 tirou dele. O que
  // ficou no lugar é `abrirPartidaDeArena` + `enviarComando` + `logDoReplay`.

  economy: (ticket: string) => request<EconomySnapshot>(ticket, '/me/economy'),

  dungeons: (ticket: string) => request<{ readonly dungeons: readonly DungeonListEntry[] }>(ticket, '/dungeons'),

  // M36 4/N (D47) — `requestDungeonTicket` e `submitDungeonRun` saíram; a masmorra à mão passa
  // por `abrirPartidaDeMasmorra` + `enviarComando`. A VARREDURA continua sendo uma submissão,
  // porque ela não tem cliente jogando — ver `sweepDungeon`.

  sweepDungeon: (ticket: string, dungeonId: string, heroIds: readonly string[], comNonce = nonce()) =>
    request<DungeonRunResponse>(ticket, `/dungeons/${dungeonId}/run`, {
      method: 'POST',
      body: JSON.stringify({ nonce: comNonce, heroIds, auto: true, rulesVersion: RULES_VERSION }),
    }),

  /**
   * O REENVIO da varredura que ficou em voo (M22 2/N). Mesmo corpo, mesmo nonce: o servidor
   * guarda a resposta por nonce e a devolve em vez de cobrar energia de novo.
   */
  reenviarVarredura: (
    ticket: string,
    dungeonId: string,
    corpo: { readonly nonce: string; readonly heroIds: readonly string[] },
  ) =>
    request<DungeonRunResponse>(ticket, `/dungeons/${dungeonId}/run`, {
      method: 'POST',
      body: JSON.stringify({ ...corpo, auto: true, rulesVersion: RULES_VERSION }),
    }),

  enhanceItem: (ticket: string, itemId: string, heroId?: string) =>
    request<EnhanceResponse>(ticket, `/items/${itemId}/enhance`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), ...(heroId ? { heroId } : {}) }),
    }),

  equipItem: (ticket: string, heroId: string, itemId: string) =>
    request<EquipResponse>(ticket, `/heroes/${heroId}/equip`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), itemId }),
    }),

  awakenHero: (ticket: string, heroId: string) =>
    request<{ readonly hero: Hero; readonly wallet: EconomySnapshot['wallet']; readonly materials: Readonly<Record<string, number>> }>(
      ticket,
      `/heroes/${heroId}/awaken`,
      { method: 'POST', body: JSON.stringify({ nonce: nonce() }) },
    ),

  // M39 1/N — usar Tomos de Experiência num herói.
  usarTomos: (ticket: string, heroId: string, materialId: string, quantidade: number) =>
    request<{ readonly hero: Hero; readonly niveisGanhos: number; readonly materials: Readonly<Record<string, number>> }>(
      ticket,
      `/heroes/${heroId}/exp-tomes`,
      { method: 'POST', body: JSON.stringify({ nonce: nonce(), materialId, quantidade }) },
    ),

  imprintHero: (ticket: string, heroId: string) =>
    request<{ readonly hero: Hero; readonly materials: Readonly<Record<string, number>> }>(
      ticket,
      `/heroes/${heroId}/imprint`,
      { method: 'POST', body: JSON.stringify({ nonce: nonce() }) },
    ),

  // §10/§9.4 (M18, 7/N) — a campanha.
  campaign: (ticket: string) => request<CampaignListResponse>(ticket, '/campaign'),

  // M36 3/N (D48) — a prévia da missão, do servidor. Ver `MissionPreviewResponse`.
  missionPreview: (ticket: string, missionId: string) =>
    request<MissionPreviewResponse>(ticket, `/campaign/${missionId}/previa`),

  // M36 4/N (D47) — A BATALHA VIVA. Três aberturas, um comando, uma desistência e uma
  // reconexão. As três superfícies passam pelas MESMAS rotas de comando e de leitura: um
  // caminho de duelo, não três.
  abrirPartidaDeCampanha: (ticket: string, missionId: string, heroIds: readonly string[]) =>
    request<VistaDaPartida>(ticket, `/campaign/${missionId}/matches`, {
      method: 'POST',
      body: JSON.stringify({ heroIds, rulesVersion: RULES_VERSION }),
    }),

  abrirPartidaDeMasmorra: (ticket: string, dungeonId: string, heroIds: readonly string[]) =>
    request<VistaDaPartida>(ticket, `/dungeons/${dungeonId}/matches`, {
      method: 'POST',
      body: JSON.stringify({ heroIds, rulesVersion: RULES_VERSION }),
    }),

  abrirPartidaDeArena: (ticket: string, attackerHeroIds: readonly string[], defenderPlayerId: string) =>
    request<VistaDaPartida>(ticket, '/arena/matches', {
      method: 'POST',
      body: JSON.stringify({ attackerHeroIds, defenderPlayerId, rulesVersion: RULES_VERSION }),
    }),

  /** A reconexão do M22, sem nada guardado em disco: quem sabe se há batalha aberta é o servidor. */
  partidaAtual: (ticket: string) => request<VistaDaPartida>(ticket, '/matches/current'),

  enviarComando: (ticket: string, nonce: string, command: BattleCommand) =>
    request<RespostaDeComando>(ticket, `/matches/${nonce}/commands`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    }),

  desistirDaPartida: (ticket: string, nonce: string) =>
    request<{ readonly outcome: 'defeat'; readonly forfeited: true }>(ticket, `/matches/${nonce}/forfeit`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  logDoReplay: (ticket: string, nonce: string) => request<LogDeReplay>(ticket, `/battles/${nonce}/log`),

  // M36 4/N (D47) — `requestCampaignTicket` e `submitCampaignRun` saíram, pelo mesmo motivo das
  // outras quatro: `abrirPartidaDeCampanha` + `enviarComando`.

  // §6.3/§8.2 (M18, 7/N) — a PREPARAÇÃO. Sem nonce: as duas são idempotentes por natureza
  // (gravar o mesmo script duas vezes deixa o mesmo script) e não cobram recurso nenhum.
  saveTactics: (ticket: string, heroId: string, tacticsScript: TacticsScript) =>
    request<{ readonly hero: Hero }>(ticket, `/heroes/${heroId}/tactics`, {
      method: 'PUT',
      body: JSON.stringify({ tacticsScript }),
    }),

  saveTalents: (ticket: string, heroId: string, talents: TalentAllocation) =>
    request<{ readonly hero: Hero }>(ticket, `/heroes/${heroId}/talents`, {
      method: 'PUT',
      body: JSON.stringify({ talents }),
    }),

  // §10 (M18, 6/N) — a aquisição.
  characterRoster: (ticket: string) => request<CharacterRosterResponse>(ticket, '/me/roster'),

  banners: (ticket: string) => request<BannersResponse>(ticket, '/summon/banners'),

  summon: (ticket: string, bannerId: string) =>
    request<SummonResponse>(ticket, '/summon', { method: 'POST', body: JSON.stringify({ nonce: nonce(), bannerId }) }),

  summonChoice: (ticket: string, bannerId: string, choiceId: string) =>
    request<ChoiceResponse>(ticket, '/summon/choice', {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), bannerId, choiceId }),
    }),

  // M38 4/N (D53/D56) — o artefato jogável.
  artifacts: (ticket: string) =>
    request<{ readonly artifacts: readonly ArtifactInstanceView[] }>(ticket, '/me/artifacts'),

  equipArtifact: (ticket: string, instanceId: string, heroId: string) =>
    request<{ readonly hero: Hero; readonly movedFrom: string | null }>(ticket, `/artifacts/${instanceId}/equip`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), heroId }),
    }),

  unequipArtifact: (ticket: string, heroId: string) =>
    request<{ readonly hero: Hero }>(ticket, `/heroes/${heroId}/artifact/unequip`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce() }),
    }),

  awakenArtifact: (ticket: string, instanceId: string) =>
    request<{ readonly artifact: ArtifactInstanceView }>(ticket, `/artifacts/${instanceId}/awaken`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce() }),
    }),

  imprintArtifact: (ticket: string, instanceId: string) =>
    request<{ readonly artifact: ArtifactInstanceView }>(ticket, `/artifacts/${instanceId}/imprint`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce() }),
    }),

  // M39 5/N (D61) — a Soul. Craft e recraft devolvem carteira e materiais, mas a tela relê a
  // economia inteira depois, como no artefato.
  souls: (ticket: string) => request<{ readonly souls: readonly SoulInstance[] }>(ticket, '/me/souls'),

  craftSoul: (ticket: string, characterId: string) =>
    request<{ readonly soul: SoulInstance }>(ticket, '/souls/craft', {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), characterId }),
    }),

  recraftSoul: (ticket: string, soulId: string) =>
    request<{ readonly soul: SoulInstance }>(ticket, `/souls/${soulId}/recraft`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce() }),
    }),

  equipSoul: (ticket: string, soulId: string, heroId: string) =>
    request<{ readonly hero: Hero }>(ticket, `/souls/${soulId}/equip`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), heroId }),
    }),

  unequipSoul: (ticket: string, heroId: string) =>
    request<{ readonly hero: Hero }>(ticket, `/heroes/${heroId}/soul/unequip`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce() }),
    }),

  purchaseEnergy: (ticket: string) =>
    request<EnergyPurchaseResponse>(ticket, '/energy/purchase', {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce() }),
    }),

  rewards: (ticket: string) => request<RewardsResponse>(ticket, '/me/rewards'),

  // Sem nonce: a idempotência do prêmio é a própria tabela de reivindicação (a chave é
  // jogador+prêmio), então um reenvio devolve 409 sem precisar de chave de rede.
  //
  // O corpo VAZIO é obrigatório mesmo sem nada a dizer: `request` manda
  // `content-type: application/json` em toda chamada, e o Fastify recusa com 400 um POST
  // que se declara JSON e chega sem corpo. Encontrado no navegador nesta fatia — o teste
  // de store não pegava, porque um `fetch` de mentira aceita qualquer coisa.
  claimReward: (ticket: string, rewardId: string) =>
    request<ClaimResponse>(ticket, `/rewards/${rewardId}/claim`, { method: 'POST', body: JSON.stringify({}) }),
};
