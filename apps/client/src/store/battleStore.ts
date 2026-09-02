import {
  RULES_VERSION,
  applyCommandAndAdvance,
  buildInitialState,
  computeReachableTiles,
  openGateCoords,
  manhattanDistance,
  tileAt,
  resetFromRow,
  validateColumnAllocation,
  type AiTurnStep,
  type BattleCommand,
  type BattleState,
  type BattleUnit,
  type ClassDef,
  type Coord,
  type DuelResult,
  type GearSlot,
  type Id,
  type ItemInstance,
  type MapAiArchetype,
  type ReachableTile,
  type BattleSetup,
  type TacticsScript,
  type TalentAllocation,
  type ColumnTalentTree,
  type Replay,
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
  type ArenaDefenseUnit,
  type OpponentInfo,
  type PlayerInfo,
  type RosterEntry,
} from '../data/api.js';
import { narrateAiTurns } from '../data/aiNarration.js';
import { campaignMaps } from '../data/campaign.js';
import { catalog } from '../data/catalog.js';
import { DEFAULT_UI_SCALE, isSupportedUiScale } from '../data/overlayTheme.js';
import { readBuildCodeFor } from '../logic/buildCode.js';
import {
  browserSaveStorage,
  clearSave,
  loadSave,
  reconcileSave,
  serializeSave,
  writeSave,
  SAVE_FORMAT_VERSION,
  type SaveGame,
  type SaveStorage,
} from '../logic/save.js';


// Seed fixa pra esta fatia de M6 — o cliente ainda não tem tela de configuração de
// batalha; a semente real por partida é trabalho de uma fatia futura (persistência/save).
const BATTLE_SEED = 42;

// O `BattleSetup` do capítulo com os scripts táticos que o jogador editou na preparação
// aplicados POR CIMA. Existe por causa do replay: `Replay.initialState` é um setup, e
// reproduzir é `buildInitialState(setup) + comandos`. Se a edição de táticas vivesse só no
// `battleState` (como vivia desde M6), o replay reproduziria a batalha com o script
// ORIGINAL e mostraria duelos que não aconteceram. Editar reconstrói o estado do zero —
// legítimo porque a edição só é permitida antes do primeiro comando, quando não há nada a
// perder, e determinístico porque o dreno inicial de IA roda de novo igual.
function setupWithTactics(mapIndex: number, overrides: Readonly<Record<string, TacticsScript>>): BattleSetup {
  const content = campaignMaps[mapIndex];
  if (!content) throw new Error(`mapa de campanha ${mapIndex} não existe`);
  if (Object.keys(overrides).length === 0) return content.setup;

  return {
    ...content.setup,
    units: content.setup.units.map((unit) => {
      const script = overrides[unit.unitId];
      return script ? { ...unit, tacticsScript: script } : unit;
    }),
  };
}

function buildMapState(mapIndex: number, overrides: Readonly<Record<string, TacticsScript>> = {}): BattleState {
  return buildInitialState(setupWithTactics(mapIndex, overrides), BATTLE_SEED);
}

// A árvore de talentos de um herói vem da SUA classe real (`ClassDef.talentTree`,
// M5/M8) — diferente da árvore única de demonstração que M6 aplicava a toda unidade.
// `heroesByUnitId` (montado em `data/campaign.ts` ao resolver `Hero[]` →
// `buildBattleSetupFromHeroes`) é o único jeito de saber a classe de uma unidade, já
// que `BattleUnit` (core) não carrega `classId` — só o estado de batalha resolvido.
export function classDefForUnit(campaignMapIndex: number, unitId: string): ClassDef | undefined {
  const heroId = campaignMaps[campaignMapIndex]?.heroesByUnitId[unitId]?.classId;
  return heroId ? catalog.classes[heroId] : undefined;
}

// §11/§09-roadmap (M13, sub-sessão 3/N) — "progresso sobrevive a recarregar a página".
// O formato e as conversões estão em `logic/save.ts`; o que mora aqui é só a ponte entre
// o save e o store: o que sai dele na abertura e o que entra nele quando muda.
const saveStorage: SaveStorage | null = browserSaveStorage();

// §8.1/§8.2 (M17, 4/N) — a árvore de talentos de uma unidade vem do PERSONAGEM que ela é,
// não mais da classe dela. `heroesByUnitId` continua sendo o caminho porque `BattleUnit`
// (core) não carrega `characterId` — ele é estado de batalha resolvido, e quem é aquela
// pessoa é assunto do conteúdo que montou a batalha.
export function characterTreeForUnit(campaignMapIndex: number, unitId: string): ColumnTalentTree | undefined {
  const characterId = campaignMaps[campaignMapIndex]?.heroesByUnitId[unitId]?.characterId;
  return characterId ? catalog.characterTalentTrees[characterId] : undefined;
}

// O despertar do herói entra na validação porque `minAwakening` é gate de nó (§10, M14):
// sem ele a tela ofereceria um nó avançado que o motor recusaria depois.
function awakeningForUnit(campaignMapIndex: number, unitId: string): number {
  return campaignMaps[campaignMapIndex]?.heroesByUnitId[unitId]?.awakening ?? 0;
}

function allocationIsValidFor(campaignMapIndex: number, unitId: string, allocation: TalentAllocation): boolean {
  const tree = characterTreeForUnit(campaignMapIndex, unitId);
  // Unidade de outro capítulo: a árvore dela não é resolvível a partir do capítulo
  // corrente, então não há o que afirmar — a alocação fica como está.
  if (!tree) return true;
  return validateColumnAllocation({
    tree,
    allocation,
    awakening: awakeningForUnit(campaignMapIndex, unitId),
  }).valid;
}

function loadReconciledSave(storage: SaveStorage | null): SaveGame | null {
  const save = loadSave(storage);
  if (!save) return null;
  return reconcileSave(save, {
    rulesVersion: RULES_VERSION,
    chapterCount: campaignMaps.length,
    itemExists: (itemId) => catalog.items[itemId] !== undefined,
    allocationIsValid: (unitId, allocation) => allocationIsValidFor(save.campaignMapIndex, unitId, allocation),
  });
}

// A hidratação é SÍNCRONA, no boot do módulo: o catálogo já é síncrono (`data/catalog.ts`)
// e a batalha é remontada do setup, então não há estado de carregamento — sem isso a tela
// abriria no capítulo 1 e saltaria para o capítulo salvo um quadro depois.
const restoredSave = loadReconciledSave(saveStorage);

export function saveProjection(state: {
  readonly campaignMapIndex: number;
  readonly campaignComplete: boolean;
  readonly tacticsOverrides: Readonly<Record<string, TacticsScript>>;
  readonly equippedByUnit: Readonly<Record<string, Partial<Record<GearSlot, Id>>>>;
  readonly talentAllocationByUnit: Readonly<Record<string, TalentAllocation>>;
  readonly instantResultMode: boolean;
  readonly colorblindMode: boolean;
  readonly uiScale: number;
  readonly pvp: PvpSession;
}): SaveGame {
  return {
    v: SAVE_FORMAT_VERSION,
    rulesVersion: RULES_VERSION,
    campaignMapIndex: state.campaignMapIndex,
    campaignComplete: state.campaignComplete,
    tacticsOverrides: state.tacticsOverrides,
    equippedByUnit: state.equippedByUnit,
    talentAllocationByUnit: state.talentAllocationByUnit,
    instantResultMode: state.instantResultMode,
    colorblindMode: state.colorblindMode,
    uiScale: state.uiScale,
    pvpToken: state.pvp.token,
  };
}

// §11 — "Preview de duelo: rodar simulateDuel com a seed real ... Este é o recurso mais
// importante do jogo." `nextState` é o resultado de `applyCommandAndAdvance` já
// computado — confirmar só aplica esse mesmo objeto, nunca recalcula, então o que o
// jogador vê no preview é *literalmente* o que acontece ao confirmar (não uma segunda
// rodada que só deveria dar o mesmo resultado).
export interface DuelPreview {
  readonly nextState: BattleState;
  readonly duelResult: DuelResult;
  // O comando que gerou este preview. Só entra na gravação quando o jogador CONFIRMA:
  // cancelar um preview não aconteceu na batalha e não pode aparecer no replay.
  readonly command: BattleCommand;
  // M16 4/N — o turno da IA que veio DEPOIS deste engate. Vive no preview pelo mesmo motivo
  // que `nextState`: confirmar aplica o objeto já computado e nunca recalcula, então o relato
  // tem de viajar junto — recomputá-lo no confirm seria uma segunda rodada que só deveria dar
  // o mesmo resultado. Cancelar descarta os dois.
  readonly aiSteps: readonly AiTurnStep[];
}

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

// §11 — "Replay: reprodução passo a passo com controle de velocidade a partir do
// `Replay`." O estado do passo corrente é RECOMPUTADO do início a cada busca, em vez de
// guardado em snapshots: só é legítimo porque o core é determinístico (mesma seed + mesmos
// comandos = mesmo estado), e é o que garante que rebobinar mostre exatamente o que a ida
// mostrou. Um cache de snapshots poderia divergir em silêncio.
export interface ReplayViewer {
  readonly replay: Replay;
  readonly step: number; // 0 = antes do primeiro comando
  readonly state: BattleState;
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

interface BattleStore {
  readonly battleState: BattleState;
  readonly selectedUnitId: string | null;
  readonly reachableTiles: readonly ReachableTile[];
  readonly duelPreview: DuelPreview | null;
  readonly lastCommandReason: string | null;
  readonly campaignMapIndex: number;
  readonly campaignComplete: boolean;
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
  // M16 4/N — o turno que a IA jogou depois do último comando aceito, esperando para ser
  // contado no tabuleiro. Guarda o ESTADO junto do relato de propósito: quem consome só age
  // quando `state === battleState`, e é isso que impede um relato velho de ser animado em cima
  // de outra batalha. Trocar de capítulo, entrar numa masmorra ou abrir um replay troca o
  // `battleState`, e o relato pendente deixa de casar sozinho — sem precisar de um `reset` em
  // cada um dos nove pontos que começam batalha, que é o tipo de lista que se esquece de
  // atualizar. Não é regra e não vai para o save.
  readonly aiTurnReport: { readonly state: BattleState; readonly steps: readonly AiTurnStep[] } | null;
  // §11 (acessibilidade) — "modo daltônico nos overlays" e "fonte escalável". Só
  // apresentação: nenhum dos dois muda uma decisão do core (regra 3). A paleta e os
  // padrões moram em `data/overlayTheme.ts`; a escala vale para o HTML (todo o CSS já é
  // `rem`) e para o mapa, que cresce junto.
  readonly colorblindMode: boolean;
  readonly uiScale: number;
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

  selectUnit: (unitId: string | null) => void;
  moveSelectedUnitTo: (destination: Coord) => void;
  waitSelectedUnit: () => void;
  restSelectedUnit: () => void;
  previewEngage: (targetId: string) => void;
  confirmEngage: () => void;
  cancelEngage: () => void;
  advanceToNextMap: () => void;
  retryCurrentMap: () => void;
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
  toggleInstantResultMode: () => void;
  setBoardAnimating: (value: boolean) => void;
  toggleColorblindMode: () => void;
  setUiScale: (scale: number) => void;
  clearProgress: () => void;
  buildReplay: () => Replay;
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
  submitPvpBattle: () => Promise<void>;
  reviewPvpBattle: () => Promise<void>;
  exitPvp: () => void;
  refreshPve: () => Promise<void>;
  togglePveHero: (heroId: string) => void;
  enterDungeon: (dungeonId: string) => Promise<void>;
  submitDungeonRun: () => Promise<void>;
  sweepDungeon: (dungeonId: string) => Promise<void>;
  exitDungeon: () => void;
  enhanceInventoryItem: (itemId: string) => Promise<void>;
  equipInventoryItem: (heroId: string, itemId: string) => Promise<void>;
  awakenHero: (heroId: string) => Promise<void>;
  imprintHero: (heroId: string) => Promise<void>;
  openReplayViewer: () => void;
  closeReplayViewer: () => void;
  seekReplay: (step: number) => void;
  setReplaySpeed: (speed: number) => void;
  toggleReplayPlaying: () => void;
  beginMapSkillTargeting: (skillId: Id) => void;
  beginValorTargeting: (skillId: Id) => void;
  cancelTargeting: () => void;
  confirmTargetAt: (target: Coord) => void;
}

function computeReachableForUnit(battleState: BattleState, unit: BattleUnit): readonly ReachableTile[] {
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
      openGates: openGateCoords(battleState),
    },
    unit.pos,
    remainingRange,
  );
}

// Tiles dentro de `radius` em distância Manhattan (§5.1) que existem no grid. O core faz
// a mesma conta; aqui é só pra desenhar o overlay.
function tilesWithin(battleState: BattleState, center: Coord, radius: number): readonly Coord[] {
  const tiles: Coord[] = [];
  for (let y = 0; y < battleState.map.height; y++) {
    for (let x = 0; x < battleState.map.width; x++) {
      if (manhattanDistance(center, { x, y }) <= radius) tiles.push({ x, y });
    }
  }
  return tiles;
}

function allTiles(battleState: BattleState): readonly Coord[] {
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
  state: BattleState,
  steps: readonly AiTurnStep[],
  instantResultMode: boolean,
): { aiTurnReport: { state: BattleState; steps: readonly AiTurnStep[] }; boardAnimating?: true } {
  // O MESMO predicado que o canvas usa para decidir se roda a cadeia. Se os dois discordassem,
  // a trava poderia subir sem que ninguém a baixasse e o desfecho nunca apareceria.
  const anima = !instantResultMode && narrateAiTurns(steps).length > 0;
  return { aiTurnReport: { state, steps }, ...(anima ? { boardAnimating: true as const } : {}) };
}

// Recomputa o estado do passo N do zero. Determinismo do core é o que torna isso correto
// e barato o bastante: mesma seed + mesmo prefixo de comandos = mesmo estado, sempre.
function replayStateAt(replay: Replay, step: number): BattleState {
  let state = buildInitialState(replay.initialState, replay.seed);
  for (const command of replay.commands.slice(0, step)) {
    if (state.outcome !== 'ongoing') break;
    state = applyCommandAndAdvance(state, command).state;
  }
  return state;
}

function describeApiError(error: unknown): string {
  if (error instanceof ApiError) return `${error.status}: ${error.message}`;
  // Rede caída, servidor fora do ar: o cliente tem que dizer isso em vez de travar.
  return error instanceof Error ? error.message : 'erro desconhecido';
}

export const useBattleStore = create<BattleStore>((set, get) => ({
  // O capítulo salvo é remontado do setup — a batalha em si não é persistida (decisão do
  // usuário): recarregar no meio de um capítulo recomeça o capítulo, com as táticas
  // preparadas de pé.
  battleState: buildMapState(restoredSave?.campaignMapIndex ?? 0, restoredSave?.tacticsOverrides ?? {}),
  selectedUnitId: null,
  reachableTiles: [],
  duelPreview: null,
  lastCommandReason: null,
  campaignMapIndex: restoredSave?.campaignMapIndex ?? 0,
  campaignComplete: restoredSave?.campaignComplete ?? false,
  tacticsEditorUnitId: null,
  inventory: Object.values(catalog.items),
  equippedByUnit: restoredSave?.equippedByUnit ?? {},
  inventoryUnitId: null,
  talentAllocationByUnit: restoredSave?.talentAllocationByUnit ?? {},
  talentEditorUnitId: null,
  lastTalentReason: null,
  instantResultMode: restoredSave?.instantResultMode ?? false,
  boardAnimating: false,
  aiTurnReport: null,
  colorblindMode: restoredSave?.colorblindMode ?? false,
  uiScale: restoredSave?.uiScale ?? DEFAULT_UI_SCALE,
  targetingMode: null,
  commandLog: [],
  replayViewer: null,
  tacticsOverrides: restoredSave?.tacticsOverrides ?? {},
  mode: 'campaign',
  pvp: { ...EMPTY_PVP, token: restoredSave?.pvpToken ?? '' },
  pve: EMPTY_PVE,

  selectUnit: (unitId) => {
    if (!unitId) {
      set({ selectedUnitId: null, reachableTiles: [] });
      return;
    }
    const { battleState } = get();
    const unit = battleState.units.find((u) => u.unitId === unitId);
    if (!unit) return;
    set({ selectedUnitId: unitId, reachableTiles: computeReachableForUnit(battleState, unit), lastCommandReason: null });
  },

  moveSelectedUnitTo: (destination) => {
    const { battleState, selectedUnitId, reachableTiles } = get();
    if (!selectedUnitId) return;

    const target = reachableTiles.find((tile) => tile.coord.x === destination.x && tile.coord.y === destination.y);
    if (!target) return; // clicou fora do overlay de alcance — ignora, não monta comando inválido de propósito

    const result = applyCommandAndAdvance(battleState, { t: 'move', unitId: selectedUnitId, path: target.path });
    if (!result.applied) {
      set({ lastCommandReason: result.reason ?? 'movimento inválido' });
      return;
    }

    const movedUnit = result.state.units.find((u) => u.unitId === selectedUnitId);
    set({
      commandLog: [...get().commandLog, { t: 'move', unitId: selectedUnitId, path: target.path }],
      battleState: result.state,
      reachableTiles: movedUnit ? computeReachableForUnit(result.state, movedUnit) : [],
      lastCommandReason: null,
      ...relatoDaIa(result.state, result.aiSteps, get().instantResultMode),
    });
  },

  waitSelectedUnit: () => {
    const { battleState, selectedUnitId } = get();
    if (!selectedUnitId) return;
    const command: BattleCommand = { t: 'wait', unitId: selectedUnitId };
    const result = applyCommandAndAdvance(battleState, command);
    if (!result.applied) {
      set({ lastCommandReason: result.reason ?? 'comando inválido' });
      return;
    }
    set({
      commandLog: [...get().commandLog, command],
      battleState: result.state,
      selectedUnitId: null,
      reachableTiles: [],
      lastCommandReason: null,
      ...relatoDaIa(result.state, result.aiSteps, get().instantResultMode),
    });
  },

  restSelectedUnit: () => {
    const { battleState, selectedUnitId } = get();
    if (!selectedUnitId) return;
    const command: BattleCommand = { t: 'rest', unitId: selectedUnitId };
    const result = applyCommandAndAdvance(battleState, command);
    if (!result.applied) {
      set({ lastCommandReason: result.reason ?? 'comando inválido' });
      return;
    }
    set({
      commandLog: [...get().commandLog, command],
      battleState: result.state,
      selectedUnitId: null,
      reachableTiles: [],
      lastCommandReason: null,
      ...relatoDaIa(result.state, result.aiSteps, get().instantResultMode),
    });
  },

  previewEngage: (targetId) => {
    const { battleState, selectedUnitId } = get();
    if (!selectedUnitId) return;

    const command: BattleCommand = { t: 'engage', unitId: selectedUnitId, targetId };
    const result = applyCommandAndAdvance(battleState, command);
    if (!result.applied || !result.duelResult) {
      set({ lastCommandReason: result.reason ?? 'não foi possível engajar' });
      return;
    }

    set({
      duelPreview: { nextState: result.state, duelResult: result.duelResult, command, aiSteps: result.aiSteps },
      lastCommandReason: null,
    });
  },

  confirmEngage: () => {
    const { duelPreview } = get();
    if (!duelPreview) return;
    set({
      commandLog: [...get().commandLog, duelPreview.command],
      battleState: duelPreview.nextState,
      duelPreview: null,
      selectedUnitId: null,
      reachableTiles: [],
      lastCommandReason: null,
      ...relatoDaIa(duelPreview.nextState, duelPreview.aiSteps, get().instantResultMode),
    });
  },

  cancelEngage: () => {
    set({ duelPreview: null });
  },

  // §09-roadmap.md (M6) — "campanha de 3 mapas jogável ponta a ponta". Sem persistência
  // entre mapas ainda (decisão desta fatia, ver DECISIONS.md): cada mapa novo é montado
  // do zero via `buildMapState`, o herói do jogador não carrega HP/AP/PP do mapa anterior.
  advanceToNextMap: () => {
    const { campaignMapIndex } = get();
    const nextIndex = campaignMapIndex + 1;
    if (nextIndex >= campaignMaps.length) {
      set({ campaignComplete: true });
      return;
    }
    set({
      campaignMapIndex: nextIndex,
      battleState: buildMapState(nextIndex),
      commandLog: [],
      tacticsOverrides: {},
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      duelPreview: null,
      lastCommandReason: null,
    });
  },

  retryCurrentMap: () => {
    const { campaignMapIndex } = get();
    set({
      // Reiniciar preserva os overrides: o jogador ajustou o script justamente porque
      // perdeu, e obrigá-lo a reconfigurar tudo a cada tentativa seria hostil.
      battleState: buildMapState(campaignMapIndex, get().tacticsOverrides),
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      duelPreview: null,
      lastCommandReason: null,
    });
  },

  // §11 — "Editor de táticas: Drag & drop das linhas, condições em dropdown, e botão
  // 'Testar'." Editar o script não é uma ação de batalha (não existe BattleCommand pra
  // isso — configurar táticas é trabalho de fora do combate no jogo real), então isso
  // atualiza a unidade direto no battleState em vez de passar por applyCommandAndAdvance.
  openTacticsEditor: (unitId) => set({ tacticsEditorUnitId: unitId }),
  closeTacticsEditor: () => set({ tacticsEditorUnitId: null }),

  // M13, sub-sessão 1/N — a edição fica travada depois do primeiro comando do mapa
  // (decisão do usuário). O script não é um `BattleCommand` — M6 o tratou como
  // configuração de fora do combate, e §11 o descreve como ferramenta de preparação
  // ("Testar contra um manequim configurável"). Só que um `Replay` reaplica o setup
  // inicial mais os comandos: um script trocado no meio da batalha não estaria em nenhum
  // dos dois, e a reprodução mostraria uma batalha que não aconteceu. A janela de edição é
  // a preparação do capítulo, antes de qualquer unidade agir.
  updateUnitTacticsScript: (unitId, script) => {
    const { commandLog, campaignMapIndex, tacticsOverrides } = get();
    if (commandLog.length > 0) {
      set({ lastCommandReason: 'táticas só podem ser editadas antes do primeiro comando do mapa' });
      return;
    }

    // Não basta trocar o script no `battleState`: o replay parte do SETUP, então o
    // override entra no setup e a batalha é remontada com ele.
    const overrides = { ...tacticsOverrides, [unitId]: script };
    set({
      tacticsOverrides: overrides,
      battleState: buildMapState(campaignMapIndex, overrides),
      selectedUnitId: null,
      reachableTiles: [],
      lastCommandReason: null,
    });
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
    const { talentAllocationByUnit, campaignMapIndex } = get();
    const tree = characterTreeForUnit(campaignMapIndex, unitId);
    if (!tree) {
      set({ lastTalentReason: 'esta unidade não é um personagem do elenco' });
      return;
    }
    const current = talentAllocationByUnit[unitId] ?? {};
    const nextAllocation: TalentAllocation = { ...current, [nodeId]: (current[nodeId] ?? 0) + 1 };
    const result = validateColumnAllocation({
      tree,
      allocation: nextAllocation,
      awakening: awakeningForUnit(campaignMapIndex, unitId),
    });
    if (!result.valid) {
      set({ lastTalentReason: result.issues[0]?.reason ?? 'alocação inválida' });
      return;
    }
    set({
      talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: nextAllocation },
      lastTalentReason: null,
    });
  },

  deallocateTalent: (unitId, nodeId) => {
    const { talentAllocationByUnit, campaignMapIndex } = get();
    const tree = characterTreeForUnit(campaignMapIndex, unitId);
    if (!tree) return;
    const current = talentAllocationByUnit[unitId] ?? {};
    const currentRank = current[nodeId] ?? 0;
    if (currentRank <= 0) return;

    const nextAllocation: TalentAllocation = { ...current, [nodeId]: currentRank - 1 };
    const result = validateColumnAllocation({
      tree,
      allocation: nextAllocation,
      awakening: awakeningForUnit(campaignMapIndex, unitId),
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
  },

  resetTalentTree: (unitId, fromRow) => {
    const { talentAllocationByUnit, campaignMapIndex } = get();
    const tree = characterTreeForUnit(campaignMapIndex, unitId);
    if (!tree) return;
    const next = resetFromRow(tree, talentAllocationByUnit[unitId] ?? {}, fromRow);
    set({ talentAllocationByUnit: { ...talentAllocationByUnit, [unitId]: next }, lastTalentReason: null });
  },

  loadBuildCode: (unitId, code) => {
    const { campaignMapIndex } = get();
    const tree = characterTreeForUnit(campaignMapIndex, unitId);
    if (!tree) {
      set({ lastTalentReason: 'esta unidade não é um personagem do elenco' });
      return;
    }
    const lido = readBuildCodeFor(
      tree.characterId,
      tree,
      code,
      awakeningForUnit(campaignMapIndex, unitId),
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
  },

  // §11 (acessibilidade) — "modo resultado instantâneo (pula animações) — essencial pra
  // farm." Só afeta apresentação (MapCanvas/DuelPreviewPanel); o estado do core nunca
  // muda de forma diferente com o modo ligado ou desligado.
  // §5.4 — o alcance de LANÇAMENTO é `skill.duelRange` quando declarado, senão o da
  // unidade; a mesma leitura que `applyMapSkill` faz no core. O cliente recalcula pra
  // desenhar o overlay, mas quem valida continua sendo o core: clicar fora do overlay não
  // monta comando, e um comando inválido que escape é rejeitado por
  // `applyCommandAndAdvance` com o motivo aparecendo na barra de ações.
  // §3.4 — `Replay {rulesVersion, seed, initialState, commands}`. O `initialState` é o
  // `BattleSetup` do capítulo, não um snapshot do meio da batalha: reproduzir é sempre
  // partir do começo e reaplicar.
  buildReplay: () => {
    const { campaignMapIndex, commandLog, tacticsOverrides, mode, pvp } = get();
    // Em PvP o setup e a seed são os do ticket — do servidor, não do catálogo local.
    if (mode === 'pvp' && pvp.ticket) {
      return {
        rulesVersion: pvp.ticket.rulesVersion,
        seed: pvp.ticket.seed,
        initialState: pvp.ticket.setup,
        commands: commandLog,
      };
    }
    return {
      rulesVersion: RULES_VERSION,
      seed: BATTLE_SEED,
      initialState: setupWithTactics(campaignMapIndex, tacticsOverrides),
      commands: commandLog,
    };
  },

  openReplayViewer: () => {
    const replay = get().buildReplay();
    set({
      replayViewer: { replay, step: 0, state: replayStateAt(replay, 0), playing: false, speed: 1 },
      duelPreview: null,
      targetingMode: null,
    });
  },

  closeReplayViewer: () => set({ replayViewer: null }),

  seekReplay: (step) => {
    const { replayViewer } = get();
    if (!replayViewer) return;
    const clamped = Math.max(0, Math.min(replayViewer.replay.commands.length, step));
    set({
      replayViewer: {
        ...replayViewer,
        step: clamped,
        state: replayStateAt(replayViewer.replay, clamped),
        // Chegou ao fim: para sozinho, senão o timer segue disparando à toa.
        playing: clamped < replayViewer.replay.commands.length ? replayViewer.playing : false,
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
    const atEnd = replayViewer.step >= replayViewer.replay.commands.length;
    set({
      replayViewer: {
        ...replayViewer,
        playing: !replayViewer.playing,
        ...(atEnd && !replayViewer.playing ? { step: 0, state: replayStateAt(replayViewer.replay, 0) } : {}),
      },
    });
  },

  beginMapSkillTargeting: (skillId) => {
    const { battleState, selectedUnitId } = get();
    const unit = battleState.units.find((u) => u.unitId === selectedUnitId);
    if (!unit) return;

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
      duelPreview: null,
      lastCommandReason: null,
    });
  },

  // §5.6 — "artilharia DE MAPA": Valor não sai de unidade nenhuma e a spec não dá limite
  // de alcance, então todo tile do grid é alvo legal (decisão registrada em M11 3/N).
  beginValorTargeting: (skillId) => {
    const { battleState } = get();
    const skill = battleState.valorSkills?.[skillId];
    if (!skill) return;

    set({
      targetingMode: {
        kind: 'valor',
        skillId,
        casterUnitId: null,
        areaRadius: skill.kind === 'artillery' ? skill.payload.radius : 0,
        tiles: allTiles(battleState),
      },
      duelPreview: null,
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

    const result = applyCommandAndAdvance(battleState, command);
    if (!result.applied) {
      set({ lastCommandReason: result.reason ?? 'alvo inválido', targetingMode: null });
      return;
    }

    // Valor não consome o turno de ninguém (§5.6), então a unidade selecionada continua
    // selecionada e com o alcance de movimento recomputado; uma skill de mapa encerra o
    // turno de quem lançou.
    const caster = result.state.units.find((u) => u.unitId === get().selectedUnitId);
    set({
      commandLog: [...get().commandLog, command],
      battleState: result.state,
      targetingMode: null,
      lastCommandReason: null,
      ...relatoDaIa(result.state, result.aiSteps, get().instantResultMode),
      ...(targetingMode.kind === 'valor'
        ? { reachableTiles: caster ? computeReachableForUnit(result.state, caster) : [] }
        : { selectedUnitId: null, reachableTiles: [] }),
    });
  },

  setPvpToken: (token) => set((s) => ({ pvp: { ...s.pvp, token, error: null } })),

  connectPvp: async () => {
    const { pvp } = get();
    if (!pvp.token) {
      set({ pvp: { ...pvp, error: 'informe o token do jogador' } });
      return;
    }
    set({ pvp: { ...pvp, busy: true, error: null, status: 'conectando…' } });
    try {
      const [me, roster] = await Promise.all([api.me(pvp.token), api.roster(pvp.token)]);
      set((s) => ({
        pvp: {
          ...s.pvp,
          me,
          roster,
          // Time inteiro pré-selecionado: o servidor aceita de 1 a 5 heróis, e escolher é
          // decisão do jogador, não pré-requisito pra começar.
          selectedHeroIds: roster.map((entry) => entry.hero.id),
          busy: false,
          status: `conectado como ${me.displayName}`,
        },
      }));
      // A defesa vem junto do login: o jogador precisa ver o que está defendendo por ele
      // ANTES de decidir atacar alguém. Erro aqui não derruba a conexão — `loadDefense`
      // trata o 404 como estado normal e o resto vira mensagem na própria tela.
      await get().loadDefense();
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // O servidor é a fonte da verdade da defesa: a tela SEMPRE relê o que está lá antes de
  // mostrar qualquer coisa. 404 é o estado normal de quem nunca montou — vira rascunho
  // vazio, não erro na tela.
  loadDefense: async () => {
    const { pvp } = get();
    if (!pvp.token) return;
    set({ pvp: { ...pvp, busy: true, error: null, status: 'lendo a defesa salva…' } });
    try {
      const defense = await api.defense(pvp.token);
      set((s) => ({
        pvp: {
          ...s.pvp,
          savedDefense: defense,
          defenseDraft: { mapId: defense.mapId, units: defense.units, placingHeroId: null },
          busy: false,
          status: 'defesa carregada do servidor',
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
            status: 'você ainda não tem defesa montada',
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
      set({ pvp: { ...pvp, error: 'muro e portão não são posição de defesa' } });
      return;
    }
    if (grid && grid.terrains[tile.terrain]?.moveCost.foot === 'impassable') {
      set({ pvp: { ...pvp, error: 'terreno intransponível não é posição de defesa' } });
      return;
    }
    if (draft.units.some((u) => u.heroId !== heroId && u.pos.x === coord.x && u.pos.y === coord.y)) {
      set({ pvp: { ...pvp, error: '1 herói = 1 tile: já tem alguém aí' } });
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
      set({ pvp: { ...pvp, error: 'posicione ao menos um herói' } });
      return;
    }
    set({ pvp: { ...pvp, busy: true, error: null, status: 'salvando a defesa…' } });
    try {
      const saved = await api.saveDefense(pvp.token, draft.mapId, draft.units);
      set((s) => ({
        pvp: {
          ...s.pvp,
          savedDefense: saved,
          defenseDraft: { mapId: saved.mapId, units: saved.units, placingHeroId: null },
          busy: false,
          status: `defesa salva: ${saved.units.length} herói(s) em ${saved.mapId}`,
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
    const { pvp } = get();
    set({ pvp: { ...pvp, busy: true, error: null, status: 'procurando oponente…' } });
    try {
      const opponent = await api.findOpponent(pvp.token);
      set((s) => ({
        pvp: { ...s.pvp, opponent, busy: false, status: `oponente: ${opponent.displayName} (ELO ${opponent.elo})` },
      }));
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, opponent: null, error: describeApiError(error) } }));
    }
  },

  startPvpBattle: async () => {
    const { pvp } = get();
    if (!pvp.opponent) {
      set({ pvp: { ...pvp, error: 'procure um oponente primeiro' } });
      return;
    }
    set({ pvp: { ...pvp, busy: true, error: null, status: 'pedindo ticket de batalha…' } });
    try {
      const ticket = await api.requestTicket(pvp.token, pvp.selectedHeroIds, pvp.opponent.playerId);
      // A batalha é montada com o setup e a SEED do servidor: o que o jogador vê aqui é
      // exatamente o que o servidor vai resolver quando os comandos chegarem.
      set({
        mode: 'pvp',
        battleState: buildInitialState(ticket.setup, ticket.seed),
        commandLog: [],
        replayViewer: null,
        selectedUnitId: null,
        reachableTiles: [],
        duelPreview: null,
        targetingMode: null,
        lastCommandReason: null,
        pvp: { ...pvp, ticket, outcome: null, busy: false, status: 'batalha em andamento' },
      });
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  submitPvpBattle: async () => {
    const { pvp, commandLog } = get();
    if (!pvp.ticket || !pvp.opponent) return;
    set({ pvp: { ...pvp, busy: true, error: null, status: 'enviando comandos…' } });
    try {
      const outcome = await api.submitBattle(pvp.token, {
        attackerHeroIds: pvp.selectedHeroIds,
        defenderPlayerId: pvp.opponent.playerId,
        commands: commandLog,
        rulesVersion: pvp.ticket.rulesVersion,
        nonce: pvp.ticket.nonce,
      });
      set((s) => ({
        pvp: { ...s.pvp, outcome, busy: false, status: `servidor resolveu: ${outcome.result.outcome}` },
      }));
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // §11 — "Replay: reprodução passo a passo." Aqui o replay não é o gravado localmente: é
  // o que o SERVIDOR persistiu, buscado de volta. É o que fecha "revista pelo cliente".
  reviewPvpBattle: async () => {
    const { pvp } = get();
    if (!pvp.ticket) return;
    set({ pvp: { ...pvp, busy: true, error: null, status: 'buscando replay do servidor…' } });
    try {
      const stored = await api.fetchReplay(pvp.token, pvp.ticket.nonce);
      const replay: Replay = {
        rulesVersion: stored.rulesVersion,
        seed: stored.seed,
        initialState: stored.initialState,
        commands: stored.commands,
      };
      set((s) => ({
        replayViewer: { replay, step: 0, state: replayStateAt(replay, 0), playing: false, speed: 1 },
        pvp: { ...s.pvp, busy: false, status: 'replay do servidor carregado' },
      }));
    } catch (error) {
      set((s) => ({ pvp: { ...s.pvp, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  exitPvp: () => {
    const { campaignMapIndex, tacticsOverrides } = get();
    set({
      mode: 'campaign',
      battleState: buildMapState(campaignMapIndex, tacticsOverrides),
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      duelPreview: null,
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
      set((s) => ({ pve: { ...s.pve, error: 'conecte-se com um token antes' } }));
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

  // Entrar = pedir o ticket e montar a batalha com a SEED do servidor, exatamente como o
  // PvP de M13 2/N. O jogador joga por cliques no mapa; nada aqui simula por conta própria.
  enterDungeon: async (dungeonId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null, status: 'pedindo ticket…' } });
    try {
      const ticket = await api.requestDungeonTicket(pvp.token, dungeonId, pve.selectedHeroIds);
      set({
        mode: 'dungeon',
        battleState: buildInitialState(ticket.setup, ticket.seed),
        commandLog: [],
        replayViewer: null,
        selectedUnitId: null,
        reachableTiles: [],
        duelPreview: null,
        targetingMode: null,
        lastCommandReason: null,
        pve: { ...pve, ticket, activeDungeonId: dungeonId, lastRun: null, busy: false, status: 'masmorra em andamento' },
      });
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  submitDungeonRun: async () => {
    const { pvp, pve, commandLog } = get();
    if (!pve.ticket || !pve.activeDungeonId) return;
    set({ pve: { ...pve, busy: true, error: null, status: 'enviando comandos…' } });
    try {
      const run = await api.submitDungeonRun(pvp.token, pve.activeDungeonId, {
        nonce: pve.ticket.nonce,
        heroIds: pve.selectedHeroIds,
        commands: commandLog,
      });
      // A run acabou: o `battleState` da masmorra não vale mais nada, e ficar nele deixaria
      // o painel preso na visão de batalha — sem lista de masmorras e sem inventário, que é
      // justamente o próximo passo do ciclo (achado da verificação em navegador).
      const { campaignMapIndex, tacticsOverrides } = get();
      set((s) => ({
        mode: 'campaign',
        battleState: buildMapState(campaignMapIndex, tacticsOverrides),
        commandLog: [],
        selectedUnitId: null,
        reachableTiles: [],
        duelPreview: null,
        targetingMode: null,
        pve: {
          ...s.pve,
          lastRun: run,
          ticket: null,
          activeDungeonId: null,
          busy: false,
          status: `servidor resolveu: ${run.outcome}`,
        },
      }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  // Varredura: o servidor joga a batalha com a IA de mapa dos dois lados. Pode perder — e
  // quando perde, gasta a energia igual.
  sweepDungeon: async (dungeonId) => {
    const { pvp, pve } = get();
    set({ pve: { ...pve, busy: true, error: null, status: 'varrendo…' } });
    try {
      const run = await api.sweepDungeon(pvp.token, dungeonId, pve.selectedHeroIds);
      set((s) => ({ pve: { ...s.pve, lastRun: run, busy: false, status: `varredura: ${run.outcome}` } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, status: null, error: describeApiError(error) } }));
    }
  },

  exitDungeon: () => {
    const { campaignMapIndex, tacticsOverrides } = get();
    set((s) => ({
      mode: 'campaign',
      battleState: buildMapState(campaignMapIndex, tacticsOverrides),
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      duelPreview: null,
      targetingMode: null,
      lastCommandReason: null,
      pve: { ...s.pve, ticket: null, activeDungeonId: null, status: null, error: null },
    }));
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
      set((s) => ({ pve: { ...s.pve, busy: false, status: 'equipado' } }));
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
      set((s) => ({ pve: { ...s.pve, busy: false, status: `awakening ${result.hero.awakening}` } }));
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
      set((s) => ({ pve: { ...s.pve, busy: false, status: `imprint ${result.hero.imprint}` } }));
      const roster = await api.roster(pvp.token);
      set((s) => ({ pvp: { ...s.pvp, roster } }));
      await get().refreshPve();
    } catch (error) {
      set((s) => ({ pve: { ...s.pve, busy: false, error: describeApiError(error) } }));
    }
  },

  toggleInstantResultMode: () => set((s) => ({ instantResultMode: !s.instantResultMode })),
  setBoardAnimating: (value) => set({ boardAnimating: value }),

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
  clearProgress: () => {
    clearSave(saveStorage);
    lastPersisted = null;
    set({
      campaignMapIndex: 0,
      campaignComplete: false,
      battleState: buildMapState(0),
      tacticsOverrides: {},
      equippedByUnit: {},
      talentAllocationByUnit: {},
      commandLog: [],
      replayViewer: null,
      selectedUnitId: null,
      reachableTiles: [],
      duelPreview: null,
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
