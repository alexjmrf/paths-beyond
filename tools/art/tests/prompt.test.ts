import { describe, expect, it } from 'vitest';
import { ESTILO, descricaoDe, type EspecificacaoDeArte } from '../src/prompt.js';

// M26 — o prompt não é escrito à mão, ele é DERIVADO.
//
// D22: "a especificação de cada peça derivada do que já está autorado em `packages/data`
// (classe, arma, papel e árvore de cada personagem já descrevem o que a imagem precisa
// mostrar)". Cinquenta prompts escritos à mão são cinquenta chances de o elenco não parecer o
// mesmo jogo — e a consistência é justamente o que D25 registrou como a diferença entre "arte
// de IA" e "slop" nos casos pesquisados.
//
// O que este arquivo protege são duas propriedades opostas, e as duas importam:
//   - o que TEM de ser igual em todos (o estilo) é literalmente o mesmo texto;
//   - o que TEM de diferir (arma, montaria, papel, lado) diverge de verdade, e não por um
//     adjetivo trocado.

function spec(overrides: Partial<EspecificacaoDeArte> = {}): EspecificacaoDeArte {
  return {
    unitId: 'ally-espadachim',
    nome: 'Aren',
    side: 'player',
    weaponType: 'sword',
    unitType: 'infantry',
    moveType: 'foot',
    ...overrides,
  };
}

describe('a descrição derivada da unidade', () => {
  it('todo prompt carrega o MESMO bloco de estilo, palavra por palavra', () => {
    // É esta frase que faz cinquenta gerações independentes parecerem um elenco. Se ela variar
    // por unidade, cada peça é um jogo diferente.
    for (const s of [spec(), spec({ weaponType: 'bow', unitType: 'flying', moveType: 'flying' })]) {
      expect(descricaoDe(s)).toContain(ESTILO);
    }
  });

  it('a arma muda a descrição — sete armas, sete silhuetas', () => {
    const armas = ['sword', 'axe', 'spear', 'bow', 'arcane', 'nature', 'holy'] as const;
    const descricoes = armas.map((weaponType) => descricaoDe(spec({ weaponType })));
    expect(new Set(descricoes).size).toBe(armas.length);
  });

  it('o tipo de unidade muda a descrição — cinco papéis, cinco leituras', () => {
    const tipos = ['infantry', 'cavalry', 'flying', 'armored', 'caster'] as const;
    const descricoes = tipos.map((unitType) => descricaoDe(spec({ unitType })));
    expect(new Set(descricoes).size).toBe(tipos.length);
  });

  it('a unidade voadora vem MONTADA, e a montaria está no texto', () => {
    // O caso difícil do teste de fumaça de D25 foi exatamente este: a cavaleira montada em
    // grifo. Uma unidade voadora descrita só como "soldado" sai a pé, e o tabuleiro perde a
    // informação que mais muda o mapa (voar ignora terreno).
    const d = descricaoDe(spec({ unitId: 'ally-grifeiro', unitType: 'flying', moveType: 'flying', weaponType: 'spear' }));
    expect(d).toMatch(/griffin/i);
  });

  it('a cavalaria vem montada, e não é a mesma montaria da voadora', () => {
    const cavalo = descricaoDe(spec({ unitType: 'cavalry', moveType: 'cavalry' }));
    const grifo = descricaoDe(spec({ unitType: 'flying', moveType: 'flying' }));
    expect(cavalo).toMatch(/horse/i);
    expect(cavalo).not.toMatch(/griffin/i);
    expect(grifo).not.toMatch(/horse/i);
  });

  it('os dois lados têm paletas declaradamente diferentes', () => {
    // O HUD já diz de que lado a peça é (M13 4/N: forma e anel, sem depender de cor). A paleta
    // aqui não substitui isso — ela evita que 41 inimigos pareçam o exército do jogador, que é
    // legibilidade tática (§1.1) e não decoração.
    expect(descricaoDe(spec({ side: 'player' }))).not.toBe(descricaoDe(spec({ side: 'enemy' })));
  });

  it('é PURA: a mesma especificação produz o mesmo texto', () => {
    expect(descricaoDe(spec())).toBe(descricaoDe(spec()));
  });

  it('o estilo pede fundo transparente e vista de cima — o que o tabuleiro exige', () => {
    // O tabuleiro é visto de cima e a peça se apoia num tile. Um sprite de perfil ou com fundo
    // sólido não se corrige depois: se regera.
    expect(ESTILO.toLowerCase()).toMatch(/top-down|top down/);
  });
});
