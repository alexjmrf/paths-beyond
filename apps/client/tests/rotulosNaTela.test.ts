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
  // O ticket já leva o id por unidade dos DOIS lados (`characterIdByUnitId`, que a store guarda
  // como `artIdByUnitId`): personagem do lado do jogador, inimigo de `enemies/` do outro.
  const artIdByUnitId = { 'player-dev-wbsobanv-hero-jogador': 'hero-jogador', 'unit-alvo-1': 'enemy-treino-alvo-espadachim' };

  it('unidade do jogador: o nome do personagem', () => {
    expect(nomeDeUnidade(t, 'player-dev-wbsobanv-hero-jogador', heroesByUnitId, artIdByUnitId, catalog)).toBe(
      catalog.characters['hero-jogador']!.name,
    );
  });

  // M35 1/N (D43) — o inimigo comum pelo nome, traduzido. `unit-alvo-1` era o que a lista de
  // iniciativa e a cena de duelo mostravam com sessão de verdade.
  //
  // **M36 3/N (D48) — o nome passou a vir SÓ da camada de idioma.** Ele era lido de
  // `catalog.enemies[artId].name`, e `enemies/` saiu do bundle do cliente: o arquivo que tem o
  // nome é o mesmo que tem os stats. Quem garante que todo inimigo do catálogo tem entrada nas
  // duas línguas é `conteudoTraduzido.test.ts`, lendo o catálogo REAL do disco — então a única
  // fonte que restou é também a única de que se precisa.
  it('inimigo: o nome pela camada de idioma, nas duas línguas, sem catálogo de inimigos', () => {
    const en = nomeDeUnidade(criarTradutor('en', CATALOGOS), 'unit-alvo-1', heroesByUnitId, artIdByUnitId, catalog);
    const pt = nomeDeUnidade(criarTradutor('pt', CATALOGOS), 'unit-alvo-1', heroesByUnitId, artIdByUnitId, catalog);
    expect(en).not.toBe(pt);
    expect(pt).not.toContain('conteudo.');
    expect(en).not.toContain('conteudo.');
    expect(pt).not.toBe('unit-alvo-1');
    expect(en).not.toBe('unit-alvo-1');
    // E o id de arte não vaza para a tela como se fosse nome.
    expect(pt).not.toBe('enemy-treino-alvo-espadachim');
  });

  it('id de arte sem tradução cai no `unitId`, e nunca na chave crua nem no id', () => {
    // O fundo do poço mudou com o catálogo partido: antes era o nome autorado, agora é o
    // `unitId`. Ele não é alcançado por conteúdo de verdade — mas é o que uma build com um
    // inimigo novo e ainda sem tradução mostraria, e não pode ser `conteudo.inimigo.foo`.
    const nome = nomeDeUnidade(t, 'unit-novo', {}, { 'unit-novo': 'enemy-que-ninguem-traduziu' }, catalog);
    expect(nome).toBe('unit-novo');
  });

  it('unidade sem herói E sem id de arte (replay antigo, defesa de outra conta): o id, como antes', () => {
    expect(nomeDeUnidade(t, 'unit-misterio', heroesByUnitId, {}, catalog)).toBe('unit-misterio');
  });
});
