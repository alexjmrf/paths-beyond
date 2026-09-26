// M36 4/N (D47) — **o que saiu daqui é a milestone inteira.**
//
// `applyCommandAndAdvance`, `buildInitialState` e `buildBattleSetupFromHeroes` não estão mais na
// lista, e não podem voltar: informação oculta e simulação no cliente não coexistem. Se o
// cliente resolvesse o comando, ele teria os dados do inimigo para resolvê-lo — e um editor de
// memória os leria. Quem resolve é o servidor; o cliente **reproduz o log** que ele devolve.
//
// O que ficou do core é o que só depende do PRÓPRIO lado e do tabuleiro visível:
// `computeReachableTiles` (para onde a minha unidade anda), `openGateCoords`,
// `manhattanDistance`, `tileAt` e as funções de talento. `ambiente.test.ts` do cliente trava
// esta lista — ver `semSimulacaoNoCliente.test.ts`.
import {
  RULES_VERSION,
  computeReachableTiles,
  openGateCoords,
  manhattanDistance,
  tileAt,
  resetFromRow,
  validateColumnAllocation,
  type BattleCommand,
  type BattleUnit,
  type ClassDef,
  type Coord,
  type DuelResult,
  type GearSlot,
  type Id,
  type ItemInstance,
  type MapAiArchetype,
  type ReachableTile,
  type Hero,
  type TacticsScript,
  type TalentAllocation,
  type ColumnTalentTree,
  type ValorSkillDef,
} from '@paths-beyond/core';
import { create } from 'zustand';
import {
  api,
  ApiError,
  type BattleOutcomeResponse,
  type BattleTicket,
  type DungeonListEntry,
  type DungeonRunResponse,
  type DungeonTicket,
  type EconomySnapshot,
  type ArenaDefense,
  type PartyPreset,
  type ArenaDefenseUnit,
  type OpponentInfo,
  type PlayerInfo,
  type RosterEntry,
  type BannerView,
  type CampaignChapter,
  type CampaignMission,
  type CampaignRunResponse,
  type CampaignTicket,
  type MissionPreviewResponse,
  ehVisivelPorInteiro,
  type EstadoVisivel,
  type LiquidacaoDaPartida,
  type LogDeReplay,
  type PassoDaIa,
  type UnidadeVisivel,
  type VistaDaPartida,
  type CharacterRosterEntry,
  type RewardView,
  type SummonResponse,
  type ArtifactInstanceView,
} from '../data/api.js';
import { narrateAiTurns } from '../data/aiNarration.js';
import { catalog } from '../data/catalog.js';
import { espelharConquistas, sincronizarConquistasDaConta } from '../data/platformAchievements.js';
import { audioDoJogo, definirVolumesDoJogo } from '../audio/motorCompartilhado.js';
import { VOLUMES_PADRAO } from '../audio/sons.js';
import { CATALOGOS } from '../i18n/catalogos.js';
import { criarTradutor, idiomaDoNavegador, idiomaValido, type Idioma, type Tradutor } from '../i18n/idioma.js';
import type { AbaDoHub, TelaDoHub } from '../logic/tela.js';
import { preenchimentoPadrao } from '../logic/quemVai.js';
import { nomeDoDesfecho } from '../logic/rotulos.js';
import { guardarPedido, limparPedido, reenviarPedidoPendente } from '../logic/pedidoEmVoo.js';
import {
  marcarIntroducaoVista,
  proximaIntroducao,
  type GatilhoDeIntroducao,
  type Introducao,
} from '../logic/introducao.js';
import { platformBridge } from '../data/platformBridge.js';
import { DEFAULT_UI_SCALE, isSupportedUiScale } from '../data/overlayTheme.js';
import { readBuildCodeFor } from '../logic/buildCode.js';
import {
  browserSaveStorage,
  clearSave,
  loadSave,
  serializeSave,
  writeSave,
  SAVE_FORMAT_VERSION,
  type SaveGame,
  type SaveStorage,
} from '../logic/save.js';


// Seed fixa pra esta fatia de M6 — o cliente ainda não tem tela de configuração de
// batalha; a semente real por partida é trabalho de uma fatia futura (persistência/save).
const BATTLE_SEED = 42;

// §10/§9.4 (M18, sub-sessão 7/N) — o TABULEIRO VAZIO.
//
// A campanha deixou de ser montada no cliente: o `BattleSetup` de todo capítulo vem do
// `POST /campaign/:id/ticket`, como o da masmorra e o do PvP já vinham. Isso deixou o
// cliente sem batalha nenhuma no instante em que ele abre — e `battleState` não é opcional
// (quarenta lugares o leem, do canvas aos painéis).
//
// Em vez de tornar o estado nulo e espalhar `?.` pelo cliente inteiro, a tela abre num
// tabuleiro real e VAZIO: o grid do primeiro capítulo, sem uma única unidade. Medido antes
// de escolher — `buildInitialState` sobre um setup sem unidades devolve `outcome: 'ongoing'`
// com zero unidades e zero iniciativa, ou seja, nada acontece, nada é jogável e nenhum
// overlay de vitória dispara. É o que a tela deve mostrar enquanto o jogador escolhe o
// capítulo.
let tabuleiroVazioMemo: EstadoVisivel | null = null;

function tabuleiroVazio(): EstadoVisivel {
  if (tabuleiroVazioMemo) return tabuleiroVazioMemo;
  // M36 3/N — QUALQUER mapa serve, e agora tem de servir: a linha antiga escolhia o mapa da
  // primeira missão (`catalog.encounters[0]`), e `encounters` não viaja mais no bundle. O
  // tabuleiro vazio nunca dependeu de qual mapa era — ele existe para a tela abrir em algo real
  // e sem unidade nenhuma enquanto o jogador escolhe.
  const arenaMap = Object.values(catalog.maps)[0];
  if (!arenaMap) throw new Error('catálogo sem mapa para o tabuleiro vazio');

  // M36 4/N — um `EstadoVisivel` LITERAL, e não mais um `BattleSetup` passado por
  // `buildInitialState`. O tabuleiro vazio nunca precisou do motor: ele é um grid com zero
  // unidades, e montá-lo pelo core seria a última simulação do cliente sobrevivendo por
  // inércia num caso em que não há nada a simular.
  tabuleiroVazioMemo = {
    map: arenaMap.grid,
    units: [],
    initiativeOrder: [],
    round: 1,
    valor: arenaMap.initialValor,
    outcome: 'ongoing',
    winCondition: arenaMap.winCondition,
    permadeath: 'casual',
    distanceMovedThisTurn: {},
  };
  return tabuleiroVazioMemo;
}

// Quem é cada unidade do tabuleiro, para as telas que abrem sobre uma PESSOA (talentos,
// equipamento, táticas). `BattleUnit` carrega `heroId` e mais nada de identidade — ele é
// estado de batalha resolvido —, então a ponte é o roster que o servidor devolveu.
//
// Antes isto vinha de `data/campaign.ts`, montado do conteúdo local. Com a batalha vindo do
// servidor, o conteúdo local não sabe quem está no tabuleiro: só a conta sabe.
// M36 4/N — recebe o ESTADO VISÍVEL, e não mais o `BattleSetup`. A ponte continua sendo o
// `heroId`, que só a unidade do próprio jogador carrega — e é exatamente por isso que o mapa
// sempre foi só do lado dele: as telas que ele abre (talentos, equipamento, táticas) abrem sobre
// uma PESSOA, e inimigo nunca teve ficha para abrir.
export function heroesPorUnidade(
  units: readonly UnidadeVisivel[],
  roster: readonly RosterEntry[],
): Readonly<Record<string, Hero>> {
  const porHeroId = new Map(roster.map((entry) => [entry.hero.id, entry.hero] as const));
  const porUnidade: Record<string, Hero> = {};
  for (const unit of units) {
    if (!ehVisivelPorInteiro(unit)) continue;
    const hero = porHeroId.get(unit.heroId);
    if (hero) porUnidade[unit.unitId] = hero;
  }
  return porUnidade;
}

// A árvore de talentos de um herói vem da SUA classe real (`ClassDef.talentTree`,
// M5/M8) — diferente da árvore única de demonstração que M6 aplicava a toda unidade.
// `heroesByUnitId` (montado em `data/campaign.ts` ao resolver `Hero[]` →
// `buildBattleSetupFromHeroes`) é o único jeito de saber a classe de uma unidade, já
// que `BattleUnit` (core) não carrega `classId` — só o estado de batalha resolvido.
export function classDefForUnit(
  heroesByUnitId: Readonly<Record<string, Hero>>,
  unitId: string,
): ClassDef | undefined {
  const classId = heroesByUnitId[unitId]?.classId;
  return classId ? catalog.classes[classId] : undefined;
}

// §11/§09-roadmap (M13, sub-sessão 3/N) — "progresso sobrevive a recarregar a página".
// O formato e as conversões estão em `logic/save.ts`; o que mora aqui é só a ponte entre
// o save e o store: o que sai dele na abertura e o que entra nele quando muda.
const saveStorage: SaveStorage | null = browserSaveStorage();

// §8.1/§8.2 (M17, 4/N) — a árvore de talentos de uma unidade vem do PERSONAGEM que ela é,
// não mais da classe dela. `heroesByUnitId` continua sendo o caminho porque `BattleUnit`
// (core) não carrega `characterId` — ele é estado de batalha resolvido, e quem é aquela
// pessoa é assunto do conteúdo que montou a batalha.
export function characterTreeForUnit(
  heroesByUnitId: Readonly<Record<string, Hero>>,
  unitId: string,
): ColumnTalentTree | undefined {
  const characterId = heroesByUnitId[unitId]?.characterId;
  return characterId ? catalog.characterTalentTrees[characterId] : undefined;
}

// O despertar do herói entra na validação porque `minAwakening` é gate de nó (§10, M14):
// sem ele a tela ofereceria um nó avançado que o motor recusaria depois.
function awakeningForUnit(heroesByUnitId: Readonly<Record<string, Hero>>, unitId: string): number {
  return heroesByUnitId[unitId]?.awakening ?? 0;
}

// M27 — a missão vive DENTRO do capítulo, e mais de um lugar precisa achá-la pelo id. Uma
// função só porque a alternativa é cada chamador varrer as duas camadas do seu jeito.
export function missaoPorId(
  chapters: readonly CampaignChapter[],
  missionId: string | null,
): CampaignMission | undefined {
  if (!missionId) return undefined;
  for (const chapter of chapters) {
    const missao = chapter.missions.find((m) => m.id === missionId);
    if (missao) return missao;
  }
  return undefined;
}

// M27 3/N — QUAL capítulo abre quando a tela chega.
//
// Com seis missões a lista inteira cabia na tela; com trinta, três cabeçalhos e trinta
// botões numa rolagem só transformam "onde eu parei?" numa busca visual. O capítulo passa a
// recolher, e a escolha do que já vem aberto é esta: **o primeiro que ainda tem missão por
// limpar** — que é onde o jogador parou, e é o único capítulo em que ele tem algo a fazer.
//
// Função pura, e fora do `set` de propósito: a regra de "onde eu parei" é o que este arquivo
// precisa poder afirmar em teste sem montar tela nenhuma.
//
// Com tudo limpo não há "onde parou", e a resposta é o ÚLTIMO capítulo: quem terminou a demo
// e volta quer rejogar o fim, não recomeçar do começo.
export function capituloInicialAberto(chapters: readonly CampaignChapter[]): string | null {
  if (chapters.length === 0) return null;
  const parou = chapters.find((chapter) => chapter.missions.some((missao) => !missao.cleared));
  return (parou ?? chapters[chapters.length - 1]!).id;
}

// M32 — QUAL missão é a próxima ação quando o jogador ainda não escolheu nenhuma.
//
// O hub precisa de UMA coisa com peso visual maior que o resto (critério do M32). Com uma
// missão selecionada é o botão de entrar nela; sem seleção, é a primeira missão que ainda
// não foi limpa — onde o jogador parou, pela mesma regra de `capituloInicialAberto` acima.
// Com tudo limpo não há próxima, e nada ganha o peso: inventar uma seria apontar para o
// começo de quem já terminou.
export function proximaMissao(chapters: readonly CampaignChapter[]): string | null {
  for (const chapter of chapters) {
    const missao = chapter.missions.find((m) => !m.cleared);
    if (missao) return missao.id;
  }
  return null;
}

// A hidratação é SÍNCRONA, no boot do módulo. **M18 7/N: sem reconciliação**, porque não
// sobrou no save nada preso à regra nem ao conteúdo — só preferências e token. O que era
// reconciliado (capítulo, táticas, equipamento, talentos) agora mora no servidor, e quem
// concilia com a `rulesVersion` é ele, pelo 409 do replay.
const restoredSave = loadSave(saveStorage);

// §11/D24 (M25) — a ordem de resolução do idioma, e ela é a única que não atropela ninguém:
// a ESCOLHA do jogador vence; sem escolha, a língua do navegador; sem nenhuma das duas, o
// inglês, que é a língua de lançamento.
const idiomaInicial: Idioma = idiomaValido(restoredSave?.idioma)
  ? restoredSave.idioma
  : idiomaDoNavegador(globalThis.navigator?.language);

export function saveProjection(state: {
  readonly instantResultMode: boolean;
  readonly duelSceneEnabled: boolean;
  readonly colorblindMode: boolean;
  readonly uiScale: number;
  readonly pvp: PvpSession;
  readonly introducoesVistas: readonly string[];
  readonly volumeEfeitos: number;
  readonly volumeMusica: number;
  readonly idiomaEscolhido: string | null;
}): SaveGame {
  return {
    v: SAVE_FORMAT_VERSION,
    rulesVersion: RULES_VERSION,
    instantResultMode: state.instantResultMode,
    duelSceneEnabled: state.duelSceneEnabled,
    colorblindMode: state.colorblindMode,
    uiScale: state.uiScale,
    pvpToken: state.pvp.token,
    introducoesVistas: state.introducoesVistas,
    volumeEfeitos: state.volumeEfeitos,
    volumeMusica: state.volumeMusica,
    idioma: state.idiomaEscolhido,
  };
}

// §11 — "Preview de duelo: rodar simulateDuel com a seed real ... Este é o recurso mais
// importante do jogo." `nextState` é o resultado de `applyCommandAndAdvance` já
// computado — confirmar só aplica esse mesmo objeto, nunca recalcula, então o que o
// jogador vê no preview é *literalmente* o que acontece ao confirmar (não uma segunda
// rodada que só deveria dar o mesmo resultado).
// M26 2/N — o que a TELA de duelo precisa para se desenhar.
//
// As duas unidades vêm do estado ANTES do engajamento, e isso não é detalhe: `confirmEngage`
// commita `nextState` no mesmo instante, e nele o perdedor já está morto. A cena conta o que
// aconteceu — ela precisa dos dois de pé no primeiro quadro, exatamente como a animação de
// tabuleiro de M16 3/N precisa de `stateBefore`.
// M36 4/N (D47) — o relato de UM quadro de jogo: o duelo que o JOGADOR abriu (quando abriu) e
// o turno que a IA jogou em seguida, na ordem em que aconteceram.
//
// **`meuDuelo` é novo, e substitui uma dedução que não sobreviveu.** Até aqui o `MapCanvas`
// descobria o duelo do jogador pela transição do preview ("havia preview, não há mais, e o
// estado mudou"). Sem preview, a informação tem de ser dita: o servidor manda o `duelResult` do
// comando, e o estado de ANTES é o que o cliente tinha antes de aplicar a resposta.
export interface RelatoDoTurno {
  readonly state: EstadoVisivel;
  readonly steps: readonly PassoDaIa[];
  readonly meuDuelo?: { readonly estadoAntes: EstadoVisivel; readonly duelResult: DuelResult };
}

export interface CenaDeDuelo {
  // M36 4/N (D47) — `UnidadeVisivel`, e não mais `BattleUnit`: um dos dois duelistas é do
  // inimigo, e do inimigo o cliente tem posição, HP, AP, PP e a arte. É o bastante para a cena,
  // porque ela conta o que ACONTECEU — o `duelResult` traz cada golpe, cada dano e o nome da
  // skill no instante em que ela disparou. A ficha nunca foi o que a cena desenhava.
  readonly atacante: UnidadeVisivel;
  readonly defensor: UnidadeVisivel;
  readonly duelResult: DuelResult;
}

// M36 4/N (D47) — **`DuelPreview` FOI REMOVIDO, e é a maior coisa que esta milestone tira.**
//
// §11 chamava o preview de duelo de "o recurso mais importante do jogo": o jogador via o
// resultado do engajamento ANTES de confirmar. Ele funcionava rodando `applyCommandAndAdvance`
// no cliente, com os dados dos dois lados na mão — que é exatamente o que deixou de existir.
//
// Não é uma perda por limitação técnica: D47 decidiu que engajar é uma APOSTA INFORMADA. O
// jogador lê o próprio compromisso (suas skills, seus recursos, a ordem de quem age) e o estado
// visível do inimigo (posição, HP, AP, PP); o que o inimigo carrega, ele descobre no duelo.
//
// Se um dia o preview voltar, ele volta como ESTIMATIVA a partir do conhecido — o seu lado mais
// o que você já viu —, nunca como cálculo do oculto. O teorema não muda.

// §5.4/§5.6 (M12, sub-sessão 4/N) — mira no mapa. `mapSkill` e `useValor` são os dois
// únicos comandos cujo alvo é uma COORDENADA e não uma unidade, e nenhum dos dois tinha
// como ser emitido pelo cliente: o mapa só sabia mover e engajar. Os dois compartilham o
// mesmo estado porque compartilham o mesmo gesto — escolher a habilidade, ver os tiles
// legais, clicar num. O que muda entre eles é só o alcance (`mapSkill` é limitado pelo
// alcance de lançamento da skill; Valor é "artilharia DE MAPA", §5.6, sem limite de
// alcance) e quem paga.
export interface TargetingMode {
  readonly kind: 'mapSkill' | 'valor';
  readonly skillId: Id;
  readonly casterUnitId: Id | null; // Valor é recurso de exército: não sai de nenhuma unidade
  readonly areaRadius: number;
  readonly tiles: readonly Coord[]; // tiles legais de lançamento
}

// §11 — "Replay: reprodução passo a passo com controle de velocidade."
//
// **M36 4/N (D47) — o estado de cada passo deixou de ser RECOMPUTADO e passa a ser LIDO.** Antes
// o cliente reexecutava o replay do começo a cada busca, o que era legítimo porque o core é
// determinístico; agora ele não pode reexecutar coisa nenhuma — reproduzir o replay localmente
// devolveria em memória exatamente o dado que D47 tirou da batalha ao vivo, e o esconder valeria
// só enquanto a partida corre.
//
// O servidor reproduz e redige (`GET /battles/:nonce/log`), e cada passo chega com o estado de
// ANTES dele. Rebobinar mostra o que a ida mostrou porque é literalmente a mesma lista.
export interface ReplayViewer {
  /** O log REDIGIDO, do servidor: `GET /battles/:nonce/log`. */
  readonly log: LogDeReplay;
  readonly step: number; // 0 = antes do primeiro passo
  readonly state: EstadoVisivel;
  readonly playing: boolean;
  readonly speed: number; // multiplicador de velocidade da reprodução automática
}

// §9.1/§9.4 (M13, sub-sessão 2/N) — a sessão de PvP contra o servidor de M7. O cliente
// **nunca falou com o servidor** até aqui; toda esta seção é rede e estado de tela, sem
// uma linha de regra (regra 3): quem simula é `packages/core`, dos dois lados.
//
// O fluxo é o que o "ticket" do servidor tornou possível: pedir o confronto montado + a
// seed, JOGAR de verdade a camada de grid (§9.1), submeter os comandos e rever o replay
// que o servidor persistiu. Sem o ticket o cliente submeteria comandos às cegas.
export interface PvpSession {
  readonly token: string;
  readonly me: PlayerInfo | null;
  readonly roster: readonly RosterEntry[];
  readonly selectedHeroIds: readonly string[];
  readonly opponent: OpponentInfo | null;
  readonly ticket: BattleTicket | null;
  readonly outcome: BattleOutcomeResponse | null;
  readonly status: string | null;
  readonly error: string | null;
  readonly busy: boolean;
  // §9.1 (M15, sub-sessão 3/N) — a defesa de arena. `savedDefense` é o que o SERVIDOR tem
  // (fonte da verdade, relida a cada conexão) e `draft` é o que o jogador está montando na
  // tela. Separar os dois é o que faz "salvo" significar salvo: sem isso, a tela mostraria
  // como persistido um rascunho que nunca subiu.
  readonly savedDefense: ArenaDefense | null;
  readonly defenseDraft: DefenseDraft;
  // M38 4/N — os artefatos da conta (instâncias). Moram ao lado do roster de heróis porque
  // são lidos juntos: a aba Personagens mostra quem leva qual.
  readonly artifacts: readonly ArtifactInstanceView[];
}

// O rascunho: mapa escolhido e as unidades posicionadas. Mora no store e não no componente
// porque sobrevive a trocar de aba (montar defesa e ir jogar não pode perder o trabalho).
export interface DefenseDraft {
  readonly mapId: string;
  readonly units: readonly ArenaDefenseUnit[];
  readonly placingHeroId: string | null;
}

// §9.1 — "o defensor monta um time de até 5 heróis". O mesmo teto que o servidor valida;
// duplicado aqui de propósito, porque a tela tem de impedir o 400 antes de ele acontecer.
export const MAX_DEFENSE_UNITS = 5;

// Mapas oferecidos como arena. §9.2 põe o PvP no Coliseu, e o servidor aceita qualquer
// `mapId` do catálogo — mas oferecer um mapa de campanha aqui poria o atacante a nascer na
// borda esquerda (posição fixa desde M7) de um mapa que não foi desenhado para isso.
// Convenção de id, que é a que o catálogo já usa.
export function defenseMapIds(): readonly string[] {
  return Object.keys(catalog.maps).filter((id) => id.startsWith('map-arena-'));
}

const EMPTY_PVP: PvpSession = {
  token: '',
  me: null,
  roster: [],
  selectedHeroIds: [],
  opponent: null,
  ticket: null,
  outcome: null,
  status: null,
  error: null,
  busy: false,
  savedDefense: null,
  defenseDraft: { mapId: '', units: [], placingHeroId: null },
  artifacts: [],
};

// §10 (M14, sub-sessão 5/N) — a sessão de farm. Mora ao lado da de PvP e pelo mesmo
// motivo: é rede e estado de tela, sem uma linha de regra (regra 3). A masmorra reusa a
// máquina de batalha inteira do PvP — ticket, `battleState`, `commandLog`, submissão —,
// porque do ponto de vista do cliente as duas são "jogar um confronto que o servidor
// montou e depois mandar os comandos de volta".
export interface PveSession {
  readonly economy: EconomySnapshot | null;
  readonly dungeons: readonly DungeonListEntry[];
  readonly selectedHeroIds: readonly string[];
  readonly activeDungeonId: string | null;
  readonly ticket: DungeonTicket | null;
  readonly lastRun: DungeonRunResponse | null;
  readonly status: string | null;
  readonly error: string | null;
  readonly busy: boolean;
}

const EMPTY_PVE: PveSession = {
  economy: null,
  dungeons: [],
  selectedHeroIds: [],
  activeDungeonId: null,
  ticket: null,
  lastRun: null,
  status: null,
  error: null,
  busy: false,
};

// §10/§9.4 (M18, sub-sessão 7/N) — a sessão de CAMPANHA. Ela é nova porque a campanha
// deixou de ser local: até aqui o capítulo era montado do conteúdo, o progresso morava no
// `localStorage` e nenhum servidor via nada. A 4/N inverteu isso (o servidor é autoritativo
// sobre progressão, como em todo gacha comercial) e esta é a outra metade.
//
// Do ponto de vista do cliente, a campanha virou o que a masmorra já era: pedir um ticket,
// jogar a camada de grid, submeter os comandos. A diferença é a ESCOLHA DE VAGA (D16) — o
// capítulo declara quantas, e quem as preenche é o jogador.
export interface CampaignSession {
  readonly chapters: readonly CampaignChapter[];
  // M27 — o que se seleciona é uma MISSÃO: é ela que vira ticket e é o id dela que o
  // servidor guarda como limpo. O capítulo agrupa, e não é jogável.
  readonly selectedMissionId: string | null;
  // M27 3/N — quais capítulos estão ABERTOS na lista. Estado de tela, e mora aqui pelo mesmo
  // motivo que `selectedMissionId`: é o store que este projeto testa, e uma `useState` dentro
  // do componente poria a regra de "onde o jogador parou" onde nenhum teste a alcança.
  readonly openChapterIds: readonly string[];
  readonly selectedHeroIds: readonly string[];
  // M36 3/N (D48) — a ordem em que a campanha apresenta o elenco, vinda de `GET /campaign`.
  // Era derivada localmente de `catalog.encounters` (M35 2/N), que saiu do bundle.
  readonly castOrder: readonly string[];
  // M36 3/N (D48) — a prévia da missão escolhida, do servidor e já redigida. `null` enquanto
  // não há missão escolhida ou enquanto ela não chegou.
  readonly previa: MissionPreviewResponse | null;
  readonly ticket: CampaignTicket | null;
  readonly lastRun: CampaignRunResponse | null;
  readonly premiumOnFirstClear: number;
  readonly premiumOnChapterClear: number;
  readonly status: string | null;
  readonly error: string | null;
  readonly busy: boolean;
}

const EMPTY_CAMPAIGN: CampaignSession = {
  chapters: [],
  selectedMissionId: null,
  openChapterIds: [],
  selectedHeroIds: [],
  castOrder: [],
  previa: null,
  ticket: null,
  lastRun: null,
  premiumOnFirstClear: 0,
  premiumOnChapterClear: 0,
  status: null,
  error: null,
  busy: false,
};

// §10/D14/D17/D18 (M18, sub-sessão 6/N) — a sessão de AQUISIÇÃO. Mora ao lado das de PvP e
// de farm, pelo mesmo motivo das duas: é rede e estado de tela, sem uma linha de regra
// (regra 3). Quem sorteia é `packages/gacha`, no servidor; quem conta o pity é a conta.
//
// `premium` é guardado aqui e não no `PveSession` de propósito: as três moedas de lá vêm de
// `GET /me/economy` e a premium não — ela chega em toda resposta que a movimenta (summon,
// prêmio, compra de energia), e é o valor devolvido pelo servidor que manda.
export interface SummonSession {
  readonly premium: number;
  readonly banners: readonly BannerView[];
  readonly characters: readonly CharacterRosterEntry[];
  readonly rewards: readonly RewardView[];
  // A última rolagem, para a tela poder mostrar o que saiu. Não é histórico: o servidor é
  // quem guarda o que aconteceu, e um histórico de cliente divergiria dele no primeiro
  // reenvio de rede.
  // M38 3/N — o resgate da escolha do genérico entra aqui também: a tela mostra o que saiu
  // pelo mesmo caminho, e `tokenGrants` vem nos dois.
  readonly lastResult: (Pick<SummonResponse, 'outcome' | 'tokenGrants'> & Partial<SummonResponse>) | null;
  // De qual banner o último resultado saiu: a tela só o mostra na aba dele (visto no
  // navegador — o "ganhou o Machado" aparecia na aba do Rurik).
  readonly lastResultBannerId: string | null;
  readonly status: string | null;
  readonly error: string | null;
  readonly busy: boolean;
}

const EMPTY_SUMMON: SummonSession = {
  premium: 0,
  banners: [],
  characters: [],
  rewards: [],
  lastResult: null,
  lastResultBannerId: null,
  status: null,
  error: null,
  busy: false,
};

interface BattleStore {
  readonly battleState: EstadoVisivel;
  readonly selectedUnitId: string | null;
  readonly reachableTiles: readonly ReachableTile[];
  // §1.1 (M23, 1/N) — a introdução contextual.
  readonly introducaoAtual: Introducao | null;
  readonly introducoesVistas: readonly string[];
  // §11 (M24) — volume de efeitos e de música, separados.
  readonly volumeEfeitos: number;
  readonly volumeMusica: number;
  // §11/D24 (M25) — o idioma ativo e o tradutor dele. O tradutor mora no estado (e não numa
  // variável de módulo) porque trocar de idioma tem de redesenhar a tela: com ele fora do
  // estado, o React não teria por que reavaliar nada.
  readonly idioma: Idioma;
  readonly idiomaEscolhido: string | null;
  readonly t: Tradutor;
  // M36 4/N (D47) — a PARTIDA VIVA no servidor. `null` fora de batalha. Ela substitui os três
  // `ticket` que viviam em `pvp`, `pve` e `campaign`: um caminho, e não três.
  readonly partida: VistaDaPartida | null;
  /** Um comando por vez: dois cliques rápidos não podem virar dois comandos contra o mesmo estado. */
  readonly comandoEmVoo: boolean;
  /** O que o servidor pagou (ou cobrou) quando a batalha fechou. `null` enquanto ela corre. */
  readonly liquidacao: LiquidacaoDaPartida | null;
  readonly lastCommandReason: string | null;
  readonly tacticsEditorUnitId: string | null;
  readonly inventory: readonly ItemInstance[];
  readonly equippedByUnit: Readonly<Record<string, Partial<Record<GearSlot, Id>>>>;
  readonly inventoryUnitId: string | null;
  readonly talentAllocationByUnit: Readonly<Record<string, TalentAllocation>>;
  readonly talentEditorUnitId: string | null;
  readonly lastTalentReason: string | null;
  readonly instantResultMode: boolean;
  // M16 3/N — o tabuleiro está no meio de uma animação (movimento ou duelo). Só quem desenha
  // escreve aqui, e existe um consumidor só: o overlay de fim de mapa. Sem isto, o "Vitória!"
  // aparece no mesmo quadro em que o duelo é commitado e cobre justamente o golpe que venceu a
  // batalha — verificado em navegador nesta fatia, num duelo que matou o último inimigo do
  // capítulo 1: a animação inteira rodou atrás do modal. Não é regra e não vai para o save.
  readonly boardAnimating: boolean;
  // M26 2/N — a cena de duelo em andamento. Ela guarda as unidades do estado ANTES do
  // engajamento: o estado novo já matou uma delas, e uma peça que não existe mais não tem como
  // lutar na tela. Mesmo motivo que fez a animação de tabuleiro de M16 3/N guardar
  // `stateBefore`.
  readonly duelScene: CenaDeDuelo | null;
  // O interruptor. Três níveis com o `instantResultMode` de §11: cena, tabuleiro, nada.
  readonly duelSceneEnabled: boolean;
  // M16 4/N — o turno que a IA jogou depois do último comando aceito, esperando para ser
  // contado no tabuleiro. Guarda o ESTADO junto do relato de propósito: quem consome só age
  // quando `state === battleState`, e é isso que impede um relato velho de ser animado em cima
  // de outra batalha. Trocar de capítulo, entrar numa masmorra ou abrir um replay troca o
  // `battleState`, e o relato pendente deixa de casar sozinho — sem precisar de um `reset` em
  // cada um dos nove pontos que começam batalha, que é o tipo de lista que se esquece de
  // atualizar. Não é regra e não vai para o save.
  readonly aiTurnReport: RelatoDoTurno | null;
  // §11 (acessibilidade) — "modo daltônico nos overlays" e "fonte escalável". Só
  // apresentação: nenhum dos dois muda uma decisão do core (regra 3). A paleta e os
  // padrões moram em `data/overlayTheme.ts`; a escala vale para o HTML (todo o CSS já é
  // `rem`) e para o mapa, que cresce junto.
  readonly colorblindMode: boolean;
  readonly uiScale: number;
  // M32 — o menu de opções, e a pergunta "apagar mesmo?" de pé.
  //
  // As sete preferências e "apagar progresso" saíram do cabeçalho: lá elas tinham o mesmo
  // peso que o título do jogo, e apagar a conta local ficava a um clique, sem confirmação.
  // A confirmação mora na store e não num `window.confirm` — o diálogo nativo não passa pela
  // camada de idioma, bloqueia a aba inteira e não é testável sem navegador. Nenhum dos dois
  // vai para o save: são estado de tela.
  readonly opcoesAbertas: boolean;
  // M35 9/N — o menu de pausa da batalha, aberto pelo Esc (ou pelo botão ☰). É estado da store
  // pelo mesmo motivo de `opcoesAbertas`: a decisão se testa aqui, não no componente.
  readonly pausaAberta: boolean;
  // M35 1/N (D41) — a tela do hub. Só ela está na tela; a batalha não tem menu. M35 5/N — o
  // hub é um LOBBY com botões (julgamento do usuário na tela): `'lobby'` é onde quem entra cai,
  // e as cinco telas de `ABAS_DO_HUB` são para onde os botões levam.
  readonly abaDoHub: TelaDoHub;
  // M35 5/N — a transição entre lobby e tela: ESTADO, não relógio. `escolherAba` abre, o overlay
  // que a desenha chama `concluirTransicao` quando o véu terminou (é o único lugar com tempo), e
  // só então a tela troca. Assim a sequência lobby → transição → tela se prova sem browser.
  readonly transicao: { readonly para: TelaDoHub } | null;
  // M35 3/N (D42) — os presets de party, lidos do servidor com o hub. `slots` vem de lá
  // (`MAX_PARTY_PRESETS`): a tela desenha os oito sem saber o número.
  readonly presets: {
    readonly slots: number;
    readonly lista: readonly PartyPreset[];
    readonly busy: boolean;
    readonly error: string | null;
  };
  // M34 2/N (D45) — a telemetria: a escolha (`null` = ainda não lida) e a declaração que o
  // servidor manda. Estado de conta, como os presets; lida com o hub.
  readonly telemetria: {
    readonly optOut: boolean | null;
    readonly collected: readonly string[];
    readonly busy: boolean;
    readonly error: string | null;
  };
  readonly apagarProgressoPendente: boolean;
  readonly targetingMode: TargetingMode | null;
  // §11/§3.4 (M13, sub-sessão 1/N) — a gravação. Todo comando ACEITO entra aqui na ordem;
  // com o `BattleSetup` do mapa e a seed, isso é um `Replay` completo. Comandos de IA não
  // entram e não podem entrar: `applyCommandAndAdvance` resolve os turnos de IA por
  // dentro, então reaplicar só os comandos humanos reproduz a batalha inteira — é o mesmo
  // contrato que `simulate` usa desde M3.
  readonly commandLog: readonly BattleCommand[];
  readonly replayViewer: ReplayViewer | null;
  // Scripts editados na preparação do capítulo corrente. Zerado ao trocar de mapa: cada
  // capítulo tem o próprio elenco.
  readonly tacticsOverrides: Readonly<Record<string, TacticsScript>>;
  // Qual batalha está na tela. A campanha e o PvP compartilham o mesmo `battleState`
  // e o mesmo gravador de comandos — o que muda é de onde veio o setup e o que
  // acontece quando ela termina.
  readonly mode: 'campaign' | 'pvp' | 'dungeon';
  readonly pvp: PvpSession;
  readonly pve: PveSession;
  readonly summon: SummonSession;
  readonly campaign: CampaignSession;
  // Quem é cada unidade do tabuleiro atual. Preenchido sempre que uma batalha nasce de um
  // ticket, a partir do roster do servidor — ver `heroesPorUnidade`.
  readonly heroesByUnitId: Readonly<Record<string, Hero>>;
  // M26 3/N — quem é cada unidade do tabuleiro para DESENHAR, vindo do servidor no ticket.
  //
  // Separado de `heroesByUnitId` de propósito, e não é duplicação: aquele é o herói INTEIRO
  // e existe só do lado do jogador, porque as telas que o consomem (talentos, equipamento,
  // táticas) abrem sobre uma unidade que é sua. Este cobre os DOIS lados e carrega uma string
  // — é o único que responde por PvP, onde o time do defensor são instâncias de outra conta.
  readonly artIdByUnitId: Readonly<Record<string, string>>;

  selectUnit: (unitId: string | null) => void;
  moveSelectedUnitTo: (destination: Coord) => void;
  waitSelectedUnit: () => void;
  restSelectedUnit: () => void;
  // M36 4/N (D47) — engajar virou um comando só. `previewEngage`/`confirmEngage`/`cancelEngage`
  // saíram com o preview de duelo; ver o comentário onde `DuelPreview` era declarado.
  engageTarget: (targetId: string) => void;
  /** O único caminho pelo qual um comando sai do cliente. */
  enviarComando: (command: BattleCommand, opcoes?: { readonly manterSelecao?: boolean }) => Promise<void>;
  /** Põe uma partida viva na tela, vinda da abertura ou da reconexão. */
  assumirPartida: (vista: VistaDaPartida) => void;
  /** Pergunta ao servidor se há batalha aberta (M22, na forma da batalha viva). */
  reconectarPartida: () => Promise<void>;
  /** A batalha fechou: relê o hub, porque o servidor já pagou o que tinha de pagar. */
  liquidarPartida: (liquidacao: LiquidacaoDaPartida) => void;
  /** Sair da batalha; desiste se ela ainda corre. */
  desistirDaPartida: () => Promise<void>;
  limparTabuleiro: () => void;
  refreshCampaign: () => Promise<void>;
  selectChapter: (chapterId: string) => void;
  toggleChapterOpen: (chapterId: string) => void;
  /** M35 7/N — a aba de capítulo: UM capítulo em foco por vez (o grid de cartões dele). */
  escolherCapitulo: (chapterId: string) => void;
  /** M35 8/N — "← Missões": sai da Preparação e volta ao grid de cartões. */
  voltarParaMissoes: () => void;
  toggleCampaignHero: (heroId: string) => void;
  enterChapter: (chapterId: string) => Promise<void>;
  exitCampaign: () => Promise<void>;
  saveHeroTactics: (heroId: string, script: TacticsScript) => Promise<void>;
  saveHeroTalents: (heroId: string, allocation: TalentAllocation) => Promise<void>;
  openTacticsEditor: (unitId: string) => void;
  closeTacticsEditor: () => void;
  updateUnitTacticsScript: (unitId: string, script: TacticsScript) => void;
  openInventory: (unitId: string) => void;
  closeInventory: () => void;
  equipItem: (unitId: string, itemId: Id) => void;
  unequipItem: (unitId: string, slot: GearSlot) => void;
  openTalentEditor: (unitId: string) => void;
  closeTalentEditor: () => void;
  allocateTalent: (unitId: string, nodeId: Id) => void;
  deallocateTalent: (unitId: string, nodeId: Id) => void;
  // §8.2 — a árvore é um CAMINHO, então desfazer é TRUNCAR da linha para baixo, e não
  // escolher uma das duas árvores (que não existem mais). `fromRow: 1` é o reset inteiro.
  resetTalentTree: (unitId: string, fromRow: number) => void;
  loadBuildCode: (unitId: string, code: string) => void;
  dispararIntroducao: (gatilho: GatilhoDeIntroducao) => void;
  fecharIntroducao: () => void;
  definirVolume: (categoria: 'efeitos' | 'musica', valor: number) => void;
  definirIdioma: (idioma: Idioma) => void;
  toggleInstantResultMode: () => void;
  setBoardAnimating: (value: boolean) => void;
  abrirCenaDeDuelo: (stateBefore: EstadoVisivel, duelResult: DuelResult) => boolean;
  fecharCenaDeDuelo: () => void;
  setDuelSceneEnabled: (value: boolean) => void;
  toggleColorblindMode: () => void;
  setUiScale: (scale: number) => void;
  abrirOpcoes: () => void;
  alternarPausa: () => void;
  fecharPausa: () => void;
  /** Opções a partir da pausa: fecha a pausa e abre o menu de opções. */
  opcoesDaPausa: () => void;
  /** Sai da missão pela pausa: desiste se ela corre (D48) e volta à tela de onde veio. */
  sairDaMissao: () => Promise<void>;
  /** Só na campanha: desiste e abre a MESMA missão com os mesmos heróis. */
  recomecarMissao: () => Promise<void>;
  /** M35 9/N — da tela de conclusão: sai da batalha e abre a Campanha com a missão escolhida. */
  continuarParaProxima: (missaoId: string) => Promise<void>;
  /** M35 9/N — da tela de conclusão: sai da batalha e volta ao lobby. */
  voltarAoMenu: () => Promise<void>;
  escolherAba: (aba: AbaDoHub) => void;
  voltarAoLobby: () => void;
  concluirTransicao: () => void;
  lerPresets: () => Promise<void>;
  /** Troca a seleção da missão pelos heróis do preset (os que o jogador ainda tem, aparados às vagas). */
  aplicarPreset: (slot: number) => void;
  /** Manda a seleção atual para o slot, com o nome. */
  salvarPreset: (slot: number, name: string) => Promise<void>;
  apagarPreset: (slot: number) => Promise<void>;
  lerTelemetria: () => Promise<void>;
  /** Recusar (`true`) apaga o coletado e para de gravar; `false` volta a gravar dali em diante. */
  definirTelemetria: (optOut: boolean) => Promise<void>;
  fecharOpcoes: () => void;
  // Os dois passos de apagar. `clearProgress` é o efeito; só `confirmarApagarProgresso` o
  // chama pela tela, e só com a pergunta de pé.
  pedirApagarProgresso: () => void;
  cancelarApagarProgresso: () => void;
  confirmarApagarProgresso: () => void;
  clearProgress: () => void;
  // M36 4/N — `buildReplay` saiu: quem constrói o replay é o servidor, do log que ele acumulou.
  setPvpToken: (token: string) => void;
  connectPvp: () => Promise<void>;
  togglePvpHero: (heroId: string) => void;
  // §9.1 (M15, sub-sessão 3/N) — montar o time que defende.
  loadDefense: () => Promise<void>;
  setDefenseMap: (mapId: string) => void;
  armDefenseHero: (heroId: string | null) => void;
  placeDefenseAt: (coord: Coord) => void;
  removeDefenseUnit: (heroId: string) => void;
  setDefenseArchetype: (heroId: string, archetype: MapAiArchetype) => void;
  saveDefense: () => Promise<void>;
  findPvpOpponent: () => Promise<void>;
  startPvpBattle: () => Promise<void>;
  reviewPvpBattle: () => Promise<void>;
  exitPvp: () => void;
  refreshPve: () => Promise<void>;
  togglePveHero: (heroId: string) => void;
  enterDungeon: (dungeonId: string) => Promise<void>;
  sweepDungeon: (dungeonId: string) => Promise<void>;
  exitDungeon: () => Promise<void>;
  enhanceInventoryItem: (itemId: string) => Promise<void>;
  equipInventoryItem: (heroId: string, itemId: string) => Promise<void>;
  awakenHero: (heroId: string) => Promise<void>;
  imprintHero: (heroId: string) => Promise<void>;
  /** M39 1/N — usa `quantidade` Tomos de Experiência (`materialId`) no herói. */
  usarTomos: (heroId: string, materialId: string, quantidade: number) => Promise<void>;
  lerInvocacao: () => Promise<void>;
  // M32 — o que o hub mostra, lido no sign-in: campanha, invocação e masmorras.
  carregarHub: () => Promise<void>;
  /** Depois do sign-in: volta para a batalha que ficou aberta, se houver (M22 + M36 4/N). */
  retomarBatalhaAberta: () => Promise<void>;
  rollSummon: (bannerId: string) => Promise<void>;
  // M38 3/N–4/N — a escolha do genérico e o artefato jogável.
  resgatarEscolha: (bannerId: string, choiceId: string) => Promise<void>;
  equiparArtefato: (instanceId: string, heroId: string) => Promise<void>;
  desequiparArtefato: (heroId: string) => Promise<void>;
  despertarArtefato: (instanceId: string) => Promise<void>;
  imprintArtefato: (instanceId: string) => Promise<void>;
  claimReward: (rewardId: string) => Promise<void>;
  purchaseEnergy: () => Promise<void>;
  openReplayViewer: () => Promise<void>;
  closeReplayViewer: () => void;
  seekReplay: (step: number) => void;
  setReplaySpeed: (speed: number) => void;
  toggleReplayPlaying: () => void;
  beginMapSkillTargeting: (skillId: Id) => void;
  beginValorTargeting: (skillId: Id) => void;
  cancelTargeting: () => void;
  confirmTargetAt: (target: Coord) => void;
}

// M36 4/N — o alcance continua sendo calculado AQUI, e é a única conta de tabuleiro que
// sobreviveu no cliente. Ela é legítima porque só usa dado do próprio lado (`moveType`,
// `moveRange`, o quanto já andou) e o que o tabuleiro mostra de todo mundo (posição). D47 diz
// isso com todas as letras: "ficam as de dados próprios (`computeReachableTiles` das suas
// unidades)". O `BattleUnit` do parâmetro é sempre uma unidade do jogador — o inimigo redigido
// não tem `moveType` nem `moveRange`, e o tipo o recusa.
function computeReachableForUnit(battleState: EstadoVisivel, unit: BattleUnit): readonly ReachableTile[] {
  if (unit.hasActedThisRound || unit.hp <= 0) return [];

  const allies = battleState.units
    .filter((u) => u.side === unit.side && u.unitId !== unit.unitId && u.hp > 0)
    .map((u) => u.pos);
  const enemies = battleState.units.filter((u) => u.side !== unit.side && u.hp > 0).map((u) => u.pos);
  const remainingRange = unit.moveRange - (battleState.distanceMovedThisTurn[unit.unitId] ?? 0);

  return computeReachableTiles(
    {
      map: battleState.map,
      moveType: unit.moveType,
      occupiedByAlly: allies,
      occupiedByEnemy: enemies,
      // §5.1 (M15) — muro e portão fechado bloqueiam. Sem repassar os portões já abertos,
      // o cliente desenharia um alcance que o core recusa no `move`: quem decide continua
      // sendo o motor (regra 3), e o desenho tem de ser a MESMA conta.
      //
      // `openGateCoords` lê só `map` e `gateState`, e os dois atravessam a redação — o estado do
      // portão é tabuleiro, não build. O cast estreita um parâmetro que pede mais do que a
      // função usa.
      openGates: openGateCoords(battleState as never),
    },
    unit.pos,
    remainingRange,
  );
}

// Tiles dentro de `radius` em distância Manhattan (§5.1) que existem no grid. O core faz
// a mesma conta; aqui é só pra desenhar o overlay.
function tilesWithin(battleState: EstadoVisivel, center: Coord, radius: number): readonly Coord[] {
  const tiles: Coord[] = [];
  for (let y = 0; y < battleState.map.height; y++) {
    for (let x = 0; x < battleState.map.width; x++) {
      if (manhattanDistance(center, { x, y }) <= radius) tiles.push({ x, y });
    }
  }
  return tiles;
}

function allTiles(battleState: EstadoVisivel): readonly Coord[] {
  const tiles: Coord[] = [];
  for (let y = 0; y < battleState.map.height; y++) {
    for (let x = 0; x < battleState.map.width; x++) tiles.push({ x, y });
  }
  return tiles;
}

// M16 4/N — o pedaço de estado que todo comando aceito passa a acrescentar: o relato do turno
// da IA e, quando esse turno tem imagem, a trava do desfecho.
//
// `boardAnimating` sobe AQUI e não no canvas porque o estado é commitado neste mesmo `set()`:
// se o turno da IA acabou de matar o último herói, o "Derrota!" apareceria no quadro do commit
// e a sequência inteira rodaria atrás do modal — exatamente o defeito que 3/N corrigiu para o
// duelo do jogador, reaparecendo pela porta da IA. Quem BAIXA a trava é sempre o canvas: no fim
// da cadeia, ou na hora, quando não há cena para contar.
function relatoDaIa(
  state: EstadoVisivel,
  steps: readonly PassoDaIa[],
  instantResultMode: boolean,
  meuDuelo?: { readonly estadoAntes: EstadoVisivel; readonly duelResult: DuelResult },
): { aiTurnReport: RelatoDoTurno; boardAnimating?: true } {
  // O MESMO predicado que o canvas usa para decidir se roda a cadeia. Se os dois discordassem,
  // a trava poderia subir sem que ninguém a baixasse e o desfecho nunca apareceria.
  const anima = !instantResultMode && (!!meuDuelo || narrateAiTurns(steps).length > 0);
  return {
    aiTurnReport: { state, steps, ...(meuDuelo ? { meuDuelo } : {}) },
    ...(anima ? { boardAnimating: true as const } : {}),
  };
}

// O estado do passo N: uma LEITURA da lista que o servidor mandou, não uma reexecução. O passo
// `step` mostra o estado de ANTES dele; passar do último mostra o fim da batalha, que é o estado
// de antes que não existe — daí o `?? estadoFinal`.
function replayStateAt(log: LogDeReplay, step: number): EstadoVisivel {
  if (step <= 0) return log.estadoInicial;
  const passo = log.passos[step];
  if (passo) return passo.estadoAntes;
  const ultimo = log.passos[log.passos.length - 1];
  return ultimo ? ultimo.estadoAntes : log.estadoInicial;
}

function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  // Rede caída, servidor fora do ar: o cliente tem que dizer isso em vez de travar.
  return error instanceof Error ? error.message : 'erro desconhecido';
}

// §8.2 (M18, 7/N) — toda escrita de alocação vai junto para o servidor.
//
// O clique continua sendo local e imediato (a árvore responde na hora, como desde M6), e o
// PUT sai atrás. Não é otimismo cego: a MESMA `validateColumnAllocation` do core já rodou
// aqui antes do `set`, então o que sobe é o que o servidor aceitaria — e quando não for, a
// mensagem dele aparece na sessão de campanha em vez de sumir.
//
// Uma requisição por clique é barato de propósito: a rota não cobra recurso e é idempotente
// (gravar a mesma alocação duas vezes deixa a mesma alocação), então não há o que proteger
// com nonce nem o que juntar num botão de "salvar" que o jogador possa esquecer de apertar.
function persistirAlocacao(
  get: () => BattleStore,
  unitId: string,
  allocation: TalentAllocation,
): void {
  const hero = get().heroesByUnitId[unitId];
  if (!hero) return;
  void get().saveHeroTalents(hero.id, allocation);
}

// M38 4/N — o molde das quatro ações de artefato: chamar a rota, e reler heróis, artefatos e a
// economia (ouro e material mudam no despertar e no imprint). Erro do servidor — a trava por
// classe, recurso insuficiente — vai para a tela, como nas ações de herói.
async function acaoDeArtefato(
  get: () => BattleStore,
  set: (parcial: (s: BattleStore) => Partial<BattleStore>) => void,
  chamada: () => Promise<unknown>,
  status: string,
): Promise<void> {
  const { pvp } = get();
  if (!pvp.token) {
    set((s) => ({ pve: { ...s.pve, error: get().t('estado.conecteAntes') } }));
    return;
  }
  set((s) => ({ pve: { ...s.pve, busy: true, error: null } }));
  try {
    await chamada();
    const [roster, artefatos] = await Promise.all([api.roster(pvp.token), api.artifacts(pvp.token)]);
    set((s) => ({ pvp: { ...s.pvp, roster, artifacts: artefatos.artifacts }, pve: { ...s.pve, busy: false, status } }));
    await get().refreshPve();
  } catch (error) {
    set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
  }
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  // O capítulo salvo é remontado do setup — a batalha em si não é persistida (decisão do
  // usuário): recarregar no meio de um capítulo recomeça o capítulo, com as táticas
  // preparadas de pé.
  battleState: tabuleiroVazio(),
  selectedUnitId: null,
  reachableTiles: [],
  lastCommandReason: null,
  tacticsEditorUnitId: null,
  inventory: Object.values(catalog.items),
  equippedByUnit: {},
  inventoryUnitId: null,
  talentAllocationByUnit: {},
  talentEditorUnitId: null,
  lastTalentReason: null,
  instantResultMode: restoredSave?.instantResultMode ?? false,
  // §1.1 (M23, 1/N) — a introdução contextual. `introducaoAtual` é a caixa na tela agora;
  // `introducoesVistas` é o que já foi dispensado, e sobrevive no save.
  introducaoAtual: null,
  introducoesVistas: restoredSave?.introducoesVistas ?? [],
  volumeEfeitos: restoredSave?.volumeEfeitos ?? VOLUMES_PADRAO.efeitos,
  volumeMusica: restoredSave?.volumeMusica ?? VOLUMES_PADRAO.musica,
  // A escolha do jogador vence; sem escolha, a língua do navegador; sem nenhuma das duas, o
  // inglês (D24). É a única ordem que não sobrescreve quem escolheu.
  idioma: idiomaInicial,
  idiomaEscolhido: idiomaValido(restoredSave?.idioma) ? restoredSave.idioma : null,
  t: criarTradutor(idiomaInicial, CATALOGOS),
  boardAnimating: false,
  duelScene: null,
  duelSceneEnabled: restoredSave?.duelSceneEnabled ?? true,
  aiTurnReport: null,
  colorblindMode: restoredSave?.colorblindMode ?? false,
  uiScale: restoredSave?.uiScale ?? DEFAULT_UI_SCALE,
  opcoesAbertas: false,
  pausaAberta: false,
  abaDoHub: 'lobby',
  transicao: null,
  presets: { slots: 8, lista: [], busy: false, error: null },
  telemetria: { optOut: null, collected: [], busy: false, error: null },
  apagarProgressoPendente: false,
  targetingMode: null,
  partida: null,
  comandoEmVoo: false,
  liquidacao: null,
  commandLog: [],
  replayViewer: null,
  tacticsOverrides: {},
  mode: 'campaign',
  pvp: { ...EMPTY_PVP, token: restoredSave?.pvpToken ?? '' },
  pve: EMPTY_PVE,
  summon: EMPTY_SUMMON,
  campaign: EMPTY_CAMPAIGN,
  heroesByUnitId: {},
  artIdByUnitId: {},

  selectUnit: (unitId) => {
    if (!unitId) {
      set({ selectedUnitId: null, reachableTiles: [] });
      return;
    }
    const { battleState } = get();
    const unit = battleState.units.find((u) => u.unitId === unitId);
    if (!unit) return;
    // Só a unidade do PRÓPRIO jogador tem alcance a desenhar: a do inimigo não traz `moveType`
    // nem `moveRange` (D47), e é por isso que selecioná-la mostra a ficha e nenhuma ação.
    const alcance = ehVisivelPorInteiro(unit) ? computeReachableForUnit(battleState, unit) : [];
    set({ selectedUnitId: unitId, reachableTiles: alcance, lastCommandReason: null });
  },

  moveSelectedUnitTo: (destination) => {
    const { selectedUnitId, reachableTiles } = get();
    if (!selectedUnitId) return;

    const target = reachableTiles.find((tile) => tile.coord.x === destination.x && tile.coord.y === destination.y);
    if (!target) return; // clicou fora do overlay de alcance — ignora, não monta comando inválido de propósito

    void get().enviarComando({ t: 'move', unitId: selectedUnitId, path: target.path }, { manterSelecao: true });
  },

  waitSelectedUnit: () => {
    const { selectedUnitId } = get();
    if (!selectedUnitId) return;
    void get().enviarComando({ t: 'wait', unitId: selectedUnitId });
  },

  restSelectedUnit: () => {
    const { selectedUnitId } = get();
    if (!selectedUnitId) return;
    void get().enviarComando({ t: 'rest', unitId: selectedUnitId });
  },

  // M36 4/N (D47) — ENGAJAR é um comando, e não mais um preview seguido de confirmação.
  //
  // O gesto tinha dois tempos porque havia o que mostrar entre eles: o resultado do duelo,
  // calculado no cliente antes de confirmar. Sem esse cálculo, um segundo tempo seria um "tem
  // certeza?" — uma fricção que não informa nada. Engajar é uma aposta informada (D47): o
  // jogador decide com o que vê, e o duelo acontece.
  engageTarget: (targetId) => {
    const { selectedUnitId } = get();
    if (!selectedUnitId) return;
    void get().enviarComando({ t: 'engage', unitId: selectedUnitId, targetId });
  },

  /**
   * O ÚNICO caminho pelo qual um comando sai do cliente. Todas as ações de tabuleiro passam por
   * aqui, e o que volta é o estado visível depois do comando, o duelo que ele abriu (se abriu) e
   * o turno da IA que veio em seguida — tudo já redigido pelo servidor.
   *
   * Nada aqui decide (regra 3). O cliente nem sequer sabe se o comando é legal: ele o manda, e o
   * servidor responde `400` com o motivo, que aparece na barra de ações como sempre apareceu.
   */
  enviarComando: async (command, opcoes = {}) => {
    const { pvp, partida, comandoEmVoo, battleState: estadoAntes } = get();
    if (!partida || !pvp.token) return;
    // Um comando por vez. Sem isto, dois cliques rápidos mandariam dois comandos contra o mesmo
    // estado, e o segundo seria recusado por um motivo que confundiria o jogador — ou pior,
    // aceito numa ordem que ele não escolheu.
    if (comandoEmVoo) return;

    set({ comandoEmVoo: true, lastCommandReason: null });
    try {
      const resposta = await api.enviarComando(pvp.token, partida.nonce, command);

      const minhaUnidade =
        opcoes.manterSelecao && 'unitId' in command
          ? resposta.visivel.units.find((u) => u.unitId === command.unitId)
          : undefined;

      set((s) => ({
        comandoEmVoo: false,
        commandLog: [...s.commandLog, command],
        battleState: resposta.visivel,
        // Mover não encerra o turno da unidade: ela continua selecionada, com o alcance
        // restante redesenhado. Os outros comandos encerram, e a seleção sai.
        selectedUnitId: minhaUnidade ? s.selectedUnitId : null,
        reachableTiles:
          minhaUnidade && ehVisivelPorInteiro(minhaUnidade)
            ? computeReachableForUnit(resposta.visivel, minhaUnidade)
            : [],
        targetingMode: null,
        lastCommandReason: null,
        partida: s.partida ? { ...s.partida, outcome: resposta.outcome } : null,
        ...(resposta.liquidacao ? { liquidacao: resposta.liquidacao } : {}),
        // A cena de duelo do JOGADOR entra aqui, com o estado de antes do comando: `duelResult`
        // é o relato do que ACONTECEU, e revelá-lo é o que faz o jogador aprender o que
        // enfrentou (D47). Quem o transforma em cena é o `MapCanvas`, num lugar só, junto com
        // os passos da IA — como desde o M16 4/N.
        ...relatoDaIa(
          resposta.visivel,
          resposta.passosDaIa,
          s.instantResultMode,
          resposta.duelResult ? { estadoAntes, duelResult: resposta.duelResult } : undefined,
        ),
      }));

      if (resposta.liquidacao) get().liquidarPartida(resposta.liquidacao);
    } catch (error) {
      set({ comandoEmVoo: false, lastCommandReason: describeApiError(error) });
    }
  },


  // §10/§9.4 (M18, 7/N) — a campanha pelo servidor. Os capítulos e o que já foi limpo vêm
  // dele; o roster vem junto porque escolher quem preenche a vaga exige saber quem o
  // jogador tem, e as duas listas mudam pelas mesmas ações (invocar, limpar capítulo).
  refreshCampaign: async () => {
    const { pvp } = get();
    if (!pvp.token) {
      set((s) => ({ campaign: { ...s.campaign, error: get().t('estado.conecteAntes') } }));
      return;
    }
    set((s) => ({ campaign: { ...s.campaign, busy: true, error: null } }));
    try {
      const [lista, roster] = await Promise.all([api.campaign(pvp.token), api.roster(pvp.token)]);
      set((s) => ({
        campaign: {
          ...s.campaign,
          chapters: lista.chapters,
          // A escolha do jogador SOBREVIVE à atualização, e só a primeira carga é semeada.
          // Reabrir o capítulo "de onde ele parou" a cada `refreshCampaign` brigaria com
          // ele: a lista se atualiza sozinha ao vencer uma missão, e o capítulo que ele
          // acabou de fechar reabriria na cara dele.
          openChapterIds:
            s.campaign.openChapterIds.length > 0
              ? s.campaign.openChapterIds.filter((id) => lista.chapters.some((c) => c.id === id))
              : [capituloInicialAberto(lista.chapters)].filter((id): id is string => id !== null),
          premiumOnFirstClear: lista.premiumOnFirstClear,
          premiumOnChapterClear: lista.premiumOnChapterClear,
          // M36 3/N (D48) — a ordem de apresentação do elenco, derivada do conteúdo no servidor.
          // `?? []` porque um servidor anterior a esta milestone não manda o campo: sem ele o
          // preenchimento cai na ordem do roster, que é o comportamento de antes do M35 2/N.
          castOrder: lista.castOrder ?? [],
          busy: false,
        },
        pvp: { ...s.pvp, roster },
      }));
    } catch (error) {
      set((s) => ({ campaign: { ...s.campaign, busy: false, error: describeApiError(error) } }));
    }
  },

  selectChapter: (chapterId) => {
    const { campaign } = get();
    const missao = missaoPorId(campaign.chapters, chapterId);
    if (!missao) return;
    // Trocar de capítulo APARA a seleção em vez de zerá-la: quem escolheu quatro e clicou
    // num capítulo de duas vagas não quer recomeçar a escolha, quer as duas primeiras.
    //
    // M35 2/N (D42) — e a seleção NUNCA começa vazia: sem nada marcado, as vagas vêm
    // preenchidas com o protagonista primeiro e depois quem a campanha apresenta
    // (`preenchimentoPadrao`). Uma seleção que o jogador já fez não é sobrescrita — só a
    // vazia é preenchida. É apresentação: quem valida a party continua sendo o servidor.
    const aparada = campaign.selectedHeroIds.slice(0, missao.slots);
    set({
      campaign: {
        ...campaign,
        selectedMissionId: chapterId,
        selectedHeroIds:
          aparada.length > 0 ? aparada : preenchimentoPadrao(get().pvp.roster, missao.slots, campaign.castOrder),
        // A prévia da missão ANTERIOR sai da tela na hora: deixá-la enquanto a nova não chega
        // mostraria o tabuleiro errado para a missão certa, que é pior do que não mostrar nada.
        previa: null,
        error: null,
      },
    });

    // M36 3/N (D48) — a prévia vem do servidor, então ela é assíncrona. Falha de rede aqui não
    // vira erro na tela: a prévia é um luxo informativo, e quem não a recebe ainda consegue
    // escolher o time e entrar. O que não pode é a tela travar por causa dela.
    const { pvp } = get();
    if (!pvp.token) return;
    void api
      .missionPreview(pvp.token, chapterId)
      .then((previa) => {
        // Só aplica se o jogador ainda está olhando ESTA missão: uma resposta lenta de uma
        // missão que ele já trocou desenharia o tabuleiro de outra.
        if (get().campaign.selectedMissionId !== chapterId) return;
        set((s) => ({ campaign: { ...s.campaign, previa } }));
      })
      .catch(() => undefined);
  },

  // M27 3/N — abrir e fechar um capítulo. Sem exclusividade: o jogador que quer comparar a
  // rampa de dois capítulos abre os dois, e forçá-lo a um de cada vez seria uma regra que
  // nada pede.
  escolherCapitulo: (chapterId) => {
    const { campaign } = get();
    if (!campaign.chapters.some((chapter) => chapter.id === chapterId)) return;
    // `openChapterIds` guarda a aba em foco (a primeira da lista): a sanfona do M27 abria
    // várias, a aba abre uma.
    set({ campaign: { ...campaign, openChapterIds: [chapterId] } });
  },
  voltarParaMissoes: () => set((s) => ({ campaign: { ...s.campaign, selectedMissionId: null, error: null } })),
  toggleChapterOpen: (chapterId) => {
    const { campaign } = get();
    if (!campaign.chapters.some((chapter) => chapter.id === chapterId)) return;
    const aberto = campaign.openChapterIds.includes(chapterId);
    set({
      campaign: {
        ...campaign,
        openChapterIds: aberto
          ? campaign.openChapterIds.filter((id) => id !== chapterId)
          : [...campaign.openChapterIds, chapterId],
      },
    });
  },

  // D16 — o capítulo declara VAGAS e o jogador leva quem tem. As duas recusas aqui são as
  // que o servidor faria de qualquer jeito (400 por excesso de heróis, 400 por posse); a
  // tela as faz antes para o jogador não descobrir por erro de rede. Quem decide continua
  // sendo o servidor (§9.4).
  toggleCampaignHero: (heroId) => {
    const { campaign, pvp } = get();
    if (campaign.selectedHeroIds.includes(heroId)) {
      set({
        campaign: {
          ...campaign,
          selectedHeroIds: campaign.selectedHeroIds.filter((id) => id !== heroId),
          error: null,
        },
      });
      return;
    }
    // Herói que não está no roster do servidor não é do jogador — e a campanha checa posse
    // desde a 4/N.
    if (!pvp.roster.some((entry) => entry.hero.id === heroId)) return;

    const missao = missaoPorId(campaign.chapters, campaign.selectedMissionId);
    const vagas = missao?.slots ?? 0;
    if (campaign.selectedHeroIds.length >= vagas) {
      set({ campaign: { ...campaign, error: `esta missão tem ${vagas} vaga(s)` } });
      return;
    }
    set({ campaign: { ...campaign, selectedHeroIds: [...campaign.selectedHeroIds, heroId], error: null } });
  },

  // M36 4/N (D47) — entrar numa missão ABRE UMA PARTIDA VIVA. O `ticket` morreu com ela: o
  // servidor não manda mais o `BattleSetup` montado, manda o tabuleiro REDIGIDO e guarda o
  // resto. O cliente desenha o que recebeu e joga um comando por vez.
  enterChapter: async (chapterId) => {
    const { pvp, campaign } = get();
    if (!pvp.token) {
      set((s) => ({ campaign: { ...s.campaign, error: get().t('estado.conecteAntes') } }));
      return;
    }
    if (campaign.selectedHeroIds.length === 0) {
      set((s) => ({ campaign: { ...s.campaign, error: get().t('estado.escolhaHeroi') } }));
      return;
    }

    set((s) => ({ campaign: { ...s.campaign, busy: true, error: null, status: get().t('estado.pedindoCapitulo') } }));
    try {
      const vista = await api.abrirPartidaDeCampanha(pvp.token, chapterId, campaign.selectedHeroIds);
      get().assumirPartida(vista);
      set((s) => ({
        campaign: { ...s.campaign, selectedMissionId: chapterId, lastRun: null, busy: false, status: null },
      }));
    } catch (error) {
      set((s) => ({ campaign: { ...s.campaign, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  /**
   * Põe uma partida viva na tela — vinda da abertura ou da RECONEXÃO. Um lugar só para as três
   * superfícies: o tabuleiro, quem é cada peça, o log zerado e a abertura da IA para animar.
   */
  assumirPartida: (vista) => {
    set((s) => ({
      mode: vista.kind === 'arena' ? 'pvp' : vista.kind === 'dungeon' ? 'dungeon' : 'campaign',
      partida: vista,
      battleState: vista.visivel,
      heroesByUnitId: heroesPorUnidade(vista.visivel.units, s.pvp.roster),
      artIdByUnitId: vista.characterIdByUnitId,
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      duelScene: null,
      targetingMode: null,
      lastCommandReason: null,
      comandoEmVoo: false,
      liquidacao: vista.liquidacao ?? null,
      // O turno de IA que acontece ANTES do primeiro comando: sem ele o jogador abriria a
      // missão com os inimigos já noutro lugar, sem ter visto ninguém andar.
      ...relatoDaIa(vista.visivel, vista.aberturaDaIa, s.instantResultMode),
    }));
    if (vista.liquidacao) get().liquidarPartida(vista.liquidacao);
  },

  /**
   * A RECONEXÃO (M22, que sobrevive à batalha viva): o cliente pergunta ao servidor se há
   * batalha aberta. Nada é guardado em disco — quem sabe é quem tem o estado.
   *
   * Silenciosa de propósito: quem não tem partida recebe 404, e isso não é erro nenhum.
   */
  reconectarPartida: async () => {
    const { pvp } = get();
    if (!pvp.token) return;
    try {
      get().assumirPartida(await api.partidaAtual(pvp.token));
    } catch {
      // Sem batalha aberta. É o caso normal.
    }
  },

  /**
   * A batalha fechou: o servidor já pagou (ou cobrou) o que tinha de pagar, e o cliente relê o
   * hub para a tela não mostrar um estado que ele mudou.
   *
   * Não há submissão: o desfecho é do comando que o produziu. Esta função é o que sobrou de
   * `submitCampaignRun`/`submitDungeonRun`/`submitPvpBattle`, e é só leitura.
   */
  liquidarPartida: (liquidacao) => {
    set((s) => ({
      liquidacao,
      campaign:
        s.partida?.kind === 'campaign'
          ? {
              ...s.campaign,
              lastRun: {
                outcome: s.battleState.outcome === 'victory' ? 'victory' : 'defeat',
                roundsPlayed: s.battleState.round,
                premiumAwarded: liquidacao.premiumAwarded ?? 0,
                premium: liquidacao.premium ?? s.summon.premium,
              },
              status: get().t('estado.servidorResolveu', {
                desfecho: nomeDoDesfecho(get().t, s.battleState.outcome),
              }),
            }
          : s.campaign,
    }));
    void get().carregarHub();
  },

  /**
   * Sair da batalha. Se ela ainda corre, DESISTIR — e desistir não devolve o que foi pago ao
   * entrar (D48). É a saída honesta: sem ela, quem abriu uma masmorra e não quer mais jogá-la
   * ficaria preso, porque é uma partida em andamento por jogador.
   */
  desistirDaPartida: async () => {
    const { pvp, partida } = get();
    if (partida && partida.outcome === 'ongoing' && pvp.token) {
      try {
        await api.desistirDaPartida(pvp.token, partida.nonce);
      } catch {
        // Uma desistência que não chegou deixa a partida aberta no servidor, e a reconexão a
        // encontra de novo. Travar a tela por causa disso seria pior.
      }
    }
    get().limparTabuleiro();
    void get().carregarHub();
  },

  /** O tabuleiro volta a ser o vazio, e nada mais fica pendurado dele. */
  limparTabuleiro: () => {
    set({
      partida: null,
      battleState: tabuleiroVazio(),
      heroesByUnitId: {},
      artIdByUnitId: {},
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      duelScene: null,
      targetingMode: null,
      lastCommandReason: null,
      aiTurnReport: null,
      comandoEmVoo: false,
      pausaAberta: false,
    });
  },

  exitCampaign: () => {
    const missaoJogada = get().partida?.refId ?? null;
    const desistencia = get().desistirDaPartida();
    set((s) => ({
      campaign: {
        ...s.campaign,
        status: null,
        error: null,
        // M32 — missão que ficou LIMPA solta a seleção: com ela selecionada, o botão azul
        // do hub apontaria para jogá-la de novo, e a missão seguinte (a próxima ação de
        // verdade, D40) ficaria sem destaque. A que não ficou limpa continua selecionada —
        // quem abandonou ou perdeu provavelmente quer tentar de novo.
        selectedMissionId: missaoPorId(s.campaign.chapters, missaoJogada)?.cleared
          ? null
          : s.campaign.selectedMissionId,
      },
    }));
    return desistencia;
  },

  // §6.3 (M18, 7/N) — o script tático passa a ser do SERVIDOR. Antes ele era editado no
  // `battleState` local e o mapa era remontado; com a batalha vindo do ticket, uma edição
  // que não chega ao servidor faz o `run` reexecutar uma batalha diferente da jogada.
  saveHeroTactics: async (heroId, script) => {
    const { pvp } = get();
    if (!pvp.token) return;
    set((s) => ({ campaign: { ...s.campaign, busy: true, error: null } }));
    try {
      const { hero } = await api.saveTactics(pvp.token, heroId, script);
      set((s) => ({
        campaign: { ...s.campaign, busy: false, status: get().t('estado.taticasSalvas') },
        pvp: {
          ...s.pvp,
          roster: s.pvp.roster.map((entry) => (entry.hero.id === heroId ? { ...entry, hero } : entry)),
        },
      }));
    } catch (error) {
      set((s) => ({ campaign: { ...s.campaign, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // §8.2 — mesma história dos talentos. A validação do core roda dos DOIS lados: aqui para
  // o botão não oferecer o ilegal, e no servidor porque é ele quem decide (§9.4).
  saveHeroTalents: async (heroId, allocation) => {
    const { pvp } = get();
    if (!pvp.token) return;
    set((s) => ({ campaign: { ...s.campaign, busy: true, error: null } }));
    try {
      const { hero } = await api.saveTalents(pvp.token, heroId, allocation);
      set((s) => ({
        campaign: { ...s.campaign, busy: false, status: get().t('estado.talentosSalvos') },
        pvp: {
          ...s.pvp,
          roster: s.pvp.roster.map((entry) => (entry.hero.id === heroId ? { ...entry, hero } : entry)),
        },
      }));
    } catch (error) {
      set((s) => ({ campaign: { ...s.campaign, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // §11 — "Editor de táticas: Drag & drop das linhas, condições em dropdown, e botão
  // 'Testar'." Editar o script não é uma ação de batalha (não existe BattleCommand pra
  // isso — configurar táticas é trabalho de fora do combate no jogo real), então isso
  // atualiza a unidade direto no battleState em vez de passar por applyCommandAndAdvance.
  openTacticsEditor: (unitId) => {
    // É aqui que o jogador descobre que PROGRAMA a unidade antes, em vez de comandá-la
    // durante o duelo.
    get().dispararIntroducao('script-tatico');
    set({ tacticsEditorUnitId: unitId });
  },
  closeTacticsEditor: () => set({ tacticsEditorUnitId: null }),

  // M13, sub-sessão 1/N — a edição fica travada depois do primeiro comando do mapa
  // (decisão do usuário). O script não é um `BattleCommand` — M6 o tratou como
  // configuração de fora do combate, e §11 o descreve como ferramenta de preparação
  // ("Testar contra um manequim configurável"). Só que um `Replay` reaplica o setup
  // inicial mais os comandos: um script trocado no meio da batalha não estaria em nenhum
  // dos dois, e a reprodução mostraria uma batalha que não aconteceu. A janela de edição é
  // a preparação do capítulo, antes de qualquer unidade agir.
  updateUnitTacticsScript: (unitId, script) => {
    const { commandLog, heroesByUnitId, campaign } = get();
    if (commandLog.length > 0) {
      set({ lastCommandReason: 'táticas só podem ser editadas antes do primeiro comando do mapa' });
      return;
    }

    // §6.3 (M18, 7/N) — o script deixou de ser estado local. Quem monta a batalha é o
    // servidor, a partir do herói que ELE tem: editar só o `battleState` daqui faria o
    // `POST /campaign/:id/run` reexecutar uma batalha com o script antigo, e o desfecho
    // divergiria do que o jogador viu (§9.1).
    const hero = heroesByUnitId[unitId];
    if (!hero) {
      set({ lastCommandReason: 'esta unidade não é um herói seu' });
      return;
    }

    void (async () => {
      await get().saveHeroTactics(hero.id, script);
      // Reentrar no capítulo é o que faz o tabuleiro refletir o script novo — e é legítimo
      // exatamente porque a edição só é permitida antes do primeiro comando: não há
      // batalha a perder. É o mesmo movimento que `buildMapState` fazia localmente até
      // aqui, agora com o servidor como fonte.
      const { campaign: depois } = get();
      if (depois.error === null && campaign.ticket) await get().enterChapter(campaign.ticket.chapterId);
    })();

    set({ selectedUnitId: null, reachableTiles: [], lastCommandReason: null });
  },

  // §11 — "Inventário: filtro por set/slot/substat, comparação lado a lado, ganho de
  // dano real ao equipar." Equipar/desequipar não é uma ação de batalha (sem
  // BattleCommand pra isso — troca de gear é trabalho de fora do combate), então isso
  // só mexe em `equippedByUnit`, nunca passa por `applyCommandAndAdvance`.
  openInventory: (unitId) => set({ inventoryUnitId: unitId }),
  closeInventory: () => set({ inventoryUnitId: null }),

  equipItem: (unitId, itemId) => {
    const { inventory, equippedByUnit } = get();
    const item = inventory.find((i) => i.id === itemId);
    if (!item) return;

    // Um item só pode estar equipado em um lugar — some da unidade que tinha antes.
    const next: Record<string, Partial<Record<GearSlot, Id>>> = {};
    for (const [uid, slots] of Object.entries(equippedByUnit)) {
      const filtered: Partial<Record<GearSlot, Id>> = { ...slots };
      for (const slot of Object.keys(filtered) as GearSlot[]) {
        if (filtered[slot] === itemId) delete filtered[slot];
      }
      next[uid] = filtered;
    }
    next[unitId] = { ...next[unitId], [item.slot]: itemId };
    set({ equippedByUnit: next });
  },

  unequipItem: (unitId, slot) => {
    const { equippedByUnit } = get();
    const current = equippedByUnit[unitId];
    if (!current) return;
    const next = { ...current };
    delete next[slot];
    set({ equippedByUnit: { ...equippedByUnit, [unitId]: next } });
  },

  // §11 — "Talentos: Grafo, preview do efeito, string de build compartilhável." Alocar
  // não é uma ação de batalha (sem BattleCommand — treinar talento é fora de combate no
  // jogo real). Toda mudança (+1/-1/reset/carregar código) sempre recomputa a alocação
  // inteira e revalida com `validateColumnAllocation` antes de aplicar.
  //
  // §8.2 (M17, 4/N) — a revalidação da árvore INTEIRA a cada clique deixou de ser
  // precaução e virou o mecanismo: a árvore é um CAMINHO, então tirar um ponto do meio dele
  // deixa as linhas de baixo penduradas no nada, e é o core que diz isso. O cliente não
  // reimplementa a amarração de coluna em lugar nenhum — ver `logic/talentLayout.ts`.
  openTalentEditor: (unitId) => set({ talentEditorUnitId: unitId, lastTalentReason: null }),
  closeTalentEditor: () => set({ talentEditorUnitId: null }),

  allocateTalent: (unitId, nodeId) => {
    const { talentAllocationByUnit, heroesByUnitId } = get();
    const tree = characterTreeForUnit(heroesByUnitId, unitId);
    if (!tree) {
      set({ lastTalentReason: 'esta unidade não é um personagem do elenco' });
      return;
    }
    const current = talentAllocationByUnit[unitId] ?? {};
    const nextAllocation: TalentAllocation = { ...current, [nodeId]: (current[nodeId] ?? 0) + 1 };
    const result = validateColumnAllocation({
      tree,
      allocation: nextAllocation,
      awakening: awakeningForUnit(heroesByUnitId, unitId),
    });
    if (!result.valid) {
      set({ lastTalentReason: result.issues[0]?.reason ?? 'alocação inválida' });
      return;
    }
    set({
      talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: nextAllocation },
      lastTalentReason: null,
    });
    persistirAlocacao(get, unitId, nextAllocation);
  },

  deallocateTalent: (unitId, nodeId) => {
    const { talentAllocationByUnit, heroesByUnitId } = get();
    const tree = characterTreeForUnit(heroesByUnitId, unitId);
    if (!tree) return;
    const current = talentAllocationByUnit[unitId] ?? {};
    const currentRank = current[nodeId] ?? 0;
    if (currentRank <= 0) return;

    const nextAllocation: TalentAllocation = { ...current, [nodeId]: currentRank - 1 };
    const result = validateColumnAllocation({
      tree,
      allocation: nextAllocation,
      awakening: awakeningForUnit(heroesByUnitId, unitId),
    });
    if (!result.valid) {
      // A saída não é um beco: o painel oferece o reset a partir da linha, que é como se
      // desfaz um caminho — da ponta para trás.
      set({ lastTalentReason: result.issues[0]?.reason ?? 'remover este ponto invalida o caminho' });
      return;
    }
    set({
      talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: nextAllocation },
      lastTalentReason: null,
    });
    persistirAlocacao(get, unitId, nextAllocation);
  },

  resetTalentTree: (unitId, fromRow) => {
    const { talentAllocationByUnit, heroesByUnitId } = get();
    const tree = characterTreeForUnit(heroesByUnitId, unitId);
    if (!tree) return;
    const next = resetFromRow(tree, talentAllocationByUnit[unitId] ?? {}, fromRow);
    set({ talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: next }, lastTalentReason: null });
    persistirAlocacao(get, unitId, next);
  },

  loadBuildCode: (unitId, code) => {
    const { heroesByUnitId } = get();
    const tree = characterTreeForUnit(heroesByUnitId, unitId);
    if (!tree) {
      set({ lastTalentReason: 'esta unidade não é um personagem do elenco' });
      return;
    }
    const lido = readBuildCodeFor(
      tree.characterId,
      tree,
      code,
      awakeningForUnit(heroesByUnitId, unitId),
    );
    if (!lido.ok) {
      set({ lastTalentReason: lido.reason });
      return;
    }
    const { talentAllocationByUnit } = get();
    set({
      talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: lido.talents },
      lastTalentReason: null,
    });
    persistirAlocacao(get, unitId, lido.talents);
  },

  // §11 (acessibilidade) — "modo resultado instantâneo (pula animações) — essencial pra
  // farm." Só afeta apresentação (MapCanvas/DuelPreviewPanel); o estado do core nunca
  // muda de forma diferente com o modo ligado ou desligado.
  // §5.4 — o alcance de LANÇAMENTO é `skill.duelRange` quando declarado, senão o da
  // unidade; a mesma leitura que `applyMapSkill` faz no core. O cliente recalcula pra
  // desenhar o overlay, mas quem valida continua sendo o core: clicar fora do overlay não
  // monta comando, e um comando inválido que escape é rejeitado por
  // `applyCommandAndAdvance` com o motivo aparecendo na barra de ações.
  // M36 4/N (D47) — `buildReplay` FOI REMOVIDA.
  //
  // Ela montava o `Replay {rulesVersion, seed, initialState, commands}` no cliente, a partir do
  // setup e da seed que o ticket tinha entregue. Os dois saíram: o setup completo não atravessa
  // mais a rede e a seed nunca sai do servidor. Quem constrói o replay é o servidor, do log que
  // ele acumulou — e o cliente o LÊ em `GET /battles/:nonce/log`, já redigido passo a passo.

  // §10 (M18, 6/N) — a tela de aquisição lê as TRÊS superfícies de uma vez. Separá-las em
  // três botões faria o jogador ver saldo velho ao lado de pity novo: a moeda premium é a
  // mesma nas três respostas, e a última a chegar mandaria.
  // M32 — a leitura SEM introdução: `connectPvp` carrega o hub inteiro no sign-in, e a caixa
  // de "primeiro summon" por cima da campanha competiria com a missão 1. M35 1/N — a
  // introdução dispara ao ABRIR a aba de invocação (`escolherAba`); o botão Atualizar morreu.
  lerInvocacao: async () => {
    const { pvp } = get();
    if (!pvp.token) {
      set((s) => ({ summon: { ...s.summon, error: get().t('estado.conecteAntes') } }));
      return;
    }
    set((s) => ({ summon: { ...s.summon, busy: true, error: null } }));
    try {
      const [roster, banners, rewards, artefatos] = await Promise.all([
        api.characterRoster(pvp.token),
        api.banners(pvp.token),
        api.rewards(pvp.token),
        api.artifacts(pvp.token),
      ]);
      set((s) => ({
        pvp: { ...s.pvp, artifacts: artefatos.artifacts },
        summon: {
          ...s.summon,
          premium: roster.premium,
          characters: roster.characters,
          banners: banners.banners,
          rewards: rewards.rewards,
          busy: false,
        },
      }));
      // A lista já está na mão: espelhar aqui não custa requisição, e cobre o jogador que
      // cumpriu uma conquista DURANTE a sessão sem precisar reconectar para ela aparecer.
      void espelharConquistas(rewards.rewards);
    } catch (error) {
      set((s) => ({ summon: { ...s.summon, busy: false, error: describeApiError(error) } }));
    }
  },

  rollSummon: async (bannerId) => {
    const { pvp, summon } = get();
    if (!pvp.token) {
      set((s) => ({ summon: { ...s.summon, error: get().t('estado.conecteAntes') } }));
      return;
    }
    const banner = summon.banners.find((candidate) => candidate.id === bannerId);
    if (!banner) {
      set((s) => ({ summon: { ...s.summon, error: get().t('estado.bannerDesconhecido') } }));
      return;
    }
    // A recusa por saldo é do SERVIDOR (§9.4 — quem decide é ele), e mesmo assim a tela
    // tem de impedir que ela vire requisição: o mesmo contrato da defesa de arena em M15
    // 3/N. Aqui há uma razão a mais — o nonce é a chave de idempotência, e queimar um
    // nonce num 400 é a fresta que a 3/N fechou do outro lado.
    if (summon.premium < banner.premiumCost) {
      set((s) => ({ summon: { ...s.summon, error: `moeda premium insuficiente: ${banner.premiumCost} necessária(s)` } }));
      return;
    }

    set((s) => ({ summon: { ...s.summon, busy: true, error: null, status: get().t('estado.invocando') } }));
    try {
      const resultado = await api.summon(pvp.token, bannerId);
      set((s) => ({
        summon: {
          ...s.summon,
          lastResult: resultado,
          lastResultBannerId: bannerId,
          premium: resultado.premium,
          busy: false,
          status: null,
        },
      }));
      // Relê tudo: o personagem que acabou de sair tem de aparecer possuído sem recarregar
      // a página, e o pity mudou. O saldo já veio na resposta e é o que vale até lá.
      await get().lerInvocacao();

      // E o roster de HERÓIS junto, quando saiu personagem novo. Os dois rosters são
      // coisas diferentes (um diz quem o jogador tem, o outro quais instâncias ele leva ao
      // mapa) e só o primeiro é relido acima — sem isto, o invocado aparece no elenco e
      // continua fora do time até o jogador reconectar, que é metade do critério de aceite
      // 1 faltando na tela. Visto no navegador nesta fatia, não suposto.
      if (resultado.outcome.kind === 'character') {
        const heroes = await api.roster(pvp.token);
        set((s) => ({ pvp: { ...s.pvp, roster: heroes } }));
      }
    } catch (error) {
      set((s) => ({ summon: { ...s.summon, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // M38 3/N — o resgate da escolha do genérico. A recusa sem escolha pendente é do servidor,
  // e mesmo assim a tela não a deixa virar requisição (o mesmo contrato do saldo).
  resgatarEscolha: async (bannerId, choiceId) => {
    const { pvp, summon } = get();
    if (!pvp.token) {
      set((s) => ({ summon: { ...s.summon, error: get().t('estado.conecteAntes') } }));
      return;
    }
    const banner = summon.banners.find((candidate) => candidate.id === bannerId);
    if (!banner?.choice || banner.choice.pending < 1) {
      set((s) => ({ summon: { ...s.summon, error: get().t('summon.semEscolha') } }));
      return;
    }
    set((s) => ({ summon: { ...s.summon, busy: true, error: null } }));
    try {
      const resultado = await api.summonChoice(pvp.token, bannerId, choiceId);
      set((s) => ({ summon: { ...s.summon, lastResult: resultado, lastResultBannerId: bannerId, busy: false } }));
      await get().lerInvocacao();
      if (resultado.outcome.kind === 'character') {
        const heroes = await api.roster(pvp.token);
        set((s) => ({ pvp: { ...s.pvp, roster: heroes } }));
      }
    } catch (error) {
      set((s) => ({ summon: { ...s.summon, busy: false, error: describeApiError(error) } }));
    }
  },

  // M38 4/N (D53/D56) — o artefato jogável. Quem trava por classe, cobra e move entre heróis
  // é o servidor; a tela chama e relê heróis e artefatos, que é onde o poder na tela muda.
  equiparArtefato: async (instanceId, heroId) => {
    await acaoDeArtefato(get, set, () => api.equipArtifact(get().pvp.token, instanceId, heroId), get().t('estado.artefatoEquipado'));
  },
  desequiparArtefato: async (heroId) => {
    await acaoDeArtefato(get, set, () => api.unequipArtifact(get().pvp.token, heroId), get().t('estado.artefatoDesequipado'));
  },
  despertarArtefato: async (instanceId) => {
    await acaoDeArtefato(get, set, () => api.awakenArtifact(get().pvp.token, instanceId), get().t('estado.artefatoDespertado'));
  },
  imprintArtefato: async (instanceId) => {
    await acaoDeArtefato(get, set, () => api.imprintArtifact(get().pvp.token, instanceId), get().t('estado.artefatoImprint'));
  },

  claimReward: async (rewardId) => {
    const { pvp, summon } = get();
    if (!pvp.token) {
      set((s) => ({ summon: { ...s.summon, error: get().t('estado.conecteAntes') } }));
      return;
    }
    // Quem decide se a condição está cumprida é `rewards/conditions.ts`, no servidor; o
    // que a tela sabe é o `claimable` que ele já respondeu. Mandar mesmo assim seria pedir
    // um 403 previsível.
    const premio = summon.rewards.find((candidate) => candidate.id === rewardId);
    if (!premio?.claimable) {
      set((s) => ({ summon: { ...s.summon, error: get().t('estado.premioIndisponivel') } }));
      return;
    }

    set((s) => ({ summon: { ...s.summon, busy: true, error: null } }));
    try {
      const resposta = await api.claimReward(pvp.token, rewardId);
      set((s) => ({
        summon: { ...s.summon, premium: resposta.premium, busy: false, status: get().t('estado.premiumGanho', { premium: resposta.premiumAwarded }) },
      }));
      await get().lerInvocacao();
    } catch (error) {
      set((s) => ({ summon: { ...s.summon, busy: false, error: describeApiError(error) } }));
    }
  },

  // D17 — o segundo sumidouro. Fica nesta sessão e não na de farm porque quem paga é a
  // moeda premium; o que ele devolve (energia) é da outra, e por isso a conta de PvE é
  // relida em seguida.
  purchaseEnergy: async () => {
    const { pvp } = get();
    if (!pvp.token) {
      set((s) => ({ summon: { ...s.summon, error: get().t('estado.conecteAntes') } }));
      return;
    }
    set((s) => ({ summon: { ...s.summon, busy: true, error: null } }));
    try {
      const resposta = await api.purchaseEnergy(pvp.token);
      set((s) => ({ summon: { ...s.summon, premium: resposta.premium, busy: false, status: get().t('estado.energiaComprada') } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ summon: { ...s.summon, busy: false, error: describeApiError(error) } }));
    }
  },

  // M36 4/N (D47) — abrir o replay virou uma LEITURA do servidor, e por isso é assíncrono.
  //
  // O cliente não tem mais como montar um `Replay`: o setup completo não atravessa a rede e a
  // seed nunca sai do servidor. O que ele pede é o log já redigido, passo a passo, e o que ele
  // faz com ele é o de sempre — desenhar.
  openReplayViewer: async () => {
    const { pvp, partida } = get();
    if (!pvp.token || !partida) return;
    try {
      const log = await api.logDoReplay(pvp.token, partida.nonce);
      set({
        replayViewer: { log, step: 0, state: replayStateAt(log, 0), playing: false, speed: 1 },
        targetingMode: null,
      });
    } catch (error) {
      set({ lastCommandReason: describeApiError(error) });
    }
  },

  closeReplayViewer: () => set({ replayViewer: null }),

  seekReplay: (step) => {
    const { replayViewer } = get();
    if (!replayViewer) return;
    const total = replayViewer.log.passos.length;
    const clamped = Math.max(0, Math.min(total, step));
    set({
      replayViewer: {
        ...replayViewer,
        step: clamped,
        state: replayStateAt(replayViewer.log, clamped),
        // Chegou ao fim: para sozinho, senão o timer segue disparando à toa.
        playing: clamped < total ? replayViewer.playing : false,
      },
    });
  },

  setReplaySpeed: (speed) => {
    const { replayViewer } = get();
    if (replayViewer) set({ replayViewer: { ...replayViewer, speed } });
  },

  toggleReplayPlaying: () => {
    const { replayViewer } = get();
    if (!replayViewer) return;
    // Dar play no fim rebobina: é o gesto esperado de quem quer rever.
    const atEnd = replayViewer.step >= replayViewer.log.passos.length;
    set({
      replayViewer: {
        ...replayViewer,
        playing: !replayViewer.playing,
        ...(atEnd && !replayViewer.playing ? { step: 0, state: replayStateAt(replayViewer.log, 0) } : {}),
      },
    });
  },

  beginMapSkillTargeting: (skillId) => {
    const { battleState, selectedUnitId } = get();
    const unit = battleState.units.find((u) => u.unitId === selectedUnitId);
    // Só a unidade do PRÓPRIO jogador tem skills a mirar — a do inimigo não traz `knownSkills`
    // (D47), e mirar com a peça dele nunca fez sentido de qualquer forma.
    if (!unit || !ehVisivelPorInteiro(unit)) return;

    const skill = unit.knownSkills[skillId];
    if (!skill || skill.kind !== 'map') return;

    const castRange = skill.duelRange ?? unit.duelRange;
    set({
      targetingMode: {
        kind: 'mapSkill',
        skillId,
        casterUnitId: unit.unitId,
        areaRadius: skill.areaRadius ?? 0,
        tiles: tilesWithin(battleState, unit.pos, castRange),
      },
      lastCommandReason: null,
    });
  },

  // §5.6 — "artilharia DE MAPA": Valor não sai de unidade nenhuma e a spec não dá limite
  // de alcance, então todo tile do grid é alvo legal (decisão registrada em M11 3/N).
  beginValorTargeting: (skillId) => {
    const { battleState } = get();
    // M36 4/N — as valor-skills saem do CATÁLOGO do cliente e não mais do estado: o estado
    // visível não as carrega (elas são definição autorada, não tabuleiro), e o catálogo as tem
    // porque `valor-skills/` continua no bundle — nada nelas descreve o inimigo.
    const skill = catalog.valorSkills[skillId];
    if (!skill) return;

    set({
      targetingMode: {
        kind: 'valor',
        skillId,
        casterUnitId: null,
        areaRadius: skill.kind === 'artillery' ? skill.payload.radius : 0,
        tiles: allTiles(battleState),
      },
      lastCommandReason: null,
    });
  },

  cancelTargeting: () => set({ targetingMode: null }),

  confirmTargetAt: (target) => {
    const { battleState, targetingMode } = get();
    if (!targetingMode) return;
    if (!targetingMode.tiles.some((tile) => tile.x === target.x && tile.y === target.y)) return;

    const command: BattleCommand =
      targetingMode.kind === 'mapSkill'
        ? { t: 'mapSkill', unitId: targetingMode.casterUnitId ?? '', skillId: targetingMode.skillId, target }
        : { t: 'useValor', skillId: targetingMode.skillId, target };

    // Valor não consome o turno de ninguém (§5.6), então a unidade selecionada continua
    // selecionada e com o alcance recomputado; uma skill de mapa encerra o turno de quem lançou.
    // `manterSelecao` diz isso ao caminho comum, que é o mesmo de todo outro comando.
    void get().enviarComando(command, { manterSelecao: targetingMode.kind === 'valor' });
  },

  setPvpToken: (token) => set((s) => ({ pvp: { ...s.pvp, token, error: null } })),

  // §9.4 (M20) — conectar deixou de ser "digite seu token".
  //
  // O ticket vem da PLATAFORMA (`data/platformBridge.ts`) e o sign-in é explícito: é ele que
  // cria a conta na primeira vez e entrega o núcleo de quatro. O jogador não digita nada — e
  // é isso que o critério de aceite do M20 pede.
  connectPvp: async () => {
    const { pvp } = get();
    set({ pvp: { ...pvp, busy: true, error: null, status: get().t('estado.conectando') } });
    try {
      const ticket = await platformBridge.requestSessionTicket();
      if (!ticket) {
        set((s) => ({
          pvp: { ...s.pvp, busy: false, status: null, error: get().t('estado.plataformaIndisponivel') },
        }));
        return;
      }

      // O sign-in vem PRIMEIRO: sem conta, toda rota protegida devolve 401 (a autenticação
      // não cria conta pela porta dos fundos — decisão do M20).
      await api.session(ticket);
      set((s) => ({ pvp: { ...s.pvp, token: ticket } }));

      const [me, roster, artefatos] = await Promise.all([api.me(ticket), api.roster(ticket), api.artifacts(ticket)]);
      set((s) => ({
        pvp: {
          ...s.pvp,
          me,
          roster,
          artifacts: artefatos.artifacts,
          // Time inteiro pré-selecionado: o servidor aceita de 1 a 5 heróis, e escolher é
          // decisão do jogador, não pré-requisito pra começar.
          selectedHeroIds: roster.map((entry) => entry.hero.id),
          busy: false,
          status: get().t('estado.conectadoComo', { nome: me.displayName }),
        },
      }));
      // §9.4 (M21, 3/N) — as conquistas cumpridas vão para a plataforma no SIGN-IN, e não
      // só na tela de prêmios: aquela tela é opcional, e quem nunca a abre ficaria com o
      // perfil vazio tendo limpado a campanha inteira. Fora do shell a função sai antes de
      // fazer requisição nenhuma, e falhar nunca derruba a conexão.
      void sincronizarConquistasDaConta(ticket);

      // M22 2/N, na forma que sobrou depois de M36 4/N — o pedido em voo cobre uma rota só: a
      // VARREDURA, que continua sendo um disparo que cobra energia e devolve loot. As outras
      // três (arena, masmorra à mão, capítulo) deixaram de existir com a batalha viva, e o que
      // elas protegiam virou a reconexão de verdade, logo abaixo.
      try {
        const recuperado = await reenviarPedidoPendente(ticket);
        if (recuperado) {
          set((s) => ({ pve: { ...s.pve, lastRun: recuperado.resposta, status: get().t('estado.runRecuperada') } }));
        }
      } catch {
        // Servidor fora do ar ou recusa: a próxima conexão tenta de novo.
      }

      // A defesa vem junto do login: o jogador precisa ver o que está defendendo por ele
      // ANTES de decidir atacar alguém. Erro aqui não derruba a conexão — `loadDefense`
      // trata o 404 como estado normal e o resto vira mensagem na própria tela.
      await get().loadDefense();

      // M32 — o hub vem junto do login. Sem isto a campanha aparecia VAZIA depois de entrar,
      // com um botão "Atualizar" e "Escolha uma missão": a missão 1, que é a próxima ação de
      // quem chega (D40), só existia depois de um clique num botão de harness. Visto na tela
      // com sessão de verdade, depois de D38 tirar o tabuleiro do hub.
      await get().carregarHub();

      // M36 4/N — e a batalha que ficou aberta volta, se houver. Depois do hub: quem reconecta
      // no meio de uma missão precisa do roster carregado para o tabuleiro saber quem é quem.
      await get().retomarBatalhaAberta();
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // Cada leitura trata o próprio erro e o escreve no próprio painel (`campaign.error`,
  // `summon.error`, `pve.error`), então uma falhar não derruba as outras nem a sessão — o
  // jogador entra e vê no painel o que não carregou, com o botão de tentar de novo.
  carregarHub: async () => {
    await Promise.all([get().refreshCampaign(), get().lerInvocacao(), get().refreshPve(), get().lerPresets(), get().lerTelemetria()]);
  },

  // M36 4/N (D47/M22) — a RECONEXÃO, no lugar onde a sessão começa.
  //
  // Quem cai no meio de uma batalha e volta encontra a partida no ponto em que a deixou: o
  // estado é do servidor, e perguntar por ele é uma requisição. Antes desta milestone o M22
  // guardava o PEDIDO em disco e o reenviava; agora não há pedido que valha a pena guardar,
  // porque não existe mais um instante em que a batalha inteira é submetida.
  //
  // Roda depois do sign-in e não dentro de `carregarHub`: `carregarHub` também roda ao FECHAR
  // uma batalha, e reabrir o tabuleiro nesse instante jogaria o jogador de volta para dentro
  // dela.
  retomarBatalhaAberta: async () => {
    await get().reconectarPartida();
  },

  // M35 3/N (D42) — os presets de party. Estado de conta no servidor; aqui só leitura,
  // aplicação por cima da seleção e os dois gestos (salvar, apagar). Quem valida posse e
  // tamanho é o servidor; a tela apara às vagas da missão ao aplicar.
  lerPresets: async () => {
    const { pvp } = get();
    if (!pvp.token) return;
    set((s) => ({ presets: { ...s.presets, busy: true, error: null } }));
    try {
      const resposta = await api.partyPresets(pvp.token);
      set((s) => ({ presets: { ...s.presets, slots: resposta.slots, lista: resposta.presets, busy: false } }));
    } catch (error) {
      set((s) => ({ presets: { ...s.presets, busy: false, error: describeApiError(error) } }));
    }
  },

  // M34 2/N (D45) — a telemetria. Só leitura e a escolha; a declaração vem do servidor.
  lerTelemetria: async () => {
    const { pvp } = get();
    if (!pvp.token) return;
    set((s) => ({ telemetria: { ...s.telemetria, busy: true, error: null } }));
    try {
      const resposta = await api.telemetry(pvp.token);
      set((s) => ({ telemetria: { ...s.telemetria, optOut: resposta.optOut, collected: resposta.collected, busy: false } }));
    } catch (error) {
      set((s) => ({ telemetria: { ...s.telemetria, busy: false, error: describeApiError(error) } }));
    }
  },

  definirTelemetria: async (optOut) => {
    const { pvp } = get();
    if (!pvp.token) return;
    set((s) => ({ telemetria: { ...s.telemetria, busy: true, error: null } }));
    try {
      const resposta = await api.setTelemetry(pvp.token, optOut);
      set((s) => ({ telemetria: { ...s.telemetria, optOut: resposta.optOut, collected: resposta.collected, busy: false } }));
    } catch (error) {
      set((s) => ({ telemetria: { ...s.telemetria, busy: false, error: describeApiError(error) } }));
    }
  },

  aplicarPreset: (slot) => {
    const { presets, campaign, pvp } = get();
    const preset = presets.lista.find((p) => p.slot === slot);
    const missao = missaoPorId(campaign.chapters, campaign.selectedMissionId);
    if (!preset || !missao) return;
    // Só quem o jogador ainda tem: um preset salvo antes de perder um herói (conta apagada e
    // refeita, dado antigo) não pode mandar um id que o servidor recusaria por posse.
    const possui = new Set(pvp.roster.map((entry) => entry.hero.id));
    const selecao = preset.heroIds.filter((id) => possui.has(id)).slice(0, missao.slots);
    set({ campaign: { ...campaign, selectedHeroIds: selecao, error: null } });
  },

  salvarPreset: async (slot, name) => {
    const { pvp, campaign } = get();
    if (!pvp.token) return;
    if (campaign.selectedHeroIds.length === 0) {
      set((s) => ({ presets: { ...s.presets, error: get().t('presets.semSelecao') } }));
      return;
    }
    set((s) => ({ presets: { ...s.presets, busy: true, error: null } }));
    try {
      await api.savePartyPreset(pvp.token, slot, name, campaign.selectedHeroIds);
      await get().lerPresets();
    } catch (error) {
      set((s) => ({ presets: { ...s.presets, busy: false, error: describeApiError(error) } }));
    }
  },

  apagarPreset: async (slot) => {
    const { pvp } = get();
    if (!pvp.token) return;
    set((s) => ({ presets: { ...s.presets, busy: true, error: null } }));
    try {
      await api.deletePartyPreset(pvp.token, slot);
      await get().lerPresets();
    } catch (error) {
      set((s) => ({ presets: { ...s.presets, busy: false, error: describeApiError(error) } }));
    }
  },

  // O servidor é a fonte da verdade da defesa: a tela SEMPRE relê o que está lá antes de
  // mostrar qualquer coisa. 404 é o estado normal de quem nunca montou — vira rascunho
  // vazio, não erro na tela.
  loadDefense: async () => {
    const { pvp } = get();
    if (!pvp.token) return;
    set({ pvp: { ...pvp, busy: true, error: null, status: get().t('estado.lendoDefesa') } });
    try {
      const defense = await api.defense(pvp.token);
      set((s) => ({
        pvp: {
          ...s.pvp,
          savedDefense: defense,
          defenseDraft: { mapId: defense.mapId, units: defense.units, placingHeroId: null },
          busy: false,
          status: get().t('estado.defesaCarregada'),
        },
      }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        set((s) => ({
          pvp: {
            ...s.pvp,
            savedDefense: null,
            defenseDraft: { mapId: defenseMapIds()[0] ?? '', units: [], placingHeroId: null },
            busy: false,
            status: get().t('estado.semDefesa'),
          },
        }));
        return;
      }
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  setDefenseMap: (mapId) =>
    set((s) => ({
      pvp: {
        ...s.pvp,
        // Trocar de mapa zera as posições: uma coordenada de um mapa não significa nada em
        // outro, e carregá-la adiante poria unidade fora do grid ou dentro de uma parede.
        defenseDraft: { mapId, units: [], placingHeroId: null },
        error: null,
      },
    })),

  armDefenseHero: (heroId) =>
    set((s) => ({ pvp: { ...s.pvp, defenseDraft: { ...s.pvp.defenseDraft, placingHeroId: heroId }, error: null } })),

  // O clique no tile posiciona o herói armado. As quatro recusas do servidor (§2 do
  // briefing) são impedidas ANTES de virar requisição — mas o servidor continua validando,
  // porque ele é a autoridade e o cliente é conveniência.
  placeDefenseAt: (coord) => {
    const { pvp } = get();
    const draft = pvp.defenseDraft;
    const heroId = draft.placingHeroId;
    if (!heroId) return;

    const grid = catalog.maps[draft.mapId]?.grid;
    const tile = grid ? tileAt(grid, coord) : undefined;
    if (!tile) return;
    // Tile bloqueado por muro/portão (§5.1, M15) ou por terreno impassável: nascer ali é
    // nascer preso, e o motor não valida colocação inicial — quem tem de recusar é a tela.
    if (tile.object === 'wall' || tile.object === 'gate') {
      set({ pvp: { ...pvp, error: get().t('estado.muroNaoEhPosicao') } });
      return;
    }
    if (grid && grid.terrains[tile.terrain]?.moveCost.foot === 'impassable') {
      set({ pvp: { ...pvp, error: get().t('estado.terrenoNaoEhPosicao') } });
      return;
    }
    if (draft.units.some((u) => u.heroId !== heroId && u.pos.x === coord.x && u.pos.y === coord.y)) {
      set({ pvp: { ...pvp, error: get().t('estado.tileOcupado') } });
      return;
    }
    if (draft.units.length >= MAX_DEFENSE_UNITS && !draft.units.some((u) => u.heroId === heroId)) {
      set({ pvp: { ...pvp, error: `a defesa aceita no máximo ${MAX_DEFENSE_UNITS} heróis` } });
      return;
    }

    const existing = draft.units.find((u) => u.heroId === heroId);
    const placed: ArenaDefenseUnit = {
      heroId,
      pos: coord,
      // A altura vem do TILE, nunca autorada à mão: é o mesmo que `move` faz no motor, e é
      // o que faz a vantagem posicional de §5.5 sair do terreno em vez de um número solto.
      height: tile.height,
      aiArchetype: existing?.aiArchetype ?? 'aggressive',
    };

    set({
      pvp: {
        ...pvp,
        error: null,
        defenseDraft: {
          ...draft,
          units: existing
            ? draft.units.map((u) => (u.heroId === heroId ? placed : u))
            : [...draft.units, placed],
          placingHeroId: null,
        },
      },
    });
  },

  removeDefenseUnit: (heroId) =>
    set((s) => ({
      pvp: {
        ...s.pvp,
        defenseDraft: { ...s.pvp.defenseDraft, units: s.pvp.defenseDraft.units.filter((u) => u.heroId !== heroId) },
      },
    })),

  setDefenseArchetype: (heroId, archetype) =>
    set((s) => ({
      pvp: {
        ...s.pvp,
        defenseDraft: {
          ...s.pvp.defenseDraft,
          units: s.pvp.defenseDraft.units.map((u) => (u.heroId === heroId ? { ...u, aiArchetype: archetype } : u)),
        },
      },
    })),

  saveDefense: async () => {
    const { pvp } = get();
    const draft = pvp.defenseDraft;
    if (draft.units.length === 0) {
      set({ pvp: { ...pvp, error: get().t('estado.posicioneUmHeroi') } });
      return;
    }
    set({ pvp: { ...pvp, busy: true, error: null, status: get().t('estado.salvandoDefesa') } });
    try {
      const saved = await api.saveDefense(pvp.token, draft.mapId, draft.units);
      set((s) => ({
        pvp: {
          ...s.pvp,
          savedDefense: saved,
          defenseDraft: { mapId: saved.mapId, units: saved.units, placingHeroId: null },
          busy: false,
          status: get().t('estado.defesaSalva', { herois: saved.units.length, mapa: saved.mapId }),
        },
      }));
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  togglePvpHero: (heroId) =>
    set((s) => {
      const selected = s.pvp.selectedHeroIds.includes(heroId)
        ? s.pvp.selectedHeroIds.filter((id) => id !== heroId)
        : [...s.pvp.selectedHeroIds, heroId];
      return { pvp: { ...s.pvp, selectedHeroIds: selected } };
    }),

  findPvpOpponent: async () => {
    // A arena é assíncrona: o jogador não enfrenta a pessoa, enfrenta a defesa que ela
    // deixou salva. Sem isso dito, "oponente" promete uma coisa que não acontece.
    get().dispararIntroducao('primeira-arena');
    const { pvp } = get();
    set({ pvp: { ...pvp, busy: true, error: null, status: get().t('estado.procurandoOponente') } });
    try {
      const opponent = await api.findOpponent(pvp.token);
      set((s) => ({
        pvp: { ...s.pvp, opponent, busy: false, status: get().t('estado.oponenteEncontrado', { nome: opponent.displayName, elo: opponent.elo }) },
      }));
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, opponent: null, error: describeApiError(error) } }));
    }
  },

  startPvpBattle: async () => {
    const { pvp } = get();
    if (!pvp.opponent) {
      set({ pvp: { ...pvp, error: get().t('estado.procureOponente') } });
      return;
    }
    set({ pvp: { ...pvp, busy: true, error: null, status: get().t('estado.pedindoTicket') } });
    try {
      // M36 4/N (D47) — abrir a PARTIDA VIVA contra a defesa do oponente. É aqui que o
      // esconder deixa de ser escolha e vira a única possibilidade: o time do defensor são
      // instâncias de herói de OUTRA conta, e nenhum catálogo do cliente as teria.
      const vista = await api.abrirPartidaDeArena(pvp.token, pvp.selectedHeroIds, pvp.opponent.playerId);
      get().assumirPartida(vista);
      set((s) => ({
        pvp: { ...s.pvp, outcome: null, busy: false, status: get().t('estado.batalhaEmAndamento') },
      }));
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // M36 4/N — `submitPvpBattle` FOI REMOVIDA. Não há submissão: o ELO e as marcas são pagos no
  // comando que fecha a batalha, e chegam em `liquidacao`. O pedido guardado do M22 sai junto —
  // o que ele protegia (cair depois de o servidor ter resolvido) deixou de poder acontecer,
  // porque não existe mais um instante em que tudo é resolvido de uma vez.

  // §11 — "Replay: reprodução passo a passo." O replay não é o gravado localmente (não há
  // gravação local desde M36 4/N): é o log que o SERVIDOR construiu, já redigido.
  reviewPvpBattle: async () => {
    const { pvp, partida } = get();
    if (!partida) return;
    set({ pvp: { ...pvp, busy: true, error: null, status: get().t('estado.buscandoReplay') } });
    try {
      const log = await api.logDoReplay(pvp.token, partida.nonce);
      set((s) => ({
        replayViewer: { log, step: 0, state: replayStateAt(log, 0), playing: false, speed: 1 },
        // M26 3/N — o replay também desenha peça. O mapa vem DERIVADO na leitura (o servidor
        // não o grava), então replays antigos ganham arte junto com os novos.
        artIdByUnitId: log.characterIdByUnitId,
        pvp: { ...s.pvp, busy: false, status: get().t('estado.replayCarregado') },
      }));
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  exitPvp: () => {
    set({
      mode: 'campaign',
      battleState: tabuleiroVazio(),
      heroesByUnitId: {},
      artIdByUnitId: {},
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      targetingMode: null,
      lastCommandReason: null,
      pvp: { ...get().pvp, ticket: null, outcome: null, status: null, error: null },
    });
  },

  // §10 — o estado de conta e a lista de masmorras vêm PRONTOS do servidor: quem decide se
  // uma masmorra está trancada, se há energia e se a varredura está liberada é ele (regra 3).
  refreshPve: async () => {
    const { pvp } = get();
    if (!pvp.token) {
      set((s) => ({ pve: { ...s.pve, error: get().t('estado.conecteAntes') } }));
      return;
    }
    set((s) => ({ pve: { ...s.pve, busy: true, error: null } }));
    try {
      const [economy, dungeons] = await Promise.all([api.economy(pvp.token), api.dungeons(pvp.token)]);
      set((s) => ({
        pve: {
          ...s.pve,
          economy,
          dungeons: dungeons.dungeons,
          // Time inteiro pré-selecionado, mesma escolha do PvP: escolher é decisão do
          // jogador, não pré-requisito para abrir a tela.
          selectedHeroIds: s.pve.selectedHeroIds.length > 0 ? s.pve.selectedHeroIds : s.pvp.roster.map((e) => e.hero.id),
          busy: false,
          status: null,
        },
      }));
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
    }
  },

  togglePveHero: (heroId) =>
    set((s) => ({
      pve: {
        ...s.pve,
        selectedHeroIds: s.pve.selectedHeroIds.includes(heroId)
          ? s.pve.selectedHeroIds.filter((id) => id !== heroId)
          : [...s.pve.selectedHeroIds, heroId],
      },
    })),

  // M36 4/N (D47) — entrar numa masmorra ABRE UMA PARTIDA VIVA. E entrar é o que CUSTA agora
  // (D48): a energia e a entrada são cobradas na abertura, não numa submissão que não existe
  // mais. Abandonar depois de entrar não devolve nada — é o que dá peso à decisão.
  enterDungeon: async (dungeonId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null, status: get().t('estado.pedindoTicketMasmorra') } });
    try {
      const vista = await api.abrirPartidaDeMasmorra(pvp.token, dungeonId, pve.selectedHeroIds);
      get().assumirPartida(vista);
      set((s) => ({
        pve: {
          ...s.pve,
          activeDungeonId: dungeonId,
          lastRun: null,
          busy: false,
          status: get().t('estado.masmorraEmAndamento'),
        },
      }));
      // A energia acabou de ser debitada: a tela tem de mostrar o saldo de verdade.
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // M36 4/N — `submitDungeonRun` FOI REMOVIDA, e com ela o pedido guardado do M22 para esta
  // rota. O que ele protegia — cair depois de o servidor ter debitado a energia e resolvido a
  // batalha — deixou de poder acontecer: não há um instante em que tudo é resolvido de uma vez,
  // e reconectar devolve a partida no ponto em que ela ficou.

  // Varredura: o servidor joga a batalha com a IA de mapa dos dois lados. Pode perder — e
  // quando perde, gasta a energia igual.
  sweepDungeon: async (dungeonId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null, status: get().t('estado.varrendo') } });
    try {
      const run = await api.sweepDungeon(pvp.token, dungeonId, pve.selectedHeroIds);
      set((s) => ({ pve: { ...s.pve, lastRun: run, busy: false, status: get().t('estado.varredura', { desfecho: nomeDoDesfecho(get().t, run.outcome) }) } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  exitDungeon: () => {
    const desistencia = get().desistirDaPartida();
    set((s) => ({
      mode: 'campaign',
      pve: { ...s.pve, activeDungeonId: null, status: null, error: null },
    }));
    return desistencia;
  },

  enhanceInventoryItem: async (itemId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null } });
    try {
      const result = await api.enhanceItem(pvp.token, itemId);
      set((s) => ({
        pve: {
          ...s.pve,
          busy: false,
          status: result.success
            ? `aprimorado para +${result.item.enhance}`
            : `falhou (custo cobrado: ${result.cost.gold} ouro, ${result.cost.stones} pedras)`,
        },
      }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
    }
  },

  equipInventoryItem: async (heroId, itemId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null } });
    try {
      await api.equipItem(pvp.token, heroId, itemId);
      set((s) => ({ pve: { ...s.pve, busy: false, status: get().t('estado.equipado') } }));
      // O roster do PvP guarda os itens equipados: recarrega para o poder na tela subir.
      const roster = await api.roster(pvp.token);
      set((s) => ({ pvp: { ...s.pvp, roster } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
    }
  },

  awakenHero: async (heroId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null } });
    try {
      const result = await api.awakenHero(pvp.token, heroId);
      set((s) => ({ pve: { ...s.pve, busy: false, status: get().t('estado.awakening', { nivel: result.hero.awakening }) } }));
      const roster = await api.roster(pvp.token);
      set((s) => ({ pvp: { ...s.pvp, roster } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
    }
  },

  usarTomos: async (heroId, materialId, quantidade) => {
    const { pvp } = get();
    // Quantidade inválida não vira requisição: a recusa é do servidor, mas o nonce não se queima.
    if (!pvp.token || !Number.isInteger(quantidade) || quantidade < 1) return;
    set((s) => ({ pve: { ...s.pve, busy: true, error: null } }));
    try {
      const result = await api.usarTomos(pvp.token, heroId, materialId, quantidade);
      set((s) => ({
        pve: { ...s.pve, busy: false, status: get().t('estado.tomosUsados', { nivel: result.hero.level }) },
      }));
      const roster = await api.roster(pvp.token);
      set((s) => ({ pvp: { ...s.pvp, roster } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
    }
  },

  imprintHero: async (heroId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null } });
    try {
      const result = await api.imprintHero(pvp.token, heroId);
      set((s) => ({ pve: { ...s.pve, busy: false, status: get().t('estado.imprint', { nivel: result.hero.imprint }) } }));
      const roster = await api.roster(pvp.token);
      set((s) => ({ pvp: { ...s.pvp, roster } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
    }
  },

  toggleInstantResultMode: () => set((s) => ({ instantResultMode: !s.instantResultMode })),

  // §1.1 (M23, 1/N) — cada conceito é explicado no ponto em que APARECE pela primeira vez.
  // Quem dispara é a tela que o mostra; quem decide se há algo a mostrar é `introducao.ts`.
  dispararIntroducao: (gatilho) => {
    const { introducaoAtual, introducoesVistas } = get();
    // Uma caixa por vez: duas ao mesmo tempo seria o paredão de texto que a milestone
    // existe para não ter, montado por acidente.
    if (introducaoAtual) return;

    const introducao = proximaIntroducao(gatilho, introducoesVistas);
    if (introducao) set({ introducaoAtual: introducao });
  },

  // §11/D24 (M25) — a troca de idioma. Ela grava a ESCOLHA (e não só o resolvido): é o que
  // faz a preferência sobreviver a abrir o jogo noutro navegador.
  definirIdioma: (idioma) => {
    set({ idioma, idiomaEscolhido: idioma, t: criarTradutor(idioma, CATALOGOS) });
  },

  // §11 (M24) — os dois controles de volume. Aplicados no motor NA HORA (o jogador precisa
  // ouvir o que está ajustando) e gravados no save pela mesma projeção de sempre.
  definirVolume: (categoria, valor) => {
    const limitado = Math.max(0, Math.min(1, valor));
    set(categoria === 'efeitos' ? { volumeEfeitos: limitado } : { volumeMusica: limitado });
    const { volumeEfeitos, volumeMusica } = get();
    definirVolumesDoJogo({ efeitos: volumeEfeitos, musica: volumeMusica });
  },

  // Fechar é o que marca como vista: enquanto ela estiver na tela, o jogador ainda não leu.
  fecharIntroducao: () => {
    const { introducaoAtual, introducoesVistas } = get();
    if (!introducaoAtual) return;
    set({
      introducaoAtual: null,
      introducoesVistas: marcarIntroducaoVista(introducoesVistas, introducaoAtual.gatilho),
    });
  },

  setBoardAnimating: (value) => set({ boardAnimating: value }),

  // A cena terminou (ou o jogador pulou). Fechá-la é o que LIBERA a narração do turno da IA:
  // o `MapCanvas` não anima nada enquanto ela está aberta, senão o inimigo se moveria atrás da
  // tela e o jogador voltaria para um tabuleiro diferente do que deixou.
  // M26 2/N — abrir a cena para UM duelo, a partir do estado de ANTES dele.
  //
  // **Quem chama é o `MapCanvas`, e num lugar só.** O duelo que o jogador confirmou e o que a
  // IA jogou chegam pelo MESMO relato desde M36 4/N (`aiTurnReport.meuDuelo` e
  // `aiTurnReport.steps`), e viram a mesma lista de cenas no tabuleiro — é ali que a decisão
  // cabe. Ligar a cena no envio do comando teria deixado a FASE INIMIGA sem tela, que é meia
  // funcionalidade: Fire Emblem e Unicorn Overlord mostram as duas.
  //
  // Devolve `false` quando não dá para montar a cena (uma das duas peças não está no estado de
  // antes). O chamador então anima no tabuleiro, como sempre fez — degradar é sempre um duelo
  // contado, nunca um silêncio.
  abrirCenaDeDuelo: (stateBefore, duelResult) => {
    const atacante = stateBefore.units.find((u) => u.unitId === duelResult.attackerId);
    const defensor = stateBefore.units.find((u) => u.unitId === duelResult.defenderId);
    if (!atacante || !defensor) return false;
    set({ duelScene: { atacante, defensor, duelResult } });
    return true;
  },

  fecharCenaDeDuelo: () => set({ duelScene: null }),

  setDuelSceneEnabled: (value) => set({ duelSceneEnabled: value }),

  toggleColorblindMode: () => set((s) => ({ colorblindMode: !s.colorblindMode })),

  // Escala fora da lista é ignorada em vez de aplicada: o mapa é canvas, e um valor
  // arbitrário viraria um tile fracionário.
  setUiScale: (scale) => {
    if (!isSupportedUiScale(scale)) return;
    set({ uiScale: scale });
  },

  // Sem isto um save concluído (ou de um roteiro de teste) vira armadilha: não haveria
  // como voltar ao capítulo 1 sem abrir o console do navegador. Apaga a chave e remonta a
  // campanha do zero — o token do PvP também sai, porque ele está no save. As preferências
  // de acessibilidade e o modo instantâneo NÃO saem: apagar progresso é sobre progresso, e
  // desligar o modo daltônico de quem precisa dele seria hostil.
  // M32 — o menu de opções. Fechar com a pergunta de apagar aberta é uma resposta: "não".
  // Reabrir não pode encontrar a pergunta ainda de pé, esperando um clique que o jogador
  // não sabe que está dando.
  abrirOpcoes: () => set({ opcoesAbertas: true }),
  alternarPausa: () => set((s) => ({ pausaAberta: !s.pausaAberta })),
  fecharPausa: () => set({ pausaAberta: false }),
  opcoesDaPausa: () => set({ pausaAberta: false, opcoesAbertas: true }),
  sairDaMissao: async () => {
    set({ pausaAberta: false });
    const { mode } = get();
    if (mode === 'campaign') await get().exitCampaign();
    else if (mode === 'dungeon') await get().exitDungeon();
    else {
      await get().desistirDaPartida();
      get().exitPvp();
    }
  },
  continuarParaProxima: async (missaoId) => {
    await get().sairDaMissao();
    // Direto na Campanha, com a próxima escolhida: a próxima pode ter outro número de vagas,
    // então quem vai se escolhe lá, com a prévia na frente.
    set({ abaDoHub: 'campanha' });
    get().selectChapter(missaoId);
  },
  voltarAoMenu: async () => {
    await get().sairDaMissao();
    get().voltarAoLobby();
  },
  recomecarMissao: async () => {
    const { mode, partida, campaign } = get();
    if (mode !== 'campaign' || !partida) return;
    const missaoId = partida.refId;
    set({ pausaAberta: false });
    // Os mesmos heróis que entraram: a seleção da campanha é o que `enterChapter` manda.
    const herois = campaign.selectedHeroIds;
    await get().desistirDaPartida();
    set((s) => ({ campaign: { ...s.campaign, selectedHeroIds: herois } }));
    await get().enterChapter(missaoId);
  },
  // M35 5/N — escolher abre a transição; a tela só troca em `concluirTransicao`. A introdução
  // de "primeiro summon" (que morava no botão Atualizar, morto na 1/N) dispara ao CHEGAR: é
  // quando moeda premium, banner e pity aparecem pela primeira vez — não por cima do véu.
  escolherAba: (aba) => set({ transicao: { para: aba } }),
  voltarAoLobby: () => set({ transicao: { para: 'lobby' } }),
  concluirTransicao: () => {
    const { transicao } = get();
    if (!transicao) return;
    set({ abaDoHub: transicao.para, transicao: null });
    if (transicao.para === 'invocacao') get().dispararIntroducao('primeiro-summon');
  },
  fecharOpcoes: () => set({ opcoesAbertas: false, apagarProgressoPendente: false }),
  pedirApagarProgresso: () => set({ apagarProgressoPendente: true }),
  cancelarApagarProgresso: () => set({ apagarProgressoPendente: false }),
  // Só age com a pergunta de pé: um confirmar que funciona sozinho é o botão de um clique de
  // antes, com outro nome. Fecha o menu junto — sem sessão a única tela é a entrada, e um
  // menu aberto por cima dela seria a primeira coisa vista depois de apagar tudo.
  confirmarApagarProgresso: () => {
    if (!get().apagarProgressoPendente) return;
    get().clearProgress();
    set({ apagarProgressoPendente: false, opcoesAbertas: false });
  },

  clearProgress: () => {
    clearSave(saveStorage);
    lastPersisted = null;
    set({
      battleState: tabuleiroVazio(),
      heroesByUnitId: {},
      artIdByUnitId: {},
      campaign: EMPTY_CAMPAIGN,
      summon: EMPTY_SUMMON,
      tacticsOverrides: {},
      equippedByUnit: {},
      talentAllocationByUnit: {},
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      targetingMode: null,
      lastCommandReason: null,
      lastTalentReason: null,
      mode: 'campaign',
      pvp: EMPTY_PVP,
    });
  },
}));

// A gravação é uma assinatura só, e não uma chamada dentro de cada ação: com quinze pontos
// que mexem no progresso (avançar capítulo, equipar, alocar, editar tática, token do PvP),
// espalhar "salvar" por todos eles garantiria esquecer um. A projeção é pequena, então
// comparar o JSON gravado é mais barato do que comparar campo a campo — e é exatamente o
// que decide se houve mudança digna de escrita.
// §11 (M24) — os volumes do save valem desde o primeiro som, e não só depois de o jogador
// mexer no controle. O motor ainda não existe neste ponto (ele nasce no primeiro som pedido,
// por causa da política de autoplay): o módulo guarda o valor e o aplica quando criar.
definirVolumesDoJogo({
  efeitos: useBattleStore.getState().volumeEfeitos,
  musica: useBattleStore.getState().volumeMusica,
});

// §11 (M24) — a TRANSIÇÃO DE TURNO, que é o único som que não sai de uma cena de batalha.
//
// Ela é assinada aqui, e não no `MapCanvas`, porque quem sabe que o round virou é o estado —
// o tabuleiro só desenha o que ele diz. Assinar no componente daria um som por montagem de
// componente, e não um por round.
let ultimoRound = useBattleStore.getState().battleState.round;
useBattleStore.subscribe((state) => {
  if (state.battleState.round === ultimoRound) return;
  ultimoRound = state.battleState.round;
  audioDoJogo().tocar('turno');
});

let lastPersisted: string | null = saveStorage ? serializeSave(saveProjection(useBattleStore.getState())) : null;

if (saveStorage) {
  useBattleStore.subscribe((state) => {
    const next = serializeSave(saveProjection(state));
    if (next === lastPersisted) return;
    lastPersisted = next;
    writeSave(saveStorage, saveProjection(state));
  });
}

// Gancho de DIAGNÓSTICO, só em dev. O cliente não tem suíte automatizada (`pnpm test` não
// cobre UI) e desde M9 a verificação é um roteiro real de navegador; sem um jeito de saltar
// para um capítulo, conferir os mapas maiores da campanha (16×16, 18×18, 20×15) exigiria
// vencer os anteriores clicando. Não é API de jogo: nada no app lê daqui, e o bloco não
// existe no build de produção.
if (import.meta.env.DEV) {
  (globalThis as unknown as Record<string, unknown>).__pathsBeyondStore = useBattleStore;
}
