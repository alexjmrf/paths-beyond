import type { MoveType } from '../grid/types.js';
import type { SkillDef } from '../skills/types.js';
import type { StatSheet } from '../stats/types.js';
import type { TacticsScript, UnitType, WeaponType } from '../tactics/types.js';
import type { Id } from '../types.js';

// §8.1 (M17, sub-sessão 3/N) — "Inimigo de fase NÃO é personagem".
//
// Um `EnemyDef` é a FORÇA de uma unidade que só existe para ser enfrentada, dita
// diretamente. Não tem classe a resolver, nível a interpolar, equipamento a agregar,
// árvore nem alocação de talento — nada do que `Hero` carrega para ser um objeto de
// progressão, porque inimigo não progride: ele é autorado pronto.
//
// A comparação com `Hero` é a razão de este tipo existir. Um `Hero` diz "espadachim
// nível 8 com este colar e estes talentos" e deixa a força ser CONSEQUÊNCIA de cinco
// tabelas; um `EnemyDef` diz a força. Quando o autor de conteúdo quer um inimigo mais
// duro, ele muda o número em vez de procurar qual das cinco tabelas o produz.
//
// O que ele NÃO declara é tão normativo quanto o que declara: `duelRange` e `assistRange`
// saem da arma (§6.1) como saem para qualquer unidade, e as reações universais de §6.4
// entram sozinhas. Um inimigo que pudesse declarar o próprio `duelRange` seria um inimigo
// capaz de furar a assimetria de alcance que a spec chama de identidade tática do jogo.
export interface EnemyDef {
  readonly id: Id;
  readonly name: string;
  // A folha COMPLETA, já resolvida. É o campo que substitui `statCurve[level-1]` mais
  // multiplicador de despertar, mais imprint, mais equipamento, mais talento.
  readonly stats: StatSheet;
  readonly unitType: UnitType;
  readonly weaponType: WeaponType;
  readonly moveType: MoveType;
  readonly moveRange: number;
  // AP/PP com que o inimigo ENTRA na batalha. Em `Hero` isto era
  // `classDef.basePools + bônus de talento + set`; aqui é o número, pelo mesmo motivo que
  // `stats` é o número.
  readonly pools: { readonly ap: number; readonly pp: number };
  readonly duelSkills: readonly Id[];
  readonly mapSkills: readonly Id[];
  readonly tacticsScript: TacticsScript;
}

// O catálogo de skills que quem chama resolve, mesma forma e mesmo precedente de
// `ResolveHeroCombatProfileInput`: id ausente do catálogo é ignorado em silêncio.
export interface ResolveEnemyCombatProfileInput {
  readonly enemy: EnemyDef;
  readonly skillsCatalog: Readonly<Record<Id, SkillDef>>;
  readonly weaponDuelRanges: Readonly<Record<WeaponType, number>>;
  readonly baselineReactionSkillIds: readonly Id[];
}
