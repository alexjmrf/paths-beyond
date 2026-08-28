import { describe, expect, it } from 'vitest';
import { catalog } from '../src/data/catalog.js';
import {
  FALLBACK_GLYPH,
  GLYPH_BY_CLASS,
  glyphFor,
  glyphKeyFor,
  PROFILE_GLYPHS,
  type UnitProfile,
} from '../src/data/classGlyphs.js';
import { COLORBLIND_THEME, DEFAULT_THEME, type OverlayTheme } from '../src/data/overlayTheme.js';
import { boundsOf, type NormShape } from '../src/data/shapes.js';
import { MIN_DISTANCE, worstCaseDistance } from './support/dicromacia.js';

// M16, sub-sessão 2/N — o glifo de classe.
//
// O diagnóstico do briefing (§1): "toda unidade do tabuleiro é a mesma forma com cores
// diferentes: um Clérigo e um Couraçado são indistinguíveis sem clicar". §1.1 lista
// legibilidade tática entre os pilares, então isso falha um pilar antes de falhar o gosto.
//
// D1 do briefing: o glifo mora no CLIENTE, nunca em `packages/data` — glifo é apresentação, e
// `packages/data` é o dataset de REGRA, consumido por `packages/core`, `apps/server` e
// `sim-cli`, nenhum dos três desenhando nada. O risco óbvio dessa escolha (classe nova entra no
// catálogo sem glifo) é o que o teste de completude abaixo cobre, no estilo de M9.
//
// O que este arquivo NÃO faz é afirmar que o desenho ficou bom (§3 do briefing): isso é gosto,
// é do usuário, e o agente não autocertifica estética. O que dá para medir sozinho é
// completude, distinção, caber no lugar, pureza e contraste — e é só isso que está aqui.

const CLASSES_REAIS = Object.values(catalog.classes);

function perfilDe(classId: string): UnitProfile {
  const def = catalog.classes[classId]!;
  return { weaponType: def.allowedWeapons[0]!, unitType: def.unitType };
}

// Assinatura estrutural de um glifo: é o que permite afirmar "estes dois se desenham
// diferente" sem olhar screenshot nenhum.
function assinatura(shapes: readonly NormShape[]): string {
  return JSON.stringify(shapes);
}

// Quanta "tinta" um glifo tem: um glifo vazio ou de um traço só passaria em completude e
// distinção e ainda assim não diria nada no tabuleiro.
function pontos(shapes: readonly NormShape[]): number {
  return shapes.reduce((total, s) => total + (s.t === 'poly' ? s.points.length / 2 : 1), 0);
}

describe('completude: toda classe do catálogo real tem glifo (D1)', () => {
  it('o catálogo real tem as 10 classes que o briefing nomeia', () => {
    expect(CLASSES_REAIS.length).toBe(10);
  });

  it('cada classe do catálogo tem um glifo PRÓPRIO, sem cair no fallback', () => {
    const semGlifo = CLASSES_REAIS.filter((c) => GLYPH_BY_CLASS[c.id] === undefined).map((c) => c.id);
    expect(semGlifo).toEqual([]);
  });

  it('nenhum glifo declarado sobra: todo id de `GLYPH_BY_CLASS` existe no catálogo', () => {
    // O outro lado da completude. Um glifo órfão é sinal de classe renomeada — e uma classe
    // renomeada perde o desenho em silêncio, que é exatamente o que o teste acima pega tarde
    // demais se este não existir.
    const orfaos = Object.keys(GLYPH_BY_CLASS).filter((id) => catalog.classes[id] === undefined);
    expect(orfaos).toEqual([]);
  });

  it('os 10 glifos são distinguíveis ENTRE SI', () => {
    // O critério do briefing, literal: Clérigo e Couraçado não podem ser a mesma coisa.
    const assinaturas = CLASSES_REAIS.map((c) => assinatura(GLYPH_BY_CLASS[c.id]!));
    expect(new Set(assinaturas).size).toBe(CLASSES_REAIS.length);
  });

  it('Espadachim e Mestre-Espadachim se distinguem — o par que só o `classId` separa', () => {
    // Os dois são `infantry`/`sword`: nenhum campo de `BattleUnit` os diferencia, e os dois
    // aparecem no capítulo 6 ao mesmo tempo. É a razão de o glifo resolver por `classId`
    // antes de cair no perfil, e não só por perfil.
    expect(perfilDe('class-espadachim')).toEqual(perfilDe('class-mestre-espadachim'));
    expect(assinatura(glyphFor('class-espadachim', undefined))).not.toBe(
      assinatura(glyphFor('class-mestre-espadachim', undefined)),
    );
  });

  it('nenhum glifo é vazio ou quase vazio', () => {
    for (const classe of CLASSES_REAIS) {
      expect(pontos(GLYPH_BY_CLASS[classe.id]!), classe.id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('fallback declarado (D1)', () => {
  it('classe desconhecida cai no glifo de PERFIL, não no genérico', () => {
    // PvP, masmorra e replay recebem o `BattleSetup` pronto do servidor, sem `classId`. O
    // perfil (`weaponType` + `unitType`) é o que TODO `BattleUnit` carrega — usá-lo é o que
    // impede que o tabuleiro inteiro do PvP vire o mesmo glifo genérico.
    const arqueiroDesconhecido: UnitProfile = { weaponType: 'bow', unitType: 'infantry' };
    expect(assinatura(glyphFor('classe-que-nao-existe', arqueiroDesconhecido))).not.toBe(assinatura(FALLBACK_GLYPH));
    expect(assinatura(glyphFor(undefined, arqueiroDesconhecido))).toBe(assinatura(PROFILE_GLYPHS.bow));
  });

  it('o perfil cobre todo `weaponType` e todo `unitType` que o catálogo real usa', () => {
    for (const classe of CLASSES_REAIS) {
      const perfil = perfilDe(classe.id);
      // Sem `classId`, o perfil daquela classe ainda tem de produzir um desenho de verdade.
      expect(assinatura(glyphFor(undefined, perfil)), classe.id).not.toBe(assinatura(FALLBACK_GLYPH));
    }
  });

  it('sem classe e sem perfil, o último recurso é declarado e desenha alguma coisa', () => {
    expect(assinatura(glyphFor(undefined, undefined))).toBe(assinatura(FALLBACK_GLYPH));
    expect(pontos(FALLBACK_GLYPH)).toBeGreaterThan(0);
  });

  it('`glyphKeyFor` diz por qual caminho o glifo foi resolvido', () => {
    // A chave é o que torna o desenho AFIRMÁVEL de fora (o teste de contrato do renderer usa
    // isto) sem ninguém precisar comparar listas de pontos.
    expect(glyphKeyFor('class-clerigo', undefined)).toBe('class:class-clerigo');
    expect(glyphKeyFor(undefined, { weaponType: 'bow', unitType: 'infantry' })).toBe('weapon:bow');
    expect(glyphKeyFor(undefined, { weaponType: 'axe', unitType: 'armored' })).toBe('unit:armored');
    expect(glyphKeyFor(undefined, undefined)).toBe('fallback');
  });
});

describe('o glifo cabe onde é desenhado', () => {
  it('toda coordenada está no espaço normalizado 0..1', () => {
    const todos = [...Object.entries(GLYPH_BY_CLASS), ...Object.entries(PROFILE_GLYPHS), ['fallback', FALLBACK_GLYPH]] as const;
    for (const [nome, shapes] of todos) {
      const caixa = boundsOf(shapes as readonly NormShape[]);
      expect(caixa.minX, `${nome}.minX`).toBeGreaterThanOrEqual(0);
      expect(caixa.minY, `${nome}.minY`).toBeGreaterThanOrEqual(0);
      expect(caixa.maxX, `${nome}.maxX`).toBeLessThanOrEqual(1);
      expect(caixa.maxY, `${nome}.maxY`).toBeLessThanOrEqual(1);
    }
  });

  it('todo glifo ocupa a caixa de verdade — nenhum se encolhe num canto', () => {
    // Um glifo de 0.1×0.1 passaria no teste acima e sumiria num tile de 36px.
    for (const [nome, shapes] of Object.entries(GLYPH_BY_CLASS)) {
      const caixa = boundsOf(shapes);
      expect(caixa.maxX - caixa.minX, `${nome} largura`).toBeGreaterThan(0.5);
      expect(caixa.maxY - caixa.minY, `${nome} altura`).toBeGreaterThan(0.5);
    }
  });
});

describe('a tinta do glifo é legível sobre o corpo da unidade (critério de aceite 3)', () => {
  // A garantia de M13 4/N reverificada, não assumida — é texto do critério. A linguagem de
  // 2/N põe tinta NOVA em cima do corpo colorido da unidade, e um glifo que some sobre o
  // vermelhão do inimigo em protanopia não é um glifo.
  const paletas: readonly (readonly [string, OverlayTheme])[] = [
    ['padrão', DEFAULT_THEME],
    ['segura', COLORBLIND_THEME],
  ];

  it.each(paletas.map(([nome, tema]) => [nome, tema] as const))(
    'paleta %s: a tinta do glifo contrasta com os dois lados, inclusive sob dicromacia',
    (_nome, tema) => {
      for (const lado of ['player', 'enemy'] as const) {
        const d = worstCaseDistance(tema.tokens.glyphInk, tema.sides[lado].color);
        expect(Math.round(d), `${lado}`).toBeGreaterThan(MIN_DISTANCE);
      }
    },
  );
});
