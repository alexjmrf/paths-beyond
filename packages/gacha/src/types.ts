import type { Id } from '@paths-beyond/core';

// §10 (M18) — a aquisição de personagens. D15: esta regra NÃO mora em `packages/core`.
//
// O que este pacote é: a MECÂNICA da rolagem — peso, garantia e duplicata. O que ele não
// é: conteúdo. Nenhum id de personagem, material ou banner aparece aqui; todos chegam pelo
// `BannerDef`, que é dado validado por Zod em `packages/data` (regra 4).
//
// A seta de dependência aponta para dentro: este pacote importa `@paths-beyond/core` (RNG e
// ponto fixo) e o core continua não importando nada além de si mesmo (regra 1).

export interface BannerEntry {
  readonly characterId: Id;
  // Peso relativo dentro do pool. INTEIRO, e é isso que mantém o sorteio livre de ponto
  // flutuante (regra 2): a escolha é `valor % total`, sem uma divisão sequer.
  readonly weight: number;
  // O que a duplicata paga. Vem declarado na entrada em vez de ser derivado do
  // `characterId` por convenção de nome, porque derivar seria o motor inventando um id de
  // conteúdo — exatamente o que a regra 4 proíbe.
  readonly fragmentMaterialId: Id;
}

export interface BannerDef {
  readonly id: Id;
  readonly pool: readonly BannerEntry[];
  // D18 — pity duro contado: depois de `pityThreshold` rolagens sem personagem novo, a
  // próxima é garantida.
  readonly pityThreshold: number;
}

// O contador mora na conta do jogador (D18), não no banner: é estado, não conteúdo.
export interface PityState {
  readonly rollsSinceNew: number;
}

export const INITIAL_PITY: PityState = { rollsSinceNew: 0 };

export interface SummonInput {
  readonly banner: BannerDef;
  // Quem o jogador já possui. Só o que importa para a rolagem: possuir decide entre
  // personagem e duplicata, e restringe o pool quando a garantia está armada.
  readonly owned: readonly Id[];
  readonly pity: PityState;
  readonly seed: number;
  // Identifica ESTA rolagem. Duas rolagens da mesma seed precisam diferir, pelo mesmo
  // motivo que `rollDungeonRun` exige `runId`: sem isso, invocar seria repetir o mesmo
  // resultado para sempre.
  readonly rollId: string;
}

export interface SummonCharacter {
  readonly kind: 'character';
  readonly characterId: Id;
  // Verdadeiro quando foi a garantia de pity que restringiu o sorteio, e não a sorte.
  // O cliente mostra isso; o servidor registra.
  readonly guaranteed: boolean;
}

export interface SummonDuplicate {
  readonly kind: 'duplicate';
  readonly characterId: Id;
  readonly fragmentMaterialId: Id;
}

export type SummonOutcome = SummonCharacter | SummonDuplicate;

export interface SummonResult {
  readonly outcome: SummonOutcome;
  // O contador DEPOIS desta rolagem. Quem chama persiste; o motor não guarda nada.
  readonly pity: PityState;
}
