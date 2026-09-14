import type { BattleState, WinCondition } from '@paths-beyond/core';
import { winConditionSchema } from '@paths-beyond/data/schemas/maps.schema.js';
import { describe, expect, it } from 'vitest';
import { CATALOGOS } from '../src/i18n/catalogos.js';
import { criarTradutor, IDIOMAS } from '../src/i18n/idioma.js';
import { descreverObjetivo } from '../src/logic/objetivo.js';

// M32 — o OBJETIVO do mapa passa pela camada de idioma.
//
// `describeObjective()` vivia dentro de `ObjectivePanel.tsx` com as cinco condições de §5.7
// escritas em português, em template literal — e `semTextoCru.test.ts` nunca acusou, porque
// ele varre `>texto<` e atributos, não strings dentro de função. O M29 cobriu os NOMES da
// campanha; o objetivo ficou, e o instalador o mostrou em português na build inglesa.
//
// **A lista de condições vem do SCHEMA, não de uma enumeração à mão.** `winConditionSchema`
// é uma união discriminada em `packages/data`, e as opções dela existem em runtime: uma
// condição nova no schema entra aqui sozinha e fica vermelha até ter texto nas duas línguas.
// É o mesmo desenho de `TIPOS_DE_CONTEUDO` no M29, pelo mesmo motivo — lista escrita à mão
// descreve o passado.

const TIPOS = winConditionSchema.options.map((opcao) => opcao.shape.t.value);

// Uma condição de exemplo por tipo. A asserção abaixo confere que nenhum tipo do schema
// ficou sem exemplo — senão "não gerou caso" teria a mesma cor de "passou".
const EXEMPLOS: Readonly<Record<string, WinCondition>> = {
  rout: { t: 'rout' },
  seize: { t: 'seize', target: { x: 3, y: 4 } },
  surviveRounds: { t: 'surviveRounds', n: 5 },
  escort: { t: 'escort', unitId: 'ally-wren', target: { x: 7, y: 1 } },
  defend: { t: 'defend', rounds: 6, target: { x: 2, y: 2 } },
};

const ESTADO = {
  round: 2,
  units: [
    { unitId: 'ally-1', side: 'player', hp: 100 },
    { unitId: 'enemy-1', side: 'enemy', hp: 50 },
    { unitId: 'enemy-2', side: 'enemy', hp: 0 },
    { unitId: 'enemy-3', side: 'enemy', hp: 20 },
  ],
} as unknown as BattleState;

describe('o objetivo do mapa', () => {
  it('há um exemplo para cada condição que o schema declara', () => {
    expect(Object.keys(EXEMPLOS).sort()).toEqual([...TIPOS].sort());
    expect(TIPOS.length).toBeGreaterThanOrEqual(5);
  });

  for (const tipo of TIPOS) {
    it(`${tipo}: título e detalhe existem nas duas línguas, e não são a chave crua`, () => {
      for (const idioma of IDIOMAS) {
        expect(CATALOGOS[idioma][`objetivo.${tipo}.titulo`], `objetivo.${tipo}.titulo em ${idioma}`).toBeTruthy();
        expect(CATALOGOS[idioma][`objetivo.${tipo}.detalhe`], `objetivo.${tipo}.detalhe em ${idioma}`).toBeTruthy();

        const { titulo, detalhe } = descreverObjetivo(criarTradutor(idioma, CATALOGOS), EXEMPLOS[tipo]!, ESTADO);
        expect(titulo).not.toContain('objetivo.');
        expect(detalhe).not.toContain('objetivo.');
        // Marcador sem valor fica visível de propósito (`{n}`); aqui não pode sobrar nenhum.
        expect(`${titulo} ${detalhe}`).not.toMatch(/\{\w+\}/);
      }
    });

    it(`${tipo}: o texto MUDA com o idioma — é a prova de que passa pela camada`, () => {
      const en = descreverObjetivo(criarTradutor('en', CATALOGOS), EXEMPLOS[tipo]!, ESTADO);
      const pt = descreverObjetivo(criarTradutor('pt', CATALOGOS), EXEMPLOS[tipo]!, ESTADO);
      expect(en.titulo).not.toBe(pt.titulo);
      expect(en.detalhe).not.toBe(pt.detalhe);
    });
  }

  it('rout conta os inimigos DE PÉ, e não os mortos', () => {
    const { detalhe } = descreverObjetivo(criarTradutor('en', CATALOGOS), EXEMPLOS.rout!, ESTADO);
    expect(detalhe).toContain('2');
  });

  it('seize, escort e defend dizem ONDE — as coordenadas do alvo', () => {
    const t = criarTradutor('en', CATALOGOS);
    expect(descreverObjetivo(t, EXEMPLOS.seize!, ESTADO).titulo).toContain('(3, 4)');
    expect(descreverObjetivo(t, EXEMPLOS.escort!, ESTADO).titulo).toContain('(7, 1)');
    expect(descreverObjetivo(t, EXEMPLOS.escort!, ESTADO).titulo).toContain('ally-wren');
    expect(descreverObjetivo(t, EXEMPLOS.defend!, ESTADO).titulo).toContain('(2, 2)');
  });

  it('surviveRounds e defend contam os rounds que FALTAM, e não os pedidos', () => {
    const t = criarTradutor('en', CATALOGOS);
    // Round 2 de 5: faltam 4 (o round corrente ainda conta).
    expect(descreverObjetivo(t, EXEMPLOS.surviveRounds!, ESTADO).detalhe).toContain('4');
    // Round 2 de 6: faltam 5.
    expect(descreverObjetivo(t, EXEMPLOS.defend!, ESTADO).detalhe).toContain('5');
  });

  it('surviveRounds cumprido diz que cumpriu, em vez de contar negativo', () => {
    const cumprido = { ...ESTADO, round: 9 } as BattleState;
    const en = descreverObjetivo(criarTradutor('en', CATALOGOS), EXEMPLOS.surviveRounds!, cumprido);
    expect(en.detalhe).not.toMatch(/-\d/);
    expect(en.detalhe).toBe(CATALOGOS.en['objetivo.surviveRounds.cumprido']);
  });

  it('defend nunca conta negativo depois de cumprir os rounds', () => {
    const depois = { ...ESTADO, round: 20 } as BattleState;
    const { detalhe } = descreverObjetivo(criarTradutor('en', CATALOGOS), EXEMPLOS.defend!, depois);
    expect(detalhe).not.toMatch(/-\d/);
  });
});
