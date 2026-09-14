import type { BattleOutcome, Hero } from '@paths-beyond/core';
import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { criarTradutor, IDIOMAS } from '../src/i18n/idioma.js';
import { CHAVE_DO_DESFECHO, nomeDeUnidade, nomeDoDesfecho, rotuloDeHeroi } from '../src/logic/rotulos.js';

// M32 — três rótulos que a batalha real mostrou CRUS, com sessão de verdade:
//
//   - "Resultado: ongoing" — `battleState.outcome` é a união do core ('ongoing' | 'victory'
//     | 'defeat'), e dez lugares do cliente a interpolavam direto no catálogo, nas duas
//     línguas. O M25 traduziu a frase em volta e deixou o enum no meio.
//   - "dev-wbsobanv-hero-jogador (class-espadachim)" — a lista de quem vai à missão mostrava
//     `hero.id` e `hero.classId`. O personagem tem nome autorado (Aren) e a classe tem
//     entrada no catálogo desde o M25 3/N; nenhum dos dois era usado ali.
//   - "player-dev-wbsobanv-hero-jogador" — a lista de iniciativa e o painel de recursos
//     mostravam `unitId`, que é uma chave de transporte e não um nome.
//
// Nome próprio NÃO se traduz (decisão do M25, `nomesAutorados.ts`): Aren é Aren nas duas
// línguas. O que passa pela camada de idioma é a classe e o desfecho.

const ESPADACHIM: Hero = {
  id: 'dev-wbsobanv-hero-jogador',
  characterId: 'hero-jogador',
  classId: 'class-espadachim',
  level: 1,
  exp: 0,
  awakening: 0,
  imprint: 0,
  talents: {},
  equipment: { weapon: null, helmet: null, armor: null, necklace: null, ring: null, boots: null },
  tacticsScript: [],
  reactionScript: [],
} as unknown as Hero;

describe('o desfecho da batalha passa pela camada de idioma', () => {
  // `Record<BattleOutcome, string>` é exaustivo em tempo de compilação: um valor novo na
  // união do core não compila sem chave. Aqui o que se confere é o outro lado — que cada
  // chave tem texto nas duas línguas e que o texto muda com o idioma.
  const DESFECHOS = Object.keys(CHAVE_DO_DESFECHO) as readonly BattleOutcome[];

  it('cobre os três desfechos do core', () => {
    expect([...DESFECHOS].sort()).toEqual(['defeat', 'ongoing', 'victory']);
  });

  for (const desfecho of DESFECHOS) {
    // Em inglês a palavra coincide com o enum ('victory'); a prova de que passa pela camada
    // é o texto MUDAR com o idioma, não ser diferente do enum.
    it(`${desfecho}: existe nas duas línguas e muda com o idioma`, () => {
      for (const idioma of IDIOMAS) {
        const texto = nomeDoDesfecho(criarTradutor(idioma, CATALOGOS), desfecho);
        expect(CATALOGOS[idioma][CHAVE_DO_DESFECHO[desfecho]], `${desfecho} em ${idioma}`).toBeTruthy();
        expect(texto).not.toContain('desfecho.');
      }
      expect(nomeDoDesfecho(criarTradutor('en', CATALOGOS), desfecho)).not.toBe(
        nomeDoDesfecho(criarTradutor('pt', CATALOGOS), desfecho),
      );
    });
  }
});

describe('o rótulo de um herói é o personagem e a classe, não os ids', () => {
  it('nome autorado do personagem + classe traduzida', () => {
    const en = rotuloDeHeroi(criarTradutor('en', CATALOGOS), ESPADACHIM, catalog);
    const pt = rotuloDeHeroi(criarTradutor('pt', CATALOGOS), ESPADACHIM, catalog);
    expect(en.nome).toBe(catalog.characters['hero-jogador']!.name);
    expect(pt.nome).toBe(en.nome);
    expect(en.classe).toBe('Swordsman');
    expect(pt.classe).toBe('Espadachim');
  });

  it('herói sem personagem no catálogo cai no id, nunca em "undefined"', () => {
    const orfao = { ...ESPADACHIM, characterId: 'personagem-que-nao-existe' } as Hero;
    const rotulo = rotuloDeHeroi(criarTradutor('en', CATALOGOS), orfao, catalog);
    expect(rotulo.nome).toBe(orfao.id);
    expect(rotulo.classe).toBe('Swordsman');
  });
});

describe('o nome de uma unidade do tabuleiro', () => {
  const t = criarTradutor('en', CATALOGOS);
  const heroesByUnitId = { 'player-dev-wbsobanv-hero-jogador': ESPADACHIM };

  it('unidade do jogador: o nome do personagem', () => {
    expect(nomeDeUnidade(t, 'player-dev-wbsobanv-hero-jogador', heroesByUnitId, catalog)).toBe(
      catalog.characters['hero-jogador']!.name,
    );
  });

  it('unidade sem herói conhecido (inimigo, defesa de outra conta): o id, como antes', () => {
    expect(nomeDeUnidade(t, 'unit-alvo-1', heroesByUnitId, catalog)).toBe('unit-alvo-1');
  });
});
