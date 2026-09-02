import type { GearSlot, ItemInstance, Rarity, ValueRange } from '../items/types.js';
import type { Hero } from '../hero/types.js';
import type { Id } from '../types.js';

// §10 — Progressão e economia (PvE). A seção são cinco linhas de prosa e nenhum número;
// tudo que é balanceamento mora em `packages/data` (regra 4) e chega aqui por parâmetro.
//
// Nada neste módulo lê relógio: `packages/core` não pode tocar `Date` (regra 1), então
// quem sabe que horas são é quem chama — o servidor, em M14 2/N. O instante entra como
// `nowMs`, o que também é o que torna a regeneração de energia testável de verdade.

// §10 — "Moedas: `ouro`, `pedras`, `marcas de arena`."
export type CurrencyKey = 'gold' | 'stones' | 'arenaMarks';
export type Wallet = Readonly<Record<CurrencyKey, number>>;

// Materiais e fragmentos contados por id. `Record` em vez de lista porque toda operação
// aqui é "tenho o bastante de X?".
export type MaterialBag = Readonly<Record<Id, number>>;

// §10 — "Masmorras de farm com foco definido: Equipamento (drop por set), Experiência,
// Ouro, Chefe (materiais de promoção)." Os quatro focos são os quatro da spec, fechados.
export type DungeonFocus = 'gear' | 'exp' | 'gold' | 'boss';

export interface GearDropEntry {
  readonly weight: number;
  readonly setId: Id;
  readonly slot: GearSlot;
  readonly rarity: Rarity;
  readonly ilvl: number;
}

export interface MaterialDropEntry {
  readonly weight: number;
  readonly materialId: Id;
  readonly amount: ValueRange;
}

// M14 2/N — decisão do usuário: a masmorra é uma BATALHA de verdade, não uma troca de
// energia por loot. As dificuldades menores precisam ser limpas à mão uma vez e depois
// aceitam time automático (que ainda tem de vencer); a alta dá mais recursos, é sempre
// manual e tem entrada limitada por tempo.
export type DungeonDifficulty = 'normal' | 'elite';

export interface DungeonDef {
  readonly id: Id;
  readonly name: string;
  readonly focus: DungeonFocus;
  readonly difficulty: DungeonDifficulty;
  // O confronto em si: mapa + elenco, o mesmo `Encounter` que a campanha usa desde M12.
  readonly encounterId: Id;
  // `true` = nunca aceita varredura, mesmo já limpa (a dificuldade alta).
  readonly manualOnly?: boolean;
  // Masmorra que precisa estar limpa antes de esta liberar. É o que faz a elite exigir a
  // normal, sem o motor precisar saber o que "elite" significa.
  readonly requiresClearOf?: Id;
  // Trava de tempo (só faz sentido na dificuldade alta, mas o motor não impõe isso).
  readonly entryLimit?: EntryLimitRule;
  readonly energyCost: number;
  readonly gold?: ValueRange;
  readonly exp?: ValueRange;
  readonly stones?: ValueRange;
  // Quantos itens/materiais a run rola. Ausente ou 0 = a masmorra não dropa esse tipo.
  readonly gearDropCount?: number;
  readonly gearDrops?: readonly GearDropEntry[];
  readonly materialDropCount?: number;
  readonly materialDrops?: readonly MaterialDropEntry[];
}

export interface DungeonRunRewards {
  readonly gold: number;
  readonly exp: number;
  readonly stones: number;
  readonly items: readonly ItemInstance[];
  readonly materials: MaterialBag;
}

// `heroFragment` é a "duplicata" de §10 ("Imprint: duplicatas viram bônus permanente de
// stat"), resolvida como consumível — decisão do usuário em M14 1/N.
//
// **M18 corrigiu a chave, e isto é mudança de regra.** Até aqui o fragmento pertencia a
// uma INSTÂNCIA de herói (`forHeroId`, comparado com `hero.id`), o que funcionava por
// coincidência de autoria: os heróis da campanha tinham `id` e `characterId` iguais. A
// duplicata é de um PERSONAGEM — sempre foi, e a aquisição de M18 torna isso inevitável,
// porque dois jogadores com o mesmo personagem têm instâncias de herói diferentes e um
// fragmento por instância não teria como ser autorado como conteúdo.
//
// `forCharacterId` é o que impede fragmento de um personagem virar imprint de outro.
export type MaterialKind = 'awakening' | 'heroFragment' | 'generic';

export interface MaterialDef {
  readonly id: Id;
  readonly name: string;
  readonly kind: MaterialKind;
  readonly forCharacterId?: Id;
}

// §10 — "Energia de conta limita o farm diário." Decisão do usuário: regeneração contínua
// (+1 a cada `refillIntervalMs`) até um teto de conta, em vez de recarga diária.
export interface EnergyRules {
  readonly max: number;
  readonly refillIntervalMs: number;
}

// `stored` é a energia apurada NO INSTANTE `asOfMs` — não "agora". Guardar o instante da
// apuração junto é o que permite a regeneração ser derivada, e não um contador que alguém
// precisa lembrar de incrementar.
export interface EnergyState {
  readonly stored: number;
  readonly asOfMs: number;
}

// Custo do passo de awakening N→N+1 (índice 0 = 0→1). §10 dá a faixa (0–6) e nada mais.
export interface AwakeningStep {
  readonly gold: number;
  readonly materials: MaterialBag;
}

// Fragmentos necessários para o passo de imprint N→N+1 (índice 0 = 0→1).
export interface ImprintStep {
  readonly fragments: number;
}

// §7.3 define a mecânica do enhance e as chances, mas nenhum custo. Decisão do usuário
// (M14 2/N): **pedras + ouro** — é o que dá sumidouro às pedras, que dropavam desde 1/N
// sem nada que as gastasse.
export interface EnhanceCost {
  readonly gold: number;
  readonly stones: number;
}

export interface EconomyRules {
  readonly energy: EnergyRules;
  readonly awakening: readonly AwakeningStep[];
  readonly imprint: readonly ImprintStep[];
  // Um custo por marco de enhance (§7.3: +0→+3, +3→+6, +6→+9, +9→+12, +12→+15).
  readonly enhance: readonly EnhanceCost[];
}

// M14 2/N — calendário e trava de tempo.
export interface CivilDate {
  readonly year: number;
  readonly month: number; // 1..12
  readonly day: number; // 1..31
}

// Decisão do usuário: a entrada da masmorra difícil "reseta em dias X da semana ou do mês
// dependendo do conteúdo". Daí as duas formas — e `hourUtc` porque sem uma referência
// "dia" não tem definição (o reset é em UTC; fuso por jogador é conceito que o projeto não
// tem). Lista de dias vazia = nunca reseta.
export type ResetSchedule =
  | { readonly kind: 'weekdays'; readonly days: readonly number[]; readonly hourUtc?: number } // 0 = domingo
  | { readonly kind: 'monthDays'; readonly days: readonly number[]; readonly hourUtc?: number };

export interface EntryLimitRule {
  readonly maxEntries: number;
  readonly resetOn: ResetSchedule;
}

export interface EntryLimitState {
  readonly used: number;
  readonly asOfMs: number;
}

export type ConsumeEntryResult =
  | { readonly ok: true; readonly state: EntryLimitState }
  | { readonly ok: false; readonly reason: string; readonly state: EntryLimitState };

export type SpendEnergyResult =
  | { readonly ok: true; readonly energy: EnergyState }
  | { readonly ok: false; readonly reason: string; readonly energy: EnergyState };

export type AwakenResult =
  | { readonly ok: true; readonly hero: Hero; readonly wallet: Wallet; readonly materials: MaterialBag }
  | { readonly ok: false; readonly reason: string };

export type ImprintResult =
  | { readonly ok: true; readonly hero: Hero; readonly materials: MaterialBag }
  | { readonly ok: false; readonly reason: string };
