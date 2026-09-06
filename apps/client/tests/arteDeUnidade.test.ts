import type { BattleUnit, Hero } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { artIdDeUnidade, arteDeUnidade, unidadesComArte, urlsDeArte } from '../src/data/unitArt.js';

// M26 — a ponte entre a unidade de BATALHA e a entrada do manifesto.
//
// O bug que este arquivo existe para impedir é silencioso: os dois lados tiram a chave de
// campos DIFERENTES de `BattleUnit`, e errar isso não quebra nada — só faz metade do tabuleiro
// continuar desenhada por código depois de a arte ter sido gerada e paga.
//
//   - o inimigo de fase é autorado direto (M17 3/N), e `assemble.ts` copia o id dele para
//     `heroId`. Ele já É a chave;
//   - o herói do jogador tem em `heroId` o id da INSTÂNCIA, que não é o personagem. Quem é
//     aquela pessoa mora no roster, no mesmo caminho que `characterTreeForUnit` (M17 4/N) usa.

function unidade(overrides: Partial<BattleUnit> = {}): Pick<BattleUnit, 'unitId' | 'heroId' | 'side'> {
  return { unitId: 'u1', heroId: 'hero-instancia-7', side: 'player', ...overrides };
}

const roster = {
  u1: { id: 'hero-instancia-7', characterId: 'ally-guerreiro' } as unknown as Hero,
};

describe('a chave da unidade no manifesto de arte', () => {
  it('o inimigo de fase usa o próprio id — ele é autorado, e o id dele é a chave', () => {
    expect(artIdDeUnidade({}, unidade({ side: 'enemy', heroId: 'enemy-bandido' }))).toBe('enemy-bandido');
  });

  it('o herói do jogador usa o PERSONAGEM, não a instância', () => {
    // `hero-instancia-7` não é ninguém no manifesto. Usar `heroId` aqui daria `undefined` para
    // todo o elenco, e o efeito visível seria "a arte não apareceu" — sem erro nenhum.
    expect(artIdDeUnidade(roster, unidade())).toBe('ally-guerreiro');
    expect(artIdDeUnidade(roster, unidade())).not.toBe('hero-instancia-7');
  });

  it('unidade fora do roster devolve `undefined`, e isso é a resposta certa', () => {
    // Reforço invocado (§5.6) e aliado de cenário (D16) não têm entrada. Eles caem no glifo do
    // M16, que é uma peça legível — não um buraco no tabuleiro.
    expect(artIdDeUnidade({}, unidade())).toBeUndefined();
    expect(artIdDeUnidade(roster, unidade({ unitId: 'u9' }))).toBeUndefined();
  });

  it('o inimigo não depende do roster: PvP, masmorra e replay não têm um', () => {
    // O `BattleSetup` desses três modos vem pronto do servidor. Se a chave do inimigo passasse
    // pelo roster, o tabuleiro do PvP seria o único sem arte — e ninguém notaria em campanha.
    expect(artIdDeUnidade({}, unidade({ side: 'enemy', heroId: 'enemy-tirano' }))).toBe('enemy-tirano');
  });

  // M26 3/N — o terceiro nível, que é o único que responde por PvP.
  it('o mapa do servidor resolve o OPONENTE de PvP, que nenhum roster alcança', () => {
    // O time do defensor são instâncias de herói de outra conta: sem o mapa, `heroId` é
    // 'h-de-outra-conta', que não é ninguém no manifesto, e o oponente inteiro sai em disco.
    const doServidor = { u1: 'ally-arqueiro' };
    expect(artIdDeUnidade({}, unidade({ side: 'enemy', heroId: 'h-de-outra-conta' }), doServidor)).toBe(
      'ally-arqueiro',
    );
  });

  it('o mapa do servidor tem precedência sobre o roster', () => {
    // Quem montou a batalha foi o servidor; o roster é o que a conta tem AGORA. Num replay
    // antigo os dois podem discordar, e a resposta certa é a de quem estava no tabuleiro.
    expect(artIdDeUnidade(roster, unidade(), { u1: 'ally-clerigo' })).toBe('ally-clerigo');
  });

  it('mapa vazio não apaga o que o roster já resolvia', () => {
    // A campanha jogada sem ticket (tabuleiro de abertura, suíte) continua pelo nível 2. Um
    // mapa vazio tomando precedência devolveria `undefined` e apagaria a arte da campanha.
    expect(artIdDeUnidade(roster, unidade(), {})).toBe('ally-guerreiro');
    expect(artIdDeUnidade({}, unidade({ side: 'enemy', heroId: 'enemy-bandido' }), {})).toBe('enemy-bandido');
  });

  it('unidade fora do mapa do servidor cai nos níveis seguintes', () => {
    // O aliado de cenário sem personagem (D16) não entra no mapa. Ele tem de cair no glifo, e
    // não fazer a unidade AO LADO dele perder a peça.
    const doServidor = { outra: 'ally-guerreiro' };
    expect(artIdDeUnidade({}, unidade({ unitId: 'npc' }), doServidor)).toBeUndefined();
  });
});

describe('o resolvedor de arte do cliente', () => {
  it('sem `artId`, não há arte — é o caminho do glifo, e não um erro', () => {
    expect(arteDeUnidade(undefined)).toBeUndefined();
  });

  it('id que não está no manifesto também não tem arte', () => {
    expect(arteDeUnidade('nao-existe-esta-unidade')).toBeUndefined();
  });

  it('toda unidade com arte carregada tem `src` e `frameSize`, e entra na lista de pré-carga', () => {
    // Vale com o elenco inteiro em glifo (a lista fica vazia) e vale depois de a geração em
    // massa entrar: o que se afirma é a coerência entre as duas saídas, não uma contagem.
    const urls = urlsDeArte();
    for (const id of unidadesComArte()) {
      const arte = arteDeUnidade(id)!;
      expect(arte.src.length, id).toBeGreaterThan(0);
      expect(arte.frameSize, id).toBeGreaterThan(0);
      expect(urls, id).toContain(arte.src);
    }
    expect(urls.length).toBe(new Set(urls).size);
  });
});
