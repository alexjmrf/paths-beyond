import { describe, expect, it } from 'vitest';
import { MAX_AWAKENING } from '../../src/economy/awakening.js';
import {
  AWAKENING_PARA_HERO,
  AWAKENING_PARA_LEGEND,
  RANKS_CORRENTES,
  RANKS_DE_BASE,
  rankCorrente,
  type BaseRank,
} from '../../src/economy/rank.js';

// M37, sub-sessão 1/N — OS TRÊS RANKS: Adventurer, Hero e Legend.
//
// **A decisão que este arquivo protege é a de que rank é DUAS coisas.** O rank de BASE é
// identidade do personagem e mora no catálogo (`packages/data`, ao lado de classe e
// `acquisition`); o rank CORRENTE é progressão daquela conta. Guardar o corrente como um campo
// gravado seria repetir o erro que o M18 2/N pagou com o fragmento de imprint — o dado
// descrevendo o que é estado de conta, com dois donos para o mesmo número.
//
// A saída é não guardar o corrente em lugar nenhum: ele é uma FUNÇÃO de (base, awakening), e
// awakening já é estado de conta desde o M14, com repositório, curva, tela e idempotência. É a
// decisão do usuário registrada em DECISIONS.md §4 — "o terceiro rank monta no awakening" —
// levada ao pé da letra: nenhum eixo novo de progressão, nenhuma barra nova significando a
// mesma coisa.
//
// **A trava do milestone: rank não carrega poder.** O que separa um `Adventurer` de um `Hero`
// é a profundidade da árvore (D9: profundidade é troca de forma, não de poder, e o orçamento de
// 9 pontos é o mesmo para todos) e o custo de evolução. Nada aqui multiplica stat nenhum, e se
// um dia alguém tentar, `pnpm balance` reprova — é o que a 4/N vai travar com teste.
//
// **Os limiares são do usuário** (regra 10): `Adventurer` vira `Hero` em awakening 3 — metade da
// curva — e qualquer um vira `Legend` em 6, que é o teto que já existia. O teto NÃO sobe.

describe('M37 1/N — o rank corrente é DERIVADO, nunca guardado', () => {
  it('`Legend` é o topo da curva, e o topo é o `MAX_AWAKENING` que já existia', () => {
    // A decisão do usuário foi "mesma curva, teto continua 6". Se alguém subir
    // `MAX_AWAKENING` sem pensar no rank, é aqui que aparece.
    expect(AWAKENING_PARA_LEGEND).toBe(MAX_AWAKENING);
    expect(MAX_AWAKENING).toBe(6);
  });

  it('o `Adventurer` vira `Hero` na METADE da curva, e não no topo', () => {
    expect(AWAKENING_PARA_HERO).toBe(3);
    expect(AWAKENING_PARA_HERO).toBeLessThan(AWAKENING_PARA_LEGEND);
  });

  it('um `Adventurer` de base atravessa a curva INTEIRA: adventurer → hero → legend', () => {
    // É o "mais difícil de upgradar" da decisão do usuário, e ele é feito de DEGRAUS, não de
    // número de poder: o Adventurer paga 0→3 para chegar onde o Hero já nasce.
    expect(rankCorrente('adventurer', 0)).toBe('adventurer');
    expect(rankCorrente('adventurer', 1)).toBe('adventurer');
    expect(rankCorrente('adventurer', 2)).toBe('adventurer');
    expect(rankCorrente('adventurer', 3)).toBe('hero');
    expect(rankCorrente('adventurer', 5)).toBe('hero');
    expect(rankCorrente('adventurer', 6)).toBe('legend');
  });

  it('um `Hero` de base sobe DIRETO para `Legend` — os caminhos são assimétricos de propósito', () => {
    expect(rankCorrente('hero', 0)).toBe('hero');
    expect(rankCorrente('hero', 3)).toBe('hero');
    expect(rankCorrente('hero', 5)).toBe('hero');
    expect(rankCorrente('hero', 6)).toBe('legend');
  });

  it('um `Adventurer` promovido e um `Hero` de base são INDISTINGUÍVEIS em regra', () => {
    // É o critério de aceite do M37, e é a razão de o rank corrente ser uma função de uma
    // coisa só: não há campo por onde a origem vazar. Depois de promovido, o que a regra
    // enxerga é `'hero'` dos dois lados.
    for (let awakening = AWAKENING_PARA_HERO; awakening < AWAKENING_PARA_LEGEND; awakening += 1) {
      expect(rankCorrente('adventurer', awakening)).toBe(rankCorrente('hero', awakening));
    }
    expect(rankCorrente('adventurer', AWAKENING_PARA_LEGEND)).toBe(rankCorrente('hero', AWAKENING_PARA_LEGEND));
  });

  it('`Legend` nunca é rank de BASE — chega-se nele por evolução, e só', () => {
    // Decisão de D47... não: de DECISIONS.md §1 — "o topo não é invocável". O tipo o diz, e o
    // conjunto em runtime também, para quem lê o JSON sem TypeScript.
    expect([...RANKS_DE_BASE].sort()).toEqual(['adventurer', 'hero']);
    expect(RANKS_DE_BASE as readonly string[]).not.toContain('legend');
    expect([...RANKS_CORRENTES].sort()).toEqual(['adventurer', 'hero', 'legend']);
  });

  it('todo rank de base, em todo awakening da faixa, devolve um rank corrente válido', () => {
    // A varredura existe para o dia em que um rank novo entrar: sem ela, um `case` esquecido
    // devolveria `undefined` e a tela mostraria um rank em branco.
    const validos = new Set<string>(RANKS_CORRENTES);
    for (const base of RANKS_DE_BASE) {
      for (let awakening = 0; awakening <= MAX_AWAKENING; awakening += 1) {
        expect(validos.has(rankCorrente(base, awakening)), `${base} @ ${awakening}`).toBe(true);
      }
    }
  });

  it('o rank nunca REGRIDE ao longo da curva — awakening só sobe, e o rank acompanha', () => {
    const ordem: Readonly<Record<string, number>> = { adventurer: 0, hero: 1, legend: 2 };
    for (const base of RANKS_DE_BASE) {
      for (let awakening = 1; awakening <= MAX_AWAKENING; awakening += 1) {
        const antes = ordem[rankCorrente(base, awakening - 1)]!;
        const depois = ordem[rankCorrente(base, awakening)]!;
        expect(depois, `${base}: ${awakening - 1} → ${awakening}`).toBeGreaterThanOrEqual(antes);
      }
    }
  });

  it('awakening fora da faixa não inventa rank: abaixo de 0 é a base, acima do teto é `Legend`', () => {
    // Dado de conta corrompido ou de uma versão futura não pode virar `undefined` na tela.
    for (const base of RANKS_DE_BASE as readonly BaseRank[]) {
      expect(rankCorrente(base, -1)).toBe(base);
      expect(rankCorrente(base, 99)).toBe('legend');
    }
  });

  it('é pura: a mesma entrada devolve o mesmo rank, sempre', () => {
    for (const base of RANKS_DE_BASE) {
      for (let awakening = 0; awakening <= MAX_AWAKENING; awakening += 1) {
        expect(rankCorrente(base, awakening)).toBe(rankCorrente(base, awakening));
      }
    }
  });
});
