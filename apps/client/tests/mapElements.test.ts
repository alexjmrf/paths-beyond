import { describe, expect, it } from 'vitest';
import { COLORBLIND_THEME, DEFAULT_THEME, type OverlayTheme } from '../src/data/overlayTheme.js';
import { boundsOf, type NormShape } from '../src/data/shapes.js';
import { MARK_BY_STRUCTURE, structureMarkFor } from '../src/data/structureMarks.js';
import { MARK_BY_TERRAIN } from '../src/data/terrainMarks.js';
import { blendOver, contrastRatio } from './support/dicromacia.js';

// M16, sub-sessão 5/N — os elementos do mapa se distinguindo entre si.
//
// Vem de um veredito do usuário sobre o critério de aceite 2, e das palavras dele: "dá pra
// perceber diferença mas não necessariamente distinguir totalmente, principalmente elementos do
// mapa". O critério exige *legíveis*, não *diferenciáveis*, então ele reprovou.
//
// A queixa tinha lado mensurável, e a medição achou o culpado: na paleta padrão, floresta
// (0x2f5d34) e alvenaria (0x6b4f3a) estavam a **1,03 de contraste** — a mesma luminância, com a
// distinção inteira apoiada na matiz. Um muro e um bosque liam-se como o mesmo tile. Sob o véu
// de movimento os dois caíam para 1,02.
//
// Este arquivo trava três propriedades. As duas primeiras são sobre TINTA e por isso dependem
// de tema; a terceira é sobre FORMA, vale para os dois temas, e é a única que sobrevive a um
// overlay semitransparente por cima — que é justamente onde a tinta se perde.

const TEMAS: readonly OverlayTheme[] = [DEFAULT_THEME, COLORBLIND_THEME];

// Os quatro elementos que compõem o chão do tabuleiro. Alvenaria e portão compartilham a tinta
// `structure` (são a mesma construção), então como TINTA são um só; como FORMA são dois.
function tintasDoMapa(theme: OverlayTheme): Readonly<Record<string, number>> {
  return {
    planície: theme.terrain['terrain-planicie']!,
    floresta: theme.terrain['terrain-floresta']!,
    montanha: theme.terrain['terrain-montanha']!,
    alvenaria: theme.structure,
  };
}

function pares<T>(registro: Readonly<Record<string, T>>): readonly (readonly [string, string, T, T])[] {
  const ks = Object.keys(registro);
  const out: (readonly [string, string, T, T])[] = [];
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) {
      out.push([ks[i]!, ks[j]!, registro[ks[i]!]!, registro[ks[j]!]!]);
    }
  }
  return out;
}

// Abaixo disto duas áreas chapadas vizinhas não se leem como coisas diferentes num tile de
// 36 px — é o mesmo raciocínio do `MIN_DISTANCE` da dicromacia, no canal de luminância.
const PISO_ABSOLUTO = 1.5;
// A paleta padrão não tem a restrição de dicromacia que amarra a segura (o teste de
// `overlayTheme.test.ts` afirma que ela FALHA aquele limiar de propósito), então ela não tem
// desculpa para ficar no piso.
const PISO_PADRAO = 2.0;

describe('M16 5/N — os elementos do mapa se distinguem por LUMINÂNCIA, não só por matiz', () => {
  for (const tema of TEMAS) {
    it(`${tema.id}: nenhum par de elementos do mapa cai abaixo de ${PISO_ABSOLUTO} de contraste`, () => {
      const fracos = pares(tintasDoMapa(tema))
        .map(([a, b, ca, cb]) => ({ par: `${a} × ${b}`, r: contrastRatio(ca, cb) }))
        .filter((p) => p.r < PISO_ABSOLUTO);
      expect(fracos.map((p) => `${p.par} = ${p.r.toFixed(2)}`)).toEqual([]);
    });
  }

  it(`a paleta padrão separa todos os pares por pelo menos ${PISO_PADRAO}`, () => {
    const fracos = pares(tintasDoMapa(DEFAULT_THEME))
      .map(([a, b, ca, cb]) => ({ par: `${a} × ${b}`, r: contrastRatio(ca, cb) }))
      .filter((p) => p.r < PISO_PADRAO);
    expect(fracos.map((p) => `${p.par} = ${p.r.toFixed(2)}`)).toEqual([]);
  });

  it('a alvenaria nunca se lê como chão: separada de TODO terreno por pelo menos 2,0', () => {
    // O par que reprovou o critério. Muro é intransponível e terreno não é — confundir os dois
    // é o jogador planejando uma rota que o motor vai recusar.
    for (const tema of TEMAS) {
      for (const [nome, cor] of Object.entries(tema.terrain)) {
        expect(contrastRatio(tema.structure, cor), `${tema.id}: alvenaria × ${nome}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('nenhum overlay achata dois elementos até eles virarem a mesma tinta', () => {
    // Um overlay semitransparente empurra tudo que está embaixo dele na direção da própria cor.
    // Medir só a tinta pura seria otimismo: o jogador olha o tabuleiro com véu de ameaça e
    // alcance de movimento por cima na maior parte do turno.
    for (const tema of TEMAS) {
      const veus = [tema.threat, tema.move, tema.targeting];
      for (const veu of veus) {
        for (const [a, b, ca, cb] of pares(tintasDoMapa(tema))) {
          const r = contrastRatio(blendOver(veu.color, ca, veu.alpha), blendOver(veu.color, cb, veu.alpha));
          expect(r, `${tema.id}: ${a} × ${b} sob overlay ${veu.color.toString(16)}`).toBeGreaterThan(1.2);
        }
      }
    }
  });
});

describe('M16 5/N — e se distinguem por FORMA, que é o que sobrevive ao overlay', () => {
  it('alvenaria e portão têm marca própria, e nenhuma delas é a marca de um terreno', () => {
    const todas: Record<string, readonly NormShape[]> = { ...MARK_BY_TERRAIN, ...MARK_BY_STRUCTURE };
    const chaves = Object.keys(todas);
    expect(chaves).toContain('wall');
    expect(chaves).toContain('gate');

    // Duas marcas iguais seriam dois elementos indistinguíveis quando a tinta se perde.
    const serializadas = chaves.map((k) => JSON.stringify(todas[k]));
    expect(new Set(serializadas).size).toBe(chaves.length);
  });

  it('a marca da alvenaria ocupa o MIOLO do tile — é a única que pode', () => {
    // As marcas de terreno vivem nas bordas porque uma unidade é desenhada no miolo e a textura
    // viraria sujeira em volta do glifo (regra travada em `terrainMarks.test.ts`). Muro e portão
    // são intransponíveis: nenhuma unidade jamais fica em cima deles, então eles podem — e
    // precisam — texturizar o tile inteiro. É isso que faz a construção ler como construção
    // mesmo debaixo de um véu.
    for (const id of ['wall', 'gate']) {
      const b = boundsOf(structureMarkFor(id)!);
      expect(b.minX, `${id} minX`).toBeLessThan(0.3);
      expect(b.maxX, `${id} maxX`).toBeGreaterThan(0.7);
      expect(b.minY, `${id} minY`).toBeLessThan(0.3);
      expect(b.maxY, `${id} maxY`).toBeGreaterThan(0.7);
    }
  });

  it('a alvenaria tem fiadas horizontais: é o que a lê como construída e não como pedra', () => {
    const wall = structureMarkFor('wall')!;
    const horizontais = wall.filter(
      (s) => s.t === 'poly' && s.points.length === 4 && s.points[1] === s.points[3],
    );
    // Fiadas de verdade, não uma só: uma linha isolada lê como rachadura.
    expect(horizontais.length).toBeGreaterThanOrEqual(2);
  });

  it('objeto desconhecido não ganha marca — não inventa construção que a regra não declarou', () => {
    expect(structureMarkFor('chest')).toBeUndefined();
    expect(structureMarkFor('fort')).toBeUndefined();
  });

  it('toda marca de estrutura fica dentro do tile', () => {
    for (const [id, marca] of Object.entries(MARK_BY_STRUCTURE)) {
      const b = boundsOf(marca);
      expect(b.minX, `${id}`).toBeGreaterThanOrEqual(0);
      expect(b.minY, `${id}`).toBeGreaterThanOrEqual(0);
      expect(b.maxX, `${id}`).toBeLessThanOrEqual(1);
      expect(b.maxY, `${id}`).toBeLessThanOrEqual(1);
    }
  });
});
