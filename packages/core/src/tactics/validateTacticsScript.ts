import type { Id } from '../types.js';
import type { TacticsScript } from './types.js';

// §6.3 (M18, sub-sessão 7/N) — os TETOS do script tático.
//
// A spec sempre disse "lista ordenada de até 6 linhas" e "conditions: AND entre elas; 2 no
// início, até 3 com talentos", e **nada no projeto jamais conferiu nenhuma das duas
// coisas**. O schema de `packages/data` limita a 6 linhas o que é AUTORADO, e o jogador
// editando o script pelo cliente não passava por trava alguma. Os efeitos
// `extraTacticsSlot` e `extraTacticsCondition` são resolvidos por `resolveTalentEffects`
// desde M17 e não tinham **um único consumidor** — o mesmo padrão de campo inerte que M10,
// M11 e M15 passaram o projeto corrigindo.
//
// Isto é validação de PREPARAÇÃO, não de combate: mesmo recorte de
// `validateColumnAllocation` (M17), que também mora no core, também é pura e também não é
// chamada por `simulate`. Quem decide dentro do duelo continua sendo `selectTacticsAction`,
// literal como §6.3 manda (regra 6) — este arquivo decide o que o jogador pode SALVAR, não
// o que acontece na troca.
//
// Por que no core e não no servidor: o teto é regra (§6.3), e o cliente precisa da mesma
// conta para desabilitar o botão antes de virar requisição. Regra em dois lugares é regra
// que diverge; aqui ela tem um dono só, e os dois lados a importam.

// Decisão do usuário (M18, 7/N): o teto BASE de linhas é 4.
//
// §6.3 escreve o teto de condições com o base junto ("2 no início, até 3 com talentos") e o
// de linhas sem ("até 6"). Como `extraTacticsSlot` levanta o teto, 6 não podia ser o base —
// seria um efeito autorado nas nove árvores sem nada que ele pudesse fazer. Com base 4, os
// +2 slots que a árvore do Aren concede chegam exatamente aos 6 da spec: o número escrito
// vira o topo alcançável em vez de um limite solto. As outras oito árvores concedem +1 e
// param em 5. Ver DECISIONS.md.
export const BASE_TACTICS_LINES = 4;

// §6.3 — "lista ordenada de até 6 linhas". É o teto ABSOLUTO: nenhum talento passa daqui,
// por mais slot que alguém venha a autorar.
export const MAX_TACTICS_LINES = 6;

// §6.3 — "2 no início, até 3 com talentos". Os dois números estão na spec.
export const BASE_TACTICS_CONDITIONS = 2;
export const MAX_TACTICS_CONDITIONS = 3;

export interface TacticsValidationIssue {
  // Índice da linha (base 0) quando o problema é DE uma linha; ausente quando é do script
  // inteiro, como estourar o teto de linhas. Sem isto a tela teria de adivinhar onde
  // pintar o erro.
  readonly line?: number;
  readonly reason: string;
}

export interface TacticsValidationResult {
  readonly valid: boolean;
  readonly issues: readonly TacticsValidationIssue[];
}

export interface ValidateTacticsScriptInput {
  readonly script: TacticsScript;
  // Vindos de `resolveTalentEffects` (§8.2): quantas linhas e quantas condições a mais os
  // talentos ALOCADOS daquele herói concedem. Quem resolve a árvore é quem chama — este
  // módulo não sabe o que é um talento, do mesmo jeito que `resolveHeroStatSheet` recebe a
  // árvore pronta em vez de buscá-la.
  readonly extraSlots: number;
  readonly extraConditions: number;
  // As skills que a unidade conhece. Uma linha que nomeia skill de fora é linha morta: o
  // algoritmo de §6.3 é literal e simplesmente a pula, então o jogador ficaria com um
  // script que não faz o que ele leu — e um cliente adulterado teria por onde tentar entrar.
  readonly knownSkillIds: readonly Id[];
}

function tetoDeLinhas(extraSlots: number): number {
  return Math.min(BASE_TACTICS_LINES + Math.max(0, extraSlots), MAX_TACTICS_LINES);
}

function tetoDeCondicoes(extraConditions: number): number {
  return Math.min(BASE_TACTICS_CONDITIONS + Math.max(0, extraConditions), MAX_TACTICS_CONDITIONS);
}

export function validateTacticsScript(input: ValidateTacticsScriptInput): TacticsValidationResult {
  const { script, extraSlots, extraConditions, knownSkillIds } = input;
  const issues: TacticsValidationIssue[] = [];

  const maxLinhas = tetoDeLinhas(extraSlots);
  if (script.length > maxLinhas) {
    issues.push({ reason: `o script tem ${script.length} linha(s); o teto é ${maxLinhas} (§6.3)` });
  }

  const maxCondicoes = tetoDeCondicoes(extraConditions);
  const conhecidas = new Set(knownSkillIds);

  script.forEach((linha, index) => {
    if (linha.conditions.length > maxCondicoes) {
      issues.push({
        line: index,
        reason: `a linha ${index + 1} tem ${linha.conditions.length} condições; o teto é ${maxCondicoes} (§6.3)`,
      });
    }

    // A linha DESABILITADA é validada igual: ela volta a valer com um clique, e deixar
    // entrar um script inválido "porque está desligado" é guardar a falha para depois.
    if (!conhecidas.has(linha.skillId)) {
      issues.push({ line: index, reason: `a linha ${index + 1} usa uma skill que a unidade não conhece: ${linha.skillId}` });
    }
  });

  return { valid: issues.length === 0, issues };
}
