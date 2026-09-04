import { describe, expect, it } from 'vitest';
import {
  BASE_TACTICS_CONDITIONS,
  BASE_TACTICS_LINES,
  MAX_TACTICS_LINES,
  validateTacticsScript,
  type TacticsScript,
} from '../../src/index.js';

// §6.3 (M18, sub-sessão 7/N) — os TETOS do script tático, aplicados pela primeira vez.
//
// A spec sempre disse "lista ordenada de até 6 linhas" e "2 condições no início, até 3 com
// talentos", e nada no projeto jamais conferiu nenhuma das duas coisas: o schema de
// `packages/data` limita a 6 linhas o que é AUTORADO, e o jogador editando o script no
// cliente não passava por trava nenhuma. Os efeitos `extraTacticsSlot` e
// `extraTacticsCondition` são resolvidos desde M17 e não tinham um único consumidor.
//
// O teto base de linhas é decisão do usuário (4, chegando aos 6 de §6.3 com os dois slots
// que a árvore do Aren concede) — ver DECISIONS.md.
//
// Isto é validação de PREPARAÇÃO e não de combate: mesmo recorte de
// `validateColumnAllocation`, que também mora no core e também não é chamada por
// `simulate`. Quem decide dentro do duelo continua sendo `selectTacticsAction`, literal
// como §6.3 manda.

const CONHECIDAS = ['skill-ataque', 'skill-especial', 'skill-cura'];

function linha(skillId = 'skill-especial', conditions: number = 0): TacticsScript[number] {
  return {
    enabled: true,
    skillId,
    conditions: Array.from({ length: conditions }, (_unused, i) => ({
      t: 'selfHpBelow' as const,
      pct: 100 * (i + 1),
    })),
  };
}

function script(linhas: number, conditions = 0): TacticsScript {
  return Array.from({ length: linhas }, () => linha('skill-especial', conditions));
}

function valida(input: {
  script: TacticsScript;
  extraSlots?: number;
  extraConditions?: number;
  knownSkillIds?: readonly string[];
}) {
  return validateTacticsScript({
    script: input.script,
    extraSlots: input.extraSlots ?? 0,
    extraConditions: input.extraConditions ?? 0,
    knownSkillIds: input.knownSkillIds ?? CONHECIDAS,
  });
}

describe('§6.3 — o teto de LINHAS', () => {
  it('as constantes batem com a spec: base 4, teto absoluto 6', () => {
    expect(BASE_TACTICS_LINES).toBe(4);
    expect(MAX_TACTICS_LINES).toBe(6);
  });

  it('aceita um script vazio: não ter script é legítimo', () => {
    expect(valida({ script: [] }).valid).toBe(true);
  });

  it('aceita o script no teto base', () => {
    expect(valida({ script: script(BASE_TACTICS_LINES) }).valid).toBe(true);
  });

  it('recusa uma linha acima do teto base, sem talento', () => {
    const resultado = valida({ script: script(BASE_TACTICS_LINES + 1) });

    expect(resultado.valid).toBe(false);
    expect(resultado.issues[0]?.reason).toContain('linha');
  });

  // Este é o teste que dá consumidor ao `extraTacticsSlot` de M17: sem ele, o efeito
  // continuaria resolvido e inerte, e o nó da árvore que o concede seria um ponto morto.
  it('o talento de SLOT levanta o teto, e o mesmo script passa', () => {
    const cincoLinhas = script(BASE_TACTICS_LINES + 1);

    expect(valida({ script: cincoLinhas }).valid).toBe(false);
    expect(valida({ script: cincoLinhas, extraSlots: 1 }).valid).toBe(true);
  });

  it('o teto nunca passa dos 6 de §6.3, por mais talento que haja', () => {
    const resultado = valida({ script: script(MAX_TACTICS_LINES + 1), extraSlots: 10 });

    expect(resultado.valid).toBe(false);
    expect(resultado.issues[0]?.reason).toContain(String(MAX_TACTICS_LINES));
  });
});

describe('§6.3 — o teto de CONDIÇÕES por linha', () => {
  it('a constante bate com a spec: 2 no início', () => {
    expect(BASE_TACTICS_CONDITIONS).toBe(2);
  });

  it('duas condições passam; três não, sem talento', () => {
    expect(valida({ script: [linha('skill-especial', BASE_TACTICS_CONDITIONS)] }).valid).toBe(true);
    expect(valida({ script: [linha('skill-especial', BASE_TACTICS_CONDITIONS + 1)] }).valid).toBe(false);
  });

  it('o talento de CONDIÇÃO libera a terceira — "até 3 com talentos", literal', () => {
    const tresCondicoes = [linha('skill-especial', 3)];

    expect(valida({ script: tresCondicoes }).valid).toBe(false);
    expect(valida({ script: tresCondicoes, extraConditions: 1 }).valid).toBe(true);
  });

  // O teto é POR LINHA, não do script inteiro: duas linhas com duas condições cada são
  // quatro condições no total e continuam legais.
  it('o teto é por linha, e não a soma do script', () => {
    expect(valida({ script: script(2, BASE_TACTICS_CONDITIONS) }).valid).toBe(true);
  });

  it('aponta QUAL linha estourou, não só que estourou', () => {
    const resultado = valida({
      script: [linha('skill-especial', 1), linha('skill-especial', 5)],
      extraConditions: 0,
    });

    expect(resultado.valid).toBe(false);
    expect(resultado.issues.some((issue) => issue.line === 1)).toBe(true);
  });
});

describe('§6.3 — a skill da linha tem de ser uma que a unidade conhece', () => {
  it('aceita skill conhecida', () => {
    expect(valida({ script: [linha('skill-cura')] }).valid).toBe(true);
  });

  // Sem esta trava, um script poderia nomear a especial de outra classe: o algoritmo de
  // §6.3 é literal e simplesmente pularia a linha, então o jogador teria uma linha morta
  // sem nada avisando — e um cliente adulterado teria por onde tentar entrar.
  it('recusa skill que a unidade não conhece', () => {
    const resultado = valida({ script: [linha('skill-especial-de-outra-classe')] });

    expect(resultado.valid).toBe(false);
    expect(resultado.issues[0]?.reason).toContain('skill');
  });

  it('a linha DESABILITADA também é validada: ela volta a valer com um clique', () => {
    const desabilitada: TacticsScript = [{ enabled: false, skillId: 'skill-inexistente', conditions: [] }];

    expect(valida({ script: desabilitada }).valid).toBe(false);
  });
});

describe('a validação é pura e não muda o que recebe', () => {
  it('o script entra e sai idêntico', () => {
    const original = script(2, 1);
    const copia = JSON.parse(JSON.stringify(original)) as TacticsScript;

    valida({ script: original });

    expect(original).toEqual(copia);
  });
});
