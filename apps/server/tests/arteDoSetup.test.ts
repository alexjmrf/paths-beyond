import { describe, expect, it } from 'vitest';
import type { ClassDef, EnemyDef, Hero, Placement } from '@paths-beyond/core';
import { characterIdsForPlacements } from '../src/battle/artIds.js';

// M26 3/N — quem é cada unidade do tabuleiro, para o CLIENTE DESENHAR.
//
// O buraco que isto fecha foi medido em 1/N: em PvP, masmorra e replay o `BattleSetup` chega
// pronto do servidor e o cliente não tem como saber que PERSONAGEM é cada unidade — o
// `heroId` de uma unidade do jogador é o id da INSTÂNCIA de herói, não o do personagem. Sem
// isso, o tabuleiro cai no glifo do M16 nos três modos, e a milestone da arte entrega arte só
// na campanha.
//
// **Por que ao lado do setup e não DENTRO dele** (decisão do usuário, 3/N): pôr `characterId`
// em `BattleUnit` mexeria em `packages/core` e obrigaria a subir `RULES_VERSION` (regra 11)
// por um dado que nenhuma regra lê — enquanto o critério de aceite do M26 afirma justamente
// que o core fica intocado. O mapa viaja no ticket, que é a resposta de uma rota e não um
// artefato de regra.
//
// A função é PURA e mora fora das rotas porque as quatro superfícies (arena, masmorra,
// capítulo, replay) precisam da MESMA resposta: quatro montagens seriam quatro chances de o
// tabuleiro desenhar uma coisa numa tela e outra na seguinte.

const CLASSE = { id: 'class-espadachim' } as unknown as ClassDef;

function heroi(id: string, characterId?: string): Hero {
  return { id, ...(characterId ? { characterId } : {}) } as unknown as Hero;
}

function placementDeHeroi(unitId: string, hero: Hero, side: 'player' | 'enemy' = 'player'): Placement {
  return { unitId, hero, classDef: CLASSE, equippedItems: [], side, pos: { x: 0, y: 0 }, height: 0 } as Placement;
}

function placementDeInimigo(unitId: string, enemyId: string): Placement {
  return {
    unitId,
    enemy: { id: enemyId } as unknown as EnemyDef,
    side: 'enemy',
    pos: { x: 0, y: 0 },
    height: 0,
  } as Placement;
}

describe('characterIdsForPlacements', () => {
  it('mapeia a unidade do jogador para o PERSONAGEM, não para a instância de herói', () => {
    const mapa = characterIdsForPlacements([placementDeHeroi('u1', heroi('h-9f3a', 'ally-guerreiro'))]);

    // É esta a linha inteira do bug: 'h-9f3a' não existe no manifesto de arte e cairia no glifo.
    expect(mapa).toEqual({ u1: 'ally-guerreiro' });
  });

  it('mapeia o inimigo autorado pelo id dele — o mesmo que o manifesto usa', () => {
    const mapa = characterIdsForPlacements([placementDeInimigo('u2', 'enemy-bandido')]);
    expect(mapa).toEqual({ u2: 'enemy-bandido' });
  });

  it('cobre os DOIS lados de um PvP, e é o lado do oponente que só o servidor sabe', () => {
    // O atacante resolve o próprio time pelo roster que já tem. O time do defensor são
    // instâncias de herói de OUTRA conta: nenhum caminho de cliente chega nelas.
    const mapa = characterIdsForPlacements([
      placementDeHeroi('meu', heroi('h-1', 'ally-guerreiro')),
      placementDeHeroi('dele', heroi('h-2', 'ally-arqueiro'), 'enemy'),
    ]);

    expect(mapa).toEqual({ meu: 'ally-guerreiro', dele: 'ally-arqueiro' });
  });

  it('omite quem não é personagem em vez de inventar uma chave', () => {
    // Ficha de cenário: reforço invocado, aliado de NPC (M18 5/N). `characterId` ausente é
    // estado NORMAL (`Hero.characterId` é opcional em `packages/core`), e a resposta certa é
    // o glifo do M16 — não uma entrada apontando para arte que não existe.
    const mapa = characterIdsForPlacements([
      placementDeHeroi('npc', heroi('h-npc')),
      placementDeHeroi('real', heroi('h-real', 'ally-clerigo')),
    ]);

    expect(mapa).toEqual({ real: 'ally-clerigo' });
    expect('npc' in mapa).toBe(false);
  });

  it('devolve mapa vazio para um tabuleiro sem ninguém, sem lançar', () => {
    expect(characterIdsForPlacements([])).toEqual({});
  });
});
