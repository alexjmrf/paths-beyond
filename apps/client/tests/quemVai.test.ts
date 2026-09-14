import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import { ordemDeAparicao, preenchimentoPadrao } from '../src/logic/quemVai.js';

// M35 2/N (D42) — as vagas de uma missão NUNCA começam vazias, e o protagonista vem primeiro.
//
// O achado do M32 2/N: com a missão escolhida e nenhum herói marcado, "Entrar na missão" ficava
// cinza sem dizer por quê. Pré-marcar como PvP e masmorra fazem resolve — mas QUEM vem marcado
// é decisão de design: o roster chega em ordem alfabética de id (`ORDER BY hero_id`), que põe
// Vesper (arcanista) antes de Aren, e o M27 2/N mediu a missão 1 em 0/20 com arcanista. O
// usuário deu a regra ao descrever a história: "o prota começando sua jornada".
//
// A ordem é DERIVADA do conteúdo, não escrita à mão: quem aparece primeiro na campanha vai
// primeiro. Aren é o único do encounter 1; Miron entra no 2, Sylla no 3, Vesper no 4 (D14).
// Um personagem novo autorado numa missão entra na ordem sozinho.

const roster = (...characterIds: string[]) =>
  characterIds.map((characterId) => ({
    hero: { id: `h-${characterId}`, characterId, classId: 'class-x' },
    equippedItems: [],
  }));

describe('ordemDeAparicao — derivada da campanha autorada', () => {
  const ordem = ordemDeAparicao(catalog);

  it('o protagonista é o primeiro, e os quatro do núcleo de história (D14) vêm na ordem dos capítulos', () => {
    expect(ordem[0]).toBe('hero-jogador');
    const nucleo = ordem.filter((id) => ['hero-jogador', 'ally-clerigo', 'ally-arqueiro', 'ally-arcanista'].includes(id));
    expect(nucleo).toEqual(['hero-jogador', 'ally-clerigo', 'ally-arqueiro', 'ally-arcanista']);
  });

  it('cobre todo personagem que aparece como vaga na campanha, sem repetir', () => {
    expect(new Set(ordem).size).toBe(ordem.length);
    for (const id of ordem) expect(catalog.characters[id], id).toBeDefined();
  });
});

describe('preenchimentoPadrao — quem vem marcado ao escolher a missão', () => {
  const ordem = ['hero-jogador', 'ally-clerigo', 'ally-arqueiro', 'ally-arcanista'];

  it('uma vaga: o protagonista, mesmo que o roster venha em ordem alfabética', () => {
    const r = roster('ally-arcanista', 'ally-arqueiro', 'ally-clerigo', 'hero-jogador');
    expect(preenchimentoPadrao(r, 1, ordem)).toEqual(['h-hero-jogador']);
  });

  it('duas vagas: protagonista e o próximo da história (Miron), não o próximo do roster', () => {
    const r = roster('ally-arcanista', 'ally-arqueiro', 'ally-clerigo', 'hero-jogador');
    expect(preenchimentoPadrao(r, 2, ordem)).toEqual(['h-hero-jogador', 'h-ally-clerigo']);
  });

  it('quem não está na história (invocado) vem depois do núcleo, na ordem do roster', () => {
    const r = roster('ally-grifeiro', 'ally-lanceiro', 'hero-jogador');
    expect(preenchimentoPadrao(r, 3, ordem)).toEqual(['h-hero-jogador', 'h-ally-grifeiro', 'h-ally-lanceiro']);
  });

  it('mais vagas que heróis: leva todos, sem inventar', () => {
    const r = roster('hero-jogador');
    expect(preenchimentoPadrao(r, 5, ordem)).toEqual(['h-hero-jogador']);
  });

  it('roster sem o protagonista (conta antiga, teste): segue a ordem sem quebrar', () => {
    const r = roster('ally-arcanista', 'ally-clerigo');
    expect(preenchimentoPadrao(r, 1, ordem)).toEqual(['h-ally-clerigo']);
  });
});
