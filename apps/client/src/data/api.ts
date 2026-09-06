import { RULES_VERSION, isRulesVersionMismatch, type RulesVersionMismatch } from '@paths-beyond/core';
import { resolveApiBaseUrl } from './platformBridge.js';
import type {
  BattleCommand,
  BattleResult,
  BattleSetup,
  Hero,
  ItemInstance,
  MapAiArchetype,
  TacticsScript,
  TalentAllocation,
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
export interface CampaignChapter {
  readonly id: string;
  readonly chapter: number;
  readonly name: string;
  readonly cleared: boolean;
  // D16 — o capítulo declara VAGAS, não a party. Quantas o jogador preenche.
  readonly slots: number;
}

export interface CampaignListResponse {
  readonly chapters: readonly CampaignChapter[];
  readonly premiumOnFirstClear: number;
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

export interface BannerView {
  readonly id: string;
  readonly name: string;
  readonly pityThreshold: number;
  readonly premiumCost: number;
  // D18 — o pity é DURO e contado: depois de `pityThreshold` rolagens sem personagem novo,
  // a próxima é garantida. O contador é da conta, e a tela só o exibe.
  readonly rollsSinceNew: number;
  readonly pool: readonly { readonly characterId: string; readonly weight: number }[];
}

export interface BannersResponse {
  readonly premium: number;
  readonly banners: readonly BannerView[];
}

export type SummonOutcome =
  | { readonly kind: 'character'; readonly characterId: string }
  | { readonly kind: 'duplicate'; readonly characterId: string; readonly fragmentMaterialId: string };

export interface SummonResponse {
  readonly outcome: SummonOutcome;
  readonly premium: number;
  readonly rollsSinceNew: number;
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

  saveDefense: (ticket: string, mapId: string, units: readonly ArenaDefenseUnit[]) =>
    request<ArenaDefense>(ticket, '/me/defense', { method: 'PUT', body: JSON.stringify({ mapId, units }) }),

  requestTicket: (ticket: string, attackerHeroIds: readonly string[], defenderPlayerId: string) =>
    request<BattleTicket>(ticket, '/battles/ticket', {
      method: 'POST',
      body: JSON.stringify({ attackerHeroIds, defenderPlayerId }),
    }),

  submitBattle: (
    ticket: string,
    body: {
      readonly attackerHeroIds: readonly string[];
      readonly defenderPlayerId: string;
      readonly commands: readonly BattleCommand[];
      readonly rulesVersion: string;
      readonly nonce: string;
    },
  ) => request<BattleOutcomeResponse>(ticket, '/battles', { method: 'POST', body: JSON.stringify(body) }),

  fetchReplay: (ticket: string, replayNonce: string) => request<StoredReplayResponse>(ticket, `/battles/${replayNonce}`),

  economy: (ticket: string) => request<EconomySnapshot>(ticket, '/me/economy'),

  dungeons: (ticket: string) => request<{ readonly dungeons: readonly DungeonListEntry[] }>(ticket, '/dungeons'),

  requestDungeonTicket: (ticket: string, dungeonId: string, heroIds: readonly string[]) =>
    request<DungeonTicket>(ticket, `/dungeons/${dungeonId}/ticket`, {
      method: 'POST',
      body: JSON.stringify({ heroIds }),
    }),

  submitDungeonRun: (
    ticket: string,
    dungeonId: string,
    body: {
      readonly nonce: string;
      readonly heroIds: readonly string[];
      readonly commands?: readonly BattleCommand[];
      readonly auto?: boolean;
    },
    // M22 1/N — a versão de regras vai na submissão, como em `/battles` desde o M7. O
    // ticket já a devolvia e o cliente não a mandava de volta: não havia o que validar.
  ) =>
    request<DungeonRunResponse>(ticket, `/dungeons/${dungeonId}/run`, {
      method: 'POST',
      body: JSON.stringify({ ...body, rulesVersion: RULES_VERSION }),
    }),

  sweepDungeon: (ticket: string, dungeonId: string, heroIds: readonly string[]) =>
    request<DungeonRunResponse>(ticket, `/dungeons/${dungeonId}/run`, {
      method: 'POST',
      body: JSON.stringify({ nonce: nonce(), heroIds, auto: true, rulesVersion: RULES_VERSION }),
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

  imprintHero: (ticket: string, heroId: string) =>
    request<{ readonly hero: Hero; readonly materials: Readonly<Record<string, number>> }>(
      ticket,
      `/heroes/${heroId}/imprint`,
      { method: 'POST', body: JSON.stringify({ nonce: nonce() }) },
    ),

  // §10/§9.4 (M18, 7/N) — a campanha.
  campaign: (ticket: string) => request<CampaignListResponse>(ticket, '/campaign'),

  requestCampaignTicket: (ticket: string, chapterId: string, heroIds: readonly string[]) =>
    request<CampaignTicket>(ticket, `/campaign/${chapterId}/ticket`, {
      method: 'POST',
      body: JSON.stringify({ heroIds }),
    }),

  submitCampaignRun: (
    ticket: string,
    chapterId: string,
    body: {
      readonly nonce: string;
      readonly heroIds: readonly string[];
      readonly commands: readonly BattleCommand[];
    },
  ) =>
    request<CampaignRunResponse>(ticket, `/campaign/${chapterId}/run`, {
      method: 'POST',
      body: JSON.stringify({ ...body, rulesVersion: RULES_VERSION }),
    }),

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
