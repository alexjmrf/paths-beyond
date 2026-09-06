import { describe, expect, it } from 'vitest';
import { COLORBLIND_THEME, DEFAULT_THEME } from '../src/data/overlayTheme.js';
import { primitiveBounds, type Primitive } from '../src/data/shapes.js';
import {
  criarRendererDeSprite,
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

// M26 — a arte de mentira. Uma peça por unidade, com a URL derivada do `artId`: é o que a
// produção tem (`data/unitArt.ts` resolve o manifesto contra os PNGs do bundle) sem exigir que
// um PNG exista para o teste rodar. Mesmo argumento do renderer alternativo de D3: o duplo é
// uma implementação de verdade da costura, não um espião.
const arteFalsa = (artId: string | undefined) =>
  artId ? { src: `/arte/${artId}.png`, frameSize: 64 } : undefined;

const spriteUnitRenderer = criarRendererDeSprite(arteFalsa);

// **Os TRÊS passam pelo mesmo contrato.** É essa linha que prova o que o M26 promete: o
// renderer de sprite não é um caminho paralelo com regras próprias — ele satisfaz, peça por
// peça, o mesmo contrato que M16 escreveu, incluindo o que a linguagem visual acrescentou em
// 2/N (identidade de classe no tile, marca por estado, HP sem hover) e a garantia de M13 4/N
// (os dois lados sem depender de cor).
const RENDERERS: readonly UnitRenderer[] = [shapeUnitRenderer, minimalUnitRenderer, spriteUnitRenderer];

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
    // M26 — a chave no manifesto de arte. Derivada da classe aqui de propósito: é o que faz o
    // renderer de sprite ser exercitado DE VERDADE pelo contrato (um Clérigo e um Couraçado
    // recebem peças diferentes) em vez de cair no glifo e passar por tabela.
    ...(overrides.classId === undefined && 'classId' in overrides ? {} : { artId: overrides.classId ?? 'class-espadachim' }),
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
        // O `src` entra na assinatura de GEOMETRIA porque, com sprite, é ele que carrega a
        // identidade da unidade — é o análogo do desenho do glifo, não da tinta dele.
        case 'sprite':
          return ['sprite', p.x, p.y, p.w, p.h, p.src];
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


// ---------------------------------------------------------------------------
// M26 — o sprite entra, e o HUD continua por cima
// ---------------------------------------------------------------------------

// D25 mediu as três coisas abaixo na tela e errou uma delas na primeira tentativa. O que este
// bloco faz é transformar as três de "eu olhei e estava certo" em propriedades afirmadas:
// o sprite CABE no tile; a camada programática vira HUD e é desenhada POR CIMA; e o modo
// daltônico, que nunca dependeu da peça, sobrevive intacto.

function comArte(overrides: Partial<UnitRenderUnit> = {}) {
  return input({ unit: unidade(overrides) });
}

function spritesDe(ps: readonly Primitive[]) {
  return ps.filter((p): p is Extract<Primitive, { t: 'sprite' }> => p.t === 'sprite');
}

describe('M26 — a peça deixa de ser desenhada por código', () => {
  it('a unidade com arte declarada desenha UM sprite, e o glifo sai de cena', () => {
    const ps = spriteUnitRenderer.render(comArte());
    expect(spritesDe(ps)).toHaveLength(1);
    expect(spritesDe(ps)[0]!.src).toBe('/arte/class-espadachim.png');
  });

  it('o sprite CABE no tile: ele É o tile, nem um pixel a mais', () => {
    // D25: desenhado a 1,33x do tile (como Fire Emblem faz), as unidades de linhas adjacentes
    // se sobrepõem — e "1 herói = 1 tile" é a primeira regra do jogo.
    const entrada = comArte();
    const sprite = spritesDe(spriteUnitRenderer.render(entrada))[0]!;
    expect(sprite.x).toBe(entrada.tile.px);
    expect(sprite.y).toBe(entrada.tile.py);
    expect(sprite.w).toBe(entrada.tile.size);
    expect(sprite.h).toBe(entrada.tile.size);
  });

  it('o HUD vem DEPOIS do sprite — a ordem que D25 inverteu e viu o distintivo sumir', () => {
    const ps = spriteUnitRenderer.render(
      input({ unit: unidade({ buffs: 2, debuffs: 1, hp: 100, maxHp: 1000 }), state: { selected: true, engageable: true } }),
    );
    const iSprite = ps.findIndex((p) => p.t === 'sprite');
    const iPlaqueta = ps.findIndex((p) => p.t === 'text');

    expect(iSprite).toBeGreaterThan(0); // o disco de lado vem ANTES: ele é o fundo da peça
    // Tudo que informa — anéis, barra de HP, pips e a plaqueta de AP/PP — vem depois.
    expect(iPlaqueta).toBeGreaterThan(iSprite);
    for (let i = iSprite + 1; i < ps.length; i++) expect(ps[i]!.t).not.toBe('sprite');
  });

  it('o HUD é BIT A BIT o mesmo com sprite e sem: o M16 não foi reescrito, foi coberto', () => {
    // A afirmação mais forte do milestone, e a que o aceite pede: "o tabuleiro desenha sprite
    // para as unidades com o pipeline de animação de M16 intocado e com o HUD por cima". Se
    // uma única medida do HUD mudasse ao entrar a imagem, a camada de informação teria virado
    // função da camada de identidade — e o modo daltônico deixaria de ser garantido.
    const entrada = input({
      unit: unidade({ buffs: 3, debuffs: 2, hp: 150, maxHp: 1000 }),
      state: { selected: true, engageable: true },
    });
    const comSprite = spriteUnitRenderer.render(entrada);
    const semSprite = shapeUnitRenderer.render(entrada);

    // O HUD é tudo que vem depois do corpo. O corpo do glifo são polígonos de `placeShapes`;
    // o do sprite é uma primitiva só. Comparar a CAUDA a partir do primeiro anel isola isso.
    //
    // A unidade aqui NÃO agiu, e isso é deliberado: o véu de "já agiu" é a única peça que
    // acompanha o corpo em vez do HUD (disco sobre o glifo, retângulo sobre o sprite), porque
    // escurecer a peça é escurecer o que a peça é. Ele tem teste próprio logo abaixo; incluí-lo
    // aqui faria esta asserção medir duas coisas e não provar nenhuma.
    const cauda = (ps: readonly Primitive[]) => assinatura(ps.slice(ps.findIndex((p) => p.stroke !== undefined)));
    expect(cauda(comSprite)).toBe(cauda(semSprite));
  });

  it('o véu de "já agiu" cobre o sprite INTEIRO, e não só o disco', () => {
    // Um disco de raio `size/2 - inset` deixaria os cantos do sprite acesos, e "já agiu"
    // passaria a ser uma dica em vez de um estado.
    const entrada = comArte({ hasActedThisRound: true });
    const veu = spriteUnitRenderer
      .render(entrada)
      .find((p): p is Extract<Primitive, { t: 'rect' }> => p.t === 'rect' && p.fill === 0x000000)!;
    expect(veu.w).toBe(entrada.tile.size);
    expect(veu.h).toBe(entrada.tile.size);
  });

  it('sem arte declarada, o desenho é IDÊNTICO ao do M16 — o glifo não foi aposentado', () => {
    // É o que permite o elenco ganhar sprite aos poucos: 50 unidades entram uma por vez, e o
    // tabuleiro não pode ficar meio desenhado e meio vazio no meio do caminho.
    const entrada = input({ unit: { ...unidade(), artId: undefined } });
    expect(spriteUnitRenderer.render(entrada)).toEqual(shapeUnitRenderer.render(entrada));
  });

  it('arte declarada que não veio no bundle também cai no glifo, sem retângulo vazio', () => {
    const semNada = criarRendererDeSprite(() => undefined);
    const entrada = comArte();
    expect(semNada.render(entrada)).toEqual(shapeUnitRenderer.render(entrada));
  });

  it('o modo daltônico continua legível SOBRE o sprite: a marca de lado é do HUD', () => {
    // A promessa de D25 — "o modo daltônico de M13 4/N sobrevive intacto, porque nunca
    // dependeu da peça". Com a MESMA arte nos dois lados, os dois ainda se distinguem.
    const jogador = spriteUnitRenderer.render(input({ theme: COLORBLIND_THEME }));
    const inimigo = spriteUnitRenderer.render(input({ theme: COLORBLIND_THEME, unit: unidade({ side: 'enemy' }) }));

    expect(spritesDe(jogador)[0]!.src).toBe(spritesDe(inimigo)[0]!.src);
    expect(geometria(jogador)).not.toBe(geometria(inimigo));
  });

  it('o sprite é posicionado a partir do tile, o que é o que faz `motion.ts` continuar valendo', () => {
    // M16 3/N anima por TRANSFORMAÇÃO: o `MapCanvas` desenha a peça em coordenadas locais e
    // move o `Container`. Uma primitiva com posição absoluta embutida quebraria isso em
    // silêncio — a peça ficaria parada enquanto o resto anda. Nenhum número de `motion.ts`
    // muda porque o sprite obedece à mesma regra que o glifo sempre obedeceu.
    const naOrigem = spritesDe(spriteUnitRenderer.render(input({ tile: { px: 0, py: 0, size: TILE } })))[0]!;
    const deslocado = spritesDe(spriteUnitRenderer.render(input({ tile: { px: 5 * TILE, py: 7 * TILE, size: TILE } })))[0]!;

    expect(deslocado.x - naOrigem.x).toBe(5 * TILE);
    expect(deslocado.y - naOrigem.y).toBe(7 * TILE);
  });

  it('a saída continua sendo dado puro e serializável, imagem ou não', () => {
    // Critério 4 do M16, que o M26 herda: trocar o renderer não exige tocar em Pixi.
    const ps = spriteUnitRenderer.render(comArte());
    expect(JSON.parse(JSON.stringify(ps))).toEqual(ps);
  });
});

describe('M26 — a plaqueta de AP/PP devolve a cabeça da peça', () => {
  // O sprite tem cabeça e a cabeça fica no topo do tile, que é exatamente onde a plaqueta de
  // M16 morava sem teto. Medido na tela com o cliente rodando: a 48px ela atravessava a coluna
  // central e apagava o rosto.
  //
  // O que se afirma aqui NÃO é "ela ficou menor" — é que ela **nunca alcança o meio do tile**,
  // em tile nenhum e em escala nenhuma de §11. É a diferença entre a conta ter dado certo no
  // tamanho de hoje e a propriedade valer por construção.

  const TAMANHOS = [24, 36, 48, 64, 112];
  const ESCALAS = [10, 13, 15, 18];

  it('a plaqueta nunca cruza a coluna central do tile', () => {
    for (const size of TAMANHOS) {
      for (const labelSize of ESCALAS) {
        for (const unit of [unidade({ ap: 3, pp: 2 }), unidade({ ap: 12, pp: 10 })]) {
          const entrada = input({ unit, tile: { px: 0, py: 0, size }, labelSize });
          for (const renderer of RENDERERS) {
            const plaqueta = renderer
              .render(entrada)
              .find((p): p is Extract<Primitive, { t: 'rect' }> => p.t === 'rect' && p.alpha === DEFAULT_THEME.tokens.labelPlateAlpha)!;
            expect(plaqueta.x + plaqueta.w, `${renderer.id} tile=${size} fonte=${labelSize}`).toBeLessThanOrEqual(size / 2);
          }
        }
      }
    }
  });

  it('§11 continua valendo: o número não encolhe, só o fundo', () => {
    // O requisito é "AP/PP legíveis no próprio tile, sem hover", e ele vale em 175%. Encolher a
    // FONTE para caber na plaqueta menor seria trocar um problema de arte por um de
    // acessibilidade.
    for (const size of TAMANHOS) {
      const pequeno = shapeUnitRenderer.render(input({ tile: { px: 0, py: 0, size }, labelSize: 10 }));
      const grande = shapeUnitRenderer.render(input({ tile: { px: 0, py: 0, size }, labelSize: 18 }));
      const fonte = (ps: readonly Primitive[]) => ps.find((p): p is Extract<Primitive, { t: 'text' }> => p.t === 'text')!.size;
      expect(fonte(pequeno)).toBe(10);
      expect(fonte(grande)).toBe(18);
    }
  });

  it('e o texto continua sendo o AP/PP de verdade', () => {
    const ps = shapeUnitRenderer.render(input({ unit: unidade({ ap: 12, pp: 10 }) }));
    expect(ps.find((p) => p.t === 'text' && p.text === '12/10')).toBeDefined();
  });
});
