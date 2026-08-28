import { describe, expect, it } from 'vitest';
import { COLORBLIND_THEME, DEFAULT_THEME } from '../src/data/overlayTheme.js';
import { primitiveBounds, type Primitive } from '../src/data/shapes.js';
import {
  minimalUnitRenderer,
  shapeUnitRenderer,
  type UnitRenderInput,
  type UnitRenderer,
  type UnitRenderUnit,
} from '../src/data/unitRenderer.js';

// M16 — a costura de representação de unidade (critério de aceite 4: "a costura existe e tem
// uma segunda implementação de teste provando que é trocável").
//
// D2 do briefing: o renderer produz uma DESCRIÇÃO (lista de primitivas), não desenha. É o que
// torna a representação testável sem browser e sem Pixi — este arquivo não importa Pixi em
// lugar nenhum —, e é o hedge que a auditoria exigiu: uma camada de sprite pode entrar por
// cima no futuro sem reescrever o renderer.
//
// D3: a segunda implementação é um renderer ALTERNATIVO de verdade (só retângulos e texto,
// sem círculo nenhum), não um espião de chamadas. Um espião provaria que a função foi
// chamada; o alternativo prova que a costura não está amarrada à linguagem de formas de hoje
// — que é o que "trocável" significa. **Os dois passam pelo MESMO teste de contrato abaixo.**
//
// Sub-sessão 2/N acrescentou ao contrato o que a linguagem visual trouxe: identidade de classe
// visível no tile, marca própria para buff e para debuff, e HP legível sem hover. Repare que
// nenhuma das asserções novas diz como a coisa tem de ser DESENHADA — o renderer alternativo
// resolve identidade de classe por inicial em texto e o de produção por glifo vetorial, e os
// dois passam. É essa folga que faz a costura valer alguma coisa.

const RENDERERS: readonly UnitRenderer[] = [shapeUnitRenderer, minimalUnitRenderer];

const TILE = 36;

function unidade(overrides: Partial<UnitRenderUnit> = {}): UnitRenderUnit {
  return {
    side: 'player',
    ap: 3,
    pp: 2,
    hp: 900,
    maxHp: 1000,
    hasActedThisRound: false,
    buffs: 0,
    debuffs: 0,
    classId: 'class-espadachim',
    weaponType: 'sword',
    unitType: 'infantry',
    ...overrides,
  };
}

function input(overrides: Partial<UnitRenderInput> = {}): UnitRenderInput {
  return {
    unit: unidade(),
    tile: { px: 2 * TILE, py: 3 * TILE, size: TILE },
    state: { selected: false, engageable: false },
    theme: DEFAULT_THEME,
    labelSize: 10,
    ...overrides,
  };
}

function assinatura(ps: readonly Primitive[]): string {
  return JSON.stringify(ps);
}

// Só a GEOMETRIA, sem uma cor: é como se afirma que duas coisas se distinguem SEM depender de
// cor nenhuma — a garantia de M13 4/N, aplicada a cada marca que 2/N acrescentou.
function geometria(ps: readonly Primitive[]): string {
  return JSON.stringify(
    ps.map((p) => {
      switch (p.t) {
        case 'circle':
          return ['circle', p.cx, p.cy, p.r];
        case 'rect':
          return ['rect', p.x, p.y, p.w, p.h];
        case 'poly':
          return ['poly', p.points, p.closed ?? false];
        case 'text':
          return ['text', p.x, p.y, p.text, p.size];
      }
    }),
  );
}

describe.each(RENDERERS.map((r) => [r.id, r] as const))('contrato de UnitRenderer — %s', (_id, renderer) => {
  it('desenha alguma coisa', () => {
    expect(renderer.render(input()).length).toBeGreaterThan(0);
  });

  it('§11 — AP/PP legíveis no próprio tile, sem hover: o rótulo faz parte da representação', () => {
    const textos = renderer
      .render(input({ unit: unidade({ ap: 4, pp: 1 }) }))
      .filter((p): p is Extract<Primitive, { t: 'text' }> => p.t === 'text');

    expect(textos.length).toBeGreaterThan(0);
    expect(textos.map((t) => t.text).join(' ')).toContain('4/1');
  });

  it('a plaqueta de AP/PP não encosta no glifo', () => {
    // Este teste nasceu de um defeito visto em navegador nesta fatia: o número branco caía em
    // cima do glifo e os dois viravam um borrão. É o tipo de coisa que §3 do briefing chama de
    // objetivamente ilegível — o agente corrige sozinho —, e travá-lo aqui é o que impede que
    // um ajuste futuro de `glyphOffsetY` ou de `labelSize` o traga de volta em silêncio.
    const base = input();
    const primitivas = renderer.render(base);
    const plaqueta = primitivas.find(
      (p): p is Extract<Primitive, { t: 'rect' }> =>
        p.t === 'rect' && p.fill === base.theme.tokens.labelPlate && p.x === base.tile.px && p.y === base.tile.py,
    );
    expect(plaqueta, 'o rótulo de AP/PP tem plaqueta').toBeDefined();

    // Tudo que estiver ABAIXO da plaqueta pode cruzá-la horizontalmente; o que não pode é
    // ocupar a mesma faixa vertical dela na região que ela cobre.
    for (const p of primitivas) {
      if (p === plaqueta || p.t === 'text') continue;
      const caixa = primitiveBounds(p);
      const cruzaX = caixa.minX < plaqueta!.x + plaqueta!.w && caixa.maxX > plaqueta!.x;
      const cruzaY = caixa.minY < plaqueta!.y + plaqueta!.h && caixa.maxY > plaqueta!.y;
      // O corpo da unidade e o véu de "já agiu" cobrem o tile inteiro por definição — o que se
      // exige aqui é do GLIFO, que é quem some debaixo do número.
      const ehGlifoOuPip = p.t === 'poly';
      if (ehGlifoOuPip) expect(cruzaX && cruzaY, JSON.stringify(p)).toBe(false);
    }
  });

  it('nada transborda o tile: uma unidade não invade o vizinho', () => {
    // A REPRESENTAÇÃO DE UNIDADE não pode transbordar, senão duas unidades adjacentes se
    // sobrepõem e a leitura do tabuleiro passa a depender da ordem de desenho. Vale com o
    // tile cheio de marca: glifo, pips de efeito dos dois tipos, barra de HP e anéis juntos.
    const base = input({
      unit: unidade({ buffs: 3, debuffs: 3, hp: 120, maxHp: 1000 }),
      state: { selected: true, engageable: true },
    });
    for (const primitiva of renderer.render(base)) {
      const caixa = primitiveBounds(primitiva);
      expect(caixa.minX, JSON.stringify(primitiva)).toBeGreaterThanOrEqual(base.tile.px);
      expect(caixa.minY, JSON.stringify(primitiva)).toBeGreaterThanOrEqual(base.tile.py);
      expect(caixa.maxX, JSON.stringify(primitiva)).toBeLessThanOrEqual(base.tile.px + base.tile.size);
      expect(caixa.maxY, JSON.stringify(primitiva)).toBeLessThanOrEqual(base.tile.py + base.tile.size);
    }
  });

  it('os dois lados são distinguíveis SEM depender de cor', () => {
    // A garantia de M13 4/N, aplicada à costura: no modo daltônico o inimigo é quadrado e o
    // jogador é círculo. Um renderer que só troque a cor falha aqui.
    const jogador = renderer.render(input({ theme: COLORBLIND_THEME }));
    const inimigo = renderer.render(input({ theme: COLORBLIND_THEME, unit: unidade({ side: 'enemy' }) }));

    expect(geometria(jogador)).not.toBe(geometria(inimigo));
  });

  it('cada estado tem marca própria: selecionada, engajável e já agiu mudam o desenho', () => {
    const neutro = assinatura(renderer.render(input()));
    const selecionada = assinatura(renderer.render(input({ state: { selected: true, engageable: false } })));
    const engajavel = assinatura(renderer.render(input({ state: { selected: false, engageable: true } })));
    const agiu = assinatura(renderer.render(input({ unit: unidade({ hasActedThisRound: true }) })));

    expect(selecionada).not.toBe(neutro);
    expect(engajavel).not.toBe(neutro);
    expect(agiu).not.toBe(neutro);
    // E os três são distinguíveis ENTRE SI, não só do neutro.
    expect(new Set([neutro, selecionada, engajavel, agiu]).size).toBe(4);
  });

  it('é puro: a mesma entrada produz a mesma saída', () => {
    expect(renderer.render(input())).toEqual(renderer.render(input()));
  });

  it('acompanha a escala de UI (§11 — fonte escalável)', () => {
    const pequeno = renderer.render(input({ labelSize: 10 }));
    const grande = renderer.render(input({ labelSize: 28 }));
    const tamanho = (ps: readonly Primitive[]): number | undefined =>
      ps.find((p): p is Extract<Primitive, { t: 'text' }> => p.t === 'text')?.size;

    expect(tamanho(grande)).toBeGreaterThan(tamanho(pequeno)!);
  });

  // ---- 2/N: a linguagem visual entra no contrato ----

  it('a classe é visível no tile: Clérigo e Couraçado não se desenham igual', () => {
    // O diagnóstico literal do briefing (§1). E a distinção não pode vir de cor: os dois são
    // do mesmo lado, então têm exatamente a mesma tinta de corpo.
    const clerigo = renderer.render(
      input({ unit: unidade({ classId: 'class-clerigo', weaponType: 'holy', unitType: 'caster' }) }),
    );
    const couracado = renderer.render(
      input({ unit: unidade({ classId: 'class-couracado', weaponType: 'axe', unitType: 'armored' }) }),
    );

    expect(geometria(clerigo)).not.toBe(geometria(couracado));
  });

  it('sem `classId`, o perfil ainda distingue: um arqueiro de PvP não vira o mesmo boneco de um mago', () => {
    // PvP, masmorra e replay recebem o setup pronto do servidor, sem classe resolvida.
    const arqueiro = renderer.render(
      input({ unit: unidade({ classId: undefined, weaponType: 'bow', unitType: 'infantry' }) }),
    );
    const arcanista = renderer.render(
      input({ unit: unidade({ classId: undefined, weaponType: 'arcane', unitType: 'caster' }) }),
    );

    expect(geometria(arqueiro)).not.toBe(geometria(arcanista));
  });

  it('buff e debuff têm marca própria, e se distinguem ENTRE SI sem depender de cor', () => {
    const nenhum = geometria(renderer.render(input({ theme: COLORBLIND_THEME })));
    const comBuff = geometria(renderer.render(input({ theme: COLORBLIND_THEME, unit: unidade({ buffs: 2 }) })));
    const comDebuff = geometria(renderer.render(input({ theme: COLORBLIND_THEME, unit: unidade({ debuffs: 2 }) })));

    expect(new Set([nenhum, comBuff, comDebuff]).size).toBe(3);
  });

  it('a contagem de efeitos aparece: 1 buff e 3 buffs não se desenham igual', () => {
    const um = assinatura(renderer.render(input({ unit: unidade({ buffs: 1 }) })));
    const tres = assinatura(renderer.render(input({ unit: unidade({ buffs: 3 }) })));
    expect(um).not.toBe(tres);
  });

  it('§1.1 — HP legível sem hover: cheia e quase morta não se desenham igual', () => {
    // "O jogador DEVE conseguir prever o resultado antes de confirmar" é pilar, e a decisão de
    // engajar acontece olhando o tabuleiro. Uma unidade a 5% de HP idêntica a uma cheia
    // esconde exatamente o dado que decide.
    const cheia = geometria(renderer.render(input({ unit: unidade({ hp: 1000, maxHp: 1000 }) })));
    const ferida = geometria(renderer.render(input({ unit: unidade({ hp: 500, maxHp: 1000 }) })));
    const critica = geometria(renderer.render(input({ unit: unidade({ hp: 50, maxHp: 1000 }) })));

    expect(new Set([cheia, ferida, critica]).size).toBe(3);
  });

  it('HP crítico tem marca própria, não só cor', () => {
    // A garantia de M13 4/N aplicada ao dado novo: em deuteranopia a barra vermelha e a verde
    // podem virar o mesmo tom, e aí só o comprimento restaria — comprimento sozinho não avisa
    // que a unidade morre no próximo golpe.
    const um = geometria(renderer.render(input({ theme: COLORBLIND_THEME, unit: unidade({ hp: 400, maxHp: 1000 }) })));
    const outro = geometria(renderer.render(input({ theme: COLORBLIND_THEME, unit: unidade({ hp: 80, maxHp: 1000 }) })));
    expect(um).not.toBe(outro);
  });

  it('HP inválido não quebra o desenho nem estoura o tile', () => {
    // `maxHp` zero acontece em fixture de teste e em unidade montada à mão; dividir por ele
    // produziria `NaN` e um retângulo de largura `NaN`, que o Pixi desenha como nada — um bug
    // que só apareceria em jogo.
    for (const unit of [unidade({ hp: 0, maxHp: 0 }), unidade({ hp: 5000, maxHp: 1000 }), unidade({ hp: -10 })]) {
      const primitivas = renderer.render(input({ unit }));
      for (const p of primitivas) {
        const caixa = primitiveBounds(p);
        expect(Number.isFinite(caixa.minX) && Number.isFinite(caixa.maxX), JSON.stringify(p)).toBe(true);
        expect(caixa.minX).toBeGreaterThanOrEqual(2 * TILE);
        expect(caixa.maxX).toBeLessThanOrEqual(3 * TILE);
      }
    }
  });
});

describe('a costura é trocável (critério de aceite 4)', () => {
  it('as duas implementações satisfazem o mesmo contrato e produzem desenhos DIFERENTES', () => {
    expect(assinatura(shapeUnitRenderer.render(input()))).not.toBe(assinatura(minimalUnitRenderer.render(input())));
  });

  it('o alternativo não usa círculo: a costura não está amarrada à linguagem de formas de hoje', () => {
    const tipos = new Set(minimalUnitRenderer.render(input()).map((p) => p.t));
    expect(tipos.has('circle')).toBe(false);

    // E o de produção usa, para o teste acima não ser vacuamente verdadeiro.
    expect(new Set(shapeUnitRenderer.render(input()).map((p) => p.t)).has('circle')).toBe(true);
  });

  it('os dois resolvem identidade de classe por caminhos DIFERENTES', () => {
    // O de produção desenha um glifo vetorial (`poly`); o alternativo escreve um rótulo. É a
    // prova mais forte de que o contrato exige o RESULTADO ("dá para saber a classe olhando")
    // e não a técnica — se o teste de identidade estivesse amarrado a glifo, o alternativo não
    // teria como passar, e a costura seria trocável só no nome.
    const rotulos = (r: UnitRenderer, classId: string): string =>
      r
        .render(input({ unit: unidade({ classId }) }))
        .filter((p): p is Extract<Primitive, { t: 'text' }> => p.t === 'text')
        .map((p) => p.text)
        .join('|');

    expect(rotulos(minimalUnitRenderer, 'class-clerigo')).not.toBe(rotulos(minimalUnitRenderer, 'class-couracado'));
    expect(minimalUnitRenderer.render(input()).some((p) => p.t === 'poly')).toBe(false);

    // E o de produção faz o inverso: mesmo texto, geometria diferente.
    expect(rotulos(shapeUnitRenderer, 'class-clerigo')).toBe(rotulos(shapeUnitRenderer, 'class-couracado'));
    expect(shapeUnitRenderer.render(input()).some((p) => p.t === 'poly')).toBe(true);
  });

  it('trocar o renderer não exige tocar em Pixi: a saída é dado puro, serializável', () => {
    for (const renderer of RENDERERS) {
      expect(() => JSON.parse(JSON.stringify(renderer.render(input())))).not.toThrow();
    }
  });
});
