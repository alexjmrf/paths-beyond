import type { Condition, GearSlot, Id, TacticsScript, TalentAllocation, UnitType, WeaponType } from '@paths-beyond/core';
import { GEAR_SLOTS } from '../data/gearSlots.js';
import { UNIT_TYPES, WEAPON_TYPES } from '../data/conditionSpecs.js';
import { DEFAULT_UI_SCALE, isSupportedUiScale } from '../data/overlayTheme.js';

// §11/§09-roadmap (M13, sub-sessão 3/N) — "progresso sobrevive a recarregar a página".
//
// O save guarda as ENTRADAS do jogo, nunca o `BattleState`. Duas razões: um `BattleState`
// serializado é o mapa inteiro (centenas de `tiles` por capítulo) a cada gravação, e é um
// snapshot que ninguém verifica — nada garante que o estado escrito no disco seja um estado
// que o core poderia ter produzido. O que é guardado aqui é o que o jogador ESCOLHEU
// (capítulo alcançado, táticas preparadas, equipamento, talentos, preferências), e a
// batalha é sempre remontada do setup pelo core.
//
// Decisão do usuário nesta fatia: **o save cobre o progresso entre capítulos, não a
// batalha em andamento.** Recarregar no meio de um capítulo reinicia o capítulo — com os
// overrides de tática preservados, porque essa é a preparação, não a partida.
//
// Este arquivo não conhece o catálogo nem o store: recebe o que precisa saber sobre o
// mundo por `SaveEnvironment`, o que o deixa testável sem browser e sem batalha.

export const SAVE_STORAGE_KEY = 'paths-beyond/save';

// Versão do FORMATO do save, independente de `rulesVersion` (que é do motor). Sobe quando
// a forma deste objeto mudar de um jeito que o parser antigo leria errado; um save de
// versão desconhecida é descartado inteiro, porque não há como saber o que ele significa.
export const SAVE_FORMAT_VERSION = 1;

export interface SaveGame {
  readonly v: number;
  // A `rulesVersion` com que este progresso foi jogado (regra 11: toda mudança de regra a
  // incrementa). Não invalida o save inteiro — ver `reconcileSave`.
  readonly rulesVersion: string;
  readonly campaignMapIndex: number;
  readonly campaignComplete: boolean;
  readonly tacticsOverrides: Readonly<Record<string, TacticsScript>>;
  readonly equippedByUnit: Readonly<Record<string, Partial<Record<GearSlot, Id>>>>;
  readonly talentAllocationByUnit: Readonly<Record<string, TalentAllocation>>;
  readonly instantResultMode: boolean;
  // §11 (acessibilidade), M13 4/N. Chegaram DEPOIS de o formato v1 existir e são
  // **opcionais na leitura**: um save gravado antes desta fatia não tem os campos, e
  // rejeitá-lo por isso apagaria o progresso do jogador por causa de uma preferência nova.
  // Por isso o formato não subiu para v2 — ver `DECISIONS.md`.
  readonly colorblindMode: boolean;
  readonly uiScale: number;
  // Só o token do PvP entra (decisão do usuário): é digitado à mão numa caixa de texto e
  // redigitá-lo a cada recarga seria hostil. Ticket, oponente e batalha em curso não são
  // persistidos — retomar uma partida de arena é estado que o servidor não conhece.
  readonly pvpToken: string;
}

// O que o save precisa saber sobre o mundo para ser reconciliado. Tudo por callback: o
// módulo não importa catálogo nem store.
export interface SaveEnvironment {
  readonly rulesVersion: string;
  readonly chapterCount: number;
  readonly itemExists: (itemId: Id) => boolean;
  // `true` se a alocação continua válida para a unidade. O store passa
  // `validateColumnAllocation` do core contra a árvore do PERSONAGEM (§8.2, M17 4/N);
  // unidades de outros capítulos, cuja árvore não dá pra resolver daqui, devem devolver
  // `true` (não sabemos, não mexemos).
  readonly allocationIsValid: (unitId: string, allocation: TalentAllocation) => boolean;
}

export interface SaveStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonNegativeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

// ---------------------------------------------------------------------------
// Parsing defensivo
//
// O save é dado do DISCO DO JOGADOR: pode estar truncado, ser de uma versão anterior ou ter
// sido editado à mão. Não é conteúdo de `packages/data`, então não ganha schema Zod (o
// cliente não depende de Zod e o formato é nosso, não autorado); em compensação, nada aqui
// confia no que leu — qualquer coisa fora do formato vira `null` e o jogo começa do zero,
// nunca uma exceção na inicialização.
// ---------------------------------------------------------------------------

// Espelha `Condition` (§6.3) variante a variante, do mesmo jeito que
// `createDefaultCondition` faz no editor de táticas. Verboso de propósito: validar por
// "tem um campo `t` string" deixaria passar um `targetIsType` com tipo inexistente, que o
// motor avaliaria como falso pra sempre — uma linha de tática morta em silêncio.
function parseCondition(value: unknown): Condition | null {
  if (!isRecord(value) || typeof value.t !== 'string') return null;

  const pct = value.pct;
  const n = value.n;

  switch (value.t) {
    case 'targetHpBelow':
      return typeof pct === 'number' ? { t: 'targetHpBelow', pct } : null;
    case 'targetHpAbove':
      return typeof pct === 'number' ? { t: 'targetHpAbove', pct } : null;
    case 'selfHpBelow':
      return typeof pct === 'number' ? { t: 'selfHpBelow', pct } : null;
    case 'targetHasDebuff':
      return typeof value.debuffId === 'string' ? { t: 'targetHasDebuff', debuffId: value.debuffId } : null;
    case 'targetHasBuff':
      return typeof value.buffId === 'string' ? { t: 'targetHasBuff', buffId: value.buffId } : null;
    case 'selfBuffAbsent':
      return typeof value.buffId === 'string' ? { t: 'selfBuffAbsent', buffId: value.buffId } : null;
    case 'targetIsType':
      return UNIT_TYPES.includes(value.type as UnitType) ? { t: 'targetIsType', type: value.type as UnitType } : null;
    case 'targetWeaponIs':
      return WEAPON_TYPES.includes(value.weapon as WeaponType)
        ? { t: 'targetWeaponIs', weapon: value.weapon as WeaponType }
        : null;
    case 'targetPpBelow':
      return typeof n === 'number' ? { t: 'targetPpBelow', n } : null;
    case 'apAtLeast':
      return typeof n === 'number' ? { t: 'apAtLeast', n } : null;
    case 'ppAtLeast':
      return typeof n === 'number' ? { t: 'ppAtLeast', n } : null;
    case 'battleRoundAtLeast':
      return typeof n === 'number' ? { t: 'battleRoundAtLeast', n } : null;
    case 'alliesAdjacentAtLeast':
      return typeof n === 'number' ? { t: 'alliesAdjacentAtLeast', n } : null;
    // A troca é `1|2|3` no tipo (MAX_TROCAS = 3, §6.2): um 4 vindo do disco não é uma
    // troca que exista.
    case 'trocaAtLeast':
      return n === 1 || n === 2 || n === 3 ? { t: 'trocaAtLeast', n } : null;
    case 'isAttacker':
      return { t: 'isAttacker' };
    case 'isDefender':
      return { t: 'isDefender' };
    case 'hasPositionalBonus':
      return { t: 'hasPositionalBonus' };
    case 'not': {
      const inner = parseCondition(value.c);
      return inner ? { t: 'not', c: inner } : null;
    }
    default:
      return null;
  }
}

function parseTacticsScript(value: unknown): TacticsScript | null {
  if (!Array.isArray(value)) return null;

  const lines: TacticsScript[number][] = [];
  for (const raw of value) {
    if (!isRecord(raw)) return null;
    if (typeof raw.enabled !== 'boolean' || typeof raw.skillId !== 'string') return null;
    if (!Array.isArray(raw.conditions)) return null;

    const conditions: Condition[] = [];
    for (const rawCondition of raw.conditions) {
      const condition = parseCondition(rawCondition);
      if (!condition) return null;
      conditions.push(condition);
    }
    lines.push({ enabled: raw.enabled, skillId: raw.skillId, conditions });
  }
  return lines;
}

function parseTacticsOverrides(value: unknown): Readonly<Record<string, TacticsScript>> | null {
  if (!isRecord(value)) return null;
  const overrides: Record<string, TacticsScript> = {};
  for (const [unitId, raw] of Object.entries(value)) {
    const script = parseTacticsScript(raw);
    // Um script quebrado não some sozinho: a unidade voltaria ao script original e o
    // jogador entraria no capítulo com uma tática que ele não configurou, sem aviso.
    if (!script) return null;
    overrides[unitId] = script;
  }
  return overrides;
}

function parseEquippedByUnit(value: unknown): Readonly<Record<string, Partial<Record<GearSlot, Id>>>> | null {
  if (!isRecord(value)) return null;
  const equipped: Record<string, Partial<Record<GearSlot, Id>>> = {};
  for (const [unitId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) return null;
    const slots: Partial<Record<GearSlot, Id>> = {};
    for (const [slot, itemId] of Object.entries(raw)) {
      if (!GEAR_SLOTS.includes(slot as GearSlot) || typeof itemId !== 'string') return null;
      slots[slot as GearSlot] = itemId;
    }
    equipped[unitId] = slots;
  }
  return equipped;
}

function parseTalentAllocations(value: unknown): Readonly<Record<string, TalentAllocation>> | null {
  if (!isRecord(value)) return null;
  const byUnit: Record<string, TalentAllocation> = {};
  for (const [unitId, raw] of Object.entries(value)) {
    if (!isRecord(raw)) return null;
    const allocation: Record<Id, number> = {};
    for (const [nodeId, rank] of Object.entries(raw)) {
      if (!isNonNegativeInt(rank)) return null;
      allocation[nodeId] = rank;
    }
    byUnit[unitId] = allocation;
  }
  return byUnit;
}

export function parseSave(raw: string | null): SaveGame | null {
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed)) return null;
  if (parsed.v !== SAVE_FORMAT_VERSION) return null;
  if (typeof parsed.rulesVersion !== 'string') return null;
  if (!isNonNegativeInt(parsed.campaignMapIndex)) return null;
  if (typeof parsed.campaignComplete !== 'boolean') return null;
  if (typeof parsed.instantResultMode !== 'boolean') return null;
  if (typeof parsed.pvpToken !== 'string') return null;

  // Preferências de acessibilidade: ausentes (save anterior a M13 4/N) ou com valor fora
  // da faixa caem no default, em vez de invalidar o save inteiro. A regra que separa os
  // dois tratamentos: **erro de TIPO é formato malformado e rejeita; valor fora de faixa é
  // preferência recuperável e cai no default.** Perder capítulo, equipamento e talentos
  // por causa de um tamanho de fonte seria o mesmo erro que a reconciliação evita.
  if (parsed.colorblindMode !== undefined && typeof parsed.colorblindMode !== 'boolean') return null;
  if (parsed.uiScale !== undefined && typeof parsed.uiScale !== 'number') return null;
  const uiScale = typeof parsed.uiScale === 'number' && isSupportedUiScale(parsed.uiScale) ? parsed.uiScale : DEFAULT_UI_SCALE;

  const tacticsOverrides = parseTacticsOverrides(parsed.tacticsOverrides);
  const equippedByUnit = parseEquippedByUnit(parsed.equippedByUnit);
  const talentAllocationByUnit = parseTalentAllocations(parsed.talentAllocationByUnit);
  if (!tacticsOverrides || !equippedByUnit || !talentAllocationByUnit) return null;

  return {
    v: SAVE_FORMAT_VERSION,
    rulesVersion: parsed.rulesVersion,
    campaignMapIndex: parsed.campaignMapIndex,
    campaignComplete: parsed.campaignComplete,
    tacticsOverrides,
    equippedByUnit,
    talentAllocationByUnit,
    instantResultMode: parsed.instantResultMode,
    colorblindMode: parsed.colorblindMode ?? false,
    uiScale,
    pvpToken: parsed.pvpToken,
  };
}

export function serializeSave(save: SaveGame): string {
  return JSON.stringify(save);
}

// ---------------------------------------------------------------------------
// Reconciliação com o mundo atual
//
// Decisão do usuário: um save gravado sob outra `rulesVersion` (ou apontando para conteúdo
// que mudou) **não é descartado inteiro** — o que continua verdadeiro é mantido, e só o que
// está preso à batalha cai. Perder capítulo, talentos e equipamento porque um número de
// balanceamento mudou seria punir o jogador por uma decisão do desenvolvedor.
// ---------------------------------------------------------------------------

export function reconcileSave(save: SaveGame, env: SaveEnvironment): SaveGame {
  // Táticas são a única parte do save presa à regra da batalha: uma linha de script é uma
  // skill mais condições avaliadas pelo motor, e o motor mudou. As outras partes
  // (capítulo alcançado, itens equipados, talentos alocados) são progresso, não regra.
  const tacticsOverrides = save.rulesVersion === env.rulesVersion ? save.tacticsOverrides : {};

  // A campanha pode ter encolhido entre uma sessão e outra (encounters são dado, §10).
  // Clampar mantém o jogador no capítulo mais avançado que ainda existe em vez de
  // devolvê-lo ao começo por um capítulo que saiu do catálogo.
  const lastChapter = env.chapterCount > 0 ? env.chapterCount - 1 : 0;
  const campaignMapIndex = Math.min(save.campaignMapIndex, lastChapter);

  // Item que saiu do catálogo some do slot; o resto do equipamento da unidade fica.
  const equippedByUnit: Record<string, Partial<Record<GearSlot, Id>>> = {};
  for (const [unitId, slots] of Object.entries(save.equippedByUnit)) {
    const kept: Partial<Record<GearSlot, Id>> = {};
    for (const slot of GEAR_SLOTS) {
      const itemId = slots[slot];
      if (itemId !== undefined && env.itemExists(itemId)) kept[slot] = itemId;
    }
    equippedByUnit[unitId] = kept;
  }

  // Alocação que a árvore atual não aceita mais é zerada: mantê-la travaria toda edição
  // seguinte, já que o cliente revalida a árvore INTEIRA a cada +1/-1 (M6, sub-sessão 7).
  //
  // §8.2 (M17, 4/N) — é por aqui que passa o SAVE ANTIGO, e a decisão do usuário foi
  // **devolver os pontos**. Um save gravado antes deste milestone carrega nós da árvore de
  // classe, que não existem mais; `validateColumnAllocation` os recusa como desconhecidos, e
  // a máquina que já estava aqui zera a alocação daquela unidade e deixa o resto do save de
  // pé. D5 do briefing diz que não há caminho de migração — o que ele não diz é que o
  // jogador tenha de perder o capítulo, o equipamento e as preferências junto com a build.
  // Ele reescolhe a árvore, que é justamente a tela que este milestone entrega.
  const talentAllocationByUnit: Record<string, TalentAllocation> = {};
  for (const [unitId, allocation] of Object.entries(save.talentAllocationByUnit)) {
    talentAllocationByUnit[unitId] = env.allocationIsValid(unitId, allocation) ? allocation : {};
  }

  return {
    ...save,
    rulesVersion: env.rulesVersion,
    campaignMapIndex,
    tacticsOverrides,
    equippedByUnit,
    talentAllocationByUnit,
  };
}

// ---------------------------------------------------------------------------
// Acesso ao armazenamento
//
// `localStorage` pode simplesmente não existir (SSR, teste em Node) e pode LANÇAR mesmo
// existindo (navegação privada, cota estourada, cookies bloqueados). Nenhum desses casos
// pode derrubar o jogo: sem armazenamento, o jogo roda igual e não salva.
// ---------------------------------------------------------------------------

export function browserSaveStorage(): SaveStorage | null {
  try {
    const storage = globalThis.localStorage;
    if (!storage) return null;
    return {
      getItem: (key) => storage.getItem(key),
      setItem: (key, value) => storage.setItem(key, value),
      removeItem: (key) => storage.removeItem(key),
    };
  } catch {
    return null;
  }
}

export function loadSave(storage: SaveStorage | null): SaveGame | null {
  if (!storage) return null;
  try {
    return parseSave(storage.getItem(SAVE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function writeSave(storage: SaveStorage | null, save: SaveGame): void {
  if (!storage) return;
  try {
    storage.setItem(SAVE_STORAGE_KEY, serializeSave(save));
  } catch {
    // Cota estourada ou armazenamento bloqueado: o jogo continua, só não persiste.
  }
}

export function clearSave(storage: SaveStorage | null): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_STORAGE_KEY);
  } catch {
    // idem
  }
}
