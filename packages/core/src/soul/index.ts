import type { MaterialBag, Wallet } from '../economy/types.js';
import type { Hero } from '../hero/types.js';
import { pickWeighted, rollInRange } from '../items/generate.js';
import { rngFor } from '../rng/rngFor.js';
import { nextUint32 } from '../rng/xoshiro128.js';
import type { StatKey, StatModifier } from '../stats/types.js';
import type { Id } from '../types.js';
import type { CharacterSoulDef, SoulCost, SoulInstance, SoulRules } from './types.js';

export type { CharacterSoulDef, SoulCost, SoulInstance, SoulMainstatOption, SoulRules, SoulSubstatEntry } from './types.js';

// M39 2/N — as regras da Soul. Ver `types.ts` para o que ela é.

/** "Dois substats roláveis" (roadmap M39) — forma, não balanceamento. */
export const SOUL_SUBSTAT_COUNT = 2;
/** "2 a 3 possibilidades" de mainstat por personagem (roadmap M39). */
export const SOUL_MAINSTAT_OPTIONS_MIN = 2;
export const SOUL_MAINSTAT_OPTIONS_MAX = 3;

function roll(seed: number, crafts: number, id: Id, purpose: string): number {
  return nextUint32(rngFor(seed, crafts, id, `soul-${purpose}`)).value;
}

export interface GenerateSoulInput {
  readonly id: Id;
  readonly def: CharacterSoulDef;
  readonly rules: SoulRules;
  readonly seed: number;
  /** O número deste sorteio na vida da instância (1 = o craft). */
  readonly crafts: number;
}

/**
 * Sorteia uma Soul inteira: o mainstat entre as opções DAQUELE personagem e os dois substats da
 * tabela própria, distintos e fora do stat do mainstat. Determinístico por (seed, crafts, id).
 */
export function generateSoul(input: GenerateSoulInput): SoulInstance {
  const { id, def, rules, seed, crafts } = input;
  const opcoes = def.mainstatOptions;
  if (opcoes.length < SOUL_MAINSTAT_OPTIONS_MIN || opcoes.length > SOUL_MAINSTAT_OPTIONS_MAX) {
    throw new Error(`a Soul de ${def.soulOf} declara ${opcoes.length} opções de mainstat; são 2 a 3`);
  }

  const main = pickWeighted(opcoes, roll(seed, crafts, id, 'mainstat-stat'));
  const mainstat = { stat: main.stat, value: rollInRange(roll(seed, crafts, id, 'mainstat-value'), main.valueRange) };

  const elegiveis = rules.substats.filter((e) => e.stat !== mainstat.stat);
  if (new Set(elegiveis.map((e) => e.stat)).size < SOUL_SUBSTAT_COUNT) {
    throw new Error(`a tabela de substats da Soul não tem ${SOUL_SUBSTAT_COUNT} stats elegíveis fora de ${mainstat.stat}`);
  }
  const escolhidos = new Set<StatKey>();
  const substats: { stat: StatKey; value: number }[] = [];
  for (let i = 0; i < SOUL_SUBSTAT_COUNT; i++) {
    const restantes = elegiveis.filter((e) => !escolhidos.has(e.stat));
    const sub = pickWeighted(restantes, roll(seed, crafts, id, `substat-stat-${i}`));
    escolhidos.add(sub.stat);
    substats.push({ stat: sub.stat, value: rollInRange(roll(seed, crafts, id, `substat-value-${i}`), sub.valueRange) });
  }

  return { id, soulOf: def.soulOf, mainstat, substats, crafts };
}

/**
 * A trava por personagem como FORMA: devolve cada motivo pelo qual `soul` não é uma Soul
 * possível de `def` sob `rules` (lista vazia = válida). O mainstat tem de ser uma opção DAQUELE
 * personagem, dentro da faixa; os substats, os da tabela, dentro da faixa, distintos e fora do
 * mainstat.
 */
export function validateSoul(soul: SoulInstance, def: CharacterSoulDef, rules: SoulRules): string[] {
  const erros: string[] = [];
  if (soul.soulOf !== def.soulOf) erros.push(`a Soul ${soul.id} é de ${soul.soulOf}, não de ${def.soulOf}`);

  const opcao = def.mainstatOptions.find((o) => o.stat === soul.mainstat.stat);
  if (!opcao) {
    erros.push(`mainstat ${soul.mainstat.stat} não é opção da Soul de ${def.soulOf}`);
  } else if (soul.mainstat.value < opcao.valueRange.min || soul.mainstat.value > opcao.valueRange.max) {
    erros.push(`mainstat ${soul.mainstat.stat} = ${soul.mainstat.value} fora de [${opcao.valueRange.min}, ${opcao.valueRange.max}]`);
  }

  if (soul.substats.length !== SOUL_SUBSTAT_COUNT) {
    erros.push(`a Soul tem ${soul.substats.length} substats; são ${SOUL_SUBSTAT_COUNT}`);
  }
  const vistos = new Set<StatKey>();
  for (const sub of soul.substats) {
    if (sub.stat === soul.mainstat.stat) erros.push(`substat ${sub.stat} repete o mainstat`);
    if (vistos.has(sub.stat)) erros.push(`substat ${sub.stat} repetido`);
    vistos.add(sub.stat);
    const entrada = rules.substats.find((e) => e.stat === sub.stat);
    if (!entrada) erros.push(`substat ${sub.stat} não está na tabela da Soul`);
    else if (sub.value < entrada.valueRange.min || sub.value > entrada.valueRange.max) {
      erros.push(`substat ${sub.stat} = ${sub.value} fora de [${entrada.valueRange.min}, ${entrada.valueRange.max}]`);
    }
  }
  return erros;
}

type Pagamento = { readonly ok: true; readonly wallet: Wallet; readonly materials: MaterialBag } | { readonly ok: false; readonly reason: string };

function pagar(cost: SoulCost, wallet: Wallet, materials: MaterialBag): Pagamento {
  if (wallet.gold < cost.gold) return { ok: false, reason: `ouro insuficiente: ${wallet.gold} de ${cost.gold}` };
  for (const [materialId, needed] of Object.entries(cost.materials)) {
    const owned = materials[materialId] ?? 0;
    if (owned < needed) return { ok: false, reason: `material insuficiente: ${materialId} (${owned} de ${needed})` };
  }
  const restante: Record<Id, number> = { ...materials };
  for (const [materialId, needed] of Object.entries(cost.materials)) {
    restante[materialId] = (restante[materialId] ?? 0) - needed;
  }
  return { ok: true, wallet: { ...wallet, gold: wallet.gold - cost.gold }, materials: restante };
}

export type SoulCraftResult =
  | { readonly ok: true; readonly soul: SoulInstance; readonly wallet: Wallet; readonly materials: MaterialBag }
  | { readonly ok: false; readonly reason: string };

export interface CraftSoulInput {
  readonly id: Id;
  /** O personagem escolhido NO ATO do craft (decisão do usuário: o farm é genérico). */
  readonly characterId: Id;
  readonly def: CharacterSoulDef;
  readonly rules: SoulRules;
  readonly wallet: Wallet;
  readonly materials: MaterialBag;
  readonly seed: number;
}

/**
 * Crafta uma Soul NOVA para o personagem escolhido, pagando o custo de craft. Não olha nível:
 * o nível trava o SLOT (`equipSoul`), não a posse. A idempotência por nonce é de quem chama (o
 * servidor, 4/N), como em toda ação de economia desde o M14 4/N.
 */
export function craftSoul(input: CraftSoulInput): SoulCraftResult {
  if (input.def.soulOf !== input.characterId) {
    return { ok: false, reason: `a definição de Soul é de ${input.def.soulOf}, não de ${input.characterId}` };
  }
  const pago = pagar(input.rules.craftCost, input.wallet, input.materials);
  if (!pago.ok) return pago;
  const soul = generateSoul({ id: input.id, def: input.def, rules: input.rules, seed: input.seed, crafts: 1 });
  return { ok: true, soul, wallet: pago.wallet, materials: pago.materials };
}

export interface RecraftSoulInput {
  readonly soul: SoulInstance;
  readonly def: CharacterSoulDef;
  readonly rules: SoulRules;
  readonly wallet: Wallet;
  readonly materials: MaterialBag;
  readonly seed: number;
}

/** Re-sorteia TUDO (mainstat e substats) na mesma instância, pagando o custo de recraft. */
export function recraftSoul(input: RecraftSoulInput): SoulCraftResult {
  const { soul, def } = input;
  if (def.soulOf !== soul.soulOf) {
    return { ok: false, reason: `a definição de Soul é de ${def.soulOf}, e a Soul ${soul.id} é de ${soul.soulOf}` };
  }
  const pago = pagar(input.rules.recraftCost, input.wallet, input.materials);
  if (!pago.ok) return pago;
  const novo = generateSoul({ id: soul.id, def, rules: input.rules, seed: input.seed, crafts: soul.crafts + 1 });
  return { ok: true, soul: novo, wallet: pago.wallet, materials: pago.materials };
}

/** O slot da Soul abre no nível declarado em dado. */
export function soulSlotOpen(hero: Hero, rules: SoulRules): boolean {
  return hero.level >= rules.unlockLevel;
}

export type EquipSoulResult = { readonly ok: true; readonly hero: Hero } | { readonly ok: false; readonly reason: string };

export function equipSoul(input: { readonly hero: Hero; readonly soul: SoulInstance; readonly rules: SoulRules }): EquipSoulResult {
  const { hero, soul, rules } = input;
  if (!hero.characterId) return { ok: false, reason: `${hero.id} não é personagem e não tem Soul` };
  if (soul.soulOf !== hero.characterId) {
    return { ok: false, reason: `a Soul ${soul.id} é de ${soul.soulOf}, e ${hero.id} é ${hero.characterId}` };
  }
  if (!soulSlotOpen(hero, rules)) {
    return { ok: false, reason: `o slot da Soul abre no nível ${rules.unlockLevel}; ${hero.id} está no ${hero.level}` };
  }
  return { ok: true, hero: { ...hero, soul: soul.id } };
}

/**
 * A trava por personagem na hora de RESOLVER. `equipSoul` nunca produz Soul de outro
 * personagem equipada, então chegar aqui assim é dado corrompido — somar em silêncio daria a um
 * personagem o que o jogo proíbe.
 */
export function assertSoulFitsHero(soul: SoulInstance, hero: Hero): void {
  if (soul.soulOf !== hero.characterId) {
    throw new Error(`a Soul ${soul.id} é do personagem ${soul.soulOf}, não de ${hero.characterId ?? hero.id}`);
  }
}

/** O que a Soul soma: mainstat e substats, todos flat, no passo 3 de §4.1 (é equipamento). */
export function resolveSoul(soul: SoulInstance): readonly StatModifier[] {
  return [{ stat: soul.mainstat.stat, flat: soul.mainstat.value }, ...soul.substats.map((s) => ({ stat: s.stat, flat: s.value }))];
}
