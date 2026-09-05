import { describe, expect, it } from 'vitest';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { criarTradutor, IDIOMAS } from '../src/i18n/idioma.js';
import { nomeDeConteudo } from '../src/i18n/conteudo.js';

// §11/D24 (M25, sub-sessão 3/N) — o texto autorado, traduzível SEM DUPLICAR O DADO.
//
// É a metade do critério de aceite que fala do conteúdo. O que se afirma aqui é o mecanismo:
// o JSON de `packages/data` continua com um nome canônico só, o catálogo de idioma sobrepõe
// por id, e quem não tiver entrada aparece com o nome autorado — nunca com a chave crua.

describe('nomeDeConteudo()', () => {
  it('usa a tradução quando ela existe', () => {
    const t = criarTradutor('en', CATALOGOS);

    expect(nomeDeConteudo(t, 'masmorra', 'dungeon-forja-abandonada', 'Forja Abandonada')).toBe('Abandoned Forge');
  });

  it('cai no nome AUTORADO quando não há tradução — e nunca mostra a chave', () => {
    // É o estado normal de todo conteúdo que ainda não foi traduzido, e vai ser o estado das
    // trinta missões do M27 no dia em que elas forem autoradas.
    const t = criarTradutor('en', CATALOGOS);

    expect(nomeDeConteudo(t, 'skill', 'skill-que-ninguem-traduziu', 'Golpe Duplo')).toBe('Golpe Duplo');
  });

  it('o português também passa pelo mecanismo, e não pelo acaso de o dado ser português', () => {
    const t = criarTradutor('pt', CATALOGOS);

    expect(nomeDeConteudo(t, 'premio', 'achievement-primeiro-passo', 'qualquer coisa')).toBe('Primeiro Passo');
  });

  it('as dez conquistas e as oito masmorras estão traduzidas nas duas línguas', () => {
    // Elas são o conteúdo que as telas convertidas mostram por nome. O resto do catálogo
    // (skills, itens, inimigos) continua caindo no autorado, o que é o comportamento
    // declarado — e o teste acima é quem prova que isso não quebra a tela.
    for (const idioma of IDIOMAS) {
      const chaves = Object.keys(CATALOGOS[idioma]);
      expect(chaves.filter((c) => c.startsWith('conteudo.premio.')), idioma).toHaveLength(10);
      expect(chaves.filter((c) => c.startsWith('conteudo.masmorra.')), idioma).toHaveLength(8);
    }
  });

  it('nome PRÓPRIO não tem entrada — Sylla é Sylla em toda língua', () => {
    // Decisão registrada: criar `conteudo.personagem.*` seria convidar alguém a traduzir o
    // nome de uma pessoa.
    for (const idioma of IDIOMAS) {
      const personagens = Object.keys(CATALOGOS[idioma]).filter((c) => c.startsWith('conteudo.personagem.'));
      expect(personagens, idioma).toEqual([]);
    }
  });
});
